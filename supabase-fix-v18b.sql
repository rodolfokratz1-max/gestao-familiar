-- ============================================================
-- CORREÇÃO v18b — Execute no Supabase SQL Editor
-- Corrige tabelas de recorrências e colunas faltando
-- ============================================================

-- Garante que recorrencias tem todas as colunas
CREATE TABLE IF NOT EXISTS recorrencias (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT NOT NULL,
  descricao        TEXT,
  tipo             TEXT NOT NULL CHECK (tipo IN ('pagar','receber')),
  valor            NUMERIC(12,2) NOT NULL,
  periodicidade    TEXT NOT NULL DEFAULT 'mensal'
                   CHECK (periodicidade IN ('mensal','bimestral','trimestral','semestral','anual')),
  dia_vencimento   INT NOT NULL DEFAULT 10,
  categoria        TEXT,
  conta_id         UUID,
  data_inicio      DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim         DATE,
  ativo            BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Garante que recorrencias_config existe
CREATE TABLE IF NOT EXISTS recorrencias_config (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ultima_geracao   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas que podem estar faltando
ALTER TABLE contas_pagar   ADD COLUMN IF NOT EXISTS recorrencia_id  UUID;
ALTER TABLE contas_pagar   ADD COLUMN IF NOT EXISTS mes_referencia  TEXT;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS recorrencia_id  UUID;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS mes_referencia  TEXT;

-- RLS policies
ALTER TABLE recorrencias        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrencias_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recorrencias' AND policyname = 'acesso_familia'
  ) THEN
    CREATE POLICY "acesso_familia" ON recorrencias FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'recorrencias_config' AND policyname = 'acesso_familia'
  ) THEN
    CREATE POLICY "acesso_familia" ON recorrencias_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Caixa - colunas extras
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS origem_id     UUID;
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS origem_tabela TEXT;
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS forma_pgto    TEXT;
ALTER TABLE caixa ADD COLUMN IF NOT EXISTS conta_id      UUID;
