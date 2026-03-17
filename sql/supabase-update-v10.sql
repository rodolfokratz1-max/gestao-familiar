-- ============================================================
-- ATUALIZAÇÃO v10 — Execute no Supabase SQL Editor
-- Multi-empresa + dados do cliente na OS
-- ============================================================

-- Novos campos na tabela ordens_servico
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS empresa_id        UUID;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS empresa_nome      TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS cliente_telefone  TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS cliente_email     TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS cliente_endereco  TEXT;
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS local_servico     TEXT;

-- Remove coluna antiga (renomeada para local_servico)
-- Se quiser manter por segurança, não execute esta linha
-- ALTER TABLE ordens_servico DROP COLUMN IF EXISTS endereco_obra;

-- Coluna ativo na tabela empresa (para multi-empresa)
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
