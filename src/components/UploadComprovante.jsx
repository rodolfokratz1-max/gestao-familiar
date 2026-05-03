/**
 * UploadComprovante
 * Upload de até maxFotos imagens para o Supabase Storage bucket "comprovantes".
 *
 * Setup (uma vez só no Supabase):
 *   Storage → New bucket → nome: "comprovantes" → Public: ON
 *   Storage → Policies → comprovantes → INSERT: authenticated → true
 *
 * Props:
 *   value    : string[]   — array de URLs atual
 *   onChange : (string[]) => void
 *   pasta    : string     — subpasta dentro do bucket (ex: "obras")
 *   maxFotos : number     — máximo de fotos (padrão 5)
 *   label    : string
 */

import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Camera, Upload, X, Loader, AlertCircle, Image } from 'lucide-react'

const BUCKET  = 'comprovantes'
const MAX_MB  = 5

export default function UploadComprovante({
  value    = [],
  onChange,
  pasta    = 'geral',
  maxFotos = 5,
  label    = 'Comprovantes / Fotos',
}) {
  const [uploading, setUploading] = useState(false)
  const [erro, setErro]           = useState('')
  const [preview, setPreview]     = useState(null)   // URL para lightbox inline
  const inputRef    = useRef()  // galeria (multiple)
  const cameraRef   = useRef()  // câmera direta (capture)

  // Garante que value seja sempre array
  const fotos = Array.isArray(value) ? value : (value ? [value] : [])
  const podeAdicionar = fotos.length < maxFotos

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    setErro('')

    // Valida quantas ainda cabem
    const vagasRestantes = maxFotos - fotos.length
    const filesToUpload  = files.slice(0, vagasRestantes)

    if (files.length > vagasRestantes) {
      setErro(`Limite de ${maxFotos} fotos. Apenas ${vagasRestantes} foram enviadas.`)
    }

    // Valida cada arquivo
    for (const file of filesToUpload) {
      if (!file.type.startsWith('image/')) {
        setErro('Apenas imagens são aceitas (JPG, PNG, WEBP...)')
        return
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setErro(`Tamanho máximo por foto: ${MAX_MB}MB`)
        return
      }
    }

    setUploading(true)
    try {
      const novasUrls = []
      for (const file of filesToUpload) {
        const ext  = file.name.split('.').pop()
        const nome = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(nome, file, { cacheControl: '3600', upsert: false })
        if (upErr) { setErro(upErr.message); break }
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome)
        novasUrls.push(data.publicUrl)
      }
      if (novasUrls.length > 0) {
        onChange([...fotos, ...novasUrls])
      }
    } catch (e) {
      setErro('Erro inesperado: ' + e.message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remover(idx) {
    const novas = fotos.filter((_, i) => i !== idx)
    onChange(novas)
    if (preview === fotos[idx]) setPreview(null)
  }

  return (
    <div>
      <label style={{
        fontSize: 11, color: 'var(--text3)', fontWeight: 600,
        display: 'block', marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '.5px'
      }}>
        {label}
        <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none' }}>
          ({fotos.length}/{maxFotos})
        </span>
      </label>

      {/* Grid de fotos existentes */}
      {fotos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {fotos.map((url, idx) => (
            <div key={idx} style={{ position: 'relative' }}>
              <img
                src={url}
                alt={`Foto ${idx + 1}`}
                onClick={() => setPreview(url)}
                style={{
                  width: 80, height: 80, objectFit: 'cover',
                  borderRadius: 8, border: '1px solid var(--border)',
                  cursor: 'pointer', display: 'block',
                  transition: 'opacity .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              />
              {/* Botão remover */}
              <button
                type="button"
                onClick={() => remover(idx)}
                title="Remover"
                style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--red)', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#fff',
                }}>
                <X size={10} />
              </button>
              {/* Número */}
              <div style={{
                position: 'absolute', bottom: 3, left: 3,
                fontSize: 9, fontWeight: 700, color: '#fff',
                background: 'rgba(0,0,0,.5)', borderRadius: 3, padding: '1px 4px',
              }}>{idx + 1}</div>
            </div>
          ))}

          {/* Slots para adicionar — câmera e galeria separados */}
          {podeAdicionar && !uploading && (
            <>
              {/* Câmera direta */}
              <button type="button" onClick={() => cameraRef.current?.click()}
                title="Tirar foto"
                style={{
                  width: 80, height: 80, borderRadius: 8,
                  border: '2px dashed var(--border)', background: 'var(--bg3)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 4, cursor: 'pointer',
                  color: 'var(--accent)', fontSize: 10, transition: 'border-color .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <Camera size={18} />
                <span>Câmera</span>
              </button>
              {/* Galeria */}
              <button type="button" onClick={() => inputRef.current?.click()}
                title="Escolher da galeria"
                style={{
                  width: 80, height: 80, borderRadius: 8,
                  border: '2px dashed var(--border)', background: 'var(--bg3)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 4, cursor: 'pointer',
                  color: 'var(--text3)', fontSize: 10, transition: 'border-color .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <Upload size={16} />
                <span>Galeria</span>
              </button>
            </>
          )}

          {/* Spinner dentro do grid durante upload */}
          {uploading && (
            <div style={{
              width: 80, height: 80, borderRadius: 8,
              background: 'var(--bg3)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
            </div>
          )}
        </div>
      )}

      {/* Zona de upload inicial (quando não há fotos) */}
      {fotos.length === 0 && (
        uploading
          ? <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
              <Loader size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
            </div>
          : <div style={{ display: 'flex', gap: 10 }}>
              {/* Câmera — input sem multiple, com capture */}
              <button type="button" onClick={() => cameraRef.current?.click()}
                style={{
                  flex: 1, padding: '14px 10px',
                  border: `2px dashed ${erro ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: 10, background: 'var(--bg3)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  color: 'var(--accent)', transition: 'border-color .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = erro ? 'var(--red)' : 'var(--border)'}
              >
                <Camera size={22} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Tirar Foto</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>Abre a câmera</span>
              </button>
              {/* Galeria — input multiple */}
              <button type="button" onClick={() => inputRef.current?.click()}
                style={{
                  flex: 1, padding: '14px 10px',
                  border: `2px dashed ${erro ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: 10, background: 'var(--bg3)', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  color: 'var(--text3)', transition: 'border-color .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = erro ? 'var(--red)' : 'var(--border)'}
              >
                <Upload size={22} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Da Galeria</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>JPG, PNG, WEBP · {MAX_MB}MB máx.</span>
              </button>
            </div>
      )}

      {/* Mensagem de erro */}
      {erro && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--red)' }}>
          <AlertCircle size={12} /> {erro}
        </div>
      )}

      {/* Input galeria — múltiplo, sem capture */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
      />
      {/* Input câmera — sem multiple, com capture (os dois juntos são incompatíveis no mobile) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFiles}
        style={{ display: 'none' }}
      />

      {/* Lightbox inline */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <button onClick={() => setPreview(null)}
              style={{
                position: 'absolute', top: -12, right: -12, zIndex: 1,
                width: 30, height: 30, borderRadius: '50%',
                background: 'var(--bg2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}>
              <X size={14} />
            </button>
            <img src={preview} alt="Preview"
              style={{ maxWidth: '85vw', maxHeight: '85vh', borderRadius: 10, objectFit: 'contain' }} />
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
