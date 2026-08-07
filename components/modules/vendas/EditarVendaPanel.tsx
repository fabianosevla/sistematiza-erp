'use client'
// ESTE ARQUIVO VAI EM: components/modules/vendas/EditarVendaPanel.tsx
//
// EDIÇÃO DE VENDA REALIZADA — só o que não mexe em dinheiro nem em estoque.
//
// Cliente avulso, vendedor, canal, entrega e observações podem ser corrigidos
// sem consequência: nenhum entra no cálculo do total, na baixa de estoque ou
// no cashback já creditado.
//
// Item, quantidade, preço e forma de pagamento NÃO estão aqui, de propósito.
// Mudar qualquer um deles obrigaria a refazer a baixa de produto, a ficha
// técnica, o cashback e o rascunho fiscal — e um erro no meio disso deixa o
// estoque mentindo sem ninguém perceber. Para esses casos o caminho é cancelar
// e lançar de novo, que é como o operador de balcão já pensa.
//
// Vive em componente próprio porque é usado nos dois lugares onde a venda
// aparece: o detalhe em Consultas e a listagem do módulo Vendas.
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SidePanel } from '@/components/ui/SidePanel'
import { InfoTip } from '@/components/ui/InfoTip'
import { useToast } from '@/components/ui/Toast'
import { useDominio } from '@/hooks/useDominio'

interface Props {
  tenantSlug: string
  vendaId:    number
  onClose:    () => void
  /** Chamado após salvar, para quem precisa recarregar a própria lista. */
  onSalvo?:   () => void
}

export function EditarVendaPanel({ tenantSlug, vendaId, onClose, onSalvo }: Props) {
  const { toast }    = useToast()
  const queryClient  = useQueryClient()
  const tiposEntrega = useDominio(tenantSlug, 'tipo_entrega', ['Retirada', 'Entrega', 'Transportadora'])

  const { data, isLoading } = useQuery({
    queryKey: ['venda-detalhe', tenantSlug, vendaId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/vendas/${vendaId}`)).json(),
  })
  const venda = data?.data

  const [nomeAvulso, setNomeAvulso]     = useState('')
  const [vendedor, setVendedor]         = useState('')
  const [tipoEntrega, setTipoEntrega]   = useState('')
  const [dataEntrega, setDataEntrega]   = useState('')
  const [endereco, setEndereco]         = useState('')
  const [observacao, setObservacao]     = useState('')
  const [obsInterna, setObsInterna]     = useState('')

  // Preenche uma vez, quando a venda chega. Sem isso os campos nasceriam
  // vazios e salvar apagaria o que já estava gravado.
  useEffect(() => {
    if (!venda) return
    setNomeAvulso(venda.nomeClienteAvulso ?? '')
    setVendedor(venda.vendedor ?? '')
    setTipoEntrega(venda.tipoEntrega ?? '')
    setDataEntrega(venda.dataEntrega ? String(venda.dataEntrega).slice(0, 10) : '')
    setEndereco(venda.enderecoEntrega ?? '')
    setObservacao(venda.observacao ?? '')
    setObsInterna(venda.observacaoInterna ?? '')
  }, [venda])

  const salvarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/vendas/${vendaId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          nomeClienteAvulso: nomeAvulso,
          vendedor,
          tipoEntrega,
          dataEntrega:       dataEntrega || null,
          enderecoEntrega:   endereco,
          observacao,
          observacaoInterna: obsInterna,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message ?? 'Erro ao salvar')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venda-detalhe', tenantSlug, vendaId] })
      queryClient.invalidateQueries({ queryKey: ['vendas'] })
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
      toast('Venda atualizada.')
      onSalvo?.()
      onClose()
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao salvar', 'error'),
  })

  // Cliente cadastrado não se troca por aqui: mexer no vínculo mudaria a quem
  // pertence o cashback já creditado por esta venda.
  const temClienteCadastrado = !!venda?.clienteId

  return (
    <SidePanel
      titulo={`Editar venda #${String(vendaId).padStart(5, '0')}`}
      largura="w-[30vw] min-w-[520px]"
      onClose={onClose}
      rodape={
        <>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={() => salvarMut.mutate()} disabled={isLoading || salvarMut.isPending}>
            {salvarMut.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="p-6 space-y-4">
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
        ) : !venda ? (
          <p className="text-sm text-gray-400 text-center py-12">Venda não encontrada.</p>
        ) : (
          <>
            <div>
              <Label className="flex items-center gap-1">
                Cliente
                <InfoTip titulo="O que não se edita">Item, quantidade, preço e pagamento: para corrigir, cancele a venda e lance de novo.</InfoTip>
              </Label>
              {temClienteCadastrado ? (
                <Input value={venda.clienteNome ?? ''} disabled className="mt-1" />
              ) : (
                <Input
                  value={nomeAvulso}
                  onChange={e => setNomeAvulso(e.target.value)}
                  placeholder="Consumidor Final"
                  className="mt-1"
                />
              )}
            </div>

            <div>
              <Label>Vendedor</Label>
              <Input value={vendedor} onChange={e => setVendedor(e.target.value)} className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Canal</Label>
                <select
                  value={tipoEntrega}
                  onChange={e => setTipoEntrega(e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm"
                >
                  {tiposEntrega.map((t: string) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label>Data de entrega</Label>
                <Input
                  type="date"
                  value={dataEntrega}
                  onChange={e => setDataEntrega(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Endereço de entrega</Label>
              <Input value={endereco} onChange={e => setEndereco(e.target.value)} className="mt-1" />
            </div>

            <div>
              <Label>Observação</Label>
              <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1" />
            </div>

            <div>
              <Label className="flex items-center gap-1">
                Observação interna
                <InfoTip titulo="Observação interna">Não aparece para o cliente nem em documento impresso.</InfoTip>
              </Label>
              <Input value={obsInterna} onChange={e => setObsInterna(e.target.value)} className="mt-1" />
            </div>
          </>
        )}
      </div>
    </SidePanel>
  )
}

export default EditarVendaPanel
