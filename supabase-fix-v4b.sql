-- Colunas faltando em contas_pagar
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS categoria     TEXT;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS data_pagamento DATE;

-- Colunas faltando em contas_receber  
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS data_recebimento DATE;
