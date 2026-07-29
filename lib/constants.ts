/**
 * lib/constants.ts
 * Vocabulário do domínio — fonte única.
 *
 * IMPORTANTE: estes valores são os que JÁ existem no banco e no código.
 * Nada aqui muda comportamento sozinho; o arquivo serve para as telas novas
 * pararem de escrever strings soltas ('pendente', 'atacado_a'…) e para quem
 * chega no time descobrir o vocabulário em um lugar só.
 */

// ── Pedidos (produção) ──────────────────────────────────────────────────────

export const STATUS_PEDIDO = {
  pendente:  { label: 'Pendente',  tom: 'neutro'   },
  producao:  { label: 'Produção',  tom: 'info'     },
  pronto:    { label: 'Pronto',    tom: 'sucesso'  },
  entregue:  { label: 'Entregue',  tom: 'sucesso'  },
  cancelado: { label: 'Cancelado', tom: 'erro'     },
} as const

export type StatusPedido = keyof typeof STATUS_PEDIDO

/** Só nestes status o pedido pode ser editado: depois disso o estoque já andou. */
export const STATUS_PEDIDO_EDITAVEIS: StatusPedido[] = ['pendente', 'producao']

// ── Vendas ──────────────────────────────────────────────────────────────────

export const STATUS_VENDA = {
  concluida: { label: 'Concluída', tom: 'sucesso' },
  cancelada: { label: 'Cancelada', tom: 'erro'    },
} as const

export const ORIGEM_VENDA = {
  direta:  'Direta',
  comanda: 'Comanda',
  mesa:    'Mesa',
} as const

export const TIPOS_ENTREGA = ['Retirada', 'Entrega', 'Transportadora'] as const

// ── Preços ──────────────────────────────────────────────────────────────────

export const TIPOS_PRECO = {
  varejo:    'Varejo',
  atacado_a: 'Atacado A',
  atacado_b: 'Atacado B',
  atacado_c: 'Atacado C',
  atacado_d: 'Atacado D',
  atacado_e: 'Atacado E',
} as const

export type TipoPreco = keyof typeof TIPOS_PRECO

// ── Produto-insumo ──────────────────────────────────────────────────────────
//
// Convenção do projeto, e a regra que mais pega quem está chegando:
// em t_produto_insumo, o campo insumo_id guarda DOIS tipos de referência.
//   insumo_id > 0  → insumo de verdade  (t_insumo.insumo_id)
//   insumo_id < 0  → produto usado como insumo (t_produto.produto_id = -insumo_id)
// Nunca comparar insumo_id diretamente com produto_id sem passar por aqui.

export function ehProdutoInsumo(insumoId: number): boolean {
  return Number(insumoId) < 0
}

/** Converte o insumo_id negativo no produto_id correspondente. */
export function produtoIdDoInsumo(insumoId: number): number {
  return Math.abs(Number(insumoId))
}

/** Converte um produto_id na referência negativa usada em t_produto_insumo. */
export function insumoIdDoProduto(produtoId: number): number {
  return -Math.abs(Number(produtoId))
}

// ── Paginação ───────────────────────────────────────────────────────────────

export const PAGINA_TAMANHO_PADRAO = 20
export const PAGINA_TAMANHO_MAX    = 500