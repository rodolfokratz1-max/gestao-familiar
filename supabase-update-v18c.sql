-- ============================================================
-- ATUALIZAÇÃO v18c — Execute no Supabase SQL Editor
-- Margem padrão na empresa + colunas de endereço em pessoas
-- ============================================================

-- Margem padrão na empresa
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS margem_padrao NUMERIC(5,2);

-- Colunas de endereço em pessoas (para cadastro automático via NF-e)
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS logradouro  TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS numero      TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS bairro      TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS cidade      TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS estado      TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS cep         TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS ie          TEXT;

-- Coluna margem em produtos (para salvar a margem calculada)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS margem     NUMERIC(6,2);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS preco_venda NUMERIC(12,2);
