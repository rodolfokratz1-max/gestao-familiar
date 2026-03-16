-- ============================================================
-- ATUALIZAÇÃO v13 — Execute no Supabase SQL Editor
-- Plano de Contas (grupos e subcategorias)
-- ============================================================

CREATE TABLE IF NOT EXISTS plano_contas_grupos (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      TEXT NOT NULL,
  tipo      TEXT NOT NULL CHECK (tipo IN ('receita','despesa')),
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plano_contas_subs (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id  UUID NOT NULL REFERENCES plano_contas_grupos(id) ON DELETE CASCADE,
  nome      TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE plano_contas_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE plano_contas_subs   ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acesso_familia" ON plano_contas_grupos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON plano_contas_subs   FOR ALL USING (true) WITH CHECK (true);
