import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { FileText, TrendingUp, TrendingDown, BarChart2, Download } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const fmtK = v => { const n=Number(v||0); return Math.abs(n)>=1000?'R$'+(n/1000).toFixed(0)+'k':'R$'+n.toFixed(0) }
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CORES = ['#4f8ef7','#34d399','#f87171','#fbbf24','#a78bfa','#fb923c','#38bdf8','#f472b6','#4ade80','#f97316']

export default function Relatorios() {
  const anoAtual = new Date().getFullYear()
  const [aba, setAba]         = useState('dre') // dre | categorias | categorias_rec | periodo
  const [ano, setAno]         = useState(anoAtual)
  const [mesIni, setMesIni]   = useState(String(new Date().getMonth()+1).padStart(2,'0'))
  const [mesFim, setMesFim]   = useState(String(new Date().getMonth()+1).padStart(2,'0'))
  const [loading, setLoading] = useState(false)
  const [dados, setDados]     = useState({})

  useEffect(() => { loadDados() }, [aba, ano, mesIni, mesFim])

  async function loadDados() {
    setLoading(true)
    const ini = `${ano}-${mesIni.padStart(2,'0')}-01`
    const ult  = new Date(ano, Number(mesFim), 0).getDate()
    const fim  = `${ano}-${mesFim.padStart(2,'0')}-${ult}`
    const anoIni = `${ano}-01-01`, anoFim = `${ano}-12-31`

    if (aba === 'dre') {
      // DRE anual — todos os meses
      const { data: caixa } = await supabase.from('caixa').select('tipo,valor,data,categoria').gte('data',anoIni).lte('data',anoFim)
      const meses = MESES.map((label,i) => {
        const m = String(i+1).padStart(2,'0')
        const d = caixa?.filter(r=>r.data?.startsWith(`${ano}-${m}`)) || []
        const receita = d.filter(r=>r.tipo==='entrada').reduce((s,r)=>s+Number(r.valor),0)
        const despesa = d.filter(r=>r.tipo==='saida').reduce((s,r)=>s+Number(r.valor),0)
        return { label, mes:m, receita, despesa, resultado:receita-despesa }
      })
      const totalRec = meses.reduce((s,m)=>s+m.receita,0)
      const totalDes = meses.reduce((s,m)=>s+m.despesa,0)
      setDados({ meses, totalRec, totalDes, totalRes:totalRec-totalDes })
    }

    if (aba === 'categorias') {
      const { data: saidas } = await supabase.from('caixa').select('valor,categoria').eq('tipo','saida').gte('data',ini).lte('data',fim)
      const map = {}
      ;(saidas||[]).forEach(r => { const k=r.categoria||'Sem categoria'; map[k]=(map[k]||0)+Number(r.valor) })
      const lista = Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}))
      const total = lista.reduce((s,x)=>s+x.value,0)
      setDados({ lista, total })
    }

    if (aba === 'categorias_rec') {
      const { data: entradas } = await supabase.from('caixa').select('valor,categoria').eq('tipo','entrada').gte('data',ini).lte('data',fim)
      const map = {}
      ;(entradas||[]).forEach(r => { const k=r.categoria||'Sem categoria'; map[k]=(map[k]||0)+Number(r.valor) })
      const lista = Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}))
      const total = lista.reduce((s,x)=>s+x.value,0)
      setDados({ lista, total })
    }

    if (aba === 'periodo') {
      const { data: caixa } = await supabase.from('caixa').select('tipo,valor,data,categoria,descricao').gte('data',ini).lte('data',fim).order('data',{ascending:false})
      const entradas = (caixa||[]).filter(r=>r.tipo==='entrada')
      const saidas   = (caixa||[]).filter(r=>r.tipo==='saida')
      const totalE   = entradas.reduce((s,r)=>s+Number(r.valor),0)
      const totalS   = saidas.reduce((s,r)=>s+Number(r.valor),0)
      setDados({ caixa: caixa||[], totalE, totalS, resultado:totalE-totalS })
    }

    setLoading(false)
  }

  const anos = Array.from({length:5},(_,i)=>anoAtual-2+i)
  const meses = Array.from({length:12},(_,i)=>({ v:String(i+1).padStart(2,'0'), l:MESES[i] }))

  const ABAS = [
    { id:'dre', label:'DRE Anual', icon:<BarChart2 size={13}/> },
    { id:'categorias', label:'Despesas por Categoria', icon:<TrendingDown size={13}/> },
    { id:'categorias_rec', label:'Receitas por Categoria', icon:<TrendingUp size={13}/> },
    { id:'periodo', label:'Extrato por Período', icon:<FileText size={13}/> },
  ]

  const CustomTooltip = ({active,payload,label}) => {
    if (!active||!payload?.length) return null
    return (
      <div style={{background:'var(--bg2)',border:'1px solid var(--border2)',borderRadius:10,padding:'10px 14px',fontSize:12}}>
        <div style={{fontWeight:700,marginBottom:6}}>{label}</div>
        {payload.map(p=>(
          <div key={p.name} style={{display:'flex',justifyContent:'space-between',gap:16,marginBottom:2,color:p.name==='Receita'?'var(--green)':p.name==='Despesa'?'var(--red)':'var(--accent)'}}>
            <span>{p.name}</span><span style={{fontWeight:700}}>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Abas */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)',paddingBottom:0,flexWrap:'wrap'}}>
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
      </div>

      {loading ? <div className="loading"><div className="spinner"/></div> : <>

        {/* DRE ANUAL */}
        {aba === 'dre' && dados.meses && (
          <>
            <div className="stats-grid" style={{marginBottom:16}}>
              <div className="stat-card green"><div className="stat-label">Receita {ano}</div><div className="stat-value green text-mono">{fmt(dados.totalRec)}</div></div>
              <div className="stat-card red"><div className="stat-label">Despesa {ano}</div><div className="stat-value red text-mono">{fmt(dados.totalDes)}</div></div>
              <div className={`stat-card ${dados.totalRes>=0?'green':'red'}`}><div className="stat-label">Resultado {ano}</div><div className={`stat-value text-mono ${dados.totalRes>=0?'green':'red'}`}>{fmt(dados.totalRes)}</div></div>
            </div>
            <div className="card" style={{marginBottom:16}}>
              <div className="card-header"><span className="card-title">Resultado mensal — {ano}</span></div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dados.meses.map(m=>({name:m.label,Receita:m.receita,Despesa:m.despesa}))} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="name" tick={{fill:'var(--text3)',fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tickFormatter={fmtK} tick={{fill:'var(--text3)',fontSize:10}} axisLine={false} tickLine={false} width={48}/>
                  <Tooltip content={<CustomTooltip/>} cursor={{fill:'rgba(255,255,255,.04)'}}/>
                  <Bar dataKey="Receita" fill="var(--green)" radius={[3,3,0,0]} opacity={.85}/>
                  <Bar dataKey="Despesa" fill="var(--red)" radius={[3,3,0,0]} opacity={.85}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card" style={{padding:0,overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{minWidth:700}}>
                  <thead>
                    <tr>
                      <th style={{minWidth:100}}>Descrição</th>
                      {dados.meses.map(m=><th key={m.mes} style={{textAlign:'right',minWidth:80}}>{m.label}</th>)}
                      <th style={{textAlign:'right',minWidth:100}}>Total</th>
                    </tr>
                  </thead>
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

        {/* CATEGORIAS DESPESA/RECEITA */}
        {(aba === 'categorias' || aba === 'categorias_rec') && dados.lista && (
          <>
            <div className="stat-card" style={{marginBottom:16,background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 20px'}}>
              <div className="stat-label">{aba==='categorias'?'Total Despesas':'Total Receitas'} no período</div>
              <div className={`stat-value text-mono ${aba==='categorias'?'red':'green'}`}>{fmt(dados.total)}</div>
            </div>
            {dados.lista.length === 0
              ? <div className="empty-state"><FileText size={40}/><p>Sem dados no período</p></div>
              : <div className="dash-grid">
                  <div className="card">
                    <div className="card-header"><span className="card-title">Distribuição</span></div>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={dados.lista} cx="45%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                          {dados.lista.map((_,i)=><Cell key={i} fill={CORES[i%CORES.length]}/>)}
                        </Pie>
                        <Tooltip formatter={v=>[fmt(v)]}/>
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}}/>
                      </PieChart>
                    </ResponsiveContainer>
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
                          <div style={{height:'100%',width:`${(c.value/dados.lista[0].value)*100}%`,background:CORES[i%CORES.length],borderRadius:3}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
            }
          </>
        )}

        {/* EXTRATO POR PERÍODO */}
        {aba === 'periodo' && dados.caixa !== undefined && (
          <>
            <div className="stats-grid" style={{marginBottom:16}}>
              <div className="stat-card green"><div className="stat-label">Entradas</div><div className="stat-value green text-mono">{fmt(dados.totalE)}</div></div>
              <div className="stat-card red"><div className="stat-label">Saídas</div><div className="stat-value red text-mono">{fmt(dados.totalS)}</div></div>
              <div className={`stat-card ${dados.resultado>=0?'green':'red'}`}><div className="stat-label">Resultado</div><div className={`stat-value text-mono ${dados.resultado>=0?'green':'red'}`}>{fmt(dados.resultado)}</div></div>
            </div>
            {dados.caixa.length === 0
              ? <div className="empty-state"><FileText size={40}/><p>Nenhuma movimentação no período</p></div>
              : <div className="card" style={{padding:0,overflow:'hidden'}}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style={{textAlign:'right'}}>Valor</th><th>Tipo</th></tr></thead>
                      <tbody>
                        {dados.caixa.map(r=>(
                          <tr key={r.id||Math.random()}>
                            <td style={{fontSize:12,color:'var(--text2)',whiteSpace:'nowrap'}}>{r.data?new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td>
                            <td style={{fontWeight:600}}>{r.descricao}</td>
                            <td>{r.categoria?<span className="badge badge-gray" style={{fontSize:11}}>{r.categoria}</span>:'—'}</td>
                            <td style={{textAlign:'right',fontFamily:'var(--mono)',fontWeight:700,color:r.tipo==='entrada'?'var(--green)':'var(--red)'}}>
                              {r.tipo==='entrada'?'+ ':r.tipo==='saida'?'- ':''}{fmt(r.valor)}
                            </td>
                            <td><span className={`badge ${r.tipo==='entrada'?'badge-green':r.tipo==='saida'?'badge-red':'badge-gray'}`} style={{fontSize:11}}>{r.tipo==='entrada'?'Entrada':r.tipo==='saida'?'Saída':'Transf.'}</span></td>
                          </tr>
                        ))}
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
