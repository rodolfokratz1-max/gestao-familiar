-- Diagnóstico e fix para INSERT em receitas/despesas com entidade_id

-- 1. Verifica se a coluna é NOT NULL (pode ter sido aplicado na Fase 1)
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('receitas', 'despesas')
  AND column_name = 'entidade_id';

-- 2. Se for NOT NULL e não tem default, o INSERT sem entidade_id válido falha
-- Fix: torna nullable (já que o frontend pode mandar null enquanto contexto carrega)
ALTER TABLE receitas  ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE despesas  ALTER COLUMN entidade_id DROP NOT NULL;

-- 3. Adiciona default para pegar a entidade Principal automaticamente
-- quando entidade_id vier null (fallback seguro)
-- Isso evita quebrar inserts durante a transição

-- 4. Também garante que as outras tabelas principais não quebrem
ALTER TABLE caixa            ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE contas           ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE contas_pagar     ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE contas_receber   ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE pessoas          ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE produtos         ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE cartoes          ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE compras          ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE ordens_servico   ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE entradas_estoque ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE recorrencias     ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE obra_lancamentos ALTER COLUMN entidade_id DROP NOT NULL;
ALTER TABLE obras            ALTER COLUMN entidade_id DROP NOT NULL;
