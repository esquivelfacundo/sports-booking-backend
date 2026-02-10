'use strict';

/**
 * Migration: Fix cash registers with missing movements from OrderPayments AND BookingPayments
 * 
 * Problem: Some payments were recorded (OrderPayment/BookingPayment) but never registered
 * as CashRegisterMovement, causing cash register totals to be incorrect.
 * 
 * Strategy:
 * 1. Find BookingPayments (declared, with registeredBy) missing from cash_register_movements
 * 2. Find OrderPayments missing from cash_register_movements
 * 3. For each, find the cash register that was open at that time
 * 4. Create the missing CashRegisterMovement
 * 5. Recalculate all cash register totals from their movements
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('=== Starting cash register missing movements fix ===');
      
      let createdMovements = 0;
      let skippedNoRegister = 0;

      // ---- STEP 1: Fix missing BookingPayments ----
      // Use count-based matching: for each (bookingId, method) pair, compare
      // how many declared BookingPayments exist vs how many CashRegisterMovements exist
      const [mismatchedBookings] = await queryInterface.sequelize.query(`
        WITH bp_counts AS (
          SELECT bp."bookingId", bp.method, COUNT(*) as bp_count, 
                 array_agg(bp.amount ORDER BY bp."paidAt") as bp_amounts,
                 array_agg(bp."paidAt" ORDER BY bp."paidAt") as bp_dates,
                 array_agg(bp."registeredBy" ORDER BY bp."paidAt") as bp_users
          FROM booking_payments bp
          WHERE bp."paymentType" = 'declared' AND bp."registeredBy" IS NOT NULL
          GROUP BY bp."bookingId", bp.method
        ),
        crm_counts AS (
          SELECT crm."bookingId", crm."paymentMethod" as method, COUNT(*) as crm_count,
                 array_agg(crm.amount ORDER BY crm."registeredAt") as crm_amounts
          FROM cash_register_movements crm
          WHERE crm."bookingId" IS NOT NULL AND crm.type = 'sale'
          GROUP BY crm."bookingId", crm."paymentMethod"
        )
        SELECT 
          bp."bookingId", bp.method,
          bp.bp_count, COALESCE(crm.crm_count, 0) as crm_count,
          bp.bp_amounts, bp.bp_dates, bp.bp_users,
          COALESCE(crm.crm_amounts, ARRAY[]::numeric[]) as crm_amounts,
          b."establishmentId"
        FROM bp_counts bp
        LEFT JOIN crm_counts crm ON crm."bookingId" = bp."bookingId" AND crm.method = bp.method
        JOIN bookings b ON b.id = bp."bookingId"
        WHERE bp.bp_count > COALESCE(crm.crm_count, 0)
      `, { transaction });
      
      console.log(`Found ${mismatchedBookings.length} booking/method pairs with missing movements`);
      
      for (const row of mismatchedBookings) {
        // Figure out which specific payments are missing by comparing arrays
        // The CRM amounts are the ones already registered; skip those from BP amounts
        const bpAmounts = row.bp_amounts;
        const bpDates = row.bp_dates;
        const bpUsers = row.bp_users;
        const crmAmounts = [...row.crm_amounts]; // copy to mutate
        
        for (let i = 0; i < bpAmounts.length; i++) {
          const amt = parseFloat(bpAmounts[i]);
          // Check if this amount is already matched by a CRM
          const matchIdx = crmAmounts.findIndex(c => parseFloat(c) === amt);
          if (matchIdx >= 0) {
            // Already has a movement, remove from available matches
            crmAmounts.splice(matchIdx, 1);
            continue;
          }
          
          // This payment is missing - find the cash register and create the movement
          const paymentDate = bpDates[i];
          const registeredBy = bpUsers[i];
          
          const [registers] = await queryInterface.sequelize.query(`
            SELECT id FROM cash_registers
            WHERE "establishmentId" = :establishmentId
              AND "openedAt" <= :paymentDate
              AND ("closedAt" IS NULL OR "closedAt" >= :paymentDate)
            ORDER BY "openedAt" DESC
            LIMIT 1
          `, {
            replacements: { establishmentId: row.establishmentId, paymentDate },
            transaction
          });
          
          if (registers.length === 0) {
            skippedNoRegister++;
            console.log(`  Skipped: no open register for booking ${row.bookingId}, $${amt} ${row.method} at ${paymentDate}`);
            continue;
          }
          
          await queryInterface.sequelize.query(`
            INSERT INTO cash_register_movements (
              id, "cashRegisterId", "establishmentId", type, "bookingId",
              amount, "paymentMethod", description, "registeredBy", "registeredAt",
              "createdAt", "updatedAt"
            ) VALUES (
              gen_random_uuid(), :cashRegisterId, :establishmentId, 'sale', :bookingId,
              :amount, :paymentMethod, :description, :registeredBy, :registeredAt,
              :createdAt, :createdAt
            )
          `, {
            replacements: {
              cashRegisterId: registers[0].id,
              establishmentId: row.establishmentId,
              bookingId: row.bookingId,
              amount: amt,
              paymentMethod: row.method,
              description: `Pago de reserva recuperado`,
              registeredBy,
              registeredAt: paymentDate,
              createdAt: paymentDate
            },
            transaction
          });
          
          createdMovements++;
          console.log(`  Created: booking ${row.bookingId}, $${amt} ${row.method} -> register ${registers[0].id}`);
        }
      }
      
      // ---- STEP 2: Fix missing OrderPayments ----
      const [missingOrderPayments] = await queryInterface.sequelize.query(`
        SELECT 
          op.id as "paymentId", op."orderId", op.amount, op."paymentMethod",
          op."registeredBy", op."createdAt",
          o."establishmentId", o."orderNumber", o."bookingId"
        FROM order_payments op
        JOIN orders o ON o.id = op."orderId"
        WHERE NOT EXISTS (
          SELECT 1 FROM cash_register_movements crm
          WHERE crm."orderId" = op."orderId"
            AND crm.amount = op.amount
            AND crm."paymentMethod" = op."paymentMethod"
            AND crm.type = 'sale'
        )
        ORDER BY op."createdAt" ASC
      `, { transaction });
      
      console.log(`Found ${missingOrderPayments.length} OrderPayments without CashRegisterMovement`);
      
      for (const payment of missingOrderPayments) {
        const [registers] = await queryInterface.sequelize.query(`
          SELECT id FROM cash_registers
          WHERE "establishmentId" = :establishmentId
            AND "openedAt" <= :paymentDate
            AND ("closedAt" IS NULL OR "closedAt" >= :paymentDate)
          ORDER BY "openedAt" DESC
          LIMIT 1
        `, {
          replacements: { establishmentId: payment.establishmentId, paymentDate: payment.createdAt },
          transaction
        });
        
        if (registers.length === 0) {
          skippedNoRegister++;
          continue;
        }
        
        await queryInterface.sequelize.query(`
          INSERT INTO cash_register_movements (
            id, "cashRegisterId", "establishmentId", type, "orderId", "bookingId",
            amount, "paymentMethod", description, "registeredBy", "registeredAt",
            "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), :cashRegisterId, :establishmentId, 'sale', :orderId, :bookingId,
            :amount, :paymentMethod, :description, :registeredBy, :registeredAt,
            :createdAt, :createdAt
          )
        `, {
          replacements: {
            cashRegisterId: registers[0].id,
            establishmentId: payment.establishmentId,
            orderId: payment.orderId,
            bookingId: payment.bookingId || null,
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            description: `Pago recuperado - Pedido #${payment.orderNumber}`,
            registeredBy: payment.registeredBy,
            registeredAt: payment.createdAt,
            createdAt: payment.createdAt
          },
          transaction
        });
        
        createdMovements++;
      }
      
      console.log(`\nTotal: Created ${createdMovements} missing movements (skipped ${skippedNoRegister} with no open register)`);
      
      // Step 3: Recalculate ALL cash register totals from their movements
      // This is the safest approach - recalculate everything from scratch
      const [allRegisters] = await queryInterface.sequelize.query(`
        SELECT id, "initialCash" FROM cash_registers
      `, { transaction });
      
      console.log(`Recalculating totals for ${allRegisters.length} cash registers...`);
      
      const paymentMethodMap = {
        'cash': 'totalCash',
        'efectivo': 'totalCash',
        'card': 'totalCard',
        'tarjeta': 'totalCard',
        'transfer': 'totalTransfer',
        'transferencia': 'totalTransfer',
        'credit_card': 'totalCreditCard',
        'credito': 'totalCreditCard',
        'debit_card': 'totalDebitCard',
        'debito': 'totalDebitCard',
        'mercadopago': 'totalMercadoPago',
        'mercado_pago': 'totalMercadoPago'
      };
      
      let recalculated = 0;
      
      for (const register of allRegisters) {
        // Get all movements for this register
        const [movements] = await queryInterface.sequelize.query(`
          SELECT type, amount, "paymentMethod", "orderId"
          FROM cash_register_movements
          WHERE "cashRegisterId" = :cashRegisterId
          ORDER BY "registeredAt" ASC
        `, {
          replacements: { cashRegisterId: register.id },
          transaction
        });
        
        // Calculate totals from scratch
        let totalSales = 0;
        let totalExpenses = 0;
        let totalCash = 0;
        let totalCard = 0;
        let totalTransfer = 0;
        let totalCreditCard = 0;
        let totalDebitCard = 0;
        let totalMercadoPago = 0;
        let totalOther = 0;
        let totalOrders = 0;
        let expectedCash = parseFloat(register.initialCash) || 0;
        const countedOrderIds = new Set();
        
        for (const mov of movements) {
          const amount = parseFloat(mov.amount) || 0;
          const method = (mov.paymentMethod || '').toLowerCase();
          const field = paymentMethodMap[method] || 'totalOther';
          const isCash = method === 'cash' || method === 'efectivo';
          
          if (mov.type === 'sale') {
            totalSales += amount;
            
            // Update payment method totals
            switch (field) {
              case 'totalCash': totalCash += amount; break;
              case 'totalCard': totalCard += amount; break;
              case 'totalTransfer': totalTransfer += amount; break;
              case 'totalCreditCard': totalCreditCard += amount; break;
              case 'totalDebitCard': totalDebitCard += amount; break;
              case 'totalMercadoPago': totalMercadoPago += amount; break;
              default: totalOther += amount; break;
            }
            
            if (isCash) {
              expectedCash += amount;
            }
            
            // Count unique orders
            if (mov.orderId && !countedOrderIds.has(mov.orderId)) {
              countedOrderIds.add(mov.orderId);
              totalOrders++;
            }
          } else if (mov.type === 'expense') {
            const absAmount = Math.abs(amount);
            totalExpenses += absAmount;
            
            // Expenses subtract from payment method totals
            switch (field) {
              case 'totalCash': totalCash = Math.max(0, totalCash - absAmount); break;
              case 'totalCard': totalCard = Math.max(0, totalCard - absAmount); break;
              case 'totalTransfer': totalTransfer = Math.max(0, totalTransfer - absAmount); break;
              case 'totalCreditCard': totalCreditCard = Math.max(0, totalCreditCard - absAmount); break;
              case 'totalDebitCard': totalDebitCard = Math.max(0, totalDebitCard - absAmount); break;
              case 'totalMercadoPago': totalMercadoPago = Math.max(0, totalMercadoPago - absAmount); break;
              default: totalOther = Math.max(0, totalOther - absAmount); break;
            }
            
            if (isCash) {
              expectedCash = Math.max(0, expectedCash - absAmount);
            }
          } else if (mov.type === 'cash_withdrawal') {
            const absAmount = Math.abs(amount);
            if (isCash) {
              expectedCash = Math.max(0, expectedCash - absAmount);
            }
          }
          // initial_cash movements don't affect totals (already in initialCash)
        }
        
        const totalMovements = movements.length;
        
        // Update the cash register with recalculated totals
        await queryInterface.sequelize.query(`
          UPDATE cash_registers SET
            "totalSales" = :totalSales,
            "totalExpenses" = :totalExpenses,
            "totalCash" = :totalCash,
            "totalCard" = :totalCard,
            "totalTransfer" = :totalTransfer,
            "totalCreditCard" = :totalCreditCard,
            "totalDebitCard" = :totalDebitCard,
            "totalMercadoPago" = :totalMercadoPago,
            "totalOther" = :totalOther,
            "totalOrders" = :totalOrders,
            "totalMovements" = :totalMovements,
            "expectedCash" = :expectedCash
          WHERE id = :id
        `, {
          replacements: {
            id: register.id,
            totalSales,
            totalExpenses,
            totalCash,
            totalCard,
            totalTransfer,
            totalCreditCard,
            totalDebitCard,
            totalMercadoPago,
            totalOther,
            totalOrders,
            totalMovements,
            expectedCash
          },
          transaction
        });
        
        recalculated++;
      }
      
      console.log(`Recalculated totals for ${recalculated} cash registers`);
      
      await transaction.commit();
      console.log('=== Cash register fix migration completed successfully ===');
      
    } catch (error) {
      await transaction.rollback();
      console.error('Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    // This migration creates movements and recalculates totals
    // Rolling back would require knowing the original state, which we don't have
    console.log('This migration cannot be automatically rolled back');
  }
};
