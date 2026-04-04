import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, X } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const today = () => new Date().toISOString().split('T')[0]

const EMPTY_TRANSF = { data: today(), contaOrigem:'', contaDestino:'', valor:'', descricao:'Transferência entre contas', obs:'' }

export default function Caixa() {
  const toast = useToast()
  const [rows, setRows]         = useState([])
  const [contas, setContas]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [deleting, setDeleting] = useState(null)

  // Modal transferência
  const [modalTransf, setModalTransf]   = useState(false)
  const [transfForm, setTransfForm]     = useState(EMPTY_TRANSF)

  // Modal lançamento manual
  const [modalLanc, setModalLanc]   = useState(false)
  const [editingLanc, setEditingLanc] = useState(null)
  const [formLanc, setFormLanc]     = useState({ data:today(), tipo:'entrada', descricao:'', valor:'', categoria:'', obs:'' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: caixaData }, { data: contasData }] = await Promise.all([
      supabase.from('caixa').select('*').order('data',{ascending:false}).order('created_at',{ascending:false}),
      supabase.from('contas').select('id,nome,saldo_atual').eq('ativo',true).order('nome'),
    ])
    setRows(caixaData || [])
    setContas(contasData || [])
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const mQ = !q || r.descricao?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
    const mT = !filterTipo || r.tipo === filterTipo
    return mQ && mT
  })

  // Exclui transferências dos totais — não impactam patrimônio
  const isTransferencia = r => r.categoria === 'Transferência' || r.origem_tabela === 'transferencia'
  const semTransf = filtered.filter(r => !isTransferencia(r))
  const entradas = semTransf.filter(r=>r.tipo==='entrada').reduce((s,r)=>s+Number(r.valor||0),0)
  const saidas   = semTransf.filter(r=>r.tipo==='saida').reduce((s,r)=>s+Number(r.valor||0),0)
  const saldo    = entradas - saidas

  // ── TRANSFERÊNCIA ─────────────────────────────────────
  const tf = (k,v) => setTransfForm(p=>({...p,[k]:v}))

  async function transferir() {
    const { contaOrigem, contaDestino, valor, descricao, data, obs } = transfForm
    if (!contaOrigem)                  return toast('Selecione a conta de origem', 'error')
    if (!contaDestino)                 return toast('Selecione a conta de destino', 'error')
    if (contaOrigem === contaDestino)  return toast('Origem e destino devem ser diferentes', 'error')
    if (!valor || Number(valor) <= 0)  return toast('Informe o valor', 'error')
    const v = Number(valor)

    // Busca saldos ATUAIS do banco (não do cache)
    const [{ data: origData }, { data: destData }] = await Promise.all([
      supabase.from('contas').select('nome,saldo_atual').eq('id', contaOrigem).single(),
      supabase.from('contas').select('nome,saldo_atual').eq('id', contaDestino).single(),
    ])

    if (!origData) return toast('Conta de origem não encontrada', 'error')
    if (!destData) return toast('Conta de destino não encontrada', 'error')

    const saldoOrig = Number(origData.saldo_atual || 0)
    if (saldoOrig < v) {
      return toast(`Saldo insuficiente na conta "${origData.nome}". Disponível: ${fmt(saldoOrig)}`, 'error')
    }

    // Lança no caixa
    const { error: e1 } = await supabase.from('caixa').insert({
      data, tipo: 'saida', valor: v, categoria: 'Transferência',
      descricao: `${descricao} → ${destData.nome}`,
      conta_id: contaOrigem, obs: obs || null, origem_tabela: 'transferencia',
    })
    if (e1) return toast('Erro ao lançar saída: ' + e1.message, 'error')

    const { error: e2 } = await supabase.from('caixa').insert({
      data, tipo: 'entrada', valor: v, categoria: 'Transferência',
      descricao: `${descricao} ← ${origData.nome}`,
      conta_id: contaDestino, obs: obs || null, origem_tabela: 'transferencia',
    })
    if (e2) return toast('Erro ao lançar entrada: ' + e2.message, 'error')

    // Atualiza saldos com valores do banco
    await supabase.from('contas').update({ saldo_atual: saldoOrig - v }).eq('id', contaOrigem)
    await supabase.from('contas').update({ saldo_atual: Number(destData.saldo_atual || 0) + v }).eq('id', contaDestino)

    toast(`✅ ${fmt(v)} transferido de "${origData.nome}" para "${destData.nome}"`, 'success')
    setModalTransf(false)
    setTransfForm(EMPTY_TRANSF)
    load()
  }

  // ── LANÇAMENTO MANUAL ─────────────────────────────────
  const fl = (k,v) => setFormLanc(p=>({...p,[k]:v}))

  function openNewLanc()  { setFormLanc({data:today(),tipo:'entrada',descricao:'',valor:'',categoria:'',obs:''}); setEditingLanc(null); setModalLanc(true) }
  function openEditLanc(r){ setFormLanc({...r}); setEditingLanc(r.id); setModalLanc(true) }

  async function saveLanc() {
    if (!formLanc.descricao?.trim()) return toast('Descrição obrigatória','error')
    if (!formLanc.valor)             return toast('Valor obrigatório','error')
    let error
    if (editingLanc) ({ error } = await supabase.from('caixa').update(formLanc).eq('id',editingLanc))
    else             ({ error } = await supabase.from('caixa').insert(formLanc))
    if (error) { toast(error.message,'error'); return }
    toast('Salvo!','success'); setModalLanc(false); load()
  }

  async function destroy() {
    await supabase.from('caixa').delete().eq('id',deleting.id)
    toast('Excluído','success'); setDeleting(null); load()
  }

  const tipoConfig = {
    entrada:      { label:'Entrada',       cls:'badge-green',  icon:<ArrowUpCircle size={11}/> },
    saida:        { label:'Saída',         cls:'badge-red',    icon:<ArrowDownCircle size={11}/> },
    transferencia:{ label:'Transferência', cls:'badge-gray',   icon:<ArrowLeftRight size={11}/> },
  }

  return (
    <div>
      {/* Stats */}
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:16}}>
        <div className="stat-card green"><div className="stat-label">Entradas</div><div className="stat-value green text-mono">{fmt(entradas)}</div></div>
        <div className="stat-card red"><div className="stat-label">Saídas</div><div className="stat-value red text-mono">{fmt(saidas)}</div></div>
        <div className="stat-card blue"><div className="stat-label">Resultado</div><div className={`stat-value text-mono ${saldo>=0?'green':'red'}`}>{fmt(saldo)}</div></div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14}/>
          <input className="search-input" placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="form-select" style={{width:'auto'}} value={filterTipo} onChange={e=>setFilterTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="entrada">Entradas</option>
          <option value="saida">Saídas</option>
          <option value="transferencia">Transferências</option>
        </select>
        <button className="btn btn-secondary" onClick={()=>setModalTransf(true)}>
          <ArrowLeftRight size={14}/> Transferência
        </button>
        <button className="btn btn-primary" onClick={openNewLanc}>
          <Plus size={15}/> Lançamento
        </button>
      </div>

      {/* Tabela */}
      <div className="card">
        {loading ? <div className="loading"><div className="spinner"/></div> :
          filtered.length===0 ? <div className="empty-state"><p>Nenhum lançamento</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th style={{textAlign:'right'}}>Valor</th><th>Ações</th></tr></thead>
                <tbody>
                  {filtered.map(r => {
                    const isTransf = r.categoria === 'Transferência'
                    const tc = isTransf ? tipoConfig.transferencia : (tipoConfig[r.tipo] || tipoConfig.entrada)
                    return (
                      <tr key={r.id}>
                        <td className="text-mono text-muted" style={{fontSize:12,whiteSpace:'nowrap'}}>{r.data?.split('-').reverse().join('/')}</td>
                        <td><span className={`badge ${tc.cls}`} style={{display:'inline-flex',alignItems:'center',gap:4}}>{tc.icon}{tc.label}</span></td>
                        <td className="font-bold">{r.descricao}</td>
                        <td className="text-muted" style={{fontSize:12}}>{r.categoria||'—'}</td>
                        <td className={`text-mono font-bold ${isTransf ? '' : r.tipo==='entrada'?'text-green':'text-red'}`} style={{textAlign:'right'}}>
                          {isTransf ? '' : r.tipo==='entrada' ? '+' : '-'}{fmt(r.valor)}
                        </td>
                        <td><div className="action-btns">
                          <button className="icon-btn edit" onClick={()=>openEditLanc(r)}><Pencil size={14}/></button>
                          <button className="icon-btn del" onClick={()=>setDeleting(r)}><Trash2 size={14}/></button>
                        </div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* ── Modal Transferência ── */}
      {modalTransf && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title" style={{display:'flex',alignItems:'center',gap:8}}><ArrowLeftRight size={16}/> Transferência entre Contas</span>
              <button className="icon-btn" onClick={()=>setModalTransf(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Data</label>
                  <input className="form-input" type="date" value={transfForm.data} onChange={e=>tf('data',e.target.value)}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Valor *</label>
                  <input className="form-input" type="number" step="0.01" value={transfForm.valor} onChange={e=>tf('valor',e.target.value)} placeholder="0,00" autoFocus/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Conta Origem * (de onde sai)</label>
                  <select className="form-select" value={transfForm.contaOrigem} onChange={e=>tf('contaOrigem',e.target.value)}>
                    <option value="">Selecionar...</option>
                    {contas.map(c=><option key={c.id} value={c.id}>{c.nome} — {fmt(c.saldo_atual)}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Conta Destino * (para onde vai)</label>
                  <select className="form-select" value={transfForm.contaDestino} onChange={e=>tf('contaDestino',e.target.value)}>
                    <option value="">Selecionar...</option>
                    {contas.filter(c=>c.id!==transfForm.contaOrigem).map(c=><option key={c.id} value={c.id}>{c.nome} — {fmt(c.saldo_atual)}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Descrição</label>
                  <input className="form-input" value={transfForm.descricao} onChange={e=>tf('descricao',e.target.value)}/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Observações</label>
                  <textarea className="form-textarea" rows={2} value={transfForm.obs} onChange={e=>tf('obs',e.target.value)}/>
                </div>
              </div>
              {transfForm.contaOrigem && transfForm.contaDestino && Number(transfForm.valor)>0 && (
                <div style={{background:'rgba(79,142,247,.08)',border:'1px solid rgba(79,142,247,.2)',borderRadius:8,padding:'10px 14px',fontSize:12,marginTop:8}}>
                  💸 <strong style={{color:'var(--accent)'}}>{fmt(Number(transfForm.valor))}</strong> sairá de <strong>{contas.find(c=>c.id===transfForm.contaOrigem)?.nome}</strong> e entrará em <strong>{contas.find(c=>c.id===transfForm.contaDestino)?.nome}</strong>
                </div>
              )}
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={()=>setModalTransf(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={transferir}><ArrowLeftRight size={14}/> Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Lançamento ── */}
      {modalLanc && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editingLanc ? 'Editar Lançamento' : 'Novo Lançamento'}</span>
              <button className="icon-btn" onClick={()=>setModalLanc(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Data *</label>
                  <input className="form-input" type="date" value={formLanc.data} onChange={e=>fl('data',e.target.value)}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo *</label>
                  <select className="form-select" value={formLanc.tipo} onChange={e=>fl('tipo',e.target.value)}>
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Descrição *</label>
                  <input className="form-input" value={formLanc.descricao} onChange={e=>fl('descricao',e.target.value)} placeholder="Descrição do lançamento" autoFocus/>
                </div>
                <div className="form-group">
                  <label className="form-label">Valor *</label>
                  <input className="form-input" type="number" step="0.01" value={formLanc.valor} onChange={e=>fl('valor',e.target.value)} placeholder="0,00"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <input className="form-input" value={formLanc.categoria} onChange={e=>fl('categoria',e.target.value)} placeholder="Ex: Alimentação"/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Observações</label>
                  <textarea className="form-textarea" rows={2} value={formLanc.obs} onChange={e=>fl('obs',e.target.value)}/>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={()=>setModalLanc(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={saveLanc}>Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleting && <ConfirmDialog message={`Excluir "${deleting.descricao}"?`} onConfirm={destroy} onCancel={()=>setDeleting(null)}/>}
    </div>
  )
}
