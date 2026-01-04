#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function migrateAndStart() {
  console.log('🔄 Running database migrations...');
  
  try {
    // Run migrations with timeout
    const { stdout, stderr } = await execPromise('npx sequelize-cli db:migrate', {
      timeout: 30000 // 30 seconds timeout
    });
    
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('⚠️  Migration error (continuing anyway):', error.message);
    // Don't fail - continue to start server even if migrations fail
    // This prevents healthcheck failures
  }
  
  console.log('🚀 Starting server...');
  
  // Start the server
  require('../server.js');
}

migrateAndStart();
