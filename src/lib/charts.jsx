// Componentes de gráfico em SVG puro — sem dependências externas

const fmt  = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const fmtK = v => { const n=Number(v||0); return Math.abs(n)>=1000?'R$'+(n/1000).toFixed(0)+'k':'R$'+n.toFixed(0) }

export const CHART_COLORS = ['#4f8ef7','#34d399','#f87171','#fbbf24','#a78bfa','#fb923c','#38bdf8','#f472b6','#4ade80','#f97316']

function Empty({ height }) {
  return (
    <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:13}}>
      Sem dados no período
    </div>
  )
}

// ── Gráfico de Barras ─────────────────────────────────────
export function BarChartSVG({ data, keys, colors, height = 220 }) {
  try {
    if (!data?.length || !keys?.length) return <Empty height={height}/>

    const W=600, H=height, padL=58, padR=16, padT=16, padB=52
    const chartW = W - padL - padR
    const chartH = H - padT - padB

    const allVals = data.flatMap(d => keys.map(k => Math.abs(Number(d[k]||0))))
    const maxVal  = Math.max(...allVals.filter(v=>!isNaN(v)), 1)
    const steps   = 4
    const rawStep = maxVal / steps
    const mag     = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const step    = Math.ceil(rawStep / mag) * mag || 1

    const nBars  = keys.length
    const groupW = chartW / data.length
    const barW   = Math.max(4, (groupW * 0.7) / nBars)
    const barOff = (groupW - barW * nBars) / 2

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height,display:'block'}}>
        {/* Grid */}
        {Array.from({length:steps+1},(_,i) => {
          const v = i * step
          if (v > maxVal * 1.15) return null
          const y = padT + chartH - (v/maxVal)*chartH
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W-padR} y2={y} stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3"/>
              <text x={padL-5} y={y+4} textAnchor="end" fontSize={10} fill="var(--text3)">{fmtK(v)}</text>
            </g>
          )
        })}

        {/* Bars */}
        {data.map((d,di) => {
          const gx = padL + di * groupW
          return (
            <g key={di}>
              {keys.map((k,ki) => {
                const v  = Math.max(0, Number(d[k]||0))
                const bh = (v/maxVal)*chartH
                const bx = gx + barOff + ki * barW
                const by = padT + chartH - bh
                return (
                  <g key={k}>
                    <rect x={bx} y={by} width={Math.max(barW-2,2)} height={Math.max(bh,0)}
                      rx={2} fill={colors[ki]||CHART_COLORS[ki]} opacity={0.85}/>
                    <title>{k}: {fmt(v)}</title>
                  </g>
                )
              })}
              <text
                x={gx+groupW/2}
                y={H-padB+14}
                textAnchor="end"
                fontSize={9}
                fill="var(--text3)"
                transform={`rotate(-40, ${gx+groupW/2}, ${H-padB+14})`}
              >
                {d.name||d.label||''}
              </text>
            </g>
          )
        })}

        {/* Axes */}
        <line x1={padL} y1={padT} x2={padL} y2={padT+chartH} stroke="var(--border)" strokeWidth={1}/>
        <line x1={padL} y1={padT+chartH} x2={W-padR} y2={padT+chartH} stroke="var(--border)" strokeWidth={1}/>

        {/* Legend */}
        {keys.map((k,i) => (
          <g key={k} transform={`translate(${padL+i*110},${H+2})`}>
            <rect x={0} y={-9} width={9} height={9} rx={2} fill={colors[i]||CHART_COLORS[i]} opacity={0.85}/>
            <text x={13} y={0} fontSize={10} fill="var(--text2)">{k}</text>
          </g>
        ))}
      </svg>
    )
  } catch(e) {
    console.error('BarChartSVG error:', e)
    return <Empty height={height}/>
  }
}

// ── Gráfico de Pizza / Donut ──────────────────────────────
export function PieChartSVG({ data, colors, height = 220 }) {
  try {
    if (!data?.length) return <Empty height={height}/>
    const validData = data.filter(d => Number(d.value||0) > 0)
    if (!validData.length) return <Empty height={height}/>

    const total = validData.reduce((s,d)=>s+Number(d.value),0)
    const cx=110, cy=100, r=75, ri=45
    let angle = -Math.PI/2

    const slices = validData.map((d,i) => {
      const pct = Number(d.value)/total
      const a1  = angle
      // Garante que nunca fecha exatamente 2π (círculo completo quebra SVG)
      const a2  = angle + Math.min(pct, 0.9999) * 2 * Math.PI
      angle = a2

      const x1s = cx + ri*Math.cos(a1), y1s = cy + ri*Math.sin(a1)
      const x2s = cx + r*Math.cos(a1),  y2s = cy + r*Math.sin(a1)
      const x1e = cx + ri*Math.cos(a2), y1e = cy + ri*Math.sin(a2)
      const x2e = cx + r*Math.cos(a2),  y2e = cy + r*Math.sin(a2)
      const large = pct > 0.5 ? 1 : 0

      return {
        ...d, i, pct, color: colors[i%colors.length]||CHART_COLORS[i%CHART_COLORS.length],
        path: `M${x1s.toFixed(2)},${y1s.toFixed(2)} L${x2s.toFixed(2)},${y2s.toFixed(2)} A${r},${r},0,${large},1,${x2e.toFixed(2)},${y2e.toFixed(2)} L${x1e.toFixed(2)},${y1e.toFixed(2)} A${ri},${ri},0,${large},0,${x1s.toFixed(2)},${y1s.toFixed(2)} Z`
      }
    })

    return (
      <svg viewBox="0 0 420 210" style={{width:'100%',height,display:'block'}}>
        {slices.map(s => (
          <g key={s.i}>
            <path d={s.path} fill={s.color} opacity={0.88} stroke="var(--bg2)" strokeWidth={2}>
              <title>{s.name}: {fmt(s.value)} ({(s.pct*100).toFixed(1)}%)</title>
            </path>
          </g>
        ))}
        <text x={cx} y={cy-5}  textAnchor="middle" fontSize={10} fill="var(--text3)">Total</text>
        <text x={cx} y={cy+12} textAnchor="middle" fontSize={12} fontWeight="700" fill="var(--text)">{fmtK(total)}</text>

        {validData.slice(0,7).map((d,i) => (
          <g key={i} transform={`translate(230,${16+i*27})`}>
            <rect x={0} y={0} width={11} height={11} rx={2} fill={colors[i%colors.length]||CHART_COLORS[i]} opacity={0.88}/>
            <text x={16} y={9} fontSize={11} fill="var(--text2)">
              {(d.name||'').length>20 ? (d.name||'').substring(0,20)+'…' : (d.name||'')}
            </text>
            <text x={16} y={20} fontSize={10} fill="var(--text3)">
              {fmt(d.value)} · {(Number(d.value)/total*100).toFixed(1)}%
            </text>
          </g>
        ))}
      </svg>
    )
  } catch(e) {
    console.error('PieChartSVG error:', e)
    return <Empty height={height}/>
  }
}
