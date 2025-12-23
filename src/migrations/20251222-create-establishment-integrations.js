/**
 * Migration: Create establishment_integrations table
 * Stores integration configurations (OpenAI, WhatsApp) per establishment
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create ENUM type for integration types
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE integration_type AS ENUM ('OPENAI', 'WHATSAPP');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('establishment_integrations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      establishmentId: {
        type: Sequelize.UUID,
        allowNull: false,
        field: 'establishment_id',
        references: {
          model: 'establishments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.ENUM('OPENAI', 'WHATSAPP'),
        allowNull: false
      },
      encrypted_api_key: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      phone_number_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      business_account_id: {
        type: Sequelize.STRING,
        allowNull: true
      },
      verify_token: {
        type: Sequelize.STRING,
        allowNull: true
      },
      config: {
        type: Sequelize.JSON,
        defaultValue: {}
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      last_tested_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      last_test_success: {
        type: Sequelize.BOOLEAN,
        allowNull: true
      },
      created_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      updated_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add unique constraint for establishment + type
    await queryInterface.addIndex('establishment_integrations', ['establishment_id', 'type'], {
      unique: true,
      name: 'establishment_integrations_establishment_type_unique'
    });

    // Add index for establishment_id
    await queryInterface.addIndex('establishment_integrations', ['establishment_id'], {
      name: 'establishment_integrations_establishment_id'
    });

    // Add index for is_active
    await queryInterface.addIndex('establishment_integrations', ['is_active'], {
      name: 'establishment_integrations_is_active'
    });

    console.log('✅ Created establishment_integrations table');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('establishment_integrations');
    
    // Drop ENUM type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS integration_type;
    `);
    
    console.log('✅ Dropped establishment_integrations table');
  }
};
