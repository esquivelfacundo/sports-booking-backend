/**
 * Script para:
 * 1. Vincular reservas existentes con clientes por teléfono/email
 * 2. Recalcular estadísticas de clientes
 * 3. Generar reservas históricas de Enero a Noviembre 2025
 */

const { sequelize } = require('../config/database');
const { Booking, Client, Court, Establishment, User } = require('../models');
const { Op } = require('sequelize');

// Configuración
const ESTABLISHMENT_EMAIL = 'juventus@miscanchas.com';
const YEAR = 2025;
const MONTHS_TO_GENERATE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // Enero a Noviembre

// Horarios disponibles (cada hora desde las 8 hasta las 22)
const AVAILABLE_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

// Estados posibles para reservas históricas (ponderados)
const BOOKING_STATUSES = [
  { status: 'completed', weight: 70 },  // 70% completadas
  { status: 'cancelled', weight: 15 },  // 15% canceladas
  { status: 'no_show', weight: 15 }     // 15% no asistió
];

function getRandomStatus() {
  const random = Math.random() * 100;
  let cumulative = 0;
  for (const item of BOOKING_STATUSES) {
    cumulative += item.weight;
    if (random <= cumulative) {
      return item.status;
    }
  }
  return 'completed';
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addHour(time, hours = 1) {
  const [h, m] = time.split(':').map(Number);
  const newHour = h + hours;
  return `${String(newHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('🔄 SCRIPT: Vincular Clientes y Generar Historial');
    console.log('='.repeat(60));

    // 1. Obtener el establecimiento
    const owner = await User.findOne({ where: { email: ESTABLISHMENT_EMAIL } });
    if (!owner) {
      console.error(`❌ No se encontró el usuario ${ESTABLISHMENT_EMAIL}`);
      process.exit(1);
    }

    const establishment = await Establishment.findOne({ where: { userId: owner.id } });
    if (!establishment) {
      console.error(`❌ No se encontró establecimiento para ${ESTABLISHMENT_EMAIL}`);
      process.exit(1);
    }

    console.log(`\n✅ Establecimiento: ${establishment.name} (${establishment.id})`);

    // 2. Obtener canchas del establecimiento
    const courts = await Court.findAll({ where: { establishmentId: establishment.id } });
    if (courts.length === 0) {
      console.error('❌ No se encontraron canchas');
      process.exit(1);
    }
    console.log(`✅ Canchas encontradas: ${courts.length}`);

    // 3. Obtener clientes del establecimiento
    const clients = await Client.findAll({ where: { establishmentId: establishment.id } });
    if (clients.length === 0) {
      console.error('❌ No se encontraron clientes');
      process.exit(1);
    }
    console.log(`✅ Clientes encontrados: ${clients.length}`);

    // 4. Vincular reservas existentes con clientes
    console.log('\n' + '='.repeat(60));
    console.log('📎 PASO 1: Vinculando reservas existentes con clientes...');
    console.log('='.repeat(60));

    let linkedCount = 0;
    const bookingsWithoutClient = await Booking.findAll({
      where: {
        establishmentId: establishment.id,
        clientId: null,
        [Op.or]: [
          { clientPhone: { [Op.ne]: null } },
          { clientEmail: { [Op.ne]: null } }
        ]
      }
    });

    console.log(`📋 Reservas sin cliente vinculado: ${bookingsWithoutClient.length}`);

    for (const booking of bookingsWithoutClient) {
      // Buscar cliente por teléfono o email
      let client = null;
      
      if (booking.clientPhone) {
        client = await Client.findOne({
          where: {
            establishmentId: establishment.id,
            phone: booking.clientPhone
          }
        });
      }
      
      if (!client && booking.clientEmail) {
        client = await Client.findOne({
          where: {
            establishmentId: establishment.id,
            email: booking.clientEmail
          }
        });
      }

      if (client) {
        await booking.update({ clientId: client.id });
        linkedCount++;
      }
    }

    console.log(`✅ Reservas vinculadas: ${linkedCount}`);

    // 5. Generar reservas históricas
    console.log('\n' + '='.repeat(60));
    console.log('📅 PASO 2: Generando reservas históricas (Enero - Noviembre 2025)...');
    console.log('='.repeat(60));

    // Obtener reservas existentes para evitar conflictos
    const existingBookings = await Booking.findAll({
      where: { establishmentId: establishment.id },
      attributes: ['courtId', 'date', 'startTime']
    });

    // Crear un Set de slots ocupados
    const occupiedSlots = new Set();
    for (const booking of existingBookings) {
      const key = `${booking.courtId}-${booking.date}-${booking.startTime}`;
      occupiedSlots.add(key);
    }

    console.log(`📋 Slots ya ocupados: ${occupiedSlots.size}`);

    let createdCount = 0;
    const bookingsToCreate = [];

    // Para cada mes
    for (const month of MONTHS_TO_GENERATE) {
      const daysInMonth = new Date(YEAR, month, 0).getDate();
      
      // Generar entre 30-60 reservas por mes
      const reservasDelMes = getRandomInt(30, 60);
      let reservasCreadas = 0;

      console.log(`\n📆 Mes ${month}/${YEAR}: Generando ~${reservasDelMes} reservas...`);

      // Intentar crear reservas hasta alcanzar el objetivo
      let intentos = 0;
      const maxIntentos = reservasDelMes * 3;

      while (reservasCreadas < reservasDelMes && intentos < maxIntentos) {
        intentos++;

        // Seleccionar día aleatorio
        const day = getRandomInt(1, daysInMonth);
        const date = formatDate(YEAR, month, day);

        // Seleccionar cancha aleatoria
        const court = courts[getRandomInt(0, courts.length - 1)];

        // Seleccionar hora aleatoria
        const startTime = AVAILABLE_HOURS[getRandomInt(0, AVAILABLE_HOURS.length - 2)];
        const endTime = addHour(startTime, 1);

        // Verificar si el slot está disponible
        const slotKey = `${court.id}-${date}-${startTime}:00`;
        if (occupiedSlots.has(slotKey)) {
          continue; // Slot ocupado, intentar otro
        }

        // Seleccionar cliente aleatorio
        const client = clients[getRandomInt(0, clients.length - 1)];

        // Determinar estado
        const status = getRandomStatus();

        // Calcular precio (entre 5000 y 15000)
        const totalAmount = getRandomInt(5, 15) * 1000;

        // Crear la reserva
        const bookingData = {
          establishmentId: establishment.id,
          courtId: court.id,
          clientId: client.id,
          clientName: client.name,
          clientPhone: client.phone,
          clientEmail: client.email,
          date,
          startTime: `${startTime}:00`,
          endTime: `${endTime}:00`,
          duration: 60,
          totalAmount,
          status,
          paymentStatus: status === 'completed' ? 'completed' : (status === 'cancelled' ? 'refunded' : 'pending'),
          bookingType: 'normal',
          createdAt: new Date(`${date}T10:00:00Z`),
          updatedAt: new Date(`${date}T10:00:00Z`)
        };

        if (status === 'completed') {
          bookingData.completedAt = new Date(`${date}T${endTime}:00Z`);
        } else if (status === 'cancelled') {
          bookingData.cancelledAt = new Date(`${date}T08:00:00Z`);
          bookingData.cancellationReason = 'Cancelado por el cliente';
        }

        bookingsToCreate.push(bookingData);
        occupiedSlots.add(slotKey);
        reservasCreadas++;
      }

      console.log(`   ✅ Reservas generadas para mes ${month}: ${reservasCreadas}`);
      createdCount += reservasCreadas;
    }

    // Insertar todas las reservas en batch
    console.log(`\n💾 Insertando ${bookingsToCreate.length} reservas en la base de datos...`);
    
    if (bookingsToCreate.length > 0) {
      await Booking.bulkCreate(bookingsToCreate);
      console.log(`✅ ${bookingsToCreate.length} reservas insertadas`);
    }

    // 6. Recalcular estadísticas de clientes
    console.log('\n' + '='.repeat(60));
    console.log('📊 PASO 3: Recalculando estadísticas de clientes...');
    console.log('='.repeat(60));

    for (const client of clients) {
      // Contar reservas por estado
      const stats = await Booking.findAll({
        where: { clientId: client.id },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('totalAmount')), 'total']
        ],
        group: ['status'],
        raw: true
      });

      let totalBookings = 0;
      let completedBookings = 0;
      let pendingBookings = 0;
      let cancelledBookings = 0;
      let noShowBookings = 0;
      let totalSpent = 0;

      for (const stat of stats) {
        const count = parseInt(stat.count) || 0;
        const amount = parseFloat(stat.total) || 0;
        totalBookings += count;

        switch (stat.status) {
          case 'completed':
            completedBookings = count;
            totalSpent += amount;
            break;
          case 'confirmed':
          case 'pending':
            pendingBookings += count;
            break;
          case 'cancelled':
            cancelledBookings = count;
            break;
          case 'no_show':
            noShowBookings = count;
            break;
        }
      }

      // Obtener última reserva completada
      const lastCompleted = await Booking.findOne({
        where: {
          clientId: client.id,
          status: 'completed'
        },
        order: [['date', 'DESC']],
        attributes: ['date']
      });

      // Obtener última reserva (cualquier estado)
      const lastBooking = await Booking.findOne({
        where: { clientId: client.id },
        order: [['date', 'DESC']],
        attributes: ['date']
      });

      // Actualizar cliente
      await client.update({
        totalBookings,
        completedBookings,
        pendingBookings,
        cancelledBookings,
        noShowBookings,
        totalSpent,
        lastCompletedBookingDate: lastCompleted?.date || null,
        lastBookingDate: lastBooking?.date || null
      });

      console.log(`   📊 ${client.name}: ${totalBookings} reservas (${completedBookings} completadas, ${cancelledBookings} canceladas, ${noShowBookings} no asistió)`);
    }

    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('✅ RESUMEN FINAL');
    console.log('='.repeat(60));
    console.log(`📎 Reservas vinculadas a clientes: ${linkedCount}`);
    console.log(`📅 Reservas históricas creadas: ${createdCount}`);
    console.log(`📊 Clientes actualizados: ${clients.length}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

main()
  .then(() => {
    console.log('\n✅ Script completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script falló:', error.message);
    process.exit(1);
  });
