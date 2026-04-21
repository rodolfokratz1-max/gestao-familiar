import { supabase } from './supabase'

/**
 * Verifica se um registro pode ser excluído.
 * Combina flag `bloqueado` (rápido) com verificação sob demanda (seguro).
 *
 * @param {string} tabela  — nome da tabela principal
 * @param {object} row     — registro completo (precisa de id, bloqueado, e campos específicos)
 * @returns {{ pode: boolean, motivos: string[] }}
 */
export async function verificarExclusao(tabela, row) {
  const motivos = []

  // 1. Atalho rápido: flag já setado
  if (row.bloqueado) {
    // Ainda assim faz a verificação completa para retornar os motivos
  }

  // 2. Verificação sob demanda por tabela
  switch (tabela) {

    case 'compras': {
      // Parcelas com pagamentos registrados
      const { data: parcelas } = await supabase
        .from('contas_pagar')
        .select('id')
        .eq('origem_id', row.id)
        .eq('ativo', true)
        .limit(1)

      if (parcelas?.length > 0) {
        const { data: pgs } = await supabase
          .from('pagamentos_parciais')
          .select('id')
          .in('origem_id', (await supabase
            .from('contas_pagar')
            .select('id')
            .eq('origem_id', row.id)
          ).data?.map(p => p.id) || [])
          .limit(1)

        if (pgs?.length > 0) {
          motivos.push('possui pagamentos registrados nas parcelas')
        }
      }

      // Produtos usados em OS
      const itens = row.itens_compra || []
      const prodIds = itens.map(i => i.produto_id).filter(Boolean)
      if (prodIds.length > 0) {
        const { data: osItens } = await supabase
          .from('os_itens')
          .select('id, descricao')
          .in('produto_id', prodIds)
          .limit(1)
        if (osItens?.length > 0) {
          motivos.push('produtos desta compra foram utilizados em Ordens de Serviço')
        }
      }

      // Compra importada de EntradaEstoque — excluir pela entrada
      if (row.origem_tabela === 'entradas_estoque') {
        motivos.push('compra importada de Entrada de Estoque — exclua pela tela de Entradas')
      }
      break
    }

    case 'produtos': {
      // Usado em OS
      const { data: osItens } = await supabase
        .from('os_itens')
        .select('id')
        .eq('produto_id', row.id)
        .limit(1)
      if (osItens?.length > 0) {
        motivos.push('produto utilizado em Ordens de Serviço')
      }

      // Está em compras com itens
      const { data: compras } = await supabase
        .from('compras')
        .select('id, descricao')
        .filter('itens_compra', 'cs', JSON.stringify([{ produto_id: row.id }]))
        .limit(1)
      if (compras?.length > 0) {
        motivos.push('produto vinculado a registros de Compras')
      }

      // Está em entradas de estoque
      const { data: entradas } = await supabase
        .from('entradas_estoque')
        .select('id')
        .filter('itens', 'cs', JSON.stringify([{ produto_id: row.id }]))
        .limit(1)
      if (entradas?.length > 0) {
        motivos.push('produto vinculado a Entradas de Estoque')
      }
      break
    }

    case 'contas_pagar':
    case 'contas_receber': {
      const { data: pgs } = await supabase
        .from('pagamentos_parciais')
        .select('id')
        .eq('origem_id', row.id)
        .limit(1)
      if (pgs?.length > 0) {
        motivos.push('possui pagamentos parciais registrados')
      }
      break
    }

    case 'ordens_servico': {
      // OS com pagamentos
      const { data: pgs } = await supabase
        .from('pagamentos_parciais')
        .select('id')
        .eq('origem_id', row.id)
        .limit(1)
      if (pgs?.length > 0) {
        motivos.push('possui pagamentos registrados')
      }

      // OS que gerou conta a receber
      const { data: cr } = await supabase
        .from('contas_receber')
        .select('id')
        .eq('origem_id', row.id)
        .eq('origem_tabela', 'ordens_servico')
        .limit(1)
      if (cr?.length > 0) {
        motivos.push('gerou cobrança em Contas a Receber')
      }

      // OS já lançada no caixa
      const { data: cx } = await supabase
        .from('caixa')
        .select('id')
        .eq('origem_id', row.id)
        .eq('origem_tabela', 'ordens_servico')
        .limit(1)
      if (cx?.length > 0) {
        motivos.push('lançamento já registrado no Caixa')
      }
      break
    }

    case 'entradas_estoque': {
      // Parcelas com pagamentos
      const { data: parcelas } = await supabase
        .from('contas_pagar')
        .select('id')
        .eq('origem_tabela', 'entradas_estoque')
        .eq('origem_id', row.id)
        .limit(1)

      if (parcelas?.length > 0) {
        const parcelaIds = (await supabase
          .from('contas_pagar')
          .select('id')
          .eq('origem_tabela', 'entradas_estoque')
          .eq('origem_id', row.id)
        ).data?.map(p => p.id) || []

        if (parcelaIds.length > 0) {
          const { data: pgs } = await supabase
            .from('pagamentos_parciais')
            .select('id')
            .in('origem_id', parcelaIds)
            .limit(1)
          if (pgs?.length > 0) {
            motivos.push('possui pagamentos registrados nas parcelas')
          }
        }
      }
      break
    }

    default:
      break
  }

  return {
    pode: motivos.length === 0,
    motivos,
  }
}

/**
 * Seta bloqueado=true em um registro.
 * Chamado automaticamente quando uma dependência é criada.
 */
export async function bloquear(tabela, id) {
  await supabase.from(tabela).update({ bloqueado: true }).eq('id', id)
}

/**
 * Tenta desbloquear — só libera se a verificação confirmar que não há mais dependências.
 * Chamado após estorno/exclusão de uma dependência.
 */
export async function tentarDesbloquear(tabela, row) {
  const { pode } = await verificarExclusao(tabela, row)
  if (pode) {
    await supabase.from(tabela).update({ bloqueado: false }).eq('id', row.id)
  }
}
