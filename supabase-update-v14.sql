-- ============================================================
-- ATUALIZAÇÃO v14 — Execute no Supabase SQL Editor
-- Categorias de produtos + coluna margem
-- ============================================================

-- Tabela de categorias de produtos/serviços
CREATE TABLE IF NOT EXISTS produto_categorias (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      TEXT NOT NULL,
  tipo      TEXT DEFAULT 'ambos' CHECK (tipo IN ('produto','servico','ambos')),
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE produto_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_familia" ON produto_categorias FOR ALL USING (true) WITH CHECK (true);

-- Novas colunas na tabela produtos
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS categoria_id UUID;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS margem       NUMERIC(6,2);

-- Coluna categoria na tabela contas_pagar (para plano de contas)
ALTER TABLE contas_pagar   ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS categoria TEXT;
