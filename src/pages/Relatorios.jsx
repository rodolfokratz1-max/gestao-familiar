import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts'
import { FileText, TrendingUp, TrendingDown, Wallet, Download } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const COLORS = ['#4f8ef7','#34d399','#f87171','#fbbf24','#7c6af7','#fb923c','#38bdf8','#a3e635']

export default function Relatorios() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [dados, setDados] = useState({ receitas: [], despesas: [], caixa: [], contas_receber: [], contas_pagar: [], compras: [] })

  useEffect(() => { loadDados() }, [periodo])

  async function loadDados() {
    setLoading(true)
    const [ano, mes] = periodo.split('-')
    const inicio = `${ano}-${mes}-01`
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate()
    const fim = `${ano}-${mes}-${String(ultimoDia).padStart(2,'0')}`

    const [r, d, cx, cr, cp, cm] = await Promise.all([
      supabase.from('receitas').select('*').gte('data', inicio).lte('data', fim).eq('ativo', true),
      supabase.from('despesas').select('*').gte('data', inicio).lte('data', fim).eq('ativo', true),
      supabase.from('caixa').select('*').gte('data', inicio).lte('data', fim).eq('ativo', true),
      supabase.from('contas_receber').select('*').gte('data_emissao', inicio).lte('data_emissao', fim).eq('ativo', true),
      supabase.from('contas_pagar').select('*').gte('data_emissao', inicio).lte('data_emissao', fim).eq('ativo', true),
      supabase.from('compras').select('*').gte('data', inicio).lte('data', fim).eq('ativo', true),
    ])

    setDados({
      receitas: r.data || [],
      despesas: d.data || [],
      caixa: cx.data || [],
      contas_receber: cr.data || [],
      contas_pagar: cp.data || [],
      compras: cm.data || [],
    })
    setLoading(false)
  }

  const sum = (arr, key = 'valor') => arr.reduce((s, r) => s + Number(r[key] || 0), 0)

  const totalReceitas = sum(dados.receitas)
  const totalDespesas = sum(dados.despesas)
  const totalEntradas = sum(dados.caixa.filter(r => r.tipo === 'entrada'))
  const totalSaidas = sum(dados.caixa.filter(r => r.tipo === 'saida'))
  const totalAReceber = sum(dados.contas_receber.filter(r => !r.recebido))
  const totalAPagar = sum(dados.contas_pagar.filter(r => !r.pago))
  const totalCompras = sum(dados.compras, 'valor_total')
  const saldo = totalReceitas - totalDespesas

  // Gráfico por categoria - Receitas
  const catReceitas = dados.receitas.reduce((acc, r) => {
    const cat = r.categoria || 'Sem categoria'
    acc[cat] = (acc[cat] || 0) + Number(r.valor || 0)
    return acc
  }, {})
  const pieReceitas = Object.entries(catReceitas).map(([name, value]) => ({ name, value }))

  // Gráfico por categoria - Despesas
  const catDespesas = dados.despesas.reduce((acc, r) => {
    const cat = r.categoria || 'Sem categoria'
    acc[cat] = (acc[cat] || 0) + Number(r.valor || 0)
    return acc
  }, {})
  const pieDespesas = Object.entries(catDespesas).map(([name, value]) => ({ name, value }))

  // Gráfico diário de caixa
  const caixaDiario = dados.caixa.reduce((acc, r) => {
    const dia = r.data
    if (!acc[dia]) acc[dia] = { dia: dia.split('-').reverse().join('/'), Entradas: 0, Saídas: 0 }
    if (r.tipo === 'entrada') acc[dia].Entradas += Number(r.valor || 0)
    else acc[dia].Saídas += Number(r.valor || 0)
    return acc
  }, {})
  const chartCaixa = Object.values(caixaDiario).sort((a, b) => a.dia.localeCompare(b.dia))

  function exportCSV(dados, nome) {
    if (!dados.length) return toast('Sem dados para exportar', 'info')
    const headers = Object.keys(dados[0]).join(';')
    const rows = dados.map(r => Object.values(r).join(';')).join('\n')
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${nome}-${periodo}.csv`; a.click()
  }

  const [ano, mes] = periodo.split('-')
  const nomeMes = new Date(Number(ano), Number(mes)-1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Filtro de período */}
      <div className="toolbar" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Período:</label>
          <input className="form-input" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <span style={{ color: 'var(--text2)', fontSize: 13, textTransform: 'capitalize' }}>{nomeMes}</span>
      </div>

      {loading ? <div className="loading"><div className="spinner" /></div> : (
        <>
          {/* Cards resumo */}
          <div className="stats-grid">
            <div className="stat-card green"><div className="stat-label">Receitas</div><div className="stat-value green text-mono">{fmt(totalReceitas)}</div><div className="stat-sub">{dados.receitas.length} lançamentos</div></div>
            <div className="stat-card red"><div className="stat-label">Despesas</div><div className="stat-value red text-mono">{fmt(totalDespesas)}</div><div className="stat-sub">{dados.despesas.length} lançamentos</div></div>
            <div className="stat-card blue"><div className="stat-label">Saldo do Mês</div><div className={`stat-value text-mono ${saldo >= 0 ? 'green' : 'red'}`}>{fmt(saldo)}</div></div>
            <div className="stat-card green"><div className="stat-label">Entradas Caixa</div><div className="stat-value green text-mono">{fmt(totalEntradas)}</div></div>
            <div className="stat-card red"><div className="stat-label">Saídas Caixa</div><div className="stat-value red text-mono">{fmt(totalSaidas)}</div></div>
            <div className="stat-card yellow"><div className="stat-label">A Receber</div><div className="stat-value yellow text-mono">{fmt(totalAReceber)}</div></div>
            <div className="stat-card red"><div className="stat-label">A Pagar</div><div className="stat-value red text-mono">{fmt(totalAPagar)}</div></div>
            <div className="stat-card purple"><div className="stat-label">Compras</div><div className="stat-value purple text-mono">{fmt(totalCompras)}</div></div>
          </div>

          <div className="dash-grid" style={{ marginBottom: 16 }}>
            {/* Gráfico caixa diário */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Caixa — Entradas vs Saídas por Dia</span>
                <button className="btn btn-sm btn-secondary" onClick={() => exportCSV(dados.caixa, 'caixa')}><Download size={12} /> CSV</button>
              </div>
              {chartCaixa.length === 0 ? <div className="empty-state" style={{ padding: 30 }}><p>Sem lançamentos no período</p></div> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartCaixa}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fill: 'var(--text2)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text2)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => 'R$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} />
                    <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={v => fmt(v)} />
                    <Bar dataKey="Entradas" fill="var(--green)" radius={[3,3,0,0]} />
                    <Bar dataKey="Saídas" fill="var(--red)" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Pie receitas por categoria */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Receitas por Categoria</span>
                <button className="btn btn-sm btn-secondary" onClick={() => exportCSV(dados.receitas, 'receitas')}><Download size={12} /> CSV</button>
              </div>
              {pieReceitas.length === 0 ? <div className="empty-state" style={{ padding: 30 }}><p>Sem receitas no período</p></div> : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieReceitas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                      {pieReceitas.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Pie despesas por categoria */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Despesas por Categoria</span>
                <button className="btn btn-sm btn-secondary" onClick={() => exportCSV(dados.despesas, 'despesas')}><Download size={12} /> CSV</button>
              </div>
              {pieDespesas.length === 0 ? <div className="empty-state" style={{ padding: 30 }}><p>Sem despesas no período</p></div> : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieDespesas} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                      {pieDespesas.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Tabela de conferência contas a pagar */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Conferência — Contas a Pagar</span>
                <button className="btn btn-sm btn-secondary" onClick={() => exportCSV(dados.contas_pagar, 'contas-pagar')}><Download size={12} /> CSV</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Descrição</th><th>Valor</th><th>Vencto</th><th>Status</th></tr></thead>
                  <tbody>
                    {dados.contas_pagar.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>Nenhum registro</td></tr>
                    ) : dados.contas_pagar.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 12 }}>{r.descricao}</td>
                        <td className="text-mono" style={{ fontSize: 12 }}>{fmt(r.valor)}</td>
                        <td className="text-mono text-muted" style={{ fontSize: 11 }}>{r.vencimento?.split('-').reverse().join('/') || '—'}</td>
                        <td><span className={`badge ${r.pago ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize: 10 }}>{r.pago ? 'Pago' : 'Pend.'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Tabela detalhada de compras */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Detalhamento de Compras no Período</span>
              <button className="btn btn-sm btn-secondary" onClick={() => exportCSV(dados.compras, 'compras')}><Download size={12} /> CSV</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Descrição</th><th>Fornecedor</th><th>Forma Pgto</th><th>Valor</th><th>Status</th></tr></thead>
                <tbody>
                  {dados.compras.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>Nenhuma compra no período</td></tr>
                  ) : dados.compras.map(r => (
                    <tr key={r.id}>
                      <td className="text-mono text-muted" style={{ fontSize: 12 }}>{r.data?.split('-').reverse().join('/')}</td>
                      <td style={{ fontSize: 13 }}>{r.descricao}</td>
                      <td className="text-muted" style={{ fontSize: 12 }}>{r.fornecedor || '—'}</td>
                      <td className="text-muted" style={{ fontSize: 12 }}>{r.forma_pgto || '—'}</td>
                      <td className="text-mono font-bold">{fmt(r.valor_total)}</td>
                      <td><span className={`badge ${r.status === 'pago' ? 'badge-green' : r.status === 'cancelado' ? 'badge-red' : 'badge-yellow'}`}>{r.status}</span></td>
                    </tr>
                  ))}
                  {dados.compras.length > 0 && (
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td colSpan={4} className="font-bold" style={{ textAlign: 'right', paddingRight: 14 }}>Total:</td>
                      <td className="text-mono font-bold text-yellow">{fmt(totalCompras)}</td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
