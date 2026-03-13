-- Zera todos os dados mantendo a estrutura das tabelas
TRUNCATE TABLE 
  cartao_lancamentos,
  faturas_cartao,
  cartoes,
  pagamentos_parciais,
  contas_pagar,
  contas_receber,
  compras,
  manutencoes,
  caixa,
  despesas,
  receitas,
  produtos,
  pessoas,
  contas
RESTART IDENTITY CASCADE;
