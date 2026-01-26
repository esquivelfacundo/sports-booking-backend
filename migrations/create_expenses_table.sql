-- Migration: Create expenses table
-- Date: 2026-01-26
-- Description: Creates the expenses table for tracking all expenses (from admin and cash registers)

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "establishmentId" UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  "cashRegisterId" UUID REFERENCES cash_registers(id) ON DELETE SET NULL,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  "paymentMethod" VARCHAR(50),
  "invoiceNumber" VARCHAR(100),
  supplier VARCHAR(200),
  notes TEXT,
  "expenseDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_expenses_establishment ON expenses("establishmentId");
CREATE INDEX IF NOT EXISTS idx_expenses_cash_register ON expenses("cashRegisterId");
CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses("userId");
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses("expenseDate");
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses("createdAt");

-- Add comment to table
COMMENT ON TABLE expenses IS 'Stores all expenses for establishments, both from administration and cash registers';
COMMENT ON COLUMN expenses."cashRegisterId" IS 'Optional reference to cash register if expense was made from a cash register';
COMMENT ON COLUMN expenses.category IS 'Category of expense (e.g., Servicios, Mantenimiento, Suministros, etc.)';
COMMENT ON COLUMN expenses."expenseDate" IS 'Date when the expense occurred';
