-- ============================================================
-- ATUALIZAÇÃO v16 — Execute no Supabase SQL Editor
-- Tabela de Entradas de Estoque (NF-e)
-- ============================================================

CREATE TABLE IF NOT EXISTS entradas_estoque (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_nf      TEXT,
  fornecedor_id  UUID,
  fornecedor_nome TEXT,
  data_emissao   DATE,
  chave_nfe      TEXT,
  total          NUMERIC(12,2),
  obs            TEXT,
  itens          JSONB,  -- snapshot dos itens no momento da entrada
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE entradas_estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_familia" ON entradas_estoque FOR ALL USING (true) WITH CHECK (true);

-- Remove coluna itens_compra da tabela compras (era só JSON solto, 
-- agora o estoque é gerenciado pela Entrada de Estoque)
-- Opcional: comente se quiser manter por segurança
-- ALTER TABLE compras DROP COLUMN IF EXISTS itens_compra;
