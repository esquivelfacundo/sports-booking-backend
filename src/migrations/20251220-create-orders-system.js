'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create orders table
    await queryInterface.createTable('orders', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      orderNumber: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
        field: 'orderNumber'
      },
      establishmentId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'establishments',
          key: 'id'
        },
        field: 'establishmentId'
      },
      // Optional: linked to a booking (for court consumptions)
      bookingId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'bookings',
          key: 'id'
        },
        onDelete: 'SET NULL',
        field: 'bookingId'
      },
      // Optional: linked to a client
      clientId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'clients',
          key: 'id'
        },
        onDelete: 'SET NULL',
        field: 'clientId'
      },
      // For walk-in customers without client record
      customerName: {
        type: Sequelize.STRING(255),
        allowNull: true,
        field: 'customerName'
      },
      customerPhone: {
        type: Sequelize.STRING(50),
        allowNull: true,
        field: 'customerPhone'
      },
      customerEmail: {
        type: Sequelize.STRING(255),
        allowNull: true,
        field: 'customerEmail'
      },
      // Order type: 'direct_sale' (venta directa) or 'booking_consumption' (consumo en reserva)
      orderType: {
        type: Sequelize.ENUM('direct_sale', 'booking_consumption'),
        allowNull: false,
        defaultValue: 'direct_sale',
        field: 'orderType'
      },
      // Order status
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'cancelled', 'refunded'),
        allowNull: false,
        defaultValue: 'pending',
        field: 'status'
      },
      // Payment status
      paymentStatus: {
        type: Sequelize.ENUM('pending', 'partial', 'paid', 'refunded'),
        allowNull: false,
        defaultValue: 'pending',
        field: 'paymentStatus'
      },
      // Payment method used
      paymentMethod: {
        type: Sequelize.ENUM('cash', 'card', 'transfer', 'mixed', 'pending'),
        allowNull: false,
        defaultValue: 'pending',
        field: 'paymentMethod'
      },
      // Totals
      subtotal: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      discount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      total: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      paidAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        field: 'paidAmount'
      },
      // Notes
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Who created the order
      createdBy: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        field: 'createdBy'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'createdAt'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'updatedAt'
      }
    });

    // Create order_items table
    await queryInterface.createTable('order_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      orderId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id'
        },
        onDelete: 'CASCADE',
        field: 'orderId'
      },
      productId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onDelete: 'RESTRICT',
        field: 'productId'
      },
      // Store product info at time of sale (in case product changes later)
      productName: {
        type: Sequelize.STRING(255),
        allowNull: false,
        field: 'productName'
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      unitPrice: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        field: 'unitPrice'
      },
      totalPrice: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        field: 'totalPrice'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'createdAt'
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'updatedAt'
      }
    });

    // Create order_payments table for tracking payments on orders
    await queryInterface.createTable('order_payments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      orderId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id'
        },
        onDelete: 'CASCADE',
        field: 'orderId'
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      paymentMethod: {
        type: Sequelize.ENUM('cash', 'card', 'transfer'),
        allowNull: false,
        field: 'paymentMethod'
      },
      reference: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      registeredBy: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        field: 'registeredBy'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        field: 'createdAt'
      }
    });

    // Add indexes
    await queryInterface.addIndex('orders', ['establishmentId']);
    await queryInterface.addIndex('orders', ['bookingId']);
    await queryInterface.addIndex('orders', ['clientId']);
    await queryInterface.addIndex('orders', ['orderNumber']);
    await queryInterface.addIndex('orders', ['status']);
    await queryInterface.addIndex('orders', ['paymentStatus']);
    await queryInterface.addIndex('orders', ['orderType']);
    await queryInterface.addIndex('orders', ['createdAt']);
    await queryInterface.addIndex('order_items', ['orderId']);
    await queryInterface.addIndex('order_items', ['productId']);
    await queryInterface.addIndex('order_payments', ['orderId']);

    // Add orderId column to booking_consumptions to link them to orders
    await queryInterface.addColumn('booking_consumptions', 'orderId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'orders',
        key: 'id'
      },
      onDelete: 'SET NULL',
      field: 'orderId'
    });

    await queryInterface.addIndex('booking_consumptions', ['orderId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('booking_consumptions', 'orderId');
    await queryInterface.dropTable('order_payments');
    await queryInterface.dropTable('order_items');
    await queryInterface.dropTable('orders');
  }
};
