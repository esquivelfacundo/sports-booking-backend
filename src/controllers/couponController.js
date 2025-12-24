const { Coupon, CouponUsage, Establishment, Booking, User, Client } = require('../models');
const { Op } = require('sequelize');

// Get all coupons for an establishment
const getEstablishmentCoupons = async (req, res) => {
  try {
    const { establishmentId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const offset = (page - 1) * limit;
    const where = { establishmentId };

    if (status === 'active') {
      where.isActive = true;
      where[Op.or] = [
        { endDate: null },
        { endDate: { [Op.gte]: new Date() } }
      ];
    } else if (status === 'expired') {
      where.endDate = { [Op.lt]: new Date() };
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const { count, rows: coupons } = await Coupon.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [{
        model: CouponUsage,
        as: 'usages',
        attributes: ['id', 'discountAmount', 'createdAt']
      }]
    });

    // Calculate stats for each coupon
    const couponsWithStats = coupons.map(coupon => {
      const couponData = coupon.toJSON();
      const totalDiscountGiven = couponData.usages?.reduce((sum, u) => sum + parseFloat(u.discountAmount || 0), 0) || 0;
      
      return {
        ...couponData,
        stats: {
          usageCount: couponData.usages?.length || 0,
          totalDiscountGiven,
          remainingUses: couponData.usageLimit ? couponData.usageLimit - (couponData.usages?.length || 0) : null
        },
        usages: undefined // Remove usages array from response
      };
    });

    res.json({
      success: true,
      data: couponsWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({
      error: 'Error fetching coupons',
      message: error.message
    });
  }
};

// Get single coupon by ID
const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByPk(id, {
      include: [{
        model: CouponUsage,
        as: 'usages',
        include: [
          { model: Booking, as: 'booking', attributes: ['id', 'date', 'startTime', 'totalAmount'] },
          { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] },
          { model: Client, as: 'client', attributes: ['id', 'name'] }
        ],
        order: [['createdAt', 'DESC']],
        limit: 50
      }]
    });

    if (!coupon) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      data: coupon
    });
  } catch (error) {
    console.error('Error fetching coupon:', error);
    res.status(500).json({
      error: 'Error fetching coupon',
      message: error.message
    });
  }
};

// Create a new coupon
const createCoupon = async (req, res) => {
  try {
    const {
      establishmentId,
      code,
      name,
      description,
      discountType,
      discountValue,
      maxDiscount,
      minPurchaseAmount,
      usageLimit,
      usageLimitPerUser,
      startDate,
      endDate,
      applicableCourts,
      applicableSports,
      applicableDays,
      applicableTimeSlots,
      newCustomersOnly,
      specificUsers,
      specificClients,
      excludeSaleItems,
      individualUseOnly
    } = req.body;

    // Validate required fields
    if (!code || !name || !discountType || discountValue === undefined) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Code, name, discountType, and discountValue are required'
      });
    }

    // Check if code already exists for this establishment
    const existingCoupon = await Coupon.findOne({
      where: { establishmentId, code: code.toUpperCase() }
    });

    if (existingCoupon) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A coupon with this code already exists'
      });
    }

    const coupon = await Coupon.create({
      establishmentId,
      code: code.toUpperCase(),
      name,
      description,
      discountType,
      discountValue,
      maxDiscount,
      minPurchaseAmount: minPurchaseAmount || 0,
      usageLimit,
      usageLimitPerUser: usageLimitPerUser || 1,
      startDate,
      endDate,
      applicableCourts: applicableCourts || [],
      applicableSports: applicableSports || [],
      applicableDays: applicableDays || [],
      applicableTimeSlots: applicableTimeSlots || [],
      newCustomersOnly: newCustomersOnly || false,
      specificUsers: specificUsers || [],
      specificClients: specificClients || [],
      excludeSaleItems: excludeSaleItems || false,
      individualUseOnly: individualUseOnly !== false,
      createdBy: req.user?.id
    });

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({
      error: 'Error creating coupon',
      message: error.message
    });
  }
};

// Update a coupon
const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const coupon = await Coupon.findByPk(id);

    if (!coupon) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Coupon not found'
      });
    }

    // If updating code, check for duplicates
    if (updates.code && updates.code.toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({
        where: { 
          establishmentId: coupon.establishmentId, 
          code: updates.code.toUpperCase(),
          id: { [Op.ne]: id }
        }
      });

      if (existingCoupon) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'A coupon with this code already exists'
        });
      }
      updates.code = updates.code.toUpperCase();
    }

    await coupon.update(updates);

    res.json({
      success: true,
      message: 'Coupon updated successfully',
      data: coupon
    });
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({
      error: 'Error updating coupon',
      message: error.message
    });
  }
};

// Delete a coupon
const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByPk(id);

    if (!coupon) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Coupon not found'
      });
    }

    // Check if coupon has been used
    const usageCount = await CouponUsage.count({ where: { couponId: id } });
    
    if (usageCount > 0) {
      // Soft delete by deactivating
      await coupon.update({ isActive: false });
      return res.json({
        success: true,
        message: 'Coupon deactivated (has usage history)'
      });
    }

    await coupon.destroy();

    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({
      error: 'Error deleting coupon',
      message: error.message
    });
  }
};

// Validate a coupon code (public endpoint for checkout)
const validateCoupon = async (req, res) => {
  try {
    const { code, establishmentId, bookingAmount, courtId, sportType, date, time, userId, clientId } = req.body;

    if (!code || !establishmentId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Code and establishmentId are required'
      });
    }

    const coupon = await Coupon.findOne({
      where: { 
        establishmentId, 
        code: code.toUpperCase(),
        isActive: true
      }
    });

    if (!coupon) {
      return res.status(404).json({
        error: 'Invalid coupon',
        message: 'Este cupón no existe o no es válido'
      });
    }

    const now = new Date();

    // Check date validity
    if (coupon.startDate && new Date(coupon.startDate) > now) {
      return res.status(400).json({
        error: 'Not yet valid',
        message: 'Este cupón aún no está activo'
      });
    }

    if (coupon.endDate && new Date(coupon.endDate) < now) {
      return res.status(400).json({
        error: 'Expired',
        message: 'Este cupón ha expirado'
      });
    }

    // Check usage limit
    if (coupon.usageLimit !== null) {
      const usageCount = await CouponUsage.count({ where: { couponId: coupon.id } });
      if (usageCount >= coupon.usageLimit) {
        return res.status(400).json({
          error: 'Limit reached',
          message: 'Este cupón ha alcanzado su límite de uso'
        });
      }
    }

    // Check per-user limit
    if (coupon.usageLimitPerUser && (userId || clientId)) {
      const userUsageCount = await CouponUsage.count({
        where: {
          couponId: coupon.id,
          [Op.or]: [
            userId ? { userId } : null,
            clientId ? { clientId } : null
          ].filter(Boolean)
        }
      });
      if (userUsageCount >= coupon.usageLimitPerUser) {
        return res.status(400).json({
          error: 'User limit reached',
          message: 'Ya has usado este cupón el máximo de veces permitido'
        });
      }
    }

    // Check minimum purchase amount
    if (coupon.minPurchaseAmount && bookingAmount < coupon.minPurchaseAmount) {
      return res.status(400).json({
        error: 'Minimum not met',
        message: `El monto mínimo para usar este cupón es $${coupon.minPurchaseAmount}`
      });
    }

    // Check applicable courts
    if (coupon.applicableCourts?.length > 0 && courtId) {
      if (!coupon.applicableCourts.includes(courtId)) {
        return res.status(400).json({
          error: 'Not applicable',
          message: 'Este cupón no es válido para esta cancha'
        });
      }
    }

    // Check applicable sports
    if (coupon.applicableSports?.length > 0 && sportType) {
      if (!coupon.applicableSports.includes(sportType)) {
        return res.status(400).json({
          error: 'Not applicable',
          message: 'Este cupón no es válido para este deporte'
        });
      }
    }

    // Check applicable days
    if (coupon.applicableDays?.length > 0 && date) {
      const bookingDay = new Date(date).getDay();
      if (!coupon.applicableDays.includes(bookingDay)) {
        return res.status(400).json({
          error: 'Not applicable',
          message: 'Este cupón no es válido para este día de la semana'
        });
      }
    }

    // Check new customers only
    if (coupon.newCustomersOnly && (userId || clientId)) {
      const previousBookings = await Booking.count({
        where: {
          establishmentId,
          status: { [Op.in]: ['confirmed', 'completed'] },
          [Op.or]: [
            userId ? { userId } : null,
            clientId ? { clientId } : null
          ].filter(Boolean)
        }
      });
      if (previousBookings > 0) {
        return res.status(400).json({
          error: 'New customers only',
          message: 'Este cupón es solo para nuevos clientes'
        });
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (bookingAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else if (coupon.discountType === 'fixed_amount') {
      discountAmount = Math.min(coupon.discountValue, bookingAmount);
    } else if (coupon.discountType === 'free_booking') {
      discountAmount = bookingAmount;
    }

    res.json({
      success: true,
      data: {
        couponId: coupon.id,
        code: coupon.code,
        name: coupon.name,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: Math.round(discountAmount * 100) / 100,
        finalAmount: Math.round((bookingAmount - discountAmount) * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({
      error: 'Error validating coupon',
      message: error.message
    });
  }
};

// Apply coupon to a booking (called when booking is confirmed)
const applyCoupon = async (req, res) => {
  try {
    const { couponId, bookingId, discountAmount, originalAmount, userId, clientId } = req.body;

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Coupon not found'
      });
    }

    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Booking not found'
      });
    }

    // Create usage record
    const usage = await CouponUsage.create({
      couponId,
      bookingId,
      userId,
      clientId,
      discountAmount,
      originalAmount
    });

    // Increment usage count
    await coupon.increment('usageCount');

    res.status(201).json({
      success: true,
      message: 'Coupon applied successfully',
      data: usage
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({
      error: 'Error applying coupon',
      message: error.message
    });
  }
};

// Get coupon statistics
const getCouponStats = async (req, res) => {
  try {
    const { establishmentId } = req.params;

    const totalCoupons = await Coupon.count({ where: { establishmentId } });
    const activeCoupons = await Coupon.count({ 
      where: { 
        establishmentId, 
        isActive: true,
        [Op.or]: [
          { endDate: null },
          { endDate: { [Op.gte]: new Date() } }
        ]
      } 
    });

    const totalUsages = await CouponUsage.count({
      include: [{
        model: Coupon,
        as: 'coupon',
        where: { establishmentId },
        attributes: []
      }]
    });

    const totalDiscountGiven = await CouponUsage.sum('discountAmount', {
      include: [{
        model: Coupon,
        as: 'coupon',
        where: { establishmentId },
        attributes: []
      }]
    });

    // Top coupons by usage
    const topCoupons = await Coupon.findAll({
      where: { establishmentId },
      attributes: ['id', 'code', 'name', 'usageCount'],
      order: [['usageCount', 'DESC']],
      limit: 5
    });

    res.json({
      success: true,
      data: {
        totalCoupons,
        activeCoupons,
        totalUsages,
        totalDiscountGiven: totalDiscountGiven || 0,
        topCoupons
      }
    });
  } catch (error) {
    console.error('Error fetching coupon stats:', error);
    res.status(500).json({
      error: 'Error fetching coupon statistics',
      message: error.message
    });
  }
};

module.exports = {
  getEstablishmentCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  applyCoupon,
  getCouponStats
};
