const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database');
const { User, Establishment, Court, Booking, Client } = require('../models');

// Helper to hash password
const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

// Helper to generate random phone
const generatePhone = () => {
  const prefixes = ['11', '221', '351', '341', '261'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const number = Math.floor(Math.random() * 90000000) + 10000000;
  return `+54 9 ${prefix} ${number.toString().slice(0, 4)}-${number.toString().slice(4)}`;
};

// Client names for realistic data
const clientNames = [
  'Juan Pérez', 'María García', 'Carlos López', 'Ana Martínez', 'Diego Fernández',
  'Laura Rodríguez', 'Martín González', 'Sofía Sánchez', 'Pablo Díaz', 'Valentina Torres',
  'Lucas Ramírez', 'Camila Flores', 'Nicolás Ruiz', 'Isabella Moreno', 'Mateo Álvarez',
  'Emma Romero', 'Santiago Herrera', 'Mía Castro', 'Benjamín Vargas', 'Olivia Mendoza',
  'Tomás Suárez', 'Lucía Jiménez', 'Agustín Molina', 'Martina Ortiz', 'Facundo Silva',
  'Catalina Rojas', 'Joaquín Navarro', 'Renata Medina', 'Thiago Aguirre', 'Antonella Vega',
  'Lautaro Cabrera', 'Delfina Ríos', 'Bautista Campos', 'Alma Reyes', 'Felipe Gutiérrez',
  'Victoria Luna', 'Maximiliano Paz', 'Julieta Acosta', 'Bruno Domínguez', 'Emilia Peralta'
];

// Generate email from name
const generateEmail = (name) => {
  const [first, last] = name.toLowerCase().split(' ');
  const domains = ['gmail.com', 'hotmail.com', 'yahoo.com.ar', 'outlook.com'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const num = Math.floor(Math.random() * 100);
  return `${first}.${last}${num}@${domain}`;
};

async function seedJuventus() {
  try {
    console.log('🚀 Starting Juventus seed...\n');

    // 1. Create main admin user (Club Juventus)
    console.log('Creating admin user...');
    const adminPassword = await hashPassword('Juventus@2001');
    
    let adminUser = await User.findOne({ where: { email: 'juventus@miscanchas.com' } });
    if (!adminUser) {
      adminUser = await User.create({
        id: uuidv4(),
        email: 'juventus@miscanchas.com',
        password: adminPassword,
        firstName: 'Club',
        lastName: 'Juventus',
        phone: '+54 9 11 5555-1234',
        userType: 'admin',
        isVerified: true,
        status: 'active'
      });
      console.log('✅ Admin user created: juventus@miscanchas.com');
    } else {
      console.log('ℹ️ Admin user already exists');
    }

    // 2. Create staff users
    console.log('\nCreating staff users...');
    const staffRoles = [
      { role: 'gerente', firstName: 'Roberto', lastName: 'Gerente' },
      { role: 'recepcionista', firstName: 'Carolina', lastName: 'Recepción' },
      { role: 'mantenimiento', firstName: 'Jorge', lastName: 'Mantenimiento' },
      { role: 'instructor', firstName: 'Fernando', lastName: 'Instructor' }
    ];

    for (const staff of staffRoles) {
      const email = `juventus_${staff.role}@miscanchas.com`;
      let staffUser = await User.findOne({ where: { email } });
      if (!staffUser) {
        await User.create({
          id: uuidv4(),
          email,
          password: adminPassword,
          firstName: staff.firstName,
          lastName: staff.lastName,
          phone: generatePhone(),
          userType: 'player', // Staff are regular users with establishment roles
          isVerified: true,
          status: 'active'
        });
        console.log(`✅ Staff user created: ${email}`);
      } else {
        console.log(`ℹ️ Staff user already exists: ${email}`);
      }
    }

    // 3. Create establishment
    console.log('\nCreating establishment...');
    let establishment = await Establishment.findOne({ 
      where: { name: 'Club Juventus Padel' } 
    });
    
    if (!establishment) {
      establishment = await Establishment.create({
        id: uuidv4(),
        userId: adminUser.id,
        name: 'Club Juventus Padel',
        description: 'El mejor club de padel de la zona. Contamos con 4 canchas profesionales, vestuarios completos, estacionamiento y cafetería. Clases para todos los niveles.',
        address: 'Av. del Libertador 4500',
        city: 'Buenos Aires',
        province: 'Buenos Aires',
        country: 'Argentina',
        postalCode: '1426',
        phone: '+54 11 4555-1234',
        email: 'info@clubjuventuspadel.com',
        website: 'https://clubjuventuspadel.com',
        openingTime: '08:00',
        closingTime: '23:00',
        amenities: ['parking', 'showers', 'lockers', 'cafeteria', 'wifi', 'pro_shop'],
        sports: ['padel'],
        isActive: true,
        isVerified: true
      });
      console.log('✅ Establishment created: Club Juventus Padel');
    } else {
      console.log('ℹ️ Establishment already exists');
    }

    // 4. Create 4 paddle courts
    console.log('\nCreating courts...');
    const courtData = [
      { name: 'Cancha Central', surface: 'synthetic', isIndoor: true, pricePerHour: 18000 },
      { name: 'Cancha Norte', surface: 'synthetic', isIndoor: true, pricePerHour: 16000 },
      { name: 'Cancha Sur', surface: 'synthetic', isIndoor: false, pricePerHour: 14000 },
      { name: 'Cancha Este', surface: 'synthetic', isIndoor: false, pricePerHour: 14000 }
    ];

    const courts = [];
    for (const court of courtData) {
      let existingCourt = await Court.findOne({ 
        where: { establishmentId: establishment.id, name: court.name } 
      });
      
      if (!existingCourt) {
        existingCourt = await Court.create({
          id: uuidv4(),
          establishmentId: establishment.id,
          name: court.name,
          sport: 'padel',
          surface: court.surface,
          isIndoor: court.isIndoor,
          hasLighting: true,
          capacity: 4,
          pricePerHour: court.pricePerHour,
          pricePerHour90: Math.round(court.pricePerHour * 1.4),
          pricePerHour120: Math.round(court.pricePerHour * 1.8),
          isActive: true,
          description: court.isIndoor ? 'Cancha techada con iluminación LED' : 'Cancha al aire libre con iluminación nocturna'
        });
        console.log(`✅ Court created: ${court.name}`);
      } else {
        console.log(`ℹ️ Court already exists: ${court.name}`);
      }
      courts.push(existingCourt);
    }

    // 5. Create clients
    console.log('\nCreating clients...');
    const clients = [];
    for (const name of clientNames) {
      let client = await Client.findOne({
        where: { establishmentId: establishment.id, name }
      });
      
      if (!client) {
        client = await Client.create({
          id: uuidv4(),
          establishmentId: establishment.id,
          name,
          phone: generatePhone(),
          email: generateEmail(name),
          totalBookings: 0,
          noShows: Math.random() < 0.1 ? Math.floor(Math.random() * 3) : 0,
          isActive: true
        });
      }
      clients.push(client);
    }
    console.log(`✅ ${clients.length} clients ready`);

    // 6. Create bookings for December 2025
    console.log('\nCreating bookings for December 2025...');
    
    const timeSlots = [
      '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', 
      '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'
    ];
    
    // Peak hours have higher booking probability
    const peakHours = ['18:00', '19:00', '20:00', '21:00'];
    const morningHours = ['08:00', '09:00', '10:00'];
    
    let bookingsCreated = 0;
    let bookingsSkipped = 0;
    
    // December 2025: days 1-31
    for (let day = 1; day <= 31; day++) {
      const dateStr = `2025-12-${day.toString().padStart(2, '0')}`;
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay(); // 0 = Sunday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      for (const court of courts) {
        for (const time of timeSlots) {
          // Determine booking probability
          let probability = 0.3; // Base 30%
          
          if (isWeekend) probability += 0.25; // Weekends more busy
          if (peakHours.includes(time)) probability += 0.35; // Peak hours
          if (morningHours.includes(time) && !isWeekend) probability -= 0.15; // Mornings less busy on weekdays
          
          // Christmas week less busy
          if (day >= 24 && day <= 26) probability -= 0.3;
          
          // New Year's Eve
          if (day === 31) probability += 0.2;
          
          // Random decision
          if (Math.random() > probability) {
            bookingsSkipped++;
            continue;
          }
          
          // Check if slot already booked
          const existingBooking = await Booking.findOne({
            where: {
              courtId: court.id,
              date: dateStr,
              startTime: time
            }
          });
          
          if (existingBooking) {
            continue;
          }
          
          // Select random client
          const client = clients[Math.floor(Math.random() * clients.length)];
          
          // Duration: 60, 90, or 120 minutes
          const durations = [60, 60, 60, 90, 90, 120]; // 60 min most common
          const duration = durations[Math.floor(Math.random() * durations.length)];
          
          // Calculate end time
          const [hours, mins] = time.split(':').map(Number);
          const endMinutes = hours * 60 + mins + duration;
          const endHours = Math.floor(endMinutes / 60);
          const endMins = endMinutes % 60;
          const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
          
          // Skip if end time is after closing
          if (endHours >= 23) continue;
          
          // Calculate price
          let price = court.pricePerHour;
          if (duration === 90) price = court.pricePerHour90 || court.pricePerHour * 1.4;
          if (duration === 120) price = court.pricePerHour120 || court.pricePerHour * 1.8;
          
          // Status: past dates are completed, future are confirmed/pending
          const today = new Date();
          const bookingDate = new Date(dateStr);
          let status = 'confirmed';
          let paymentStatus = 'pending';
          if (bookingDate < today) {
            status = Math.random() < 0.9 ? 'completed' : 'cancelled';
            paymentStatus = status === 'completed' ? 'completed' : 'pending';
          } else {
            status = Math.random() < 0.8 ? 'confirmed' : 'pending';
            paymentStatus = Math.random() < 0.5 ? 'completed' : 'pending';
          }
          
          // Some bookings are recurring (fixed)
          const isRecurring = Math.random() < 0.15; // 15% are fixed
          
          try {
            await Booking.create({
              id: uuidv4(),
              userId: adminUser.id,
              establishmentId: establishment.id,
              courtId: court.id,
              date: dateStr,
              startTime: time,
              endTime: endTime,
              duration,
              totalAmount: price,
              status,
              paymentStatus,
              clientName: client.name,
              clientPhone: client.phone,
              clientEmail: client.email,
              isRecurring,
              bookingType: isRecurring ? 'abonado' : 'normal',
              notes: isRecurring ? 'Turno fijo semanal' : null
            });
            
            bookingsCreated++;
            
            // Update client stats
            await client.increment('totalBookings');
            
          } catch (err) {
            console.error(`Error creating booking: ${err.message}`);
          }
        }
      }
      
      // Progress indicator
      if (day % 5 === 0) {
        console.log(`  📅 Processed day ${day}/31...`);
      }
    }
    
    console.log(`\n✅ Created ${bookingsCreated} bookings`);
    console.log(`ℹ️ Skipped ${bookingsSkipped} slots (left empty)`);

    // 7. Summary
    console.log('\n========================================');
    console.log('🎉 SEED COMPLETED SUCCESSFULLY!');
    console.log('========================================\n');
    console.log('📧 Login credentials:');
    console.log('   Admin: juventus@miscanchas.com / Juventus@2001');
    console.log('   Staff: juventus_gerente@miscanchas.com / Juventus@2001');
    console.log('   Staff: juventus_recepcionista@miscanchas.com / Juventus@2001');
    console.log('   Staff: juventus_mantenimiento@miscanchas.com / Juventus@2001');
    console.log('   Staff: juventus_instructor@miscanchas.com / Juventus@2001');
    console.log('\n🏟️ Establishment: Club Juventus Padel');
    console.log(`📊 Courts: ${courts.length}`);
    console.log(`👥 Clients: ${clients.length}`);
    console.log(`📅 Bookings: ${bookingsCreated}`);
    console.log('========================================\n');

    process.exit(0);
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

// Run the seed
seedJuventus();
