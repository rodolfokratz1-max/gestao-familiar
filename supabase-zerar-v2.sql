-- ============================================================
-- ZERAR BASE DE DADOS
-- Apaga todos os dados EXCETO empresa e usuarios_app
-- Execute no Supabase SQL Editor
-- ============================================================

TRUNCATE TABLE
  pagamentos_parciais,
  caixa,
  receitas,
  despesas,
  contas_pagar,
  contas_receber,
  compras,
  cartao_lancamentos,
  faturas_cartao,
  os_itens,
  ordens_servico,
  recorrencias,
  recorrencias_config,
  pessoas,
  produtos,
  contas
RESTART IDENTITY CASCADE;

-- empresa e usuarios_app são preservados
