// Componentes de gráfico em SVG puro — sem dependências externas

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const fmtK = v => { const n=Number(v||0); return Math.abs(n)>=1000?'R$'+(n/1000).toFixed(0)+'k':'R$'+n.toFixed(0) }

// ── Gráfico de Barras ─────────────────────────────────────
export function BarChartSVG({ data, keys, colors, height = 220, width = '100%' }) {
  if (!data?.length) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:13}}>Sem dados</div>

  const W = 600, H = height
  const padL = 58, padR = 16, padT = 16, padB = 36
  const chartW = W - padL - padR
  const chartH = H - padT - padB

  const allVals = data.flatMap(d => keys.map(k => Math.abs(Number(d[k]||0))))
  const maxVal  = Math.max(...allVals, 1)
  const steps   = 5
  const step    = Math.ceil(maxVal / steps / 10) * 10 || 1

  const barW    = (chartW / data.length) * 0.7
  const groupW  = chartW / data.length
  const barOff  = (groupW - barW * keys.length) / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width,height,overflow:'visible'}}>
      {/* Grid lines */}
      {Array.from({length:steps+1},(_,i)=>{
        const v = i * step
        if (v > maxVal * 1.1) return null
        const y = padT + chartH - (v/maxVal)*chartH
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W-padR} y2={y} stroke="var(--border)" strokeWidth={1} strokeDasharray="4,4"/>
            <text x={padL-6} y={y+4} textAnchor="end" fontSize={10} fill="var(--text3)">{fmtK(v)}</text>
          </g>
        )
      })}

      {/* Bars */}
      {data.map((d,di) => {
        const gx = padL + di * groupW
        return (
          <g key={di}>
            {keys.map((k,ki) => {
              const v   = Number(d[k]||0)
              const bh  = (v/maxVal)*chartH
              const bx  = gx + barOff + ki * barW
              const by  = padT + chartH - bh
              return (
                <g key={k}>
                  <rect x={bx} y={by} width={barW-2} height={Math.max(bh,0)} rx={3}
                    fill={colors[ki]} opacity={0.85}/>
                  {/* Tooltip on hover via title */}
                  <title>{k}: {fmt(v)}</title>
                </g>
              )
            })}
            {/* X label */}
            <text x={gx+groupW/2} y={H-padB+14} textAnchor="middle" fontSize={11} fill="var(--text3)">{d.name||d.label}</text>
          </g>
        )
      })}

      {/* Axis */}
      <line x1={padL} y1={padT} x2={padL} y2={padT+chartH} stroke="var(--border)" strokeWidth={1}/>
      <line x1={padL} y1={padT+chartH} x2={W-padR} y2={padT+chartH} stroke="var(--border)" strokeWidth={1}/>

      {/* Legend */}
      {keys.map((k,i) => (
        <g key={k} transform={`translate(${padL + i*120}, ${H-6})`}>
          <rect x={0} y={-8} width={10} height={10} rx={2} fill={colors[i]} opacity={0.85}/>
          <text x={14} y={0} fontSize={11} fill="var(--text2)">{k}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Gráfico de Pizza / Donut ──────────────────────────────
export function PieChartSVG({ data, colors, height = 220 }) {
  if (!data?.length) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:13}}>Sem dados</div>

  const total = data.reduce((s,d)=>s+Number(d.value||0),0)
  if (total === 0) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:13}}>Sem dados</div>

  const cx=110, cy=110, r=80, ri=50
  let angle = -Math.PI/2

  const slices = data.map((d,i) => {
    const pct  = Number(d.value)/total
    const a1   = angle
    const a2   = angle + pct * 2 * Math.PI
    angle      = a2
    const lx   = cx + (r+12)*Math.cos((a1+a2)/2)
    const ly   = cy + (r+12)*Math.sin((a1+a2)/2)
    const x1s  = cx + ri*Math.cos(a1), y1s = cy + ri*Math.sin(a1)
    const x2s  = cx + r*Math.cos(a1),  y2s = cy + r*Math.sin(a1)
    const x1e  = cx + ri*Math.cos(a2), y1e = cy + ri*Math.sin(a2)
    const x2e  = cx + r*Math.cos(a2),  y2e = cy + r*Math.sin(a2)
    const large = pct > 0.5 ? 1 : 0
    return { ...d, i, pct, a1, a2, lx, ly, path:`M${x1s},${y1s} L${x2s},${y2s} A${r},${r},0,${large},1,${x2e},${y2e} L${x1e},${y1e} A${ri},${ri},0,${large},0,${x1s},${y1s} Z` }
  })

  const W = 420
  return (
    <svg viewBox={`0 0 ${W} 220`} style={{width:'100%',height}}>
      {slices.map(s => (
        <g key={s.i}>
          <path d={s.path} fill={colors[s.i%colors.length]} opacity={0.88} stroke="var(--bg2)" strokeWidth={2}>
            <title>{s.name}: {fmt(s.value)} ({(s.pct*100).toFixed(1)}%)</title>
          </path>
        </g>
      ))}
      {/* Center text */}
      <text x={cx} y={cy-6} textAnchor="middle" fontSize={11} fill="var(--text3)">Total</text>
      <text x={cx} y={cy+10} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)">{fmtK(total)}</text>

      {/* Legend */}
      {data.slice(0,7).map((d,i) => (
        <g key={i} transform={`translate(230, ${20+i*28})`}>
          <rect x={0} y={0} width={12} height={12} rx={3} fill={colors[i%colors.length]} opacity={0.88}/>
          <text x={18} y={10} fontSize={11} fill="var(--text2)" style={{maxWidth:140}}>
            {d.name?.length>18 ? d.name.substring(0,18)+'…' : d.name}
          </text>
          <text x={18} y={22} fontSize={10} fill="var(--text3)">{fmt(d.value)} · {(Number(d.value)/total*100).toFixed(1)}%</text>
        </g>
      ))}
    </svg>
  )
}

export const CHART_COLORS = ['#4f8ef7','#34d399','#f87171','#fbbf24','#a78bfa','#fb923c','#38bdf8','#f472b6','#4ade80','#f97316']
