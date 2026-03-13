import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, CheckCircle } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]

const configs = {
  receitas: {
    table: 'receitas', newLabel: 'Nova Receita',
    pagoField: 'recebido', pagoLabel: 'Recebido',
    caixaTipo: 'entrada', caixaCategoria: 'Receita',
    empty: { data: today(), descricao: '', categoria: '', valor: '', conta_id: '', recebido: false, obs: '', ativo: true },
  },
  despesas: {
    table: 'despesas', newLabel: 'Nova Despesa',
    pagoField: 'pago', pagoLabel: 'Pago',
    caixaTipo: 'saida', caixaCategoria: 'Despesa',
    empty: { data: today(), descricao: '', categoria: '', valor: '', conta_id: '', pago: false, obs: '', ativo: true },
  },
}

export default function Financeiro({ module }) {
  const cfg = configs[module]
  const { user } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [contas, setContas] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...cfg.empty })
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { setRows([]); setForm({ ...cfg.empty }); load() }, [module])

  async function load() {
    setLoading(true)
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from(cfg.table).select('*').order('data', { ascending: false }),
      supabase.from('contas').select('id,nome,tipo').eq('ativo', true).order('nome'),
    ])
    setRows(r || [])
    setContas(c || [])
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchS = !q || r.descricao?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
    const matchStatus = filterStatus === '' ? true : filterStatus === 'sim' ? r[cfg.pagoField] : !r[cfg.pagoField]
    return matchS && matchStatus
  })

  const total = filtered.reduce((s, r) => s + Number(r.valor || 0), 0)
  const totalPago = filtered.filter(r => r[cfg.pagoField]).reduce((s, r) => s + Number(r.valor || 0), 0)

  function openNew() { setForm({ ...cfg.empty }); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.descricao?.trim()) return toast('Descrição é obrigatória', 'error')
    if (!form.valor) return toast('Valor é obrigatório', 'error')

    const jaPago = form[cfg.pagoField]
    let error
    const usuarioEmail = user?.email || ''
    const usuarioNome = user?.user_metadata?.name || usuarioEmail.split('@')[0] || ''
    if (editing) {
      const anterior = rows.find(r => r.id === editing)
      const eraPago = anterior?.[cfg.pagoField]

      ;({ error } = await supabase.from(cfg.table).update({ ...form, usuario_email: usuarioEmail, usuario_nome: usuarioNome }).eq('id', editing))
      if (error) { toast(error.message, 'error'); return }

      // Se mudou de não pago → pago, lança no caixa
      if (!eraPago && jaPago) await lancarCaixa(form)
      // Se mudou de pago → não pago, remove lançamento do caixa
      if (eraPago && !jaPago) await removerCaixa(editing)
    } else {
      const { data: novo, error: e } = await supabase.from(cfg.table).insert({ ...form, usuario_email: usuarioEmail, usuario_nome: usuarioNome }).select().single()
      if (e) { toast(e.message, 'error'); return }
      if (jaPago) await lancarCaixa({ ...form, id: novo.id })
    }

    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function lancarCaixa(r) {
    await supabase.from('caixa').insert({
      data: r.data || today(),
      tipo: cfg.caixaTipo,
      descricao: r.descricao,
      valor: r.valor,
      categoria: r.categoria || cfg.caixaCategoria,
      conta_id: r.conta_id || null,
      origem_id: r.id,
      origem_tabela: cfg.table,
      obs: r.obs,
    })
    // Atualiza saldo da conta se vinculada
    if (r.conta_id) {
      const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id', r.conta_id).single()
      if (ct) {
        const delta = cfg.caixaTipo === 'entrada' ? Number(r.valor) : -Number(r.valor)
        await supabase.from('contas').update({ saldo_atual: Number(ct.saldo_atual || 0) + delta }).eq('id', r.conta_id)
      }
    }
  }

  async function removerCaixa(origemId) {
    // Busca lançamento original para reverter saldo
    const { data: cx } = await supabase.from('caixa').select('*').eq('origem_id', origemId).eq('origem_tabela', cfg.table).single()
    if (cx?.conta_id) {
      const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id', cx.conta_id).single()
      if (ct) {
        const delta = cfg.caixaTipo === 'entrada' ? -Number(cx.valor) : Number(cx.valor)
        await supabase.from('contas').update({ saldo_atual: Number(ct.saldo_atual || 0) + delta }).eq('id', cx.conta_id)
      }
    }
    await supabase.from('caixa').delete().eq('origem_id', origemId).eq('origem_tabela', cfg.table)
  }

  async function togglePago(r) {
    const novoStatus = !r[cfg.pagoField]
    const update = { [cfg.pagoField]: novoStatus }
    if (novoStatus) update[cfg.pagoField === 'pago' ? 'data_pagamento' : 'data_recebimento'] = today()

    const { error } = await supabase.from(cfg.table).update(update).eq('id', r.id)
    if (error) { toast(error.message, 'error'); return }

    if (novoStatus) {
      await lancarCaixa({ ...r, [cfg.pagoField]: true })
      toast(`✅ ${cfg.pagoLabel} e lançado no Caixa!`, 'success')
    } else {
      await removerCaixa(r.id)
      toast('Revertido — lançamento removido do Caixa', 'info')
    }
    load()
  }

  async function toggleAtivo(r) {
    await supabase.from(cfg.table).update({ ativo: !r.ativo }).eq('id', r.id); load()
  }

  async function destroy() {
    await removerCaixa(deleting.id)
    await supabase.from(cfg.table).delete().eq('id', deleting.id)
    toast('Excluído', 'success'); setDeleting(null); load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const pagoLabel = cfg.pagoLabel

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card blue"><div className="stat-label">Total</div><div className="stat-value blue text-mono">{fmt(total)}</div></div>
        <div className="stat-card green"><div className="stat-label">{pagoLabel}</div><div className="stat-value green text-mono">{fmt(totalPago)}</div></div>
        <div className="stat-card yellow"><div className="stat-label">Pendente</div><div className="stat-value yellow text-mono">{fmt(total - totalPago)}</div></div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar descrição, categoria..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="nao">Pendentes</option>
          <option value="sim">{pagoLabel}s</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> {cfg.newLabel}</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? <div className="empty-state"><p>Nenhum registro</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Conta</th><th>Status</th><th>Ações</th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                      <td className="text-mono text-muted" style={{ fontSize: 12 }}>{r.data?.split('-').reverse().join('/')}</td>
                      <td className="font-bold">{r.descricao}</td>
                      <td className="text-muted">{r.categoria || '—'}</td>
                      <td className="text-mono font-bold">{fmt(r.valor)}</td>
                      <td className="text-muted" style={{ fontSize: 12 }}>{contas.find(c => c.id === r.conta_id)?.nome || '—'}</td>
                      <td><span className={`badge ${r[cfg.pagoField] ? 'badge-green' : 'badge-yellow'}`}>{r[cfg.pagoField] ? pagoLabel : 'Pendente'}</span></td>
                      <td><div className="action-btns">
                        <button className="icon-btn edit" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                        <button className="icon-btn" style={{ color: r[cfg.pagoField] ? 'var(--green)' : 'var(--text2)' }} title={r[cfg.pagoField] ? 'Desmarcar' : `Marcar como ${pagoLabel}`} onClick={() => togglePago(r)}><CheckCircle size={14} /></button>
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
        <Modal title={editing ? 'Editar' : cfg.newLabel} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input className="form-input" type="date" value={form.data} onChange={e => f('data', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Valor *</label>
              <input className="form-input" type="number" step="0.01" value={form.valor} onChange={e => f('valor', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={form.descricao} onChange={e => f('descricao', e.target.value)} placeholder="Descrição do lançamento" />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <input className="form-input" value={form.categoria} onChange={e => f('categoria', e.target.value)} placeholder="Ex: Alimentação, Salário..." />
            </div>
            <div className="form-group">
              <label className="form-label">Conta / Carteira</label>
              <select className="form-select" value={form.conta_id} onChange={e => f('conta_id', e.target.value)}>
                <option value="">Selecionar...</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
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
