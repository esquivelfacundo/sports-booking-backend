/**
 * Script para configurar el PIN del establecimiento Juventus
 * Ejecutar con: node src/scripts/setPinJuventus.js
 */

require('dotenv').config();
const { sequelize, Establishment } = require('../models');

const JUVENTUS_ID = 'ddf01f3d-74cf-44e4-aced-e97eb72182d6';
const NEW_PIN = '1234';

async function setPin() {
  try {
    console.log('Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('Conexión exitosa\n');

    const establishment = await Establishment.findByPk(JUVENTUS_ID);

    if (!establishment) {
      console.log('❌ Establecimiento no encontrado');
      return;
    }

    console.log(`✓ Establecimiento encontrado: ${establishment.name}`);
    console.log(`  PIN actual: ${establishment.pin || 'null'}`);

    await establishment.update({ pin: NEW_PIN });

    console.log(`\n✅ PIN configurado exitosamente: ${NEW_PIN}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

setPin();
