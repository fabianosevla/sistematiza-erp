import type { AppDB } from '@/lib/db/connection'
import { dbCliente, dbFornecedor, dbProduto, dbInsumo } from '@/lib/db/schemas/cadastros'

export type EntidadeImportacao = 'clientes' | 'fornecedores' | 'produtos' | 'insumos'

export interface ImportacaoResult {
  total:    number
  sucesso:  number
  erros:    { linha: number; campo: string; mensagem: string }[]
}

function parsePreco(val: string): number {
  if (!val) return 0
  const clean = String(val).replace(/[R$\s.]/g, '').replace(',', '.')
  return Math.round(parseFloat(clean || '0') * 100)
}

// Renomeada de "parseInt" para "parseIntSafe" — o nome antigo colidia com a
// funcao nativa do JS. Como a funcao era declarada "function parseInt(...)",
// a chamada a "parseInt" dentro do proprio corpo passava a apontar pra ela
// mesma (nao pra global), causando recursao infinita e estourando a pilha
// em toda importacao de produtos/insumos.
function parseIntSafe(val: string): number {
  return parseInt(String(val || '0').replace(/\D/g, '')) || 0
}

export class ImportacaoService {
  constructor(private db: AppDB) {}

  async importar(entidade: EntidadeImportacao, rows: Record<string, string>[], userId: number): Promise<ImportacaoResult> {
    const result: ImportacaoResult = { total: rows.length, sucesso: 0, erros: [] }
    const now = new Date()

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i]
      const linha  = i + 2 // linha 1 = header
      try {
        if (entidade === 'clientes') {
          if (!row.nome_completo?.trim()) {
            result.erros.push({ linha, campo: 'nome_completo', mensagem: 'Nome obrigatório' })
            continue
          }
          await this.db.insert(dbCliente).values({
            nomeCompleto: row.nome_completo.trim(),
            nomeFantasia: row.nome_fantasia?.trim() || null,
            tipoPessoa:   (row.tipo_pessoa?.toUpperCase() === 'PJ' ? 'PJ' : 'PF'),
            documento:    row.documento?.trim() || null,
            email:        row.email?.trim() || null,
            telefone:     row.telefone?.trim() || null,
            celular:      row.celular?.trim() || null,
            cidade:       row.cidade?.trim() || null,
            uf:           row.uf?.trim().toUpperCase().slice(0, 2) || null,
            observacao:   row.observacao?.trim() || null,
            createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
          })
          result.sucesso++

        } else if (entidade === 'fornecedores') {
          if (!row.nome_completo?.trim()) {
            result.erros.push({ linha, campo: 'nome_completo', mensagem: 'Nome obrigatório' })
            continue
          }
          await this.db.insert(dbFornecedor).values({
            nomeCompleto: row.nome_completo.trim(),
            nomeFantasia: row.nome_fantasia?.trim() || null,
            tipoPessoa:   (row.tipo_pessoa?.toUpperCase() === 'PF' ? 'PF' : 'PJ'),
            cnpjCpf:      row.cnpj_cpf?.trim() || null,
            email:        row.email?.trim() || null,
            telefone:     row.telefone?.trim() || null,
            celular:      row.celular?.trim() || null,
            contato:      row.contato?.trim() || null,
            cidade:       row.cidade?.trim() || null,
            uf:           row.uf?.trim().toUpperCase().slice(0, 2) || null,
            observacao:   row.observacao?.trim() || null,
            createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
          })
          result.sucesso++

        } else if (entidade === 'produtos') {
          if (!row.nome?.trim()) {
            result.erros.push({ linha, campo: 'nome', mensagem: 'Nome obrigatório' })
            continue
          }
          await this.db.insert(dbProduto).values({
            nome:          row.nome.trim(),
            descricao:     row.descricao?.trim() || null,
            codigoBarras:  row.codigo_barras?.trim() || null,
            unidade:       row.unidade?.trim() || 'un',
            categoria:     row.categoria?.trim() || null,
            estoqueAtual:  parseIntSafe(row.estoque_atual),
            estoqueMinimo: parseIntSafe(row.estoque_minimo),
            precoCusto:    parsePreco(row.preco_custo),
            precoVarejo:   parsePreco(row.preco_varejo),
            precoAtacado:  parsePreco(row.preco_atacado),
            createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
          })
          result.sucesso++

        } else if (entidade === 'insumos') {
          if (!row.nome?.trim()) {
            result.erros.push({ linha, campo: 'nome', mensagem: 'Nome obrigatório' })
            continue
          }
          await this.db.insert(dbInsumo).values({
            nome:          row.nome.trim(),
            descricao:     row.descricao?.trim() || null,
            codigoBarras:  row.codigo_barras?.trim() || null,
            unidade:       row.unidade?.trim() || 'kg',
            tipo:          row.tipo?.trim().toUpperCase() || 'MP',
            estoqueAtual:  parseIntSafe(row.estoque_atual),
            estoqueMinimo: parseIntSafe(row.estoque_minimo),
            precoCusto:    parsePreco(row.preco_custo),
            createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
          })
          result.sucesso++
        }
      } catch (err: any) {
        result.erros.push({ linha, campo: 'geral', mensagem: err.message ?? 'Erro desconhecido' })
      }
    }

    return result
  }
}