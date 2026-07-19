import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, CheckCircle, CreditCard, ChevronDown, ChevronUp, Receipt } from 'lucide-react'
import { SelectCategoria } from '../lib/planoContas'
import { bloquear, tentarDesbloquear, verificarExclusao } from '../lib/integridade'
import { today, fmtDate } from '../lib/utils.js'
import { gerarRecibo } from '../lib/recibo'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const FORMAS_PGTO = ['Dinheiro','PIX','Cartão de Crédito','Cartão de Débito','Boleto','Transferência','Cheque','Outro']

const configs = {
  contas_receber: {
    table: 'contas_receber', title: 'Contas a Receber', newLabel: 'Nova Conta a Receber',
    pagoField: 'recebido', pagoLabel: 'Recebido', pessoaLabel: 'Cliente (de quem receber)',
    pessoaTipo: ['cliente','ambos'], dataLabel: 'Data Emissão',
  },
  contas_pagar: {
    table: 'contas_pagar', title: 'Contas a Pagar', newLabel: 'Nova Conta a Pagar',
    pagoField: 'pago', pagoLabel: 'Pago', pessoaLabel: 'Fornecedor / Para quem pagar',
    pessoaTipo: ['fornecedor','ambos','membro'], dataLabel: 'Data Emissão',
  },
}

// Converte strings vazias em null para campos UUID
const sanitize = (obj) => {
  const uuids = ['pessoa_id','conta_id','responsavel_id']
  const out = { ...obj }
  uuids.forEach(k => { if (out[k] === '' || out[k] === undefined) out[k] = null })
  return out
}

const emptyForm = () => ({
  data_emissao: today(), descricao: '', categoria: '', valor: '', vencimento: '',
  pessoa_id: '', pessoa_nome: '', responsavel_id: '', responsavel_nome: '', forma_pgto: '', conta_id: '',
  parcelado: false, num_parcelas: 2,
  obs: '', ativo: true,
})

export default function FinanceiroContas({ module }) {
  const cfg = configs[module]
  const toast = useToast()
  const { entidadeAtiva, pode, entidades } = useEntidade()
  const empresa = entidades?.find(e => e.id === entidadeAtiva?.id) || null
  const [rows, setRows] = useState([])
  const [pagamentos, setPagamentos] = useState([]) // pagamentos parciais
  const [pessoas, setPessoas] = useState([])
  const [contas, setContas] = useState([])
  const [membros, setMembros] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(false)
  const [modalPgto, setModalPgto] = useState(null) // row para pagamento parcial
  const [pgtoForm, setPgtoForm] = useState({ valor: '', data: today(), forma_pgto: '', conta_id: '', obs: '', juros: '', multa: '', desconto: '', parcial: false })
  const [form, setForm] = useState(emptyForm())
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    if (!entidadeAtiva?.id) return
    setRows([]); setPagamentos([]); setForm(emptyForm()); load()
  }, [module, entidadeAtiva?.id])

  async function load() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const [{ data: r }, { data: p }, { data: c }, { data: m }, { data: pgs }] = await Promise.all([
      supabase.from(cfg.table).select('*').eq('entidade_id', entidadeAtiva?.id).order('data_emissao', { ascending: false }),
      supabase.from('pessoas').select('id,nome,tipo').in('tipo', cfg.pessoaTipo).eq('ativo', true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('contas').select('id,nome,tipo').eq('ativo', true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('pessoas').select('id,nome').eq('tipo','membro').eq('ativo',true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('pagamentos_parciais').select('*').eq('tabela_origem', cfg.table).eq('entidade_id', entidadeAtiva?.id).order('data'),
    ])
    setRows(r || [])
    setPessoas(p || [])
    setContas(c || [])
    setMembros(m || [])
    setPagamentos(pgs || [])
    setLoading(false)
  }

  const getPagamentosRow = (rowId) => pagamentos.filter(p => p.origem_id === rowId)
  const totalPagoRow = (rowId) => getPagamentosRow(rowId).reduce((s, p) => {
    const enc = Number(p.juros || 0) + Number(p.multa || 0) - Number(p.desconto || 0)
    return s + Number(p.valor || 0) - enc
  }, 0)
  const saldoRow = (row) => Number(row.valor || 0) - totalPagoRow(row.id)

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchS = !q || r.descricao?.toLowerCase().includes(q) || r.pessoa_nome?.toLowerCase().includes(q)
    const saldo = saldoRow(r)
    const isPago = saldo <= 0
    const matchF = filterStatus === '' ? true : filterStatus === 'pago' ? isPago : !isPago
    return matchS && matchF
  })

  const totalGeral    = rows.reduce((s, r) => s + Number(r.valor || 0), 0)
  const totalPago     = rows.reduce((s, r) => s + totalPagoRow(r.id), 0)
  const totalPendente = totalGeral - totalPago

  function openNew() { setForm(emptyForm()); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r, parcelado: false, num_parcelas: 2 }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade antes de salvar', 'error')
    if (!form.descricao?.trim()) return toast('Descrição é obrigatória', 'error')
    if (!form.valor) return toast('Valor é obrigatório', 'error')

    // Se parcelado, cria N registros
    if (!editing && form.parcelado && Number(form.num_parcelas) > 1) {
      const n = Number(form.num_parcelas)
      const valorParcela = (Number(form.valor) / n).toFixed(2)
      const inserts = []
      for (let i = 0; i < n; i++) {
        const venc = form.vencimento ? new Date(form.vencimento) : new Date()
        venc.setMonth(venc.getMonth() + i)
        inserts.push({
          ...form,
          parcelado: false,
          num_parcelas: null,
          valor: valorParcela,
          descricao: `${form.descricao} (${i + 1}/${n})`,
          vencimento: venc.toISOString().split('T')[0],
          [cfg.pagoField]: false,
        })
      }
      const { error } = await supabase.from(cfg.table).insert(inserts.map(s => ({...sanitize(s), entidade_id: entidadeAtiva?.id || null})))
      if (error) { toast(error.message, 'error'); return }
      toast(`${n} parcelas criadas!`, 'success')
      setModal(false); load(); return
    }

    const payload = sanitize({ ...form, [cfg.pagoField]: false })
    let error
    if (editing) ({ error } = await supabase.from(cfg.table).update(payload).eq('id', editing))
    else ({ error } = await supabase.from(cfg.table).insert(sanitize({...payload, entidade_id: entidadeAtiva?.id || null})))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModal(false); load()
  }

  // Pagamento parcial ou total
  async function registrarPagamento() {
    const row = modalPgto
    const valor = Number(pgtoForm.valor)
    if (!valor || valor <= 0) return toast('Informe o valor pago', 'error')
    const saldo = saldoRow(row)

    const juros    = Number(pgtoForm.juros)    || 0
    const multa    = Number(pgtoForm.multa)    || 0
    const desconto = Number(pgtoForm.desconto) || 0
    const encargos = juros + multa - desconto
    const esperado = saldo + encargos

    if (pgtoForm.parcial) {
      // Pagamento parcial — só valida que não ultrapassa o saldo + encargos
      if (valor > esperado + 0.01) {
        return toast(`Valor informado (${fmt(valor)}) é maior que o saldo (${fmt(esperado)})`, 'error')
      }
    } else {
      // Pagamento total — valor deve fechar exatamente com saldo + encargos
      if (Math.abs(valor - esperado) > 0.01) {
        return toast(
          `Valor não fecha: ${fmt(saldo)} + encargos (${fmt(encargos)}) = ${fmt(esperado)} esperado, mas foi informado ${fmt(valor)}`,
          'error'
        )
      }
    }

    const valorTotal = valor

    // Registra pagamento parcial
    const { error: e1 } = await supabase.from('pagamentos_parciais').insert({entidade_id: entidadeAtiva?.id || null,
      tabela_origem: cfg.table,
      origem_id: row.id,
      valor: valorTotal,
      juros,
      multa,
      desconto,
      data: pgtoForm.data,
      forma_pgto: pgtoForm.forma_pgto,
      conta_id: pgtoForm.conta_id || null,
      obs: pgtoForm.obs,
    })
    if (e1) { toast(e1.message, 'error'); return }

    // Lança no caixa o valor ORIGINAL (sem encargos)
    const tipo = cfg.table === 'contas_receber' ? 'entrada' : 'saida'
    const caixaPayload = {
      data: pgtoForm.data,
      tipo,
      descricao: `${cfg.pagoLabel}: ${row.descricao}`,
      valor: saldo,  // ← valor original, não o valor pago com encargos
      categoria: pgtoForm.categoria || (cfg.table === 'contas_receber' ? 'Recebimento' : 'Pagamento'),
      obs: pgtoForm.obs || null,
    }
    if (pgtoForm.conta_id) caixaPayload.conta_id = pgtoForm.conta_id
    if (row.id) caixaPayload.origem_id = row.id
    if (cfg.table) caixaPayload.origem_tabela = cfg.table

    const { error: eCaixa } = await supabase.from('caixa').insert({...caixaPayload, entidade_id: entidadeAtiva?.id || null})
    if (eCaixa) {
      toast('Aviso: pagamento registrado mas erro ao lançar no Caixa: ' + eCaixa.message, 'error')
      console.error('Erro caixa:', eCaixa)
    }

    // Lança encargos no caixa apenas se houver juros ou multa (saída extra)
    // Desconto puro não gera lançamento — já está refletido no valor menor debitado
    if (juros > 0 || multa > 0) {
      const encargosPayload = {
        data: pgtoForm.data,
        tipo: 'saida',
        descricao: `Encargos (juros/multa): ${row.descricao}`,
        valor: juros + multa,
        categoria: 'Encargos Financeiros',
        obs: [
          juros > 0 ? `Juros: ${fmt(juros)}`   : '',
          multa > 0 ? `Multa: ${fmt(multa)}`   : '',
          desconto > 0 ? `Desconto: -${fmt(desconto)}` : '',
        ].filter(Boolean).join(' | ') || null,
        origem_id: row.id,
        origem_tabela: cfg.table,
      }
      if (pgtoForm.conta_id) encargosPayload.conta_id = pgtoForm.conta_id
      const { error: eEnc } = await supabase.from('caixa').insert({...encargosPayload, entidade_id: entidadeAtiva?.id || null})
      if (eEnc) {
        toast('Aviso: encargos não lançados no Caixa: ' + eEnc.message, 'error')
        console.error('Erro encargos caixa:', eEnc)
      }
    }

    // Atualiza saldo da conta: debita o valor total pago (original + encargos)
    if (pgtoForm.conta_id) {
      const { data: contaData } = await supabase.from('contas').select('saldo_atual').eq('id', pgtoForm.conta_id).single()
      if (contaData) {
        const novoSaldo = Number(contaData.saldo_atual || 0) + (tipo === 'entrada' ? saldo : -valor)
        await supabase.from('contas').update({ saldo_atual: novoSaldo }).eq('id', pgtoForm.conta_id)
      }
    }

    // Quitação: totalPagoRow já desconta encargos, soma apenas o valor original de cada pagamento
    const novoTotalOriginalPago = totalPagoRow(row.id) + saldo
    const parcelaQuitada = novoTotalOriginalPago >= Number(row.valor) - 0.01
    if (parcelaQuitada) {
      await supabase.from(cfg.table).update({ [cfg.pagoField]: true }).eq('id', row.id)
    }

    // Sincroniza status da Compra vinculada (se existir) com base nas parcelas pagas
    if (cfg.table === 'contas_pagar' && row.origem_id && row.origem_tabela) {
      const { data: todasParcelas } = await supabase
        .from('contas_pagar')
        .select('id, valor, pago')
        .eq('origem_tabela', row.origem_tabela)
        .eq('origem_id', row.origem_id)
        .eq('ativo', true)
      if (todasParcelas && todasParcelas.length > 0) {
        const pagas = todasParcelas.filter(p => p.pago).length
        const pagasAjustado = parcelaQuitada && !todasParcelas.find(p => p.id === row.id)?.pago
          ? pagas + 1
          : pagas
        const total_p = todasParcelas.length
        const novoStatus = pagasAjustado === 0 ? 'pendente' : pagasAjustado >= total_p ? 'pago' : 'parcial'
        if (row.origem_tabela === 'compras') {
          await supabase.from('compras').update({ status: novoStatus }).eq('id', row.origem_id)
        } else if (row.origem_tabela === 'entradas_estoque') {
          await supabase.from('compras').update({ status: novoStatus }).eq('origem_id', row.origem_id).eq('origem_tabela', 'entradas_estoque')
        }
      }
    }

    // Bloqueia a conta pagar/receber e a compra vinculada (se existir)
    await bloquear(cfg.table, row.id)
    if (row.origem_tabela === 'compras' && row.origem_id) {
      await bloquear('compras', row.origem_id)
    }
    if (row.origem_tabela === 'entradas_estoque' && row.origem_id) {
      await bloquear('entradas_estoque', row.origem_id)
    }

    toast('Pagamento registrado!', 'success')
    setModalPgto(null)
    setPgtoForm({ valor: '', data: today(), forma_pgto: '', conta_id: '', obs: '', juros: '', multa: '', desconto: '' })
    load()
  }

  async function toggleAtivo(r) {
    await supabase.from(cfg.table).update({ ativo: !r.ativo }).eq('id', r.id); load()
  }

  async function destroy() {
    const { pode, motivos } = await verificarExclusao(cfg.table, deleting)
    if (!pode) {
      toast(`Não é possível excluir: ${motivos.join('; ')}.`, 'error')
      setDeleting(null)
      return
    }
    await supabase.from(cfg.table).delete().eq('id', deleting.id)
    await supabase.from('pagamentos_parciais').delete().eq('origem_id', deleting.id)
    toast('Excluído', 'success'); setDeleting(null); load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const isVencido = r => saldoRow(r) > 0 && r.vencimento && r.vencimento < today()
  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }))

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card blue"><div className="stat-label">Total</div><div className="stat-value blue text-mono">{fmt(totalGeral)}</div></div>
        <div className="stat-card green"><div className="stat-label">{cfg.pagoLabel}</div><div className="stat-value green text-mono">{fmt(totalPago)}</div></div>
        <div className="stat-card yellow"><div className="stat-label">Pendente</div><div className="stat-value yellow text-mono">{fmt(totalPendente)}</div></div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar descrição, pessoa..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="aberto">Em Aberto</option>
          <option value="pago">{cfg.pagoLabel}s</option>
        </select>
        {pode('lancar') && <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> {cfg.newLabel}</button>}
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? <div className="empty-state"><p>Nenhum registro</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th></th><th>Emissão</th><th>Descrição</th><th>Pessoa</th><th>Responsável</th>
                  <th>Valor Total</th><th>Pago</th><th>Saldo</th><th>Vencimento</th><th>Status</th><th>Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => {
                    const pgts = getPagamentosRow(r.id)
                    const pago = totalPagoRow(r.id)
                    const saldo = saldoRow(r)
                    const quitado = saldo <= 0.01
                    const vencido = isVencido(r)
                    const rolada = r.status === 'rolada'
                    const isExp = expanded[r.id]
                    return (
                      <>
                        <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                          <td>
                            {pgts.length > 0 && (
                              <button className="icon-btn" onClick={() => toggleExpand(r.id)}>
                                {isExp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                            )}
                          </td>
                          <td className="text-mono text-muted" style={{ fontSize: 12 }}>{r.data_emissao?.split('-').reverse().join('/')}</td>
                          <td className="font-bold">{r.descricao}</td>
                          <td className="text-muted">{r.pessoa_nome || '—'}</td>
                      <td className="text-muted" style={{fontSize:12}}>{r.responsavel_nome || '—'}</td>
                          <td className="text-mono font-bold">{fmt(r.valor)}</td>
                          <td className="text-mono text-green">{pago > 0 ? fmt(pago) : '—'}</td>
                          <td className={`text-mono font-bold ${quitado ? 'text-green' : vencido ? 'text-red' : 'text-yellow'}`}>{quitado ? '—' : fmt(saldo)}</td>
                          <td className={`text-mono ${vencido ? 'text-red' : 'text-muted'}`} style={{ fontSize: 12 }}>
                            {r.vencimento ? r.vencimento.split('-').reverse().join('/') : '—'}
                            {vencido && <span className="badge badge-red" style={{ marginLeft: 4 }}>Vencido</span>}
                          </td>
                          <td>
                            {rolada
                              ? <span className="badge badge-blue">🔁 Rolada</span>
                              : <span className={`badge ${quitado ? 'badge-green' : pago > 0 ? 'badge-orange' : 'badge-yellow'}`}>
                                  {quitado ? cfg.pagoLabel : pago > 0 ? 'Parcial' : 'Pendente'}
                                </span>
                            }
                          </td>
                          <td><div className="action-btns">
                            <button className="icon-btn edit" title="Editar" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                            {!quitado && !rolada && <button className="icon-btn" style={{ color: 'var(--green)' }} title="Registrar pagamento" onClick={() => { setModalPgto(r); setPgtoForm({ valor: String(saldo.toFixed(2)), data: today(), forma_pgto: '', conta_id: '', obs: '', juros: '', multa: '', desconto: '' }) }}><CreditCard size={14} /></button>}
                            {quitado && cfg.tipo === 'receber' && <button className="icon-btn" style={{ color: 'var(--accent)' }} title="Gerar Recibo" onClick={() => handleRecibo(r)}><Receipt size={14} /></button>}
                            <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                            <button className="icon-btn del" onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                          </div></td>
                        </tr>
                        {isExp && pgts.map(pg => {
                          const pgJuros    = Number(pg.juros    || 0)
                          const pgMulta    = Number(pg.multa    || 0)
                          const pgDesconto = Number(pg.desconto || 0)
                          const temEncargos = pgJuros > 0 || pgMulta > 0 || pgDesconto > 0
                          return (
                            <tr key={pg.id} style={{ background: 'rgba(52,211,153,.05)' }}>
                              <td></td>
                              <td className="text-mono text-muted" style={{ fontSize: 11 }}>{pg.data?.split('-').reverse().join('/')}</td>
                              <td colSpan={2} style={{ fontSize: 12, color: 'var(--green)' }}>
                                ↳ Pagamento: {pg.forma_pgto || '—'}
                                {temEncargos && (
                                  <span style={{ marginLeft: 8, color: 'var(--text3)', fontSize: 11 }}>
                                    {pgJuros    > 0 && <span style={{ color: 'var(--red)'    }}> Juros: {fmt(pgJuros)}</span>}
                                    {pgMulta    > 0 && <span style={{ color: 'var(--red)'    }}> Multa: {fmt(pgMulta)}</span>}
                                    {pgDesconto > 0 && <span style={{ color: 'var(--green)'  }}> Desconto: -{fmt(pgDesconto)}</span>}
                                  </span>
                                )}
                                {pg.obs && <span style={{ marginLeft: 8, color: 'var(--text3)', fontSize: 11 }}>• {pg.obs}</span>}
                              </td>
                              <td colSpan={2} className="text-mono text-green" style={{ fontSize: 12 }}>{fmt(pg.valor)}</td>
                              <td colSpan={4} className="text-muted" style={{ fontSize: 12 }}>{pg.forma_pgto || '—'}</td>
                            </tr>
                          )
                        })}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Modal novo/editar */}
      {modal && (
        <Modal title={editing ? 'Editar' : cfg.newLabel} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">{cfg.dataLabel} *</label>
              <input className="form-input" type="date" value={form.data_emissao} onChange={e => f('data_emissao', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Vencimento</label>
              <input className="form-input" type="date" value={form.vencimento} onChange={e => f('vencimento', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={form.descricao} onChange={e => f('descricao', e.target.value)} placeholder="Descrição do lançamento" />
            </div>
            <div className="form-group">
              <label className="form-label">Valor *</label>
              <input className="form-input" type="number" step="0.01" value={form.valor} onChange={e => f('valor', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <SelectCategoria value={form.categoria || ''} onChange={v => f('categoria', v)}
                tipo={module === 'contas_receber' ? 'receita' : 'despesa'} />
            </div>
            <div className="form-group">
              <label className="form-label">Forma de Pagamento</label>
              <select className="form-select" value={form.forma_pgto} onChange={e => f('forma_pgto', e.target.value)}>
                <option value="">Selecionar...</option>
                {FORMAS_PGTO.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">{cfg.pessoaLabel}</label>
              <select className="form-select" value={form.pessoa_id} onChange={e => {
                const p = pessoas.find(x => x.id === e.target.value)
                f('pessoa_id', e.target.value); f('pessoa_nome', p?.nome || '')
              }}>
                <option value="">Selecionar...</option>
                {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Conta / Carteira</label>
              <select className="form-select" value={form.conta_id} onChange={e => f('conta_id', e.target.value)}>
                <option value="">Selecionar...</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            {module === 'contas_pagar' && (
              <div className="form-group">
                <label className="form-label">Responsável (membro)</label>
                <select className="form-select" value={form.responsavel_id} onChange={e => {
                  const m = membros.find(x => x.id === e.target.value)
                  f('responsavel_id', e.target.value); f('responsavel_nome', m?.nome || '')
                }}>
                  <option value="">Selecionar membro...</option>
                  {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
            )}
            {!editing && (
              <div className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 20 }}>
                <input type="checkbox" id="parcelado" checked={form.parcelado} onChange={e => f('parcelado', e.target.checked)} style={{ width: 16, height: 16 }} />
                <label htmlFor="parcelado" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Parcelar</label>
              </div>
            )}
            {!editing && form.parcelado && (
              <div className="form-group">
                <label className="form-label">Nº de Parcelas</label>
                <input className="form-input" type="number" min={2} max={60} value={form.num_parcelas} onChange={e => f('num_parcelas', e.target.value)} />
              </div>
            )}
            {!editing && form.parcelado && form.num_parcelas > 1 && (
              <div style={{ gridColumn: '1/-1', background: 'rgba(79,142,247,.1)', border: '1px solid rgba(79,142,247,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--accent)' }}>
                Serão criadas <strong>{form.num_parcelas} parcelas</strong> de <strong>{fmt(Number(form.valor || 0) / Number(form.num_parcelas))}</strong> cada, com vencimentos mensais a partir da data informada.
              </div>
            )}
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal pagamento parcial */}
      {modalPgto && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalPgto(null)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Registrar Pagamento</span>
              <button className="icon-btn" onClick={() => setModalPgto(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{modalPgto.descricao}</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span>Total: <strong className="text-mono">{fmt(modalPgto.valor)}</strong></span>
                  <span>Pago: <strong className="text-mono text-green">{fmt(totalPagoRow(modalPgto.id))}</strong></span>
                  <span>Saldo: <strong className="text-mono text-yellow">{fmt(saldoRow(modalPgto))}</strong></span>
                </div>
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Valor original</label>
                  <input className="form-input" type="text" value={fmt(saldoRow(modalPgto))} readOnly
                    style={{ background: 'var(--bg3)', color: 'var(--text2)', cursor: 'default' }} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                    <input type="checkbox" checked={pgtoForm.parcial || false}
                      onChange={e => setPgtoForm(p => ({ ...p, parcial: e.target.checked }))}
                      style={{ width:15, height:15 }} />
                    Pagamento parcial
                  </label>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:4, paddingLeft:23 }}>
                    Marque quando for pagar apenas parte do valor — o saldo fica em aberto
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Valor pago *</label>
                  <input className="form-input" type="number" step="0.01" value={pgtoForm.valor}
                    onChange={e => setPgtoForm(p => ({ ...p, valor: e.target.value }))}
                    onBlur={e => {
                      const valorPago = Number(e.target.value) || 0
                      const saldo = saldoRow(modalPgto)
                      const diff = Number((valorPago - saldo).toFixed(2))
                      if (diff > 0) {
                        // Acréscimo → joga em Juros, zera Desconto
                        setPgtoForm(p => ({ ...p, juros: String(diff), multa: '', desconto: '' }))
                      } else if (diff < 0) {
                        // Desconto → joga em Desconto, zera Juros e Multa
                        setPgtoForm(p => ({ ...p, juros: '', multa: '', desconto: String(Math.abs(diff)) }))
                      } else {
                        // Igual → limpa encargos
                        setPgtoForm(p => ({ ...p, juros: '', multa: '', desconto: '' }))
                      }
                    }}
                    autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Data *</label>
                  <input className="form-input" type="date" value={pgtoForm.data} onChange={e => setPgtoForm(p => ({ ...p, data: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Forma de Pagamento *</label>
                  <select className="form-select" value={pgtoForm.forma_pgto} onChange={e => setPgtoForm(p => ({ ...p, forma_pgto: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {FORMAS_PGTO.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Conta / Carteira</label>
                  <select className="form-select" value={pgtoForm.conta_id} onChange={e => setPgtoForm(p => ({ ...p, conta_id: e.target.value }))}>
                    <option value="">Sem conta (não atualiza saldo)</option>
                    {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                {/* Encargos */}
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Encargos / Desconto</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Juros (R$)</label>
                        <input className="form-input" type="number" step="0.01" min="0" placeholder="0,00"
                          value={pgtoForm.juros} onChange={e => setPgtoForm(p => ({ ...p, juros: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Multa (R$)</label>
                        <input className="form-input" type="number" step="0.01" min="0" placeholder="0,00"
                          value={pgtoForm.multa} onChange={e => setPgtoForm(p => ({ ...p, multa: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Desconto (R$)</label>
                        <input className="form-input" type="number" step="0.01" min="0" placeholder="0,00"
                          value={pgtoForm.desconto} onChange={e => setPgtoForm(p => ({ ...p, desconto: e.target.value }))} />
                      </div>
                    </div>
                    {(() => {
                      const saldo = saldoRow(modalPgto)
                      const valorPago = Number(pgtoForm.valor) || 0
                      const j = Number(pgtoForm.juros) || 0
                      const m = Number(pgtoForm.multa) || 0
                      const d = Number(pgtoForm.desconto) || 0
                      const enc = j + m - d
                      const esperado = Number((saldo + enc).toFixed(2))
                      const fechou = Math.abs(valorPago - esperado) <= 0.01
                      const temEncargos = j > 0 || m > 0 || d > 0
                      if (!temEncargos && valorPago === 0) return null
                      return (
                        <div style={{ marginTop: 10, display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text2)' }}>
                            Original: <strong className="text-mono">{fmt(saldo)}</strong>
                          </span>
                          {temEncargos && (
                            <span style={{ color: enc > 0 ? 'var(--red)' : 'var(--green)' }}>
                              Encargos: <strong className="text-mono">{enc >= 0 ? '+' : ''}{fmt(enc)}</strong>
                            </span>
                          )}
                          <span style={{ color: fechou ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                            {fechou ? '✓' : '✗'} Esperado: <strong className="text-mono">{fmt(esperado)}</strong>
                          </span>
                          {!fechou && valorPago > 0 && (
                            <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                              Diferença: <strong className="text-mono">{fmt(Number((valorPago - esperado).toFixed(2)))}</strong>
                            </span>
                          )}
                          {temEncargos && (j > 0 || m > 0) && fechou && (
                            <span style={{ background: 'rgba(234,179,8,.15)', color: '#a16207', padding: '2px 8px', borderRadius: 5 }}>
                              Lançamento em "Encargos Financeiros" será gerado
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Observações</label>
                  <textarea className="form-textarea" value={pgtoForm.obs} onChange={e => setPgtoForm(p => ({ ...p, obs: e.target.value }))} rows={2} />
                </div>
              </div>
              <div style={{ background: 'rgba(79,142,247,.08)', border: '1px solid rgba(79,142,247,.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                ℹ️ O pagamento será lançado automaticamente no <strong>Caixa</strong> e no <strong>Fluxo de Caixa</strong>.
                {pgtoForm.conta_id ? <span style={{ color: 'var(--green)' }}> O saldo da conta selecionada será atualizado.</span> : <span style={{ color: 'var(--yellow)' }}> Selecione uma conta para atualizar o saldo.</span>}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setModalPgto(null)}>Cancelar</button>
                <button className="btn btn-primary" onClick={registrarPagamento}><CheckCircle size={15} /> Confirmar Pagamento</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleting && <ConfirmDialog message={`Excluir "${deleting.descricao}"? Os pagamentos parciais também serão excluídos.`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
