'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add cancellation policy fields to establishments
    await queryInterface.addColumn('establishments', 'cancellationPolicy', {
      type: Sequelize.ENUM('full_refund', 'partial_refund', 'no_refund', 'credit'),
      defaultValue: 'partial_refund',
      allowNull: false,
      comment: 'Policy for refunds when booking is cancelled'
    });

    await queryInterface.addColumn('establishments', 'refundPercentage', {
      type: Sequelize.INTEGER,
      defaultValue: 50,
      allowNull: false,
      comment: 'Percentage of payment to refund (if cancellationPolicy is partial_refund)'
    });

    await queryInterface.addColumn('establishments', 'noShowPenalty', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: 'Whether to apply penalty when client does not show up'
    });

    await queryInterface.addColumn('establishments', 'noShowPenaltyType', {
      type: Sequelize.ENUM('full_charge', 'deposit_only', 'percentage'),
      defaultValue: 'deposit_only',
      allowNull: false,
      comment: 'Type of penalty for no-show'
    });

    await queryInterface.addColumn('establishments', 'noShowPenaltyPercentage', {
      type: Sequelize.INTEGER,
      defaultValue: 100,
      allowNull: false,
      comment: 'Percentage to charge for no-show (if noShowPenaltyType is percentage)'
    });

    await queryInterface.addColumn('establishments', 'depositPaymentDeadlineHours', {
      type: Sequelize.INTEGER,
      defaultValue: 2,
      allowNull: false,
      comment: 'Hours allowed to complete deposit payment before booking is cancelled'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('establishments', 'cancellationPolicy');
    await queryInterface.removeColumn('establishments', 'refundPercentage');
    await queryInterface.removeColumn('establishments', 'noShowPenalty');
    await queryInterface.removeColumn('establishments', 'noShowPenaltyType');
    await queryInterface.removeColumn('establishments', 'noShowPenaltyPercentage');
    await queryInterface.removeColumn('establishments', 'depositPaymentDeadlineHours');
    
    // Drop the ENUM types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_establishments_cancellationPolicy";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_establishments_noShowPenaltyType";');
  }
};
