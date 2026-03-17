import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const EMPTY = { data: today(), tipo: 'entrada', descricao: '', valor: '', categoria: '', obs: '', ativo: true }

export default function Caixa() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [modalTransf, setModalTransf] = useState(false)
  const [transfForm, setTransfForm] = useState({ data: today(), contaOrigem: '', contaDestino: '', valor: '', descricao: 'Transferência entre contas', obs: '' })
  const [contas, setContas] = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data, error }, { data: contasData }] = await Promise.all([
      supabase.from('caixa').select('*').order('data', { ascending: false }),
      supabase.from('contas').select('id,nome,saldo_atual').eq('ativo', true).order('nome'),
    ])
    setContas(contasData || [])
    if (error) toast(error.message, 'error')
    else setRows(data || [])
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchS = !q || r.descricao?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
    const matchT = !filterTipo || r.tipo === filterTipo
    return matchS && matchT
  })

  const entradas = filtered.filter(r => r.tipo === 'entrada').reduce((s, r) => s + Number(r.valor || 0), 0)
  const saidas = filtered.filter(r => r.tipo === 'saida').reduce((s, r) => s + Number(r.valor || 0), 0)
  const saldo = entradas - saidas

  function openNew() { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function transferir() {
    const { contaOrigem, contaDestino, valor, descricao, data, obs } = transfForm
    if (!contaOrigem) return toast('Selecione a conta de origem', 'error')
    if (!contaDestino) return toast('Selecione a conta de destino', 'error')
    if (contaOrigem === contaDestino) return toast('Origem e destino devem ser diferentes', 'error')
    if (!valor || Number(valor) <= 0) return toast('Informe o valor', 'error')
    const v = Number(valor)
    const origemNome = contas.find(c => c.id === contaOrigem)?.nome || ''
    const destinoNome = contas.find(c => c.id === contaDestino)?.nome || ''

    // Lança saída na conta origem
    await supabase.from('caixa').insert({
      data, tipo: 'saida',
      descricao: `${descricao} → ${destinoNome}`,
      valor: v, categoria: 'Transferência',
      conta_id: contaOrigem, obs,
      origem_tabela: 'transferencia',
    })
    // Lança entrada na conta destino
    await supabase.from('caixa').insert({
      data, tipo: 'entrada',
      descricao: `${descricao} ← ${origemNome}`,
      valor: v, categoria: 'Transferência',
      conta_id: contaDestino, obs,
      origem_tabela: 'transferencia',
    })
    // Atualiza saldos
    const contaOrig = contas.find(c => c.id === contaOrigem)
    const contaDest = contas.find(c => c.id === contaDestino)
    if (contaOrig) await supabase.from('contas').update({ saldo_atual: Number(contaOrig.saldo_atual||0) - v }).eq('id', contaOrigem)
    if (contaDest) await supabase.from('contas').update({ saldo_atual: Number(contaDest.saldo_atual||0) + v }).eq('id', contaDestino)

    toast(`✅ Transferência de ${fmt(v)} realizada!`, 'success')
    setModalTransf(false)
    setTransfForm({ data: today(), contaOrigem: '', contaDestino: '', valor: '', descricao: 'Transferência entre contas', obs: '' })
    load()
  }

  async function save() {
    if (!form.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (!form.valor) return toast('Valor obrigatório', 'error')
    let error
    if (editing) ({ error } = await supabase.from('caixa').update(form).eq('id', editing))
    else ({ error } = await supabase.from('caixa').insert(form))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function destroy() {
    await supabase.from('caixa').delete().eq('id', deleting.id)
    toast('Excluído', 'success'); setDeleting(null); load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card green"><div className="stat-label">Entradas</div><div className="stat-value green text-mono">{fmt(entradas)}</div></div>
        <div className="stat-card red"><div className="stat-label">Saídas</div><div className="stat-value red text-mono">{fmt(saidas)}</div></div>
        <div className="stat-card blue"><div className="stat-label">Saldo</div><div className={`stat-value text-mono ${saldo >= 0 ? 'green' : 'red'}`}>{fmt(saldo)}</div></div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="entrada">Entradas</option>
          <option value="saida">Saídas</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Novo Lançamento</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0 ? <div className="empty-state"><p>Nenhum lançamento</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Ações</th></tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="text-mono text-muted" style={{ fontSize: 12 }}>{r.data?.split('-').reverse().join('/')}</td>
                      <td>
                        <span className={`badge ${r.tipo === 'entrada' ? 'badge-green' : 'badge-red'}`} style={{ display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
                          {r.tipo === 'entrada' ? <ArrowUpCircle size={11} /> : <ArrowDownCircle size={11} />}
                          {r.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className="font-bold">{r.descricao}</td>
                      <td className="text-muted">{r.categoria || '—'}</td>
                      <td className={`text-mono font-bold ${r.tipo === 'entrada' ? 'text-green' : 'text-red'}`}>
                        {r.tipo === 'entrada' ? '+' : '-'}{fmt(r.valor)}
                      </td>
                      <td><div className="action-btns">
                        <button className="icon-btn edit" onClick={() => openEdit(r)}><Pencil size={14} /></button>
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
        <Modal title={editing ? 'Editar Lançamento' : 'Novo Lançamento'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Data *</label>
              <input className="form-input" type="date" value={form.data} onChange={e => f('data', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
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
              <input className="form-input" value={form.categoria} onChange={e => f('categoria', e.target.value)} placeholder="Ex: Alimentação" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}
      {modalTransf && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <span className="modal-title"><ArrowLeftRight size={16}/> Transferência entre Contas</span>
              <button className="icon-btn" onClick={() => setModalTransf(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date" value={transfForm.data} onChange={e => setTransfForm(p=>({...p,data:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Valor *</label>
                  <input className="form-input" type="number" step="0.01" value={transfForm.valor} onChange={e => setTransfForm(p=>({...p,valor:e.target.value}))} placeholder="0,00" autoFocus/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Conta Origem *</label>
                  <select className="form-select" value={transfForm.contaOrigem} onChange={e => setTransfForm(p=>({...p,contaOrigem:e.target.value}))}>
                    <option value="">Selecionar...</option>
                    {contas.map(c=><option key={c.id} value={c.id}>{c.nome} — saldo: {fmt(c.saldo_atual)}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Conta Destino *</label>
                  <select className="form-select" value={transfForm.contaDestino} onChange={e => setTransfForm(p=>({...p,contaDestino:e.target.value}))}>
                    <option value="">Selecionar...</option>
                    {contas.filter(c=>c.id!==transfForm.contaOrigem).map(c=><option key={c.id} value={c.id}>{c.nome} — saldo: {fmt(c.saldo_atual)}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Descrição</label>
                  <input className="form-input" value={transfForm.descricao} onChange={e => setTransfForm(p=>({...p,descricao:e.target.value}))}/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Observações</label>
                  <textarea className="form-textarea" rows={2} value={transfForm.obs} onChange={e => setTransfForm(p=>({...p,obs:e.target.value}))}/>
                </div>
              </div>
              {transfForm.contaOrigem && transfForm.contaDestino && transfForm.valor && (
                <div style={{background:'rgba(79,142,247,.08)',border:'1px solid rgba(79,142,247,.2)',borderRadius:8,padding:'10px 14px',fontSize:12,marginTop:8}}>
                  💸 <strong>{fmt(Number(transfForm.valor))}</strong> sairá de <strong>{contas.find(c=>c.id===transfForm.contaOrigem)?.nome}</strong> e entrará em <strong>{contas.find(c=>c.id===transfForm.contaDestino)?.nome}</strong>
                </div>
              )}
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setModalTransf(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={transferir}><ArrowLeftRight size={14}/> Confirmar Transferência</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleting && <ConfirmDialog message={`Excluir "${deleting.descricao}"?`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
