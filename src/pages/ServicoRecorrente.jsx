import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Plus, Pencil, Trash2, Power, Wallet, Coins,
  Hammer, Banknote, QrCode, Users
} from 'lucide-react'
import { today, fmtDate } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const TIPO_ICON = {
  material: Hammer,
  salario: Wallet,
  pix: QrCode,
  dinheiro: Banknote,
  emprestimo: Coins,
  pagamento_emprestimo: Coins,
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const EMPTY_CLIENTE = { pessoa_id: '', descricao: '', ativo: true }
const EMPTY_LANC = {
  tipo_id: '', descricao: '', local_ambiente: '',
  data_lancamento: today(), qtde: 1, valor_unitario: '', observacao: ''
}

export default function ServicoRecorrente() {
  const toast = useToast()
  const { entidadeAtiva, pode } = useEntidade()

  const sanitize = (obj) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === '' ? null : v])
  )

  const [pessoas, setPessoas]     = useState([])
  const [clientes, setClientes]   = useState([])
  const [tipos, setTipos]         = useState([])
  const [clienteSel, setClienteSel] = useState(null)
  const [lancamentos, setLancamentos] = useState([])
  const [loading, setLoading]     = useState(true)

  const [mesRef, setMesRef] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [saldoFinal, setSaldoFinal] = useState({ saldo_conta_corrente: 0, saldo_emprestimo: 0, total_final: 0 })
  const [saldoTipoMes, setSaldoTipoMes] = useState([])

  const [modalCliente, setModalCliente]     = useState(false)
  const [formCliente, setFormCliente]       = useState(EMPTY_CLIENTE)
  const [editingCliente, setEditingCliente] = useState(null)
  const [deletingCliente, setDeletingCliente] = useState(null)
  const [listaClientes, setListaClientes]   = useState(false)

  const [modalLanc, setModalLanc]     = useState(false)
  const [formLanc, setFormLanc]       = useState(EMPTY_LANC)
  const [editingLanc, setEditingLanc] = useState(null)
  const [deletingLanc, setDeletingLanc] = useState(null)
  const [savingLanc, setSavingLanc]   = useState(false)

  useEffect(() => { if (entidadeAtiva?.id) loadAuxiliar() }, [entidadeAtiva?.id])
  useEffect(() => { if (clienteSel) load() }, [clienteSel, mesRef])

  async function loadAuxiliar() {
    if (!entidadeAtiva?.id) { setLoading(false); return }

    supabase.from('pessoas').select('id,nome').in('tipo', ['cliente', 'ambos'])
      .eq('ativo', true).eq('entidade_id', entidadeAtiva.id).order('nome')
      .then(({ data }) => setPessoas(data || []))

    const { data: cli, error } = await supabase
      .from('servico_recorrente_cliente')
      .select('id, descricao, ativo, pessoa_id, pessoas:pessoa_id (id, nome)')
      .eq('entidade_id', entidadeAtiva.id)
      .eq('ativo', true)
      .order('created_at')

    if (error) { toast(error.message, 'error'); setLoading(false); return }
    setClientes(cli || [])
    if ((cli || []).length > 0 && !clienteSel) setClienteSel(cli[0].id)
    if ((cli || []).length === 0) setLoading(false)

    supabase.from('tipo_lancamento_servico').select('*').eq('ativo', true).order('id')
      .then(({ data }) => setTipos(data || []))
  }

  async function load() {
    if (!entidadeAtiva?.id || !clienteSel) { setLoading(false); return }
    setLoading(true)

    const [ano, mes] = mesRef.split('-').map(Number)
    const inicio = `${mesRef}-01`
    const fimDate = new Date(ano, mes, 0).getDate()
    const fim = `${mesRef}-${String(fimDate).padStart(2, '0')}`

    const { data: lancs, error } = await supabase
      .from('servico_lancamento')
      .select('*, tipo_lancamento_servico:tipo_id (codigo, nome_exibicao, ledger, natureza)')
      .eq('entidade_id', entidadeAtiva.id)
      .eq('cliente_id', clienteSel)
      .gte('data_lancamento', inicio)
      .lte('data_lancamento', fim)
      .order('data_lancamento', { ascending: false })

    if (error) { toast(error.message, 'error'); setLoading(false); return }
    setLancamentos(lancs || [])

    const { data: saldo } = await supabase
      .from('vw_servico_saldo_final')
      .select('*')
      .eq('cliente_id', clienteSel)
      .maybeSingle()
    setSaldoFinal(saldo || { saldo_conta_corrente: 0, saldo_emprestimo: 0, total_final: 0 })

    const { data: porTipo } = await supabase
      .from('vw_servico_saldo_tipo_mes')
      .select('*')
      .eq('cliente_id', clienteSel)
      .eq('mes_referencia', inicio)
    setSaldoTipoMes(porTipo || [])

    setLoading(false)
  }

  // ── CLIENTE (CRUD que faltava na versão original) ───────────────────────────

  function openNewCliente() { setFormCliente({ ...EMPTY_CLIENTE }); setEditingCliente(null); setModalCliente(true) }
  function openEditCliente(c) {
    setFormCliente({ pessoa_id: c.pessoa_id, descricao: c.descricao || '', ativo: c.ativo })
    setEditingCliente(c.id); setModalCliente(true)
  }

  async function saveCliente() {
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade antes de salvar', 'error')
    if (!formCliente.pessoa_id) return toast('Selecione a pessoa/cliente', 'error')
    let error
    if (editingCliente) {
      ({ error } = await supabase.from('servico_recorrente_cliente').update(sanitize(formCliente)).eq('id', editingCliente))
    } else {
      ({ error } = await supabase.from('servico_recorrente_cliente').insert(
        sanitize({ ...formCliente, entidade_id: entidadeAtiva.id })
      ))
    }
    if (error) { toast(error.message, 'error'); return }
    toast(editingCliente ? 'Cliente atualizado!' : 'Cliente cadastrado!', 'success')
    setModalCliente(false)
    loadAuxiliar()
  }

  async function toggleAtivoCliente(c) {
    await supabase.from('servico_recorrente_cliente').update({ ativo: !c.ativo }).eq('id', c.id)
    toast(`Cliente ${!c.ativo ? 'ativado' : 'desativado'}`, 'info')
    loadAuxiliar()
  }

  async function destroyCliente() {
    const { error } = await supabase.from('servico_recorrente_cliente').delete().eq('id', deletingCliente.id)
    if (error) { toast(error.message, 'error'); setDeletingCliente(null); return }
    toast('Cliente removido', 'success')
    setDeletingCliente(null)
    if (clienteSel === deletingCliente.id) setClienteSel(null)
    loadAuxiliar()
  }

  const fc = (k, v) => setFormCliente(p => ({ ...p, [k]: v }))

  // ── LANÇAMENTO ───────────────────────────────────────────────────────────────

  function abrirNovoLanc() {
    if (!clienteSel) return toast('Selecione um cliente primeiro', 'error')
    setFormLanc({ ...EMPTY_LANC })
    setEditingLanc(null)
    setModalLanc(true)
  }

  function abrirEditarLanc(l) {
    setFormLanc({
      tipo_id: l.tipo_id, descricao: l.descricao,
      local_ambiente: l.local_ambiente || '', data_lancamento: l.data_lancamento,
      qtde: l.qtde, valor_unitario: l.valor_unitario, observacao: l.observacao || ''
    })
    setEditingLanc(l.id)
    setModalLanc(true)
  }

  async function salvarLanc() {
    if (!entidadeAtiva?.id) return toast('Selecione uma entidade antes de salvar', 'error')
    if (!clienteSel) return toast('Selecione um cliente', 'error')
    if (!formLanc.tipo_id) return toast('Selecione o tipo de lançamento', 'error')
    if (!formLanc.descricao) return toast('Informe a descrição', 'error')
    if (!formLanc.valor_unitario) return toast('Informe o valor', 'error')

    setSavingLanc(true)
    const payload = sanitize({
      ...formLanc,
      entidade_id: entidadeAtiva.id,
      cliente_id: clienteSel,
    })

    let error
    if (editingLanc) ({ error } = await supabase.from('servico_lancamento').update(payload).eq('id', editingLanc))
    else             ({ error } = await supabase.from('servico_lancamento').insert(payload))

    setSavingLanc(false)
    if (error) { toast(error.message, 'error'); return }
    toast(editingLanc ? 'Lançamento atualizado!' : 'Lançamento salvo!', 'success')
    setModalLanc(false)
    load()
  }

  async function confirmarExclusaoLanc() {
    const { error } = await supabase.from('servico_lancamento').delete().eq('id', deletingLanc.id)
    if (error) { toast(error.message, 'error'); setDeletingLanc(null); return }
    toast('Lançamento removido', 'success')
    setDeletingLanc(null)
    load()
  }

  const fl = (k, v) => setFormLanc(p => ({ ...p, [k]: v }))

  const tipoSelecionado = useMemo(
    () => tipos.find(t => t.id === Number(formLanc.tipo_id)),
    [tipos, formLanc.tipo_id]
  )

  const valorTotalPreview = useMemo(() => {
    const q = Number(formLanc.qtde || 0)
    const v = Number(formLanc.valor_unitario || 0)
    return q * v
  }, [formLanc.qtde, formLanc.valor_unitario])

  if (loading && !clientes.length) return <div className="loading"><div className="spinner" /></div>

  // ── Sem clientes cadastrados — estado vazio com call-to-action ──────────────
  if (!loading && clientes.length === 0 && !modalCliente) {
    return (
      <div>
        <div className="card">
          <div className="empty-state">
            <Users size={40} />
            <p>Nenhum cliente em serviço recorrente cadastrado.</p>
            {pode('lancar') && (
              <button className="btn btn-primary" onClick={openNewCliente} style={{ marginTop: 12 }}>
                <Plus size={15} /> Cadastrar primeiro cliente
              </button>
            )}
          </div>
        </div>

        {modalCliente && (
          <Modal title="Novo Cliente — Serviço Recorrente" onClose={() => setModalCliente(false)} onSave={saveCliente}>
            <div className="form-grid form-grid-1">
              <div className="form-group">
                <label className="form-label">Pessoa / Cliente *</label>
                <select className="form-select" value={formCliente.pessoa_id} onChange={e => fc('pessoa_id', e.target.value)}>
                  <option value="">Selecionar...</option>
                  {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
                  Só aparecem pessoas já cadastradas com tipo Cliente ou Ambos
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descrição</label>
                <input className="form-input" value={formCliente.descricao} onChange={e => fc('descricao', e.target.value)}
                  placeholder="Ex: Serviços tarde — João" />
              </div>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="toolbar">
        <select className="form-select" style={{ width: 'auto' }} value={clienteSel || ''} onChange={e => setClienteSel(e.target.value)}>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>{c.pessoas?.nome || c.descricao}</option>
          ))}
        </select>
        <input type="month" className="form-input" style={{ width: 'auto' }} value={mesRef} onChange={e => setMesRef(e.target.value)} />
        <div style={{ flex: 1 }} />
        {pode('lancar') && (
          <button className="btn btn-secondary" onClick={() => setListaClientes(v => !v)}>
            <Users size={15} /> {listaClientes ? 'Ver Lançamentos' : 'Gerenciar Clientes'}
          </button>
        )}
        {!listaClientes && pode('lancar') && (
          <button className="btn btn-primary" onClick={abrirNovoLanc}>
            <Plus size={15} /> Novo Lançamento
          </button>
        )}
      </div>

      {listaClientes ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            {pode('lancar') && (
              <button className="btn btn-primary btn-sm" onClick={openNewCliente}>
                <Plus size={13} /> Novo Cliente
              </button>
            )}
          </div>
          {clientes.length === 0
            ? <div className="empty-state"><Users size={40} /><p>Nenhum cliente cadastrado</p></div>
            : <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Cliente</th><th>Descrição</th><th>Status</th><th>Ações</th>
                  </tr></thead>
                  <tbody>
                    {clientes.map(c => (
                      <tr key={c.id} style={{ opacity: c.ativo ? 1 : .5 }}>
                        <td className="font-bold">{c.pessoas?.nome || '—'}</td>
                        <td className="text-muted">{c.descricao || '—'}</td>
                        <td><span className={`badge ${c.ativo ? 'badge-green' : 'badge-gray'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span></td>
                        <td>
                          <div className="action-btns">
                            <button className="icon-btn edit" title="Editar" onClick={() => openEditCliente(c)}><Pencil size={14} /></button>
                            <button className="icon-btn toggle" title={c.ativo ? 'Desativar' : 'Ativar'} onClick={() => toggleAtivoCliente(c)}><Power size={14} /></button>
                            <button className="icon-btn del" title="Excluir" onClick={() => setDeletingCliente(c)}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>
      ) : (
        <>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
            <div className="stat-card blue">
              <div className="stat-label">Saldo Conta Corrente</div>
              <div className="stat-value blue text-mono">{fmt(saldoFinal.saldo_conta_corrente)}</div>
            </div>
            <div className="stat-card red">
              <div className="stat-label">Saldo Empréstimo</div>
              <div className="stat-value red text-mono">{fmt(saldoFinal.saldo_emprestimo)}</div>
            </div>
            <div className="stat-card green">
              <div className="stat-label">Total Final a Receber</div>
              <div className="stat-value green text-mono">{fmt(saldoFinal.total_final)}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              Por tipo — {MESES[Number(mesRef.split('-')[1]) - 1]}
            </div>
            {saldoTipoMes.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>Nenhum lançamento neste mês.</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {saldoTipoMes.map(t => {
                    const Icon = TIPO_ICON[t.tipo_codigo] || Wallet
                    return (
                      <div key={t.tipo_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon size={15} color="var(--text3)" />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{t.nome_exibicao}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.qtde_lancamentos} lançamento(s)</div>
                          </div>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: t.natureza === 'debito' ? 'var(--red)' : 'var(--green)' }}>
                          {fmt(t.total_movimentado)}
                        </div>
                      </div>
                    )
                  })}
                </div>
            }
          </div>

          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Lançamentos do mês</div>
            {loading
              ? <div className="loading"><div className="spinner" /></div>
              : lancamentos.length === 0
                ? <div className="empty-state"><Wallet size={40} /><p>Nenhum lançamento neste mês</p></div>
                : <div className="table-wrap">
                    <table>
                      <thead><tr>
                        <th>Tipo</th><th>Descrição</th><th>Local</th><th>Data</th><th>Valor</th><th>Ações</th>
                      </tr></thead>
                      <tbody>
                        {lancamentos.map(l => {
                          const tls = l.tipo_lancamento_servico
                          const Icon = TIPO_ICON[tls?.codigo] || Wallet
                          const cor = tls?.natureza === 'debito' ? 'var(--red)' : 'var(--green)'
                          const sinal = tls?.natureza === 'debito' ? '+' : '−'
                          return (
                            <tr key={l.id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Icon size={14} color="var(--text3)" />
                                  <span style={{ fontSize: 12 }}>{tls?.nome_exibicao}</span>
                                </div>
                              </td>
                              <td className="font-bold">{l.descricao}</td>
                              <td className="text-muted">{l.local_ambiente || '—'}</td>
                              <td className="text-muted" style={{ fontSize: 12 }}>{fmtDate(l.data_lancamento)}</td>
                              <td className="text-mono font-bold" style={{ color: cor }}>{sinal} {fmt(l.valor_total)}</td>
                              <td>
                                <div className="action-btns">
                                  <button className="icon-btn edit" title="Editar" onClick={() => abrirEditarLanc(l)}><Pencil size={14} /></button>
                                  <button className="icon-btn del" title="Excluir" onClick={() => setDeletingLanc(l)}><Trash2 size={14} /></button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
            }
          </div>
        </>
      )}

      {modalCliente && (
        <Modal title={editingCliente ? 'Editar Cliente' : 'Novo Cliente'} onClose={() => setModalCliente(false)} onSave={saveCliente}>
          <div className="form-grid form-grid-1">
            <div className="form-group">
              <label className="form-label">Pessoa / Cliente *</label>
              <select className="form-select" value={formCliente.pessoa_id} onChange={e => fc('pessoa_id', e.target.value)}>
                <option value="">Selecionar...</option>
                {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
                Só aparecem pessoas já cadastradas com tipo Cliente ou Ambos
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" value={formCliente.descricao} onChange={e => fc('descricao', e.target.value)}
                placeholder="Ex: Serviços tarde — João" />
            </div>
          </div>
        </Modal>
      )}

      {modalLanc && (
        <Modal title={editingLanc ? 'Editar Lançamento' : 'Novo Lançamento'} onClose={() => setModalLanc(false)} onSave={salvarLanc}>
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Tipo *</label>
              <select className="form-select" value={formLanc.tipo_id} onChange={e => fl('tipo_id', e.target.value)}>
                <option value="">Selecione...</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.nome_exibicao}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" value={formLanc.descricao} onChange={e => fl('descricao', e.target.value)}
                placeholder="Ex: Parafuso philips 35x25" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Local / Ambiente</label>
              <input className="form-input" value={formLanc.local_ambiente} onChange={e => fl('local_ambiente', e.target.value)}
                placeholder="Ex: Sala nova" />
            </div>
            <div className="form-group">
              <label className="form-label">Data</label>
              <input className="form-input" type="date" value={formLanc.data_lancamento} onChange={e => fl('data_lancamento', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Quantidade</label>
              <input className="form-input" type="number" step="0.01" value={formLanc.qtde} onChange={e => fl('qtde', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Valor Unitário</label>
              <input className="form-input" type="number" step="0.01" value={formLanc.valor_unitario} onChange={e => fl('valor_unitario', e.target.value)} placeholder="0,00" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                Valor total: <strong style={{ fontFamily: 'var(--mono)' }}>{fmt(valorTotalPreview)}</strong>
                {tipoSelecionado && (
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>
                    · {tipoSelecionado.ledger === 'emprestimo' ? 'Ledger: Empréstimo' : 'Ledger: Conta corrente'}
                  </span>
                )}
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Observação</label>
              <textarea className="form-textarea" rows={2} value={formLanc.observacao} onChange={e => fl('observacao', e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {deletingCliente && (
        <ConfirmDialog
          message={`Excluir o cliente "${deletingCliente.pessoas?.nome}"? Todos os lançamentos vinculados também serão afetados.`}
          onConfirm={destroyCliente} onCancel={() => setDeletingCliente(null)} />
      )}
      {deletingLanc && (
        <ConfirmDialog
          message={`Remover o lançamento "${deletingLanc.descricao}"? Essa ação não pode ser desfeita.`}
          onConfirm={confirmarExclusaoLanc} onCancel={() => setDeletingLanc(null)} />
      )}
    </div>
  )
}
