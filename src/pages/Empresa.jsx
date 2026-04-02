import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Building2, Plus, Pencil, Trash2, Upload, X, Save, Palette, Power } from 'lucide-react'

const EMPTY = {
  nome: '', nome_fantasia: '', cnpj: '', ie: '', im: '',
  telefone: '', whatsapp: '', email: '', site: '',
  endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '',
  margem_padrao: '', cor_primaria: '#1e3a5f', cor_secundaria: '#2563eb',
  rodape_os: 'Agradecemos a preferência! Qualquer dúvida estamos à disposição.',
  logo_base64: '', ativo: true,
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export default function Empresa() {
  const toast = useToast()
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('empresa').select('*').order('nome')
    setEmpresas(data || [])
    setLoading(false)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function openNew() { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(e) { setForm({ ...EMPTY, ...e }); setEditing(e.id); setModal(true) }

  function handleLogo(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 600000) return toast('Logo muito grande! Use uma imagem menor que 600KB', 'error')
    const reader = new FileReader()
    reader.onload = ev => f('logo_base64', ev.target.result)
    reader.readAsDataURL(file)
  }

  async function save() {
    if (!form.nome?.trim()) return toast('Nome da empresa obrigatório', 'error')
    setSaving(true)
    let error
    if (editing) {
      ({ error } = await supabase.from('empresa').update(form).eq('id', editing))
    } else {
      ({ error } = await supabase.from('empresa').insert(form))
    }
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast(editing ? 'Empresa atualizada!' : 'Empresa cadastrada!', 'success')
    setModal(false); load()
  }

  async function toggleAtivo(emp) {
    await supabase.from('empresa').update({ ativo: !emp.ativo }).eq('id', emp.id)
    load()
  }

  async function destroy() {
    await supabase.from('empresa').delete().eq('id', deleting.id)
    toast('Empresa excluída', 'success'); setDeleting(null); load()
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>

  return (
    <div>
      <div className="toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Empresa</button>
      </div>

      {empresas.length === 0
        ? <div className="empty-state"><Building2 size={40} /><p>Nenhuma empresa cadastrada</p></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {empresas.map(e => (
              <div key={e.id} className="card" style={{ padding: '0', overflow: 'hidden', opacity: e.ativo ? 1 : .6 }}>
                {/* Mini preview cabeçalho */}
                <div style={{ background: `linear-gradient(135deg,${e.cor_primaria||'#1e3a5f'},${e.cor_secundaria||'#2563eb'})`, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {e.logo_base64
                      ? <img src={e.logo_base64} alt="logo" style={{ height: 38, maxWidth: 90, objectFit: 'contain', background: 'white', borderRadius: 6, padding: 4 }} />
                      : <div style={{ width: 38, height: 38, borderRadius: 7, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Building2 size={18} color="white" /></div>
                    }
                    <div>
                      <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{e.nome}</div>
                      {e.nome_fantasia && <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11 }}>{e.nome_fantasia}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)' }} onClick={() => openEdit(e)}><Pencil size={12} /> Editar</button>
                    <button className="icon-btn" style={{ color: e.ativo ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.4)', background: 'rgba(255,255,255,.1)' }} title={e.ativo ? 'Desativar' : 'Ativar'} onClick={() => toggleAtivo(e)}><Power size={14} /></button>
                    <button className="icon-btn" style={{ color: 'rgba(248,113,113,.8)', background: 'rgba(255,255,255,.1)' }} onClick={() => setDeleting(e)}><Trash2 size={14} /></button>
                  </div>
                </div>
                {/* Info row */}
                <div style={{ padding: '10px 20px', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
                  {e.cnpj && <span>📄 {e.cnpj}</span>}
                  {e.telefone && <span>📞 {e.telefone}</span>}
                  {e.email && <span>✉ {e.email}</span>}
                  {e.cidade && <span>📍 {e.cidade}{e.estado ? `/${e.estado}` : ''}</span>}
                  {!e.ativo && <span className="badge badge-gray">Inativa</span>}
                </div>
              </div>
            ))}
          </div>
      }

      {modal && (
        <Modal title={editing ? 'Editar Empresa' : 'Nova Empresa'} onClose={() => setModal(false)} onSave={save} saving={saving} size="lg">
          {/* Preview */}
          <div style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 20, border: '1px solid var(--border)' }}>
            <div style={{ padding: '6px 14px', background: 'var(--bg3)', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Preview</div>
            <div style={{ background: `linear-gradient(135deg,${form.cor_primaria},${form.cor_secundaria})`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {form.logo_base64
                  ? <img src={form.logo_base64} alt="logo" style={{ height: 44, maxWidth: 110, objectFit: 'contain', background: 'white', borderRadius: 6, padding: 4 }} />
                  : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Building2 size={20} color="white" /></div>
                }
                <div>
                  <div style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>{form.nome || 'Nome da Empresa'}</div>
                  {form.nome_fantasia && <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11 }}>{form.nome_fantasia}</div>}
                  {form.telefone && <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 11, marginTop: 3 }}>{form.telefone}</div>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 9, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase' }}>Ordem de Serviço</div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 26, lineHeight: 1 }}>OS-001</div>
              </div>
            </div>
          </div>

          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Razão Social *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)} placeholder="Nome completo da empresa" autoFocus />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome Fantasia</label>
              <input className="form-input" value={form.nome_fantasia} onChange={e => f('nome_fantasia', e.target.value)} />
            </div>
            <div className="form-group"><label className="form-label">CNPJ</label><input className="form-input" value={form.cnpj} onChange={e => f('cnpj', e.target.value)} placeholder="00.000.000/0000-00" /></div>
            <div className="form-group"><label className="form-label">Inscrição Estadual</label><input className="form-input" value={form.ie} onChange={e => f('ie', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Telefone</label><input className="form-input" value={form.telefone} onChange={e => f('telefone', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">WhatsApp</label><input className="form-input" value={form.whatsapp} onChange={e => f('whatsapp', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" type="email" value={form.email} onChange={e => f('email', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Site</label><input className="form-input" value={form.site} onChange={e => f('site', e.target.value)} /></div>

            <div style={{ gridColumn: '1/-1', height: 1, background: 'var(--border)', margin: '4px 0' }} />

            <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">Logradouro</label><input className="form-input" value={form.endereco} onChange={e => f('endereco', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Número</label><input className="form-input" value={form.numero} onChange={e => f('numero', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Complemento</label><input className="form-input" value={form.complemento} onChange={e => f('complemento', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Bairro</label><input className="form-input" value={form.bairro} onChange={e => f('bairro', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Cidade</label><input className="form-input" value={form.cidade} onChange={e => f('cidade', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Estado</label>
              <select className="form-select" value={form.estado} onChange={e => f('estado', e.target.value)}>
                <option value="">—</option>{UFS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">CEP</label><input className="form-input" value={form.cep} onChange={e => f('cep', e.target.value)} /></div>

            <div style={{ gridColumn: '1/-1', height: 1, background: 'var(--border)', margin: '4px 0' }} />

            {/* Logo */}
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {form.logo_base64 && (
                  <div style={{ position: 'relative' }}>
                    <img src={form.logo_base64} alt="logo" style={{ height: 50, maxWidth: 140, objectFit: 'contain', background: 'white', borderRadius: 8, border: '1px solid var(--border)', padding: 5 }} />
                    <button onClick={() => f('logo_base64', '')} style={{ position: 'absolute', top: -6, right: -6, background: 'var(--red)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={10} /></button>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
                <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()}><Upload size={13} /> {form.logo_base64 ? 'Trocar' : 'Upload logo'}</button>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>PNG/JPG · max 600KB</span>
              </div>
            </div>

            {/* Cores */}
            <div className="form-group">
              <label className="form-label">Cor primária</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.cor_primaria} onChange={e => f('cor_primaria', e.target.value)} style={{ width: 40, height: 34, borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', padding: 2, background: 'var(--bg3)' }} />
                <input className="form-input" value={form.cor_primaria} onChange={e => f('cor_primaria', e.target.value)} style={{ fontFamily: 'monospace', maxWidth: 100 }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cor secundária</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.cor_secundaria} onChange={e => f('cor_secundaria', e.target.value)} style={{ width: 40, height: 34, borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', padding: 2, background: 'var(--bg3)' }} />
                <input className="form-input" value={form.cor_secundaria} onChange={e => f('cor_secundaria', e.target.value)} style={{ fontFamily: 'monospace', maxWidth: 100 }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Margem de Lucro Padrão (%)</label>
              <input className="form-input" type="number" step="0.1" min="0" max="100"
                value={form.margem_padrao||''} onChange={e => f('margem_padrao', e.target.value)}
                placeholder="Ex: 40" />
              <span style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>
                Aplicada automaticamente em produtos criados via NF-e
              </span>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Rodapé dos documentos</label>
              <textarea className="form-textarea" rows={2} value={form.rodape_os} onChange={e => f('rodape_os', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {deleting && <ConfirmDialog message={`Excluir empresa "${deleting.nome}"?`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
