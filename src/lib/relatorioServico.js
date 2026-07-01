/**
 * relatorioServico.js
 * Gera e abre relatório mensal de Serviço Recorrente em nova janela.
 *
 * Uso:
 *   import { gerarRelatorioServico } from '../lib/relatorioServico'
 *   gerarRelatorioServico({ cliente, lancamentos, mesRef, empresa })
 *
 * Parâmetros:
 *   cliente     — objeto { pessoas: { nome }, descricao }
 *   lancamentos — array de lançamentos do mês (já filtrados por mes_fechamento)
 *   mesRef      — string 'YYYY-MM'
 *   empresa     — objeto da entidade ativa (nome, cnpj_cpf, logo_base64, etc)
 */

export function gerarRelatorioServico({ cliente, lancamentos = [], mesRef, empresa = null }) {
  const fmt = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  const fmtDate = d => {
    if (!d) return '—'
    const dt = new Date(d + 'T12:00:00')
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }
  const fmtMes = m => {
    if (!m) return ''
    const [ano, mes] = m.split('-')
    const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    return `${nomes[Number(mes) - 1]}/${ano}`
  }

  const empresaNome   = empresa?.nome_fantasia || empresa?.nome || ''
  const empresaCnpj   = empresa?.cnpj_cpf || ''
  const empresaCidade = empresa?.cidade || ''
  const empresaEstado = empresa?.estado || ''
  const empresaTel    = empresa?.telefone || ''
  const logoHtml      = empresa?.logo_base64
    ? '<img src="' + empresa.logo_base64 + '" style="max-height:52px;max-width:100px;object-fit:contain" alt="Logo">'
    : `<div style="width:48px;height:48px;background:#1a2744;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#e8a030">${(empresaNome).charAt(0)}</div>`

  const clienteNome = cliente?.pessoas?.nome || cliente?.descricao || 'Cliente'
  const mesLabel    = fmtMes(mesRef)
  const hoje        = new Date().toLocaleDateString('pt-BR')

  // ── Separação dos lançamentos ─────────────────────────────────────────────

  // Valor mensal (tipo valor_mensal)
  const valorMensal = lancamentos.filter(l =>
    ['valor_mensal','salario'].includes(l.tipo_lancamento_servico?.codigo) &&
    !l.pago_por_cliente
  )

  // Material pago por mim (só tipo material, pago_por_cliente = false)
  const matPorMim = lancamentos.filter(l =>
    l.tipo_lancamento_servico?.codigo === 'material' &&
    !l.pago_por_cliente
  )

  // Material pago pelo cliente (qualquer débito com pago_por_cliente = true)
  const matPorEle = lancamentos.filter(l =>
    l.tipo_lancamento_servico?.natureza === 'debito' &&
    l.pago_por_cliente
  )

  // Recebimentos do valor mensal (tipo 7)
  const recebimentosMensal = lancamentos.filter(l =>
    l.tipo_lancamento_servico?.codigo === 'valor_mensal_recebido'
  )

  // Recebimentos de material (pix + dinheiro — tipos 3 e 4)
  const recebimentos = lancamentos.filter(l =>
    ['pix','dinheiro'].includes(l.tipo_lancamento_servico?.codigo)
  )

  // Empréstimos recebidos (acumulado — vem separado, não filtrado por mês)
  const emprestimos = lancamentos.filter(l =>
    l.tipo_lancamento_servico?.codigo === 'emprestimo'
  )
  const pgtoEmprestimo = lancamentos.filter(l =>
    l.tipo_lancamento_servico?.codigo === 'pagamento_emprestimo'
  )

  // Totais do mês
  const totalValorMensal     = valorMensal.reduce((s, l) => s + Number(l.valor_total || 0), 0)
  const totalRecebidoMensal  = recebimentosMensal.reduce((s, l) => s + Number(l.valor_total || 0), 0)
  const totalMatPorMim   = matPorMim.reduce((s, l) => s + Number(l.valor_total || 0), 0)
  const totalMatPorEle   = matPorEle.reduce((s, l) => s + Number(l.valor_total || 0), 0)
  const totalRecebido    = recebimentos.reduce((s, l) => s + Number(l.valor_total || 0), 0)
  const saldoValorMensal = totalValorMensal - totalRecebidoMensal
  const totalRecebidoMat = totalRecebido  // pix + dinheiro = recebimento de material
  const saldoMes         = saldoValorMensal + totalMatPorMim - totalRecebidoMat

  // Totais acumulados de empréstimo (todos os lançamentos, não só do mês)
  const totalEmprestado  = emprestimos.reduce((s, l) => s + Number(l.valor_total || 0), 0)
  const totalPagoEmp     = pgtoEmprestimo.reduce((s, l) => s + Number(l.valor_total || 0), 0)
  const saldoEmprestimo  = totalEmprestado - totalPagoEmp

  // ── HTML das tabelas ──────────────────────────────────────────────────────

  const rowsRecMensal = recebimentosMensal.map(l => `
    <tr>
      <td>${l.descricao}</td>
      <td style="color:#888">${fmtDate(l.data_lancamento)}</td>
      <td class="num pos">${fmt(l.valor_total)}</td>
    </tr>`).join('')

  const rowsValorMensal = valorMensal.map(l => `
    <tr>
      <td>${l.descricao}</td>
      <td style="color:#888">${l.local_ambiente || '—'}</td>
      <td style="color:#888">${fmtDate(l.data_lancamento)}</td>
      <td class="num neg">${fmt(l.valor_total)}</td>
    </tr>`).join('')

  const rowsMat = matPorMim.map(l => `
    <tr>
      <td>${l.descricao}</td>
      <td style="color:#888">${l.local_ambiente || '—'}</td>
      <td style="color:#888">${fmtDate(l.data_lancamento)}</td>
      <td class="num">${Number(l.qtde || 1).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
      <td class="num">${fmt(l.valor_unitario)}</td>
      <td class="num neg">${fmt(l.valor_total)}</td>
    </tr>`).join('')

  const rowsEle = matPorEle.length === 0 ? '' : matPorEle.map(l => `
    <tr>
      <td>${l.descricao}</td>
      <td style="color:#888">${l.local_ambiente || '—'}</td>
      <td style="color:#888">${fmtDate(l.data_lancamento)}</td>
      <td class="num gray">${fmt(l.valor_total)}</td>
    </tr>`).join('')

  const rowsRec = recebimentos.map(l => `
    <tr>
      <td>${l.descricao}</td>
      <td style="color:#888">${fmtDate(l.data_lancamento)}</td>
      <td><span class="badge badge-blue">${l.tipo_lancamento_servico?.codigo === 'pix' ? 'PIX' : 'Dinheiro'}</span></td>
      <td class="num pos">${fmt(l.valor_total)}</td>
    </tr>`).join('')

  const secaoEle = matPorEle.length === 0 ? '' : `
    <div class="secao">
      <div class="secao-titulo">
        Materiais — Pagos pelo Cliente
        <span class="badge badge-gray" style="margin-left:6px;font-size:9px">Informativo · não entra no acerto</span>
      </div>
      <table class="tabela">
        <thead><tr><th>Descrição</th><th>Local</th><th>Data</th><th class="num">Total</th></tr></thead>
        <tbody>${rowsEle}</tbody>
        <tfoot>
          <tr>
            <td colspan="3">Total pago pelo cliente</td>
            <td class="num gray">${fmt(totalMatPorEle)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`

  const secaoEmprestimo = totalEmprestado === 0 ? '' : `
    <div class="emprestimo-bloco">
      <div class="emp-ac-title">Empréstimo — Saldo Acumulado</div>
      <div class="emp-ac-row">
        <span class="emp-ac-label">Total de empréstimos</span>
        <span class="emp-ac-val">${fmt(totalEmprestado)}</span>
      </div>
      <div class="emp-ac-row">
        <span class="emp-ac-label">Valor pago</span>
        <span class="emp-ac-val" style="color:#6ee7b7">${fmt(totalPagoEmp)}</span>
      </div>
      <div class="emp-ac-row total">
        <span class="emp-ac-label">Saldo devedor</span>
        <span class="emp-ac-val">${fmt(saldoEmprestimo)}</span>
      </div>
    </div>`


  // Pré-calcula seções condicionais para evitar template literal aninhado
  const htmlResumoPorEle = matPorEle.length > 0
    ? '<div class="resumo-card gray"><div class="rc-label">Material pago por ele</div><div class="rc-val gray">' + fmt(totalMatPorEle) + '</div></div>'
    : '<div></div>'

  const htmlRecMensal = recebimentosMensal.length > 0
    ? '<table class="tabela" style="margin-top:6px"><thead><tr><th>Recebimentos do valor mensal</th><th>Data</th><th class=\"num\">Valor</th></tr></thead><tbody>' + rowsRecMensal + '</tbody></table>'
    : ''

  const htmlRecMat = recebimentos.length > 0
    ? '<table class="tabela" style="margin-top:8px"><thead><tr><th>Recebimentos de material</th><th>Data</th><th>Forma</th><th class=\"num\">Valor</th></tr></thead><tbody>' + rowsRec + '</tbody></table>'
    : ''

  const htmlLogoEmp = empresa?.logo_base64
    ? '<img src="' + empresa.logo_base64 + '" style="max-height:52px;max-width:100px;object-fit:contain" alt="Logo">'
    : '<div style="width:48px;height:48px;background:#1a2744;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#e8a030">' + (empresaNome).charAt(0) + '</div>'

  const htmlEmpDet = [
    empresaCnpj   ? '<div class="emp-det">CNPJ/CPF: ' + empresaCnpj + '</div>'   : '',
    empresaCidade ? '<div class="emp-det">' + empresaCidade + (empresaEstado ? ' — ' + empresaEstado : '') + '</div>' : '',
    empresaTel    ? '<div class="emp-det">' + empresaTel + '</div>'               : '',
  ].join('')


  // Seções HTML pré-calculadas (evita template literal aninhado)
  const _s1 = matPorEle.length > 0
    ? '<div class="resumo-card gray"><div class="rc-label">Material pago por ele</div><div class="rc-val gray">' + fmt(totalMatPorEle) + '</div></div>'
    : '<div></div>'

  const _s2 = valorMensal.length > 0
    ? '<div class="secao"><div class="secao-titulo">Valor Mensal</div><table class="tabela"><thead><tr><th>Descrição</th><th>Local</th><th>Data</th><th class=\"num\">Valor</th></tr></thead><tbody>' + rowsValorMensal + '</tbody></table>'
      + (recebimentosMensal.length > 0 ? '<table class="tabela" style="margin-top:6px"><thead><tr><th>Recebimentos do valor mensal</th><th>Data</th><th class=\"num\">Valor</th></tr></thead><tbody>' + rowsRecMensal + '</tbody></table>' : '')
      + '<div style="display:flex;justify-content:space-between;border-top:1px solid #ccc;padding-top:5px;margin-top:4px;font-size:11px"><div style="display:flex;gap:16px;font-weight:500"><span>Lançado: <strong style="font-family:\'DM Mono\',monospace;color:#e53e3e">' + fmt(totalValorMensal) + '</strong></span><span>Recebido: <strong style="font-family:\'DM Mono\',monospace;color:#38a169">' + fmt(totalRecebidoMensal) + '</strong></span></div><div style="font-weight:700">Diferença: <span style="font-family:\'DM Mono\',monospace;color:' + (saldoValorMensal > 0 ? '#e53e3e' : '#38a169') + '">' + fmt(Math.abs(saldoValorMensal)) + (saldoValorMensal > 0 ? ' a receber' : ' quitado') + '</span></div></div></div>'
    : ''

  const _s3 = matPorMim.length > 0
    ? '<div class="secao"><div class="secao-titulo">Materiais e Serviços — Pagos por Mim</div><table class="tabela"><thead><tr><th>Descrição</th><th>Local</th><th>Data</th><th class=\"num\">Qtde</th><th class=\"num\">Unit.</th><th class=\"num\">Total</th></tr></thead><tbody>' + rowsMat + '</tbody></table>'
      + '<div style="display:flex;justify-content:flex-end;border-top:1px solid #ccc;padding-top:5px;margin-top:2px;font-weight:700;font-size:11px"><span style="margin-right:12px">Total materiais pagos por mim</span><span style="font-family:\'DM Mono\',monospace;color:#e53e3e">' + fmt(totalMatPorMim) + '</span></div>'
      + (recebimentos.length > 0 ? '<table class="tabela" style="margin-top:8px"><thead><tr><th>Recebimentos de material</th><th>Data</th><th>Forma</th><th class=\"num\">Valor</th></tr></thead><tbody>' + rowsRec + '</tbody></table><div style="display:flex;justify-content:space-between;border-top:1px solid #ccc;padding-top:5px;margin-top:4px;font-size:11px"><div style="display:flex;gap:16px;font-weight:500"><span>Materiais: <strong style="font-family:\'DM Mono\',monospace;color:#e53e3e">' + fmt(totalMatPorMim) + '</strong></span><span>Recebido: <strong style="font-family:\'DM Mono\',monospace;color:#38a169">' + fmt(totalRecebidoMat) + '</strong></span></div><div style="font-weight:700">Diferença: <span style="font-family:\'DM Mono\',monospace;color:' + (totalMatPorMim - totalRecebidoMat > 0 ? '#e53e3e' : '#38a169') + '">' + fmt(Math.abs(totalMatPorMim - totalRecebidoMat)) + (totalMatPorMim - totalRecebidoMat > 0 ? ' a receber' : ' quitado') + '</span></div></div>' : '')
      + '</div>'
    : ''

  const _s4 = totalValorMensal > 0
    ? '<div class="ac-row"><span class="ac-label">Valor mensal pendente</span><span class="ac-val" style="color:#e53e3e">' + fmt(saldoValorMensal > 0 ? saldoValorMensal : 0) + '</span></div>'
    : ''

  const _s5 = totalMatPorMim > 0
    ? '<div class="ac-row"><span class="ac-label">Materiais a receber</span><span class="ac-val" style="color:#e53e3e">' + fmt(Math.max(0, totalMatPorMim - totalRecebidoMat)) + '</span></div>'
    : ''

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório — ${clienteNome} — ${mesLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:#e8e8e8;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:16px}
.btn-print{background:#1a2744;color:#fff;border:none;border-radius:8px;padding:9px 22px;font-size:13px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
.doc{background:#fff;width:210mm;padding:14mm 16mm;box-shadow:0 4px 20px rgba(0,0,0,.12);border-radius:3px}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10mm;border-bottom:2px solid #1a2744;margin-bottom:8mm}
.logo-area{display:flex;align-items:center;gap:12px}
.emp-nome{font-size:15px;font-weight:700;color:#1a2744}
.emp-det{font-size:10px;color:#666;margin-top:2px;line-height:1.5}
.doc-title{text-align:right}
.doc-title h1{font-size:18px;font-weight:700;color:#1a2744;letter-spacing:-.3px}
.doc-title p{font-size:11px;color:#888;margin-top:3px}
.cliente-bloco{background:#f8f7f4;border-radius:8px;padding:8px 14px;margin-bottom:8mm;display:flex;justify-content:space-between;align-items:center}
.cli-label{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.cli-val{font-size:13px;font-weight:600;color:#1a2744}
.resumo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:7mm}
.resumo-card{border-radius:8px;padding:10px 12px;border-left:3px solid #ddd;background:#f8f7f4}
.resumo-card.red{border-left-color:#e53e3e}
.resumo-card.gray{border-left-color:#94a3b8}
.resumo-card.green{border-left-color:#38a169}
.rc-label{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px}
.rc-val{font-size:15px;font-weight:700;font-family:'DM Mono',monospace}
.rc-val.red{color:#e53e3e}.rc-val.gray{color:#94a3b8}.rc-val.green{color:#38a169}
.secao{margin-bottom:7mm}
.secao-titulo{font-size:10px;font-weight:700;color:#1a2744;text-transform:uppercase;letter-spacing:.8px;padding-bottom:3mm;border-bottom:1px solid #ddd;margin-bottom:4mm;display:flex;align-items:center;gap:6px}
.secao-titulo::before{content:'';width:3px;height:14px;background:#1a2744;border-radius:2px;display:inline-block}
.tabela{width:100%;border-collapse:collapse;font-size:11px}
.tabela th{font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.4px;padding:4px 6px;border-bottom:1px solid #e0e0e0;text-align:left}
.tabela th.num{text-align:right}
.tabela td{padding:5px 6px;border-bottom:1px solid #f0f0f0;vertical-align:top}
.tabela td.num{text-align:right;font-family:'DM Mono',monospace;font-size:11px}
.tabela tr:last-child td{border-bottom:none}
.tabela tfoot td{font-weight:700;border-top:1px solid #ccc;padding-top:5px;font-size:11px}
.tabela tfoot td.num{font-family:'DM Mono',monospace}
.neg{color:#e53e3e}.pos{color:#38a169}.gray{color:#94a3b8}
.badge{display:inline-block;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:600}
.badge-blue{background:#e8f0fe;color:#2a6ef5}
.badge-gray{background:#f0ede6;color:#888}
.acerto-mes{background:#f8f7f4;border:1px solid #e8e8e8;border-radius:10px;padding:10px 14px;margin-bottom:6mm}
.ac-title{font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px}
.ac-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #eee}
.ac-row:last-child{border-bottom:none}
.ac-label{font-size:12px;color:#444}
.ac-val{font-family:'DM Mono',monospace;font-size:12px;font-weight:600;color:#1a2744}
.ac-row.total{margin-top:4px;padding-top:8px;border-top:2px solid #1a2744}
.ac-row.total .ac-label{font-size:13px;font-weight:700;color:#1a2744}
.ac-row.total .ac-val{font-size:18px;color:#2a6ef5}
.emprestimo-bloco{background:#1a2744;border-radius:10px;padding:10px 14px;margin-bottom:7mm}
.emp-ac-title{font-size:10px;font-weight:700;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px}
.emp-ac-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.emp-ac-row:last-child{border-bottom:none;padding-top:10px;margin-top:4px;border-top:1px solid rgba(255,255,255,.2)}
.emp-ac-label{font-size:12px;color:rgba(255,255,255,.7)}
.emp-ac-val{font-family:'DM Mono',monospace;font-size:12px;font-weight:600;color:#fff}
.emp-ac-row.total .emp-ac-label{font-size:13px;font-weight:700;color:#fff}
.emp-ac-row.total .emp-ac-val{font-size:18px;color:#e8a030}
.rodape{margin-top:10mm;padding-top:5mm;border-top:1px dashed #ddd;display:flex;justify-content:space-between;align-items:center}
.rodape span{font-size:9px;color:#bbb}
.rodape strong{color:#999}
@media print{
  body{background:#fff;padding:0}
  .btn-print{display:none}
  .doc{box-shadow:none;padding:10mm 12mm}
  .tabela tfoot{display:table-row-group}
  .tabela thead{display:table-header-group}
  .tabela tr{page-break-inside:avoid}
  .acerto-mes{page-break-inside:avoid}
  .emprestimo-bloco{page-break-inside:avoid}
  .secao{page-break-inside:avoid}
}
</style>
</head>
<body>
<button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
<div class="doc">

  <div class="header">
    <div class="logo-area">
      ${htmlLogoEmp}
      <div>
        <div class="emp-nome">${empresaNome}</div>
${htmlEmpDet}
      </div>
    </div>
    <div class="doc-title">
      <h1>Relatório Mensal</h1>
      <p>Serviço Recorrente · Fechamento ${mesLabel}</p>
      <p style="margin-top:4px;font-size:10px;color:#aaa">Gerado em ${hoje}</p>
    </div>
  </div>

  <div class="cliente-bloco">
    <div>
      <div class="cli-label">Cliente</div>
      <div class="cli-val">${clienteNome}</div>
    </div>
    <div style="text-align:right">
      <div class="cli-label">Período de referência</div>
      <div class="cli-val">${mesLabel}</div>
    </div>
    <div style="text-align:right">
      <div class="cli-label">Lançamentos no mês</div>
      <div class="cli-val">${lancamentos.length} itens</div>
    </div>
  </div>

  <div class="resumo-grid">
    <div class="resumo-card red">
      <div class="rc-label">Material pago por mim</div>
      <div class="rc-val red">${fmt(totalMatPorMim)}</div>
    </div>
    ${_s1}
    <div class="resumo-card green">
      <div class="rc-label">Recebido no mês</div>
      <div class="rc-val green">${fmt(totalRecebido)}</div>
    </div>
  </div>

  ${_s2}

  ${_s3}

  ${secaoEle}



  <div class="acerto-mes">
    <div class="ac-title">Acerto do Mês — ${mesLabel}</div>
    ${_s4}
    ${_s5}
    <div class="ac-row total">
      <span class="ac-label">Total a receber deste mês</span>
      <span class="ac-val">${fmt(saldoMes > 0 ? saldoMes : 0)}</span>
    </div>
  </div>

  ${secaoEmprestimo}

  <div class="rodape">
    <span>Gerado por <strong>GestãoFam</strong> · Serviço Recorrente</span>
    <span>${clienteNome} · Fechamento ${mesLabel}</span>
    <span><strong>${empresaNome}</strong></span>
  </div>

</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=1000,height=800')
  if (!win) { alert('Permita pop-ups para gerar o relatório.'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
}
