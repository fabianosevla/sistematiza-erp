import { z } from 'zod'

// ─── Cliente ─────────────────────────────────────────────────────────────────
export const clienteInsertSchema = z.object({
  tipoPessoa:   z.enum(['PF', 'PJ']).default('PF'),
  nomeCompleto: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200),
  nomeFantasia: z.string().max(200).optional().nullable(),
  documento:    z.string().max(20).optional().nullable(),
  email:        z.string().email('E-mail inválido').max(150).optional().nullable(),
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

export const clienteUpdateSchema = clienteInsertSchema.partial().extend({
  modificationNum: z.number().int(),
})

export type ClienteInsertInput = z.infer<typeof clienteInsertSchema>
export type ClienteUpdateInput = z.infer<typeof clienteUpdateSchema>
