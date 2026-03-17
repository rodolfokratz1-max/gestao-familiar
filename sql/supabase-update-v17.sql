-- ============================================================
-- ATUALIZAÇÃO v17 — Execute no Supabase SQL Editor
-- Coluna gerou_financeiro na tabela entradas_estoque
-- ============================================================

ALTER TABLE entradas_estoque ADD COLUMN IF NOT EXISTS gerou_financeiro BOOLEAN DEFAULT FALSE;

-- Coluna origem_id/tabela na compras (para rastrear de onde veio)
ALTER TABLE compras ADD COLUMN IF NOT EXISTS origem_id    UUID;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS origem_tabela TEXT;
