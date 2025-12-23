/**
 * Script para resetear el PIN del owner de Juventus (juventus@miscanchas.com)
 * Ejecutar con: node src/scripts/resetPinJuventusOwner.js
 */

require('dotenv').config();
const { sequelize, User, Establishment } = require('../models');

const JUVENTUS_EMAIL = 'juventus@miscanchas.com';

async function resetOwnerPin() {
  try {
    console.log('Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('Conexión exitosa');

    // Buscar el usuario owner
    const user = await User.findOne({
      where: { email: JUVENTUS_EMAIL }
    });

    if (!user) {
      console.log(`❌ Usuario ${JUVENTUS_EMAIL} no encontrado`);
      return;
    }

    console.log(`✓ Usuario encontrado: ${user.firstName} ${user.lastName} (${user.email})`);

    // Buscar el establecimiento asociado
    const establishment = await Establishment.findOne({
      where: { userId: user.id }
    });

    if (!establishment) {
      console.log('❌ No se encontró establecimiento asociado');
      return;
    }

    console.log(`✓ Establecimiento encontrado: ${establishment.name}`);

    // Resetear PIN
    await establishment.update({ pin: null });

    console.log('\n✅ PIN del owner eliminado exitosamente');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

resetOwnerPin();
