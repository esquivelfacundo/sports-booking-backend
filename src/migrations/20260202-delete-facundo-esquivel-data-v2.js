'use strict';
module.exports = {
  up: async (queryInterface) => {
    const [est] = await queryInterface.sequelize.query(`SELECT id FROM establishments WHERE name ILIKE '%Juventus%' LIMIT 1`);
    if (!est.length) { console.log('Establishment not found'); return; }
    const estId = est[0].id;

    const [clients] = await queryInterface.sequelize.query(`SELECT id FROM clients WHERE "establishmentId" = '${estId}' AND name ILIKE '%Facundo%Esquivel%' LIMIT 1`);
    if (!clients.length) { console.log('Client not found'); return; }
    const clientId = clients[0].id;
    console.log('Deleting data for client:', clientId);

    // Delete in order respecting FK constraints
    await queryInterface.sequelize.query(`DELETE FROM booking_consumptions WHERE "bookingId" IN (SELECT id FROM bookings WHERE "clientId" = '${clientId}')`);
    await queryInterface.sequelize.query(`DELETE FROM booking_payments WHERE "bookingId" IN (SELECT id FROM bookings WHERE "clientId" = '${clientId}')`);
    await queryInterface.sequelize.query(`DELETE FROM order_items WHERE "orderId" IN (SELECT id FROM orders WHERE "clientId" = '${clientId}')`);
    await queryInterface.sequelize.query(`DELETE FROM orders WHERE "clientId" = '${clientId}'`);
    // First delete bookings that belong to recurring groups
    await queryInterface.sequelize.query(`DELETE FROM bookings WHERE "clientId" = '${clientId}'`);
    // Then delete the recurring groups
    await queryInterface.sequelize.query(`DELETE FROM recurring_booking_groups WHERE "clientId" = '${clientId}'`);
    console.log('✅ Deleted all data for Facundo Esquivel in Juventus');
  },
  down: async () => {}
};
