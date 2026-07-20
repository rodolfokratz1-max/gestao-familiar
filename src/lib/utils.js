export function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

export function fmtDate(date) {
  if (!date) return '—'
  return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// Formata um objeto Date como YYYY-MM-DD no fuso de Brasília
// (evita o bug do toISOString() que usa UTC e vira o dia após as 21h)
export function toYMD(date) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}
