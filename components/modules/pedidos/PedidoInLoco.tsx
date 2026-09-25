'use client'
// ESTE ARQUIVO VAI EM: components/modules/pedidos/PedidoInLoco.tsx
//
// PEDIDO IN LOCO (cartão QA #49).
//
// A loja abastece o cliente (mercado, empório) e, na visita, conta o que
// sobrou na prateleira dele. Cada cliente tem uma capacidade por produto —
// variedades e quantidades mudam de cliente pra cliente. O pedido sai como:
//
//   pedido = capacidade - estoque no local      (nunca negativo)
//
// Ex.: capacidade 8, estoque no local 2 → pedido de 6.
//
// Aparece no Novo pedido assim que um cliente cadastrado é escolhido. A
// capacidade é cadastrada aqui mesmo ("Editar capacidade"), sem sair da tela.
// "Gerar itens" joga as quantidades nos itens do pedido; preço segue a tabela
// do cliente, aplicado por quem chama (onAplicar).
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InfoTip } from '@/components/ui/InfoTip'
import { useToast } from '@/components/ui/Toast'

interface Props {
  tenantSlug: string
  clienteId:  number
  /** Recebe o produto (com as faixas de preço) e a quantidade a pedir. */
  onAplicar:  (linhas: { produto: any; quantidade: number }[]) => void
}

const inteiro = (v: string) => {
  const n = parseInt(String(v).replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

export default function PedidoInLoco({ tenantSlug, clienteId, onAplicar }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/cadastros/clientes/${clienteId}/capacidade`

  const { data, isLoading } = useQuery({
    queryKey: ['cliente-capacidade', tenantSlug, clienteId],
    queryFn:  async () => (await fetch(api)).json(),
  })
  const capacidades: any[] = Array.isArray(data?.data) ? data.data : []

  // Estoque contado no local, por produto. Vazio = ainda não contado (0).
  const [estoque, setEstoque] = useState<Record<number, string>>({})
  useEffect(() => { setEstoque({}) }, [clienteId])

  // ── Edição da capacidade ────────────────────────────────────────────────
  const [editando, setEditando]   = useState(false)
  const [rascunho, setRascunho]   = useState<any[]>([])
  const [busca, setBusca]         = useState('')
  const [salvando, setSalvando]   = useState(false)

  const { data: produtosData } = useQuery({
    queryKey: ['produtos-capacidade', tenantSlug, busca],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=20&search=${encodeURIComponent(busca)}`)).json(),
    enabled:  editando && busca.length > 0,
  })
  const produtosBusca: any[] = produtosData?.data?.data ?? produtosData?.data ?? []

  function abrirEdicao() {
    setRascunho(capacidades.map(c => ({ ...c })))
    setEditando(true)
  }

  function adicionarProduto(p: any) {
    if (!rascunho.some(r => r.produtoId === p.produtoId)) {
      setRascunho(prev => [...prev, { ...p, capacidade: 0 }])
    }
    setBusca('')
  }

  async function salvarCapacidade() {
    setSalvando(true)
    try {
      const res = await fetch(api, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: rascunho.map(r => ({ produtoId: r.produtoId, capacidade: Number(r.capacidade) || 0 })) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message || 'Erro ao salvar a capacidade.')
      await qc.invalidateQueries({ queryKey: ['cliente-capacidade', tenantSlug, clienteId] })
      setEditando(false)
      toast('Capacidade salva.')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSalvando(false)
    }
  }

  const pedidoDe = (c: any) => Math.max(0, Number(c.capacidade) - inteiro(estoque[c.produtoId] ?? ''))
  const totalUnidades = capacidades.reduce((a, c) => a + pedidoDe(c), 0)

  function gerarItens() {
    const linhas = capacidades
      .map(c => ({ produto: c, quantidade: pedidoDe(c) }))
      .filter(l => l.quantidade > 0)
    if (linhas.length === 0) { toast('Nada a repor: o estoque no local já cobre a capacidade.', 'error'); return }
    onAplicar(linhas)
    toast(`${linhas.length} item(ns) gerado(s) pela capacidade.`)
  }

  if (isLoading) return null

  return (
    <div className="rounded-xl border border-gray-100 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900 inline-flex items-center gap-1">
          Pedido in loco
          <InfoTip titulo="Pedido in loco">
            Informe o estoque encontrado no cliente e o pedido de cada produto sai como capacidade menos estoque.
          </InfoTip>
        </span>
        {!editando && (
          <button onClick={abrirEdicao} className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
            <Pencil size={12} /> {capacidades.length > 0 ? 'Editar capacidade' : 'Cadastrar capacidade'}
          </button>
        )}
      </div>

      {editando ? (
        <div className="space-y-2">
          {rascunho.map((r, idx) => (
            <div key={r.produtoId} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-gray-700 truncate">{r.nome}</span>
              <Input value={String(r.capacidade ?? '')} inputMode="numeric"
                onChange={e => setRascunho(prev => prev.map((x, i) => i === idx ? { ...x, capacidade: inteiro(e.target.value) } : x))}
                className="w-20 h-8 text-sm text-right sem-spinner" />
              <button onClick={() => setRascunho(prev => prev.filter((_, i) => i !== idx))}
                className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Adicionar produto..." className="h-8 text-sm" />
          {busca.length > 0 && produtosBusca.length > 0 && (
            <div className="border border-gray-100 rounded-lg max-h-48 overflow-y-auto">
              {produtosBusca.map((p: any) => (
                <button key={p.produtoId} onClick={() => adicionarProduto(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 inline-flex items-center gap-1.5">
                  <Plus size={12} className="text-gray-400" /> {p.nome}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
            <Button size="sm" onClick={salvarCapacidade} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar capacidade'}
            </Button>
          </div>
        </div>
      ) : capacidades.length === 0 ? null : (
        <>
          <div className="grid grid-cols-[1fr_4rem_5rem_4rem] gap-2 text-[11px] text-gray-400 px-0.5">
            <span>Produto</span><span className="text-right">Capac.</span>
            <span className="text-right">Estoque local</span><span className="text-right">Pedido</span>
          </div>
          {capacidades.map(c => (
            <div key={c.produtoId} className="grid grid-cols-[1fr_4rem_5rem_4rem] gap-2 items-center">
              <span className="text-sm text-gray-700 truncate">{c.nome}</span>
              <span className="text-sm text-gray-500 text-right">{c.capacidade}</span>
              <Input value={estoque[c.produtoId] ?? ''} inputMode="numeric" placeholder="0"
                onChange={e => setEstoque(prev => ({ ...prev, [c.produtoId]: e.target.value.replace(/\D/g, '') }))}
                className="h-8 text-sm text-right sem-spinner" />
              <span className="text-sm font-semibold text-gray-900 text-right">{pedidoDe(c)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-500">{totalUnidades} un a repor</span>
            <Button size="sm" onClick={gerarItens}>Gerar itens do pedido</Button>
          </div>
        </>
      )}
    </div>
  )
}
