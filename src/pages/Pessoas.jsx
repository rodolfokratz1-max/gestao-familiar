import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, Users, ChevronDown, ChevronUp } from 'lucide-react'
import { gerarCodigo } from '../lib/codigos'

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const EMPTY = {
  codigo:'', nome:'', tipo:'cliente', cpf_cnpj:'', rg:'',
  telefone:'', celular:'', whatsapp:'', email:'', site:'',
  // endereço
  cep:'', logradouro:'', numero:'', complemento:'',
  bairro:'', cidade:'', estado:'', pais:'Brasil',
  // extra
  data_nascimento:'', contato_nome:'', contato_telefone:'',
  obs:'', ativo:true
}

export default function Pessoas() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterAtivo, setFilterAtivo] = useState('true')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [secao, setSecao] = useState('dados') // dados | endereco | contato

  useEffect(() => { if (entidadeAtiva?.id) load() }, [entidadeAtiva?.id])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('pessoas').select('*').eq('entidade_id', entidadeAtiva?.id).order('nome')
    if (error) toast(error.message, 'error')
    else setRows(data)
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.nome?.toLowerCase().includes(q) || r.codigo?.toLowerCase().includes(q) || r.cpf_cnpj?.includes(q) || r.email?.toLowerCase().includes(q) || r.celular?.includes(q) || r.telefone?.includes(q)
    const matchTipo = !filterTipo || r.tipo === filterTipo
    const matchAtivo = filterAtivo === '' || String(r.ativo) === filterAtivo
    return matchSearch && matchTipo && matchAtivo
  })

  async function openNew() {
    const codigo = await gerarCodigo('pessoas')
    setForm({ ...EMPTY, codigo })
    setEditing(null); setSecao('dados'); setModal(true)
  }
  function openEdit(r) {
    setForm({ ...EMPTY, ...r })
    setEditing(r.id); setSecao('dados'); setModal(true)
  }

  async function save() {
    if (!form.nome.trim()) return toast('Nome é obrigatório', 'error')
    if (!form.codigo.trim()) return toast('Código é obrigatório', 'error')
    let error
    const payload = { ...form, data_nascimento: form.data_nascimento || null }
    if (editing) ({ error } = await supabase.from('pessoas').update(payload).eq('id', editing))
    else ({ error } = await supabase.from('pessoas').insert({...payload, entidade_id: entidadeAtiva?.id}))
    if (error) { toast(error.message, 'error'); return }
    toast(editing ? 'Registro atualizado!' : 'Registro criado!', 'success')
    setModal(false); load()
  }

  async function toggleAtivo(r) {
    await supabase.from('pessoas').update({ ativo: !r.ativo }).eq('id', r.id)
    toast(`Registro ${!r.ativo ? 'ativado' : 'desativado'}`, 'info'); load()
  }

  async function destroy() {
    const { error } = await supabase.from('pessoas').delete().eq('id', deleting.id)
    if (error) toast(error.message, 'error')
    else { toast('Excluído com sucesso', 'success'); load() }
    setDeleting(null)
  }

  // Busca CEP automaticamente
  async function buscarCep(cep) {
    const c = cep.replace(/\D/g,'')
    if (c.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const d = await res.json()
      if (d.erro) return toast('CEP não encontrado', 'error')
      setForm(p => ({ ...p, logradouro: d.logradouro||p.logradouro, bairro: d.bairro||p.bairro, cidade: d.localidade||p.cidade, estado: d.uf||p.estado }))
      toast('Endereço preenchido!', 'success')
    } catch { toast('Erro ao buscar CEP', 'error') }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const tipoColors = { cliente:'badge-blue', fornecedor:'badge-orange', ambos:'badge-purple', membro:'badge-green' }
  const tipoLabels = { cliente:'Cliente', fornecedor:'Fornecedor', ambos:'Ambos', membro:'Membro' }

  // Abas do modal
  const abas = [
    { id:'dados',    label:'Dados Gerais' },
    { id:'endereco', label:'Endereço' },
    { id:'contato',  label:'Contato / Extra' },
  ]

  return (
    <div>
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar por nome, código, CPF/CNPJ, telefone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width:'auto' }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="cliente">Cliente</option>
          <option value="fornecedor">Fornecedor</option>
          <option value="ambos">Ambos</option>
          <option value="membro">Membro</option>
        </select>
        <select className="form-select" style={{ width:'auto' }} value={filterAtivo} onChange={e => setFilterAtivo(e.target.value)}>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
          <option value="">Todos</option>
        </select>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova Pessoa</button>
      </div>

      <div className="card">
        {loading ? <div className="loading"><div className="spinner" /></div> :
          filtered.length === 0
            ? <div className="empty-state"><Users size={40} /><p>Nenhum registro encontrado</p></div>
            : <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Código</th><th>Nome</th><th>Tipo</th><th>CPF/CNPJ</th>
                    <th>Celular / Tel</th><th>Cidade/UF</th><th>Status</th><th>Ações</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r.id}>
                        <td className="text-mono" style={{ fontSize:12 }}>{r.codigo}</td>
                        <td>
                          <div className="font-bold">{r.nome}</div>
                          {r.email && <div style={{ fontSize:11, color:'var(--text3)' }}>{r.email}</div>}
                        </td>
                        <td><span className={`badge ${tipoColors[r.tipo]}`}>{tipoLabels[r.tipo]}</span></td>
                        <td className="text-muted">{r.cpf_cnpj || '—'}</td>
                        <td className="text-muted">{r.celular || r.telefone || '—'}</td>
                        <td className="text-muted">{r.cidade ? `${r.cidade}${r.estado ? `/${r.estado}` : ''}` : '—'}</td>
                        <td><span className={`badge ${r.ativo ? 'badge-green' : 'badge-gray'}`}>{r.ativo ? 'Ativo' : 'Inativo'}</span></td>
                        <td>
                          <div className="action-btns">
                            <button className="icon-btn edit" title="Editar" onClick={() => openEdit(r)}><Pencil size={14} /></button>
                            <button className="icon-btn toggle" title={r.ativo ? 'Desativar' : 'Ativar'} onClick={() => toggleAtivo(r)}><Power size={14} /></button>
                            <button className="icon-btn del" title="Excluir" onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        }
      </div>

      {modal && (
        <Modal title={editing ? 'Editar Pessoa' : 'Nova Pessoa'} onClose={() => setModal(false)} onSave={save} size="modal-lg">
          {/* Abas */}
          <div style={{ display:'flex', gap:4, marginBottom:18, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
            {abas.map(a => (
              <button key={a.id} onClick={() => setSecao(a.id)} style={{
                background:'none', border:'none', cursor:'pointer', padding:'6px 14px 10px',
                fontSize:12, fontWeight:600, color: secao === a.id ? 'var(--accent)' : 'var(--text2)',
                borderBottom: secao === a.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom:-1, transition:'all .15s'
              }}>{a.label}</button>
            ))}
          </div>

          {/* ABA: Dados Gerais */}
          {secao === 'dados' && (
            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label className="form-label">Código</label>
                <input className="form-input" value={form.codigo} readOnly style={{ opacity:.7 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                  <option value="cliente">Cliente</option>
                  <option value="fornecedor">Fornecedor</option>
                  <option value="ambos">Ambos</option>
                  <option value="membro">Membro</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Nome completo / Razão Social *</label>
                <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)} placeholder="Nome ou razão social" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">CPF / CNPJ</label>
                <input className="form-input" value={form.cpf_cnpj} onChange={e => f('cpf_cnpj', e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div className="form-group">
                <label className="form-label">RG / Inscrição Estadual</label>
                <input className="form-input" value={form.rg} onChange={e => f('rg', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Data de Nascimento / Fundação</label>
                <input className="form-input" type="date" value={form.data_nascimento} onChange={e => f('data_nascimento', e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Observações</label>
                <textarea className="form-textarea" rows={2} value={form.obs} onChange={e => f('obs', e.target.value)} placeholder="Anotações, condições especiais, etc..." />
              </div>
            </div>
          )}

          {/* ABA: Endereço */}
          {secao === 'endereco' && (
            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label className="form-label">CEP</label>
                <div style={{ display:'flex', gap:8 }}>
                  <input className="form-input" value={form.cep} onChange={e => f('cep', e.target.value)}
                    onBlur={e => buscarCep(e.target.value)} placeholder="00000-000" />
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => buscarCep(form.cep)} style={{ whiteSpace:'nowrap' }}>Buscar</button>
                </div>
                <span style={{ fontSize:11, color:'var(--text3)' }}>Digite o CEP e clique em Buscar para preencher automaticamente</span>
              </div>
              <div className="form-group">
                <label className="form-label">País</label>
                <input className="form-input" value={form.pais} onChange={e => f('pais', e.target.value)} placeholder="Brasil" />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Logradouro</label>
                <input className="form-input" value={form.logradouro} onChange={e => f('logradouro', e.target.value)} placeholder="Rua, Avenida, Travessa..." />
              </div>
              <div className="form-group">
                <label className="form-label">Número</label>
                <input className="form-input" value={form.numero} onChange={e => f('numero', e.target.value)} placeholder="Ex: 123, S/N" />
              </div>
              <div className="form-group">
                <label className="form-label">Complemento</label>
                <input className="form-input" value={form.complemento} onChange={e => f('complemento', e.target.value)} placeholder="Apto, Sala, Bloco..." />
              </div>
              <div className="form-group">
                <label className="form-label">Bairro</label>
                <input className="form-input" value={form.bairro} onChange={e => f('bairro', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Cidade</label>
                <input className="form-input" value={form.cidade} onChange={e => f('cidade', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-select" value={form.estado} onChange={e => f('estado', e.target.value)}>
                  <option value="">—</option>
                  {UFS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ABA: Contato / Extra */}
          {secao === 'contato' && (
            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label className="form-label">Celular</label>
                <input className="form-input" value={form.celular} onChange={e => f('celular', e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp</label>
                <input className="form-input" value={form.whatsapp} onChange={e => f('whatsapp', e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="form-group">
                <label className="form-label">Telefone Fixo</label>
                <input className="form-input" value={form.telefone} onChange={e => f('telefone', e.target.value)} placeholder="(00) 0000-0000" />
              </div>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input className="form-input" type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Site</label>
                <input className="form-input" value={form.site} onChange={e => f('site', e.target.value)} placeholder="www.empresa.com.br" />
              </div>
              <div style={{ gridColumn:'1/-1', height:1, background:'var(--border)', margin:'4px 0' }} />
              <div className="form-group">
                <label className="form-label">Nome do contato responsável</label>
                <input className="form-input" value={form.contato_nome} onChange={e => f('contato_nome', e.target.value)} placeholder="Para empresas: quem atende" />
              </div>
              <div className="form-group">
                <label className="form-label">Telefone do contato</label>
                <input className="form-input" value={form.contato_telefone} onChange={e => f('contato_telefone', e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
          )}

          {/* Navegação entre abas dentro do modal */}
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:16, paddingTop:12, borderTop:'1px solid var(--border)' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              const idx = abas.findIndex(a => a.id === secao)
              if (idx > 0) setSecao(abas[idx-1].id)
            }} style={{ visibility: secao === 'dados' ? 'hidden' : 'visible' }}>← Anterior</button>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              const idx = abas.findIndex(a => a.id === secao)
              if (idx < abas.length - 1) setSecao(abas[idx+1].id)
            }} style={{ visibility: secao === 'contato' ? 'hidden' : 'visible' }}>Próximo →</button>
          </div>
        </Modal>
      )}

      {deleting && <ConfirmDialog message={`Excluir "${deleting.nome}"? Esta ação não pode ser desfeita.`} onConfirm={destroy} onCancel={() => setDeleting(null)} />}
    </div>
  )
}
