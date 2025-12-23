/**
 * Script para agregar el campo pin a la tabla establishments
 * Ejecutar con: node src/scripts/addPinToEstablishments.js
 */

require('dotenv').config();
const { sequelize } = require('../models');

async function addPinColumn() {
  try {
    console.log('Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('Conexión exitosa\n');

    // Check if column exists
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'establishments' AND column_name = 'pin'
    `);

    if (results.length > 0) {
      console.log('✓ La columna pin ya existe en la tabla establishments');
    } else {
      console.log('Agregando columna pin a la tabla establishments...');
      await sequelize.query(`
        ALTER TABLE establishments 
        ADD COLUMN pin VARCHAR(4) NULL
      `);
      console.log('✅ Columna pin agregada exitosamente');
    }

    // Set PIN for Juventus
    console.log('\nConfigurando PIN para Juventus...');
    await sequelize.query(`
      UPDATE establishments 
      SET pin = '1234' 
      WHERE id = 'ddf01f3d-74cf-44e4-aced-e97eb72182d6'
    `);
    console.log('✅ PIN configurado: 1234');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

addPinColumn();
