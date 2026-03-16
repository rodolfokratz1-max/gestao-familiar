import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Search, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})

export default function Movimentacoes() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [dataIni, setDataIni] = useState('')
  const [dataFim, setDataFim] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('caixa')
      .select('*')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    const mQ = !q || r.descricao?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
    const mT = !filterTipo || r.tipo === filterTipo
    const mI = !dataIni || r.data >= dataIni
    const mF = !dataFim || r.data <= dataFim
    return mQ && mT && mI && mF
  })

  const totalEntradas = filtered.filter(r => r.tipo === 'entrada').reduce((s,r) => s + Number(r.valor), 0)
  const totalSaidas   = filtered.filter(r => r.tipo === 'saida').reduce((s,r) => s + Number(r.valor), 0)
  const resultado     = totalEntradas - totalSaidas

  const tipoConfig = {
    entrada:      { label: 'Entrada',      cls: 'badge-green',  icon: <TrendingUp size={11} /> },
    saida:        { label: 'Saída',        cls: 'badge-red',    icon: <TrendingDown size={11} /> },
    transferencia:{ label: 'Transferência',cls: 'badge-gray',   icon: <ArrowLeftRight size={11} /> },
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card green">
          <div className="stat-label">Entradas</div>
          <div className="stat-value green text-mono">{fmt(totalEntradas)}</div>
          <div className="stat-sub">{filtered.filter(r=>r.tipo==='entrada').length} lançamentos</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Saídas</div>
          <div className="stat-value red text-mono">{fmt(totalSaidas)}</div>
          <div className="stat-sub">{filtered.filter(r=>r.tipo==='saida').length} lançamentos</div>
        </div>
        <div className={`stat-card ${resultado >= 0 ? 'green' : 'red'}`}>
          <div className="stat-label">Resultado</div>
          <div className={`stat-value text-mono ${resultado >= 0 ? 'green' : 'red'}`}>{fmt(resultado)}</div>
          <div className="stat-sub">{filtered.length} total</div>
        </div>
      </div>

      <div className="toolbar" style={{ flexWrap:'wrap' }}>
        <div className="search-wrap" style={{ minWidth: 200 }}>
          <Search size={14} />
          <input className="search-input" placeholder="Buscar descrição, categoria..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select" style={{ width:'auto' }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="entrada">Entradas</option>
          <option value="saida">Saídas</option>
          <option value="transferencia">Transferências</option>
        </select>
        <input className="form-input" type="date" style={{ width:'auto' }} value={dataIni} onChange={e => setDataIni(e.target.value)} title="Data início" />
        <input className="form-input" type="date" style={{ width:'auto' }} value={dataFim} onChange={e => setDataFim(e.target.value)} title="Data fim" />
        {(search||filterTipo||dataIni||dataFim) && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFilterTipo(''); setDataIni(''); setDataFim('') }}>
            Limpar filtros
          </button>
        )}
      </div>

      {filtered.length === 0
        ? <div className="empty-state"><ArrowLeftRight size={40} /><p>Nenhuma movimentação encontrada</p></div>
        : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th style={{ textAlign:'right' }}>Valor</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const tc = tipoConfig[r.tipo] || tipoConfig.entrada
                    return (
                      <tr key={r.id}>
                        <td style={{ whiteSpace:'nowrap', color:'var(--text2)', fontSize:12 }}>
                          {r.data ? new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td>
                          <div style={{ fontWeight:600 }}>{r.descricao}</div>
                          {r.obs && <div style={{ fontSize:11, color:'var(--text3)' }}>{r.obs}</div>}
                        </td>
                        <td>
                          {r.categoria
                            ? <span className="badge badge-gray" style={{ fontSize:11 }}>{r.categoria}</span>
                            : <span style={{ color:'var(--text3)' }}>—</span>}
                        </td>
                        <td style={{ textAlign:'right', fontWeight:700, fontFamily:'var(--mono)', whiteSpace:'nowrap' }}
                          className={r.tipo==='entrada' ? 'text-green' : r.tipo==='saida' ? 'text-red' : ''}>
                          {r.tipo === 'saida' ? '- ' : r.tipo === 'entrada' ? '+ ' : ''}{fmt(r.valor)}
                        </td>
                        <td>
                          <span className={`badge ${tc.cls}`} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                            {tc.icon} {tc.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
      }
    </div>
  )
}
