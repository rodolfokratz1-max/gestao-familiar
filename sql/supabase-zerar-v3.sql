-- ============================================================
-- ZERAR BASE DE DADOS v3
-- Preserva: cartoes, empresa, usuarios_app, pessoas
-- Apaga todo o resto
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
  produtos,
  contas,
  entradas_estoque,
  centros_custo,
  plano_contas_subs,
  plano_contas_grupos,
  produto_categorias
RESTART IDENTITY CASCADE;

-- cartoes, empresa, usuarios_app e pessoas são preservados
