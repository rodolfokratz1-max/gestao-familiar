-- ============================================================
-- ATUALIZAÇÃO — Colunas novas na tabela pessoas
-- Execute no Supabase SQL Editor
-- ============================================================

ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS rg               TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS celular          TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS whatsapp         TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS site             TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS cep              TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS logradouro       TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS numero           TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS complemento      TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS bairro           TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS cidade           TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS estado           TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS pais             TEXT DEFAULT 'Brasil';
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS data_nascimento  DATE;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS contato_nome     TEXT;
ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS contato_telefone TEXT;
