import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, ShoppingCart, CheckCircle } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const EMPTY = { data: today(), fornecedor: '', descricao: '', valor_total: '', status: 'pendente', forma_pgto: '', conta_id: '', obs: '', ativo: true }

export default function Compras() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [fornecedores, setFornecedores] = useState([])
  const [contas, setContas] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    load()
    supabase.from('pessoas').select('id, nome').in('tipo', ['fornecedor', 'ambos']).eq('ativo', true).then(({ data }) => setFornecedores(data || []))
    supabase.from('contas').select('id,nome').eq('ativo', true).order('nome').then(({ data }) => setContas(data || []))
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('compras').select('*').order('data', { ascending: false })
    if (error) toast(error.message, 'error')
    else setRows(data)
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchS = !q || r.descricao?.toLowerCase().includes(q) || r.fornecedor?.toLowerCase().includes(q)
    const matchF = !filterStatus || r.status === filterStatus
    return matchS && matchF
  })

  const total = filtered.reduce((s, r) => s + Number(r.valor_total || 0), 0)

  function openNew() { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (!form.valor_total) return toast('Valor obrigatório', 'error')

    const anterior = editing ? rows.find(r => r.id === editing) : null
    const eraP = anterior?.status === 'pago'
    const agora = form.status === 'pago'

    let savedId = editing
    let error
    if (editing) {
      ;({ error } = await supabase.from('compras').update(form).eq('id', editing))
    } else {
      const { data: novo, error: e } = await supabase.from('compras').insert(form).select().single()
      error = e; if (novo) savedId = novo.id
    }
    if (error) { toast(error.message, 'error'); return }

    if (!eraP && agora) await lancarCaixaCompra({ ...form, id: savedId })
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
  }

  async function removerCaixaCompra(origemId) {
    const { data: cx } = await supabase.from('caixa').select('*').eq('origem_id', origemId).eq('origem_tabela', 'compras').single()
    if (cx?.conta_id) {
      const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id', cx.conta_id).single()
      if (ct) await supabase.from('contas').update({ saldo_atual: Number(ct.saldo_atual || 0) + Number(cx.valor) }).eq('id', cx.conta_id)
    }
    await supabase.from('caixa').delete().eq('origem_id', origemId).eq('origem_tabela', 'compras')
  }

  async function marcarPago(r) {
    const novoStatus = r.status === 'pago' ? 'pendente' : 'pago'
    await supabase.from('compras').update({ status: novoStatus }).eq('id', r.id)
    if (novoStatus === 'pago') { await lancarCaixaCompra(r); toast('✅ Pago e lançado no Caixa!', 'success') }
    else { await removerCaixaCompra(r.id); toast('Revertido — removido do Caixa', 'info') }
    load()
  }

  async function toggleAtivo(r) {
    await supabase.from('compras').update({ ativo: !r.ativo }).eq('id', r.id); load()
  }

  async function destroy() {
    await removerCaixaCompra(deleting.id)
    await supabase.from('compras').delete().eq('id', deleting.id)
    toast('Excluído', 'success'); setDeleting(null); load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const statusColors = { pendente: 'badge-yellow', pago: 'badge-green', cancelado: 'badge-red', parcial: 'badge-orange' }

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 16 }}>
        <div className="stat-card blue"><div className="stat-label">Total em Compras</div><div className="stat-value blue text-mono">{fmt(total)}</div></div>
        <div className="stat-card yellow"><div className="stat-label">Pendentes</div><div className="stat-value yellow text-mono">{fmt(filtered.filter(r => r.status === 'pendente').reduce((s, r) => s + Number(r.valor_total || 0), 0))}</div></div>
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
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Compra</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? <div className="empty-state"><ShoppingCart size={40} /><p>Nenhuma compra registrada</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Descrição</th><th>Fornecedor</th><th>Valor</th><th>Forma Pgto</th><th>Conta</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                      <td className="text-mono text-muted" style={{ fontSize: 12 }}>{r.data?.split('-').reverse().join('/')}</td>
                      <td className="font-bold">{r.descricao}</td>
                      <td className="text-muted">{r.fornecedor || '—'}</td>
                      <td className="text-mono font-bold">{fmt(r.valor_total)}</td>
                      <td className="text-muted">{r.forma_pgto || '—'}</td>
                      <td className="text-muted" style={{ fontSize: 12 }}>{contas.find(c => c.id === r.conta_id)?.nome || '—'}</td>
                      <td><span className={`badge ${statusColors[r.status]}`}>{r.status}</span></td>
                      <td><div className="action-btns">
                        <button className="icon-btn edit" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                        <button className="icon-btn" style={{ color: r.status === 'pago' ? 'var(--green)' : 'var(--text2)' }} title={r.status === 'pago' ? 'Desmarcar pago' : 'Marcar como pago'} onClick={() => marcarPago(r)}><CheckCircle size={14} /></button>
                        <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                        <button className="icon-btn del" onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Compra' : 'Nova Compra'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input className="form-input" type="date" value={form.data} onChange={e => f('data', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Valor Total *</label>
              <input className="form-input" type="number" step="0.01" value={form.valor_total} onChange={e => f('valor_total', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={form.descricao} onChange={e => f('descricao', e.target.value)} placeholder="O que foi comprado" />
            </div>
            <div className="form-group">
              <label className="form-label">Fornecedor</label>
              <select className="form-select" value={form.fornecedor} onChange={e => f('fornecedor', e.target.value)}>
                <option value="">Selecionar...</option>
                {fornecedores.map(p => <option key={p.id} value={p.nome}>{p.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Forma de Pagamento</label>
              <select className="form-select" value={form.forma_pgto} onChange={e => f('forma_pgto', e.target.value)}>
                <option value="">Selecionar...</option>
                {['Dinheiro','Pix','Cartão Crédito','Cartão Débito','Boleto','Transferência'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Conta / Carteira</label>
              <select className="form-select" value={form.conta_id} onChange={e => f('conta_id', e.target.value)}>
                <option value="">Selecionar...</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => f('status', e.target.value)}>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="parcial">Parcial</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
      {deleting && <ConfirmDialog message={`Excluir "${deleting.descricao}"? O lançamento no Caixa também será removido.`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
