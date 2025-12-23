/**
 * Script para verificar el PIN del establecimiento Juventus
 * Ejecutar con: node src/scripts/checkPinJuventus.js
 */

require('dotenv').config();
const { sequelize, User, Establishment } = require('../models');

const JUVENTUS_EMAIL = 'juventus@miscanchas.com';

async function checkPin() {
  try {
    console.log('Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('Conexión exitosa\n');

    // Buscar el usuario owner
    const user = await User.findOne({
      where: { email: JUVENTUS_EMAIL }
    });

    if (!user) {
      console.log(`❌ Usuario ${JUVENTUS_EMAIL} no encontrado`);
      return;
    }

    console.log(`✓ Usuario encontrado: ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`  User PIN: ${user.pin || 'null'}`);

    // Buscar el establecimiento asociado
    const establishment = await Establishment.findOne({
      where: { userId: user.id }
    });

    if (!establishment) {
      console.log('❌ No se encontró establecimiento asociado');
      return;
    }

    console.log(`\n✓ Establecimiento encontrado: ${establishment.name}`);
    console.log(`  Establishment PIN: ${establishment.pin || 'null'}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

checkPin();
