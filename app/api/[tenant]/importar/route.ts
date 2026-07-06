// @ts-nocheck
import type { NextRequest } from 'next/server'
import { resolveTenant } from '@/lib/auth/tenant'
import { pool } from '@/lib/db/connection'
import { ok, serverError, badRequest } from '@/lib/api/responses'

type Params = { params: { tenant: string } }

function parsePreco(val: string): number {
  if (!val) return 0
  const clean = String(val)
    .replace(/R\$\s*/g, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3})/g, '')
    .replace(',', '.')
  return Math.round(parseFloat(clean || '0') * 100)
}

function parseNum(val: string): number {
  return parseFloat(String(val || '0').replace(',', '.')) || 0
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const tenant   = await resolveTenant(params.tenant)
    const body     = await req.json()
    const entidade = body.entidade as string
    const rows     = body.rows as Record<string, string>[]

    if (!entidade || !rows?.length) return badRequest('Dados inválidos')

    const client = await pool.connect()
    const result = { total: rows.length, sucesso: 0, erros: [] as any[] }

    try {
      await client.query(`SET search_path TO "${tenant.schemaName}", public`)

      for (let i = 0; i < rows.length; i++) {
        const row   = rows[i]
        const linha = i + 2
        try {
          if (entidade === 'produtos') {
            if (!row.nome?.trim()) {
              result.erros.push({ linha, campo: 'nome', mensagem: 'Nome obrigatório' })
              continue
            }
            await client.query(`
              INSERT INTO t_produto (
                nome, descricao, codigo_barras, unidade, tipo,
                estoque_atual, estoque_minimo,
                preco_custo, preco_varejo,
                preco_atacado_a, preco_atacado_b, preco_atacado_c, preco_atacado_d, preco_atacado_e,
                created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1,1,NOW(),NOW(),true,0)
            `, [
              row.nome.trim(),
              row.descricao?.trim() || null,
              row.codigo_barras?.trim() || null,
              row.unidade?.trim() || 'un',
              row.tipo?.trim() || 'Outro',
              parseNum(row.estoque_atual),
              parseNum(row.estoque_minimo),
              parsePreco(row.preco_custo),
              parsePreco(row.preco_varejo),
              parsePreco(row.preco_atacado_a || row.preco_atacado || '0'),
              parsePreco(row.preco_atacado_b || '0'),
              parsePreco(row.preco_atacado_c || '0'),
              parsePreco(row.preco_atacado_d || '0'),
              parsePreco(row.preco_atacado_e || '0'),
            ])
            result.sucesso++

          } else if (entidade === 'insumos') {
            if (!row.nome?.trim()) {
              result.erros.push({ linha, campo: 'nome', mensagem: 'Nome obrigatório' })
              continue
            }
            await client.query(`
              INSERT INTO t_insumo (
                nome, descricao, unidade, estoque_atual, estoque_minimo, preco_custo,
                created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
              ) VALUES ($1,$2,$3,$4,$5,$6,1,1,NOW(),NOW(),true,0)
            `, [
              row.nome.trim(),
              row.descricao?.trim() || null,
              row.unidade?.trim() || 'kg',
              parseNum(row.estoque_atual),
              parseNum(row.estoque_minimo),
              parsePreco(row.preco_custo),
            ])
            result.sucesso++

          } else if (entidade === 'clientes') {
            if (!row.nome_completo?.trim()) {
              result.erros.push({ linha, campo: 'nome_completo', mensagem: 'Nome obrigatório' })
              continue
            }
            await client.query(`
              INSERT INTO t_cliente (
                nome_completo, nome_fantasia, cpf_cnpj, telefone, email,
                cep, endereco, numero, complemento, bairro, cidade, uf,
                created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,1,NOW(),NOW(),true,0)
            `, [
              row.nome_completo.trim(),
              row.nome_fantasia?.trim() || null,
              row.cpf_cnpj?.trim() || null,
              row.telefone?.trim() || null,
              row.email?.trim() || null,
              row.cep?.trim() || null,
              row.endereco?.trim() || null,
              row.numero?.trim() || null,
              row.complemento?.trim() || null,
              row.bairro?.trim() || null,
              row.cidade?.trim() || null,
              row.uf?.trim()?.toUpperCase().slice(0,2) || null,
            ])
            result.sucesso++

          } else if (entidade === 'fornecedores') {
            if (!row.razao_social?.trim() && !row.nome_fantasia?.trim()) {
              result.erros.push({ linha, campo: 'razao_social', mensagem: 'Razão social obrigatória' })
              continue
            }
            await client.query(`
              INSERT INTO t_fornecedor (
                razao_social, nome_fantasia, cpf_cnpj, telefone, email,
                cep, endereco, numero, complemento, bairro, cidade, uf,
                created_by, updated_by, created_dt, updated_dt, active_flg, modification_num
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,1,NOW(),NOW(),true,0)
            `, [
              row.razao_social?.trim() || row.nome_fantasia?.trim(),
              row.nome_fantasia?.trim() || null,
              row.cpf_cnpj?.trim() || null,
              row.telefone?.trim() || null,
              row.email?.trim() || null,
              row.cep?.trim() || null,
              row.endereco?.trim() || null,
              row.numero?.trim() || null,
              row.complemento?.trim() || null,
              row.bairro?.trim() || null,
              row.cidade?.trim() || null,
              row.uf?.trim()?.toUpperCase().slice(0,2) || null,
            ])
            result.sucesso++
          }
        } catch (rowErr: any) {
          const msg = rowErr?.code === '23505'
            ? 'Já existe um registro com este nome'
            : rowErr?.message ?? 'Erro desconhecido'
          result.erros.push({ linha, campo: 'geral', mensagem: msg })
        }
      }
    } finally {
      client.release()
    }

    return ok(result)
  } catch (err) {
    return serverError(err)
  }
}
