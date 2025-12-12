const { sequelize } = require('../models');
const { 
  User, 
  Establishment, 
  Court, 
  Booking, 
  Review, 
  Favorite, 
  Notification,
  AvailableMatch,
  MatchParticipant,
  Tournament,
  TournamentParticipant
} = require('../models');
const bcrypt = require('bcryptjs');

async function seedTestData() {
  try {
    console.log('🔄 Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('✅ Conexión establecida');

    // Verificar si ya hay datos de prueba
    const existingUser = await User.findOne({ where: { email: 'prueba_admin@miscanchas.com' } });
    if (existingUser) {
      console.log('⚠️  Ya existen datos de PRUEBA en la base de datos');
      console.log('   Si quieres recrearlos, primero ejecuta: npm run db:sync -- --force');
      console.log('\n🔐 Credenciales existentes:');
      console.log('   Admin:         prueba_admin@miscanchas.com / prueba123');
      console.log('   Jugador 1:     prueba_juan@test.com / prueba123');
      console.log('   Jugador 2:     prueba_maria@test.com / prueba123');
      console.log('   Establecimiento: prueba_establecimiento@test.com / prueba123');
      return;
    }

    console.log('📝 Creando datos de PRUEBA...');
    console.log('   (Todos los datos tienen prefijo "PRUEBA_" para identificarlos)\n');

    const hashedPassword = await bcrypt.hash('prueba123', 12);

    // ==========================================
    // 1. USUARIOS DE PRUEBA
    // ==========================================
    console.log('👤 Creando usuarios...');
    
    const adminUser = await User.create({
      firstName: 'PRUEBA_Admin',
      lastName: 'Sistema',
      email: 'prueba_admin@miscanchas.com',
      password: hashedPassword,
      phone: '+54 11 0000-0001',
      city: 'Buenos Aires',
      userType: 'admin',
      isEmailVerified: true,
      isActive: true,
      bio: 'Usuario administrador de prueba',
      favoritesSports: ['futbol5', 'paddle'],
      skillLevel: 'advanced'
    });

    const playerUser1 = await User.create({
      firstName: 'PRUEBA_Juan',
      lastName: 'Jugador',
      email: 'prueba_juan@test.com',
      password: hashedPassword,
      phone: '+54 11 0000-0002',
      city: 'Buenos Aires',
      userType: 'player',
      isEmailVerified: true,
      isActive: true,
      bio: 'Jugador de prueba - Nivel intermedio',
      favoritesSports: ['futbol5', 'tenis'],
      skillLevel: 'intermediate',
      location: { lat: -34.6037, lng: -58.3816, address: 'Palermo, Buenos Aires' }
    });

    const playerUser2 = await User.create({
      firstName: 'PRUEBA_Maria',
      lastName: 'Deportista',
      email: 'prueba_maria@test.com',
      password: hashedPassword,
      phone: '+54 11 0000-0003',
      city: 'Buenos Aires',
      userType: 'player',
      isEmailVerified: true,
      isActive: true,
      bio: 'Jugadora de prueba - Nivel avanzado',
      favoritesSports: ['paddle', 'tenis'],
      skillLevel: 'advanced',
      location: { lat: -34.5875, lng: -58.3974, address: 'Belgrano, Buenos Aires' }
    });

    const establishmentUser = await User.create({
      firstName: 'PRUEBA_Dueño',
      lastName: 'Establecimiento',
      email: 'prueba_establecimiento@test.com',
      password: hashedPassword,
      phone: '+54 11 0000-0004',
      city: 'Buenos Aires',
      userType: 'establishment',
      isEmailVerified: true,
      isActive: true,
      bio: 'Dueño de establecimiento de prueba'
    });

    console.log('   ✅ 4 usuarios creados');

    // ==========================================
    // 2. ESTABLECIMIENTOS DE PRUEBA
    // ==========================================
    console.log('🏟️  Creando establecimientos...');

    const establishment1 = await Establishment.create({
      userId: establishmentUser.id,
      name: 'PRUEBA_Club Deportivo Central',
      description: 'Establecimiento de PRUEBA - Club con canchas de fútbol 5 y paddle',
      address: 'PRUEBA Av. Libertador 1234',
      city: 'Buenos Aires',
      latitude: -34.6037,
      longitude: -58.3816,
      phone: '+54 11 0000-1001',
      email: 'prueba_club1@test.com',
      website: 'https://prueba-club1.com',
      images: [
        'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800',
        'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800'
      ],
      sports: ['futbol5', 'paddle'],
      amenities: ['Estacionamiento', 'Vestuarios', 'Buffet', 'WiFi'],
      openingHours: {
        monday: { open: '08:00', close: '23:00', closed: false },
        tuesday: { open: '08:00', close: '23:00', closed: false },
        wednesday: { open: '08:00', close: '23:00', closed: false },
        thursday: { open: '08:00', close: '23:00', closed: false },
        friday: { open: '08:00', close: '24:00', closed: false },
        saturday: { open: '09:00', close: '24:00', closed: false },
        sunday: { open: '09:00', close: '22:00', closed: false }
      },
      priceRange: '$$',
      isActive: true,
      isVerified: true,
      rating: 4.5,
      totalReviews: 2
    });

    const establishment2 = await Establishment.create({
      userId: establishmentUser.id,
      name: 'PRUEBA_Complejo Norte',
      description: 'Establecimiento de PRUEBA - Complejo deportivo premium',
      address: 'PRUEBA Calle Norte 567',
      city: 'Buenos Aires',
      latitude: -34.5875,
      longitude: -58.3974,
      phone: '+54 11 0000-1002',
      email: 'prueba_club2@test.com',
      images: [
        'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800'
      ],
      sports: ['futbol5', 'tenis', 'paddle'],
      amenities: ['Estacionamiento', 'Vestuarios', 'Buffet', 'WiFi', 'Aire Acondicionado'],
      priceRange: '$$$',
      isActive: true,
      isVerified: true,
      rating: 4.8,
      totalReviews: 1
    });

    console.log('   ✅ 2 establecimientos creados');

    // ==========================================
    // 3. CANCHAS DE PRUEBA
    // ==========================================
    console.log('⚽ Creando canchas...');

    const court1 = await Court.create({
      establishmentId: establishment1.id,
      name: 'PRUEBA_Cancha Fútbol 5 - A',
      sport: 'futbol5',
      surface: 'synthetic',
      isIndoor: false,
      pricePerHour: 8000,
      description: 'Cancha de PRUEBA - Fútbol 5 con césped sintético',
      images: ['https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800'],
      amenities: ['Iluminación LED', 'Vestuarios'],
      isActive: true
    });

    const court2 = await Court.create({
      establishmentId: establishment1.id,
      name: 'PRUEBA_Cancha Paddle - 1',
      sport: 'paddle',
      surface: 'indoor',
      isIndoor: true,
      pricePerHour: 6000,
      description: 'Cancha de PRUEBA - Paddle techada',
      images: ['https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800'],
      amenities: ['Techada', 'Iluminación LED', 'Aire Acondicionado'],
      isActive: true
    });

    const court3 = await Court.create({
      establishmentId: establishment2.id,
      name: 'PRUEBA_Cancha Premium',
      sport: 'futbol5',
      surface: 'synthetic',
      isIndoor: false,
      pricePerHour: 12000,
      description: 'Cancha de PRUEBA - Premium con todas las comodidades',
      images: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800'],
      amenities: ['Iluminación LED', 'Vestuarios VIP', 'Transmisión en vivo'],
      isActive: true
    });

    console.log('   ✅ 3 canchas creadas');

    // ==========================================
    // 4. RESERVAS DE PRUEBA
    // ==========================================
    console.log('📅 Creando reservas...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(20, 0, 0, 0);

    const booking1 = await Booking.create({
      userId: playerUser1.id,
      courtId: court1.id,
      establishmentId: establishment1.id,
      date: tomorrow.toISOString().split('T')[0],
      startTime: '20:00',
      endTime: '21:00',
      duration: 60,
      totalAmount: 8000,
      status: 'confirmed',
      paymentStatus: 'completed',
      notes: 'PRUEBA - Reserva confirmada'
    });

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const booking2 = await Booking.create({
      userId: playerUser2.id,
      courtId: court2.id,
      establishmentId: establishment1.id,
      date: nextWeek.toISOString().split('T')[0],
      startTime: '18:00',
      endTime: '19:30',
      duration: 90,
      totalAmount: 9000,
      status: 'pending',
      paymentStatus: 'pending',
      notes: 'PRUEBA - Reserva pendiente'
    });

    console.log('   ✅ 2 reservas creadas');

    // ==========================================
    // 5. RESEÑAS DE PRUEBA
    // ==========================================
    console.log('⭐ Creando reseñas...');

    await Review.create({
      userId: playerUser1.id,
      establishmentId: establishment1.id,
      rating: 5,
      title: 'PRUEBA - Excelente lugar',
      comment: 'Reseña de PRUEBA - Muy buenas instalaciones y atención',
      isVerified: true
    });

    await Review.create({
      userId: playerUser2.id,
      establishmentId: establishment1.id,
      rating: 4,
      title: 'PRUEBA - Muy bueno',
      comment: 'Reseña de PRUEBA - Buenas canchas, precios accesibles',
      isVerified: true
    });

    await Review.create({
      userId: playerUser1.id,
      establishmentId: establishment2.id,
      rating: 5,
      title: 'PRUEBA - Premium',
      comment: 'Reseña de PRUEBA - Instalaciones de primera calidad',
      isVerified: true
    });

    console.log('   ✅ 3 reseñas creadas');

    // ==========================================
    // 6. FAVORITOS DE PRUEBA
    // ==========================================
    console.log('❤️  Creando favoritos...');

    await Favorite.create({
      userId: playerUser1.id,
      establishmentId: establishment1.id
    });

    await Favorite.create({
      userId: playerUser2.id,
      establishmentId: establishment2.id
    });

    console.log('   ✅ 2 favoritos creados');

    // ==========================================
    // 7. NOTIFICACIONES DE PRUEBA
    // ==========================================
    console.log('🔔 Creando notificaciones...');

    await Notification.create({
      userId: playerUser1.id,
      type: 'booking_confirmed',
      title: 'PRUEBA - Reserva confirmada',
      message: 'Tu reserva en PRUEBA_Club Deportivo Central ha sido confirmada',
      data: { bookingId: booking1.id },
      isRead: false
    });

    await Notification.create({
      userId: playerUser2.id,
      type: 'booking_reminder',
      title: 'PRUEBA - Recordatorio',
      message: 'Tienes una reserva pendiente de pago',
      data: { bookingId: booking2.id },
      isRead: false
    });

    await Notification.create({
      userId: establishmentUser.id,
      type: 'new_booking',
      title: 'PRUEBA - Nueva reserva',
      message: 'Has recibido una nueva reserva en tu establecimiento',
      data: { bookingId: booking1.id },
      isRead: true
    });

    console.log('   ✅ 3 notificaciones creadas');

    // ==========================================
    // 8. PARTIDOS DISPONIBLES DE PRUEBA
    // ==========================================
    console.log('🎮 Creando partidos disponibles...');

    const matchDate = new Date();
    matchDate.setDate(matchDate.getDate() + 3);

    const match1 = await AvailableMatch.create({
      organizerId: playerUser1.id,
      establishmentId: establishment1.id,
      courtId: court1.id,
      sport: 'futbol5',
      date: matchDate.toISOString().split('T')[0],
      startTime: '21:00',
      endTime: '22:00',
      duration: 60,
      maxParticipants: 10,
      currentParticipants: 3,
      pricePerPerson: 800,
      skillLevel: 'intermediate',
      isPrivate: false,
      description: 'PRUEBA - Partido de fútbol 5, faltan jugadores!',
      status: 'open'
    });

    const match2Date = new Date();
    match2Date.setDate(match2Date.getDate() + 5);

    const match2 = await AvailableMatch.create({
      organizerId: playerUser2.id,
      establishmentId: establishment1.id,
      courtId: court2.id,
      sport: 'paddle',
      date: match2Date.toISOString().split('T')[0],
      startTime: '19:00',
      endTime: '20:30',
      duration: 90,
      maxParticipants: 4,
      currentParticipants: 2,
      pricePerPerson: 1500,
      skillLevel: 'advanced',
      isPrivate: false,
      description: 'PRUEBA - Partido de paddle, buscamos pareja!',
      status: 'open'
    });

    console.log('   ✅ 2 partidos disponibles creados');

    // ==========================================
    // 9. PARTICIPANTES DE PARTIDOS
    // ==========================================
    console.log('👥 Creando participantes de partidos...');

    await MatchParticipant.create({
      matchId: match1.id,
      userId: playerUser1.id,
      status: 'confirmed',
      isOrganizer: true
    });

    await MatchParticipant.create({
      matchId: match1.id,
      userId: playerUser2.id,
      status: 'confirmed',
      isOrganizer: false
    });

    await MatchParticipant.create({
      matchId: match2.id,
      userId: playerUser2.id,
      status: 'confirmed',
      isOrganizer: true
    });

    console.log('   ✅ 3 participantes creados');

    // ==========================================
    // 10. TORNEOS DE PRUEBA
    // ==========================================
    console.log('🏆 Creando torneos...');

    const tournamentStart = new Date();
    tournamentStart.setDate(tournamentStart.getDate() + 30);

    const tournament1 = await Tournament.create({
      establishmentId: establishment1.id,
      organizerId: establishmentUser.id,
      name: 'PRUEBA_Copa Verano Fútbol 5',
      description: 'Torneo de PRUEBA - Copa de verano para equipos amateur',
      sport: 'futbol5',
      format: 'single_elimination',
      category: 'open',
      skillLevel: 'intermediate',
      maxParticipants: 16,
      currentParticipants: 4,
      registrationFee: 15000,
      prizePool: 200000,
      prizeDistribution: { first: 50, second: 30, third: 20 },
      startDate: tournamentStart,
      endDate: new Date(tournamentStart.getTime() + 14 * 24 * 60 * 60 * 1000),
      registrationStartDate: new Date(),
      registrationEndDate: new Date(tournamentStart.getTime() - 7 * 24 * 60 * 60 * 1000),
      status: 'registration_open',
      rules: ['Equipos de 5 jugadores', 'Fair play obligatorio', 'Partidos de 25 min cada tiempo'],
      isPublic: true,
      contactInfo: { email: 'prueba_torneo@test.com', phone: '+54 11 0000-2001' }
    });

    console.log('   ✅ 1 torneo creado');

    // ==========================================
    // 11. PARTICIPANTES DE TORNEO
    // ==========================================
    console.log('🎯 Creando participantes de torneo...');

    await TournamentParticipant.create({
      tournamentId: tournament1.id,
      userId: playerUser1.id,
      teamName: 'PRUEBA_Los Tigres',
      players: [
        { name: 'PRUEBA_Juan', position: 'Delantero' },
        { name: 'PRUEBA_Pedro', position: 'Mediocampista' }
      ],
      status: 'confirmed',
      paymentStatus: 'paid'
    });

    await TournamentParticipant.create({
      tournamentId: tournament1.id,
      userId: playerUser2.id,
      teamName: 'PRUEBA_Las Leonas',
      players: [
        { name: 'PRUEBA_Maria', position: 'Arquera' },
        { name: 'PRUEBA_Ana', position: 'Defensora' }
      ],
      status: 'registered',
      paymentStatus: 'pending'
    });

    console.log('   ✅ 2 participantes de torneo creados');

    // ==========================================
    // RESUMEN FINAL
    // ==========================================
    console.log('\n' + '='.repeat(50));
    console.log('🎉 BASE DE DATOS POBLADA CON DATOS DE PRUEBA');
    console.log('='.repeat(50));
    console.log('\n📊 Resumen:');
    console.log('   👤 4 usuarios');
    console.log('   🏟️  2 establecimientos');
    console.log('   ⚽ 3 canchas');
    console.log('   📅 2 reservas');
    console.log('   ⭐ 3 reseñas');
    console.log('   ❤️  2 favoritos');
    console.log('   🔔 3 notificaciones');
    console.log('   🎮 2 partidos disponibles');
    console.log('   👥 3 participantes de partidos');
    console.log('   🏆 1 torneo');
    console.log('   🎯 2 participantes de torneo');
    
    console.log('\n🔐 Credenciales de prueba:');
    console.log('   Admin:         prueba_admin@miscanchas.com / prueba123');
    console.log('   Jugador 1:     prueba_juan@test.com / prueba123');
    console.log('   Jugador 2:     prueba_maria@test.com / prueba123');
    console.log('   Establecimiento: prueba_establecimiento@test.com / prueba123');
    
    console.log('\n💡 Todos los datos tienen prefijo "PRUEBA_" para identificarlos');
    console.log('   Cuando quieras limpiar, busca y elimina todo con ese prefijo\n');

  } catch (error) {
    console.error('❌ Error poblando base de datos:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  seedTestData()
    .then(() => {
      console.log('✅ Seed completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = { seedTestData };
