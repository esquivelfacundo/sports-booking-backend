const fs = require('fs');
const path = require('path');

module.exports = {
  async up(queryInterface) {
    const sqlPath = path.join(__dirname, '../../migrations/create_arca_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await queryInterface.sequelize.query(sql);
  },

  async down() {
    // Irreversible: contains data tables and triggers.
    // We intentionally do not drop tables in down migration.
  }
};
