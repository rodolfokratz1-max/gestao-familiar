-- ============================================================
-- ATUALIZAÇÃO v7 — Execute no Supabase SQL Editor
-- Cria tabela de usuários e configura o admin inicial
-- ============================================================

-- Tabela local de usuários (espelho do Auth)
CREATE TABLE IF NOT EXISTS usuarios_app (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id   UUID UNIQUE,           -- ID do Supabase Auth
  nome      TEXT NOT NULL,
  email     TEXT NOT NULL UNIQUE,
  perfil    TEXT DEFAULT 'usuario' CHECK (perfil IN ('admin','usuario')),
  ativo     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE usuarios_app ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_familia" ON usuarios_app FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- PASSO 2: Criar o usuário admin inicial
--
-- Vá em: Supabase → Authentication → Users → Add user
-- Preencha:
--   Email: admin@familia.com   (ou o email que quiser)
--   Password: (escolha uma senha forte)
--   Marque: "Auto Confirm User"
--
-- Depois copie o UUID do usuário criado e rode:
-- ============================================================

-- Substitua os valores abaixo e rode após criar o usuário no Auth:
-- INSERT INTO usuarios_app (auth_id, nome, email, perfil, ativo)
-- VALUES (
--   'COLE-AQUI-O-UUID-DO-USUARIO',   -- UUID do Supabase Auth
--   'Administrador',
--   'admin@familia.com',              -- mesmo email usado no Auth
--   'admin',
--   true
-- );

-- ============================================================
-- PASSO 3: Configurar Service Role no .env
--
-- Para criar usuários pelo sistema, adicione no arquivo .env:
-- VITE_ADMIN_EMAIL=admin@familia.com
--
-- E para usar a API admin do Supabase, adicione também:
-- VITE_SUPABASE_SERVICE_KEY=sua-service-role-key
-- (encontre em: Supabase → Project Settings → API → service_role)
-- ============================================================
