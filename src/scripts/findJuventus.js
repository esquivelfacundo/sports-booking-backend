/**
 * Script para buscar el establecimiento Juventus
 * Ejecutar con: node src/scripts/findJuventus.js
 */

require('dotenv').config();
const { sequelize, User, Establishment } = require('../models');

async function findJuventus() {
  try {
    console.log('Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('Conexión exitosa\n');

    // Buscar el establecimiento Juventus
    const establishment = await Establishment.findOne({
      where: { name: { [require('sequelize').Op.iLike]: '%juventus%' } }
    });

    if (!establishment) {
      console.log('❌ Establecimiento Juventus no encontrado');
      
      // Listar todos los establecimientos
      const allEstablishments = await Establishment.findAll({
        attributes: ['id', 'name', 'userId', 'pin']
      });
      console.log('\nEstablecimientos en la BD:');
      allEstablishments.forEach(e => {
        console.log(`  - ${e.name} (userId: ${e.userId}, PIN: ${e.pin || 'null'})`);
      });
      return;
    }

    console.log(`✓ Establecimiento encontrado: ${establishment.name}`);
    console.log(`  ID: ${establishment.id}`);
    console.log(`  userId: ${establishment.userId}`);
    console.log(`  PIN: ${establishment.pin || 'null'}`);

    // Buscar el usuario owner
    if (establishment.userId) {
      const user = await User.findByPk(establishment.userId);
      if (user) {
        console.log(`\n✓ Owner encontrado: ${user.firstName} ${user.lastName}`);
        console.log(`  Email: ${user.email}`);
        console.log(`  User PIN: ${user.pin || 'null'}`);
      } else {
        console.log(`\n❌ Owner con ID ${establishment.userId} no encontrado`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

findJuventus();
