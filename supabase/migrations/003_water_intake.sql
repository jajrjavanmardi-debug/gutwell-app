-- Add water_intake column to check_ins
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS water_intake INTEGER DEFAULT 0;
