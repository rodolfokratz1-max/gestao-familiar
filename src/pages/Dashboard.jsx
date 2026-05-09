import { useState, useEffect } from 'react'
import { useEntidade } from '../contexts/EntidadeContext'
import { supabase } from '../lib/supabase'
import { TrendingUp, TrendingDown, Wallet, HandCoins, CreditCard, AlertCircle, ChevronRight, Target, BarChart2, RefreshCw } from 'lucide-react'
import { BarChartSVG, PieChartSVG, CHART_COLORS } from '../lib/charts'
import { today } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const fmtK = v => { const n=Number(v||0); return Math.abs(n)>=1000 ? 'R$'+(n/1000).toFixed(0)+'k' : 'R$'+n.toFixed(0) }
export default function Dashboard({ onNavigate }) {
  const { entidadeAtiva } = useEntidade()
  const [loading, setLoading]     = useState(true)
  const [stats, setStats]         = useState({})
  const [chart6m, setChart6m]     = useState([])
  const [catDespesa, setCatDespesa] = useState([])
  const [catReceita, setCatReceita] = useState([])
  const [centros, setCentros]     = useState([])
  const [cartoes, setCartoes]     = useState([])
  const [faturas, setFaturas]     = useState([])
  const [vencendoHoje, setVencendoHoje]   = useState({ pagar:0, receber:0 })
  const [vencendo7d, setVencendo7d]       = useState({ pagar:0, receber:0 })

  useEffect(() => { if (entidadeAtiva?.id) load() }, [entidadeAtiva?.id])

  async function load() {
    setLoading(true)
    const mesAtual = new Date()
    const ano = mesAtual.getFullYear()
    const mes = String(mesAtual.getMonth()+1).padStart(2,'0')
    const ini = `${ano}-${mes}-01`
    const fim = `${ano}-${mes}-${new Date(ano, mesAtual.getMonth()+1, 0).getDate()}`
    const td  = today()
    const d7  = new Date(); d7.setDate(d7.getDate()+7); const d7s = d7.toISOString().split('T')[0]

    const [caixa, apagar, areceber, cartR, fatR, ccR] = await Promise.allSettled([
      supabase.from('caixa').select('tipo,valor,data,categoria,origem_tabela').eq('entidade_id', entidadeAtiva?.id).gte('data',`${ano}-01-01`).lte('data',`${ano}-12-31`),
      supabase.from('contas_pagar').select('valor,vencimento').eq('pago',false).eq('ativo',true).eq('entidade_id', entidadeAtiva?.id),
      supabase.from('contas_receber').select('valor,vencimento').eq('recebido',false).eq('ativo',true).eq('entidade_id', entidadeAtiva?.id),
      supabase.from('cartoes').select('*').eq('ativo',true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('faturas_cartao').select('*').eq('entidade_id', entidadeAtiva?.id).order('mes_ref',{ascending:false}),
      supabase.from('centros_custo').select('id,nome').eq('ativo',true).order('nome'),
    ])

    const caixaData = caixa?.value?.data || []
    const apagarData = apagar?.value?.data || []
    const areceberData = areceber?.value?.data || []

    // Stats do mês atual
    const entMes = caixaData.filter(r => r.tipo==='entrada' && r.data>=ini && r.data<=fim && r.categoria!=='Transferência').reduce((s,r)=>s+Number(r.valor),0)
    const saiMes = caixaData.filter(r => r.tipo==='saida' && r.data>=ini && r.data<=fim && r.categoria!=='Transferência').reduce((s,r)=>s+Number(r.valor),0)
    const totalApagar = apagarData.reduce((s,r)=>s+Number(r.valor),0)
    const totalAreceber = areceberData.reduce((s,r)=>s+Number(r.valor),0)

    setStats({ entMes, saiMes, resultado: entMes-saiMes, totalApagar, totalAreceber })

    // Vencendo hoje e em 7 dias
    setVencendoHoje({
      pagar: apagarData.filter(r=>r.vencimento===td).reduce((s,r)=>s+Number(r.valor),0),
      receber: areceberData.filter(r=>r.vencimento===td).reduce((s,r)=>s+Number(r.valor),0),
    })
    setVencendo7d({
      pagar: apagarData.filter(r=>r.vencimento>td&&r.vencimento<=d7s).reduce((s,r)=>s+Number(r.valor),0),
      receber: areceberData.filter(r=>r.vencimento>td&&r.vencimento<=d7s).reduce((s,r)=>s+Number(r.valor),0),
    })

    // Gráfico 6 meses
    const months = []
    for (let i=5; i>=0; i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i)
      const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0')
      const label = d.toLocaleString('pt-BR',{month:'short'})
      const ult = new Date(y,d.getMonth()+1,0).getDate()
      const iM=`${y}-${m}-01`, fM=`${y}-${m}-${ult}`
      const ent = caixaData.filter(r=>r.tipo==='entrada'&&r.data>=iM&&r.data<=fM&&r.categoria!=='Transferência').reduce((s,r)=>s+Number(r.valor),0)
      const sai = caixaData.filter(r=>r.tipo==='saida'&&r.data>=iM&&r.data<=fM&&r.categoria!=='Transferência').reduce((s,r)=>s+Number(r.valor),0)
      months.push({ name:label, Receita:ent, Despesa:sai, Resultado:ent-sai })
    }
    setChart6m(months)

    // Exclui transferências das categorias — não são receita/despesa real
    const naoEhTransf = r => r.categoria !== 'Transferência' && r.origem_tabela !== 'transferencia'

    // Categorias por despesa (mês atual)
    const catMap = {}
    caixaData.filter(r=>r.tipo==='saida'&&r.data>=ini&&r.data<=fim&&r.categoria&&naoEhTransf(r)).forEach(r=>{
      catMap[r.categoria] = (catMap[r.categoria]||0)+Number(r.valor)
    })
    setCatDespesa(Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,value])=>({name,value})))

    // Categorias por receita (mês atual)
    const catMapR = {}
    caixaData.filter(r=>r.tipo==='entrada'&&r.data>=ini&&r.data<=fim&&r.categoria&&naoEhTransf(r)).forEach(r=>{
      catMapR[r.categoria] = (catMapR[r.categoria]||0)+Number(r.valor)
    })
    setCatReceita(Object.entries(catMapR).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>({name,value})))

    // Centros de custo
    const ccList = ccR?.value?.data || []
    const ccResumo = await Promise.all(ccList.map(async cc => {
      const [rec, des] = await Promise.all([
        supabase.from('receitas').select('valor').eq('centro_custo_id',cc.id).eq('ativo',true).eq('entidade_id', entidadeAtiva?.id),
        supabase.from('despesas').select('valor').eq('centro_custo_id',cc.id).eq('ativo',true).eq('entidade_id', entidadeAtiva?.id),
      ])
      const r = (rec.data||[]).reduce((s,x)=>s+Number(x.valor),0)
      const d = (des.data||[]).reduce((s,x)=>s+Number(x.valor),0)
      return { ...cc, receita:r, despesa:d, resultado:r-d }
    }))
    setCentros(ccResumo)

    setCartoes(cartR?.value?.data||[])
    setFaturas(fatR?.value?.data||[])
    setLoading(false)
  }

  const cartoesComFatura = cartoes.map(c => ({
    ...c,
    faturaAberta: faturas.find(f=>f.cartao_id===c.id&&!f.pago)
  }))

  if (loading) return <div className="loading"><div className="spinner"/><span>Carregando...</span></div>

  return (
    <div>
      {/* Alertas do dia */}
      {(vencendoHoje.pagar > 0 || vencendoHoje.receber > 0) && (
        <div style={{marginBottom:14,display:'flex',gap:10,flexWrap:'wrap'}}>
          {vencendoHoje.pagar > 0 && (
            <div style={{flex:1,minWidth:220,background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.3)',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>onNavigate('contas_pagar')}>
              <AlertCircle size={16} color="var(--red)"/>
              <div><div style={{fontWeight:700,fontSize:13,color:'var(--red)'}}>⚠ Vence hoje — A Pagar</div><div style={{fontSize:12,color:'var(--text2)'}}>{fmt(vencendoHoje.pagar)}</div></div>
            </div>
          )}
          {vencendoHoje.receber > 0 && (
            <div style={{flex:1,minWidth:220,background:'rgba(52,211,153,.08)',border:'1px solid rgba(52,211,153,.2)',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>onNavigate('contas_receber')}>
              <AlertCircle size={16} color="var(--green)"/>
              <div><div style={{fontWeight:700,fontSize:13,color:'var(--green)'}}>💰 Vence hoje — A Receber</div><div style={{fontSize:12,color:'var(--text2)'}}>{fmt(vencendoHoje.receber)}</div></div>
            </div>
          )}
        </div>
      )}

      {/* Stats principais */}
      <div className="stats-grid" style={{marginBottom:16}}>
        <div className="stat-card green" style={{cursor:'pointer'}} onClick={()=>onNavigate('receitas')}>
          <div className="stat-label">Entradas (mês)</div>
          <div className="stat-value green text-mono">{fmt(stats.entMes)}</div>
          <div className="stat-sub">Caixa do mês atual</div>
        </div>
        <div className="stat-card red" style={{cursor:'pointer'}} onClick={()=>onNavigate('despesas')}>
          <div className="stat-label">Saídas (mês)</div>
          <div className="stat-value red text-mono">{fmt(stats.saiMes)}</div>
          <div className="stat-sub">Caixa do mês atual</div>
        </div>
        <div className={`stat-card ${stats.resultado>=0?'green':'red'}`}>
          <div className="stat-label">Resultado (mês)</div>
          <div className={`stat-value text-mono ${stats.resultado>=0?'green':'red'}`}>{fmt(stats.resultado)}</div>
          <div className="stat-sub">Entradas - Saídas</div>
        </div>
        <div className="stat-card yellow" style={{cursor:'pointer'}} onClick={()=>onNavigate('contas_receber')}>
          <div className="stat-label">A Receber</div>
          <div className="stat-value yellow text-mono">{fmt(stats.totalAreceber)}</div>
          {vencendo7d.receber>0 && <div className="stat-sub" style={{color:'var(--yellow)'}}>+{fmt(vencendo7d.receber)} nos próx. 7d</div>}
        </div>
        <div className="stat-card red" style={{cursor:'pointer'}} onClick={()=>onNavigate('contas_pagar')}>
          <div className="stat-label">A Pagar</div>
          <div className="stat-value red text-mono">{fmt(stats.totalApagar)}</div>
          {vencendo7d.pagar>0 && <div className="stat-sub" style={{color:'var(--red)'}}>+{fmt(vencendo7d.pagar)} nos próx. 7d</div>}
        </div>
      </div>

      {/* Gráficos linha 1 */}
      <div className="dash-grid" style={{marginBottom:16}}>
        {/* Barras 6 meses */}
        <div className="card">
          <div className="card-header"><span className="card-title">Receita × Despesa — 6 meses</span></div>
          <BarChartSVG data={chart6m} keys={['Receita','Despesa']} colors={['#34d399','#f87171']} height={200}/>
        </div>

        {/* Pizza despesas por categoria */}
        <div className="card">
          <div className="card-header"><span className="card-title">Despesas por categoria (mês)</span></div>
          {catDespesa.length === 0
            ? <div style={{color:'var(--text3)',fontSize:13,padding:'20px 0',textAlign:'center'}}>Sem lançamentos categorizados este mês</div>
            : <PieChartSVG data={catDespesa} colors={CHART_COLORS} height={200}/>
          }
        </div>
      </div>

      {/* Centros de custo */}
      {centros.length > 0 && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-header">
            <span className="card-title">📊 Desempenho por Centro de Custo</span>
            <button className="btn btn-sm btn-secondary" onClick={()=>onNavigate('centro_custo')}>Gerenciar <ChevronRight size={12}/></button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12}}>
            {centros.map(cc=>(
              <div key={cc.id} style={{background:'var(--bg3)',borderRadius:10,padding:'12px 14px',border:'1px solid var(--border)'}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>{cc.nome}</div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                  <span style={{color:'var(--text2)'}}>Receita</span>
                  <span style={{color:'var(--green)',fontWeight:600,fontFamily:'var(--mono)'}}>{fmt(cc.receita)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6}}>
                  <span style={{color:'var(--text2)'}}>Despesa</span>
                  <span style={{color:'var(--red)',fontWeight:600,fontFamily:'var(--mono)'}}>{fmt(cc.despesa)}</span>
                </div>
                <div style={{height:1,background:'var(--border)',marginBottom:6}}/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                  <span style={{fontWeight:700}}>Resultado</span>
                  <span style={{fontWeight:800,color:cc.resultado>=0?'var(--green)':'var(--red)',fontFamily:'var(--mono)'}}>{fmt(cc.resultado)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cartões */}
      {cartoes.length > 0 && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-header">
            <span className="card-title"><CreditCard size={14} color="var(--accent)"/> Cartões de Crédito</span>
            <button className="btn btn-sm btn-secondary" onClick={()=>onNavigate('cartoes')}>Ver todos <ChevronRight size={12}/></button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10}}>
            {cartoesComFatura.map(c=>{
              const perc = Math.min(100,(Number(c.faturaAberta?.total||0)/Number(c.limite||1))*100)
              return (
                <div key={c.id} style={{background:'var(--bg3)',borderRadius:10,padding:'12px 14px',border:'1px solid var(--border)'}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{c.nome}</div>
                  <div style={{fontSize:11,color:'var(--text2)',marginBottom:8}}>{c.bandeira}</div>
                  {c.faturaAberta
                    ? <div style={{fontWeight:700,color:'var(--red)',fontSize:14}}>{fmt(c.faturaAberta.total)}</div>
                    : <div style={{fontWeight:600,color:'var(--green)',fontSize:13}}>✓ Em dia</div>}
                  <div style={{marginTop:8,background:'var(--bg2)',borderRadius:3,height:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${perc}%`,background:perc>80?'var(--red)':perc>50?'var(--yellow)':'var(--accent)',borderRadius:3}}/>
                  </div>
                  <div style={{fontSize:10,color:'var(--text3)',marginTop:2,textAlign:'right'}}>Limite {fmt(c.limite)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top 5 categorias receita/despesa */}
      {(catReceita.length > 0 || catDespesa.length > 0) && (
        <div className="dash-grid">
          {catReceita.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">🏆 Top receitas por categoria</span></div>
              {catReceita.map((c,i)=>{
                const max = catReceita[0].value
                return (
                  <div key={c.name} style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                      <span>{c.name}</span>
                      <span style={{fontWeight:700,color:'var(--green)',fontFamily:'var(--mono)'}}>{fmt(c.value)}</span>
                    </div>
                    <div style={{height:5,borderRadius:3,background:'var(--bg3)',overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${(c.value/max)*100}%`,background:CHART_COLORS[i%CHART_COLORS.length],borderRadius:3}}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {catDespesa.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">📉 Top despesas por categoria</span></div>
              {catDespesa.map((c,i)=>{
                const max = catDespesa[0].value
                return (
                  <div key={c.name} style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                      <span>{c.name}</span>
                      <span style={{fontWeight:700,color:'var(--red)',fontFamily:'var(--mono)'}}>{fmt(c.value)}</span>
                    </div>
                    <div style={{height:5,borderRadius:3,background:'var(--bg3)',overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${(c.value/max)*100}%`,background:'var(--red)',opacity:.7+i*.05,borderRadius:3}}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
