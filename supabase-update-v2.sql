-- ============================================================
-- ATUALIZAÇÃO DO SCHEMA — Execute no Supabase SQL Editor
-- Adiciona: contas, pagamentos_parciais e campos novos
-- ============================================================

-- Contas / Carteiras
CREATE TABLE IF NOT EXISTS contas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        TEXT NOT NULL,
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'Conta Corrente',
  banco         TEXT,
  agencia       TEXT,
  conta_num     TEXT,
  saldo_inicial NUMERIC(12,2) DEFAULT 0,
  saldo_atual   NUMERIC(12,2) DEFAULT 0,
  obs           TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Pagamentos Parciais (serve para contas_pagar e contas_receber)
CREATE TABLE IF NOT EXISTS pagamentos_parciais (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_origem  TEXT NOT NULL, -- 'contas_pagar' ou 'contas_receber'
  origem_id      UUID NOT NULL,
  valor          NUMERIC(12,2) NOT NULL,
  data           DATE NOT NULL,
  forma_pgto     TEXT,
  conta_id       UUID REFERENCES contas(id) ON DELETE SET NULL,
  obs            TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Adiciona campos novos nas tabelas existentes (se não existirem)
ALTER TABLE contas_pagar    ADD COLUMN IF NOT EXISTS pessoa_id   UUID;
ALTER TABLE contas_pagar    ADD COLUMN IF NOT EXISTS pessoa_nome TEXT;
ALTER TABLE contas_pagar    ADD COLUMN IF NOT EXISTS forma_pgto  TEXT;
ALTER TABLE contas_pagar    ADD COLUMN IF NOT EXISTS conta_id    UUID;

ALTER TABLE contas_receber  ADD COLUMN IF NOT EXISTS pessoa_id   UUID;
ALTER TABLE contas_receber  ADD COLUMN IF NOT EXISTS pessoa_nome TEXT;
ALTER TABLE contas_receber  ADD COLUMN IF NOT EXISTS forma_pgto  TEXT;
ALTER TABLE contas_receber  ADD COLUMN IF NOT EXISTS conta_id    UUID;

ALTER TABLE caixa           ADD COLUMN IF NOT EXISTS conta_id    UUID;

-- Policies para as novas tabelas
ALTER TABLE contas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_parciais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acesso_familia" ON contas              FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON pagamentos_parciais FOR ALL USING (true) WITH CHECK (true);
