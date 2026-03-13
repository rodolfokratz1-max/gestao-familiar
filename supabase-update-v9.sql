-- ============================================================
-- ATUALIZAÇÃO v9 — Execute no Supabase SQL Editor
-- Cria tabela de cadastro da empresa
-- ============================================================

CREATE TABLE IF NOT EXISTS empresa (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT NOT NULL,
  nome_fantasia    TEXT,
  cnpj             TEXT,
  ie               TEXT,
  im               TEXT,
  telefone         TEXT,
  whatsapp         TEXT,
  email            TEXT,
  site             TEXT,
  endereco         TEXT,
  numero           TEXT,
  complemento      TEXT,
  bairro           TEXT,
  cidade           TEXT,
  estado           TEXT,
  cep              TEXT,
  cor_primaria     TEXT DEFAULT '#1e3a5f',
  cor_secundaria   TEXT DEFAULT '#2563eb',
  rodape_os        TEXT DEFAULT 'Agradecemos a preferência!',
  logo_base64      TEXT,   -- imagem em base64 (PNG/JPG, max ~500KB)
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_familia" ON empresa FOR ALL USING (true) WITH CHECK (true);
