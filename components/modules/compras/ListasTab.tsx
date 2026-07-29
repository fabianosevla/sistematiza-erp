'use client'
// components/modules/compras/ListasTab.tsx

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Scale, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/Toast'
import { InfoTip } from '@/components/ui/InfoTip'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { fmtData as fmtDate } from '@/lib/format'

interface Props {
  tenantSlug:       string
  onIniciarCotacao: (listaId: number) => void
}

const ORIGEM_CFG: Record<string, string> = { mrp: 'MRP', manual: 'Manual', requisicao: 'Requisição' }
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  aberta:     { label: 'Aberta',      cls: 'bg-blue-100 text-blue-700' },
  em_cotacao: { label: 'Em cotação',  cls: 'bg-amber-100 text-amber-700' },
  finalizada: { label: 'Finalizada',  cls: 'bg-green-100 text-green-700' },
  cancelada:  { label: 'Cancelada',   cls: 'bg-gray-100 text-gray-500' },
}


export default function ListasTab({ tenantSlug, onIniciarCotacao }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/compras/listas`

  const [filtroStatus, setFiltroStatus] = useState('aberta')
  const [expandida, setExpandida]       = useState<number | null>(null)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['compras-listas', tenantSlug, filtroStatus],
    queryFn:  async () => {
      const p = new URLSearchParams({ status: filtroStatus })
      return (await fetch(`${api}?${p}`)).json()
    },
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['compras-listas', tenantSlug] })

  const iniciarCotacaoMut = useMutation({
    mutationFn: async (listaId: number) => {
      const res = await fetch(`/api/${tenantSlug}/compras/cotacoes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listaId }),
      })
      return res.json()
    },
    onSuccess: (_, listaId) => {
      qc.invalidateQueries({ queryKey: ['compras-listas', tenantSlug] })
      toast('Cotação iniciada!')
      onIniciarCotacao(listaId)
    },
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: inv,
  })

  const listas = Array.isArray(raw?.data) ? raw.data : []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {['aberta', 'em_cotacao', 'finalizada', 'cancelada', 'todas'].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {STATUS_CFG[s]?.label ?? 'Todas'}
          </button>
        ))}
        <InfoTip titulo="De onde vêm as listas">
          São geradas pelo MRP, na aba MRP, pelo botão &quot;Gerar Lista de Compras&quot;.
          Depois de gerada, a lista pode ir para cotação.
        </InfoTip>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-10">Carregando...</p>
        ) : listas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10 bg-white rounded-xl border border-gray-100">Nenhuma lista encontrada.</p>
        ) : listas.map((l: any) => {
          const sCfg = STATUS_CFG[l.status] ?? STATUS_CFG.aberta
          const aberta = expandida === l.listaId
          return (
            <div key={l.listaId} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <button onClick={() => setExpandida(aberta ? null : l.listaId)} className="flex items-center gap-3 flex-1 text-left">
                  {aberta ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{l.descricao || `Lista #${l.listaId}`}</p>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">{ORIGEM_CFG[l.origem] ?? l.origem}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sCfg.cls}`}>{sCfg.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(l.dataGeracao)} · {l.totalItens} item(ns)</p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  {l.status === 'aberta' && (
                    <Button size="sm" variant="outline" onClick={() => iniciarCotacaoMut.mutate(l.listaId)}>
                      <Scale size={13} className="mr-1.5" /> Iniciar Cotação
                    </Button>
                  )}
                  {l.status === 'aberta' && (
                    <BotaoIcone titulo="Excluir lista" variante="perigo" tamanho="md" onClick={() => excluirMut.mutate(l.listaId)}>
                      <Trash2 size={14} />
                    </BotaoIcone>
                  )}
                </div>
              </div>
              {aberta && (
                <div className="border-t border-gray-50 px-4 py-3 bg-gray-50/50">
                  <table className="w-full">
                    <thead>
                      <tr><th className="text-left text-xs font-medium text-gray-400 pb-2">Insumo</th><th className="text-right text-xs font-medium text-gray-400 pb-2">Sugestão</th><th className="text-right text-xs font-medium text-gray-400 pb-2">Estoque no momento</th></tr>
                    </thead>
                    <tbody>
                      {(l.itens ?? []).map((item: any) => (
                        <tr key={item.itemId} className="border-t border-gray-100">
                          <td className="py-1.5 text-sm text-gray-700">{item.nomeInsumo}</td>
                          <td className="py-1.5 text-right text-sm font-medium text-orange-600">{parseFloat(item.quantidadeSugerida).toFixed(2)}</td>
                          <td className="py-1.5 text-right text-sm text-gray-400">{parseFloat(item.estoqueNoMomento).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}