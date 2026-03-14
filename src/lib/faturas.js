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
