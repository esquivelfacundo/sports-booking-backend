/**
 * API v1 - Endpoints para integración con WhatsApp Bot
 * Usa la infraestructura existente del sistema
 */

const express = require('express');
const router = express.Router();
const { Court, Booking, Establishment, Client } = require('../models');
const { Op } = require('sequelize');

// Middleware para autenticación por API Key
const authenticateApiKey = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'API Key requerida' }
    });
  }

  const apiKey = authHeader.substring(7);
  
  // Buscar establecimiento por API Key (guardada en settings o como campo)
  const establishment = await Establishment.findOne({
    where: { 
      apiKey: apiKey,
      isActive: true 
    }
  });

  if (!establishment) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'API Key inválida' }
    });
  }

  req.establishment = establishment;
  next();
};

/**
 * GET /api/v1/deportes
 * Obtener deportes disponibles del establecimiento
 */
router.get('/deportes', authenticateApiKey, async (req, res) => {
  try {
    const courts = await Court.findAll({
      where: { 
        establishmentId: req.establishment.id,
        isActive: true 
      },
      attributes: ['sport'],
      group: ['sport']
    });

    const deporteIcons = {
      'paddle': '🎾',
      'padel': '🎾',
      'tenis': '🎾',
      'tennis': '🎾',
      'futbol': '⚽',
      'futbol5': '⚽',
      'futbol7': '⚽',
      'futbol11': '⚽',
      'basketball': '🏀',
      'basquet': '🏀',
      'voley': '🏐',
      'volleyball': '🏐'
    };

    const deportes = courts.map(c => ({
      id: c.sport.toLowerCase().replace(/\s+/g, ''),
      nombre: c.sport,
      icono: deporteIcons[c.sport.toLowerCase()] || '🏟️'
    }));

    res.json({
      success: true,
      deportes
    });
  } catch (error) {
    console.error('Error getting deportes:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al obtener deportes' }
    });
  }
});

/**
 * GET /api/v1/disponibilidad
 * Consultar disponibilidad de canchas
 */
router.get('/disponibilidad', authenticateApiKey, async (req, res) => {
  try {
    const { fecha, deporte, hora_inicio, duracion = 60 } = req.query;

    if (!fecha || !deporte) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'fecha y deporte son requeridos' }
      });
    }

    // Obtener canchas del deporte
    const courts = await Court.findAll({
      where: {
        establishmentId: req.establishment.id,
        sport: { [Op.iLike]: `%${deporte}%` },
        isActive: true
      }
    });

    if (courts.length === 0) {
      return res.json({
        success: true,
        fecha,
        deporte,
        canchas_disponibles: [],
        alternativas: []
      });
    }

    // Obtener reservas existentes para la fecha
    const existingBookings = await Booking.findAll({
      where: {
        courtId: { [Op.in]: courts.map(c => c.id) },
        date: fecha,
        status: { [Op.in]: ['pending', 'confirmed'] }
      },
      attributes: ['courtId', 'startTime', 'endTime']
    });

    // Obtener horarios de apertura
    const dayOfWeek = new Date(fecha + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const openingHours = req.establishment.openingHours?.[dayOfWeek];

    if (!openingHours || openingHours.closed) {
      return res.json({
        success: true,
        fecha,
        deporte,
        canchas_disponibles: [],
        mensaje: 'Establecimiento cerrado este día'
      });
    }

    const canchasDisponibles = [];

    for (const court of courts) {
      const courtBookings = existingBookings.filter(b => b.courtId === court.id);
      const horariosDisponibles = generateAvailableSlots(
        openingHours.open,
        openingHours.close,
        courtBookings,
        parseInt(duracion),
        hora_inicio
      );

      if (horariosDisponibles.length > 0) {
        canchasDisponibles.push({
          id: court.id,
          nombre: court.name,
          tipo: court.isIndoor ? 'techada' : 'descubierta',
          horarios_disponibles: horariosDisponibles,
          precio_hora: court.pricePerHour,
          precio_hora_y_media: court.pricePerHour90 || Math.round(court.pricePerHour * 1.4),
          precio_dos_horas: court.pricePerHour120 || Math.round(court.pricePerHour * 1.8)
        });
      }
    }

    res.json({
      success: true,
      fecha,
      deporte,
      canchas_disponibles: canchasDisponibles
    });

  } catch (error) {
    console.error('Error getting disponibilidad:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al consultar disponibilidad' }
    });
  }
});

/**
 * POST /api/v1/reservas/pre-crear
 * Pre-crear reserva (bloqueo temporal)
 */
router.post('/reservas/pre-crear', authenticateApiKey, async (req, res) => {
  try {
    const { cancha_id, fecha, hora_inicio, duracion, cliente, origen } = req.body;

    if (!cancha_id || !fecha || !hora_inicio || !duracion || !cliente) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'Faltan parámetros requeridos' }
      });
    }

    // Verificar que la cancha existe
    const court = await Court.findOne({
      where: { id: cancha_id, establishmentId: req.establishment.id, isActive: true }
    });

    if (!court) {
      return res.status(404).json({
        success: false,
        error: { code: 'CANCHA_NOT_FOUND', message: 'Cancha no encontrada' }
      });
    }

    // Calcular hora fin
    const [hours, minutes] = hora_inicio.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + duracion;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    const hora_fin = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

    // Verificar disponibilidad
    const existingBooking = await Booking.findOne({
      where: {
        courtId: cancha_id,
        date: fecha,
        status: { [Op.in]: ['pending', 'confirmed'] },
        [Op.or]: [
          { startTime: { [Op.between]: [hora_inicio, hora_fin] } },
          { endTime: { [Op.between]: [hora_inicio, hora_fin] } },
          {
            [Op.and]: [
              { startTime: { [Op.lte]: hora_inicio } },
              { endTime: { [Op.gte]: hora_fin } }
            ]
          }
        ]
      }
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        error: { code: 'SLOT_NOT_AVAILABLE', message: 'El horario seleccionado ya no está disponible' }
      });
    }

    // Calcular precio
    let precio = court.pricePerHour;
    if (duracion === 90 && court.pricePerHour90) {
      precio = court.pricePerHour90;
    } else if (duracion === 120 && court.pricePerHour120) {
      precio = court.pricePerHour120;
    } else {
      precio = Math.round(court.pricePerHour * (duracion / 60));
    }

    // Calcular seña (33% por defecto)
    const senaPercent = req.establishment.depositPercent || 33;
    const sena = Math.round(precio * (senaPercent / 100));

    // Buscar o crear cliente
    let clientRecord = await Client.findOne({
      where: {
        establishmentId: req.establishment.id,
        phone: cliente.telefono
      }
    });

    if (!clientRecord) {
      clientRecord = await Client.create({
        establishmentId: req.establishment.id,
        name: cliente.nombre,
        phone: cliente.telefono,
        email: cliente.email || null
      });
    }

    // Crear reserva pendiente
    const booking = await Booking.create({
      establishmentId: req.establishment.id,
      courtId: cancha_id,
      clientId: clientRecord.id,
      clientName: cliente.nombre,
      clientPhone: cliente.telefono,
      clientEmail: cliente.email || null,
      date: fecha,
      startTime: hora_inicio,
      endTime: hora_fin,
      duration: duracion,
      totalAmount: precio,
      depositAmount: sena,
      depositPercent: senaPercent,
      status: 'pending',
      paymentStatus: 'pending',
      bookingType: 'regular',
      notes: origen ? `Origen: ${origen}` : null
    });

    res.status(201).json({
      success: true,
      reserva_id: booking.id,
      estado: 'pendiente_pago',
      expira_en: 600,
      detalle: {
        cancha: court.name,
        fecha,
        hora_inicio,
        hora_fin,
        duracion,
        precio_total: precio,
        seña_requerida: sena
      }
    });

  } catch (error) {
    console.error('Error pre-creating reserva:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al crear reserva' }
    });
  }
});

/**
 * PUT /api/v1/reservas/:reserva_id/confirmar
 * Confirmar reserva después del pago
 */
router.put('/reservas/:reserva_id/confirmar', authenticateApiKey, async (req, res) => {
  try {
    const { reserva_id } = req.params;
    const { pago } = req.body;

    const booking = await Booking.findOne({
      where: { 
        id: reserva_id,
        establishmentId: req.establishment.id
      },
      include: [{ model: Court, as: 'court' }]
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: 'RESERVATION_NOT_FOUND', message: 'Reserva no encontrada' }
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: { code: 'RESERVATION_EXPIRED', message: 'La reserva fue cancelada o expiró' }
      });
    }

    // Actualizar reserva
    await booking.update({
      status: 'confirmed',
      paymentStatus: pago?.monto >= booking.totalAmount ? 'paid' : 'partial',
      mpPaymentId: pago?.id || null,
      depositMethod: pago?.metodo || 'mercadopago',
      initialDeposit: pago?.monto || booking.depositAmount,
      confirmedAt: new Date()
    });

    // Generar código de reserva
    const codigoReserva = `MC-${new Date().getFullYear()}-${booking.id.substring(0, 8).toUpperCase()}`;

    res.json({
      success: true,
      reserva_id: booking.id,
      estado: 'confirmada',
      codigo_reserva: codigoReserva,
      mensaje: 'Reserva confirmada exitosamente'
    });

  } catch (error) {
    console.error('Error confirming reserva:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al confirmar reserva' }
    });
  }
});

/**
 * DELETE /api/v1/reservas/:reserva_id
 * Cancelar reserva
 */
router.delete('/reservas/:reserva_id', authenticateApiKey, async (req, res) => {
  try {
    const { reserva_id } = req.params;

    const booking = await Booking.findOne({
      where: { 
        id: reserva_id,
        establishmentId: req.establishment.id
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: { code: 'RESERVATION_NOT_FOUND', message: 'Reserva no encontrada' }
      });
    }

    await booking.update({
      status: 'cancelled',
      cancellationReason: 'Cancelada via API',
      cancelledAt: new Date()
    });

    res.json({
      success: true,
      message: 'Reserva cancelada'
    });

  } catch (error) {
    console.error('Error cancelling reserva:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al cancelar reserva' }
    });
  }
});

/**
 * GET /api/v1/precios
 * Obtener precios de canchas
 */
router.get('/precios', authenticateApiKey, async (req, res) => {
  try {
    const { deporte, cancha_id } = req.query;

    const where = {
      establishmentId: req.establishment.id,
      isActive: true
    };

    if (deporte) {
      where.sport = { [Op.iLike]: `%${deporte}%` };
    }

    if (cancha_id) {
      where.id = cancha_id;
    }

    const courts = await Court.findAll({ where });

    const senaPercent = req.establishment.depositPercent || 33;

    const precios = courts.map(court => ({
      cancha_id: court.id,
      cancha_nombre: court.name,
      deporte: court.sport,
      precios: {
        '60': court.pricePerHour,
        '90': court.pricePerHour90 || Math.round(court.pricePerHour * 1.4),
        '120': court.pricePerHour120 || Math.round(court.pricePerHour * 1.8)
      },
      seña_porcentaje: senaPercent
    }));

    res.json({
      success: true,
      precios,
      seña_minima: req.establishment.minDeposit || 5000
    });

  } catch (error) {
    console.error('Error getting precios:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Error al obtener precios' }
    });
  }
});

// Helper function to generate available time slots
function generateAvailableSlots(openTime, closeTime, bookings, duration, specificHour = null) {
  const slots = [];
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  for (let time = openMinutes; time + duration <= closeMinutes; time += 30) {
    const hours = Math.floor(time / 60);
    const mins = time % 60;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    
    // Si se especificó hora específica, solo mostrar esa
    if (specificHour && timeStr !== specificHour) continue;

    const endTime = time + duration;
    const endHours = Math.floor(endTime / 60);
    const endMins = endTime % 60;
    const endTimeStr = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

    // Verificar si hay conflicto con reservas existentes
    const hasConflict = bookings.some(booking => {
      const [bStartH, bStartM] = booking.startTime.split(':').map(Number);
      const [bEndH, bEndM] = booking.endTime.split(':').map(Number);
      const bStart = bStartH * 60 + bStartM;
      const bEnd = bEndH * 60 + bEndM;
      
      return (time < bEnd && endTime > bStart);
    });

    if (!hasConflict) {
      // Calcular duraciones disponibles desde este horario
      const duraciones = [];
      for (const dur of [60, 90, 120]) {
        const potentialEnd = time + dur;
        if (potentialEnd <= closeMinutes) {
          const potentialEndStr = `${String(Math.floor(potentialEnd / 60)).padStart(2, '0')}:${String(potentialEnd % 60).padStart(2, '0')}`;
          const hasConflictForDur = bookings.some(booking => {
            const [bStartH, bStartM] = booking.startTime.split(':').map(Number);
            const [bEndH, bEndM] = booking.endTime.split(':').map(Number);
            const bStart = bStartH * 60 + bStartM;
            const bEnd = bEndH * 60 + bEndM;
            return (time < bEnd && potentialEnd > bStart);
          });
          if (!hasConflictForDur) {
            duraciones.push(dur);
          }
        }
      }
      
      if (duraciones.length > 0) {
        slots.push({
          hora: timeStr,
          duraciones
        });
      }
    }
  }

  return slots;
}

module.exports = router;
