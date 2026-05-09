import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Pencil, Trash2, Power, Target, TrendingUp, TrendingDown } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const EMPTY = { nome:'', descricao:'', ativo:true }

export default function CentroCusto() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [centros, setCentros] = useState([])
  const [resumo, setResumo]   = useState({}) // { id: { receita, despesa } }
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [deleting, setDeleting] = useState(null)


  // Sanitiza payload — converte strings vazias para null (evita erro uuid inválido)
  const sanitize = (obj) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === '' ? null : v])
  )

  useEffect(() => { if (entidadeAtiva?.id) loadAll() }, [entidadeAtiva?.id])

  async function loadAll() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const [{ data: cc }, { data: rec }, { data: des }] = await Promise.all([
      supabase.from('centros_custo').select('*').eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('receitas').select('valor,centro_custo_id').eq('ativo',true).eq('entidade_id', entidadeAtiva?.id),
      supabase.from('despesas').select('valor,centro_custo_id').eq('ativo',true).eq('entidade_id', entidadeAtiva?.id),
    ])
    setCentros(cc || [])
    // Monta resumo por centro
    const r = {}
    ;(cc||[]).forEach(c => { r[c.id] = { receita:0, despesa:0 } })
    ;(rec||[]).forEach(x => { if(x.centro_custo_id && r[x.centro_custo_id]) r[x.centro_custo_id].receita += Number(x.valor||0) })
    ;(des||[]).forEach(x => { if(x.centro_custo_id && r[x.centro_custo_id]) r[x.centro_custo_id].despesa += Number(x.valor||0) })
    setResumo(r)
    setLoading(false)
  }

  function openNew() { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(c) { setForm({...c}); setEditing(c.id); setModal(true) }

  async function save() {
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade antes de salvar', 'error')
    if (!form.nome?.trim()) return toast('Nome obrigatório','error')
    let error
    if (editing) ({ error } = await supabase.from('centros_custo').update(form).eq('id',editing))
    else ({ error } = await supabase.from('centros_custo').insert(sanitize({...form, entidade_id: entidadeAtiva?.id || null})))
    if (error) { toast(error.message,'error'); return }
    toast('Salvo!','success'); setModal(false); loadAll()
  }

  async function toggleAtivo(c) {
    await supabase.from('centros_custo').update({ ativo: !c.ativo }).eq('id',c.id)
    loadAll()
  }

  async function destroy() {
    await supabase.from('centros_custo').delete().eq('id',deleting.id)
    toast('Excluído','success'); setDeleting(null); loadAll()
  }

  if (loading) return <div className="loading"><div className="spinner"/></div>

  return (
    <div>
      <div className="toolbar">
        <div style={{flex:1}}/>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15}/> Novo Centro</button>
      </div>

      {centros.length === 0
        ? <div className="empty-state"><Target size={40}/><p>Nenhum centro de custo cadastrado</p></div>
        : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
            {centros.map(c => {
              const r = resumo[c.id] || { receita:0, despesa:0 }
              const resultado = r.receita - r.despesa
              return (
                <div key={c.id} className="card" style={{ opacity: c.ativo ? 1 : .5, padding:0, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:14 }}>{c.nome}</div>
                      {c.descricao && <div style={{ fontSize:11, color:'var(--text2)', marginTop:2 }}>{c.descricao}</div>}
                    </div>
                    <div style={{ display:'flex', gap:4 }}>
                      <button className="icon-btn edit" onClick={() => openEdit(c)}><Pencil size={13}/></button>
                      <button className="icon-btn toggle" onClick={() => toggleAtivo(c)}><Power size={13}/></button>
                      <button className="icon-btn del" onClick={() => setDeleting(c)}><Trash2 size={13}/></button>
                    </div>
                  </div>
                  <div style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    <div>
                      <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:3 }}>Receita</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--green)', fontFamily:'var(--mono)' }}>{fmt(r.receita)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:3 }}>Despesa</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--red)', fontFamily:'var(--mono)' }}>{fmt(r.despesa)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:3 }}>Resultado</div>
                      <div style={{ fontSize:13, fontWeight:800, color: resultado>=0 ? 'var(--green)' : 'var(--red)', fontFamily:'var(--mono)' }}>{fmt(resultado)}</div>
                    </div>
                  </div>
                  {(r.receita > 0 || r.despesa > 0) && (
                    <div style={{ padding:'0 16px 12px' }}>
                      <div style={{ height:4, borderRadius:2, background:'var(--bg3)', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(100,(r.despesa/Math.max(r.receita,r.despesa))*100)}%`, background: resultado>=0?'var(--green)':'var(--red)', borderRadius:2 }}/>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
      }

      {modal && (
        <Modal title={editing ? 'Editar Centro' : 'Novo Centro de Custo'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Nome *</label>
              <input className="form-input" value={form.nome} onChange={e => setForm(p=>({...p,nome:e.target.value}))} placeholder="Ex: Empresa Principal, Família, Projetos..." autoFocus/>
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" value={form.descricao||''} onChange={e => setForm(p=>({...p,descricao:e.target.value}))} placeholder="Opcional"/>
            </div>
          </div>
        </Modal>
      )}
      {deleting && <ConfirmDialog message={`Excluir "${deleting.nome}"? Os lançamentos vinculados perdem a referência.`} onConfirm={destroy} onCancel={() => setDeleting(null)}/>}
    </div>
  )
}
