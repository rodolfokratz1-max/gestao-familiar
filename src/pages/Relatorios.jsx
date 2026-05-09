import { useState, useEffect } from 'react'
import { useEntidade } from '../contexts/EntidadeContext'
import { supabase } from '../lib/supabase'
import { BarChartSVG, PieChartSVG, CHART_COLORS } from '../lib/charts'
import { FileText, TrendingUp, TrendingDown, BarChart2, ArrowLeftRight, Landmark } from 'lucide-react'
import { fmtDate } from '../lib/utils.js'

const fmt  = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const semTransferencia = rows => (rows||[]).filter(r => r.categoria !== 'Transferência' && r.origem_tabela !== 'transferencia')

export default function Relatorios() {
  const { entidadeAtiva } = useEntidade()
  const anoAtual = new Date().getFullYear()
  const [aba, setAba]           = useState('dre')
  const [ano, setAno]           = useState(anoAtual)
  const [mesIni, setMesIni]     = useState(String(new Date().getMonth()+1).padStart(2,'0'))
  const [mesFim, setMesFim]     = useState(String(new Date().getMonth()+1).padStart(2,'0'))
  const [filterConta, setFilterConta] = useState('')   // ← filtro por conta no extrato
  const [loading, setLoading]   = useState(false)
  const [dados, setDados]       = useState({})
  const [contas, setContas]     = useState([])

  // Carrega contas uma só vez
  useEffect(() => {
    supabase.from('contas').select('id,nome,tipo').eq('ativo',true).eq('entidade_id', entidadeAtiva?.id).order('nome').then(({data})=>setContas(data||[]))
  }, [])

  useEffect(() => { loadDados() }, [aba, ano, mesIni, mesFim, filterConta])

  async function loadDados() {
    setLoading(true)
    const ini    = `${ano}-${mesIni.padStart(2,'0')}-01`
    const ult    = new Date(ano, Number(mesFim), 0).getDate()
    const fim    = `${ano}-${mesFim.padStart(2,'0')}-${ult}`
    const anoIni = `${ano}-01-01`
    const anoFim = `${ano}-12-31`

    if (aba === 'dre') {
      let q = supabase.from('caixa').select('tipo,valor,data,categoria,origem_tabela').gte('data',anoIni).lte('data',anoFim).eq('entidade_id', entidadeAtiva?.id)
      if (filterConta) q = q.eq('conta_id', filterConta)
      const { data: caixaRaw } = await q
      const caixa = semTransferencia(caixaRaw)
      const meses = MESES.map((label,i) => {
        const m = String(i+1).padStart(2,'0')
        const d = caixa.filter(r=>r.data?.startsWith(`${ano}-${m}`))
        const receita = d.filter(r=>r.tipo==='entrada').reduce((s,r)=>s+Number(r.valor),0)
        const despesa = d.filter(r=>r.tipo==='saida').reduce((s,r)=>s+Number(r.valor),0)
        return { label, mes:m, receita, despesa, resultado:receita-despesa }
      })
      const totalRec = meses.reduce((s,m)=>s+m.receita,0)
      const totalDes = meses.reduce((s,m)=>s+m.despesa,0)
      setDados({ meses, totalRec, totalDes, totalRes:totalRec-totalDes })
    }

    if (aba === 'categorias') {
      let q = supabase.from('caixa').select('valor,categoria,origem_tabela').eq('tipo','saida').gte('data',ini).lte('data',fim).eq('entidade_id', entidadeAtiva?.id)
      if (filterConta) q = q.eq('conta_id', filterConta)
      const { data: raw } = await q
      const saidas = semTransferencia(raw)
      const map = {}
      saidas.forEach(r=>{ const k=r.categoria||'Sem categoria'; map[k]=(map[k]||0)+Number(r.valor) })
      const lista = Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}))
      setDados({ lista, total:lista.reduce((s,x)=>s+x.value,0) })
    }

    if (aba === 'categorias_rec') {
      let q = supabase.from('caixa').select('valor,categoria,origem_tabela').eq('tipo','entrada').gte('data',ini).lte('data',fim).eq('entidade_id', entidadeAtiva?.id)
      if (filterConta) q = q.eq('conta_id', filterConta)
      const { data: raw } = await q
      const entradas = semTransferencia(raw)
      const map = {}
      entradas.forEach(r=>{ const k=r.categoria||'Sem categoria'; map[k]=(map[k]||0)+Number(r.valor) })
      const lista = Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}))
      setDados({ lista, total:lista.reduce((s,x)=>s+x.value,0) })
    }

    if (aba === 'periodo') {
      let q = supabase.from('caixa').select('id,tipo,valor,data,categoria,descricao,origem_tabela,conta_id,forma_pgto').eq('entidade_id', entidadeAtiva?.id)
        .gte('data',ini).lte('data',fim).order('data',{ascending:false})
      if (filterConta) q = q.eq('conta_id', filterConta)
      const { data: caixaRaw } = await q

      const caixaSemTransf = semTransferencia(caixaRaw)
      const transferencias  = (caixaRaw||[]).filter(r=>r.categoria==='Transferência'||r.origem_tabela==='transferencia')

      const totalE   = caixaSemTransf.filter(r=>r.tipo==='entrada').reduce((s,r)=>s+Number(r.valor),0)
      const totalS   = caixaSemTransf.filter(r=>r.tipo==='saida').reduce((s,r)=>s+Number(r.valor),0)
      const totalTrf = transferencias.filter(r=>r.tipo==='saida').reduce((s,r)=>s+Number(r.valor),0)

      setDados({ caixa:caixaRaw||[], totalE, totalS, totalTrf, resultado:totalE-totalS })
    }

    setLoading(false)
  }

  const anos  = Array.from({length:5},(_,i)=>anoAtual-2+i)
  const meses = Array.from({length:12},(_,i)=>({ v:String(i+1).padStart(2,'0'), l:MESES[i] }))
  const nomeConta = id => contas.find(c=>c.id===id)?.nome || '—'

  const ABAS = [
    { id:'dre',           label:'DRE Anual',             icon:<BarChart2 size={13}/> },
    { id:'categorias',    label:'Despesas por Categoria', icon:<TrendingDown size={13}/> },
    { id:'categorias_rec',label:'Receitas por Categoria', icon:<TrendingUp size={13}/> },
    { id:'periodo',       label:'Extrato por Período',    icon:<FileText size={13}/> },
  ]

  return (
    <div>
      {/* Abas */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)',flexWrap:'wrap'}}>
        {ABAS.map(a=>(
          <button key={a.id} onClick={()=>setAba(a.id)} style={{
            display:'flex',alignItems:'center',gap:5,background:'none',border:'none',cursor:'pointer',
            padding:'8px 14px 12px',fontSize:12,fontWeight:600,
            color:aba===a.id?'var(--accent)':'var(--text2)',
            borderBottom:aba===a.id?'2px solid var(--accent)':'2px solid transparent',
            marginBottom:-1,transition:'all .15s'
          }}>{a.icon}{a.label}</button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'flex-end'}}>
        <div className="form-group" style={{marginBottom:0}}>
          <label className="form-label">Ano</label>
          <select className="form-select" style={{width:'auto'}} value={ano} onChange={e=>setAno(Number(e.target.value))}>
            {anos.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {aba !== 'dre' && <>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Mês início</label>
            <select className="form-select" style={{width:'auto'}} value={mesIni} onChange={e=>setMesIni(e.target.value)}>
              {meses.map(m=><option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Mês fim</label>
            <select className="form-select" style={{width:'auto'}} value={mesFim} onChange={e=>setMesFim(e.target.value)}>
              {meses.map(m=><option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
        </>}
        {/* Filtro de conta — disponível em todas as abas */}
        <div className="form-group" style={{marginBottom:0}}>
          <label className="form-label" style={{display:'flex',alignItems:'center',gap:4}}><Landmark size={11}/> Conta</label>
          <select className="form-select" style={{width:'auto'}} value={filterConta} onChange={e=>setFilterConta(e.target.value)}>
            <option value="">Todas as contas</option>
            {contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        {filterConta && (
          <div style={{fontSize:11,padding:'6px 10px',background:'rgba(79,142,247,.1)',borderRadius:6,color:'var(--accent)',display:'flex',alignItems:'center',gap:5,alignSelf:'flex-end',marginBottom:1}}>
            <Landmark size={11}/> Filtrando: <strong>{nomeConta(filterConta)}</strong>
            <button onClick={()=>setFilterConta('')} style={{background:'none',border:'none',cursor:'pointer',color:'var(--accent)',padding:0,lineHeight:1,marginLeft:2}}>✕</button>
          </div>
        )}
      </div>

      {loading ? <div className="loading"><div className="spinner"/></div> : <>

        {/* ── DRE ANUAL ── */}
        {aba === 'dre' && dados.meses && (
          <>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:10,display:'flex',alignItems:'center',gap:5}}>
              <ArrowLeftRight size={11}/> Transferências entre contas excluídas dos totais
              {filterConta && <span style={{color:'var(--accent)',fontWeight:600}}> · Conta: {nomeConta(filterConta)}</span>}
            </div>
            <div className="stats-grid" style={{marginBottom:16}}>
              <div className="stat-card green"><div className="stat-label">Receita {ano}</div><div className="stat-value green text-mono">{fmt(dados.totalRec)}</div></div>
              <div className="stat-card red"><div className="stat-label">Despesa {ano}</div><div className="stat-value red text-mono">{fmt(dados.totalDes)}</div></div>
              <div className={`stat-card ${dados.totalRes>=0?'green':'red'}`}>
                <div className="stat-label">Resultado {ano}</div>
                <div className={`stat-value text-mono ${dados.totalRes>=0?'green':'red'}`}>{fmt(dados.totalRes)}</div>
              </div>
            </div>
            <div className="card" style={{marginBottom:16}}>
              <div className="card-header"><span className="card-title">Resultado mensal — {ano}{filterConta?` · ${nomeConta(filterConta)}`:''}</span></div>
              <BarChartSVG data={dados.meses.map(m=>({name:m.label,Receita:m.receita,Despesa:m.despesa}))} keys={['Receita','Despesa']} colors={['#34d399','#f87171']} height={240}/>
            </div>
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{minWidth:700}}>
                  <thead><tr>
                    <th style={{minWidth:100}}>Descrição</th>
                    {dados.meses.map(m=><th key={m.mes} style={{textAlign:'right',minWidth:80}}>{m.label}</th>)}
                    <th style={{textAlign:'right',minWidth:100}}>Total</th>
                  </tr></thead>
                  <tbody>
                    <tr style={{background:'rgba(52,211,153,.05)'}}>
                      <td style={{fontWeight:700,color:'var(--green)'}}>↑ Receita</td>
                      {dados.meses.map(m=><td key={m.mes} style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:12,color:m.receita>0?'var(--green)':'var(--text3)'}}>{m.receita>0?fmt(m.receita):'—'}</td>)}
                      <td style={{textAlign:'right',fontFamily:'var(--mono)',fontWeight:800,color:'var(--green)'}}>{fmt(dados.totalRec)}</td>
                    </tr>
                    <tr style={{background:'rgba(248,113,113,.05)'}}>
                      <td style={{fontWeight:700,color:'var(--red)'}}>↓ Despesa</td>
                      {dados.meses.map(m=><td key={m.mes} style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:12,color:m.despesa>0?'var(--red)':'var(--text3)'}}>{m.despesa>0?fmt(m.despesa):'—'}</td>)}
                      <td style={{textAlign:'right',fontFamily:'var(--mono)',fontWeight:800,color:'var(--red)'}}>{fmt(dados.totalDes)}</td>
                    </tr>
                    <tr style={{borderTop:'2px solid var(--border2)'}}>
                      <td style={{fontWeight:800}}>= Resultado</td>
                      {dados.meses.map(m=><td key={m.mes} style={{textAlign:'right',fontFamily:'var(--mono)',fontSize:12,fontWeight:700,color:m.resultado>0?'var(--green)':m.resultado<0?'var(--red)':'var(--text3)'}}>{m.resultado!==0?fmt(m.resultado):'—'}</td>)}
                      <td style={{textAlign:'right',fontFamily:'var(--mono)',fontWeight:900,fontSize:14,color:dados.totalRes>=0?'var(--green)':'var(--red)'}}>{fmt(dados.totalRes)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── CATEGORIAS DESPESA / RECEITA ── */}
        {(aba === 'categorias' || aba === 'categorias_rec') && dados.lista && (
          <>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:10,display:'flex',alignItems:'center',gap:5}}>
              <ArrowLeftRight size={11}/> Transferências não incluídas
              {filterConta && <span style={{color:'var(--accent)',fontWeight:600}}> · Conta: {nomeConta(filterConta)}</span>}
            </div>
            <div className="stat-card" style={{marginBottom:16,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 20px'}}>
              <div className="stat-label">{aba==='categorias'?'Total Despesas':'Total Receitas'} no período</div>
              <div className={`stat-value text-mono ${aba==='categorias'?'red':'green'}`}>{fmt(dados.total)}</div>
            </div>
            {dados.lista.length === 0
              ? <div className="empty-state"><FileText size={40}/><p>Sem dados no período</p></div>
              : <div className="dash-grid">
                  <div className="card">
                    <div className="card-header"><span className="card-title">Distribuição</span></div>
                    <PieChartSVG data={dados.lista} colors={CHART_COLORS} height={280}/>
                  </div>
                  <div className="card">
                    <div className="card-header"><span className="card-title">Ranking</span></div>
                    {dados.lista.map((c,i)=>(
                      <div key={c.name} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                          <span style={{fontWeight:600}}>{c.name}</span>
                          <div style={{display:'flex',gap:10,alignItems:'center'}}>
                            <span style={{color:'var(--text3)',fontSize:11}}>{((c.value/dados.total)*100).toFixed(1)}%</span>
                            <span style={{fontWeight:700,fontFamily:'var(--mono)',color:aba==='categorias'?'var(--red)':'var(--green)'}}>{fmt(c.value)}</span>
                          </div>
                        </div>
                        <div style={{height:5,borderRadius:3,background:'var(--bg3)',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${(c.value/dados.lista[0].value)*100}%`,background:CHART_COLORS[i%CHART_COLORS.length],borderRadius:3}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
            }
          </>
        )}

        {/* ── EXTRATO POR PERÍODO ── */}
        {aba === 'periodo' && dados.caixa !== undefined && (
          <>
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:10,display:'flex',alignItems:'center',gap:5}}>
              <ArrowLeftRight size={11}/> Transferências não somam nos totais
              {filterConta && <span style={{color:'var(--accent)',fontWeight:600}}> · Conta: {nomeConta(filterConta)}</span>}
            </div>
            <div className="stats-grid" style={{marginBottom:16}}>
              <div className="stat-card green">
                <div className="stat-label">Entradas (sem transf.)</div>
                <div className="stat-value green text-mono">{fmt(dados.totalE)}</div>
              </div>
              <div className="stat-card red">
                <div className="stat-label">Saídas (sem transf.)</div>
                <div className="stat-value red text-mono">{fmt(dados.totalS)}</div>
              </div>
              <div className={`stat-card ${dados.resultado>=0?'green':'red'}`}>
                <div className="stat-label">Resultado</div>
                <div className={`stat-value text-mono ${dados.resultado>=0?'green':'red'}`}>{fmt(dados.resultado)}</div>
              </div>
              {dados.totalTrf>0 && (
                <div className="stat-card" style={{background:'var(--bg2)'}}>
                  <div className="stat-label">Transferências (não computadas)</div>
                  <div className="stat-value text-mono" style={{color:'var(--text2)'}}>{fmt(dados.totalTrf)}</div>
                </div>
              )}
            </div>
            {dados.caixa.length === 0
              ? <div className="empty-state"><FileText size={40}/><p>Nenhuma movimentação no período</p></div>
              : <div className="card" style={{padding:0,overflow:'hidden'}}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th>Conta</th>
                        <th>Forma Pgto</th>
                        <th style={{textAlign:'right'}}>Valor</th>
                        <th>Tipo</th>
                      </tr></thead>
                      <tbody>
                        {dados.caixa.map(r => {
                          const isTransf = r.categoria==='Transferência'||r.origem_tabela==='transferencia'
                          const conta = contas.find(c=>c.id===r.conta_id)
                          return (
                            <tr key={r.id||Math.random()} style={{opacity:isTransf?0.6:1}}>
                              <td style={{fontSize:12,color:'var(--text2)',whiteSpace:'nowrap'}}>
                                {fmtDate(r.data)}
                              </td>
                              <td style={{fontWeight:600}}>{r.descricao}</td>
                              <td>{r.categoria?<span className="badge badge-gray" style={{fontSize:11}}>{r.categoria}</span>:'—'}</td>
                              <td style={{fontSize:12}}>
                                {conta
                                  ? <span style={{display:'inline-flex',alignItems:'center',gap:4,color:'var(--text2)'}}>
                                      <Landmark size={11}/>{conta.nome}
                                    </span>
                                  : <span className="text-muted">—</span>}
                              </td>
                              <td style={{fontSize:11,color:'var(--text3)'}}>{r.forma_pgto||'—'}</td>
                              <td style={{
                                textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,
                                color:isTransf?'var(--text3)':r.tipo==='entrada'?'var(--green)':'var(--red)'
                              }}>
                                {!isTransf&&(r.tipo==='entrada'?'+ ':'- ')}{fmt(r.valor)}
                              </td>
                              <td>
                                {isTransf
                                  ? <span className="badge badge-gray" style={{fontSize:11,display:'inline-flex',alignItems:'center',gap:3}}>
                                      <ArrowLeftRight size={10}/> Transf.
                                    </span>
                                  : <span className={`badge ${r.tipo==='entrada'?'badge-green':'badge-red'}`} style={{fontSize:11}}>
                                      {r.tipo==='entrada'?'Entrada':'Saída'}
                                    </span>
                                }
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
            }
          </>
        )}
      </>}
    </div>
  )
}
