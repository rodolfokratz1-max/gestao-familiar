import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

const fmt  = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const fmtK = v => { const n = Number(v||0); if(Math.abs(n)>=1000) return 'R$'+(n/1000).toFixed(0)+'k'; return 'R$'+n.toFixed(0) }
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default function FluxoCaixa() {
  const [ano, setAno] = useState(new Date().getFullYear())
  const [dados, setDados] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [ano])

  async function load() {
    setLoading(true)
    const ini = `${ano}-01-01`
    const fim = `${ano}-12-31`
    const { data } = await supabase
      .from('caixa')
      .select('data,tipo,valor')
      .gte('data', ini)
      .lte('data', fim)

    // Agrupa por mês
    const meses = Array.from({length:12}, (_,i) => ({
      mes: i,
      label: MESES[i],
      labelFull: MESES_FULL[i],
      receita: 0,
      despesa: 0,
      resultado: 0,
      varReceita: null,
      varDespesa: null,
      varResultado: null,
    }))

    for (const r of (data||[])) {
      const m = new Date(r.data+'T12:00:00').getMonth()
      if (r.tipo === 'entrada') meses[m].receita += Number(r.valor)
      else if (r.tipo === 'saida') meses[m].despesa += Number(r.valor)
    }
    meses.forEach(m => { m.resultado = m.receita - m.despesa })

    // Calcula variação % em relação ao mês anterior
    for (let i=1; i<12; i++) {
      if (meses[i-1].receita > 0) meses[i].varReceita = ((meses[i].receita - meses[i-1].receita) / meses[i-1].receita * 100).toFixed(1)
      if (meses[i-1].despesa > 0) meses[i].varDespesa = ((meses[i].despesa - meses[i-1].despesa) / meses[i-1].despesa * 100).toFixed(1)
      if (meses[i-1].resultado !== 0) meses[i].varResultado = ((meses[i].resultado - meses[i-1].resultado) / Math.abs(meses[i-1].resultado) * 100).toFixed(1)
    }

    setDados(meses)
    setLoading(false)
  }

  const totalReceita  = dados.reduce((s,m) => s + m.receita, 0)
  const totalDespesa  = dados.reduce((s,m) => s + m.despesa, 0)
  const totalResult   = totalReceita - totalDespesa
  const anos = Array.from({length:5}, (_,i) => new Date().getFullYear() - 2 + i)

  // Tooltip customizado
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border2)', borderRadius:10, padding:'12px 16px', fontSize:12 }}>
        <div style={{ fontWeight:700, marginBottom:8, color:'var(--text)' }}>{label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ display:'flex', justifyContent:'space-between', gap:20, marginBottom:3, color: p.name==='Receita' ? 'var(--green)' : p.name==='Despesa' ? 'var(--red)' : 'var(--accent)' }}>
            <span>{p.name}</span><span style={{ fontWeight:700 }}>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  const VarBadge = ({ v }) => {
    if (v === null || v === undefined) return <span style={{ color:'var(--text3)', fontSize:10 }}>—</span>
    const n = Number(v)
    return <span style={{ fontSize:10, fontWeight:700, color: n >= 0 ? 'var(--green)' : 'var(--red)' }}>{n >= 0 ? '▲' : '▼'}{Math.abs(n)}%</span>
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>

  return (
    <div>
      {/* Filtros */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <div className="form-group" style={{ marginBottom:0 }}>
          <label className="form-label">Ano</label>
          <select className="form-select" style={{ width:'auto' }} value={ano} onChange={e => setAno(Number(e.target.value))}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Cards totais */}
      <div className="stats-grid" style={{ marginBottom:20 }}>
        <div className="stat-card green">
          <div className="stat-label">Receita Total {ano}</div>
          <div className="stat-value green text-mono">{fmt(totalReceita)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Despesa Total {ano}</div>
          <div className="stat-value red text-mono">{fmt(totalDespesa)}</div>
        </div>
        <div className={`stat-card ${totalResult >= 0 ? 'green' : 'red'}`}>
          <div className="stat-label">Resultado {ano}</div>
          <div className={`stat-value text-mono ${totalResult >= 0 ? 'green' : 'red'}`}>{fmt(totalResult)}</div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="card" style={{ marginBottom:20 }}>
        <div className="card-header">
          <span className="card-title">Resultado mensal — {ano}</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={dados} margin={{ top:5, right:10, left:10, bottom:5 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill:'var(--text3)', fontSize:11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fill:'var(--text3)', fontSize:11 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill:'rgba(255,255,255,.04)' }} />
            <Legend wrapperStyle={{ fontSize:12, color:'var(--text2)', paddingTop:8 }} />
            <ReferenceLine y={0} stroke="var(--border2)" />
            <Bar dataKey="receita" name="Receita" fill="var(--green)" radius={[4,4,0,0]} opacity={0.85} />
            <Bar dataKey="despesa" name="Despesa" fill="var(--red)" radius={[4,4,0,0]} opacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela anual */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>
          Demonstrativo mensal — {ano}
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ minWidth:900 }}>
            <thead>
              <tr>
                <th style={{ minWidth:130 }}>Descrição</th>
                {MESES.map(m => <th key={m} style={{ textAlign:'right', minWidth:90 }}>{m}</th>)}
                <th style={{ textAlign:'right', minWidth:110 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {/* Receita */}
              <tr style={{ background:'rgba(52,211,153,.05)' }}>
                <td style={{ fontWeight:700, color:'var(--green)', fontSize:13 }}>↑ Receita Total</td>
                {dados.map(m => (
                  <td key={m.mes} style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:12 }}>
                    <div style={{ color: m.receita > 0 ? 'var(--green)' : 'var(--text3)' }}>{m.receita > 0 ? fmt(m.receita) : '—'}</div>
                    <div><VarBadge v={m.varReceita} /></div>
                  </td>
                ))}
                <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontWeight:800, color:'var(--green)', fontSize:13 }}>{fmt(totalReceita)}</td>
              </tr>
              {/* Despesa */}
              <tr style={{ background:'rgba(248,113,113,.05)' }}>
                <td style={{ fontWeight:700, color:'var(--red)', fontSize:13 }}>↓ Despesa Total</td>
                {dados.map(m => (
                  <td key={m.mes} style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:12 }}>
                    <div style={{ color: m.despesa > 0 ? 'var(--red)' : 'var(--text3)' }}>{m.despesa > 0 ? fmt(m.despesa) : '—'}</div>
                    <div><VarBadge v={m.varDespesa} /></div>
                  </td>
                ))}
                <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontWeight:800, color:'var(--red)', fontSize:13 }}>{fmt(totalDespesa)}</td>
              </tr>
              {/* Resultado */}
              <tr style={{ borderTop:'2px solid var(--border2)' }}>
                <td style={{ fontWeight:800, fontSize:13 }}>= Resultado</td>
                {dados.map(m => (
                  <td key={m.mes} style={{ textAlign:'right', fontFamily:'var(--mono)', fontSize:12 }}>
                    <div style={{ fontWeight:700, color: m.resultado > 0 ? 'var(--green)' : m.resultado < 0 ? 'var(--red)' : 'var(--text3)' }}>
                      {m.resultado !== 0 ? fmt(m.resultado) : '—'}
                    </div>
                    <div><VarBadge v={m.varResultado} /></div>
                  </td>
                ))}
                <td style={{ textAlign:'right', fontFamily:'var(--mono)', fontWeight:800, fontSize:14,
                  color: totalResult >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(totalResult)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
