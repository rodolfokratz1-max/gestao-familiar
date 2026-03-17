-- ============================================================
-- ATUALIZAÇÃO v8 — Execute no Supabase SQL Editor
-- Cria tabelas de Ordem de Serviço
-- ============================================================

CREATE TABLE IF NOT EXISTS ordens_servico (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero           TEXT NOT NULL,
  cliente_id       UUID,
  cliente_nome     TEXT,
  equipamento      TEXT NOT NULL,
  endereco_obra    TEXT,
  prazo            DATE,
  status           TEXT DEFAULT 'orcamento'
                   CHECK (status IN ('orcamento','andamento','aguardando','finalizado','recebido','cancelado')),
  obs              TEXT,
  data_recebimento DATE,
  origem_id        UUID,
  usuario_email    TEXT,
  usuario_nome     TEXT,
  ativo            BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS os_itens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id       UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('peca','servico')),
  descricao   TEXT NOT NULL,
  quantidade  NUMERIC(10,2) DEFAULT 1,
  valor_unit  NUMERIC(12,2) DEFAULT 0,
  valor_total NUMERIC(12,2) DEFAULT 0,
  pago        BOOLEAN DEFAULT FALSE,
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Coluna origem nas contas_receber (para rastrear de qual OS veio)
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS origem_id     UUID;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS origem_tabela TEXT;

ALTER TABLE ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_itens       ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_familia" ON ordens_servico FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON os_itens       FOR ALL USING (true) WITH CHECK (true);
