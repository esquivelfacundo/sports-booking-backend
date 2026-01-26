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
const TournamentParticipant = require('./TournamentParticipant')(sequelize, DataTypes);
const Client = require('./Client')(sequelize, DataTypes);
const EstablishmentStaff = require('./EstablishmentStaff')(sequelize, DataTypes);
const ClientDebt = require('./ClientDebt')(sequelize, DataTypes);
const BookingPayment = require('./BookingPayment')(sequelize, DataTypes);
const PlatformConfig = require('./PlatformConfig');
const ProductCategory = require('./ProductCategory')(sequelize, DataTypes);
const Product = require('./Product')(sequelize, DataTypes);
const StockMovement = require('./StockMovement')(sequelize, DataTypes);
const Supplier = require('./Supplier')(sequelize, DataTypes);
const BookingConsumption = require('./BookingConsumption')(sequelize, DataTypes);
const Order = require('./Order')(sequelize, DataTypes);
const OrderItem = require('./OrderItem')(sequelize, DataTypes);
const OrderPayment = require('./OrderPayment')(sequelize, DataTypes);
const PaymentMethod = require('./PaymentMethod')(sequelize, DataTypes);
const ExpenseCategory = require('./ExpenseCategory')(sequelize, DataTypes);
const CashRegister = require('./CashRegister')(sequelize, DataTypes);
const CashRegisterMovement = require('./CashRegisterMovement')(sequelize, DataTypes);
const CurrentAccount = require('./CurrentAccount')(sequelize, DataTypes);
const CurrentAccountMovement = require('./CurrentAccountMovement')(sequelize, DataTypes);
const Amenity = require('./Amenity')(sequelize, DataTypes);
const EstablishmentIntegration = require('./EstablishmentIntegration')(sequelize, DataTypes);
const Coupon = require('./Coupon')(sequelize, DataTypes);
const CouponUsage = require('./CouponUsage')(sequelize, DataTypes);
const RecurringBookingGroup = require('./RecurringBookingGroup')(sequelize, DataTypes);
const CourtPriceSchedule = require('./CourtPriceSchedule')(sequelize, DataTypes);
const Expense = require('./Expense')(sequelize, DataTypes);

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
  Establishment.hasMany(Client, { foreignKey: 'establishmentId', as: 'clients' });
  Establishment.hasMany(EstablishmentStaff, { foreignKey: 'establishmentId', as: 'staff' });
  Establishment.hasMany(PaymentMethod, { foreignKey: 'establishmentId', as: 'paymentMethods' });
  Establishment.hasMany(Amenity, { foreignKey: 'establishmentId', as: 'amenitiesBookable' });

  // Amenity associations
  Amenity.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Amenity.hasMany(Booking, { foreignKey: 'amenityId', as: 'bookings' });

  // EstablishmentIntegration associations
  EstablishmentIntegration.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  EstablishmentIntegration.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
  EstablishmentIntegration.belongsTo(User, { foreignKey: 'updatedById', as: 'updatedBy' });
  Establishment.hasMany(EstablishmentIntegration, { foreignKey: 'establishmentId', as: 'integrations' });

  // PaymentMethod associations
  PaymentMethod.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });

  // Client associations
  Client.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });

  // EstablishmentStaff associations
  EstablishmentStaff.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });

  // Court associations
  Court.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Court.hasMany(TimeSlot, { foreignKey: 'courtId', as: 'timeSlots' });
  Court.hasMany(Booking, { foreignKey: 'courtId', as: 'bookings' });
  Court.hasMany(Review, { foreignKey: 'courtId', as: 'reviews' });
  Court.hasMany(AvailableMatch, { foreignKey: 'courtId', as: 'matches' });
  Court.hasMany(CourtPriceSchedule, { foreignKey: 'courtId', as: 'priceSchedules' });

  // CourtPriceSchedule associations
  CourtPriceSchedule.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });

  // TimeSlot associations
  TimeSlot.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });

  // Booking associations
  Booking.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Booking.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });
  Booking.belongsTo(Amenity, { foreignKey: 'amenityId', as: 'amenity' });
  Booking.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Booking.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Booking.hasMany(Payment, { foreignKey: 'bookingId', as: 'payments' });
  Booking.hasMany(BookingPayment, { foreignKey: 'bookingId', as: 'bookingPayments' });
  Booking.hasOne(SplitPayment, { foreignKey: 'bookingId', as: 'splitPayment' });
  Booking.hasMany(Review, { foreignKey: 'bookingId', as: 'reviews' });
  Booking.hasMany(BookingConsumption, { foreignKey: 'bookingId', as: 'consumptions' });
  
  // BookingPayment associations
  BookingPayment.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
  BookingPayment.belongsTo(User, { foreignKey: 'registeredBy', as: 'registeredByUser' });
  
  // Client associations
  Client.hasMany(Booking, { foreignKey: 'clientId', as: 'bookings' });
  Client.hasMany(ClientDebt, { foreignKey: 'clientId', as: 'debts' });

  // ClientDebt associations
  ClientDebt.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  ClientDebt.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  ClientDebt.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  ClientDebt.belongsTo(Booking, { foreignKey: 'bookingId', as: 'originBooking' });
  ClientDebt.belongsTo(Booking, { foreignKey: 'paidBookingId', as: 'paidInBooking' });
  Establishment.hasMany(ClientDebt, { foreignKey: 'establishmentId', as: 'clientDebts' });

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
  Tournament.hasMany(TournamentParticipant, { foreignKey: 'tournamentId', as: 'participants' });

  // TournamentParticipant associations
  TournamentParticipant.belongsTo(Tournament, { foreignKey: 'tournamentId', as: 'tournament' });
  TournamentParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(TournamentParticipant, { foreignKey: 'userId', as: 'tournamentParticipations' });

  // Stock management associations
  // ProductCategory associations
  ProductCategory.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  ProductCategory.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
  Establishment.hasMany(ProductCategory, { foreignKey: 'establishmentId', as: 'productCategories' });

  // Product associations
  Product.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Product.belongsTo(ProductCategory, { foreignKey: 'categoryId', as: 'category' });
  Product.hasMany(StockMovement, { foreignKey: 'productId', as: 'movements' });
  Establishment.hasMany(Product, { foreignKey: 'establishmentId', as: 'products' });

  // StockMovement associations
  StockMovement.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  StockMovement.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  StockMovement.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(StockMovement, { foreignKey: 'userId', as: 'stockMovements' });
  Establishment.hasMany(StockMovement, { foreignKey: 'establishmentId', as: 'stockMovements' });

  // Supplier associations
  Supplier.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Establishment.hasMany(Supplier, { foreignKey: 'establishmentId', as: 'suppliers' });

  // BookingConsumption associations
  BookingConsumption.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
  BookingConsumption.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  BookingConsumption.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  BookingConsumption.belongsTo(User, { foreignKey: 'addedBy', as: 'addedByUser' });
  BookingConsumption.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  Product.hasMany(BookingConsumption, { foreignKey: 'productId', as: 'consumptions' });
  User.hasMany(BookingConsumption, { foreignKey: 'addedBy', as: 'addedConsumptions' });
  Establishment.hasMany(BookingConsumption, { foreignKey: 'establishmentId', as: 'bookingConsumptions' });

  // Order associations
  Order.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Order.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
  Order.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Order.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });
  Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
  Order.hasMany(OrderPayment, { foreignKey: 'orderId', as: 'payments' });
  Order.hasMany(BookingConsumption, { foreignKey: 'orderId', as: 'consumptions' });
  Establishment.hasMany(Order, { foreignKey: 'establishmentId', as: 'orders' });
  Booking.hasMany(Order, { foreignKey: 'bookingId', as: 'orders' });
  Client.hasMany(Order, { foreignKey: 'clientId', as: 'orders' });
  User.hasMany(Order, { foreignKey: 'createdBy', as: 'createdOrders' });

  // OrderItem associations
  OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  Product.hasMany(OrderItem, { foreignKey: 'productId', as: 'orderItems' });

  // OrderPayment associations
  OrderPayment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  OrderPayment.belongsTo(User, { foreignKey: 'registeredBy', as: 'registeredByUser' });
  User.hasMany(OrderPayment, { foreignKey: 'registeredBy', as: 'registeredOrderPayments' });

  // ExpenseCategory associations
  ExpenseCategory.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Establishment.hasMany(ExpenseCategory, { foreignKey: 'establishmentId', as: 'expenseCategories' });

  // CashRegister associations
  CashRegister.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  CashRegister.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Establishment.hasMany(CashRegister, { foreignKey: 'establishmentId', as: 'cashRegisters' });
  User.hasMany(CashRegister, { foreignKey: 'userId', as: 'cashRegisters' });

  // CashRegisterMovement associations
  CashRegisterMovement.belongsTo(CashRegister, { foreignKey: 'cashRegisterId', as: 'cashRegister' });
  CashRegisterMovement.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  CashRegisterMovement.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  CashRegisterMovement.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
  CashRegisterMovement.belongsTo(ExpenseCategory, { foreignKey: 'expenseCategoryId', as: 'expenseCategory' });
  CashRegisterMovement.belongsTo(User, { foreignKey: 'registeredBy', as: 'registeredByUser' });
  CashRegister.hasMany(CashRegisterMovement, { foreignKey: 'cashRegisterId', as: 'movements' });
  User.hasMany(CashRegisterMovement, { foreignKey: 'registeredBy', as: 'cashRegisterMovements' });

  // CurrentAccount associations
  CurrentAccount.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  CurrentAccount.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  CurrentAccount.belongsTo(EstablishmentStaff, { foreignKey: 'staffId', as: 'staff' });
  CurrentAccount.hasMany(CurrentAccountMovement, { foreignKey: 'currentAccountId', as: 'movements' });
  Establishment.hasMany(CurrentAccount, { foreignKey: 'establishmentId', as: 'currentAccounts' });
  Client.hasOne(CurrentAccount, { foreignKey: 'clientId', as: 'currentAccount' });
  EstablishmentStaff.hasOne(CurrentAccount, { foreignKey: 'staffId', as: 'currentAccount' });

  // CurrentAccountMovement associations
  CurrentAccountMovement.belongsTo(CurrentAccount, { foreignKey: 'currentAccountId', as: 'currentAccount' });
  CurrentAccountMovement.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  CurrentAccountMovement.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
  CurrentAccountMovement.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
  CurrentAccountMovement.belongsTo(User, { foreignKey: 'registeredBy', as: 'registeredByUser' });
  User.hasMany(CurrentAccountMovement, { foreignKey: 'registeredBy', as: 'currentAccountMovements' });
  Order.hasMany(CurrentAccountMovement, { foreignKey: 'orderId', as: 'currentAccountMovements' });

  // Coupon associations
  Coupon.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Establishment.hasMany(Coupon, { foreignKey: 'establishmentId', as: 'coupons' });
  
  CouponUsage.belongsTo(Coupon, { foreignKey: 'couponId', as: 'coupon' });
  CouponUsage.belongsTo(Booking, { foreignKey: 'bookingId', as: 'booking' });
  CouponUsage.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  CouponUsage.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Coupon.hasMany(CouponUsage, { foreignKey: 'couponId', as: 'usages' });
  Booking.hasMany(CouponUsage, { foreignKey: 'bookingId', as: 'couponUsages' });

  // RecurringBookingGroup associations
  RecurringBookingGroup.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  RecurringBookingGroup.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  RecurringBookingGroup.belongsTo(Court, { foreignKey: 'courtId', as: 'primaryCourt' });
  RecurringBookingGroup.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });
  RecurringBookingGroup.hasMany(Booking, { foreignKey: 'recurringGroupId', as: 'bookings' });
  Establishment.hasMany(RecurringBookingGroup, { foreignKey: 'establishmentId', as: 'recurringBookingGroups' });
  Client.hasMany(RecurringBookingGroup, { foreignKey: 'clientId', as: 'recurringBookingGroups' });
  Court.hasMany(RecurringBookingGroup, { foreignKey: 'courtId', as: 'recurringBookingGroups' });
  Booking.belongsTo(RecurringBookingGroup, { foreignKey: 'recurringGroupId', as: 'recurringGroup' });

  // Expense associations
  Expense.belongsTo(Establishment, { foreignKey: 'establishmentId', as: 'establishment' });
  Expense.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Expense.belongsTo(CashRegister, { foreignKey: 'cashRegisterId', as: 'cashRegister' });
  Establishment.hasMany(Expense, { foreignKey: 'establishmentId', as: 'expenses' });
  User.hasMany(Expense, { foreignKey: 'userId', as: 'expenses' });
  CashRegister.hasMany(Expense, { foreignKey: 'cashRegisterId', as: 'expenses' });
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
  Tournament,
  TournamentParticipant,
  Client,
  EstablishmentStaff,
  ClientDebt,
  BookingPayment,
  PlatformConfig,
  ProductCategory,
  Product,
  StockMovement,
  Supplier,
  BookingConsumption,
  Order,
  OrderItem,
  OrderPayment,
  PaymentMethod,
  ExpenseCategory,
  CashRegister,
  CashRegisterMovement,
  CurrentAccount,
  CurrentAccountMovement,
  Amenity,
  EstablishmentIntegration,
  Coupon,
  CouponUsage,
  RecurringBookingGroup,
  CourtPriceSchedule,
  Expense
};
