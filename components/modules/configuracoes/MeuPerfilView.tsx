'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'

/**
 * components/modules/configuracoes/MeuPerfilView.tsx
 *
 * Era a seção "Meu perfil" do acordeão único de Configurações; virou página
 * própria (/[tenant]/configuracoes/meu-perfil). A foto grava no Clerk, não
 * no nosso banco — sem coluna nova, sem rota nova, sem Salvar: some/aparece
 * assim que escolhida.
 */

interface Props { tenantSlug: string }

export default function MeuPerfilView({ tenantSlug }: Props) {
  const { toast } = useToast()
  const { user }  = useUser()
  const [enviandoFoto, setEnviandoFoto] = useState(false)

  const { data: meuAcesso } = useQuery({
    queryKey: ['meu-acesso', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/perfis/meu-acesso`)).json(),
    staleTime: 60000,
  })
  const nomeUsuarioLogado =
    String(meuAcesso?.data?.nome ?? '').trim() ||
    user?.fullName?.trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    'Usuário'
  const iniciaisUsuario = nomeUsuarioLogado
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase()
  const fotoAtual = user?.hasImage ? user.imageUrl : ''

  async function enviarFoto(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast('Imagem acima de 5 MB. Escolha uma menor.', 'error')
      return
    }
    setEnviandoFoto(true)
    try {
      await user?.setProfileImage({ file })
      await user?.reload()
      toast('Foto atualizada!')
    } catch (e: any) {
      toast(e?.errors?.[0]?.message ?? 'Não foi possível enviar a foto.', 'error')
    } finally {
      setEnviandoFoto(false)
    }
  }

  async function removerFoto() {
    setEnviandoFoto(true)
    try {
      await user?.setProfileImage({ file: null })
      await user?.reload()
      toast('Foto removida.')
    } catch {
      toast('Não foi possível remover a foto.', 'error')
    } finally {
      setEnviandoFoto(false)
    }
  }

  return (
    <div>
      <PageHeader titulo="Meu perfil" />
      <div className="max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-4">
          {fotoAtual ? (
            <img src={fotoAtual} alt="" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center text-base font-bold text-green-700">
              {iniciaisUsuario}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{nomeUsuarioLogado}</p>
            <p className="text-xs text-gray-400 truncate">{user?.primaryEmailAddress?.emailAddress}</p>
            <div className="flex items-center gap-2 mt-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) enviarFoto(f)
                    e.target.value = ''
                  }}
                />
                <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
                  <Upload size={13} />
                  {enviandoFoto ? 'Enviando...' : fotoAtual ? 'Trocar foto' : 'Escolher foto'}
                </span>
              </label>
              {fotoAtual && (
                <Button variant="outline" size="sm" onClick={removerFoto} disabled={enviandoFoto}>
                  Remover
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
