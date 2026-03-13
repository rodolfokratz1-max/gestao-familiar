import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY

// Cliente normal (para uso geral)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Cliente admin (para criar/gerenciar usuários — usa service role)
// Só funciona se VITE_SUPABASE_SERVICE_KEY estiver configurado no .env
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null
