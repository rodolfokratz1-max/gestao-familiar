-- ============================================================
-- SCHEMA — GestãoFam
-- Execute no Supabase: SQL Editor > New query > Cole e execute
-- ============================================================

-- Pessoas (Clientes e Fornecedores)
CREATE TABLE IF NOT EXISTS pessoas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      TEXT NOT NULL,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'cliente' CHECK (tipo IN ('cliente','fornecedor','ambos')),
  cpf_cnpj    TEXT,
  telefone    TEXT,
  email       TEXT,
  endereco    TEXT,
  obs         TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Produtos e Serviços
CREATE TABLE IF NOT EXISTS produtos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      TEXT NOT NULL,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'produto' CHECK (tipo IN ('produto','servico')),
  categoria   TEXT,
  unidade     TEXT DEFAULT 'un',
  preco_custo NUMERIC(12,2),
  preco_venda NUMERIC(12,2),
  estoque     NUMERIC(12,3) DEFAULT 0,
  estoque_min NUMERIC(12,3) DEFAULT 0,
  obs         TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Receitas
CREATE TABLE IF NOT EXISTS receitas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data        DATE NOT NULL,
  descricao   TEXT NOT NULL,
  categoria   TEXT,
  valor       NUMERIC(12,2) NOT NULL,
  recebido    BOOLEAN DEFAULT FALSE,
  obs         TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Despesas
CREATE TABLE IF NOT EXISTS despesas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data        DATE NOT NULL,
  descricao   TEXT NOT NULL,
  categoria   TEXT,
  valor       NUMERIC(12,2) NOT NULL,
  pago        BOOLEAN DEFAULT FALSE,
  obs         TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Caixa (lançamentos de entrada e saída)
CREATE TABLE IF NOT EXISTS caixa (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data        DATE NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  descricao   TEXT NOT NULL,
  valor       NUMERIC(12,2) NOT NULL,
  categoria   TEXT,
  obs         TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Contas a Receber
CREATE TABLE IF NOT EXISTS contas_receber (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_emissao      DATE NOT NULL,
  descricao         TEXT NOT NULL,
  valor             NUMERIC(12,2) NOT NULL,
  vencimento        DATE,
  recebido          BOOLEAN DEFAULT FALSE,
  data_recebimento  DATE,
  obs               TEXT,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Contas a Pagar
CREATE TABLE IF NOT EXISTS contas_pagar (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_emissao    DATE NOT NULL,
  descricao       TEXT NOT NULL,
  valor           NUMERIC(12,2) NOT NULL,
  vencimento      DATE,
  pago            BOOLEAN DEFAULT FALSE,
  data_pagamento  DATE,
  obs             TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Compras
CREATE TABLE IF NOT EXISTS compras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data        DATE NOT NULL,
  descricao   TEXT NOT NULL,
  fornecedor  TEXT,
  valor_total NUMERIC(12,2) NOT NULL,
  forma_pgto  TEXT,
  status      TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','pago','parcial','cancelado')),
  obs         TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Manutenções
CREATE TABLE IF NOT EXISTS manutencoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_abertura   DATE NOT NULL,
  bem             TEXT NOT NULL,
  tipo            TEXT,
  descricao       TEXT NOT NULL,
  responsavel     TEXT,
  custo           NUMERIC(12,2),
  status          TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','em andamento','concluido','cancelado')),
  data_conclusao  DATE,
  obs             TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS (Row Level Security) — DESABILITAR para uso familiar simples
-- Ou habilitar e criar policies se quiser múltiplos usuários isolados
-- ============================================================
ALTER TABLE pessoas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE receitas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE despesas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE caixa            ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_receber   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar     ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras          ENABLE ROW LEVEL SECURITY;
ALTER TABLE manutencoes      ENABLE ROW LEVEL SECURITY;

-- Política: acesso público (todos autenticados veem tudo - ideal para família)
-- Se quiser autenticação, troque "true" por "auth.role() = 'authenticated'"
CREATE POLICY "acesso_familia" ON pessoas          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON produtos         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON receitas         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON despesas         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON caixa            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON contas_receber   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON contas_pagar     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON compras          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_familia" ON manutencoes      FOR ALL USING (true) WITH CHECK (true);
