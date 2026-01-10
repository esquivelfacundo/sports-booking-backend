-- Create court_price_schedules table
CREATE TABLE IF NOT EXISTS court_price_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "courtId" UUID NOT NULL REFERENCES courts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  "startTime" TIME NOT NULL,
  "endTime" TIME NOT NULL,
  "pricePerHour" DECIMAL(10, 2) NOT NULL,
  "daysOfWeek" JSONB DEFAULT '[0, 1, 2, 3, 4, 5, 6]',
  "isActive" BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS court_price_schedules_court_id ON court_price_schedules("courtId");
CREATE INDEX IF NOT EXISTS court_price_schedules_times ON court_price_schedules("startTime", "endTime");
CREATE INDEX IF NOT EXISTS court_price_schedules_active ON court_price_schedules("isActive");

-- Verify table was created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'court_price_schedules';
