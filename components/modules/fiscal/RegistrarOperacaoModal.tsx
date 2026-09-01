'use client'
// components/modules/fiscal/RegistrarOperacaoModal.tsx
//
// Registra uma operação que NÃO é venda — devolução, transferência,
// bonificação, remessa pra industrialização/conserto, consignação, compra
// de uso/consumo ou de ativo. CFOP e CSOSN/CST vêm da regra escolhida em
// "Outras operações (CFOP)", não do perfil tributário do produto — mesmo
// padrão de NovaNotaModal.tsx, só que resolvendo por regra em vez de perfil.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SidePanel } from '@/components/ui/SidePanel'
import { InfoTip } from '@/components/ui/InfoTip'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props { tenantSlug: string; onClose: () => void }

interface ItemOperacao {
  _key: string
  produtoId?: number
  descricao: string
  quantidade: number
  precoUnitario: string
}

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

export default function RegistrarOperacaoModal({ tenantSlug, onClose }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [tipoOperacao, setTipoOperacao] = useState('')
  const [ufDestino, setUfDestino]       = useState('')
  const [razaoSocial, setRazaoSocial]   = useState('')
  const [cnpjCpf, setCnpjCpf]           = useState('')
  const [observacao, setObservacao]     = useState('')
  const [buscaProduto, setBuscaProduto] = useState('')
  const [itens, setItens]               = useState<ItemOperacao[]>([])

  const { data: regrasRaw } = useQuery({
    queryKey: ['cfop-regras', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fiscal/cfop-regras`)).json(),
  })
  const regras: any[] = regrasRaw?.data?.regras ?? []
  const tipos = Array.from(new Set(regras.map((r: any) => r.tipoOperacao)))

  const { data: produtosRaw } = useQuery({
    queryKey: ['fiscal-operacao-produtos', tenantSlug, buscaProduto],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?search=${encodeURIComponent(buscaProduto)}&limit=8`)).json(),
    enabled:  buscaProduto.length > 0,
  })
  const produtos = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data : Array.isArray(produtosRaw?.data) ? produtosRaw.data : []

  function addProduto(p: any) {
    setItens(prev => [...prev, {
      _key: Math.random().toString(36).slice(2),
      produtoId: p.produtoId, descricao: p.nome, quantidade: 1,
      precoUnitario: p.precoVarejo ? (p.precoVarejo / 100).toFixed(2) : '0.00',
    }])
    setBuscaProduto('')
  }

  const valorTotal = itens.reduce((a, i) => a + i.quantidade * Math.round(parseFloat(i.precoUnitario.replace(',', '.') || '0') * 100), 0)

  // Resolve a regra específica (interno x interestadual) comparando o UF
  // escolhido — mesma lógica do simulador, só que aqui decide de fato qual
  // linha de t_cfop_regra vai gerar a nota.
  const regraResolvida = tipoOperacao && ufDestino
    ? regras.find((r: any) => r.tipoOperacao === tipoOperacao) // localizacao real resolvida no servidor via UF; aqui só valida presença
    : null
  const semCsosn = regraResolvida && !regraResolvida.csosnSugerido && !regraResolvida.cstSugerido

  const criarMut = useMutation({
    mutationFn: async () => {
      // O servidor decide interno/interestadual comparando ufDestino com o UF
      // da empresa — por isso manda o tipo + UF, não um cfopRegraId fixo.
      const candidatas = regras.filter((r: any) => r.tipoOperacao === tipoOperacao)
      const res0 = await fetch(`/api/${tenantSlug}/configuracoes`)
      const cfg0 = await res0.json()
      const ufEmpresa = String(cfg0?.data?.uf ?? '').toUpperCase()
      const mesmoEstado = !!ufEmpresa && ufEmpresa === ufDestino.toUpperCase()
      const regra = candidatas.find((r: any) => r.localizacao === (mesmoEstado ? 'interno' : 'interestadual'))
      if (!regra) throw new Error(`Não existe regra cadastrada para "${tipoOperacao}" ${mesmoEstado ? 'dentro' : 'fora'} do estado.`)

      const res = await fetch(`/api/${tenantSlug}/fiscal?action=criar-operacao`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cfopRegraId: regra.cfopRegraId,
          uf: ufDestino || undefined,
          razaoSocial: razaoSocial || undefined,
          cnpjCpf: cnpjCpf || undefined,
          observacao: observacao || undefined,
          itens: itens.map(i => ({
            produtoId: i.produtoId, descricao: i.descricao, quantidade: i.quantidade,
            precoUnitario: Math.round(parseFloat(i.precoUnitario.replace(',', '.') || '0') * 100),
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas', tenantSlug] })
      toast('Operação registrada como nota pendente — emita quando estiver pronta.')
      onClose()
    },
    onError: (e: any) => toast(e.message || 'Erro ao registrar operação.', 'error'),
  })

  return (
    <SidePanel
      titulo="Registrar operação fiscal"
      onClose={onClose}
      largura="w-[30vw] min-w-[520px]"
      rodape={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => criarMut.mutate()} disabled={!tipoOperacao || !ufDestino || itens.length === 0 || criarMut.isPending}>
            {criarMut.isPending ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Registrando...</> : 'Registrar (nota pendente)'}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <p className="text-xs text-gray-500 inline-flex items-center gap-1">
          Devolução, transferência, bonificação e afins — não é venda.
          <InfoTip titulo="Como funciona">
            CFOP e CSOSN/CST vêm da regra cadastrada em "Outras operações (CFOP)" pro tipo e estado
            escolhidos — não dependem do perfil tributário do produto. A nota nasce pendente,
            emite depois na lista normal.
          </InfoTip>
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tipo de operação *</Label>
            <select value={tipoOperacao} onChange={e => setTipoOperacao(e.target.value)}
              className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
              <option value="">Selecionar...</option>
              {tipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>Estado de destino *</Label>
            <select value={ufDestino} onChange={e => setUfDestino(e.target.value)}
              className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
              <option value="">Selecionar...</option>
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>

        {semCsosn && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            Essa regra ainda não tem CSOSN/CST sugerido cadastrado — a nota vai nascer sem esse campo
            e a emissão vai recusar até alguém preencher em "Outras operações (CFOP)".
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Label>Destinatário</Label><Input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} className="mt-1" placeholder="Razão social (opcional)" /></div>
          <div><Label>CNPJ/CPF</Label><Input value={cnpjCpf} onChange={e => setCnpjCpf(e.target.value)} className="mt-1" placeholder="Opcional" /></div>
        </div>

        <div>
          <Label>Observação</Label>
          <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1" placeholder="Opcional" />
        </div>

        <div>
          <Label>Adicionar produto</Label>
          <Input value={buscaProduto} onChange={e => setBuscaProduto(e.target.value)} className="mt-1" placeholder="Buscar produto..." />
          {buscaProduto && produtos.length > 0 && (
            <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden">
              {produtos.map((p: any) => (
                <button key={p.produtoId} onClick={() => addProduto(p)} className="w-full flex justify-between px-3 py-2 hover:bg-gray-50 text-left text-sm">
                  <span>{p.nome}</span>
                  <span className="text-gray-400">{p.precoVarejo ? fmt(p.precoVarejo) : '—'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {itens.length > 0 && (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            {itens.map(item => (
              <div key={item._key} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm flex-1 truncate">{item.descricao}</span>
                <Input type="number" min="1" value={item.quantidade}
                  onChange={e => setItens(prev => prev.map(i => i._key === item._key ? { ...i, quantidade: Math.max(1, Number(e.target.value)) } : i))}
                  className="w-16 h-8 text-sm" />
                <Input type="number" min="0" step="0.01" value={item.precoUnitario}
                  onChange={e => setItens(prev => prev.map(i => i._key === item._key ? { ...i, precoUnitario: e.target.value } : i))}
                  className="w-24 h-8 text-sm" />
                <button onClick={() => setItens(prev => prev.filter(i => i._key !== item._key))} className="text-gray-300 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 bg-gray-50">
              <span className="text-xs text-gray-500">Total</span>
              <span className="text-sm font-bold text-gray-900">{fmt(valorTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  )
}
