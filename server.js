const app = require('./src/app');
const { startScheduler } = require('./src/services/bookingScheduler');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  
  // Start the booking scheduler for automatic no-show marking
  startScheduler();
});
