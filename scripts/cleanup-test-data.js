/**
 * Cleanup script for test data
 * Deletes: bookings, orders, invoices, payments, cash registers
 * Preserves: config, courts, stock, products, establishments, users
 */

require('dotenv').config();
const { sequelize } = require('../src/config/database');

async function cleanup() {
  console.log('🧹 Starting test data cleanup...\n');
  
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // Use raw queries with CASCADE to handle foreign keys
    const queries = [
      // 1. Invoices
      { name: 'invoices', sql: 'DELETE FROM invoices' },
      
      // 2. Booking-related (order matters for FK)
      { name: 'booking_consumptions', sql: 'DELETE FROM booking_consumptions' },
      { name: 'booking_payments', sql: 'DELETE FROM booking_payments' },
      { name: 'reviews', sql: 'DELETE FROM reviews' },
      { name: 'split_payment_participants', sql: 'DELETE FROM split_payment_participants' },
      { name: 'split_payments', sql: 'DELETE FROM split_payments' },
      { name: 'bookings', sql: 'DELETE FROM bookings' },
      { name: 'recurring_booking_groups', sql: 'DELETE FROM recurring_booking_groups' },
      
      // 3. Order/sales-related
      { name: 'order_payments', sql: 'DELETE FROM order_payments' },
      { name: 'order_items', sql: 'DELETE FROM order_items' },
      { name: 'orders', sql: 'DELETE FROM orders' },
      
      // 4. Cash register data
      { name: 'cash_register_movements', sql: 'DELETE FROM cash_register_movements' },
      { name: 'cash_registers', sql: 'DELETE FROM cash_registers' },
      
      // 5. Client debts
      { name: 'client_debts', sql: 'DELETE FROM client_debts' },
      
      // 6. Payments
      { name: 'payments', sql: 'DELETE FROM payments' },
      
      // 7. Coupon usages (but keep coupons)
      { name: 'coupon_usages', sql: 'DELETE FROM coupon_usages' },
    ];

    for (const query of queries) {
      try {
        const [, metadata] = await sequelize.query(query.sql);
        const count = metadata?.rowCount || 0;
        console.log(`  ✓ ${query.name}: ${count} rows deleted`);
      } catch (err) {
        if (err.message.includes('does not exist')) {
          console.log(`  ⚠ ${query.name}: table does not exist (skipped)`);
        } else {
          console.log(`  ✗ ${query.name}: ${err.message}`);
        }
      }
    }

    console.log('\n✅ Cleanup complete!');
    console.log('\n📊 Preserved data:');
    console.log('  - Establishments, Users, Clients');
    console.log('  - Courts, Amenities');
    console.log('  - Products, Categories, Stock, Stock Movements');
    console.log('  - Payment Methods, Expense Categories');
    console.log('  - AFIP Config, Integrations');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

cleanup();
