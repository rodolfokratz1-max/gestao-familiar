import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, ShoppingCart, CheckCircle, Package, CreditCard, RefreshCw } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const EMPTY = { data: today(), fornecedor: '', descricao: '', valor_total: '', status: 'pendente', forma_pgto: '', conta_id: '', obs: '', ativo: true }

export default function Compras() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [contas, setContas] = useState([])
  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState([])
  const [itensCompra, setItensCompra] = useState([])
  const [addProd, setAddProd] = useState({ produto_id: '', qtd: 1, valor_unit: '' })
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [showArquivados, setShowArquivados] = useState(false)
  const [itensEntrada, setItensEntrada] = useState([]) // itens readonly de entradas_estoque

  // Parcelas vinculadas de cada compra: { [compra_id]: [{id, valor, pago, descricao, vencimento}] }
  const [parcelasMap, setParcelasMap] = useState({})

  useEffect(() => {
    load()
    supabase.from('pessoas').select('id,nome').in('tipo', ['fornecedor', 'ambos']).eq('ativo', true).then(({ data }) => setFornecedores(data || []))
    supabase.from('contas').select('id,nome').eq('ativo', true).order('nome').then(({ data }) => setContas(data || []))
    supabase.from('produtos').select('id,nome,preco_custo,estoque,unidade').eq('tipo', 'produto').eq('ativo', true).order('nome').then(({ data }) => setProdutos(data || []))
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('compras').select('*').order('data', { ascending: false })
    if (error) { toast(error.message, 'error'); setLoading(false); return }
    const compras = data || []
    setRows(compras)

    // Busca todas as parcelas vinculadas às compras em duas queries:
    // 1) parcelas com origem_tabela='compras' (compra manual parcelada)
    // 2) parcelas com origem_tabela='entradas_estoque' onde a entrada originou a compra
    const idsCompras = compras.map(r => r.id)
    const idsEntradas = compras.filter(r => r.origem_id).map(r => r.origem_id)

    const [{ data: p1 }, { data: p2 }] = await Promise.all([
      idsCompras.length > 0
        ? supabase.from('contas_pagar').select('id,origem_id,valor,pago,descricao,vencimento').eq('origem_tabela', 'compras').in('origem_id', idsCompras).eq('ativo', true)
        : { data: [] },
      idsEntradas.length > 0
        ? supabase.from('contas_pagar').select('id,origem_id,valor,pago,descricao,vencimento').eq('origem_tabela', 'entradas_estoque').in('origem_id', idsEntradas).eq('ativo', true)
        : { data: [] },
    ])

    // Monta mapa compra_id → parcelas
    const mapa = {}
    for (const p of (p1 || [])) {
      if (!mapa[p.origem_id]) mapa[p.origem_id] = []
      mapa[p.origem_id].push(p)
    }
    // Para parcelas de entrada_estoque, cruzar via compra.origem_id
    const entradaParaCompra = {}
    for (const compra of compras) {
      if (compra.origem_id) entradaParaCompra[compra.origem_id] = compra.id
    }
    for (const p of (p2 || [])) {
      const compraId = entradaParaCompra[p.origem_id]
      if (!compraId) continue
      if (!mapa[compraId]) mapa[compraId] = []
      mapa[compraId].push(p)
    }

    setParcelasMap(mapa)
    setLoading(false)
  }

  // ── Helpers de parcelas ───────────────────────────────────────
  const parcelasDeCompra = id => parcelasMap[id] || []
  const valorPagoCompra = id => parcelasDeCompra(id).filter(p => p.pago).reduce((s, p) => s + Number(p.valor || 0), 0)
  const valorPendenteCompra = id => parcelasDeCompra(id).filter(p => !p.pago).reduce((s, p) => s + Number(p.valor || 0), 0)

  // Status calculado automaticamente a partir das parcelas
  function statusCalculado(compra) {
    const parcelas = parcelasDeCompra(compra.id)
    if (parcelas.length === 0) return compra.status // sem parcelas: status manual
    const pagas = parcelas.filter(p => p.pago).length
    if (pagas === 0) return 'pendente'
    if (pagas === parcelas.length) return 'pago'
    return 'parcial'
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchS = !q || r.descricao?.toLowerCase().includes(q) || r.fornecedor?.toLowerCase().includes(q)
    const matchF = !filterStatus || statusCalculado(r) === filterStatus
    const matchAtivo = showArquivados ? true : r.ativo !== false
    return matchS && matchF && matchAtivo
  })

  const total = filtered.reduce((s, r) => s + Number(r.valor_total || 0), 0)
  const totalPendente = filtered.filter(r => statusCalculado(r) === 'pendente').reduce((s, r) => s + Number(r.valor_total || 0), 0)
  const totalSaldoAberto = filtered.filter(r => statusCalculado(r) === 'parcial').reduce((s, r) => s + valorPendenteCompra(r.id), 0)

  function openNew() { setForm(EMPTY); setItensCompra([]); setItensEntrada([]); setEditing(null); setModal(true) }
  async function openEdit(r) {
    setForm({ ...r })
    setItensEntrada([])
    if (r.origem_tabela === 'entradas_estoque' && r.origem_id) {
      // Compra importada — busca itens da entrada original para exibição readonly
      const { data: entrada } = await supabase.from('entradas_estoque').select('itens').eq('id', r.origem_id).single()
      setItensEntrada(entrada?.itens || [])
      setItensCompra([])
    } else {
      setItensCompra(r.itens_compra || [])
    }
    setEditing(r.id)
    setModal(true)
  }

  async function save() {
    if (!form.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (!form.valor_total) return toast('Valor obrigatório', 'error')

    // Compras importadas de EntradaEstoque são readonly — só permite salvar obs
    const isImportada = editing && rows.find(r => r.id === editing)?.origem_tabela === 'entradas_estoque'

    const anterior = editing ? rows.find(r => r.id === editing) : null
    const eraP = anterior?.status === 'pago'
    const agora = form.status === 'pago'

    // Compras importadas: salva apenas obs — não altera valor, fornecedor, itens, status
    const payload = isImportada
      ? { obs: form.obs }
      : { ...form, itens_compra: itensCompra.length ? itensCompra : null }
    if (!isImportada && itensCompra.length) payload.valor_total = itensCompra.reduce((s, i) => s + Number(i.qtd) * Number(i.valor_unit), 0).toFixed(2)

    let savedId = editing
    let error
    if (editing) {
      ;({ error } = await supabase.from('compras').update(payload).eq('id', editing))
    } else {
      const { data: novo, error: e } = await supabase.from('compras').insert(payload).select().single()
      error = e; if (novo) savedId = novo.id
    }
    if (error) { toast(error.message, 'error'); return }

    if (!eraP && agora) await lancarCaixaCompra({ ...form, itens_compra: itensCompra, id: savedId, valor_total: payload.valor_total })
    if (eraP && !agora) await removerCaixaCompra(editing)

    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function lancarCaixaCompra(r) {
    await supabase.from('caixa').insert({
      data: r.data || today(), tipo: 'saida',
      descricao: `Compra: ${r.descricao}`,
      valor: r.valor_total, categoria: 'Compra',
      conta_id: r.conta_id || null,
      origem_id: r.id, origem_tabela: 'compras', obs: r.obs,
    })
    if (r.conta_id) {
      const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id', r.conta_id).single()
      if (ct) await supabase.from('contas').update({ saldo_atual: Number(ct.saldo_atual || 0) - Number(r.valor_total) }).eq('id', r.conta_id)
    }
    if (r.itens_compra?.length) {
      for (const item of r.itens_compra) {
        if (!item.produto_id) continue
        const { data: prod } = await supabase.from('produtos').select('estoque').eq('id', item.produto_id).single()
        if (prod) await supabase.from('produtos').update({ estoque: Number(prod.estoque || 0) + Number(item.qtd || 0) }).eq('id', item.produto_id)
      }
    }
  }

  async function removerCaixaCompra(origemId) {
    const { data: cxList } = await supabase.from('caixa').select('*').eq('origem_id', origemId).eq('origem_tabela', 'compras')
    for (const cx of (cxList || [])) {
      if (cx?.conta_id) {
        const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id', cx.conta_id).single()
        if (ct) await supabase.from('contas').update({ saldo_atual: Number(ct.saldo_atual || 0) + Number(cx.valor) }).eq('id', cx.conta_id)
      }
    }
    await supabase.from('caixa').delete().eq('origem_id', origemId).eq('origem_tabela', 'compras')
  }

  // Marcar pago manualmente — só para compras SEM parcelas vinculadas
  async function marcarPago(r) {
    const parcelas = parcelasDeCompra(r.id)
    if (parcelas.length > 0) {
      toast('Esta compra tem parcelas em Contas a Pagar. Registre o pagamento lá — o status aqui atualiza automaticamente.', 'info')
      return
    }
    const novoStatus = r.status === 'pago' ? 'pendente' : 'pago'
    await supabase.from('compras').update({ status: novoStatus }).eq('id', r.id)
    if (novoStatus === 'pago') { await lancarCaixaCompra(r); toast('✅ Pago e lançado no Caixa!', 'success') }
    else { await removerCaixaCompra(r.id); toast('Revertido — removido do Caixa', 'info') }
    load()
  }

  // Sincroniza status de todas as compras com parcelas no banco
  async function sincronizarTodos() {
    let atualizados = 0
    for (const compra of rows) {
      const parcelas = parcelasDeCompra(compra.id)
      if (parcelas.length === 0) continue
      const novoStatus = statusCalculado(compra)
      if (novoStatus !== compra.status) {
        await supabase.from('compras').update({ status: novoStatus }).eq('id', compra.id)
        atualizados++
      }
    }
    toast(atualizados > 0 ? `✅ ${atualizados} compra(s) atualizada(s)!` : 'Todos os status já estão corretos.', atualizados > 0 ? 'success' : 'info')
    load()
  }

  async function toggleAtivo(r) { await supabase.from('compras').update({ ativo: !r.ativo }).eq('id', r.id); load() }

  async function destroy() {
    await removerCaixaCompra(deleting.id)
    await supabase.from('compras').delete().eq('id', deleting.id)
    toast('Excluído', 'success'); setDeleting(null); load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const statusColors = { pendente: 'badge-yellow', pago: 'badge-green', cancelado: 'badge-red', parcial: 'badge-orange' }
  const statusLabel = { pendente: 'Pendente', pago: 'Pago', parcial: 'Parcial', cancelado: 'Cancelado' }

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card blue"><div className="stat-label">Total em Compras</div><div className="stat-value blue text-mono">{fmt(total)}</div></div>
        <div className="stat-card yellow"><div className="stat-label">Pendente (sem pagamento)</div><div className="stat-value yellow text-mono">{fmt(totalPendente)}</div></div>
        <div className="stat-card orange"><div className="stat-label">Saldo Aberto (parciais)</div><div className="stat-value orange text-mono">{fmt(totalSaldoAberto)}</div></div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar descrição, fornecedor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="parcial">Parcial</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <button className="btn btn-secondary" onClick={sincronizarTodos} title="Recalcula status com base nas parcelas pagas">
          <RefreshCw size={14} /> Sincronizar
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showArquivados} onChange={e => setShowArquivados(e.target.checked)} style={{ width: 14, height: 14 }} />
          Mostrar arquivados
        </label>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Compra</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? <div className="empty-state"><ShoppingCart size={40} /><p>Nenhuma compra registrada</p></div> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th><th>Descrição</th><th>Fornecedor</th>
                    <th>Valor Total</th><th>Pago</th><th>Saldo Aberto</th>
                    <th style={{ textAlign: 'center' }}>Parcelas</th><th>Status</th><th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const statusReal = statusCalculado(r)
                    const parcelas = parcelasDeCompra(r.id)
                    const pago = valorPagoCompra(r.id)
                    const pendente = valorPendenteCompra(r.id)
                    const nParcelas = parcelas.length
                    const nPagas = parcelas.filter(p => p.pago).length
                    return (
                      <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                        <td className="text-mono text-muted" style={{ fontSize: 12 }}>{r.data?.split('-').reverse().join('/')}</td>
                        <td className="font-bold">{r.descricao}</td>
                        <td className="text-muted">{r.fornecedor || '—'}</td>
                        <td className="text-mono font-bold">{fmt(r.valor_total)}</td>
                        <td className="text-mono" style={{ color: pago > 0 ? 'var(--green)' : 'var(--text3)', fontSize: 12 }}>
                          {nParcelas > 0 ? fmt(pago) : '—'}
                        </td>
                        <td className="text-mono" style={{ color: pendente > 0 ? 'var(--yellow)' : 'var(--text3)', fontSize: 12 }}>
                          {nParcelas > 0 ? (pendente > 0 ? fmt(pendente) : '✓') : '—'}
                        </td>
                        <td style={{ fontSize: 12, textAlign: 'center' }}>
                          {nParcelas > 0
                            ? <span style={{ color: nPagas === nParcelas ? 'var(--green)' : nPagas > 0 ? 'var(--orange)' : 'var(--text2)', fontWeight: 700 }}>
                                {nPagas}/{nParcelas}
                              </span>
                            : '—'}
                        </td>
                        <td><span className={`badge ${statusColors[statusReal] || 'badge-yellow'}`}>{statusLabel[statusReal] || statusReal}</span></td>
                        <td>
                          <div className="action-btns">
                            <button className="icon-btn edit" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                            {nParcelas === 0 ? (
                              <button
                                className="icon-btn"
                                style={{ color: statusReal === 'pago' ? 'var(--green)' : 'var(--text2)' }}
                                title={statusReal === 'pago' ? 'Desmarcar pago' : 'Marcar como pago'}
                                onClick={() => marcarPago(r)}
                              ><CheckCircle size={14} /></button>
                            ) : (
                              <span title={`${nPagas}/${nParcelas} parcelas pagas — acesse Contas a Pagar para registrar pagamentos`}
                                style={{ color: 'var(--text3)', padding: '0 4px', cursor: 'help' }}>
                                <CreditCard size={14} />
                              </span>
                            )}
                            <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                            <button className="icon-btn del" onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {modal && (() => {
        const isImportada = editing && rows.find(r => r.id === editing)?.origem_tabela === 'entradas_estoque'
        const ro = isImportada // shorthand readonly
        const roStyle = ro ? { opacity: .65, cursor: 'not-allowed', pointerEvents: 'none' } : {}
        return (
        <Modal
          title={ro ? 'Visualizar Compra (importada de Entrada de Estoque)' : editing ? 'Editar Compra' : 'Nova Compra'}
          onClose={() => setModal(false)}
          onSave={save}
          size="modal-lg"
        >
          {ro && (
            <div style={{ background: 'rgba(79,142,247,.08)', border: '1px solid rgba(79,142,247,.25)', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: 'var(--text2)' }}>
              ℹ️ Esta compra foi gerada automaticamente por uma <strong>Entrada de Estoque</strong>. Os dados são somente leitura. Apenas o campo <strong>Observações</strong> pode ser editado.
            </div>
          )}
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input className="form-input" type="date" value={form.data} onChange={e => f('data', e.target.value)} readOnly={ro} style={roStyle} />
            </div>
            <div className="form-group">
              <label className="form-label">Valor Total {itensCompra.length > 0 ? '(calculado pelos itens)' : '*'}</label>
              <input className="form-input" type="number" step="0.01"
                value={itensCompra.length > 0 ? itensCompra.reduce((s, i) => s + Number(i.qtd) * Number(i.valor_unit), 0).toFixed(2) : form.valor_total}
                onChange={e => f('valor_total', e.target.value)}
                readOnly={ro || itensCompra.length > 0}
                style={ro || itensCompra.length > 0 ? { opacity: .7 } : {}} placeholder="0,00" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={form.descricao} onChange={e => f('descricao', e.target.value)} placeholder="O que foi comprado" readOnly={ro} style={roStyle} />
            </div>
            <div className="form-group">
              <label className="form-label">Fornecedor</label>
              <select className="form-select" value={form.fornecedor} onChange={e => f('fornecedor', e.target.value)} disabled={ro} style={roStyle}>
                <option value="">Selecionar...</option>
                {fornecedores.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                {ro && form.fornecedor && !fornecedores.find(p => p.nome === form.fornecedor) && (
                  <option value={form.fornecedor}>{form.fornecedor}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Forma de Pagamento</label>
              <select className="form-select" value={form.forma_pgto} onChange={e => f('forma_pgto', e.target.value)} disabled={ro} style={roStyle}>
                <option value="">Selecionar...</option>
                {['Dinheiro', 'Pix', 'Cartão Crédito', 'Cartão Débito', 'Boleto', 'Transferência'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Conta / Carteira</label>
              <select className="form-select" value={form.conta_id} onChange={e => f('conta_id', e.target.value)} disabled={ro} style={roStyle}>
                <option value="">Selecionar...</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => f('status', e.target.value)} disabled={ro} style={roStyle}>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="parcial">Parcial</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações {ro ? '(editável)' : ''}</label>
              <textarea className="form-textarea" value={form.obs} onChange={e => f('obs', e.target.value)} />
            </div>

            {/* Itens da Entrada de Estoque (readonly) */}
            {ro && itensEntrada.length > 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 12px' }} />
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={14} color="var(--accent)" /> Itens da nota fiscal
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: 'var(--bg3)' }}>
                      <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'left', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Produto / Descrição</th>
                      <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'center', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Qtd</th>
                      <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'right', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Unit.</th>
                      <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'right', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Total</th>
                    </tr></thead>
                    <tbody>
                      {itensEntrada.map((item, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px', fontSize: 13 }}>
                            {item.produto_nome || item.descricao || '—'}
                            {item.codigo_nf && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>{item.codigo_nf}</span>}
                          </td>
                          <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'center' }}>{item.qtd}</td>
                          <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(item.valor_unit)}</td>
                          <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(Number(item.qtd) * Number(item.valor_unit))}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid var(--border2)', background: 'var(--bg3)' }}>
                        <td colSpan={3} style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, textAlign: 'right' }}>Total</td>
                        <td style={{ padding: '8px 10px', fontSize: 14, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)', textAlign: 'right' }}>
                          {fmt(itensEntrada.reduce((s, i) => s + Number(i.qtd) * Number(i.valor_unit), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Itens editáveis — só para compras manuais */}
            {!ro && produtos.length > 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 12px' }} />
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={14} color="var(--accent)" /> Itens (atualiza estoque ao pagar)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px auto', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Produto</label>
                    <select className="form-select" value={addProd.produto_id} onChange={e => {
                      const p = produtos.find(x => x.id === e.target.value)
                      setAddProd(prev => ({ ...prev, produto_id: e.target.value, valor_unit: p?.preco_custo || '' }))
                    }}>
                      <option value="">Selecionar...</option>
                      {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} (est: {p.estoque || 0} {p.unidade})</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Qtd</label>
                    <input className="form-input" type="number" min={0.01} step="0.01" value={addProd.qtd} onChange={e => setAddProd(p => ({ ...p, qtd: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Vlr Unit.</label>
                    <input className="form-input" type="number" step="0.01" value={addProd.valor_unit} onChange={e => setAddProd(p => ({ ...p, valor_unit: e.target.value }))} placeholder="0,00" />
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 18 }} onClick={() => {
                    if (!addProd.produto_id || !addProd.qtd || !addProd.valor_unit) return
                    const prod = produtos.find(x => x.id === addProd.produto_id)
                    setItensCompra(prev => [...prev, { produto_id: addProd.produto_id, nome: prod?.nome || '', qtd: Number(addProd.qtd), valor_unit: Number(addProd.valor_unit) }])
                    setAddProd({ produto_id: '', qtd: 1, valor_unit: '' })
                  }}><Plus size={13} /></button>
                </div>
                {itensCompra.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: 'var(--bg3)' }}>
                        <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'left', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Produto</th>
                        <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'center', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Qtd</th>
                        <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'right', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Unit.</th>
                        <th style={{ padding: '7px 10px', fontSize: 10, textAlign: 'right', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Total</th>
                        <th style={{ width: 30 }} />
                      </tr></thead>
                      <tbody>
                        {itensCompra.map((item, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '7px 10px', fontSize: 13 }}>{item.nome}</td>
                            <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'center' }}>{item.qtd}</td>
                            <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(item.valor_unit)}</td>
                            <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmt(item.qtd * item.valor_unit)}</td>
                            <td style={{ padding: '4px' }}><button className="icon-btn del" onClick={() => setItensCompra(prev => prev.filter((_, j) => j !== i))}><Trash2 size={12} /></button></td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: '2px solid var(--border2)', background: 'var(--bg3)' }}>
                          <td colSpan={3} style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, textAlign: 'right' }}>Total</td>
                          <td style={{ padding: '8px 10px', fontSize: 14, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)', textAlign: 'right' }}>
                            {fmt(itensCompra.reduce((s, i) => s + i.qtd * i.valor_unit, 0))}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
        )
      })()}
      {deleting && <ConfirmDialog message={`Excluir "${deleting.descricao}"? O lançamento no Caixa também será removido.`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
