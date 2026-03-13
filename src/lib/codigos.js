import { supabase } from './supabase'

// Gera código sequencial automático: 001, 002, 003...
export async function gerarCodigo(tabela, campo = 'codigo') {
  const { data, error } = await supabase
    .from(tabela)
    .select(campo)
    .order(campo, { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return '001'

  const ultimo = data[0][campo]
  const num = parseInt(ultimo.replace(/\D/g, ''), 10)
  if (isNaN(num)) return '001'
  return String(num + 1).padStart(3, '0')
}
