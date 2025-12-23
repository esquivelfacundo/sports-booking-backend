/**
 * Script para resetear los PINs de todos los empleados de Juventus
 * Ejecutar con: node src/scripts/resetPinsJuventus.js
 */

require('dotenv').config();
const { sequelize, EstablishmentStaff } = require('../models');

const JUVENTUS_ESTABLISHMENT_ID = 'ddf01f3d-74cf-44e4-aced-e97eb72182d6';

async function resetPins() {
  try {
    console.log('Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('Conexión exitosa');

    // Buscar todos los empleados de Juventus
    const staff = await EstablishmentStaff.findAll({
      where: { establishmentId: JUVENTUS_ESTABLISHMENT_ID }
    });

    console.log(`Encontrados ${staff.length} empleados en Juventus`);

    // Resetear PINs
    const result = await EstablishmentStaff.update(
      { pin: null },
      { where: { establishmentId: JUVENTUS_ESTABLISHMENT_ID } }
    );

    console.log(`PINs reseteados: ${result[0]} empleados actualizados`);

    // Listar empleados actualizados
    for (const s of staff) {
      console.log(`  - ${s.name} (${s.email})`);
    }

    console.log('\n✅ Todos los PINs han sido eliminados');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

resetPins();
