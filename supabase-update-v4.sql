-- ============================================================
-- ATUALIZAÇÃO v4 — Execute no Supabase SQL Editor
-- Adiciona: cartões, lançamentos de cartão, responsável em contas
-- ============================================================

-- Cartões de crédito
CREATE TABLE IF NOT EXISTS cartoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT NOT NULL,
  bandeira         TEXT,
  titular_id       UUID,
  titular_nome     TEXT,
  limite           NUMERIC(12,2) DEFAULT 0,
  dia_vencimento   INT,
  dia_fechamento   INT,
  obs              TEXT,
  ativo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Lançamentos do cartão (cada compra)
CREATE TABLE IF NOT EXISTS cartao_lancamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cartao_id       UUID NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  data_compra     DATE NOT NULL,
  descricao       TEXT NOT NULL,
  categoria       TEXT,
  valor_total     NUMERIC(12,2) NOT NULL,
  num_parcela     INT DEFAULT 1,
  total_parcelas  INT DEFAULT 1,
  obs             TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Responsável em contas a pagar (membro da família)
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS responsavel_id   UUID;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS responsavel_nome TEXT;

-- Origem em contas a pagar (para vincular com lançamento de cartão)
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS origem_id     UUID;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS origem_tabela TEXT;

-- Policies
ALTER TABLE cartoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartao_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acesso_familia" ON cartoes            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON cartao_lancamentos FOR ALL USING (true) WITH CHECK (true);
