'use client'
// components/modules/fiscal/EditarDadosFiscaisModal.tsx
//
// Válvula de escape: a nota caiu num estado/cenário que ainda não está
// cadastrado (perfil, exceção por estado), e falta CFOP/CSOSN/ST antes de
// emitir. Em vez de travar o operador até alguém ir cadastrar a regra,
// edita aqui, item a item, e emite. Só funciona em nota PENDENTE — nota
// já autorizada é documento, não se reescreve (ver FiscalService).

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SidePanel } from '@/components/ui/SidePanel'
import { InfoTip } from '@/components/ui/InfoTip'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string; notaId: number; onClose: () => void }

interface ItemForm {
  itemId: number; descricao: string
  ncm: string; cfop: string; cstCsosn: string
  aliqIcms: string; mva: string; aliqSt: string; baseSt: string; valorSt: string
}

export default function EditarDadosFiscaisModal({ tenantSlug, notaId, onClose }: Props) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const api = `/api/${tenantSlug}/fiscal`

  const [itens, setItens] = useState<ItemForm[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['fiscal-nota-detalhe', tenantSlug, notaId],
    queryFn:  async () => (await fetch(`${api}?notaId=${notaId}`)).json(),
  })
  const nota = data?.data

  useEffect(() => {
    if (!nota?.itens) return
    setItens(nota.itens.map((i: any) => ({
      itemId: i.itemId, descricao: i.descricao,
      ncm: i.ncm ?? '', cfop: i.cfop ?? '', cstCsosn: i.cstCsosn ?? '',
      aliqIcms: String(i.aliqIcms ?? '0'), mva: String(i.mva ?? '0'), aliqSt: String(i.aliqSt ?? '0'),
      baseSt: String(Number(i.baseSt ?? 0) / 100), valorSt: String(Number(i.valorSt ?? 0) / 100),
    })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota?.itens?.length, notaId])

  function setItem(itemId: number, campo: keyof ItemForm, valor: string) {
    setItens(prev => prev.map(i => i.itemId === itemId ? { ...i, [campo]: valor } : i))
  }

  const salvarMut = useMutation({
    mutationFn: async () => {
      for (const item of itens) {
        const res = await fetch(`${api}?action=atualizar-item-fiscal`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: item.itemId,
            ncm: item.ncm.trim() || undefined,
            cfop: item.cfop.trim() || undefined,
            cstCsosn: item.cstCsosn.trim() || undefined,
            aliqIcms: parseFloat(item.aliqIcms.replace(',', '.') || '0'),
            mva: parseFloat(item.mva.replace(',', '.') || '0'),
            aliqSt: parseFloat(item.aliqSt.replace(',', '.') || '0'),
            baseSt: Math.round(parseFloat(item.baseSt.replace(',', '.') || '0') * 100),
            valorSt: Math.round(parseFloat(item.valorSt.replace(',', '.') || '0') * 100),
          }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fiscal-nota-detalhe', tenantSlug, notaId] })
      qc.invalidateQueries({ queryKey: ['notas', tenantSlug] })
      toast('Dados fiscais atualizados. Já pode tentar emitir de novo.')
      onClose()
    },
    onError: (e: any) => toast(e.message || 'Erro ao salvar.', 'error'),
  })

  return (
    <SidePanel
      titulo="Editar dados fiscais"
      largura="w-[36vw] min-w-[600px]"
      onClose={onClose}
      rodape={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvarMut.mutate()} disabled={itens.length === 0 || salvarMut.isPending}>
            {salvarMut.isPending ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Salvando...</> : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        <p className="text-xs text-gray-500 inline-flex items-center gap-1">
          Só funciona em nota pendente — depois de autorizada, o documento não se reescreve.
          <InfoTip titulo="Quando usar">
            Pra quando a venda caiu num estado ou cenário que ainda não está cadastrado no
            sistema (perfil, exceção por estado) e você já sabe o CFOP/CSOSN certo agora. Depois,
            vale cadastrar isso em Fiscal → Parametrização, pra não precisar editar de novo.
          </InfoTip>
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={18} className="text-gray-300 animate-spin" /></div>
        ) : nota?.status !== 'pendente' ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Esta nota não está pendente — não dá pra editar.
          </p>
        ) : (
          <div className="space-y-4">
            {itens.map(item => (
              <div key={item.itemId} className="border border-gray-100 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-gray-900">{item.descricao}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">NCM</Label><Input value={item.ncm} onChange={e => setItem(item.itemId, 'ncm', e.target.value)} className="mt-1 h-8 text-sm font-mono" /></div>
                  <div><Label className="text-xs">CFOP</Label><Input value={item.cfop} onChange={e => setItem(item.itemId, 'cfop', e.target.value)} className="mt-1 h-8 text-sm font-mono" maxLength={4} /></div>
                  <div><Label className="text-xs">CSOSN/CST</Label><Input value={item.cstCsosn} onChange={e => setItem(item.itemId, 'cstCsosn', e.target.value)} className="mt-1 h-8 text-sm font-mono" /></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="text-xs">Alíquota ICMS (%)</Label><Input value={item.aliqIcms} onChange={e => setItem(item.itemId, 'aliqIcms', e.target.value)} className="sem-spinner mt-1 h-8 text-sm" inputMode="decimal" /></div>
                  <div><Label className="text-xs">MVA (%)</Label><Input value={item.mva} onChange={e => setItem(item.itemId, 'mva', e.target.value)} className="sem-spinner mt-1 h-8 text-sm" inputMode="decimal" /></div>
                  <div><Label className="text-xs">Alíquota ICMS-ST (%)</Label><Input value={item.aliqSt} onChange={e => setItem(item.itemId, 'aliqSt', e.target.value)} className="sem-spinner mt-1 h-8 text-sm" inputMode="decimal" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Base ST (R$)</Label><Input value={item.baseSt} onChange={e => setItem(item.itemId, 'baseSt', e.target.value)} className="sem-spinner mt-1 h-8 text-sm" inputMode="decimal" /></div>
                  <div><Label className="text-xs">Valor ST (R$)</Label><Input value={item.valorSt} onChange={e => setItem(item.itemId, 'valorSt', e.target.value)} className="sem-spinner mt-1 h-8 text-sm" inputMode="decimal" /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SidePanel>
  )
}
