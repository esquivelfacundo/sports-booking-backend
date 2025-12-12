/**
 * Script completo para poblar la base de datos con datos de prueba
 * Incluye TODOS los 15 modelos de la aplicación
 * 
 * Modelos:
 * 1. User
 * 2. Establishment
 * 3. Court
 * 4. TimeSlot
 * 5. Booking
 * 6. Payment
 * 7. SplitPayment
 * 8. SplitPaymentParticipant
 * 9. AvailableMatch
 * 10. MatchParticipant
 * 11. Review
 * 12. Favorite
 * 13. Notification
 * 14. Tournament
 * 15. TournamentParticipant
 */

const { sequelize } = require('../models');
const {
  User,
  Establishment,
  Court,
  TimeSlot,
  Booking,
  Payment,
  SplitPayment,
  SplitPaymentParticipant,
  AvailableMatch,
  MatchParticipant,
  Review,
  Favorite,
  Notification,
  Tournament,
  TournamentParticipant
} = require('../models');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Helper para generar fechas
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const formatDate = (date) => date.toISOString().split('T')[0];

async function seedCompleteData() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🗑️  LIMPIANDO BASE DE DATOS DE RAILWAY...');
    console.log('='.repeat(60));

    // Forzar recreación de todas las tablas
    await sequelize.sync({ force: true });
    console.log('✅ Todas las tablas recreadas\n');

    console.log('='.repeat(60));
    console.log('📝 POBLANDO CON DATOS DE PRUEBA');
    console.log('   Prefijo: "PRUEBA_" para identificar datos de test');
    console.log('='.repeat(60) + '\n');

    const hashedPassword = await bcrypt.hash('prueba123', 12);
    const now = new Date();

    // ==========================================
    // 1. USUARIOS (User)
    // ==========================================
    console.log('1️⃣  Creando USUARIOS...');

    const adminUser = await User.create({
      email: 'prueba_admin@miscanchas.com',
      password: hashedPassword,
      firstName: 'PRUEBA_Admin',
      lastName: 'Sistema',
      phone: '+54 11 1111-0001',
      city: 'Buenos Aires',
      userType: 'admin',
      isEmailVerified: true,
      isActive: true,
      bio: 'Administrador del sistema - DATOS DE PRUEBA',
      favoritesSports: ['futbol5', 'paddle', 'tenis'],
      skillLevel: 'advanced'
    });

    const player1 = await User.create({
      email: 'prueba_juan@test.com',
      password: hashedPassword,
      firstName: 'PRUEBA_Juan',
      lastName: 'Pérez',
      phone: '+54 11 1111-0002',
      city: 'Buenos Aires',
      userType: 'player',
      isEmailVerified: true,
      isActive: true,
      bio: 'Jugador amateur de fútbol 5 - PRUEBA',
      favoritesSports: ['futbol5', 'tenis'],
      skillLevel: 'intermediate',
      location: { lat: -34.6037, lng: -58.3816, address: 'Palermo, Buenos Aires' }
    });

    const player2 = await User.create({
      email: 'prueba_maria@test.com',
      password: hashedPassword,
      firstName: 'PRUEBA_María',
      lastName: 'González',
      phone: '+54 11 1111-0003',
      city: 'Buenos Aires',
      userType: 'player',
      isEmailVerified: true,
      isActive: true,
      bio: 'Jugadora de paddle nivel avanzado - PRUEBA',
      favoritesSports: ['paddle', 'tenis'],
      skillLevel: 'advanced',
      location: { lat: -34.5875, lng: -58.3974, address: 'Belgrano, Buenos Aires' }
    });

    const player3 = await User.create({
      email: 'prueba_carlos@test.com',
      password: hashedPassword,
      firstName: 'PRUEBA_Carlos',
      lastName: 'Rodríguez',
      phone: '+54 11 1111-0004',
      city: 'Córdoba',
      userType: 'player',
      isEmailVerified: true,
      isActive: true,
      bio: 'Principiante entusiasta - PRUEBA',
      favoritesSports: ['futbol5'],
      skillLevel: 'beginner',
      location: { lat: -31.4201, lng: -64.1888, address: 'Nueva Córdoba, Córdoba' }
    });

    const player4 = await User.create({
      email: 'prueba_ana@test.com',
      password: hashedPassword,
      firstName: 'PRUEBA_Ana',
      lastName: 'Martínez',
      phone: '+54 11 1111-0005',
      city: 'Buenos Aires',
      userType: 'player',
      isEmailVerified: true,
      isActive: true,
      bio: 'Tenista competitiva - PRUEBA',
      favoritesSports: ['tenis', 'paddle'],
      skillLevel: 'advanced'
    });

    const establishmentOwner1 = await User.create({
      email: 'prueba_club1@test.com',
      password: hashedPassword,
      firstName: 'PRUEBA_Dueño',
      lastName: 'ClubCentral',
      phone: '+54 11 1111-1001',
      city: 'Buenos Aires',
      userType: 'establishment',
      isEmailVerified: true,
      isActive: true,
      bio: 'Propietario de Club Deportivo Central - PRUEBA'
    });

    const establishmentOwner2 = await User.create({
      email: 'prueba_club2@test.com',
      password: hashedPassword,
      firstName: 'PRUEBA_Dueño',
      lastName: 'ComplejoNorte',
      phone: '+54 11 1111-1002',
      city: 'Buenos Aires',
      userType: 'establishment',
      isEmailVerified: true,
      isActive: true,
      bio: 'Propietario de Complejo Norte - PRUEBA'
    });

    console.log('   ✅ 7 usuarios creados');

    // ==========================================
    // 2. ESTABLECIMIENTOS (Establishment)
    // ==========================================
    console.log('2️⃣  Creando ESTABLECIMIENTOS...');

    const establishment1 = await Establishment.create({
      userId: establishmentOwner1.id,
      name: 'PRUEBA_Club Deportivo Central',
      description: 'Club deportivo con canchas de fútbol 5, paddle y tenis. Instalaciones modernas con vestuarios, estacionamiento y buffet. DATOS DE PRUEBA.',
      address: 'PRUEBA Av. Libertador 1234, Palermo',
      city: 'Buenos Aires',
      latitude: -34.5678,
      longitude: -58.4321,
      phone: '+54 11 4567-8901',
      email: 'prueba_clubcentral@test.com',
      website: 'https://prueba-clubcentral.com',
      logo: 'https://via.placeholder.com/200x200?text=Club+Central',
      images: [
        'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800',
        'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
        'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800'
      ],
      amenities: ['Estacionamiento', 'Vestuarios', 'Duchas', 'Buffet', 'WiFi', 'Iluminación LED'],
      rules: ['No fumar en las instalaciones', 'Respetar horarios', 'Usar calzado deportivo'],
      openingHours: {
        monday: { open: '08:00', close: '23:00', closed: false },
        tuesday: { open: '08:00', close: '23:00', closed: false },
        wednesday: { open: '08:00', close: '23:00', closed: false },
        thursday: { open: '08:00', close: '23:00', closed: false },
        friday: { open: '08:00', close: '24:00', closed: false },
        saturday: { open: '09:00', close: '24:00', closed: false },
        sunday: { open: '09:00', close: '22:00', closed: false }
      },
      isActive: true,
      isVerified: true,
      rating: 4.5,
      totalReviews: 3,
      priceRange: '$$',
      sports: ['futbol5', 'paddle', 'tenis']
    });

    const establishment2 = await Establishment.create({
      userId: establishmentOwner2.id,
      name: 'PRUEBA_Complejo Deportivo Norte',
      description: 'Complejo premium con canchas de última generación. Servicio de primer nivel. DATOS DE PRUEBA.',
      address: 'PRUEBA Av. Cabildo 5678, Belgrano',
      city: 'Buenos Aires',
      latitude: -34.5432,
      longitude: -58.4567,
      phone: '+54 11 4567-8902',
      email: 'prueba_complejnorte@test.com',
      images: [
        'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800',
        'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800'
      ],
      amenities: ['Estacionamiento VIP', 'Vestuarios Premium', 'Spa', 'Restaurante', 'WiFi', 'Aire Acondicionado'],
      openingHours: {
        monday: { open: '07:00', close: '23:00', closed: false },
        tuesday: { open: '07:00', close: '23:00', closed: false },
        wednesday: { open: '07:00', close: '23:00', closed: false },
        thursday: { open: '07:00', close: '23:00', closed: false },
        friday: { open: '07:00', close: '24:00', closed: false },
        saturday: { open: '08:00', close: '24:00', closed: false },
        sunday: { open: '08:00', close: '22:00', closed: false }
      },
      isActive: true,
      isVerified: true,
      rating: 4.8,
      totalReviews: 2,
      priceRange: '$$$',
      sports: ['futbol5', 'paddle', 'tenis', 'squash']
    });

    const establishment3 = await Establishment.create({
      userId: establishmentOwner1.id,
      name: 'PRUEBA_Canchas del Sur',
      description: 'Canchas económicas para todos. Ambiente familiar. DATOS DE PRUEBA.',
      address: 'PRUEBA Av. Rivadavia 9876, Flores',
      city: 'Buenos Aires',
      latitude: -34.6234,
      longitude: -58.4678,
      phone: '+54 11 4567-8903',
      email: 'prueba_canchasdelsur@test.com',
      images: [
        'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800'
      ],
      amenities: ['Estacionamiento', 'Vestuarios', 'Kiosco'],
      isActive: true,
      isVerified: false,
      rating: 4.0,
      totalReviews: 1,
      priceRange: '$',
      sports: ['futbol5']
    });

    console.log('   ✅ 3 establecimientos creados');

    // ==========================================
    // 3. CANCHAS (Court)
    // ==========================================
    console.log('3️⃣  Creando CANCHAS...');

    const court1 = await Court.create({
      establishmentId: establishment1.id,
      name: 'PRUEBA_Cancha Fútbol 5 - A',
      sport: 'futbol5',
      surface: 'synthetic',
      isIndoor: false,
      capacity: 10,
      pricePerHour: 8000,
      pricePerHour90: 11000,
      pricePerHour120: 14000,
      description: 'Cancha de fútbol 5 con césped sintético de última generación - PRUEBA',
      images: ['https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800'],
      amenities: ['Iluminación LED', 'Arcos profesionales'],
      isActive: true
    });

    const court2 = await Court.create({
      establishmentId: establishment1.id,
      name: 'PRUEBA_Cancha Fútbol 5 - B',
      sport: 'futbol5',
      surface: 'synthetic',
      isIndoor: false,
      capacity: 10,
      pricePerHour: 8000,
      description: 'Segunda cancha de fútbol 5 - PRUEBA',
      images: ['https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800'],
      amenities: ['Iluminación LED'],
      isActive: true
    });

    const court3 = await Court.create({
      establishmentId: establishment1.id,
      name: 'PRUEBA_Cancha Paddle 1',
      sport: 'paddle',
      surface: 'synthetic',
      isIndoor: true,
      capacity: 4,
      pricePerHour: 6000,
      pricePerHour90: 8500,
      description: 'Cancha de paddle techada con cristales - PRUEBA',
      images: ['https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800'],
      amenities: ['Techada', 'Iluminación LED', 'Cristales panorámicos'],
      isActive: true
    });

    const court4 = await Court.create({
      establishmentId: establishment1.id,
      name: 'PRUEBA_Cancha Tenis',
      sport: 'tenis',
      surface: 'clay',
      isIndoor: false,
      capacity: 4,
      pricePerHour: 7000,
      description: 'Cancha de tenis de polvo de ladrillo - PRUEBA',
      images: ['https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800'],
      amenities: ['Iluminación', 'Red profesional'],
      isActive: true
    });

    const court5 = await Court.create({
      establishmentId: establishment2.id,
      name: 'PRUEBA_Cancha Premium Fútbol',
      sport: 'futbol5',
      surface: 'synthetic',
      isIndoor: true,
      capacity: 10,
      pricePerHour: 15000,
      pricePerHour90: 20000,
      pricePerHour120: 25000,
      description: 'Cancha premium techada con climatización - PRUEBA',
      images: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800'],
      amenities: ['Techada', 'Climatizada', 'Transmisión en vivo', 'Vestuarios VIP'],
      isActive: true
    });

    const court6 = await Court.create({
      establishmentId: establishment2.id,
      name: 'PRUEBA_Cancha Paddle Premium',
      sport: 'paddle',
      surface: 'synthetic',
      isIndoor: true,
      capacity: 4,
      pricePerHour: 10000,
      description: 'Cancha de paddle premium - PRUEBA',
      images: ['https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800'],
      amenities: ['Climatizada', 'Cristales premium'],
      isActive: true
    });

    const court7 = await Court.create({
      establishmentId: establishment3.id,
      name: 'PRUEBA_Cancha Económica',
      sport: 'futbol5',
      surface: 'synthetic',
      isIndoor: false,
      capacity: 10,
      pricePerHour: 5000,
      description: 'Cancha económica para todos - PRUEBA',
      images: ['https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800'],
      amenities: ['Iluminación básica'],
      isActive: true
    });

    console.log('   ✅ 7 canchas creadas');

    // ==========================================
    // 4. TIME SLOTS (TimeSlot)
    // ==========================================
    console.log('4️⃣  Creando TIME SLOTS...');

    const timeSlots = [];
    const courts = [court1, court2, court3, court4, court5, court6, court7];
    
    // Crear slots para los próximos 7 días
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = formatDate(addDays(now, dayOffset));
      
      for (const court of courts.slice(0, 3)) { // Solo primeras 3 canchas para no crear demasiados
        // Slots de 8am a 11pm
        for (let hour = 8; hour < 23; hour++) {
          const slot = await TimeSlot.create({
            courtId: court.id,
            date: date,
            startTime: `${hour.toString().padStart(2, '0')}:00`,
            endTime: `${(hour + 1).toString().padStart(2, '0')}:00`,
            duration: 60,
            price: court.pricePerHour,
            isAvailable: Math.random() > 0.3, // 70% disponibles
            isBlocked: false
          });
          timeSlots.push(slot);
        }
      }
    }

    console.log(`   ✅ ${timeSlots.length} time slots creados`);

    // ==========================================
    // 5. RESERVAS (Booking)
    // ==========================================
    console.log('5️⃣  Creando RESERVAS...');

    const booking1 = await Booking.create({
      userId: player1.id,
      establishmentId: establishment1.id,
      courtId: court1.id,
      date: formatDate(addDays(now, 1)),
      startTime: '20:00',
      endTime: '21:00',
      duration: 60,
      totalAmount: 8000,
      status: 'confirmed',
      paymentStatus: 'completed',
      paymentType: 'full',
      playerCount: 10,
      notes: 'PRUEBA - Reserva confirmada y pagada'
    });

    const booking2 = await Booking.create({
      userId: player2.id,
      establishmentId: establishment1.id,
      courtId: court3.id,
      date: formatDate(addDays(now, 2)),
      startTime: '18:00',
      endTime: '19:30',
      duration: 90,
      totalAmount: 8500,
      status: 'confirmed',
      paymentStatus: 'completed',
      notes: 'PRUEBA - Paddle con amigas'
    });

    const booking3 = await Booking.create({
      userId: player3.id,
      establishmentId: establishment2.id,
      courtId: court5.id,
      date: formatDate(addDays(now, 3)),
      startTime: '21:00',
      endTime: '22:00',
      duration: 60,
      totalAmount: 15000,
      status: 'pending',
      paymentStatus: 'pending',
      notes: 'PRUEBA - Reserva pendiente de pago'
    });

    const booking4 = await Booking.create({
      userId: player1.id,
      establishmentId: establishment1.id,
      courtId: court4.id,
      date: formatDate(addDays(now, 5)),
      startTime: '10:00',
      endTime: '11:00',
      duration: 60,
      totalAmount: 7000,
      status: 'confirmed',
      paymentStatus: 'partial',
      notes: 'PRUEBA - Tenis con pago parcial'
    });

    const booking5 = await Booking.create({
      userId: player4.id,
      establishmentId: establishment3.id,
      courtId: court7.id,
      date: formatDate(addDays(now, -2)),
      startTime: '19:00',
      endTime: '20:00',
      duration: 60,
      totalAmount: 5000,
      status: 'completed',
      paymentStatus: 'completed',
      notes: 'PRUEBA - Reserva completada (pasada)'
    });

    console.log('   ✅ 5 reservas creadas');

    // ==========================================
    // 6. PAGOS (Payment)
    // ==========================================
    console.log('6️⃣  Creando PAGOS...');

    const payment1 = await Payment.create({
      userId: player1.id,
      bookingId: booking1.id,
      amount: 8000,
      currency: 'ARS',
      paymentMethod: 'mercadopago',
      status: 'completed',
      externalPaymentId: 'MP_PRUEBA_001',
      processedAt: now
    });

    const payment2 = await Payment.create({
      userId: player2.id,
      bookingId: booking2.id,
      amount: 8500,
      currency: 'ARS',
      paymentMethod: 'credit_card',
      status: 'completed',
      externalPaymentId: 'MP_PRUEBA_002',
      processedAt: now
    });

    const payment3 = await Payment.create({
      userId: player1.id,
      bookingId: booking4.id,
      amount: 3500,
      currency: 'ARS',
      paymentMethod: 'debit_card',
      status: 'completed',
      externalPaymentId: 'MP_PRUEBA_003',
      processedAt: now
    });

    const payment4 = await Payment.create({
      userId: player4.id,
      bookingId: booking5.id,
      amount: 5000,
      currency: 'ARS',
      paymentMethod: 'cash',
      status: 'completed',
      processedAt: addDays(now, -2)
    });

    const payment5 = await Payment.create({
      userId: player3.id,
      bookingId: booking3.id,
      amount: 15000,
      currency: 'ARS',
      paymentMethod: 'mercadopago',
      status: 'pending'
    });

    console.log('   ✅ 5 pagos creados');

    // ==========================================
    // 7. SPLIT PAYMENTS (SplitPayment)
    // ==========================================
    console.log('7️⃣  Creando SPLIT PAYMENTS...');

    const splitPayment1 = await SplitPayment.create({
      bookingId: booking1.id,
      organizerId: player1.id,
      totalAmount: 8000,
      amountPerPerson: 800,
      totalParticipants: 10,
      paidParticipants: 8,
      status: 'partial',
      expiresAt: addDays(now, 1),
      inviteCode: 'PRUEBA_SPLIT_001',
      inviteLink: 'https://miscanchas.com/split/PRUEBA_SPLIT_001'
    });

    const splitPayment2 = await SplitPayment.create({
      bookingId: booking2.id,
      organizerId: player2.id,
      totalAmount: 8500,
      amountPerPerson: 2125,
      totalParticipants: 4,
      paidParticipants: 4,
      status: 'completed',
      expiresAt: addDays(now, 2),
      inviteCode: 'PRUEBA_SPLIT_002',
      completedAt: now
    });

    console.log('   ✅ 2 split payments creados');

    // ==========================================
    // 8. SPLIT PAYMENT PARTICIPANTS
    // ==========================================
    console.log('8️⃣  Creando SPLIT PAYMENT PARTICIPANTS...');

    await SplitPaymentParticipant.create({
      splitPaymentId: splitPayment1.id,
      userId: player1.id,
      amount: 800,
      status: 'paid',
      paidAt: now
    });

    await SplitPaymentParticipant.create({
      splitPaymentId: splitPayment1.id,
      userId: player3.id,
      amount: 800,
      status: 'paid',
      paidAt: now
    });

    await SplitPaymentParticipant.create({
      splitPaymentId: splitPayment1.id,
      email: 'prueba_invitado1@test.com',
      name: 'PRUEBA_Invitado 1',
      amount: 800,
      status: 'pending'
    });

    await SplitPaymentParticipant.create({
      splitPaymentId: splitPayment1.id,
      email: 'prueba_invitado2@test.com',
      name: 'PRUEBA_Invitado 2',
      amount: 800,
      status: 'pending'
    });

    await SplitPaymentParticipant.create({
      splitPaymentId: splitPayment2.id,
      userId: player2.id,
      amount: 2125,
      status: 'paid',
      paidAt: now
    });

    await SplitPaymentParticipant.create({
      splitPaymentId: splitPayment2.id,
      userId: player4.id,
      amount: 2125,
      status: 'paid',
      paidAt: now
    });

    console.log('   ✅ 6 split payment participants creados');

    // ==========================================
    // 9. PARTIDOS DISPONIBLES (AvailableMatch)
    // ==========================================
    console.log('9️⃣  Creando PARTIDOS DISPONIBLES...');

    const match1 = await AvailableMatch.create({
      organizerId: player1.id,
      establishmentId: establishment1.id,
      courtId: court1.id,
      sport: 'futbol5',
      date: formatDate(addDays(now, 4)),
      startTime: '21:00',
      endTime: '22:00',
      duration: 60,
      maxParticipants: 10,
      currentParticipants: 6,
      pricePerPerson: 800,
      skillLevel: 'intermediate',
      isPrivate: false,
      description: 'PRUEBA - Partido de fútbol 5, ¡faltan 4 jugadores!',
      rules: ['Puntualidad', 'Fair play'],
      status: 'open'
    });

    const match2 = await AvailableMatch.create({
      organizerId: player2.id,
      establishmentId: establishment1.id,
      courtId: court3.id,
      sport: 'paddle',
      date: formatDate(addDays(now, 5)),
      startTime: '19:00',
      endTime: '20:30',
      duration: 90,
      maxParticipants: 4,
      currentParticipants: 2,
      pricePerPerson: 2125,
      skillLevel: 'advanced',
      isPrivate: false,
      description: 'PRUEBA - Paddle nivel avanzado, buscamos pareja',
      status: 'open'
    });

    const match3 = await AvailableMatch.create({
      organizerId: player4.id,
      establishmentId: establishment3.id,
      courtId: court7.id,
      sport: 'futbol5',
      date: formatDate(addDays(now, 6)),
      startTime: '20:00',
      endTime: '21:00',
      duration: 60,
      maxParticipants: 10,
      currentParticipants: 3,
      pricePerPerson: 500,
      skillLevel: 'beginner',
      isPrivate: false,
      description: 'PRUEBA - Partido para principiantes, ambiente relajado',
      status: 'open'
    });

    const match4 = await AvailableMatch.create({
      organizerId: player1.id,
      establishmentId: establishment2.id,
      courtId: court5.id,
      sport: 'futbol5',
      date: formatDate(addDays(now, 7)),
      startTime: '22:00',
      endTime: '23:00',
      duration: 60,
      maxParticipants: 10,
      currentParticipants: 10,
      pricePerPerson: 1500,
      skillLevel: 'intermediate',
      isPrivate: true,
      inviteCode: 'PRUEBA_MATCH_PRIV',
      description: 'PRUEBA - Partido privado completo',
      status: 'full'
    });

    console.log('   ✅ 4 partidos disponibles creados');

    // ==========================================
    // 10. PARTICIPANTES DE PARTIDOS (MatchParticipant)
    // ==========================================
    console.log('🔟 Creando PARTICIPANTES DE PARTIDOS...');

    // Match 1 participants
    await MatchParticipant.create({
      matchId: match1.id,
      userId: player1.id,
      status: 'joined',
      paymentStatus: 'paid'
    });

    await MatchParticipant.create({
      matchId: match1.id,
      userId: player3.id,
      status: 'joined',
      paymentStatus: 'paid'
    });

    await MatchParticipant.create({
      matchId: match1.id,
      userId: player4.id,
      status: 'joined',
      paymentStatus: 'pending'
    });

    // Match 2 participants
    await MatchParticipant.create({
      matchId: match2.id,
      userId: player2.id,
      status: 'joined',
      paymentStatus: 'paid'
    });

    await MatchParticipant.create({
      matchId: match2.id,
      userId: player4.id,
      status: 'joined',
      paymentStatus: 'paid'
    });

    // Match 3 participants
    await MatchParticipant.create({
      matchId: match3.id,
      userId: player4.id,
      status: 'joined',
      paymentStatus: 'paid'
    });

    console.log('   ✅ 6 participantes de partidos creados');

    // ==========================================
    // 11. RESEÑAS (Review)
    // ==========================================
    console.log('1️⃣1️⃣ Creando RESEÑAS...');

    await Review.create({
      userId: player1.id,
      establishmentId: establishment1.id,
      bookingId: booking1.id,
      rating: 5,
      title: 'PRUEBA - Excelente lugar',
      comment: 'Muy buenas instalaciones, canchas en perfecto estado. El personal muy amable. Recomendado 100%. DATOS DE PRUEBA.',
      images: ['https://via.placeholder.com/400x300?text=Review+Image'],
      aspects: { facilities: 5, service: 5, cleanliness: 5, value: 4 },
      isVerified: true
    });

    await Review.create({
      userId: player2.id,
      establishmentId: establishment1.id,
      rating: 4,
      title: 'PRUEBA - Muy bueno',
      comment: 'Buenas canchas de paddle, precios accesibles. Solo le falta un poco más de estacionamiento. PRUEBA.',
      aspects: { facilities: 4, service: 5, cleanliness: 4, value: 4 },
      isVerified: true
    });

    await Review.create({
      userId: player3.id,
      establishmentId: establishment1.id,
      rating: 5,
      title: 'PRUEBA - Increíble',
      comment: 'Primera vez que vengo y quedé encantado. Volveré seguro. PRUEBA.',
      isVerified: true
    });

    await Review.create({
      userId: player1.id,
      establishmentId: establishment2.id,
      rating: 5,
      title: 'PRUEBA - Premium de verdad',
      comment: 'Instalaciones de primer nivel. Vale cada peso. PRUEBA.',
      aspects: { facilities: 5, service: 5, cleanliness: 5, value: 4 },
      isVerified: true
    });

    await Review.create({
      userId: player4.id,
      establishmentId: establishment2.id,
      rating: 4,
      title: 'PRUEBA - Muy caro pero bueno',
      comment: 'Excelente calidad pero los precios son altos. PRUEBA.',
      isVerified: true
    });

    await Review.create({
      userId: player4.id,
      establishmentId: establishment3.id,
      rating: 4,
      title: 'PRUEBA - Buena relación precio-calidad',
      comment: 'Para el precio que tiene, está muy bien. PRUEBA.',
      isVerified: true
    });

    console.log('   ✅ 6 reseñas creadas');

    // ==========================================
    // 12. FAVORITOS (Favorite)
    // ==========================================
    console.log('1️⃣2️⃣ Creando FAVORITOS...');

    await Favorite.create({ userId: player1.id, establishmentId: establishment1.id });
    await Favorite.create({ userId: player1.id, establishmentId: establishment2.id });
    await Favorite.create({ userId: player2.id, establishmentId: establishment1.id });
    await Favorite.create({ userId: player3.id, establishmentId: establishment1.id });
    await Favorite.create({ userId: player4.id, establishmentId: establishment3.id });

    console.log('   ✅ 5 favoritos creados');

    // ==========================================
    // 13. NOTIFICACIONES (Notification)
    // ==========================================
    console.log('1️⃣3️⃣ Creando NOTIFICACIONES...');

    await Notification.create({
      userId: player1.id,
      type: 'booking_confirmed',
      title: 'PRUEBA - Reserva confirmada',
      message: 'Tu reserva en Club Deportivo Central para mañana a las 20:00 ha sido confirmada.',
      data: { bookingId: booking1.id, establishmentName: 'PRUEBA_Club Deportivo Central' },
      isRead: false
    });

    await Notification.create({
      userId: player1.id,
      type: 'match_reminder',
      title: 'PRUEBA - Recordatorio de partido',
      message: 'Tu partido de fútbol 5 es en 2 días. ¡No faltes!',
      data: { matchId: match1.id },
      isRead: true
    });

    await Notification.create({
      userId: player2.id,
      type: 'payment_received',
      title: 'PRUEBA - Pago recibido',
      message: 'Recibimos tu pago de $8,500 para la reserva de paddle.',
      data: { paymentId: payment2.id, amount: 8500 },
      isRead: false
    });

    await Notification.create({
      userId: player3.id,
      type: 'booking_reminder',
      title: 'PRUEBA - Recordatorio de reserva',
      message: 'Tu reserva es mañana a las 21:00. ¡No olvides confirmar tu asistencia!',
      data: { bookingId: booking3.id },
      isRead: false
    });

    await Notification.create({
      userId: player4.id,
      type: 'match_invitation',
      title: 'PRUEBA - Invitación a partido',
      message: 'Juan te invitó a un partido de fútbol 5 el próximo sábado.',
      data: { matchId: match1.id, organizerName: 'PRUEBA_Juan' },
      isRead: false
    });

    await Notification.create({
      userId: establishmentOwner1.id,
      type: 'booking_confirmed',
      title: 'PRUEBA - Nueva reserva confirmada',
      message: 'Tienes una nueva reserva confirmada para mañana a las 20:00.',
      data: { bookingId: booking1.id },
      isRead: true
    });

    await Notification.create({
      userId: establishmentOwner1.id,
      type: 'review_request',
      title: 'PRUEBA - Nueva reseña recibida',
      message: 'Juan dejó una reseña de 5 estrellas en tu establecimiento.',
      data: { establishmentId: establishment1.id, rating: 5 },
      isRead: false
    });

    console.log('   ✅ 7 notificaciones creadas');

    // ==========================================
    // 14. TORNEOS (Tournament)
    // ==========================================
    console.log('1️⃣4️⃣ Creando TORNEOS...');

    const tournament1 = await Tournament.create({
      establishmentId: establishment1.id,
      organizerId: establishmentOwner1.id,
      name: 'PRUEBA_Copa Verano Fútbol 5',
      description: 'Gran torneo de verano para equipos amateur. Premios en efectivo y trofeos. DATOS DE PRUEBA.',
      sport: 'futbol5',
      format: 'single_elimination',
      category: 'open',
      skillLevel: 'intermediate',
      maxParticipants: 16,
      currentParticipants: 8,
      registrationFee: 15000,
      prizePool: 200000,
      prizeDistribution: { first: 50, second: 30, third: 20 },
      startDate: addDays(now, 30),
      endDate: addDays(now, 45),
      registrationStartDate: now,
      registrationEndDate: addDays(now, 25),
      status: 'registration_open',
      rules: ['Equipos de 5 jugadores + 2 suplentes', 'Partidos de 25 min cada tiempo', 'Fair play obligatorio'],
      images: ['https://via.placeholder.com/800x400?text=Copa+Verano'],
      isPublic: true,
      requiresApproval: false,
      contactInfo: { email: 'prueba_torneo@test.com', phone: '+54 11 9999-0001' }
    });

    const tournament2 = await Tournament.create({
      establishmentId: establishment2.id,
      organizerId: establishmentOwner2.id,
      name: 'PRUEBA_Torneo Paddle Premium',
      description: 'Torneo exclusivo de paddle para jugadores avanzados. DATOS DE PRUEBA.',
      sport: 'paddle',
      format: 'round_robin',
      category: 'mixed',
      skillLevel: 'advanced',
      maxParticipants: 8,
      currentParticipants: 6,
      registrationFee: 25000,
      prizePool: 150000,
      startDate: addDays(now, 15),
      endDate: addDays(now, 20),
      registrationStartDate: addDays(now, -10),
      registrationEndDate: addDays(now, 10),
      status: 'registration_open',
      rules: ['Parejas fijas', 'Nivel avanzado comprobable'],
      isPublic: true,
      requiresApproval: true,
      contactInfo: { email: 'prueba_paddle@test.com' }
    });

    const tournament3 = await Tournament.create({
      establishmentId: establishment1.id,
      organizerId: establishmentOwner1.id,
      name: 'PRUEBA_Liga Nocturna',
      description: 'Liga semanal de fútbol 5 nocturno. DATOS DE PRUEBA.',
      sport: 'futbol5',
      format: 'group_stage',
      category: 'open',
      skillLevel: 'beginner',
      maxParticipants: 12,
      currentParticipants: 12,
      registrationFee: 10000,
      prizePool: 100000,
      startDate: addDays(now, -7),
      endDate: addDays(now, 60),
      registrationStartDate: addDays(now, -30),
      registrationEndDate: addDays(now, -10),
      status: 'in_progress',
      isPublic: true
    });

    console.log('   ✅ 3 torneos creados');

    // ==========================================
    // 15. PARTICIPANTES DE TORNEOS (TournamentParticipant)
    // ==========================================
    console.log('1️⃣5️⃣ Creando PARTICIPANTES DE TORNEOS...');

    // Tournament 1 participants
    await TournamentParticipant.create({
      tournamentId: tournament1.id,
      userId: player1.id,
      teamName: 'PRUEBA_Los Tigres FC',
      players: [
        { name: 'PRUEBA_Juan', position: 'Delantero', number: 9 },
        { name: 'PRUEBA_Pedro', position: 'Mediocampista', number: 10 },
        { name: 'PRUEBA_Luis', position: 'Defensor', number: 4 },
        { name: 'PRUEBA_Diego', position: 'Arquero', number: 1 },
        { name: 'PRUEBA_Martín', position: 'Defensor', number: 2 }
      ],
      status: 'confirmed',
      paymentStatus: 'paid',
      seed: 1,
      wins: 0,
      losses: 0,
      points: 0
    });

    await TournamentParticipant.create({
      tournamentId: tournament1.id,
      userId: player3.id,
      teamName: 'PRUEBA_Real Palermo',
      players: [
        { name: 'PRUEBA_Carlos', position: 'Delantero', number: 7 },
        { name: 'PRUEBA_Roberto', position: 'Mediocampista', number: 8 }
      ],
      status: 'confirmed',
      paymentStatus: 'paid',
      seed: 2
    });

    await TournamentParticipant.create({
      tournamentId: tournament1.id,
      userId: player4.id,
      teamName: 'PRUEBA_Deportivo Sur',
      status: 'registered',
      paymentStatus: 'pending',
      seed: 3
    });

    // Tournament 2 participants
    await TournamentParticipant.create({
      tournamentId: tournament2.id,
      userId: player2.id,
      teamName: 'PRUEBA_Las Raquetas',
      players: [
        { name: 'PRUEBA_María', position: 'Drive' },
        { name: 'PRUEBA_Ana', position: 'Revés' }
      ],
      status: 'confirmed',
      paymentStatus: 'paid'
    });

    await TournamentParticipant.create({
      tournamentId: tournament2.id,
      userId: player4.id,
      teamName: 'PRUEBA_Paddle Masters',
      status: 'registered',
      paymentStatus: 'pending'
    });

    // Tournament 3 participants (liga en progreso)
    await TournamentParticipant.create({
      tournamentId: tournament3.id,
      userId: player1.id,
      teamName: 'PRUEBA_Nocturno FC',
      status: 'confirmed',
      paymentStatus: 'paid',
      wins: 3,
      losses: 1,
      points: 9
    });

    await TournamentParticipant.create({
      tournamentId: tournament3.id,
      userId: player3.id,
      teamName: 'PRUEBA_Luna Llena',
      status: 'confirmed',
      paymentStatus: 'paid',
      wins: 2,
      losses: 2,
      points: 6
    });

    console.log('   ✅ 7 participantes de torneos creados');

    // ==========================================
    // RESUMEN FINAL
    // ==========================================
    console.log('\n' + '='.repeat(60));
    console.log('🎉 BASE DE DATOS POBLADA EXITOSAMENTE');
    console.log('='.repeat(60));
    
    console.log('\n📊 RESUMEN DE DATOS CREADOS:');
    console.log('   1️⃣  Usuarios:                    7');
    console.log('   2️⃣  Establecimientos:            3');
    console.log('   3️⃣  Canchas:                     7');
    console.log(`   4️⃣  Time Slots:                  ${timeSlots.length}`);
    console.log('   5️⃣  Reservas:                    5');
    console.log('   6️⃣  Pagos:                       5');
    console.log('   7️⃣  Split Payments:              2');
    console.log('   8️⃣  Split Payment Participants:  6');
    console.log('   9️⃣  Partidos Disponibles:        4');
    console.log('   🔟 Participantes Partidos:       6');
    console.log('   1️⃣1️⃣ Reseñas:                     6');
    console.log('   1️⃣2️⃣ Favoritos:                   5');
    console.log('   1️⃣3️⃣ Notificaciones:              7');
    console.log('   1️⃣4️⃣ Torneos:                     3');
    console.log('   1️⃣5️⃣ Participantes Torneos:       7');

    console.log('\n🔐 CREDENCIALES DE PRUEBA:');
    console.log('   ┌─────────────────────────────────────────────────────────┐');
    console.log('   │ Rol              │ Email                    │ Password │');
    console.log('   ├─────────────────────────────────────────────────────────┤');
    console.log('   │ Admin            │ prueba_admin@miscanchas.com │ prueba123│');
    console.log('   │ Jugador 1        │ prueba_juan@test.com        │ prueba123│');
    console.log('   │ Jugador 2        │ prueba_maria@test.com       │ prueba123│');
    console.log('   │ Jugador 3        │ prueba_carlos@test.com      │ prueba123│');
    console.log('   │ Jugador 4        │ prueba_ana@test.com         │ prueba123│');
    console.log('   │ Establecimiento 1│ prueba_club1@test.com       │ prueba123│');
    console.log('   │ Establecimiento 2│ prueba_club2@test.com       │ prueba123│');
    console.log('   └─────────────────────────────────────────────────────────┘');

    console.log('\n💡 IDENTIFICACIÓN:');
    console.log('   Todos los datos tienen el prefijo "PRUEBA_" para identificarlos');
    console.log('   fácilmente y poder limpiarlos cuando sea necesario.\n');

  } catch (error) {
    console.error('\n❌ ERROR poblando base de datos:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  seedCompleteData()
    .then(() => {
      console.log('✅ Seed completo finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = { seedCompleteData };
