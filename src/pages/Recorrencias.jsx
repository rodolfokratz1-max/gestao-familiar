import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, Search, Pencil, Trash2, Power, RefreshCw, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { SelectCategoria } from '../lib/planoContas'
import { today } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})
const todayObj = () => new Date(today())

const PERIODOS = [
  { id:'mensal',     label:'Mensal',     meses:1  },
  { id:'bimestral',  label:'Bimestral',  meses:2  },
  { id:'trimestral', label:'Trimestral', meses:3  },
  { id:'semestral',  label:'Semestral',  meses:6  },
  { id:'anual',      label:'Anual',      meses:12 },
]

const CATEGORIAS = ['Assinatura','Aluguel','Serviço','Financiamento','Seguro','Utilidade','Salário','Outro']

const EMPTY = {
  nome:'', descricao:'', valor:'', categoria:'Assinatura',
  dia_vencimento:10, periodicidade:'mensal',
  data_inicio: today(), data_fim:'',
  conta_id:'', forma_pgto:'', tipo:'pagar', ativo:true
}

export default function Recorrencias() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [rows, setRows] = useState([])
  const [contas, setContas] = useState([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [ultimaGeracao, setUltimaGeracao] = useState(null)
  const [resultado, setResultado] = useState(null) // { criados, existiam }
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [search, setSearch] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: r }, { data: c }, { data: cfg }] = await Promise.all([
      supabase.from('recorrencias').select('*').eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('contas').select('id,nome').eq('ativo',true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('recorrencias_config').select('*').limit(1).single(),
    ])
    setRows(r || [])
    setContas(c || [])
    if (cfg?.ultima_geracao) setUltimaGeracao(cfg.ultima_geracao)
    setLoading(false)
  }

  const f = (k,v) => setForm(p => ({...p, [k]:v}))

  function openNew() { setForm(EMPTY); setEditing(null); setModal(true) }
  function openEdit(r) { setForm({...EMPTY,...r, valor: String(r.valor)}); setEditing(r.id); setModal(true) }

  async function save() {
    if (!form.nome?.trim()) return toast('Nome obrigatório', 'error')
    if (!form.valor || Number(form.valor) <= 0) return toast('Valor deve ser maior que zero', 'error')
    if (!form.dia_vencimento || form.dia_vencimento < 1 || form.dia_vencimento > 31) return toast('Dia de vencimento inválido', 'error')
    const payload = {
      ...form,
      valor: Number(form.valor),
      data_fim: form.data_fim || null,
      conta_id: form.conta_id || null,
      forma_pgto: form.forma_pgto || null,
      descricao: form.descricao || null,
    }
    let error
    if (editing) ({ error } = await supabase.from('recorrencias').update(payload).eq('id', editing))
    else ({ error } = await supabase.from('recorrencias').insert({...payload, entidade_id: entidadeAtiva?.id}))
    if (error) { toast(error.message,'error'); return }
    toast(editing ? 'Atualizado!' : 'Recorrência criada!', 'success')
    setModal(false); loadAll()
  }

  async function toggleAtivo(r) {
    await supabase.from('recorrencias').update({ ativo: !r.ativo }).eq('id', r.id)
    loadAll()
  }

  async function destroy() {
    await supabase.from('recorrencias').delete().eq('id', deleting.id)
    toast('Recorrência excluída', 'success'); setDeleting(null); loadAll()
  }

  // ── GERAÇÃO DE LANÇAMENTOS ────────────────────────────────
  async function gerarLancamentos() {
    setGerando(true)
    setResultado(null)
    let criados = 0, existiam = 0
    const ativas = rows.filter(r => r.ativo)
    const agora = todayObj()

    for (const rec of ativas) {
      const periodo = PERIODOS.find(p => p.id === rec.periodicidade) || PERIODOS[0]
      const inicio = new Date(rec.data_inicio)
      const fim = rec.data_fim ? new Date(rec.data_fim) : null

      // Gera lançamentos para os próximos 2 meses + mês atual
      // Para períodos maiores, gera apenas o atual
      const mesesAFrente = periodo.meses === 1 ? 2 : 0

      for (let i = 0; i <= mesesAFrente; i += periodo.meses) {
        const mesRef = new Date(agora.getFullYear(), agora.getMonth() + i, 1)

        // Checa se está dentro do intervalo da recorrência
        if (mesRef < new Date(inicio.getFullYear(), inicio.getMonth(), 1)) continue
        if (fim && mesRef > new Date(fim.getFullYear(), fim.getMonth(), 1)) continue

        // Calcula data de vencimento para esse mês
        const diasNoMes = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0).getDate()
        const dia = Math.min(rec.dia_vencimento, diasNoMes)
        const vencimento = `${mesRef.getFullYear()}-${String(mesRef.getMonth()+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`

        // Chave de idempotência: rec_id + mes_ano
        const mesAno = `${mesRef.getFullYear()}-${String(mesRef.getMonth()+1).padStart(2,'0')}`
        const descricao = `${rec.nome} — ${mesAno}`

        // Verifica se já existe lançamento deste mês para esta recorrência
        const tabela = rec.tipo === 'pagar' ? 'contas_pagar' : 'contas_receber'
        const { data: existente } = await supabase
          .from(tabela)
          .select('id')
          .eq('recorrencia_id', rec.id)
          .eq('mes_referencia', mesAno)
          .limit(1)

        if (existente && existente.length > 0) {
          existiam++
          continue
        }

        // Cria o lançamento
        const payload = {
          descricao,
          valor: rec.valor,
          vencimento,
          categoria: rec.categoria,
          recorrencia_id: rec.id,
          mes_referencia: mesAno,
          ativo: true,
          ...(rec.tipo === 'pagar'
            ? { pago: false, data_emissao: today() }
            : { recebido: false, data_emissao: today() }
          ),
          ...(rec.conta_id  ? { conta_id:  rec.conta_id  } : {}),
          ...(rec.forma_pgto ? { forma_pgto: rec.forma_pgto } : {}),
        }

        const { error } = await supabase.from(tabela).insert(payload)
        if (!error) criados++
        else console.error('Erro ao criar lançamento:', error)
      }
    }

    // Salva timestamp da última geração
    const agora_iso = new Date().toISOString()
    const { data: cfgExist } = await supabase.from('recorrencias_config').select('id').limit(1).single()
    if (cfgExist?.id) {
      await supabase.from('recorrencias_config').update({ ultima_geracao: agora_iso }).eq('id', cfgExist.id)
    } else {
      await supabase.from('recorrencias_config').insert({ ultima_geracao: agora_iso })
    }

    setUltimaGeracao(agora_iso)
    setResultado({ criados, existiam })
    setGerando(false)
    if (criados > 0) toast(`✅ ${criados} lançamento${criados>1?'s':''} criado${criados>1?'s':''}!`, 'success')
    else toast('Nenhum lançamento novo — tudo já estava gerado', 'info')
  }

  const filtered = rows.filter(r => !search || r.nome?.toLowerCase().includes(search.toLowerCase()) || r.categoria?.toLowerCase().includes(search.toLowerCase()))
  const totalMensal = rows.filter(r => r.ativo && r.periodicidade === 'mensal').reduce((s,r) => s + Number(r.valor), 0)
  const totalAtivas = rows.filter(r => r.ativo).length

  const fmtDataHora = iso => {
    if (!iso) return null
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})
  }

  return (
    <div>
      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom:16 }}>
        <div className="stat-card blue">
          <div className="stat-label">Recorrências ativas</div>
          <div className="stat-value blue">{totalAtivas}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Saída mensal estimada</div>
          <div className="stat-value red text-mono">{fmt(totalMensal)}</div>
          <div className="stat-sub">apenas mensais</div>
        </div>
      </div>

      {/* Painel de geração */}
      <div className="card" style={{ marginBottom:16, padding:'14px 18px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:3 }}>Gerar lançamentos em Contas a Pagar / Receber</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>
              Gera automaticamente as contas do mês atual e próximos 2 meses para recorrências mensais.
              Lançamentos já existentes não são duplicados.
            </div>
            {ultimaGeracao && (
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:5, display:'flex', alignItems:'center', gap:5 }}>
                <Clock size={11} /> Última geração: {fmtDataHora(ultimaGeracao)}
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={gerarLancamentos} disabled={gerando || rows.filter(r=>r.ativo).length === 0}>
            <RefreshCw size={14} className={gerando ? 'spin' : ''} />
            {gerando ? 'Gerando...' : 'Gerar lançamentos'}
          </button>
        </div>

        {/* Resultado da última geração */}
        {resultado && (
          <div style={{ marginTop:12, display:'flex', gap:10, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(52,211,153,.1)', border:'1px solid rgba(52,211,153,.2)', borderRadius:8, padding:'6px 12px', fontSize:12 }}>
              <CheckCircle size={13} color="var(--green)" />
              <span><strong style={{ color:'var(--green)' }}>{resultado.criados}</strong> lançamento{resultado.criados!==1?'s':''} criado{resultado.criados!==1?'s':''}</span>
            </div>
            {resultado.existiam > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(139,149,176,.08)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', fontSize:12 }}>
                <AlertCircle size={13} color="var(--text3)" />
                <span style={{ color:'var(--text2)' }}>{resultado.existiam} já existiam</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={14} />
          <input className="search-input" placeholder="Buscar recorrência..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> Nova recorrência</button>
      </div>

      {loading ? <div className="loading"><div className="spinner" /></div> :
        filtered.length === 0
          ? <div className="empty-state"><RefreshCw size={40} /><p>Nenhuma recorrência cadastrada</p></div>
          : <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Tipo</th>
                      <th>Periodicidade</th>
                      <th>Dia venc.</th>
                      <th>Valor</th>
                      <th>Categoria</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r.id} style={{ opacity: r.ativo ? 1 : .5 }}>
                        <td>
                          <div style={{ fontWeight:700 }}>{r.nome}</div>
                          {r.descricao && <div style={{ fontSize:11, color:'var(--text3)' }}>{r.descricao}</div>}
                        </td>
                        <td>
                          <span className={`badge ${r.tipo === 'pagar' ? 'badge-red' : 'badge-green'}`}>
                            {r.tipo === 'pagar' ? '↑ Pagar' : '↓ Receber'}
                          </span>
                        </td>
                        <td>{PERIODOS.find(p => p.id === r.periodicidade)?.label || r.periodicidade}</td>
                        <td style={{ textAlign:'center' }}>dia {r.dia_vencimento}</td>
                        <td className={`text-mono font-bold ${r.tipo==='pagar' ? 'text-red' : 'text-green'}`}>{fmt(r.valor)}</td>
                        <td><span className="badge badge-gray">{r.categoria}</span></td>
                        <td><span className={`badge ${r.ativo ? 'badge-green' : 'badge-gray'}`}>{r.ativo ? 'Ativa' : 'Pausada'}</span></td>
                        <td>
                          <div className="action-btns">
                            <button className="icon-btn edit" onClick={() => openEdit(r)}><Pencil size={13} /></button>
                            <button className="icon-btn toggle" title={r.ativo ? 'Pausar' : 'Ativar'} onClick={() => toggleAtivo(r)}><Power size={13} /></button>
                            <button className="icon-btn del" onClick={() => setDeleting(r)}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
      }

      {modal && (
        <Modal title={editing ? 'Editar Recorrência' : 'Nova Recorrência'} onClose={() => setModal(false)} onSave={save}>
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Nome *</label>
              <input className="form-input" value={form.nome} onChange={e => f('nome', e.target.value)} placeholder="Ex: Netflix, Aluguel, Seguro do carro..." autoFocus />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Descrição</label>
              <input className="form-input" value={form.descricao} onChange={e => f('descricao', e.target.value)} placeholder="Detalhes adicionais (opcional)" />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={form.tipo} onChange={e => f('tipo', e.target.value)}>
                <option value="pagar">↑ Conta a Pagar (saída)</option>
                <option value="receber">↓ Conta a Receber (entrada)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Valor *</label>
              <input className="form-input" type="number" step="0.01" value={form.valor} onChange={e => f('valor', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group">
              <label className="form-label">Periodicidade</label>
              <select className="form-select" value={form.periodicidade} onChange={e => f('periodicidade', e.target.value)}>
                {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Dia do vencimento</label>
              <input className="form-input" type="number" min={1} max={31} value={form.dia_vencimento} onChange={e => f('dia_vencimento', parseInt(e.target.value)||1)} />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <SelectCategoria value={form.categoria} onChange={v => f('categoria', v)}
                tipo={form.tipo === 'receber' ? 'receita' : 'despesa'} />
            </div>
            <div className="form-group">
              <label className="form-label">Conta / Carteira</label>
              <select className="form-select" value={form.conta_id} onChange={e => f('conta_id', e.target.value)}>
                <option value="">Nenhuma</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Forma de Pagamento</label>
              <select className="form-select" value={form.forma_pgto||''} onChange={e => f('forma_pgto', e.target.value)}>
                <option value="">Selecionar...</option>
                {['Dinheiro','PIX','Cartão Débito','Cartão Crédito','Boleto','Débito Automático','Transferência','Cheque','Outro'].map(fp =>
                  <option key={fp} value={fp}>{fp}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data início</label>
              <input className="form-input" type="date" value={form.data_inicio} onChange={e => f('data_inicio', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Data fim <span style={{ color:'var(--text3)', fontWeight:400 }}>(opcional)</span></label>
              <input className="form-input" type="date" value={form.data_fim} onChange={e => f('data_fim', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Excluir recorrência "${deleting.nome}"? Os lançamentos já gerados não serão removidos.`}
          onConfirm={destroy} onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
