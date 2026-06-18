import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, TrendingUp, TrendingDown, FolderOpen, Tag } from 'lucide-react'

const GRUPOS_RECEITA_DEFAULT = [
  { nome: 'Vendas de Produtos',    subs: ['E-commerce','Produtos Físicos','Produtos Digitais','Revenda'] },
  { nome: 'Prestação de Serviços', subs: ['Consultoria','Desenvolvimento','Manutenção Contratual','Suporte Técnico','Treinamentos'] },
  { nome: 'Receitas Financeiras',  subs: ['Juros Recebidos','Rendimentos','Descontos Obtidos'] },
  { nome: 'Outras Receitas',       subs: ['Bonificações','Comissões Recebidas','Receitas Eventuais'] },
]
const GRUPOS_DESPESA_DEFAULT = [
  { nome: 'Custos (CMV)',              subs: ['Custo de Mercadoria','Custo de Produção','Matéria Prima'] },
  { nome: 'Custos Operacionais',       subs: ['Combustível','Embalagens','Frete e Logística','Manutenção'] },
  { nome: 'Despesas Administrativas',  subs: ['Aluguel','Assessoria Jurídica','Contabilidade','Limpeza e Conservação','Material de Escritório','Seguros'] },
  { nome: 'Despesas com Pessoal',      subs: ['Benefícios','FGTS','Pró-labore','Salários','Vale Refeição','Vale Transporte'] },
  { nome: 'Despesas Financeiras',      subs: ['Juros e Multas','Tarifas de Cartão','Taxas Bancárias'] },
  { nome: 'Impostos e Taxas',          subs: ['IRPJ','ISS','Simples Nacional'] },
  { nome: 'Infraestrutura',            subs: ['Água e Esgoto','Energia Elétrica','Hospedagem e Servidores','Internet e Telefone','Software e Licenças'] },
  { nome: 'Marketing e Vendas',        subs: ['Brindes e Amostras','Comissões de Venda','Eventos','Mídia Impressa','Publicidade Online'] },
]

const EMPTY_GRUPO = { nome: '', tipo: 'receita', descricao: '' }
const EMPTY_SUB   = { nome: '', descricao: '' }

export default function PlanoContas() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [grupos, setGrupos] = useState([])
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandidos, setExpandidos] = useState({})

  const [modalGrupo, setModalGrupo] = useState(false)
  const [editingGrupo, setEditingGrupo] = useState(null)
  const [formGrupo, setFormGrupo] = useState(EMPTY_GRUPO)
  const [deletingGrupo, setDeletingGrupo] = useState(null)

  const [modalSub, setModalSub] = useState(false)
  const [editingSub, setEditingSub] = useState(null)
  const [subGrupoId, setSubGrupoId] = useState(null)
  const [formSub, setFormSub] = useState(EMPTY_SUB)
  const [deletingSub, setDeletingSub] = useState(null)

  const [importando, setImportando] = useState(false)

  useEffect(() => { if (entidadeAtiva?.id) loadAll() }, [entidadeAtiva?.id])

  async function loadAll() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const [{ data: g }, { data: s }] = await Promise.all([
      supabase.from('plano_contas_grupos').select('*').order('tipo').order('nome'),
      supabase.from('plano_contas_subs').select('*').order('nome'),
    ])
    setGrupos(g || [])
    setSubs(s || [])
    setLoading(false)
  }

  // ── GRUPOS ────────────────────────────────────────────
  function openNewGrupo(tipo) { setFormGrupo({ ...EMPTY_GRUPO, tipo }); setEditingGrupo(null); setModalGrupo(true) }
  function openEditGrupo(g) { setFormGrupo({ ...g }); setEditingGrupo(g.id); setModalGrupo(true) }

  async function saveGrupo() {
    if (!formGrupo.nome?.trim()) return toast('Nome obrigatório', 'error')
    let error
    if (editingGrupo) ({ error } = await supabase.from('plano_contas_grupos').update(formGrupo).eq('id', editingGrupo))
    else ({ error } = await supabase.from('plano_contas_grupos').insert(formGrupo))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModalGrupo(false); loadAll()
  }

  async function destroyGrupo() {
    const subsDoGrupo = subs.filter(s => s.grupo_id === deletingGrupo.id)
    if (subsDoGrupo.length > 0) {
      return toast(`Remova as ${subsDoGrupo.length} subcategoria(s) antes de excluir o grupo`, 'error')
    }
    await supabase.from('plano_contas_grupos').delete().eq('id', deletingGrupo.id)
    toast('Grupo excluído', 'success'); setDeletingGrupo(null); loadAll()
  }

  // ── SUBCATEGORIAS ─────────────────────────────────────
  function openNewSub(grupoId) { setFormSub(EMPTY_SUB); setEditingSub(null); setSubGrupoId(grupoId); setModalSub(true) }
  function openEditSub(s) { setFormSub({ ...s }); setEditingSub(s.id); setSubGrupoId(s.grupo_id); setModalSub(true) }

  async function saveSub() {
    if (!formSub.nome?.trim()) return toast('Nome obrigatório', 'error')
    const payload = { ...formSub, grupo_id: subGrupoId }
    let error
    if (editingSub) ({ error } = await supabase.from('plano_contas_subs').update(payload).eq('id', editingSub))
    else ({ error } = await supabase.from('plano_contas_subs').insert(payload))
    if (error) { toast(error.message, 'error'); return }
    toast('Salvo!', 'success'); setModalSub(false); loadAll()
    // Expande o grupo pai
    setExpandidos(p => ({ ...p, [subGrupoId]: true }))
  }

  async function destroySub() {
    await supabase.from('plano_contas_subs').delete().eq('id', deletingSub.id)
    toast('Subcategoria excluída', 'success'); setDeletingSub(null); loadAll()
  }

  // ── IMPORTAR PADRÃO ───────────────────────────────────
  async function importarPadrao() {
    setImportando(true)
    let criados = 0
    for (const def of [...GRUPOS_RECEITA_DEFAULT.map(g => ({...g,tipo:'receita'})), ...GRUPOS_DESPESA_DEFAULT.map(g => ({...g,tipo:'despesa'}))]) {
      // Verifica se grupo já existe
      const existe = grupos.find(g => g.nome === def.nome && g.tipo === def.tipo)
      let grupoId
      if (existe) {
        grupoId = existe.id
      } else {
        const { data } = await supabase.from('plano_contas_grupos').insert({ nome: def.nome, tipo: def.tipo }).select().single()
        grupoId = data?.id
        criados++
      }
      if (!grupoId) continue
      // Insere subcategorias que não existem
      for (const sub of def.subs) {
        const subExiste = subs.find(s => s.nome === sub && s.grupo_id === grupoId)
        if (!subExiste) {
          await supabase.from('plano_contas_subs').insert({ nome: sub, grupo_id: grupoId })
        }
      }
    }
    toast(`Plano de contas importado! ${criados} grupos criados`, 'success')
    setImportando(false); loadAll()
    // Expande tudo
    const exp = {}
    grupos.forEach(g => exp[g.id] = true)
    setExpandidos(exp)
  }

  const toggleExpandido = (id) => setExpandidos(p => ({ ...p, [id]: !p[id] }))

  const gruposReceita = grupos.filter(g => g.tipo === 'receita')
  const gruposDespesa = grupos.filter(g => g.tipo === 'despesa')
  const subsDoGrupo = (gId) => subs.filter(s => s.grupo_id === gId)
  const totalSubs = (tipo) => grupos.filter(g => g.tipo === tipo).reduce((t, g) => t + subsDoGrupo(g.id).length, 0)

  const GrupoCard = ({ grupo }) => {
    const isReceita = grupo.tipo === 'receita'
    const subsG = subsDoGrupo(grupo.id)
    const exp = expandidos[grupo.id]
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
        {/* Cabeçalho do grupo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg3)', cursor: 'pointer' }}
          onClick={() => toggleExpandido(grupo.id)}>
          <span style={{ color: isReceita ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>
            {exp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </span>
          <FolderOpen size={14} color={isReceita ? 'var(--green)' : 'var(--red)'} />
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{grupo.nome}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{subsG.length} subcategoria{subsG.length !== 1 ? 's' : ''}</span>
          <div className="action-btns" onClick={e => e.stopPropagation()}>
            <button className="icon-btn" title="Adicionar subcategoria"
              style={{ color: isReceita ? 'var(--green)' : 'var(--red)' }}
              onClick={() => openNewSub(grupo.id)}><Plus size={13} /></button>
            <button className="icon-btn edit" onClick={() => openEditGrupo(grupo)}><Pencil size={13} /></button>
            <button className="icon-btn del" onClick={() => setDeletingGrupo(grupo)}><Trash2 size={13} /></button>
          </div>
        </div>
        {/* Subcategorias */}
        {exp && (
          <div style={{ padding: '6px 14px 10px 36px' }}>
            {subsG.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text3)', padding: '6px 0', fontStyle: 'italic' }}>Nenhuma subcategoria — clique em + para adicionar</div>
              : subsG.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <Tag size={11} color="var(--text3)" />
                    <span style={{ flex: 1, fontSize: 13 }}>{s.nome}</span>
                    {s.descricao && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{s.descricao}</span>}
                    <div className="action-btns">
                      <button className="icon-btn edit" onClick={() => openEditSub(s)}><Pencil size={12} /></button>
                      <button className="icon-btn del" onClick={() => setDeletingSub(s)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))
            }
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 6, fontSize: 11 }} onClick={() => openNewSub(grupo.id)}>
              <Plus size={12} /> Adicionar subcategoria
            </button>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>

  return (
    <div>
      {/* Botão importar padrão se vazio */}
      {grupos.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Plano de Contas vazio</div>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
            Importe o plano padrão com grupos e subcategorias já estruturados,<br />ou crie manualmente do zero.
          </div>
          <button className="btn btn-primary" onClick={importarPadrao} disabled={importando}>
            {importando ? 'Importando...' : '⚡ Importar plano padrão'}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* RECEITAS */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} color="var(--green)" />
              <span style={{ fontWeight: 800, fontSize: 14 }}>Receita</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{gruposReceita.length} grupos · {totalSubs('receita')} subcategorias</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {grupos.length > 0 && (
                <button className="btn btn-sm btn-secondary" onClick={importarPadrao} disabled={importando} title="Reimportar padrão">
                  ⚡ Padrão
                </button>
              )}
              <button className="btn btn-sm btn-success" onClick={() => openNewGrupo('receita')}>
                <Plus size={13} /> Grupo
              </button>
            </div>
          </div>
          {gruposReceita.length === 0
            ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10 }}>
                Nenhum grupo de receita
              </div>
            : gruposReceita.map(g => <GrupoCard key={g.id} grupo={g} />)
          }
        </div>

        {/* DESPESAS */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingDown size={16} color="var(--red)" />
              <span style={{ fontWeight: 800, fontSize: 14 }}>Despesa</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{gruposDespesa.length} grupos · {totalSubs('despesa')} subcategorias</span>
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => openNewGrupo('despesa')}>
              <Plus size={13} /> Grupo
            </button>
          </div>
          {gruposDespesa.length === 0
            ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10 }}>
                Nenhum grupo de despesa
              </div>
            : gruposDespesa.map(g => <GrupoCard key={g.id} grupo={g} />)
          }
        </div>
      </div>

      {/* Modal Grupo */}
      {modalGrupo && (
        <Modal title={editingGrupo ? 'Editar Grupo' : 'Novo Grupo'} onClose={() => setModalGrupo(false)} onSave={saveGrupo}>
          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-select" value={formGrupo.tipo} onChange={e => setFormGrupo(p => ({...p, tipo: e.target.value}))}>
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Nome do grupo *</label>
              <input className="form-input" value={formGrupo.nome} onChange={e => setFormGrupo(p => ({...p, nome: e.target.value}))} placeholder="Ex: Prestação de Serviços" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" value={formGrupo.descricao} onChange={e => setFormGrupo(p => ({...p, descricao: e.target.value}))} placeholder="Opcional" />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Subcategoria */}
      {modalSub && (
        <Modal title={editingSub ? 'Editar Subcategoria' : 'Nova Subcategoria'} onClose={() => setModalSub(false)} onSave={saveSub}>
          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Nome *</label>
              <input className="form-input" value={formSub.nome} onChange={e => setFormSub(p => ({...p, nome: e.target.value}))} placeholder="Ex: Consultoria" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" value={formSub.descricao || ''} onChange={e => setFormSub(p => ({...p, descricao: e.target.value}))} placeholder="Opcional" />
            </div>
          </div>
        </Modal>
      )}

      {deletingGrupo && <ConfirmDialog message={`Excluir grupo "${deletingGrupo.nome}"?`} onConfirm={destroyGrupo} onCancel={() => setDeletingGrupo(null)} />}
      {deletingSub && <ConfirmDialog message={`Excluir subcategoria "${deletingSub.nome}"?`} onConfirm={destroySub} onCancel={() => setDeletingSub(null)} />}
    </div>
  )
}
