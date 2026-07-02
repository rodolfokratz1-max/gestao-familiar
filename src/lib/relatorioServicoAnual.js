/**
 * relatorioServicoAnual.js
 * Gera resumo anual do Serviço Recorrente por mês.
 *
 * Uso:
 *   import { gerarRelatorioServicoAnual } from '../lib/relatorioServicoAnual'
 *   gerarRelatorioServicoAnual({ cliente, ano, empresa, supabase, clienteId, entidadeId })
 */

export async function gerarRelatorioServicoAnual({ cliente, ano, empresa, supabase, clienteId, entidadeId }) {
  const fmt  = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtR = v => 'R$ ' + fmt(v)

  const empresaNome   = empresa?.nome_fantasia || empresa?.nome || ''
  const empresaCnpj   = empresa?.cnpj_cpf || ''
  const empresaCidade = empresa?.cidade || ''
  const empresaEstado = empresa?.estado || ''
  const clienteNome   = cliente?.pessoas?.nome || cliente?.descricao || 'Cliente'
  const hoje          = new Date().toLocaleDateString('pt-BR')

  const MESES_LABEL = [
    'Janeiro','Fevereiro','Marco','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ]

  // Busca todos os lancamentos do ano
  const { data: lancs, error } = await supabase
    .from('servico_lancamento')
    .select('*, tipo_lancamento_servico:tipo_id (codigo, nome_exibicao, ledger, natureza)')
    .eq('entidade_id', entidadeId)
    .eq('cliente_id', clienteId)
    .gte('data_lancamento', ano + '-01-01')
    .lte('data_lancamento', ano + '-12-31')
    .order('data_lancamento')

  if (error) { alert('Erro ao buscar dados: ' + error.message); return }

  // Busca todos os emprestimos ate o final do ano (acumulado)
  const { data: empsAcum } = await supabase
    .from('servico_lancamento')
    .select('*, tipo_lancamento_servico:tipo_id (codigo, natureza)')
    .eq('entidade_id', entidadeId)
    .eq('cliente_id', clienteId)
    .in('tipo_id', [5, 6])
    .lte('data_lancamento', ano + '-12-31')
    .order('data_lancamento')

  // Agrupa por mes_fechamento (ou mes da data_lancamento como fallback)
  const getMes = function(l) {
    var ref = l.mes_fechamento || l.data_lancamento
    return ref ? ref.slice(0, 7) : null
  }

  // Meses que tem lancamentos (exceto emprestimos — ficam no bloco separado)
  var mesesSet = new Set()
  ;(lancs || []).filter(function(l) {
    var cod = l.tipo_lancamento_servico && l.tipo_lancamento_servico.codigo
    return cod !== 'emprestimo' && cod !== 'pagamento_emprestimo'
  }).forEach(function(l) {
    var m = getMes(l)
    if (m) mesesSet.add(m)
  })
  var meses = Array.from(mesesSet).sort()

  // Calcula totais por mes
  var dadosMes = meses.map(function(mesStr) {
    var parts = mesStr.split('-')
    var anoM = parseInt(parts[0])
    var mesM = parseInt(parts[1])
    var lansDoMes = (lancs || []).filter(function(l) { return getMes(l) === mesStr })

    var valMensal = lansDoMes.filter(function(l) {
      var cod = l.tipo_lancamento_servico && l.tipo_lancamento_servico.codigo
      return cod === 'valor_mensal' || cod === 'salario'
    }).reduce(function(s, l) { return s + Number(l.valor_total || 0) }, 0)

    var recMensal = lansDoMes.filter(function(l) {
      var cod = l.tipo_lancamento_servico && l.tipo_lancamento_servico.codigo
      return cod === 'valor_mensal_recebido'
    }).reduce(function(s, l) { return s + Number(l.valor_total || 0) }, 0)

    var materiais = lansDoMes.filter(function(l) {
      var cod = l.tipo_lancamento_servico && l.tipo_lancamento_servico.codigo
      return cod === 'material' && !l.pago_por_cliente
    }).reduce(function(s, l) { return s + Number(l.valor_total || 0) }, 0)

    var recMat = lansDoMes.filter(function(l) {
      var cod = l.tipo_lancamento_servico && l.tipo_lancamento_servico.codigo
      return cod === 'pix' || cod === 'dinheiro'
    }).reduce(function(s, l) { return s + Number(l.valor_total || 0) }, 0)

    var saldoMensal = valMensal - recMensal
    var saldoMat    = materiais - recMat
    var totalMes    = saldoMensal + saldoMat

    return {
      mes: mesStr,
      label: MESES_LABEL[mesM - 1] + '/' + String(anoM).slice(2),
      valMensal: valMensal, recMensal: recMensal, saldoMensal: saldoMensal,
      materiais: materiais, recMat: recMat, saldoMat: saldoMat,
      totalMes: totalMes,
    }
  })

  // Totais gerais
  var totais = dadosMes.reduce(function(acc, m) {
    return {
      valMensal:   acc.valMensal   + m.valMensal,
      recMensal:   acc.recMensal   + m.recMensal,
      saldoMensal: acc.saldoMensal + m.saldoMensal,
      materiais:   acc.materiais   + m.materiais,
      recMat:      acc.recMat      + m.recMat,
      saldoMat:    acc.saldoMat    + m.saldoMat,
      totalMes:    acc.totalMes    + m.totalMes,
    }
  }, { valMensal:0, recMensal:0, saldoMensal:0, materiais:0, recMat:0, saldoMat:0, totalMes:0 })

  // Emprestimo acumulado
  var totalEmprestado = (empsAcum || [])
    .filter(function(l) { return l.tipo_lancamento_servico && l.tipo_lancamento_servico.codigo === 'emprestimo' })
    .reduce(function(s, l) { return s + Number(l.valor_total || 0) }, 0)

  var totalPagoEmp = (empsAcum || [])
    .filter(function(l) { return l.tipo_lancamento_servico && l.tipo_lancamento_servico.codigo === 'pagamento_emprestimo' })
    .reduce(function(s, l) { return s + Number(l.valor_total || 0) }, 0)

  var saldoEmp = totalEmprestado - totalPagoEmp
  var totalGeralReceber = totais.totalMes + saldoEmp

  // Logo
  var logoHtml = empresa && empresa.logo_base64
    ? '<img src="' + empresa.logo_base64 + '" style="max-height:44px;max-width:90px;object-fit:contain" alt="Logo">'
    : '<div style="width:44px;height:44px;background:#1a2744;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#e8a030">' + empresaNome.charAt(0) + '</div>'

  var empDetHtml = ''
  if (empresaCnpj)   empDetHtml += '<div class="emp-det">CNPJ/CPF: ' + empresaCnpj + '</div>'
  if (empresaCidade) empDetHtml += '<div class="emp-det">' + empresaCidade + (empresaEstado ? ' - ' + empresaEstado : '') + '</div>'

  // Linhas da tabela
  var rowsMes = dadosMes.map(function(m) {
    var celSalMensal = m.saldoMensal === 0
      ? '<td style="color:#38a169;font-weight:700">-</td>'
      : '<td class="neu">' + fmt(m.saldoMensal) + '</td>'
    var celSalMat = m.saldoMat === 0
      ? '<td style="color:#38a169;font-weight:700">-</td>'
      : '<td class="neu">' + fmt(m.saldoMat) + '</td>'
    return '<tr>'
      + '<td>' + m.label + '</td>'
      + '<td class="neg">' + fmt(m.valMensal) + '</td>'
      + '<td class="pos">' + (m.recMensal > 0 ? fmt(m.recMensal) : '-') + '</td>'
      + celSalMensal
      + '<td class="neg">' + (m.materiais > 0 ? fmt(m.materiais) : '-') + '</td>'
      + '<td class="pos">' + (m.recMat > 0 ? fmt(m.recMat) : '-') + '</td>'
      + celSalMat
      + '<td class="neu" style="font-weight:700">' + fmt(m.totalMes) + '</td>'
      + '</tr>'
  }).join('')

  var empBlocoHtml = totalEmprestado > 0
    ? '<div style="background:#1a2744;border-radius:10px;padding:10px 16px;margin-top:7mm;display:flex;justify-content:space-between;align-items:center">'
      + '<div style="text-align:center"><div style="font-size:9px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Total de emprestimos</div><div style="font-family:\'DM Mono\',monospace;font-size:14px;font-weight:700;color:#fff">' + fmtR(totalEmprestado) + '</div></div>'
      + '<div style="width:1px;height:40px;background:rgba(255,255,255,.15)"></div>'
      + '<div style="text-align:center"><div style="font-size:9px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Valor pago</div><div style="font-family:\'DM Mono\',monospace;font-size:14px;font-weight:700;color:#6ee7b7">' + fmtR(totalPagoEmp) + '</div></div>'
      + '<div style="width:1px;height:40px;background:rgba(255,255,255,.15)"></div>'
      + '<div style="text-align:center"><div style="font-size:9px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Saldo devedor</div><div style="font-family:\'DM Mono\',monospace;font-size:14px;font-weight:700;color:#e8a030">' + fmtR(saldoEmp) + '</div></div>'
      + '<div style="width:1px;height:40px;background:rgba(255,255,255,.15)"></div>'
      + '<div style="text-align:center"><div style="font-size:9px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Total geral a receber</div><div style="font-family:\'DM Mono\',monospace;font-size:20px;font-weight:700;color:#e8a030">' + fmtR(totalGeralReceber) + '</div></div>'
      + '</div>'
    : ''

  var html = '<!DOCTYPE html>'
    + '<html lang="pt-BR"><head><meta charset="UTF-8">'
    + '<title>Resumo Anual ' + ano + ' - ' + clienteNome + '</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:\'DM Sans\',sans-serif;background:#e8e8e8;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:16px}'
    + '.btn{background:#1a2744;color:#fff;border:none;border-radius:8px;padding:9px 22px;font-size:13px;font-weight:600;cursor:pointer}'
    + '.doc{background:#fff;width:210mm;padding:14mm 16mm;box-shadow:0 4px 20px rgba(0,0,0,.12);border-radius:3px}'
    + '.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:8mm;border-bottom:2px solid #1a2744;margin-bottom:7mm}'
    + '.logo-area{display:flex;align-items:center;gap:12px}'
    + '.emp-nome{font-size:14px;font-weight:700;color:#1a2744}'
    + '.emp-det{font-size:10px;color:#666;margin-top:2px}'
    + '.cli-bloco{background:#f8f7f4;border-radius:8px;padding:7px 14px;margin-bottom:7mm;display:flex;justify-content:space-between;align-items:center}'
    + '.cli-label{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}'
    + '.cli-val{font-size:13px;font-weight:600;color:#1a2744}'
    + '.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:7mm}'
    + '.card{background:#f8f7f4;border-radius:8px;padding:9px 11px;border-left:3px solid #ddd}'
    + '.cl{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px}'
    + '.cv{font-size:14px;font-weight:700;font-family:\'DM Mono\',monospace}'
    + '.sec-titulo{font-size:10px;font-weight:700;color:#1a2744;text-transform:uppercase;letter-spacing:.8px;padding-bottom:3mm;border-bottom:1px solid #ddd;margin-bottom:4mm;display:flex;align-items:center;gap:6px}'
    + '.sec-titulo::before{content:\'\';width:3px;height:14px;background:#1a2744;border-radius:2px}'
    + 'table{width:100%;border-collapse:collapse;font-size:11px}'
    + 'th{font-size:9px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.3px;padding:5px 7px;border-bottom:1.5px solid #ddd;text-align:right}'
    + 'th:first-child{text-align:left}'
    + 'td{padding:7px 7px;border-bottom:1px solid #f0f0f0;font-family:\'DM Mono\',monospace;text-align:right;font-size:11px}'
    + 'td:first-child{font-family:\'DM Sans\',sans-serif;font-weight:600;text-align:left;color:#1a2744}'
    + '.row-total td{background:#1a2744!important;color:#fff;font-weight:700;border-bottom:none}'
    + '.neg{color:#e53e3e}.pos{color:#38a169}.neu{color:#2a6ef5;font-weight:700}'
    + '.rodape{margin-top:8mm;padding-top:4mm;border-top:1px dashed #ddd;display:flex;justify-content:space-between}'
    + '.rodape span{font-size:9px;color:#bbb}.rodape strong{color:#999}'
    + '@media print{body{background:#fff;padding:0}.btn{display:none}.doc{box-shadow:none}tr{page-break-inside:avoid}}'
    + '</style></head><body>'
    + '<button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button>'
    + '<div class="doc">'
    + '<div class="header">'
    + '<div class="logo-area">' + logoHtml + '<div><div class="emp-nome">' + empresaNome + '</div>' + empDetHtml + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:17px;font-weight:700;color:#1a2744">Resumo Anual</div><div style="font-size:11px;color:#888;margin-top:3px">Servico Recorrente - ' + ano + '</div><div style="font-size:10px;color:#aaa;margin-top:3px">Gerado em ' + hoje + '</div></div>'
    + '</div>'
    + '<div class="cli-bloco">'
    + '<div><div class="cli-label">Cliente</div><div class="cli-val">' + clienteNome + '</div></div>'
    + '<div style="text-align:center"><div class="cli-label">Ano</div><div class="cli-val">' + ano + '</div></div>'
    + '<div style="text-align:right"><div class="cli-label">Meses com lancamento</div><div class="cli-val">' + dadosMes.length + ' meses</div></div>'
    + '</div>'
    + '<div class="cards">'
    + '<div class="card" style="border-left-color:#e53e3e"><div class="cl">Total val. mensal</div><div class="cv" style="color:#e53e3e">' + fmtR(totais.valMensal) + '</div></div>'
    + '<div class="card" style="border-left-color:#38a169"><div class="cl">Total rec. mensal</div><div class="cv" style="color:#38a169">' + fmtR(totais.recMensal) + '</div></div>'
    + '<div class="card" style="border-left-color:#e53e3e"><div class="cl">Total materiais</div><div class="cv" style="color:#e53e3e">' + fmtR(totais.materiais) + '</div></div>'
    + '<div class="card" style="border-left-color:#2a6ef5"><div class="cl">Total a receber</div><div class="cv" style="color:#2a6ef5">' + fmtR(totais.totalMes) + '</div></div>'
    + '</div>'
    + '<div class="sec-titulo">Resumo por Mes</div>'
    + '<table><thead><tr>'
    + '<th>Mes</th><th>Val. Mensal</th><th>Rec. Mensal</th><th>Saldo Mensal</th>'
    + '<th>Materiais</th><th>Rec. Mat.</th><th>Saldo Mat.</th><th>Total Mes</th>'
    + '</tr></thead><tbody>'
    + rowsMes
    + '<tr class="row-total">'
    + '<td>TOTAL</td>'
    + '<td>' + fmt(totais.valMensal) + '</td>'
    + '<td>' + fmt(totais.recMensal) + '</td>'
    + '<td>' + fmt(totais.saldoMensal) + '</td>'
    + '<td>' + fmt(totais.materiais) + '</td>'
    + '<td>' + fmt(totais.recMat) + '</td>'
    + '<td>' + fmt(totais.saldoMat) + '</td>'
    + '<td style="color:#e8a030">' + fmt(totais.totalMes) + '</td>'
    + '</tr></tbody></table>'
    + empBlocoHtml
    + '<div class="rodape">'
    + '<span>Gerado por <strong>GestaoFam</strong> - Servico Recorrente</span>'
    + '<span>' + clienteNome + ' - Resumo ' + ano + '</span>'
    + '<span><strong>' + empresaNome + '</strong></span>'
    + '</div></div></body></html>'

  var win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) { alert('Permita pop-ups para gerar o relatorio.'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
}
