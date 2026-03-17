-- ============================================================
-- ATUALIZAÇÃO v5 — Execute no Supabase SQL Editor
-- Cria tabela de faturas fechadas dos cartões
-- ============================================================

CREATE TABLE IF NOT EXISTS faturas_cartao (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cartao_id    UUID NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  cartao_nome  TEXT,
  mes_ref      TEXT NOT NULL,        -- ex: '2026-03'
  total        NUMERIC(12,2) NOT NULL,
  vencimento   DATE,
  status       TEXT DEFAULT 'fechada', -- 'fechada' | 'paga'
  pago         BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE faturas_cartao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_familia" ON faturas_cartao FOR ALL USING (true) WITH CHECK (true);

-- Remove contas individuais geradas por compra de cartão (versão anterior)
-- (opcional — só rode se quiser limpar o histórico da v4)
-- DELETE FROM contas_pagar WHERE origem_tabela = 'cartao_lancamentos';
