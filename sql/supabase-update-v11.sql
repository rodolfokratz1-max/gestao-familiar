-- ============================================================
-- ATUALIZAÇÃO v11 — Execute no Supabase SQL Editor
-- Tabelas de Recorrências
-- ============================================================

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

-- Tabela de controle (guarda timestamp da última geração)
CREATE TABLE IF NOT EXISTS recorrencias_config (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ultima_geracao   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Campo recorrencia_id e mes_referencia nas contas
-- Para garantir idempotência (não duplicar lançamentos)
ALTER TABLE contas_pagar  ADD COLUMN IF NOT EXISTS recorrencia_id  UUID;
ALTER TABLE contas_pagar  ADD COLUMN IF NOT EXISTS mes_referencia  TEXT; -- formato: 2025-01
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS recorrencia_id UUID;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS mes_referencia TEXT;

ALTER TABLE recorrencias        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrencias_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_familia" ON recorrencias        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON recorrencias_config FOR ALL USING (true) WITH CHECK (true);
