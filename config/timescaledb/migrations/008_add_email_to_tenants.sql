-- Migration 015: Add email column to tenants table
-- Required by tenant-webhook service

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
