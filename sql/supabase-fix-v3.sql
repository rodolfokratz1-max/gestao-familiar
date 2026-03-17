-- Correção: adiciona colunas faltando
ALTER TABLE receitas  ADD COLUMN IF NOT EXISTS data_recebimento DATE;
ALTER TABLE despesas  ADD COLUMN IF NOT EXISTS data_pagamento   DATE;
