import { useState, useEffect } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Pencil, Trash2, Shield, User, Key } from 'lucide-react'

export default function Usuarios() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [modalSenha, setModalSenha] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [form, setForm] = useState({ nome: '', email: '', senha: '', perfil: 'usuario' })
  const [formSenha, setFormSenha] = useState({ senha: '', confirma: '' })

  const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || ''
  const isAdmin = me?.email === ADMIN_EMAIL || me?.user_metadata?.perfil === 'admin'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('usuarios_app').select('*').order('nome')
    if (error) toast(error.message, 'error')
    else setUsuarios(data || [])
    setLoading(false)
  }

  function openNew() { setForm({ nome: '', email: '', senha: '', perfil: 'usuario' }); setEditing(null); setModal(true) }
  function openEdit(u) { setForm({ nome: u.nome, email: u.email, senha: '', perfil: u.perfil }); setEditing(u); setModal(true) }
  function openSenha(u) { setEditing(u); setFormSenha({ senha: '', confirma: '' }); setModalSenha(true) }

  async function save() {
    if (!form.nome.trim()) return toast('Nome obrigatório', 'error')
    if (!form.email.trim()) return toast('E-mail obrigatório', 'error')
    if (!editing && !form.senha) return toast('Senha obrigatória para novo usuário', 'error')
    if (!editing && form.senha.length < 6) return toast('Senha deve ter ao menos 6 caracteres', 'error')

    if (!editing) {
      // Cria usuário no Supabase Auth via Admin API (usando service role)
      const { data, error } = await supabaseAdmin?.auth.admin.createUser({
        email: form.email,
        password: form.senha,
        email_confirm: true,
        user_metadata: { name: form.nome, perfil: form.perfil }
      })
      if (error) { toast(error.message, 'error'); return }

      // Salva também na tabela local
      await supabase.from('usuarios_app').insert({
        auth_id: data.user.id,
        nome: form.nome,
        email: form.email,
        perfil: form.perfil,
        ativo: true
      })
    } else {
      // Atualiza dados
      await supabase.from('usuarios_app').update({
        nome: form.nome, perfil: form.perfil
      }).eq('id', editing.id)

      await supabaseAdmin?.auth.admin.updateUserById(editing.auth_id, {
        user_metadata: { name: form.nome, perfil: form.perfil }
      })
    }

    toast(editing ? 'Usuário atualizado!' : 'Usuário criado!', 'success')
    setModal(false); load()
  }

  async function saveSenha() {
    if (!formSenha.senha || formSenha.senha.length < 6) return toast('Senha deve ter ao menos 6 caracteres', 'error')
    if (formSenha.senha !== formSenha.confirma) return toast('Senhas não conferem', 'error')
    const { error } = await supabaseAdmin?.auth.admin.updateUserById(editing.auth_id, { password: formSenha.senha })
    if (error) { toast(error.message, 'error'); return }
    toast('Senha alterada!', 'success'); setModalSenha(false)
  }

  async function toggleAtivo(u) {
    const ativo = !u.ativo
    await supabase.from('usuarios_app').update({ ativo }).eq('id', u.id)
    await supabaseAdmin?.auth.admin.updateUserById(u.auth_id, { ban_duration: ativo ? 'none' : '87600h' })
    toast(ativo ? 'Usuário ativado' : 'Usuário desativado', 'info'); load()
  }

  async function destroy() {
    await supabaseAdmin?.auth.admin.deleteUser(deleting.auth_id)
    await supabase.from('usuarios_app').delete().eq('id', deleting.id)
    toast('Usuário excluído', 'success'); setDeleting(null); load()
  }

  if (!isAdmin) return (
    <div className="empty-state">
      <Shield size={48} style={{ color: 'var(--red)' }} />
      <p style={{ color: 'var(--red)', fontWeight: 700 }}>Acesso restrito</p>
      <p style={{ color: 'var(--text2)', fontSize: 13 }}>Somente o administrador pode gerenciar usuários</p>
    </div>
  )

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div>
      <div className="toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={16} color="var(--accent)" />
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>Gerenciamento de acesso — somente admin</span>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Novo Usuário</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          usuarios.length === 0 ? <div className="empty-state"><User size={40} /><p>Nenhum usuário cadastrado</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id} style={{ opacity: u.ativo ? 1 : .5 }}>
                      <td className="font-bold">
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:28, height:28, borderRadius:'50%', background: u.perfil === 'admin' ? 'var(--accent)' : 'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, border:'1px solid var(--border)' }}>
                            {u.nome?.charAt(0).toUpperCase()}
                          </div>
                          {u.nome}
                          {u.email === me?.email && <span className="badge badge-blue" style={{fontSize:10}}>você</span>}
                        </div>
                      </td>
                      <td className="text-muted">{u.email}</td>
                      <td>
                        <span className={`badge ${u.perfil === 'admin' ? 'badge-purple' : 'badge-gray'}`}>
                          {u.perfil === 'admin' ? '👑 Admin' : '👤 Usuário'}
                        </span>
                      </td>
                      <td><span className={`badge ${u.ativo ? 'badge-green' : 'badge-red'}`}>{u.ativo ? 'Ativo' : 'Inativo'}</span></td>
                      <td>
                        <div className="action-btns">
                          <button className="icon-btn edit" title="Editar" onClick={() => openEdit(u)}><Pencil size={14} /></button>
                          <button className="icon-btn" title="Alterar senha" style={{ color: 'var(--yellow)' }} onClick={() => openSenha(u)}><Key size={14} /></button>
                          <button className="icon-btn toggle" title={u.ativo ? 'Desativar' : 'Ativar'} onClick={() => toggleAtivo(u)}>
                            <span style={{ fontSize:13 }}>{u.ativo ? '🔒' : '🔓'}</span>
                          </button>
                          {u.email !== me?.email && (
                            <button className="icon-btn del" title="Excluir" onClick={() => setDeleting(u)}><Trash2 size={14} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Usuário' : 'Novo Usuário'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Nome completo *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)} placeholder="Nome da pessoa" />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">E-mail *</label>
              <input className="form-input" type="email" value={form.email} onChange={e => f('email', e.target.value)}
                placeholder="email@exemplo.com" disabled={!!editing} />
              {editing && <span style={{ fontSize:11, color:'var(--text2)' }}>E-mail não pode ser alterado</span>}
            </div>
            {!editing && (
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Senha *</label>
                <input className="form-input" type="password" value={form.senha} onChange={e => f('senha', e.target.value)}
                  placeholder="Mínimo 6 caracteres" />
              </div>
            )}
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Perfil de acesso</label>
              <select className="form-select" value={form.perfil} onChange={e => f('perfil', e.target.value)}>
                <option value="usuario">👤 Usuário — acesso normal</option>
                <option value="admin">👑 Admin — gerencia usuários</option>
              </select>
            </div>
          </div>
        </Modal>
      )}

      {modalSenha && (
        <Modal title={`Alterar senha — ${editing?.nome}`} onClose={() => setModalSenha(false)} onSave={saveSenha}>
          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Nova senha *</label>
              <input className="form-input" type="password" value={formSenha.senha} onChange={e => setFormSenha(p => ({...p, senha: e.target.value}))} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar senha *</label>
              <input className="form-input" type="password" value={formSenha.confirma} onChange={e => setFormSenha(p => ({...p, confirma: e.target.value}))} placeholder="Repita a senha" />
            </div>
          </div>
        </Modal>
      )}

      {deleting && <ConfirmDialog message={`Excluir usuário "${deleting.nome}"? Esta ação não pode ser desfeita.`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
