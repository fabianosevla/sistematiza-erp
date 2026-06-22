import { z } from 'zod'

// ─── CLIENTE ──────────────────────────────────────────────────────────────────

export const clienteInsertSchema = z.object({
  tipoPessoa:   z.enum(['PF', 'PJ']).default('PF'),
  nomeCompleto: z.string().min(2).max(200),
  nomeFantasia: z.string().max(200).optional().nullable(),
  documento:    z.string().max(20).optional().nullable(),
  email:        z.string().email().max(150).optional().nullable(),
  telefone:     z.string().max(20).optional().nullable(),
  celular:      z.string().max(20).optional().nullable(),
  cep:          z.string().max(10).optional().nullable(),
  endereco:     z.string().max(200).optional().nullable(),
  numero:       z.string().max(10).optional().nullable(),
  complemento:  z.string().max(100).optional().nullable(),
  bairro:       z.string().max(100).optional().nullable(),
  cidade:       z.string().max(100).optional().nullable(),
  uf:           z.string().length(2).optional().nullable(),
  observacao:   z.string().max(500).optional().nullable(),
})

// CORREÇÃO: modificationNum agora é opcional no update.
// Era obrigatório (.int() sem .optional()), causando falha silenciosa em toda
// edição de cliente onde o frontend não sabia que precisava mandar esse campo.
export const clienteUpdateSchema = clienteInsertSchema.partial().extend({
  modificationNum: z.number().int().optional(),
})
export type ClienteInsertInput = z.infer<typeof clienteInsertSchema>
export type ClienteUpdateInput = z.infer<typeof clienteUpdateSchema>

// ─── FORNECEDOR ───────────────────────────────────────────────────────────────

export const fornecedorInsertSchema = z.object({
  tipoPessoa:   z.enum(['PF', 'PJ']).default('PJ'),
  nomeCompleto: z.string().min(2).max(200),
  nomeFantasia: z.string().max(200).optional().nullable(),
  cnpjCpf:      z.string().max(20).optional().nullable(),
  email:        z.string().email().max(150).optional().nullable(),
  telefone:     z.string().max(20).optional().nullable(),
  celular:      z.string().max(20).optional().nullable(),
  contato:      z.string().max(100).optional().nullable(),
  cep:          z.string().max(10).optional().nullable(),
  endereco:     z.string().max(200).optional().nullable(),
  numero:       z.string().max(10).optional().nullable(),
  complemento:  z.string().max(100).optional().nullable(),
  bairro:       z.string().max(100).optional().nullable(),
  cidade:       z.string().max(100).optional().nullable(),
  uf:           z.string().length(2).optional().nullable(),
  observacao:   z.string().max(500).optional().nullable(),
})

// CORREÇÃO: mesma correção do cliente — modificationNum opcional
export const fornecedorUpdateSchema = fornecedorInsertSchema.partial().extend({
  modificationNum: z.number().int().optional(),
})
export type FornecedorInsertInput = z.infer<typeof fornecedorInsertSchema>
export type FornecedorUpdateInput = z.infer<typeof fornecedorUpdateSchema>

// ─── PRODUTO ──────────────────────────────────────────────────────────────────

export const produtoInsertSchema = z.object({
  nome:          z.string().min(2).max(200),
  descricao:     z.string().max(500).optional().nullable(),
  codigoBarras:  z.string().max(50).optional().nullable(),
  unidade:       z.string().max(20).default('un'),
  // CORREÇÃO: campo "tipo" estava no formulário mas ausente do schema.
  // Resultado: Zod descartava silenciosamente o tipo enviado pelo frontend,
  // e o banco nunca recebia esse campo.
  tipo:          z.string().max(100).optional().nullable(),
  categoria:     z.string().max(100).optional().nullable(),
  estoqueAtual:  z.number().int().default(0),
  estoqueMinimo: z.number().int().default(0),
  precoCusto:    z.number().int().default(0),
  precoVarejo:   z.number().int().default(0),
  precoAtacado:  z.number().int().default(0),
  // CORREÇÃO: campos de atacado A-E enviados pelo ProdutosView mas ignorados
  // pelo schema anterior — Zod descartava todos eles.
  precoAtacadoA: z.number().int().optional(),
  precoAtacadoB: z.number().int().optional(),
  precoAtacadoC: z.number().int().optional(),
  precoAtacadoD: z.number().int().optional(),
  precoAtacadoE: z.number().int().optional(),
  // CORREÇÃO: activeFlag enviado pelo frontend (desativar produto) mas ignorado
  activeFlag:    z.boolean().optional(),
})

// CORREÇÃO: modificationNum agora é opcional.
// Era obrigatório, então qualquer edição sem ele retornava CONFLICT imediato
// do ProdutoService.update(), fechando o modal com toast falso de sucesso.
export const produtoUpdateSchema = produtoInsertSchema.partial().extend({
  modificationNum: z.number().int().optional(),
})
export type ProdutoInsertInput = z.infer<typeof produtoInsertSchema>
export type ProdutoUpdateInput = z.infer<typeof produtoUpdateSchema>

// ─── INSUMO ───────────────────────────────────────────────────────────────────

export const insumoInsertSchema = z.object({
  nome:          z.string().min(2).max(200),
  descricao:     z.string().max(500).optional().nullable(),
  codigoBarras:  z.string().max(50).optional().nullable(),
  unidade:       z.string().max(20).default('kg'),
  tipo:          z.string().max(20).default('MP'),
  estoqueAtual:  z.number().int().default(0),
  estoqueMinimo: z.number().int().default(0),
  precoCusto:    z.number().int().default(0),
  fornecedorId:  z.number().int().optional().nullable(),
})

// CORREÇÃO: modificationNum opcional (mesmo padrão)
export const insumoUpdateSchema = insumoInsertSchema.partial().extend({
  modificationNum: z.number().int().optional(),
})
export type InsumoInsertInput = z.infer<typeof insumoInsertSchema>
export type InsumoUpdateInput = z.infer<typeof insumoUpdateSchema>