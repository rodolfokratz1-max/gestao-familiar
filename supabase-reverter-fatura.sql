-- ============================================================
-- REVERTER FECHAMENTO DE FATURA
-- Nubank Empresas — Março 2026
-- ============================================================

-- 1. Reabre a fatura
UPDATE faturas_cartao
SET status = 'aberta', pago = false
WHERE cartao_nome ILIKE '%nubank%'
  AND mes_ref = '2026-03';

-- 2. Remove a Conta a Pagar gerada pelo fechamento
DELETE FROM contas_pagar
WHERE descricao ILIKE '%nubank%'
  AND descricao ILIKE '%2026-03%';

-- Confira o resultado:
SELECT * FROM faturas_cartao WHERE mes_ref = '2026-03';
