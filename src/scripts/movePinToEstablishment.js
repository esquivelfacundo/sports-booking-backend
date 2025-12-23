/**
 * Script para mover el PIN de User a Establishment para juventus@miscanchas.com
 * Ejecutar con: node src/scripts/movePinToEstablishment.js
 */

require('dotenv').config();
const { sequelize, User, Establishment } = require('../models');

const JUVENTUS_EMAIL = 'juventuspadelfutbol@gmail.com';

async function movePin() {
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

    console.log(`✓ Usuario encontrado: ${user.firstName} ${user.lastName}`);
    console.log(`  User PIN actual: ${user.pin || 'null'}`);

    // Buscar el establecimiento asociado
    const establishment = await Establishment.findOne({
      where: { userId: user.id }
    });

    if (!establishment) {
      console.log('❌ No se encontró establecimiento asociado');
      return;
    }

    console.log(`\n✓ Establecimiento encontrado: ${establishment.name}`);
    console.log(`  Establishment PIN actual: ${establishment.pin || 'null'}`);

    // Mover el PIN de User a Establishment
    if (user.pin) {
      const pinToMove = user.pin;
      await establishment.update({ pin: pinToMove });
      await user.update({ pin: null });
      
      console.log(`\n✅ PIN movido exitosamente de User a Establishment`);
      console.log(`  Nuevo PIN del establecimiento: ${pinToMove}`);
    } else {
      console.log('\n⚠️  El usuario no tiene PIN configurado en la tabla User');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

movePin();
