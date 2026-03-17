-- ============================================================
-- ATUALIZAÇÃO v18 — Execute no Supabase SQL Editor
-- Colunas faltando na tabela caixa
-- ============================================================

ALTER TABLE caixa ADD COLUMN IF NOT EXISTS forma_pgto    TEXT;
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS origem_id     UUID;
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS origem_tabela TEXT;

-- Também garante que pagamentos_parciais tem todas as colunas
ALTER TABLE pagamentos_parciais ADD COLUMN IF NOT EXISTS forma_pgto TEXT;
ALTER TABLE pagamentos_parciais ADD COLUMN IF NOT EXISTS obs        TEXT;
