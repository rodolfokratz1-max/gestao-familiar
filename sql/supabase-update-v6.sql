-- ============================================================
-- ATUALIZAÇÃO v6 — Execute no Supabase SQL Editor
-- Adiciona rastreamento de usuário nos lançamentos
-- ============================================================

-- Quem criou/editou cada lançamento
ALTER TABLE receitas         ADD COLUMN IF NOT EXISTS usuario_email TEXT;
ALTER TABLE receitas         ADD COLUMN IF NOT EXISTS usuario_nome  TEXT;
ALTER TABLE despesas         ADD COLUMN IF NOT EXISTS usuario_email TEXT;
ALTER TABLE despesas         ADD COLUMN IF NOT EXISTS usuario_nome  TEXT;
ALTER TABLE contas_pagar     ADD COLUMN IF NOT EXISTS usuario_email TEXT;
ALTER TABLE contas_pagar     ADD COLUMN IF NOT EXISTS usuario_nome  TEXT;
ALTER TABLE contas_receber   ADD COLUMN IF NOT EXISTS usuario_email TEXT;
ALTER TABLE contas_receber   ADD COLUMN IF NOT EXISTS usuario_nome  TEXT;
ALTER TABLE caixa            ADD COLUMN IF NOT EXISTS usuario_email TEXT;
ALTER TABLE caixa            ADD COLUMN IF NOT EXISTS usuario_nome  TEXT;
ALTER TABLE compras          ADD COLUMN IF NOT EXISTS usuario_email TEXT;
ALTER TABLE compras          ADD COLUMN IF NOT EXISTS usuario_nome  TEXT;
ALTER TABLE cartao_lancamentos ADD COLUMN IF NOT EXISTS usuario_email TEXT;
ALTER TABLE cartao_lancamentos ADD COLUMN IF NOT EXISTS usuario_nome  TEXT;

-- ============================================================
-- IMPORTANTE: Habilitar autenticação no Supabase
-- 
-- 1. No painel do Supabase, vá em Authentication → Providers
-- 2. Certifique-se que "Email" está habilitado
-- 3. Em Authentication → Settings, desabilite "Confirm email" 
--    se quiser que o login funcione sem confirmação de e-mail
--    (recomendado para uso familiar interno)
-- ============================================================
