import { z } from 'zod'

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
export const clienteUpdateSchema = clienteInsertSchema.partial().extend({ modificationNum: z.number().int() })
export type ClienteInsertInput = z.infer<typeof clienteInsertSchema>
export type ClienteUpdateInput = z.infer<typeof clienteUpdateSchema>

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
export const fornecedorUpdateSchema = fornecedorInsertSchema.partial().extend({ modificationNum: z.number().int() })
export type FornecedorInsertInput = z.infer<typeof fornecedorInsertSchema>
export type FornecedorUpdateInput = z.infer<typeof fornecedorUpdateSchema>

export const produtoInsertSchema = z.object({
  nome:          z.string().min(2).max(200),
  descricao:     z.string().max(500).optional().nullable(),
  codigoBarras:  z.string().max(50).optional().nullable(),
  unidade:       z.string().max(20).default('un'),
  categoria:     z.string().max(100).optional().nullable(),
  estoqueAtual:  z.number().int().default(0),
  estoqueMinimo: z.number().int().default(0),
  precoCusto:    z.number().int().default(0),
  precoVarejo:   z.number().int().default(0),
  precoAtacado:  z.number().int().default(0),
})
export const produtoUpdateSchema = produtoInsertSchema.partial().extend({ modificationNum: z.number().int() })
export type ProdutoInsertInput = z.infer<typeof produtoInsertSchema>
export type ProdutoUpdateInput = z.infer<typeof produtoUpdateSchema>

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
export const insumoUpdateSchema = insumoInsertSchema.partial().extend({ modificationNum: z.number().int() })
export type InsumoInsertInput = z.infer<typeof insumoInsertSchema>
export type InsumoUpdateInput = z.infer<typeof insumoUpdateSchema>