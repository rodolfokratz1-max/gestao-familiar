import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, X, Landmark } from 'lucide-react'
import { today } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})

const FORMAS_PGTO = ['Dinheiro','PIX','Cartão Débito','Cartão Crédito','Boleto','Transferência','Cheque','Outro']
const EMPTY_TRANSF = { data:today(), contaOrigem:'', contaDestino:'', valor:'', descricao:'Transferência entre contas', obs:'' }
const EMPTY_LANC   = { data:today(), tipo:'entrada', descricao:'', valor:'', categoria:'', conta_id:'', forma_pgto:'', obs:'' }

export default function Caixa() {
  const toast = useToast()
  const { entidadeAtiva, pode } = useEntidade()
  const [rows, setRows]         = useState([])
  const [contas, setContas]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterTipo, setFilterTipo]   = useState('')
  const [filterConta, setFilterConta] = useState('')   // ← novo filtro por conta
  const [deleting, setDeleting] = useState(null)

  // Modal transferência
  const [modalTransf, setModalTransf] = useState(false)
  const [transfForm, setTransfForm]   = useState(EMPTY_TRANSF)

  // Modal lançamento manual
  const [modalLanc, setModalLanc]     = useState(false)
  const [editingLanc, setEditingLanc] = useState(null)
  const [formLanc, setFormLanc]       = useState(EMPTY_LANC)


  // Sanitiza payload — converte strings vazias para null (evita erro uuid inválido)
  const sanitize = (obj) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === '' ? null : v])
  )

  useEffect(() => { if (entidadeAtiva?.id) load() }, [entidadeAtiva?.id])

  async function load() {
    if (!entidadeAtiva?.id) { setLoading(false); return }
    setLoading(true)
    const [{ data: caixaData }, { data: contasData }] = await Promise.all([
      supabase.from('caixa').select('*').eq('entidade_id', entidadeAtiva?.id).order('data',{ascending:false}).order('created_at',{ascending:false}),
      supabase.from('contas').select('id,nome,tipo,saldo_atual').eq('ativo',true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
    ])
    setRows(caixaData || [])
    setContas(contasData || [])
    setLoading(false)
  }

  const isTransferencia = r => r.categoria === 'Transferência' || r.origem_tabela === 'transferencia'

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const mQ = !q || r.descricao?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
    const mT = !filterTipo  || r.tipo === filterTipo
    const mC = !filterConta || r.conta_id === filterConta
    return mQ && mT && mC
  })

  // Totais excluem transferências
  const semTransf = filtered.filter(r => !isTransferencia(r))
  const entradas  = semTransf.filter(r=>r.tipo==='entrada').reduce((s,r)=>s+Number(r.valor||0),0)
  const saidas    = semTransf.filter(r=>r.tipo==='saida').reduce((s,r)=>s+Number(r.valor||0),0)
  const saldo     = entradas - saidas

  // Nome da conta pelo id
  const nomeConta = id => contas.find(c=>c.id===id)?.nome || '—'

  // ── TRANSFERÊNCIA ──────────────────────────────────────────
  const tf = (k,v) => setTransfForm(p=>({...p,[k]:v}))

  async function transferir() {
    const { contaOrigem, contaDestino, valor, descricao, data, obs } = transfForm
    if (!contaOrigem)               return toast('Selecione a conta de origem','error')
    if (!contaDestino)              return toast('Selecione a conta de destino','error')
    if (contaOrigem===contaDestino) return toast('Origem e destino devem ser diferentes','error')
    if (!valor||Number(valor)<=0)   return toast('Informe o valor','error')
    const v = Number(valor)

    const [{ data: origData }, { data: destData }] = await Promise.all([
      supabase.from('contas').select('nome,saldo_atual').eq('id',contaOrigem).single(),
      supabase.from('contas').select('nome,saldo_atual').eq('id',contaDestino).single(),
    ])
    if (!origData) return toast('Conta de origem não encontrada','error')
    if (!destData) return toast('Conta de destino não encontrada','error')

    const saldoOrig = Number(origData.saldo_atual||0)
    if (saldoOrig < v) return toast(`Saldo insuficiente em "${origData.nome}". Disponível: ${fmt(saldoOrig)}`,'error')

    const { error: e1 } = await supabase.from('caixa').insert({entidade_id: entidadeAtiva?.id || null,
      data, tipo:'saida', valor:v, categoria:'Transferência',
      descricao:`${descricao} → ${destData.nome}`,
      conta_id:contaOrigem, obs:obs||null, origem_tabela:'transferencia',
    })
    if (e1) return toast('Erro ao lançar saída: '+e1.message,'error')

    const { error: e2 } = await supabase.from('caixa').insert({entidade_id: entidadeAtiva?.id || null,
      data, tipo:'entrada', valor:v, categoria:'Transferência',
      descricao:`${descricao} ← ${origData.nome}`,
      conta_id:contaDestino, obs:obs||null, origem_tabela:'transferencia',
    })
    if (e2) return toast('Erro ao lançar entrada: '+e2.message,'error')

    // Atualização atômica de saldo — lê do banco antes de gravar
    await supabase.from('contas').update({ saldo_atual: saldoOrig - v }).eq('id',contaOrigem)
    await supabase.from('contas').update({ saldo_atual: Number(destData.saldo_atual||0)+v }).eq('id',contaDestino)

    toast(`✅ ${fmt(v)} transferido de "${origData.nome}" para "${destData.nome}"`,'success')
    setModalTransf(false); setTransfForm(EMPTY_TRANSF); load()
  }

  // ── LANÇAMENTO MANUAL ──────────────────────────────────────
  const fl = (k,v) => setFormLanc(p=>({...p,[k]:v}))

  function openNewLanc()   { setFormLanc(EMPTY_LANC); setEditingLanc(null); setModalLanc(true) }
  function openEditLanc(r) { setFormLanc({...r, conta_id:r.conta_id||'', forma_pgto:r.forma_pgto||''}); setEditingLanc(r.id); setModalLanc(true) }

  async function saveLanc() {
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade antes de salvar', 'error')
    if (!formLanc.descricao?.trim()) return toast('Descrição obrigatória','error')
    if (!formLanc.valor)             return toast('Valor obrigatório','error')

    const payload = {
      data:       formLanc.data,
      tipo:       formLanc.tipo,
      descricao:  formLanc.descricao,
      valor:      Number(formLanc.valor),
      categoria:  formLanc.categoria||null,
      conta_id:   formLanc.conta_id||null,
      forma_pgto: formLanc.forma_pgto||null,
      obs:        formLanc.obs||null,
    }

    let error
    if (editingLanc) {
      ({ error } = await supabase.from('caixa').update(payload).eq('id',editingLanc))
    } else {
      const { error: eIns } = await supabase.from('caixa').insert(sanitize({...payload, entidade_id: entidadeAtiva?.id || null}))
      error = eIns

      // Atualiza saldo da conta se informada (lê do banco — seguro para múltiplos usuários)
      if (!eIns && formLanc.conta_id) {
        const { data: ct } = await supabase.from('contas').select('saldo_atual').eq('id',formLanc.conta_id).single()
        if (ct) {
          const delta = formLanc.tipo === 'entrada' ? Number(formLanc.valor) : -Number(formLanc.valor)
          await supabase.from('contas').update({ saldo_atual: Number(ct.saldo_atual||0)+delta }).eq('id',formLanc.conta_id)
        }
      }
    }

    if (error) { toast(error.message,'error'); return }
    toast('Salvo!','success'); setModalLanc(false); load()
  }

  async function destroy() {
    await supabase.from('caixa').delete().eq('id',deleting.id)
    toast('Excluído','success'); setDeleting(null); load()
  }

  const tipoConfig = {
    entrada:      { label:'Entrada',       cls:'badge-green', icon:<ArrowUpCircle size={11}/> },
    saida:        { label:'Saída',         cls:'badge-red',   icon:<ArrowDownCircle size={11}/> },
    transferencia:{ label:'Transferência', cls:'badge-gray',  icon:<ArrowLeftRight size={11}/> },
  }

  return (
    <div>
      {/* Cards de saldo por conta */}
      <div className="stats-grid" style={{marginBottom:12,gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))'}}>
        {contas.map(c=>(
          <div key={c.id}
            className={`stat-card ${filterConta===c.id?'blue':''}`}
            style={{cursor:'pointer',border:filterConta===c.id?'2px solid var(--accent)':'1px solid var(--border)',transition:'all .15s'}}
            onClick={()=>setFilterConta(prev=>prev===c.id?'':c.id)}
            title={`Clique para filtrar por ${c.nome}`}
          >
            <div className="stat-label" style={{display:'flex',alignItems:'center',gap:4}}>
              <Landmark size={11}/> {c.nome}
            </div>
            <div className={`stat-value text-mono ${Number(c.saldo_atual||0)>=0?'green':'red'}`} style={{fontSize:16}}>
              {fmt(c.saldo_atual||0)}
            </div>
            {c.tipo && <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>{c.tipo}</div>}
          </div>
        ))}
      </div>

      {/* Totais do período filtrado */}
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:16}}>
        <div className="stat-card green">
          <div className="stat-label">Entradas{filterConta?` — ${nomeConta(filterConta)}`:''}</div>
          <div className="stat-value green text-mono">{fmt(entradas)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Saídas{filterConta?` — ${nomeConta(filterConta)}`:''}</div>
          <div className="stat-value red text-mono">{fmt(saidas)}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Resultado</div>
          <div className={`stat-value text-mono ${saldo>=0?'green':'red'}`}>{fmt(saldo)}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14}/>
          <input className="search-input" placeholder="Buscar descrição ou categoria..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <select className="form-select" style={{width:'auto'}} value={filterTipo} onChange={e=>setFilterTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="entrada">Entradas</option>
          <option value="saida">Saídas</option>
          <option value="transferencia">Transferências</option>
        </select>
        <select className="form-select" style={{width:'auto'}} value={filterConta} onChange={e=>setFilterConta(e.target.value)}>
          <option value="">Todas as contas</option>
          {contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
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
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th>Conta</th>
                    <th>Forma Pgto</th>
                    <th style={{textAlign:'right'}}>Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const isTransf = isTransferencia(r)
                    const tc = isTransf ? tipoConfig.transferencia : (tipoConfig[r.tipo] || tipoConfig.entrada)
                    const conta = contas.find(c=>c.id===r.conta_id)
                    return (
                      <tr key={r.id} style={{opacity: isTransf ? 0.75 : 1}}>
                        <td className="text-mono text-muted" style={{fontSize:12,whiteSpace:'nowrap'}}>
                          {r.data?.split('-').reverse().join('/')}
                        </td>
                        <td>
                          <span className={`badge ${tc.cls}`} style={{display:'inline-flex',alignItems:'center',gap:4}}>
                            {tc.icon}{tc.label}
                          </span>
                        </td>
                        <td className="font-bold">{r.descricao}</td>
                        <td className="text-muted" style={{fontSize:12}}>{r.categoria||'—'}</td>
                        <td style={{fontSize:12}}>
                          {conta
                            ? <span style={{display:'inline-flex',alignItems:'center',gap:4,color:'var(--text2)'}}>
                                <Landmark size={11}/>{conta.nome}
                              </span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td style={{fontSize:11,color:'var(--text3)'}}>{r.forma_pgto||'—'}</td>
                        <td className={`text-mono font-bold ${isTransf?'':''}` } style={{
                          textAlign:'right',
                          color: isTransf?'var(--text3)':r.tipo==='entrada'?'var(--green)':'var(--red)'
                        }}>
                          {!isTransf&&(r.tipo==='entrada'?'+ ':'- ')}{fmt(r.valor)}
                        </td>
                        <td>
                          <div className="action-btns">
                            <button className="icon-btn edit" onClick={()=>openEditLanc(r)}><Pencil size={14}/></button>
                            <button className="icon-btn del"  onClick={()=>setDeleting(r)}><Trash2 size={14}/></button>
                          </div>
                        </td>
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
              <span className="modal-title" style={{display:'flex',alignItems:'center',gap:8}}>
                <ArrowLeftRight size={16}/> Transferência entre Contas
              </span>
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
                    {contas.map(c=><option key={c.id} value={c.id}>{c.nome} — {fmt(c.saldo_atual||0)}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Conta Destino * (para onde vai)</label>
                  <select className="form-select" value={transfForm.contaDestino} onChange={e=>tf('contaDestino',e.target.value)}>
                    <option value="">Selecionar...</option>
                    {contas.filter(c=>c.id!==transfForm.contaOrigem).map(c=><option key={c.id} value={c.id}>{c.nome} — {fmt(c.saldo_atual||0)}</option>)}
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
                  💸 <strong style={{color:'var(--accent)'}}>{fmt(Number(transfForm.valor))}</strong> sairá de{' '}
                  <strong>{contas.find(c=>c.id===transfForm.contaOrigem)?.nome}</strong> e entrará em{' '}
                  <strong>{contas.find(c=>c.id===transfForm.contaDestino)?.nome}</strong>
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

      {/* ── Modal Lançamento Manual ── */}
      {modalLanc && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editingLanc?'Editar Lançamento':'Novo Lançamento'}</span>
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
                    <option value="entrada">↑ Entrada</option>
                    <option value="saida">↓ Saída</option>
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
                {/* ── NOVO: Conta e Forma de Pagamento ── */}
                <div className="form-group">
                  <label className="form-label">Conta / Carteira</label>
                  <select className="form-select" value={formLanc.conta_id} onChange={e=>fl('conta_id',e.target.value)}>
                    <option value="">Não vincular</option>
                    {contas.map(c=><option key={c.id} value={c.id}>{c.nome} ({c.tipo||''})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Forma de Pagamento</label>
                  <select className="form-select" value={formLanc.forma_pgto} onChange={e=>fl('forma_pgto',e.target.value)}>
                    <option value="">Selecionar...</option>
                    {FORMAS_PGTO.map(f=><option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                {/* Aviso de impacto no saldo */}
                {formLanc.conta_id && !editingLanc && (
                  <div style={{gridColumn:'1/-1',fontSize:12,padding:'8px 12px',borderRadius:8,
                    background:'rgba(52,211,153,.07)',border:'1px solid rgba(52,211,153,.2)',color:'var(--green)'}}>
                    ✓ O saldo de <strong>{contas.find(c=>c.id===formLanc.conta_id)?.nome}</strong> será {formLanc.tipo==='entrada'?'aumentado':'reduzido'} em {formLanc.valor?fmt(Number(formLanc.valor)):'...'}
                  </div>
                )}
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
