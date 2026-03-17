-- ============================================================
-- ATUALIZAÇÃO v3 — Execute no Supabase SQL Editor
-- Adiciona campos de rastreamento de origem no Caixa
-- ============================================================

-- Campos para identificar de onde veio o lançamento no caixa
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS origem_id     UUID;
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS origem_tabela TEXT;

-- Campo conta nas compras
ALTER TABLE compras ADD COLUMN IF NOT EXISTS conta_id UUID;

-- Campo conta nas receitas e despesas
ALTER TABLE receitas  ADD COLUMN IF NOT EXISTS conta_id UUID;
ALTER TABLE despesas  ADD COLUMN IF NOT EXISTS conta_id UUID;
