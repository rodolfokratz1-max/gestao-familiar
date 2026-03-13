-- Colunas faltando em contas_receber
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS responsavel_id   UUID;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS responsavel_nome TEXT;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS forma_pgto       TEXT;
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS conta_id         UUID;
