import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  MessageCircle, ShoppingCart, Wrench, CreditCard, FileText,
  CheckCircle, XCircle, Pencil, RefreshCw, ChevronDown, ChevronUp,
  Clock, User, Calendar, Wallet, Tag, MapPin, Hash
} from 'lucide-react'
import { today, fmtDate } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const TIPOS = [
  { id: 'todos',      label: 'Todos',      icon: MessageCircle, color: 'var(--accent)' },
  { id: 'compra',     label: 'Compras',    icon: ShoppingCart,  color: 'var(--green)'  },
  { id: 'pagamento',  label: 'Pagamentos', icon: CreditCard,    color: 'var(--yellow)' },
  { id: 'servico',    label: 'Serviços',   icon: Wrench,        color: 'var(--purple)' },
  { id: 'anotacao',   label: 'Anotações',  icon: FileText,      color: 'var(--text2)'  },
]

const STATUS = [
  { id: '',          label: 'Pendentes' },
  { id: 'aprovado',  label: 'Aprovados' },
  { id: 'rejeitado', label: 'Rejeitados'},
]

const CATEGORIAS = ['Alimentacao','Transporte','Saude','Mercado','Restaurante',
  'Combustivel','Farmacia','Servicos','Moradia','Lazer','Educacao','Compras','Pagamentos','Outros']

const FORMAS = ['PIX','Cartao Debito','Cartao Credito','Dinheiro','Boleto','Transferencia','Outros']

function tipoConfig(tipo) {
  return TIPOS.find(t => t.id === tipo) || TIPOS[0]
}

function badgeStyle(status) {
  if (status === 'aprovado')  return { background: 'rgba(52,211,153,.12)', color: 'var(--green)',  border: '1px solid rgba(52,211,153,.25)' }
  if (status === 'rejeitado') return { background: 'rgba(248,113,113,.12)', color: 'var(--red)',    border: '1px solid rgba(248,113,113,.25)' }
  return { background: 'rgba(251,191,36,.12)', color: 'var(--yellow)', border: '1px solid rgba(251,191,36,.25)' }
}

export default function InboxWhatsApp() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()
  const [rows, setRows]           = useState([])
  const [anotacoes, setAnotacoes] = useState([])
  const [contas, setContas]       = useState([])
  const [cartoes, setCartoes]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [filtroTipo, setFiltroTipo]     = useState('todos')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [expanded, setExpanded]   = useState(null)
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState({})
  const [editingId, setEditingId] = useState(null)
  const [confirmando, setConfirmando] = useState(null)

  useEffect(() => { if (entidadeAtiva?.id) load() }, [entidadeAtiva?.id])

  async function load() {
    setLoading(true)
    const [{ data: inbox }, { data: anot }, { data: conts }, { data: carts }] = await Promise.all([
      supabase.from('lancamentos_inbox').select('*').eq('entidade_id', entidadeAtiva?.id).order('created_at', { ascending: false }),
      supabase.from('whatsapp_anotacoes').select('*').order('created_at', { ascending: false }),
      supabase.from('contas').select('id,nome').eq('ativo', true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
      supabase.from('cartoes').select('id,nome').eq('ativo', true).eq('entidade_id', entidadeAtiva?.id).order('nome'),
    ])
    setRows(inbox || [])
    setAnotacoes(anot || [])
    setContas(conts || [])
    setCartoes(carts || [])
    setLoading(false)
  }

  // Unifica lançamentos e anotações em uma lista
  const tudoUnificado = [
    ...(rows || []).map(r => ({ ...r, _source: 'inbox' })),
    ...(anotacoes || []).filter(() => filtroTipo === 'todos' || filtroTipo === 'anotacao')
      .map(a => ({ ...a, _source: 'anotacao', tipo: 'anotacao', descricao: a.texto, status: a.arquivada ? 'aprovado' : 'pendente', valor: 0, categoria: 'Anotação', forma_pgto: '-', data_ref: a.created_at?.split('T')[0] }))
  ]

  // Contadores por tipo
  const contadores = TIPOS.reduce((acc, t) => {
    if (t.id === 'todos') {
      acc[t.id] = tudoUnificado.filter(r => (!filtroStatus ? r.status === 'pendente' : r.status === filtroStatus)).length
    } else if (t.id === 'anotacao') {
      acc[t.id] = anotacoes.filter(a => !filtroStatus ? !a.arquivada : (filtroStatus === 'aprovado' ? a.arquivada : false)).length
    } else {
      acc[t.id] = rows.filter(r => r.tipo_lancamento === t.id || r.categoria?.toLowerCase().includes(t.id))
        .filter(r => !filtroStatus ? r.status === 'pendente' : r.status === filtroStatus).length
    }
    return acc
  }, {})

  // Filtra lista
  const filtrados = tudoUnificado.filter(r => {
    const matchTipo = filtroTipo === 'todos' ? true :
      filtroTipo === 'anotacao' ? r._source === 'anotacao' :
      filtroTipo === 'compra'    ? r.categoria === 'Compras' :
      filtroTipo === 'pagamento' ? r.categoria === 'Pagamentos' :
      filtroTipo === 'servico'   ? r.categoria === 'Servicos' : true
    const matchStatus = !filtroStatus
      ? r.status === 'pendente'
      : r.status === filtroStatus
    return matchTipo && matchStatus
  })

  const totalValor = filtrados.filter(r => r._source === 'inbox').reduce((s, r) => s + Number(r.valor || 0), 0)

  async function aprovar(row) {
    if (row._source === 'anotacao') {
      await supabase.from('whatsapp_anotacoes').update({ arquivada: true }).eq('id', row.id)
      toast('Anotação arquivada!', 'success')
    } else {
      // Grava no destino correto
      const data = row.data_ref || today()
      if (row.categoria === 'Compras' || row.tipo === 'saida') {
        await supabase.from('caixa').insert({entidade_id: entidadeAtiva?.id || null,
          data, tipo: 'saida', descricao: row.descricao,
          valor: row.valor, categoria: row.categoria,
          forma_pgto: row.forma_pgto, conta_id: row.conta_id,
          origem_id: row.id, origem_tabela: 'lancamentos_inbox'
        })
      } else if (row.categoria === 'Pagamentos') {
        await supabase.from('contas_pagar').insert({entidade_id: entidadeAtiva?.id || null,
          data_emissao: data, descricao: row.descricao,
          valor: row.valor, vencimento: row.data_ref,
          obs: `Via WhatsApp por ${row.nome_remetente}`
        })
      } else if (row.tipo === 'entrada') {
        await supabase.from('caixa').insert({entidade_id: entidadeAtiva?.id || null,
          data, tipo: 'entrada', descricao: row.descricao,
          valor: row.valor, categoria: row.categoria,
          forma_pgto: row.forma_pgto, conta_id: row.conta_id,
          origem_id: row.id, origem_tabela: 'lancamentos_inbox'
        })
      }
      await supabase.from('lancamentos_inbox').update({ status: 'aprovado' }).eq('id', row.id)
      toast('Lançamento aprovado e gravado!', 'success')
    }
    load()
  }

  async function rejeitar(row) {
    if (row._source === 'anotacao') {
      await supabase.from('whatsapp_anotacoes').delete().eq('id', row.id)
      toast('Anotação excluída!', 'success')
    } else {
      await supabase.from('lancamentos_inbox').update({ status: 'rejeitado' }).eq('id', row.id)
      toast('Lançamento rejeitado!', 'success')
    }
    setConfirmando(null)
    load()
  }

  function openEdit(row) {
    setForm({
      descricao: row.descricao || '',
      valor: row.valor || '',
      categoria: row.categoria || '',
      forma_pgto: row.forma_pgto || '',
      data_ref: row.data_ref || today(),
      conta_id: row.conta_id || '',
      num_parcelas: row.num_parcelas || 1,
    })
    setEditingId(row.id)
    setModal(true)
  }

  async function saveEdit() {
    if (!form.descricao) return toast('Descrição obrigatória', 'error')
    if (!form.valor) return toast('Valor obrigatório', 'error')
    await supabase.from('lancamentos_inbox').update({
      descricao: form.descricao,
      valor: parseFloat(String(form.valor).replace(',', '.')),
      categoria: form.categoria,
      forma_pgto: form.forma_pgto,
      data_ref: form.data_ref,
      conta_id: form.conta_id || null,
      num_parcelas: form.num_parcelas || 1,
    }).eq('id', editingId)
    toast('Lançamento atualizado!', 'success')
    setModal(false)
    load()
  }

  const tc = tipoConfig(filtroTipo)

  return (
    <div>
      {/* Header com contadores */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <MessageCircle size={18} color="var(--accent)" />
          <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.3px' }}>Inbox WhatsApp</h2>
          <button onClick={load} style={{ marginLeft: 'auto', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <RefreshCw size={13} /> Atualizar
          </button>
        </div>

        {/* Filtros de tipo */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {TIPOS.map(t => {
            const Icon = t.icon
            const ativo = filtroTipo === t.id
            const count = contadores[t.id] || 0
            return (
              <button key={t.id} onClick={() => setFiltroTipo(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                  border: ativo ? `1px solid ${t.color}` : '1px solid var(--border)',
                  background: ativo ? `rgba(${t.color === 'var(--accent)' ? '79,142,247' : t.color === 'var(--green)' ? '52,211,153' : t.color === 'var(--yellow)' ? '251,191,36' : t.color === 'var(--purple)' ? '167,139,250' : '125,143,179'},.1)` : 'var(--bg2)',
                  color: ativo ? t.color : 'var(--text2)',
                  fontSize: 12, fontWeight: ativo ? 600 : 500,
                  transition: 'all .15s'
                }}>
                <Icon size={13} />
                {t.label}
                {count > 0 && (
                  <span style={{
                    background: ativo ? t.color : 'var(--bg4)',
                    color: ativo ? '#fff' : 'var(--text2)',
                    borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700
                  }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Filtros de status */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {STATUS.map(s => (
            <button key={s.id} onClick={() => setFiltroStatus(s.id)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                border: filtroStatus === s.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: filtroStatus === s.id ? 'var(--accent-glow)' : 'transparent',
                color: filtroStatus === s.id ? 'var(--accent)' : 'var(--text3)',
                cursor: 'pointer', transition: 'all .15s'
              }}>{s.label}</button>
          ))}
          {filtrados.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
              {filtrados.length} registro{filtrados.length !== 1 ? 's' : ''}
              {totalValor > 0 && <span style={{ marginLeft: 8, color: 'var(--green)', fontWeight: 600 }}>{fmt(totalValor)}</span>}
            </span>
          )}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
          <MessageCircle size={32} style={{ marginBottom: 12, opacity: .4 }} />
          <div style={{ fontSize: 13 }}>Nenhum lançamento encontrado</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtrados.map(row => {
            const cfg = tipoConfig(
              row._source === 'anotacao' ? 'anotacao' :
              row.categoria === 'Compras' ? 'compra' :
              row.categoria === 'Pagamentos' ? 'pagamento' :
              row.categoria === 'Servicos' ? 'servico' : 'todos'
            )
            const Icon = cfg.icon
            const isExp = expanded === row.id
            const isPendente = row.status === 'pendente'

            return (
              <div key={row.id} style={{
                background: 'var(--bg2)', border: `1px solid ${isExp ? 'var(--border2)' : 'var(--border)'}`,
                borderRadius: 12, overflow: 'hidden',
                transition: 'border-color .15s, box-shadow .15s',
                boxShadow: isExp ? 'var(--shadow-sm)' : 'none'
              }}>
                {/* Linha principal */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
                  onClick={() => setExpanded(isExp ? null : row.id)}>

                  {/* Ícone tipo */}
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: `rgba(${cfg.color === 'var(--green)' ? '52,211,153' : cfg.color === 'var(--yellow)' ? '251,191,36' : cfg.color === 'var(--purple)' ? '167,139,250' : cfg.color === 'var(--text2)' ? '125,143,179' : '79,142,247'},.12)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Icon size={15} color={cfg.color} />
                  </div>

                  {/* Descrição */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.descricao || 'Sem descrição'}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                      {row.nome_remetente && (
                        <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <User size={10} /> {row.nome_remetente}
                        </span>
                      )}
                      {row.data_ref && (
                        <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Calendar size={10} /> {fmtDate(row.data_ref)}
                        </span>
                      )}
                      {row.categoria && row.categoria !== 'Anotação' && (
                        <span style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Tag size={10} /> {row.categoria}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Valor */}
                  {row.valor > 0 && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: row.tipo === 'entrada' ? 'var(--green)' : 'var(--text)' }}>
                        {row.tipo === 'entrada' ? '+' : ''}{fmt(row.valor)}
                      </div>
                      {row.forma_pgto && row.forma_pgto !== '-' && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{row.forma_pgto}</div>
                      )}
                    </div>
                  )}

                  {/* Status badge */}
                  <span style={{ ...badgeStyle(row.status), borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                    {row.status === 'aprovado' ? '✓ Aprovado' : row.status === 'rejeitado' ? '✗ Rejeitado' : '⏳ Pendente'}
                  </span>

                  {isExp ? <ChevronUp size={14} color="var(--text3)" /> : <ChevronDown size={14} color="var(--text3)" />}
                </div>

                {/* Detalhes expandidos */}
                {isExp && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
                      {row.forma_pgto && row.forma_pgto !== '-' && (
                        <Detail icon={<CreditCard size={12} />} label="Forma" value={row.forma_pgto} />
                      )}
                      {row.num_parcelas > 1 && (
                        <Detail icon={<Hash size={12} />} label="Parcelas" value={`${row.num_parcelas}x de ${fmt(row.valor / row.num_parcelas)}`} />
                      )}
                      {row.categoria && (
                        <Detail icon={<Tag size={12} />} label="Categoria" value={row.categoria} />
                      )}
                      {row.created_at && (
                        <Detail icon={<Clock size={12} />} label="Recebido" value={new Date(row.created_at).toLocaleString('pt-BR')} />
                      )}
                    </div>

                    {/* Ações */}
                    {isPendente && (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setConfirmando({ row, acao: 'rejeitar' })}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(248,113,113,.3)', background: 'rgba(248,113,113,.08)', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          <XCircle size={13} /> Rejeitar
                        </button>
                        {row._source !== 'anotacao' && (
                          <button onClick={() => openEdit(row)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                            <Pencil size={13} /> Editar
                          </button>
                        )}
                        <button onClick={() => aprovar(row)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(52,211,153,.3)', background: 'rgba(52,211,153,.08)', color: 'var(--green)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          <CheckCircle size={13} /> Aprovar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Editar */}
      {modal && (
        <Modal title="Editar Lançamento" onClose={() => setModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Descrição">
              <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                className="input" placeholder="Descrição do lançamento" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Valor (R$)">
                <input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                  className="input" placeholder="0,00" />
              </Field>
              <Field label="Data">
                <input type="date" value={form.data_ref} onChange={e => setForm(f => ({ ...f, data_ref: e.target.value }))}
                  className="input" />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Categoria">
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className="input">
                  <option value="">Selecione...</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Forma de Pagamento">
                <select value={form.forma_pgto} onChange={e => setForm(f => ({ ...f, forma_pgto: e.target.value }))} className="input">
                  <option value="">Selecione...</option>
                  {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Conta">
                <select value={form.conta_id} onChange={e => setForm(f => ({ ...f, conta_id: e.target.value }))} className="input">
                  <option value="">Sem conta</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>
              <Field label="Parcelas">
                <input type="number" min="1" max="48" value={form.num_parcelas}
                  onChange={e => setForm(f => ({ ...f, num_parcelas: parseInt(e.target.value) || 1 }))}
                  className="input" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={saveEdit}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm rejeitar */}
      {confirmando && (
        <ConfirmDialog
          title={confirmando.acao === 'rejeitar' ? 'Rejeitar lançamento?' : 'Confirmar'}
          message={`Tem certeza que deseja rejeitar "${confirmando.row.descricao}"?`}
          onConfirm={() => rejeitar(confirmando.row)}
          onCancel={() => setConfirmando(null)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .input {
          width: 100%; padding: 8px 10px; border-radius: 8px;
          border: 1px solid var(--border); background: var(--bg3);
          color: var(--text); font-size: 13px; outline: none;
          transition: border-color .15s;
        }
        .input:focus { border-color: var(--accent); }
      `}</style>
    </div>
  )
}

function Detail({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ color: 'var(--text3)', marginTop: 2 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{value}</div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.5px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
