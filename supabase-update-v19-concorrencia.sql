-- ============================================================
-- ATUALIZAÇÃO v19 — Proteção contra uso simultâneo
-- Execute no Supabase: SQL Editor > New query > Cole e execute
-- ============================================================

-- ── 1. UNIQUE em cpf_cnpj de pessoas ─────────────────────────
-- Impede que dois usuários cadastrem o mesmo fornecedor/cliente ao mesmo tempo.
-- Se já existirem CPF/CNPJs duplicados, rode primeiro:
--   DELETE FROM pessoas a USING pessoas b
--   WHERE a.id > b.id AND a.cpf_cnpj = b.cpf_cnpj AND a.cpf_cnpj IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pessoas_cpf_cnpj_unique
  ON pessoas (cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj <> '';

-- ── 2. UNIQUE em chave_nfe de entradas_estoque ────────────────
-- Impede que a mesma NF-e seja importada duas vezes (mesmo que dois usuários
-- cliquem em "Confirmar" ao mesmo tempo com a mesma nota).
ALTER TABLE entradas_estoque
  ADD COLUMN IF NOT EXISTS chave_nfe TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS entradas_chave_nfe_unique
  ON entradas_estoque (chave_nfe)
  WHERE chave_nfe IS NOT NULL AND chave_nfe <> '';

-- ── 3. UNIQUE em codigo de produtos ──────────────────────────
-- Garante que dois produtos não recebam o mesmo código sequencial.
CREATE UNIQUE INDEX IF NOT EXISTS produtos_codigo_unique
  ON produtos (codigo)
  WHERE codigo IS NOT NULL AND codigo <> '';

-- ── 4. Função RPC: incrementar_estoque (operação atômica) ─────
-- Faz UPDATE estoque = estoque + p_qtd em uma única instrução SQL,
-- eliminando o race condition de "read → calcular → write" no JavaScript.
CREATE OR REPLACE FUNCTION incrementar_estoque(
  p_produto_id  UUID,
  p_qtd         NUMERIC,
  p_preco_custo NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE produtos
  SET
    estoque    = estoque + p_qtd,
    preco_custo = p_preco_custo,
    updated_at  = NOW()
  WHERE id = p_produto_id;
END;
$$;


-- ── 5. forma_pgto em recorrências (para propagar para os lançamentos gerados) ──
ALTER TABLE recorrencias ADD COLUMN IF NOT EXISTS forma_pgto TEXT;
