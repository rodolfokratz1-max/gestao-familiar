import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Clock, Wrench, CreditCard, X, Users, ChevronRight, AlertCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState({ receitas: 0, despesas: 0, apagar: 0, areceber: 0, compras: 0, manutencoes: 0 })
  const [chartData, setChartData] = useState([])
  const [cartoes, setCartoes] = useState([])
  const [faturas, setFaturas] = useState([])
  const [membros, setMembros] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalCartoes, setModalCartoes] = useState(false)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const [rec, des, pag, rcb, cmp, man, cart, fat, mem] = await Promise.allSettled([
        supabase.from('receitas').select('valor').eq('ativo', true),
        supabase.from('despesas').select('valor').eq('ativo', true),
        supabase.from('contas_pagar').select('valor').eq('pago', false).eq('ativo', true),
        supabase.from('contas_receber').select('valor').eq('recebido', false).eq('ativo', true),
        supabase.from('compras').select('valor_total').eq('ativo', true),
        supabase.from('manutencoes').select('custo').eq('ativo', true).eq('status', 'pendente'),
        supabase.from('cartoes').select('*').eq('ativo', true).order('nome'),
        supabase.from('faturas_cartao').select('*').order('mes_ref', { ascending: false }),
        supabase.from('pessoas').select('id,nome').eq('tipo', 'membro').eq('ativo', true).order('nome'),
      ])

      const val = r => r?.value || { data: [] }
      const sum = (r, key = 'valor') => (val(r).data || []).reduce((s, x) => s + Number(x[key] || 0), 0)
      setStats({
        receitas: sum(rec), despesas: sum(des),
        apagar: sum(pag), areceber: sum(rcb),
        compras: sum(cmp, 'valor_total'), manutencoes: sum(man, 'custo'),
      })
      setCartoes(val(cart).data || [])
      setFaturas(val(fat).data || [])
      setMembros(val(mem).data || [])

      // Últimos 6 meses
      const months = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i)
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0')
        const label = d.toLocaleString('pt-BR', { month: 'short' })
        const ultimoDia = new Date(y, Number(m), 0).getDate()
        const [r2, d2] = await Promise.allSettled([
          supabase.from('receitas').select('valor').gte('data', `${y}-${m}-01`).lte('data', `${y}-${m}-${ultimoDia}`),
          supabase.from('despesas').select('valor').gte('data', `${y}-${m}-01`).lte('data', `${y}-${m}-${ultimoDia}`),
        ])
        months.push({ name: label, Receitas: sum(r2), Despesas: sum(d2) })
      }
      setChartData(months)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const saldo = stats.receitas - stats.despesas

  // Total de faturas abertas (não pagas)
  const totalFaturasAbertas = faturas
    .filter(f => !f.pago)
    .reduce((s, f) => s + Number(f.total || 0), 0)

  // Agrupa cartões por membro
  const cartoesComDados = cartoes.map(c => {
    const faturasCartao = faturas.filter(f => f.cartao_id === c.id)
    const faturaAberta = faturasCartao.find(f => !f.pago)
    const mesAtual = new Date()
    const mesRef = `${mesAtual.getFullYear()}-${String(mesAtual.getMonth()+1).padStart(2,'0')}`
    return { ...c, faturaAberta, mesRef, totalFaturas: faturasCartao.length }
  })

  const cartoesporMembro = membros.map(m => ({
    ...m,
    cartoes: cartoesComDados.filter(c => c.titular_id === m.id)
  })).filter(m => m.cartoes.length > 0)

  // Cartões sem membro vinculado
  const cartoesSemMembro = cartoesComDados.filter(c => !c.titular_id)

  if (loading) return <div className="loading"><div className="spinner" /><span>Carregando...</span></div>

  return (
    <div>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card green">
          <div className="stat-label">Total Receitas</div>
          <div className="stat-value green">{fmt(stats.receitas)}</div>
          <div className="stat-sub">Registradas no sistema</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Total Despesas</div>
          <div className="stat-value red">{fmt(stats.despesas)}</div>
          <div className="stat-sub">Registradas no sistema</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Saldo</div>
          <div className={`stat-value ${saldo >= 0 ? 'green' : 'red'}`}>{fmt(saldo)}</div>
          <div className="stat-sub">Receitas - Despesas</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">A Receber</div>
          <div className="stat-value yellow">{fmt(stats.areceber)}</div>
          <div className="stat-sub">Pendente de recebimento</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">A Pagar</div>
          <div className="stat-value red">{fmt(stats.apagar)}</div>
          <div className="stat-sub">Pendente de pagamento</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">Manutenções Pendentes</div>
          <div className="stat-value purple">{fmt(stats.manutencoes)}</div>
          <div className="stat-sub">Custo estimado</div>
        </div>
      </div>

      {/* Card Cartões */}
      {cartoes.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={16} color="var(--accent)" /> Cartões de Crédito
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => setModalCartoes(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Ver todos <ChevronRight size={13} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginTop: 4 }}>
            {cartoesComDados.slice(0, 4).map(c => {
              const perc = Math.min(100, (Number(c.faturaAberta?.total || 0) / Number(c.limite || 1)) * 100)
              return (
                <div key={c.id} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.titular_nome || 'Sem titular'} · {c.bandeira}</div>
                    </div>
                    {c.faturaAberta && <AlertCircle size={14} color="var(--red)" />}
                  </div>
                  {c.faturaAberta ? (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Fatura fechada</div>
                      <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 15 }}>{fmt(c.faturaAberta.total)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                        Vence {c.faturaAberta.vencimento?.split('-').reverse().join('/')}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Fatura em aberto</div>
                      <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 15 }}>Em dia</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Fecha dia {c.dia_fechamento}</div>
                    </>
                  )}
                  <div style={{ marginTop: 8, background: 'var(--bg2)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${perc}%`, borderRadius: 3, background: perc > 80 ? 'var(--red)' : perc > 50 ? 'var(--yellow)' : 'var(--accent)', transition: 'width .3s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3, textAlign: 'right' }}>
                    Limite {fmt(c.limite)}
                  </div>
                </div>
              )
            })}
          </div>

          {totalFaturasAbertas > 0 && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Total de faturas a pagar</span>
              <span style={{ fontWeight: 700, color: 'var(--red)', fontSize: 15 }}>{fmt(totalFaturasAbertas)}</span>
            </div>
          )}
        </div>
      )}

      {/* Gráfico */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Receitas vs Despesas — Últimos 6 meses</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'var(--text2)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)} />
            <Tooltip
              contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              formatter={v => fmt(v)}
              labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
            />
            <Bar dataKey="Receitas" fill="var(--green)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Despesas" fill="var(--red)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Modal Cartões por Membro */}
      {modalCartoes && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)' }}>

            {/* Header modal */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CreditCard size={20} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: 17 }}>Cartões por Membro</span>
              </div>
              <button className="icon-btn" onClick={() => setModalCartoes(false)}><X size={18} /></button>
            </div>

            <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>

              {/* Por membro */}
              {cartoesporMembro.map(m => (
                <div key={m.id} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ background: 'var(--accent)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                      {m.nome.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{m.nome}</span>
                    <span className="badge badge-gray">{m.cartoes.length} cartão{m.cartoes.length > 1 ? 'ões' : ''}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {m.cartoes.map(c => <CartaoCard key={c.id} c={c} onNavigate={() => { setModalCartoes(false); onNavigate('cartoes') }} />)}
                  </div>
                </div>
              ))}

              {/* Sem membro */}
              {cartoesSemMembro.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ background: 'var(--bg3)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Users size={16} color="var(--text2)" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text2)' }}>Sem titular</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {cartoesSemMembro.map(c => <CartaoCard key={c.id} c={c} onNavigate={() => { setModalCartoes(false); onNavigate('cartoes') }} />)}
                  </div>
                </div>
              )}

              {cartoes.length === 0 && (
                <div className="empty-state"><CreditCard size={40} /><p>Nenhum cartão cadastrado</p></div>
              )}

              {/* Resumo total */}
              {totalFaturasAbertas > 0 && (
                <div style={{ padding: '14px 18px', background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.25)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Total de Faturas em Aberto</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{faturas.filter(f => !f.pago).length} fatura(s) pendente(s)</div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 20 }}>{fmt(totalFaturasAbertas)}</div>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setModalCartoes(false)}>Fechar</button>
              <button className="btn btn-primary" onClick={() => { setModalCartoes(false); onNavigate('cartoes') }}>
                <CreditCard size={14} /> Gerenciar Cartões
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CartaoCard({ c, onNavigate }) {
  const perc = Math.min(100, (Number(c.faturaAberta?.total || 0) / Number(c.limite || 1)) * 100)
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--accent), var(--accent2))' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{c.nome}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{c.bandeira || 'Bandeira não informada'}</div>
        </div>
        <CreditCard size={20} color="var(--accent)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10, fontSize: 12 }}>
        <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: '6px 10px' }}>
          <div style={{ color: 'var(--text2)', marginBottom: 2 }}>Limite</div>
          <div style={{ fontWeight: 700, color: 'var(--green)' }}>{c.limite ? `R$ ${Number(c.limite).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</div>
        </div>
        <div style={{ background: 'var(--bg2)', borderRadius: 6, padding: '6px 10px' }}>
          <div style={{ color: 'var(--text2)', marginBottom: 2 }}>Fecha / Vence</div>
          <div style={{ fontWeight: 700 }}>dia {c.dia_fechamento || '—'} / {c.dia_vencimento || '—'}</div>
        </div>
      </div>

      {c.faturaAberta ? (
        <div style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Fatura fechada</div>
              <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 16 }}>
                R$ {Number(c.faturaAberta.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>Vencimento</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.faturaAberta.vencimento?.split('-').reverse().join('/')}</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(52,211,153,.1)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>Situação</div>
          <div style={{ fontWeight: 700, color: 'var(--green)' }}>✓ Sem fatura pendente</div>
        </div>
      )}

      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
          <span>Uso do limite</span><span>{perc.toFixed(0)}%</span>
        </div>
        <div style={{ background: 'var(--bg2)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${perc}%`, borderRadius: 3, background: perc > 80 ? 'var(--red)' : perc > 50 ? 'var(--yellow)' : 'var(--green)', transition: 'width .3s' }} />
        </div>
      </div>

      <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 8, fontSize: 12 }} onClick={onNavigate}>
        Ver lançamentos <ChevronRight size={12} />
      </button>
    </div>
  )
}
