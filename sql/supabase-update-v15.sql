-- ============================================================
-- ATUALIZAÇÃO v15 — Execute no Supabase SQL Editor
-- Centro de Custo + Itens de Compra + campos novos
-- ============================================================

-- Centros de Custo
CREATE TABLE IF NOT EXISTS centros_custo (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      TEXT NOT NULL,
  descricao TEXT,
  ativo     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_familia" ON centros_custo FOR ALL USING (true) WITH CHECK (true);

-- Vincula centro de custo às receitas e despesas
ALTER TABLE receitas  ADD COLUMN IF NOT EXISTS centro_custo_id UUID;
ALTER TABLE despesas  ADD COLUMN IF NOT EXISTS centro_custo_id UUID;

-- Itens de compra (JSON para estoque)
ALTER TABLE compras ADD COLUMN IF NOT EXISTS itens_compra JSONB;
