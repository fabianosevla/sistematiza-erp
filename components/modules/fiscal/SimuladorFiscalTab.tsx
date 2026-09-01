'use client'
// components/modules/fiscal/SimuladorFiscalTab.tsx
//
// "Escolhendo estes parâmetros, qual código a nota vai sair?" — sem emitir
// nada, só consulta. Venda pergunta o produto (o CFOP muda por produto, por
// causa da ST); as outras operações perguntam só o tipo e o estado.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'

interface Props { tenantSlug: string }

const TIPO_VENDA = 'Venda'

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

function Linha({ label, valor }: { label: string; valor: any }) {
  if (valor === undefined || valor === null || valor === '') return null
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 font-mono">{String(valor)}</span>
    </div>
  )
}

export default function SimuladorFiscalTab({ tenantSlug }: Props) {
  const [tipoOperacao, setTipoOperacao] = useState('')
  const [ufDestino, setUfDestino]       = useState('')
  const [produtoId, setProdutoId]       = useState('')
  const [destinatario, setDestinatario] = useState<'contribuinte' | 'consumidor_final'>('consumidor_final')

  const { data: regrasRaw } = useQuery({
    queryKey: ['cfop-regras', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fiscal/cfop-regras`)).json(),
  })
  const tiposOutros: string[] = Array.from(
    new Set((regrasRaw?.data?.regras ?? []).map((r: any) => r.tipoOperacao))
  )

  const { data: produtosRaw } = useQuery({
    queryKey: ['fiscal-simulador-produtos', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=500`)).json(),
    enabled:  tipoOperacao === TIPO_VENDA,
  })
  const produtos: any[] = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data
    : Array.isArray(produtosRaw?.data) ? produtosRaw.data : []

  const prontoPraSimular = tipoOperacao && ufDestino && (tipoOperacao !== TIPO_VENDA || produtoId)

  const { data: resultRaw, isFetching } = useQuery({
    queryKey: ['fiscal-simulador', tenantSlug, tipoOperacao, ufDestino, produtoId, destinatario],
    queryFn:  async () => {
      const p = new URLSearchParams({ tipoOperacao, ufDestino })
      if (tipoOperacao === TIPO_VENDA) { p.set('produtoId', produtoId); p.set('destinatario', destinatario) }
      return (await fetch(`/api/${tenantSlug}/fiscal/simulador?${p}`)).json()
    },
    enabled: !!prontoPraSimular,
  })
  const r = resultRaw?.data

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
        Só consulta — não emite nada, não grava nota.
        <InfoTip titulo="Como funciona">
          Venda resolve pelo perfil tributário do produto escolhido. As demais operações
          (devolução, bonificação, transferência...) resolvem pela lista em "Outras operações (CFOP)".
        </InfoTip>
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Tipo de operação</Label>
            <select value={tipoOperacao} onChange={e => { setTipoOperacao(e.target.value); setProdutoId('') }}
              className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
              <option value="">Selecionar...</option>
              <option value={TIPO_VENDA}>Venda</option>
              {tiposOutros.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>Estado de destino</Label>
            <select value={ufDestino} onChange={e => setUfDestino(e.target.value)}
              className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
              <option value="">Selecionar...</option>
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>

        {tipoOperacao === TIPO_VENDA && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Produto</Label>
              <select value={produtoId} onChange={e => setProdutoId(e.target.value)}
                className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="">Selecionar...</option>
                {produtos.map((p: any) => <option key={p.produtoId} value={p.produtoId}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Destinatário</Label>
              <select value={destinatario} onChange={e => setDestinatario(e.target.value as any)}
                className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="consumidor_final">Consumidor final</option>
                <option value="contribuinte">Contribuinte (revenda)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {prontoPraSimular && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 max-w-2xl">
          {isFetching ? (
            <p className="text-sm text-gray-400 inline-flex items-center gap-1.5"><Search size={13} /> Calculando...</p>
          ) : r?.faltaPerfil || r?.faltaRegra ? (
            <p className="text-sm text-amber-700">{r.faltaPerfil || r.faltaRegra}</p>
          ) : r ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {r.mesmoEstado ? 'Dentro do estado' : 'Fora do estado'}
                </span>
                <span className="text-2xl font-bold text-green-700 font-mono">{r.cfop || '—'}</span>
              </div>
              {r.tipoOperacao === TIPO_VENDA ? (
                <>
                  <Linha label="Produto" valor={r.produtoNome} />
                  <Linha label="Perfil tributário" valor={r.perfilNome} />
                  <Linha label="NCM" valor={r.ncm} />
                  <Linha label={r.regimeLabel} valor={r.csosnOuCst} />
                  <Linha label="Alíquota ICMS" valor={r.aliqIcms ? `${r.aliqIcms}%` : null} />
                  {r.temSt && <>
                    <Linha label="MVA (ST)" valor={r.mva ? `${r.mva}%` : null} />
                    <Linha label="Alíquota ICMS-ST" valor={r.aliqIcmsSt ? `${r.aliqIcmsSt}%` : null} />
                  </>}
                  <Linha label="CST PIS" valor={r.cstPis} />
                  <Linha label="CST COFINS" valor={r.cstCofins} />
                  {r.cstIpi && <Linha label="CST IPI" valor={r.cstIpi} />}
                </>
              ) : (
                <>
                  <Linha label="Direção" valor={r.direcao === 'entrada' ? 'Entrada' : 'Saída'} />
                  {r.observacao && <Linha label="Observação" valor={r.observacao} />}
                  <p className="text-xs text-gray-400 mt-2">
                    CSOSN/CST desta operação normalmente segue o documento original (ex.: devolução repete a
                    tributação da venda que originou). Confirme com o contador antes de usar numa emissão real.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
