-- Correção: colunas faltando em contas_receber e contas_pagar
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS num_parcelas   INT;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS parcelado      BOOLEAN DEFAULT FALSE;
ALTER TABLE contas_pagar   ADD COLUMN IF NOT EXISTS num_parcelas   INT;
ALTER TABLE contas_pagar   ADD COLUMN IF NOT EXISTS parcelado      BOOLEAN DEFAULT FALSE;
