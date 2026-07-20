import { supabase } from './supabase'

// Retorna o último dia do mês
function ultimoDiaMes(ano, mes) {
  return new Date(ano, mes, 0).getDate() // mes sem -1 pois getDate(0) pega o último do mês anterior
}

// Calcula o mês de referência da fatura baseado na data da compra e dia de fechamento
export function mesReferencia(dataCompra, diaFechamento) {
  const d = new Date(dataCompra + 'T12:00:00')
  const diaFecha = Number(diaFechamento || 1)
  // Ajusta o dia de fechamento para o último dia do mês se necessário
  // Ex: fecha dia 31, mas fevereiro tem 28 → usa 28 como referência
  const ultimoDia = ultimoDiaMes(d.getFullYear(), d.getMonth() + 1)
  const diaFechaEfetivo = Math.min(diaFecha, ultimoDia)

  if (d.getDate() <= diaFechaEfetivo) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  } else {
    const prox = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    return `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, '0')}`
  }
}

// Calcula a data de vencimento da fatura
export function dataVencimento(mesRef, diaVencimento) {
  const [ano, mes] = mesRef.split('-').map(Number)
  // Vencimento é no mês seguinte ao de referência
  // Ajusta para o último dia do mês se necessário (ex: dia 31 em fevereiro → dia 28)
  const ultimoDia = ultimoDiaMes(ano, mes + 1)
  const diaEfetivo = Math.min(Number(diaVencimento || 10), ultimoDia)
  const d = new Date(ano, mes, diaEfetivo)
  return d.toISOString().split('T')[0]
}

// Verifica e fecha faturas automaticamente ao abrir o sistema
export async function verificarFaturas() {
  const hoje = new Date()
  const diaHoje = hoje.getDate()

  // Busca todos os cartões ativos
  const { data: cartoes } = await supabase
    .from('cartoes')
    .select('*')
    .eq('ativo', true)

  if (!cartoes?.length) return

  for (const cartao of cartoes) {
    const diaFecha = Number(cartao.dia_fechamento || 1)

    // Só processa se hoje é o dia de fechamento ou passou
    if (diaHoje < diaFecha) continue

    // Mês de referência da fatura que fechou (mês atual se já passou o fechamento)
    const mesRef = diaHoje >= diaFecha
      ? `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
      : null

    if (!mesRef) continue

    // Verifica se já existe fatura fechada para esse cartão/mês
    const { data: faturaExiste } = await supabase
      .from('faturas_cartao')
      .select('id')
      .eq('cartao_id', cartao.id)
      .eq('mes_ref', mesRef)
      .single()

    if (faturaExiste) continue // já foi fechada

    // Busca lançamentos do mês de referência
    const inicio = `${mesRef}-01`
    const ultimoDia = new Date(Number(mesRef.split('-')[0]), Number(mesRef.split('-')[1]), 0).getDate()
    const fim = `${mesRef}-${String(ultimoDia).padStart(2, '0')}`

    const { data: lancamentos } = await supabase
      .from('cartao_lancamentos')
      .select('*')
      .eq('cartao_id', cartao.id)
      .gte('data_compra', inicio)
      .lte('data_compra', fim)

    if (!lancamentos?.length) continue // sem lançamentos, não fecha

    const totalFatura = lancamentos.reduce((s, l) => s + Number(l.valor_total || 0), 0)
    if (totalFatura <= 0) continue

    const vencimento = dataVencimento(mesRef, cartao.dia_vencimento)
    const [anoRef, mesNum] = mesRef.split('-')
    const nomeMes = new Date(Number(anoRef), Number(mesNum) - 1, 1)
      .toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

    // Cria a fatura fechada
    const { data: fatura } = await supabase
      .from('faturas_cartao')
      .insert({
        cartao_id: cartao.id,
        cartao_nome: cartao.nome,
        mes_ref: mesRef,
        total: totalFatura,
        vencimento,
        status: 'fechada',
      })
      .select()
      .single()

    // Gera UMA conta a pagar para a fatura inteira
    await supabase.from('contas_pagar').insert({
      data_emissao: hoje.toISOString().split('T')[0],
      status: 'pendente',
      descricao: `Fatura ${cartao.nome} — ${nomeMes}`,
      valor: totalFatura,
      vencimento,
      pago: false,
      categoria: 'Cartão de Crédito',
      origem_id: fatura?.id,
      origem_tabela: 'faturas_cartao',
      ativo: true,
    })
  }
}

// ═══════════════════════════════════════════════════════════
// ROTATIVO — saldo não pago no vencimento incorpora à fatura seguinte
// (igual ao comportamento real das operadoras de cartão)
// Tudo abaixo é ADITIVO: nenhuma função acima foi alterada.
// ═══════════════════════════════════════════════════════════

// Soma pagamentos parciais líquidos (descontando encargos já embutidos)
// de um título de contas_pagar. Mesma lógica já usada em FinanceiroContas.jsx
// para decidir quitação — reaproveitada aqui para consistência.
async function totalPagoLiquido(origemId) {
  const { data } = await supabase
    .from('pagamentos_parciais')
    .select('valor,juros,multa,desconto')
    .eq('tabela_origem', 'contas_pagar')
    .eq('origem_id', origemId)
  return (data || []).reduce((s, p) => {
    const enc = Number(p.juros || 0) + Number(p.multa || 0) - Number(p.desconto || 0)
    return s + Number(p.valor || 0) - enc
  }, 0)
}

// Verifica se existe fatura anterior desse cartão que:
// - já foi fechada (status = 'fechada')
// - já venceu (vencimento < hoje)
// - ainda não foi rolada (rolada_para_fatura_id IS NULL)
// - ainda tem saldo em aberto (não foi paga, nem total nem parcialmente até quitar)
// Retorna null se não houver nada pendente — comportamento normal do dia a dia.
export async function verificarRotativo(cartaoId) {
  const hoje = new Date().toISOString().split('T')[0]
  const { data: anteriores } = await supabase
    .from('faturas_cartao')
    .select('*')
    .eq('cartao_id', cartaoId)
    .eq('status', 'fechada')
    .is('rolada_para_fatura_id', null)
    .lt('vencimento', hoje)
    .order('mes_ref', { ascending: true })

  if (!anteriores?.length) return null

  // Processa da mais antiga para a mais nova (normalmente só existe uma)
  for (const fat of anteriores) {
    const { data: contaPagar } = await supabase
      .from('contas_pagar')
      .select('*')
      .eq('origem_id', fat.id)
      .eq('origem_tabela', 'faturas_cartao')
      .single()
    if (!contaPagar) continue

    const jaPago = await totalPagoLiquido(contaPagar.id)
    const saldo = Number(contaPagar.valor) - jaPago
    if (saldo > 0.01) {
      return { faturaAnterior: fat, contaPagar, saldo: Number(saldo.toFixed(2)) }
    }
  }
  return null
}

// Encerra contabilmente o saldo da fatura anterior (sem gerar movimento de Caixa,
// pois nenhum dinheiro saiu — o valor só migrou de título) e liga as duas faturas.
//
// IMPORTANTE: isso insere diretamente na tabela pagamentos_parciais, sem passar
// pela função de pagamento da tela (por isso não lança nada no Caixa). O saldo
// da fatura antiga passa a ser zero nos cálculos existentes (que já são baseados
// em valor - totalPagoRow, conforme FinanceiroContas.jsx), sem duplicar valor
// quando somado junto com a fatura nova.
export async function rolarFaturaAnterior({ faturaAnterior, contaPagar, saldo }, novaFaturaId, entidadeId = null) {
  const { error: e1 } = await supabase.from('pagamentos_parciais').insert({
    entidade_id: entidadeId,
    tabela_origem: 'contas_pagar',
    origem_id: contaPagar.id,
    valor: saldo,
    juros: 0,
    multa: 0,
    desconto: 0,
    data: new Date().toISOString().split('T')[0],
    forma_pgto: 'Rolagem para próxima fatura',
    obs: 'Saldo não pago no vencimento — incorporado à fatura seguinte com juros do rotativo. Não representa saída de caixa.',
  })
  if (e1) return { error: e1 }

  // Marca a conta a pagar como 'rolada' (não é vencida — foi incorporada na próxima fatura)
  const { error: e2 } = await supabase
    .from('contas_pagar')
    .update({ status: 'rolada' })
    .eq('id', contaPagar.id)
  if (e2) return { error: e2 }

  const { error: e3 } = await supabase
    .from('faturas_cartao')
    .update({ status: 'rolada', rolada_para_fatura_id: novaFaturaId })
    .eq('id', faturaAnterior.id)
  if (e3) return { error: e3 }

  return { error: null }
}
