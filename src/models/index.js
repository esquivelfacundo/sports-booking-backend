const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

// Import all models
const User = require('./User')(sequelize, DataTypes);
const Establishment = require('./Establishment')(sequelize, DataTypes);
const Court = require('./Court')(sequelize, DataTypes);
const TimeSlot = require('./TimeSlot')(sequelize, DataTypes);
const Booking = require('./Booking')(sequelize, DataTypes);
const Payment = require('./Payment')(sequelize, DataTypes);
const SplitPayment = require('./SplitPayment')(sequelize, DataTypes);
const SplitPaymentParticipant = require('./SplitPaymentParticipant')(sequelize, DataTypes);
const AvailableMatch = require('./AvailableMatch')(sequelize, DataTypes);
const MatchParticipant = require('./MatchParticipant')(sequelize, DataTypes);
const Review = require('./Review')(sequelize, DataTypes);
const Favorite = require('./Favorite')(sequelize, DataTypes);
const Notification = require('./Notification')(sequelize, DataTypes);
const Tournament = require('./Tournament')(sequelize, DataTypes);

// Define associations
const defineAssociations = () => {
  // User associations
  User.hasMany(Establishment, { foreignKey: 'userId', as: 'establishments' });
  User.hasMany(Booking, { foreignKey: 'userId', as: 'bookings' });
  User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
  User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });
  User.hasMany(Favorite, { foreignKey: 'userId', as: 'favorites' });
  User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
  User.hasMany(AvailableMatch, { foreignKey: 'organizerId', as: 'organizedMatches' });
  User.hasMany(MatchParticipant, { foreignKey: 'userId', as: 'matchParticipations' });
  User.hasMany(SplitPayment, { foreignKey: 'organizerId', as: 'organizedSplitPayments' });
  User.hasMany(SplitPaymentParticipant, { foreignKey: 'userId', as: 'splitPaymentParticipations' });

  // Establishment associations
  Establishment.belongsTo(User, { foreignKey: 'userId', as: 'owner' });
  Establishment.hasMany(Court, { foreignKey: 'establishmentId', as: 'courts' });
  Establishment.hasMany(Booking, { foreignKey: 'establishmentId', as: 'bookings' });
  Establishment.hasMany(Review, { foreignKey: 'establishmentId', as: 'reviews' });
  Establishment.hasMany(Favorite, { foreignKey: 'establishmentId', as: 'favorites' });
  Establishment.hasMany(AvailableMatch, { foreignKey: 'establishmentId', as: 'matches' });
  Establishment.hasMany(Tournament, { foreignKey: 'establishmentId', as: 'tournaments' });

  // Court associations
  Court.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Court.hasMany(TimeSlot, { foreignKey: 'courtId', as: 'timeSlots' });
  Court.hasMany(Booking, { foreignKey: 'courtId', as: 'bookings' });
  Court.hasMany(Review, { foreignKey: 'courtId', as: 'reviews' });
  Court.hasMany(AvailableMatch, { foreignKey: 'courtId', as: 'matches' });

  // TimeSlot associations
  TimeSlot.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });

  // Booking associations
  Booking.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Booking.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });
  Booking.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Booking.hasMany(Payment, { foreignKey: 'bookingId', as: 'payments' });
  Booking.hasOne(SplitPayment, { foreignKey: 'bookingId', as: 'splitPayment' });
  Booking.hasMany(Review, { foreignKey: 'bookingId', as: 'reviews' });

  // Payment associations
  Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Payment.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });

  // SplitPayment associations
  SplitPayment.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
  SplitPayment.belongsTo(User, { foreignKey: 'organizerId', as: 'organizer' });
  SplitPayment.hasMany(SplitPaymentParticipant, { foreignKey: 'splitPaymentId', as: 'participants' });

  // SplitPaymentParticipant associations
  SplitPaymentParticipant.belongsTo(SplitPayment, { foreignKey: 'splitPaymentId', as: 'splitPayment' });
  SplitPaymentParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // AvailableMatch associations
  AvailableMatch.belongsTo(User, { foreignKey: 'organizerId', as: 'organizer' });
  AvailableMatch.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });
  AvailableMatch.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  AvailableMatch.hasMany(MatchParticipant, { foreignKey: 'matchId', as: 'participants' });

  // MatchParticipant associations
  MatchParticipant.belongsTo(AvailableMatch, { foreignKey: 'matchId', as: 'match' });
  MatchParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Review associations
  Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Review.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Review.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });
  Review.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });

  // Favorite associations
  Favorite.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Favorite.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });

  // Notification associations
  Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Tournament associations
  Tournament.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Tournament.belongsTo(User, { foreignKey: 'organizerId', as: 'organizer' });
};

// Initialize associations
defineAssociations();

module.exports = {
  sequelize,
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
  Tournament
};
