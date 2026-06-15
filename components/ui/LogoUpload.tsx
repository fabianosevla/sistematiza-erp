'use client'
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, X, Image } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string }

export function LogoUpload({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const inputRef  = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['logo', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/logo`)).json(),
  })

  const salvarMut = useMutation({
    mutationFn: (logo: string | null) => fetch(`/api/${tenantSlug}/logo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo }),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['logo', tenantSlug] }); toast('Logo salvo!') },
    onError:   () => toast('Erro ao salvar logo.', 'error'),
  })

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) { toast('Imagem muito grande. Máximo 500KB.', 'error'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setPreview(base64)
      salvarMut.mutate(base64)
    }
    reader.readAsDataURL(file)
  }

  const logoAtual = preview ?? data?.data?.logo ?? null

  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Logo da Empresa</p>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
          {logoAtual
            ? <img src={logoAtual} alt="Logo" className="w-full h-full object-contain" />
            : <Image size={24} className="text-gray-300" />
          }
        </div>
        <div className="space-y-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleFile} className="hidden" />
          <button onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            <Upload size={14} /> {logoAtual ? 'Trocar logo' : 'Fazer upload'}
          </button>
          {logoAtual && (
            <button onClick={() => { setPreview(null); salvarMut.mutate(null) }}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <X size={14} /> Remover logo
            </button>
          )}
          <p className="text-xs text-gray-400">PNG, JPG ou SVG · Máx. 500KB</p>
        </div>
      </div>
    </div>
  )
}