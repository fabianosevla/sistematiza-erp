// ESTE ARQUIVO VAI EM: lib/validations/cadastros.ts
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
export const clienteUpdateSchema = clienteInsertSchema.partial().extend({ modificationNum: z.number().int().optional() })
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
export const fornecedorUpdateSchema = fornecedorInsertSchema.partial().extend({ modificationNum: z.number().int().optional() })
export type FornecedorInsertInput = z.infer<typeof fornecedorInsertSchema>
export type FornecedorUpdateInput = z.infer<typeof fornecedorUpdateSchema>

export const produtoInsertSchema = z.object({
  nome:          z.string().min(2).max(200),
  descricao:     z.string().max(500).optional().nullable(),
  codigoBarras:  z.string().max(50).optional().nullable(),
  unidade:       z.string().max(20).default('un'),
  categoria:     z.string().max(100).optional().nullable(),
  // CORREÇÃO: 'tipo' não existia no schema, então o Zod DESCARTAVA o campo
  // silenciosamente no PUT — editar o tipo do produto (ex.: mudar pra
  // "Bebida") nunca salvava. Idem para os campos abaixo.
  tipo:          z.string().max(100).optional().nullable(),
  estoqueAtual:  z.number().int().default(0),
  estoqueMinimo: z.number().int().default(0),
  precoCusto:    z.number().int().default(0),
  precoVarejo:   z.number().int().default(0),
  precoAtacado:  z.number().int().default(0),
  // Tabelas de atacado A-E — a tela envia, mas o schema não tinha: o PUT
  // descartava e a edição desses preços não salvava.
  precoAtacadoA: z.number().int().default(0),
  precoAtacadoB: z.number().int().default(0),
  precoAtacadoC: z.number().int().default(0),
  precoAtacadoD: z.number().int().default(0),
  precoAtacadoE: z.number().int().default(0),
  // Produto que também é insumo de outros produtos
  insumoFlg:     z.boolean().default(false),
  // Produto para revenda — flag PRÓPRIA, independente do tipo (um produto
  // pode ser "Bebida" E revenda ao mesmo tempo). Ver migrate-produto-revenda.js
  revenda:       z.boolean().default(false),
  // Necessário para o botão "Reativar" da tela de produtos funcionar
  activeFlag:    z.boolean().optional(),
})
export const produtoUpdateSchema = produtoInsertSchema.partial().extend({ modificationNum: z.number().int().optional() })
export type ProdutoInsertInput = z.infer<typeof produtoInsertSchema>
export type ProdutoUpdateInput = z.infer<typeof produtoUpdateSchema>

export const insumoInsertSchema = z.object({
  nome:          z.string().min(2).max(200),
  descricao:     z.string().max(500).optional().nullable(),
  codigoBarras:  z.string().max(50).optional().nullable(),
  unidade:       z.string().max(20).default('kg'),
  // tipo pode vir de um domínio customizado; damos folga no tamanho
  tipo:          z.string().max(100).default('MP'),
  // CORREÇÃO: estoque de insumo é FRACIONADO (ex.: 0,250 kg de orégano).
  // Com .int() o Zod rejeitava qualquer valor com casa decimal e o PUT
  // devolvia "Dados inválidos". Colunas migradas para NUMERIC(14,4) em
  // scripts/migrate-insumo-estoque-minimo.js
  estoqueAtual:  z.number().default(0),
  estoqueMinimo: z.number().default(0),
  precoCusto:    z.number().int().default(0),
  fornecedorId:  z.number().int().optional().nullable(),
})
// CORREÇÃO: modificationNum agora é OPCIONAL. A tela de insumos não envia esse
// campo (e a listagem retorna 0 fixo). Sem isso, o PUT quebrava com "Dados
// inválidos". O InsumoService só faz o controle de concorrência quando ele vem.
export const insumoUpdateSchema = insumoInsertSchema.partial().extend({ modificationNum: z.number().int().optional() })
export type InsumoInsertInput = z.infer<typeof insumoInsertSchema>
export type InsumoUpdateInput = z.infer<typeof insumoUpdateSchema>