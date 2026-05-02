import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, HardHat, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { today, fmtDate } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const STATUS_OBRA  = ['planejamento', 'em_andamento', 'concluida', 'cancelada']
const STATUS_LABEL = { planejamento: 'Planejamento', em_andamento: 'Em Andamento', concluida: 'Concluída', cancelada: 'Cancelada' }
const STATUS_COLOR = { planejamento: 'badge-blue', em_andamento: 'badge-yellow', concluida: 'badge-green', cancelada: 'badge-red' }

const EMPTY_OBRA = { nome: '', cliente_id: '', cliente_nome: '', status: 'planejamento', valor_contratado: '', data_inicio: today(), data_fim: '', obs: '' }
const EMPTY_LANC = { tipo: 'despesa', descricao: '', valor: '', pago_por: '', reembolsavel: false, data_ref: today(), obs: '' }

export default function Obras() {
  const toast = useToast()
  const [rows, setRows]                   = useState([])
  const [lancamentosMap, setLancamentosMap] = useState({})
  const [clientes, setClientes]           = useState([])
  const [fontesPagamento, setFontesPagamento] = useState([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [showArquivados, setShowArquivados] = useState(false)
  const [modal, setModal]                 = useState(false)
  const [form, setForm]                   = useState(EMPTY_OBRA)
  const [editing, setEditing]             = useState(null)
  const [deleting, setDeleting]           = useState(null)
  const [obraSel, setObraSel]             = useState(null)
  const [modalLanc, setModalLanc]         = useState(false)
  const [formLanc, setFormLanc]           = useState(EMPTY_LANC)
  const [editingLanc, setEditingLanc]     = useState(null)
  const [deletingLanc, setDeletingLanc]   = useState(null)

  useEffect(() => {
    load()
    supabase.from('pessoas').select('id,nome').in('tipo', ['cliente', 'ambos']).eq('ativo', true).order('nome')
      .then(({ data }) => setClientes(data || []))
    supabase.from('obras_fontes_pagamento').select('id,nome').eq('ativo', true).order('nome')
      .then(({ data }) => setFontesPagamento(data || []))
  }, [])

  async function load() {
    setLoading(true)
    const { data: obras, error } = await supabase.from('obras').select('*').order('data_inicio', { ascending: false })
    if (error) { toast(error.message, 'error'); setLoading(false); return }
    setRows(obras || [])
    if ((obras || []).length > 0) {
      const ids = obras.map(o => o.id)
      const { data: lancs } = await supabase.from('obra_lancamentos').select('*').in('obra_id', ids).order('data_ref', { ascending: false })
      const mapa = {}
      for (const l of (lancs || [])) {
        if (!mapa[l.obra_id]) mapa[l.obra_id] = []
        mapa[l.obra_id].push(l)
      }
      setLancamentosMap(mapa)
    } else {
      setLancamentosMap({})
    }
    setLoading(false)
  }

  const lancsDaObra = id => lancamentosMap[id] || []
  const gastoObra   = id => lancsDaObra(id).filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor || 0), 0)

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchQ    = !q || r.nome?.toLowerCase().includes(q) || r.cliente_nome?.toLowerCase().includes(q)
    const matchS    = !filterStatus || r.status === filterStatus
    const matchAtivo = showArquivados ? true : r.ativo !== false
    return matchQ && matchS && matchAtivo
  })

  const totalContratado = filtered.reduce((s, r) => s + Number(r.valor_contratado || 0), 0)
  const totalGasto      = filtered.reduce((s, r) => s + gastoObra(r.id), 0)
  const totalSaldo      = totalContratado - totalGasto

  function openNew()  { setForm(EMPTY_OBRA); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.nome?.trim()) return toast('Nome obrigatório', 'error')
    const payload = { ...form }
    if (form.cliente_id) {
      const c = clientes.find(x => x.id === form.cliente_id)
      if (c) payload.cliente_nome = c.nome
    }
    let error
    if (editing) ({ error } = await supabase.from('obras').update(payload).eq('id', editing))
    else         ({ error } = await supabase.from('obras').insert(payload))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModal(false); load()
  }

  async function toggleAtivo(r) {
    await supabase.from('obras').update({ ativo: !r.ativo }).eq('id', r.id)
    load()
  }

  async function destroy() {
    await supabase.from('obra_lancamentos').delete().eq('obra_id', deleting.id)
    await supabase.from('obras').delete().eq('id', deleting.id)
    if (obraSel?.id === deleting.id) setObraSel(null)
    toast('Excluído', 'success'); setDeleting(null); load()
  }

  function selectObra(r) { setObraSel(prev => prev?.id === r.id ? null : r) }

  function openNewLanc()   { setFormLanc(EMPTY_LANC); setEditingLanc(null); setModalLanc(true) }
  function openEditLanc(l) { setFormLanc({ ...l }); setEditingLanc(l.id); setModalLanc(true) }

  async function saveLanc() {
    if (!formLanc.descricao?.trim()) return toast('Descrição obrigatória', 'error')
    if (!formLanc.valor)             return toast('Valor obrigatório', 'error')
    const payload = { ...formLanc, obra_id: obraSel.id }
    let error
    if (editingLanc) ({ error } = await supabase.from('obra_lancamentos').update(payload).eq('id', editingLanc))
    else             ({ error } = await supabase.from('obra_lancamentos').insert(payload))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModalLanc(false); load()
  }

  async function destroyLanc() {
    await supabase.from('obra_lancamentos').delete().eq('id', deletingLanc.id)
    toast('Excluído', 'success'); setDeletingLanc(null); load()
  }

  const f  = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const fl = (k, v) => setFormLanc(p => ({ ...p, [k]: v }))

  return (
    <div>
      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card blue"><div className="stat-label">Total Contratos</div><div className="stat-value blue text-mono">{fmt(totalContratado)}</div></div>
        <div className="stat-card red"><div className="stat-label">Total Gastos</div><div className="stat-value red text-mono">{fmt(totalGasto)}</div></div>
        <div className="stat-card green"><div className="stat-label">Saldo</div><div className="stat-value green text-mono">{fmt(totalSaldo)}</div></div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar obra, cliente..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_OBRA.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showArquivados} onChange={e => setShowArquivados(e.target.checked)} style={{ width: 14, height: 14 }} />
          Mostrar arquivados
        </label>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Obra</button>
      </div>

      {/* Tabela de obras */}
      <div className="card">
        {loading
          ? <div className="loading"><div className="spinner" /></div>
          : filtered.length === 0
            ? <div className="empty-state"><HardHat size={40} /><p>Nenhuma obra registrada</p></div>
            : <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th><th>Cliente</th><th>Status</th>
                      <th>Contratado</th><th>Gasto</th><th>Saldo</th>
                      <th>Início</th><th>Fim</th><th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const gasto  = gastoObra(r.id)
                      const saldo  = Number(r.valor_contratado || 0) - gasto
                      const isOpen = obraSel?.id === r.id
                      const lancs  = lancsDaObra(r.id)
                      return (
                        <React.Fragment key={r.id}>
                          <tr
                            style={{ opacity: r.ativo ? 1 : .5, background: isOpen ? 'var(--bg3)' : undefined, cursor: 'pointer' }}
                            onClick={() => selectObra(r)}
                          >
                            <td className="font-bold">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {isOpen
                                  ? <ChevronUp size={13} color="var(--accent)" />
                                  : <ChevronDown size={13} color="var(--text3)" />}
                                {r.nome}
                              </div>
                            </td>
                            <td className="text-muted">{r.cliente_nome || '—'}</td>
                            <td><span className={`badge ${STATUS_COLOR[r.status] || 'badge-gray'}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                            <td className="text-mono font-bold">{r.valor_contratado ? fmt(r.valor_contratado) : '—'}</td>
                            <td className="text-mono" style={{ color: gasto > 0 ? 'var(--red)' : 'var(--text3)', fontSize: 12 }}>{fmt(gasto)}</td>
                            <td className="text-mono" style={{ color: saldo >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 12, fontWeight: 700 }}>
                              {r.valor_contratado ? fmt(saldo) : '—'}
                            </td>
                            <td className="text-muted" style={{ fontSize: 12 }}>{fmtDate(r.data_inicio)}</td>
                            <td className="text-muted" style={{ fontSize: 12 }}>{fmtDate(r.data_fim)}</td>
                            <td onClick={e => e.stopPropagation()}>
                              <div className="action-btns">
                                <button className="icon-btn edit"   onClick={() => openEdit(r)}><Pencil size={14} /></button>
                                <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                                <button className="icon-btn del"    onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>

                          {/* Painel de lançamentos — expande inline */}
                          {isOpen && (
                            <tr>
                              <td colSpan={9} style={{ padding: 0, background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                                <div style={{ padding: '14px 20px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>
                                      Lançamentos — {r.nome}
                                    </div>
                                    <button className="btn btn-primary btn-sm" onClick={openNewLanc}>
                                      <Plus size={13} /> Novo Lançamento
                                    </button>
                                  </div>

                                  {lancs.length === 0
                                    ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: '4px 0' }}>Nenhum lançamento registrado.</div>
                                    : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                          <tr style={{ background: 'var(--bg3)' }}>
                                            {['Tipo','Descrição','Valor','Pago por','Reemb.','Data',''].map((h, i) => (
                                              <th key={i} style={{ padding: '7px 10px', fontSize: 10, textAlign: i === 2 ? 'right' : i === 4 ? 'center' : 'left', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {lancs.map(l => (
                                            <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                                              <td style={{ padding: '7px 10px' }}>
                                                <span className={`badge ${l.tipo === 'despesa' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: 10 }}>
                                                  {l.tipo === 'despesa' ? 'Despesa' : 'Receita'}
                                                </span>
                                              </td>
                                              <td style={{ padding: '7px 10px', fontSize: 13, fontWeight: 600 }}>{l.descricao}</td>
                                              <td style={{ padding: '7px 10px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: l.tipo === 'despesa' ? 'var(--red)' : 'var(--green)' }}>
                                                {fmt(l.valor)}
                                              </td>
                                              <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text2)' }}>{l.pago_por || '—'}</td>
                                              <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                                {l.reembolsavel
                                                  ? <CheckCircle size={13} color="var(--green)" />
                                                  : <span style={{ color: 'var(--text3)' }}>—</span>}
                                              </td>
                                              <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--text2)' }}>{fmtDate(l.data_ref)}</td>
                                              <td style={{ padding: '4px 10px' }}>
                                                <div className="action-btns">
                                                  <button className="icon-btn edit" onClick={() => openEditLanc(l)}><Pencil size={13} /></button>
                                                  <button className="icon-btn del"  onClick={() => setDeletingLanc(l)}><Trash2 size={13} /></button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                  }
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
        }
      </div>

      {/* Modal Obra */}
      {modal && (
        <Modal title={editing ? 'Editar Obra' : 'Nova Obra'} onClose={() => setModal(false)} onSave={save} size="modal-lg">
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome da Obra *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)}
                placeholder="Ex: Reforma Cozinha, Construção Quarto..." autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Cliente</label>
              <select className="form-select" value={form.cliente_id} onChange={e => f('cliente_id', e.target.value)}>
                <option value="">Selecionar...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => f('status', e.target.value)}>
                {STATUS_OBRA.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Valor Contratado</label>
              <input className="form-input" type="number" step="0.01" value={form.valor_contratado}
                onChange={e => f('valor_contratado', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Data de Início</label>
              <input className="form-input" type="date" value={form.data_inicio} onChange={e => f('data_inicio', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Data de Conclusão</label>
              <input className="form-input" type="date" value={form.data_fim} onChange={e => f('data_fim', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.obs || ''} onChange={e => f('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Lançamento */}
      {modalLanc && (
        <Modal title={editingLanc ? 'Editar Lançamento' : 'Novo Lançamento'} onClose={() => setModalLanc(false)} onSave={saveLanc}>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={formLanc.tipo} onChange={e => fl('tipo', e.target.value)}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Valor *</label>
              <input className="form-input" type="number" step="0.01" value={formLanc.valor}
                onChange={e => fl('valor', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={formLanc.descricao} onChange={e => fl('descricao', e.target.value)}
                placeholder="Ex: Material elétrico, Mão de obra..." autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Pago por</label>
              <select className="form-select" value={formLanc.pago_por} onChange={e => fl('pago_por', e.target.value)}>
                <option value="">Selecionar...</option>
                {fontesPagamento.map(fp => <option key={fp.id} value={fp.nome}>{fp.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data de Referência</label>
              <input className="form-input" type="date" value={formLanc.data_ref} onChange={e => fl('data_ref', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={formLanc.reembolsavel} onChange={e => fl('reembolsavel', e.target.checked)} style={{ width: 15, height: 15 }} />
                Reembolsável
              </label>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={formLanc.obs || ''} onChange={e => fl('obs', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Excluir a obra "${deleting.nome}"? Todos os lançamentos vinculados também serão removidos.`}
          onConfirm={destroy} onCancel={() => setDeleting(null)} />
      )}
      {deletingLanc && (
        <ConfirmDialog
          message={`Excluir o lançamento "${deletingLanc.descricao}"?`}
          onConfirm={destroyLanc} onCancel={() => setDeletingLanc(null)} />
      )}
    </div>
  )
}
