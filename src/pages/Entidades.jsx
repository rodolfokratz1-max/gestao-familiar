import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Plus, Pencil, Power, Trash2, Building2, User,
  Shield, ChevronDown, ChevronUp, UserPlus, X, Check
} from 'lucide-react'

const NIVEL_LABEL = { 1: 'Leitura', 2: 'Operador', 3: 'Gestor', 4: 'Admin' }
const NIVEL_COLOR = { 1: 'badge-gray', 2: 'badge-blue', 3: 'badge-green', 4: 'badge-yellow' }
const CORES = ['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#be185d','#854d0e']

const EMPTY_ENT = {
  nome: '', nome_fantasia: '', tipo: 'pj',
  cnpj_cpf: '', ie: '', telefone: '', email: '',
  endereco: '', cidade: '', estado: '', cep: '',
  cor_tema: '#2563eb', logo_base64: '', ativo: true
}

export default function Entidades() {
  const toast = useToast()
  const { entidadeAtiva, pode, recarregar } = useEntidade()
  const { user } = useAuth()

  const [rows, setRows]         = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [vinculos, setVinculos] = useState({}) // { entidade_id: [{ id, usuario_id, nome, email, nivel }] }
  const [loading, setLoading]   = useState(true)

  // Modal entidade
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(EMPTY_ENT)
  const [editing, setEditing]   = useState(null)
  const [deleting, setDeleting] = useState(null)

  // Painel de vínculos expandido
  const [expanded, setExpanded] = useState(null)

  // Modal vínculo
  const [modalVinculo, setModalVinculo]   = useState(false)
  const [entidadeVinculo, setEntidadeVinculo] = useState(null)
  const [formVinculo, setFormVinculo]     = useState({ usuario_id: '', nivel: 2 })
  const [deletingVinculo, setDeletingVinculo] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: ents }, { data: usrs }, { data: vincs }] = await Promise.all([
      supabase.from('entidades').select('*').order('nome'),
      supabase.from('usuarios_app').select('id,nome,email').eq('ativo', true).order('nome'),
      supabase.from('usuario_entidades').select(`
        id, usuario_id, entidade_id, nivel, ativo,
        usuario:usuarios_app(id, nome, email)
      `).eq('ativo', true),
    ])
    setRows(ents || [])
    setUsuarios(usrs || [])
    // Monta mapa de vínculos por entidade
    const mapa = {}
    for (const v of (vincs || [])) {
      if (!mapa[v.entidade_id]) mapa[v.entidade_id] = []
      mapa[v.entidade_id].push({
        id: v.id, usuario_id: v.usuario_id,
        nome: v.usuario?.nome, email: v.usuario?.email,
        nivel: v.nivel
      })
    }
    setVinculos(mapa)
    setLoading(false)
  }

  // ── Entidade CRUD ────────────────────────────────────────────────────────

  function openNew()   { setForm({ ...EMPTY_ENT }); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.nome?.trim()) return toast('Nome obrigatório', 'error')
    const payload = { ...form, cnpj_cpf: form.cnpj_cpf || null }
    let error
    if (editing) {
      ;({ error } = await supabase.from('entidades').update(payload).eq('id', editing))
    } else {
      // Cria entidade
      const { data: nova, error: eIns } = await supabase.from('entidades').insert(payload).select().single()
      error = eIns
      if (!error && nova) {
        // Busca o id interno do usuário logado e cria vínculo como admin
        const { data: ua } = await supabase.from('usuarios_app').select('id').eq('auth_id', user?.id).single()
        if (ua) {
          await supabase.from('usuario_entidades').insert({
            usuario_id:  ua.id,
            entidade_id: nova.id,
            nivel:       4,
            ativo:       true,
          })
        }
      }
    }
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success')
    setModal(false)
    load()
    recarregar()
  }

  async function toggleAtivo(r) {
    await supabase.from('entidades').update({ ativo: !r.ativo }).eq('id', r.id)
    load(); recarregar()
  }

  async function destroy() {
    // Verifica se tem dados vinculados antes de excluir
    const { count } = await supabase.from('caixa').select('id', { count: 'exact', head: true }).eq('entidade_id', deleting.id)
    if (count > 0) {
      toast(`Não é possível excluir — existem ${count} lançamentos vinculados a esta entidade.`, 'error')
      setDeleting(null); return
    }
    await supabase.from('usuario_entidades').delete().eq('entidade_id', deleting.id)
    await supabase.from('entidades').delete().eq('id', deleting.id)
    toast('Entidade excluída', 'success')
    setDeleting(null); load(); recarregar()
  }

  // ── Vínculos ─────────────────────────────────────────────────────────────

  function openVinculo(ent) {
    setEntidadeVinculo(ent)
    setFormVinculo({ usuario_id: '', nivel: 2 })
    setModalVinculo(true)
  }

  async function saveVinculo() {
    if (!formVinculo.usuario_id) return toast('Selecione um usuário', 'error')
    const { error } = await supabase.from('usuario_entidades').upsert({
      usuario_id:  formVinculo.usuario_id,
      entidade_id: entidadeVinculo.id,
      nivel:       formVinculo.nivel,
      ativo:       true,
    }, { onConflict: 'usuario_id,entidade_id' })
    if (error) { toast(error.message, 'error'); return }
    toast('Acesso concedido!', 'success')
    setModalVinculo(false)
    load(); recarregar()
  }

  async function updateNivelVinculo(vinculoId, novoNivel) {
    await supabase.from('usuario_entidades').update({ nivel: novoNivel }).eq('id', vinculoId)
    load(); recarregar()
  }

  async function destroyVinculo() {
    await supabase.from('usuario_entidades').update({ ativo: false }).eq('id', deletingVinculo.id)
    toast('Acesso removido', 'success')
    setDeletingVinculo(null); load(); recarregar()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const isAdmin = pode('admin')

  if (loading) return <div className="loading"><div className="spinner" /></div>

  return (
    <div>
      {/* Info */}
      <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(79,142,247,.07)', border: '1px solid rgba(79,142,247,.2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
        <strong style={{ color: 'var(--accent)' }}>Entidades</strong> são empresas (PJ) ou pessoas físicas (PF) com dados financeiros isolados.
        Cada usuário acessa apenas as entidades que têm vínculo. O seletor no topo da tela define com qual entidade você está trabalhando.
      </div>

      <div className="toolbar">
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Entidade</button>
        )}
      </div>

      <div className="card">
        {rows.length === 0
          ? <div className="empty-state"><Building2 size={40} /><p>Nenhuma entidade cadastrada</p></div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {rows.map((r, idx) => {
                const isOpen    = expanded === r.id
                const isAtiva   = entidadeAtiva?.id === r.id
                const vincsEnt  = vinculos[r.id] || []
                const cor       = r.cor_tema || '#2563eb'

                return (
                  <div key={r.id} style={{
                    borderBottom: idx < rows.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: r.ativo ? 1 : .5,
                  }}>
                    {/* Linha principal */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
                      onClick={() => setExpanded(isOpen ? null : r.id)}>

                      {/* Cor + ícone */}
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cor}18`, border: `1px solid ${cor}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {r.tipo === 'pj'
                          ? <Building2 size={16} color={cor} />
                          : <User      size={16} color={cor} />}
                      </div>

                      {/* Nome */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{r.nome_fantasia || r.nome}</span>
                          {isAtiva && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${cor}20`, color: cor, border: `1px solid ${cor}40` }}>
                              ativa
                            </span>
                          )}
                          <span className={`badge ${r.tipo === 'pj' ? 'badge-blue' : 'badge-purple'}`} style={{ fontSize: 10 }}>
                            {r.tipo === 'pj' ? 'Empresa PJ' : 'Pessoa PF'}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 12 }}>
                          {r.cnpj_cpf && <span>{r.cnpj_cpf}</span>}
                          {r.cidade   && <span>{r.cidade}{r.estado ? ` — ${r.estado}` : ''}</span>}
                          <span>{vincsEnt.length} usuário{vincsEnt.length !== 1 ? 's' : ''} com acesso</span>
                        </div>
                      </div>

                      {/* Ações */}
                      {isAdmin && (
                        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button className="icon-btn edit"   onClick={() => openEdit(r)}><Pencil size={14} /></button>
                          <button className="icon-btn toggle" onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                          <button className="icon-btn del"    onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                        </div>
                      )}

                      {isOpen ? <ChevronUp size={14} color="var(--text3)" /> : <ChevronDown size={14} color="var(--text3)" />}
                    </div>

                    {/* Painel expandido — vínculos de usuários */}
                    {isOpen && (
                      <div style={{ background: 'var(--bg3)', borderTop: '1px solid var(--border)', padding: '14px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Shield size={12} /> Usuários com acesso
                          </div>
                          {isAdmin && (
                            <button className="btn btn-primary btn-sm" onClick={() => openVinculo(r)}>
                              <UserPlus size={13} /> Conceder acesso
                            </button>
                          )}
                        </div>

                        {vincsEnt.length === 0
                          ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>Nenhum usuário vinculado.</div>
                          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {vincsEnt.map(v => (
                                <div key={v.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                        {v.nome?.charAt(0).toUpperCase()}
                                      </div>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.email}</div>
                                      </div>
                                    </div>
                                    {isAdmin && (
                                      <button className="icon-btn del" title="Remover acesso" onClick={() => setDeletingVinculo(v)} style={{ flexShrink: 0 }}>
                                        <X size={13} />
                                      </button>
                                    )}
                                  </div>
                                  {isAdmin
                                    ? <select
                                        value={v.nivel}
                                        onChange={e => updateNivelVinculo(v.id, Number(e.target.value))}
                                        className="form-select"
                                        style={{ width: '100%', fontSize: 12 }}>
                                        {[1, 2, 3, 4].map(n => (
                                          <option key={n} value={n}>{n} — {NIVEL_LABEL[n]}</option>
                                        ))}
                                      </select>
                                    : <span className={`badge ${NIVEL_COLOR[v.nivel]}`} style={{ fontSize: 10 }}>
                                        {NIVEL_LABEL[v.nivel]}
                                      </span>
                                  }
                                </div>
                              ))}
                            </div>
                        }

                        {/* Legenda de níveis */}
                        <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {Object.entries(NIVEL_LABEL).map(([n, l]) => (
                            <span key={n} style={{ fontSize: 10, color: 'var(--text3)' }}>
                              <span className={`badge ${NIVEL_COLOR[n]}`} style={{ fontSize: 9, marginRight: 4 }}>{n}</span>
                              {l}
                            </span>
                          ))}
                          <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 8 }}>
                            Leitura = só visualiza · Operador = lança · Gestor = lança + aprova · Admin = tudo
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
        }
      </div>

      {/* Modal Entidade */}
      {modal && (
        <Modal title={editing ? 'Editar Entidade' : 'Nova Entidade'} onClose={() => setModal(false)} onSave={save} size="modal-lg">
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                <option value="pj">🏢 Empresa (PJ)</option>
                <option value="pf">👤 Pessoa Física (PF)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Cor no seletor</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {CORES.map(c => (
                  <button key={c} type="button" onClick={() => f('cor_tema', c)}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: form.cor_tema === c ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }}>
                    {form.cor_tema === c && <Check size={12} color="#fff" style={{ display: 'block', margin: 'auto' }} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)}
                placeholder={form.tipo === 'pj' ? 'Razão Social' : 'Nome completo'} autoFocus />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome Fantasia / Apelido</label>
              <input className="form-input" value={form.nome_fantasia || ''} onChange={e => f('nome_fantasia', e.target.value)}
                placeholder="Como aparece no seletor" />
            </div>
            <div className="form-group">
              <label className="form-label">{form.tipo === 'pj' ? 'CNPJ' : 'CPF'}</label>
              <input className="form-input" value={form.cnpj_cpf || ''} onChange={e => f('cnpj_cpf', e.target.value)} />
            </div>
            {form.tipo === 'pj' && (
              <div className="form-group">
                <label className="form-label">IE</label>
                <input className="form-input" value={form.ie || ''} onChange={e => f('ie', e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="form-input" value={form.telefone || ''} onChange={e => f('telefone', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" value={form.email || ''} onChange={e => f('email', e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Endereço</label>
              <input className="form-input" value={form.endereco || ''} onChange={e => f('endereco', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-input" value={form.cidade || ''} onChange={e => f('cidade', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <input className="form-input" value={form.estado || ''} onChange={e => f('estado', e.target.value)} placeholder="SP" />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal vínculo */}
      {modalVinculo && (
        <Modal
          title="Conceder acesso"
          onClose={() => setModalVinculo(false)}
          onSave={saveVinculo}>
          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Usuário *</label>
              <select className="form-select" value={formVinculo.usuario_id}
                onChange={e => setFormVinculo(p => ({ ...p, usuario_id: e.target.value }))}>
                <option value="">Selecionar usuário...</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome} — {u.email}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Nível de acesso</label>
              <select className="form-select" value={formVinculo.nivel}
                onChange={e => setFormVinculo(p => ({ ...p, nivel: Number(e.target.value) }))}>
                <option value={1}>1 — Leitura (só visualiza)</option>
                <option value={2}>2 — Operador (lança receitas/despesas)</option>
                <option value={3}>3 — Gestor (lança + aprova inbox + relatórios)</option>
                <option value={4}>4 — Admin (tudo + configura + gerencia usuários)</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Excluir a entidade "${deleting.nome}"? Só é possível excluir entidades sem dados vinculados.`}
          onConfirm={destroy} onCancel={() => setDeleting(null)} />
      )}

      {deletingVinculo && (
        <ConfirmDialog
          message={`Remover acesso de "${deletingVinculo.nome}" a esta entidade?`}
          onConfirm={destroyVinculo} onCancel={() => setDeletingVinculo(null)} />
      )}
    </div>
  )
}
