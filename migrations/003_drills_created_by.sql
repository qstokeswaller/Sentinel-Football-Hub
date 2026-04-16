-- ============================================================
-- Migration 003: Add created_by column to drills table
-- Tracks which user created each drill (for metrics/attribution).
-- ============================================================

ALTER TABLE drills ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
