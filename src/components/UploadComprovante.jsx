/**
 * UploadComprovante
 * Componente reutilizável para upload de foto/comprovante para o Supabase Storage.
 *
 * Setup necessário (uma vez só):
 *   1. Supabase → Storage → New bucket → nome: "comprovantes" → Public: ON
 *   2. Supabase → Storage → Policies → comprovantes:
 *      INSERT: authenticated  (ou anon se quiser aberto)
 *      SELECT: public
 *
 * Uso:
 *   <UploadComprovante
 *     value={formLanc.imagem_url}
 *     onChange={url => fl('imagem_url', url)}
 *     pasta="obras"          // subpasta dentro do bucket (opcional)
 *   />
 *
 * Quando migrar para self-hosted: só muda VITE_SUPABASE_URL no .env.
 * O código não muda nada.
 */

import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Camera, Upload, X, Loader, CheckCircle, AlertCircle } from 'lucide-react'

const BUCKET = 'comprovantes'
const MAX_MB  = 5

export default function UploadComprovante({ value, onChange, pasta = 'geral', label = 'Comprovante (foto)' }) {
  const [uploading, setUploading] = useState(false)
  const [erro, setErro]           = useState('')
  const inputRef = useRef()

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setErro('')

    // Valida tipo
    if (!file.type.startsWith('image/')) {
      setErro('Apenas imagens são aceitas (JPG, PNG, WEBP...)')
      return
    }

    // Valida tamanho
    if (file.size > MAX_MB * 1024 * 1024) {
      setErro(`Tamanho máximo: ${MAX_MB}MB`)
      return
    }

    setUploading(true)
    try {
      // Nome único: pasta/timestamp-nomerandom.ext
      const ext  = file.name.split('.').pop()
      const nome = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(nome, file, { cacheControl: '3600', upsert: false })

      if (upErr) { setErro(upErr.message); return }

      // Monta URL pública
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome)
      onChange(data.publicUrl)
    } catch (e) {
      setErro('Erro inesperado: ' + e.message)
    } finally {
      setUploading(false)
      // Limpa o input para permitir selecionar o mesmo arquivo novamente
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remover() {
    onChange('')
    setErro('')
    // Não deleta do Storage para manter histórico — o arquivo fica órfão mas preservado
  }

  return (
    <div>
      <label style={{
        fontSize: 11, color: 'var(--text3)', fontWeight: 600,
        display: 'block', marginBottom: 6,
        textTransform: 'uppercase', letterSpacing: '.5px'
      }}>
        {label}
      </label>

      {/* Área principal */}
      {value ? (
        // Preview da imagem já carregada
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={value}
            alt="Comprovante"
            style={{
              maxHeight: 140, maxWidth: '100%', borderRadius: 8,
              border: '1px solid var(--border)', objectFit: 'cover',
              display: 'block'
            }}
          />
          {/* Botão remover */}
          <button
            type="button"
            onClick={remover}
            title="Remover imagem"
            style={{
              position: 'absolute', top: -8, right: -8,
              width: 24, height: 24, borderRadius: '50%',
              background: 'var(--red)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,.2)'
            }}>
            <X size={12} />
          </button>
          {/* Troca */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              marginTop: 6, display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: 'var(--accent)', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0
            }}>
            <Camera size={12} /> Trocar foto
          </button>
        </div>
      ) : (
        // Zona de upload
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            width: '100%', padding: '14px 16px',
            border: `2px dashed ${erro ? 'var(--red)' : 'var(--border)'}`,
            borderRadius: 10, background: 'var(--bg3)',
            cursor: uploading ? 'default' : 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            color: 'var(--text3)', transition: 'border-color .15s',
          }}
          onMouseEnter={e => { if (!uploading) e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = erro ? 'var(--red)' : 'var(--border)' }}
        >
          {uploading
            ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
            : <Upload size={20} />
          }
          <span style={{ fontSize: 12, fontWeight: 500 }}>
            {uploading ? 'Enviando...' : 'Clique para selecionar ou tirar foto'}
          </span>
          <span style={{ fontSize: 10 }}>JPG, PNG, WEBP — máx. {MAX_MB}MB</span>
        </button>
      )}

      {/* Mensagem de erro */}
      {erro && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--red)' }}>
          <AlertCircle size={12} /> {erro}
        </div>
      )}

      {/* Input file oculto — aceita câmera no mobile */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
