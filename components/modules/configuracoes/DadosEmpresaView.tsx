'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'

/**
 * components/modules/configuracoes/DadosEmpresaView.tsx
 *
 * Uma das abas de Configurações (`ConfiguracoesView.tsx`), com upload de
 * logo. Mesmos campos, mesma mutation, mesmo tratamento de logo pendente.
 */

interface Props { tenantSlug: string }

const CAMPOS = [
  'nomeEmpresa', 'nomeFantasia', 'cnpj', 'inscricaoEstadual', 'inscricaoMunicipal',
  'telefone', 'email', 'cep', 'endereco', 'numero', 'complemento', 'bairro',
  'cidade', 'uf', 'mensagemCupom',
] as const

export default function DadosEmpresaView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [empresa, setEmpresa]   = useState<Record<string, string>>({})
  const [tocados, setTocados]   = useState<Set<string>>(new Set())
  // logoPendente: undefined = sem alteração · null = remover · string = nova
  const [logoPendente, setLogoPendente] = useState<string | null | undefined>(undefined)
  const [logoPreview, setLogoPreview]   = useState<string | null>(null)
  const empresaTocada = tocados.size > 0
  const pendente = empresaTocada || logoPendente !== undefined

  const { data: configApiRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
  })
  const configApi = configApiRaw?.data

  useEffect(() => {
    if (!configApi) return
    if (!empresaTocada) {
      const carregado: Record<string, string> = {}
      for (const c of CAMPOS) carregado[c] = configApi[c] ?? ''
      setEmpresa(carregado)
    }
    if (logoPendente === undefined) setLogoPreview(configApi.logoBase64 ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configApi])

  const setEmp = (k: string, v: string) => {
    setTocados(prev => new Set(prev).add(k))
    setEmpresa(p => ({ ...p, [k]: v }))
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string
      setLogoPreview(base64)
      setLogoPendente(base64)
    }
    reader.readAsDataURL(file)
  }

  const salvarMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {}
      for (const c of CAMPOS) body[c] = empresa[c]
      if (logoPendente !== undefined) body.logoBase64 = logoPendente
      const res = await fetch(`/api/${tenantSlug}/configuracoes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracoes', tenantSlug] })
      setTocados(new Set())
      setLogoPendente(undefined)
      toast('Dados da empresa salvos!')
    },
    onError: () => toast('Erro ao salvar os dados da empresa.', 'error'),
  })

  return (
    <div>
      <div className="max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Razão social</Label>
              <Input value={empresa.nomeEmpresa ?? ''} onChange={e => setEmp('nomeEmpresa', e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="Nome registrado" />
            </div>
            <div>
              <Label className="text-xs">Nome fantasia</Label>
              <Input value={empresa.nomeFantasia ?? ''} onChange={e => setEmp('nomeFantasia', e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="Nome conhecido" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">CNPJ</Label>
              <Input value={empresa.cnpj ?? ''} onChange={e => setEmp('cnpj', e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <Label className="text-xs">Inscrição estadual</Label>
              <Input value={empresa.inscricaoEstadual ?? ''} onChange={e => setEmp('inscricaoEstadual', e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="Isento, se não tiver" />
            </div>
            <div>
              <Label className="text-xs">Inscrição municipal</Label>
              <Input value={empresa.inscricaoMunicipal ?? ''} onChange={e => setEmp('inscricaoMunicipal', e.target.value)}
                className="mt-1 h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={empresa.telefone ?? ''} onChange={e => setEmp('telefone', e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="(00) 0000-0000" />
            </div>
            <div>
              <Label className="text-xs">E-mail</Label>
              <Input type="email" value={empresa.email ?? ''} onChange={e => setEmp('email', e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="contato@empresa.com" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">CEP</Label>
              <Input value={empresa.cep ?? ''} onChange={e => setEmp('cep', e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="00000-000" />
            </div>
            <div className="col-span-3">
              <Label className="text-xs">Endereço</Label>
              <Input value={empresa.endereco ?? ''} onChange={e => setEmp('endereco', e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="Rua, avenida…" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Número</Label>
              <Input value={empresa.numero ?? ''} onChange={e => setEmp('numero', e.target.value)}
                className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Complemento</Label>
              <Input value={empresa.complemento ?? ''} onChange={e => setEmp('complemento', e.target.value)}
                className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Bairro</Label>
              <Input value={empresa.bairro ?? ''} onChange={e => setEmp('bairro', e.target.value)}
                className="mt-1 h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <Label className="text-xs">Cidade</Label>
              <Input value={empresa.cidade ?? ''} onChange={e => setEmp('cidade', e.target.value)}
                className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">UF</Label>
              <Input maxLength={2} value={empresa.uf ?? ''} onChange={e => setEmp('uf', e.target.value.toUpperCase())}
                className="mt-1 h-9 text-sm" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Mensagem do cupom</Label>
            <Input value={empresa.mensagemCupom ?? ''} onChange={e => setEmp('mensagemCupom', e.target.value)}
              className="mt-1 h-9 text-sm" placeholder="Obrigado pela preferência!" />
          </div>

          <div className="pt-2 border-t border-gray-50">
            <Label className="text-xs">Logo</Label>
            <div className="flex items-center gap-4 mt-1">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="h-12 w-auto object-contain rounded-lg border border-gray-100 p-1" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Upload size={16} className="text-gray-400" />
                </div>
              )}
              <label className="cursor-pointer">
                <span className="text-sm text-gray-600 hover:text-gray-800 font-medium">
                  {logoPreview ? 'Trocar logo' : 'Enviar logo'}
                </span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              {logoPreview && (
                <button
                  onClick={() => { setLogoPreview(null); setLogoPendente(null) }}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Remover
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-gray-50">
          <Button size="sm" onClick={() => salvarMut.mutate()} disabled={!pendente || salvarMut.isPending}>
            {salvarMut.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
