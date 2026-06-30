import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../contexts/ToastContext'
import { useEntidade } from '../contexts/EntidadeContext'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Plus, Search, Pencil, Trash2, Power, Wallet, Coins,
  Hammer, Banknote, QrCode, CoinsIcon, ChevronDown, ChevronUp
} from 'lucide-react'
import { today, fmtDate } from '../lib/utils.js'

const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

// Ícone por código de tipo de lançamento (segue o cadastro de tipo_lancamento_servico)
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

const EMPTY_LANC = {
  cliente_id: '', tipo_id: '', descricao: '', local_ambiente: '',
  data_lancamento: today(), qtde: 1, valor_unitario: '', observacao: ''
}

export default function ServicoRecorrente() {
  const toast = useToast()
  const { entidadeAtiva } = useEntidade()

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

  const [modalLanc, setModalLanc]     = useState(false)
  const [formLanc, setFormLanc]       = useState(EMPTY_LANC)
  const [editingLanc, setEditingLanc] = useState(null)
  const [deletingLanc, setDeletingLanc] = useState(null)
  const [savingLanc, setSavingLanc]   = useState(false)

  const sanitize = (obj) => Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === '' ? null : v])
  )

  // Carrega clientes em serviço recorrente + tipos (cadastro fixo)
  useEffect(() => {
    if (!entidadeAtiva?.id) return
    supabase
      .from('servico_recorrente_cliente')
      .select('id, descricao, ativo, pessoas:pessoa_id (id, nome)')
      .eq('entidade_id', entidadeAtiva?.id)
      .eq('ativo', true)
      .then(({ data, error }) => {
        if (error) { toast(error.message, 'error'); return }
        setClientes(data || [])
        if ((data || []).length > 0 && !clienteSel) setClienteSel(data[0].id)
      })

    supabase
      .from('tipo_lancamento_servico')
      .select('*')
      .eq('ativo', true)
      .order('id')
      .then(({ data, error }) => {
        if (error) { toast(error.message, 'error'); return }
        setTipos(data || [])
      })
  }, [entidadeAtiva?.id])

  useEffect(() => {
    if (!clienteSel) return
    load()
  }, [clienteSel, mesRef])

  async function load() {
    setLoading(true)

    const [ano, mes] = mesRef.split('-').map(Number)
    const inicio = `${mesRef}-01`
    const fimDate = new Date(ano, mes, 0).getDate()
    const fim = `${mesRef}-${String(fimDate).padStart(2, '0')}`

    const { data: lancs, error } = await supabase
      .from('servico_lancamento')
      .select('*, tipo_lancamento_servico:tipo_id (codigo, nome_exibicao, ledger, natureza)')
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

  function abrirNovoLanc() {
    setFormLanc({ ...EMPTY_LANC, cliente_id: clienteSel })
    setEditingLanc(null)
    setModalLanc(true)
  }

  function abrirEditarLanc(l) {
    setFormLanc({
      cliente_id: l.cliente_id, tipo_id: l.tipo_id, descricao: l.descricao,
      local_ambiente: l.local_ambiente || '', data_lancamento: l.data_lancamento,
      qtde: l.qtde, valor_unitario: l.valor_unitario, observacao: l.observacao || ''
    })
    setEditingLanc(l.id)
    setModalLanc(true)
  }

  async function salvarLanc() {
    if (!formLanc.tipo_id) { toast('Selecione o tipo de lançamento', 'error'); return }
    if (!formLanc.descricao) { toast('Informe a descrição', 'error'); return }
    if (!formLanc.valor_unitario) { toast('Informe o valor', 'error'); return }

    setSavingLanc(true)
    const payload = sanitize({
      ...formLanc,
      entidade_id: entidadeAtiva?.id || null,
      cliente_id: clienteSel,
    })

    let error
    if (editingLanc) {
      ({ error } = await supabase.from('servico_lancamento').update(payload).eq('id', editingLanc))
    } else {
      ({ error } = await supabase.from('servico_lancamento').insert(payload))
    }

    setSavingLanc(false)
    if (error) { toast(error.message, 'error'); return }
    toast(editingLanc ? 'Lançamento atualizado' : 'Lançamento salvo', 'success')
    setModalLanc(false)
    load()
  }

  async function confirmarExclusao() {
    if (!deletingLanc) return
    const { error } = await supabase.from('servico_lancamento').delete().eq('id', deletingLanc.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Lançamento removido', 'success')
    setDeletingLanc(null)
    load()
  }

  const tipoSelecionado = useMemo(
    () => tipos.find(t => t.id === Number(formLanc.tipo_id)),
    [tipos, formLanc.tipo_id]
  )

  const valorTotalPreview = useMemo(() => {
    const q = Number(formLanc.qtde || 0)
    const v = Number(formLanc.valor_unitario || 0)
    return q * v
  }, [formLanc.qtde, formLanc.valor_unitario])

  if (!entidadeAtiva?.id) return null

  return (
    <div className="page">
      <div className="page-header">
        <h1>Serviço Recorrente</h1>
        <div className="flex gap-2">
          <select
            value={clienteSel || ''}
            onChange={e => setClienteSel(e.target.value)}
            className="select"
          >
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.pessoas?.nome || c.descricao}</option>
            ))}
          </select>
          <input
            type="month"
            value={mesRef}
            onChange={e => setMesRef(e.target.value)}
            className="input"
          />
          <button className="btn btn-primary" onClick={abrirNovoLanc}>
            <Plus size={16} /> Novo lançamento
          </button>
        </div>
      </div>

      {/* Cards de saldo */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card">
          <p className="text-sm text-secondary">Saldo conta corrente</p>
          <p className="text-xl font-medium text-accent">{fmt(saldoFinal.saldo_conta_corrente)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-secondary">Saldo empréstimo</p>
          <p className="text-xl font-medium text-danger">{fmt(saldoFinal.saldo_emprestimo)}</p>
        </div>
      </div>

      <div className="card mb-4">
        <p className="text-sm text-secondary">Total final a receber</p>
        <p className="text-2xl font-medium">{fmt(saldoFinal.total_final)}</p>
      </div>

      {/* Por tipo, no mês */}
      <h3 className="mb-2">Por tipo — {MESES[Number(mesRef.split('-')[1]) - 1]}</h3>
      <div className="list mb-4">
        {saldoTipoMes.map(t => {
          const Icon = TIPO_ICON[t.tipo_codigo] || Wallet
          return (
            <div key={t.tipo_id} className="list-row">
              <div className="flex items-center gap-2">
                <Icon size={16} className="text-secondary" />
                <div>
                  <p>{t.nome_exibicao}</p>
                  <p className="text-xs text-muted">{t.qtde_lancamentos} lançamento(s)</p>
                </div>
              </div>
              <p className={t.natureza === 'debito' ? 'text-primary' : 'text-success'}>
                {fmt(t.total_movimentado)}
              </p>
            </div>
          )
        })}
        {saldoTipoMes.length === 0 && (
          <p className="text-sm text-muted">Nenhum lançamento neste mês.</p>
        )}
      </div>

      {/* Lançamentos do mês */}
      <h3 className="mb-2">Lançamentos do mês</h3>
      <div className="list">
        {loading && <p className="text-sm text-muted">Carregando...</p>}
        {!loading && lancamentos.length === 0 && (
          <p className="text-sm text-muted">Nenhum lançamento neste mês.</p>
        )}
        {lancamentos.map(l => {
          const tls = l.tipo_lancamento_servico
          const Icon = TIPO_ICON[tls?.codigo] || Wallet
          const sinal = tls?.natureza === 'debito' ? '+' : '−'
          const cor = tls?.natureza === 'debito' ? 'text-primary' : 'text-success'
          return (
            <div key={l.id} className="list-row">
              <div className="flex items-center gap-2">
                <Icon size={16} className="text-secondary" />
                <div>
                  <p>{l.descricao}</p>
                  <p className="text-xs text-muted">
                    {fmtDate(l.data_lancamento)}{l.local_ambiente ? ` · ${l.local_ambiente}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cor}>{sinal} {fmt(l.valor_total)}</span>
                <button className="icon-btn" onClick={() => abrirEditarLanc(l)}>
                  <Pencil size={14} />
                </button>
                <button className="icon-btn" onClick={() => setDeletingLanc(l)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal de lançamento */}
      <Modal open={modalLanc} onClose={() => setModalLanc(false)} title={editingLanc ? 'Editar lançamento' : 'Novo lançamento'}>
        <div className="form-grid">
          <label>Tipo</label>
          <select
            value={formLanc.tipo_id}
            onChange={e => setFormLanc(f => ({ ...f, tipo_id: e.target.value }))}
          >
            <option value="">Selecione...</option>
            {tipos.map(t => (
              <option key={t.id} value={t.id}>{t.nome_exibicao}</option>
            ))}
          </select>

          <label>Descrição</label>
          <input
            type="text"
            value={formLanc.descricao}
            onChange={e => setFormLanc(f => ({ ...f, descricao: e.target.value }))}
            placeholder="ex: parafuso philips 35x25"
          />

          <div className="form-row-2">
            <div>
              <label>Local</label>
              <input
                type="text"
                value={formLanc.local_ambiente}
                onChange={e => setFormLanc(f => ({ ...f, local_ambiente: e.target.value }))}
                placeholder="sala nova"
              />
            </div>
            <div>
              <label>Data</label>
              <input
                type="date"
                value={formLanc.data_lancamento}
                onChange={e => setFormLanc(f => ({ ...f, data_lancamento: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row-2">
            <div>
              <label>Qtde</label>
              <input
                type="number"
                step="0.01"
                value={formLanc.qtde}
                onChange={e => setFormLanc(f => ({ ...f, qtde: e.target.value }))}
              />
            </div>
            <div>
              <label>Valor unitário</label>
              <input
                type="number"
                step="0.01"
                value={formLanc.valor_unitario}
                onChange={e => setFormLanc(f => ({ ...f, valor_unitario: e.target.value }))}
                placeholder="0,00"
              />
            </div>
          </div>

          <p className="text-sm text-secondary">
            Valor total: <strong>{fmt(valorTotalPreview)}</strong>
            {tipoSelecionado && (
              <span className="text-xs text-muted"> · {tipoSelecionado.ledger === 'emprestimo' ? 'Ledger: Empréstimo' : 'Ledger: Conta corrente'}</span>
            )}
          </p>

          <label>Observação</label>
          <textarea
            value={formLanc.observacao}
            onChange={e => setFormLanc(f => ({ ...f, observacao: e.target.value }))}
          />
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={() => setModalLanc(false)}>Cancelar</button>
          <button className="btn btn-primary" disabled={savingLanc} onClick={salvarLanc}>
            {savingLanc ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingLanc}
        title="Remover lançamento?"
        message="Essa ação não pode ser desfeita."
        onCancel={() => setDeletingLanc(null)}
        onConfirm={confirmarExclusao}
      />
    </div>
  )
}
