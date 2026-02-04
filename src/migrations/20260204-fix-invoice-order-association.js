'use strict';

/**
 * Migration to fix invoices that have bookingId but missing orderId
 * Associates the orderId from the Order that has the matching bookingId
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Find all invoices with bookingId but no orderId
    const [invoices] = await queryInterface.sequelize.query(`
      SELECT i.id as invoice_id, i.booking_id, o.id as order_id
      FROM invoices i
      INNER JOIN orders o ON o."bookingId" = i.booking_id
      WHERE i.order_id IS NULL 
        AND i.booking_id IS NOT NULL
        AND o.id IS NOT NULL
    `);

    console.log(`Found ${invoices.length} invoices to fix`);

    for (const row of invoices) {
      // Update invoice with orderId
      await queryInterface.sequelize.query(`
        UPDATE invoices 
        SET order_id = :orderId 
        WHERE id = :invoiceId
      `, {
        replacements: { orderId: row.order_id, invoiceId: row.invoice_id }
      });

      // Update order with invoiceId
      await queryInterface.sequelize.query(`
        UPDATE orders 
        SET invoice_id = :invoiceId 
        WHERE id = :orderId
      `, {
        replacements: { invoiceId: row.invoice_id, orderId: row.order_id }
      });

      console.log(`Fixed invoice ${row.invoice_id} -> order ${row.order_id}`);
    }

    console.log('Migration completed');
  },

  async down(queryInterface, Sequelize) {
    // This migration fixes data, no rollback needed
    console.log('No rollback for this migration');
  }
};
