// ESTE ARQUIVO VAI EM: lib/services/fiscal/ProntidaoFiscalService.ts
//
// O QUE FALTA PARA ESTA EMPRESA EMITIR NOTA.
//
// Existe por um motivo específico: nota fiscal autorizada com informação errada
// NÃO dá erro. A SEFAZ aceita, o cupom sai, o cliente vai embora — e o problema
// aparece meses depois, em fiscalização, com a empresa já tendo emitido
// centenas de documentos do mesmo jeito.
//
// A versão anterior deste módulo preenchia o que faltava com valores genéricos:
//
//     codigo_ncm: item.ncm || '00000000'
//     cfop:       item.cfop || '5102'
//     icms_situacao_tributaria: item.cstCsosn || '102'
//     pis_situacao_tributaria:  '07'
//
// `00000000` não é NCM válido e a SEFAZ rejeita — esse ao menos falha alto. Os
// outros três são plausíveis o bastante para passar, e é justamente por isso
// que são perigosos: autorizam nota com tributação que ninguém escolheu.
//
// Este serviço inverte a lógica. Em vez de completar o que falta, ele lista o
// que falta e recusa a emissão até alguém preencher.
import { sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'

export interface Pendencia {
  onde:   'empresa' | 'perfil' | 'produto'
  item:   string
  falta:  string
}

export interface Prontidao {
  pronto:     boolean
  pendencias: Pendencia[]
  resumo: {
    produtos:            number
    produtosSemNcm:      number
    produtosSemPerfil:   number
    perfis:              number
    perfisIncompletos:   number
  }
}

export class ProntidaoFiscalService {
  constructor(private db: AppDB) {}

  /**
   * Diagnóstico completo. Serve à tela de implantação e é chamado antes de
   * cada emissão.
   *
   * `simples` muda o que é obrigatório: no Simples Nacional o que vale é o
   * CSOSN; no regime normal, o CST de ICMS. Cobrar os dois de todo mundo
   * geraria pendência falsa e ensinaria o operador a ignorar o aviso.
   */
  async verificar(): Promise<Prontidao> {
    const pendencias: Pendencia[] = []

    // ── Empresa ──────────────────────────────────────────────────────────────
    const cfgRes = await this.db.execute(sql`
      SELECT crt, cnpj, inscricao_estadual, nome_empresa, uf,
             focus_nfe_token, credenciado_nfce, mensagem_fiscal
        FROM t_configuracoes_tenant LIMIT 1
    `)
    const cfg: any = (cfgRes.rows as any[])[0] ?? {}

    const vazio = (v: any) => !String(v ?? '').trim()

    if (vazio(cfg.crt))                 pendencias.push({ onde: 'empresa', item: 'Regime tributário (CRT)', falta: 'não informado' })
    if (vazio(cfg.cnpj))                pendencias.push({ onde: 'empresa', item: 'CNPJ', falta: 'não informado' })
    if (vazio(cfg.inscricao_estadual))  pendencias.push({ onde: 'empresa', item: 'Inscrição estadual', falta: 'não informada' })
    if (vazio(cfg.uf))                  pendencias.push({ onde: 'empresa', item: 'UF da empresa', falta: 'não informada' })
    if (vazio(cfg.focus_nfe_token))     pendencias.push({ onde: 'empresa', item: 'Token do emissor', falta: 'não configurado' })
    if (!cfg.credenciado_nfce)          pendencias.push({ onde: 'empresa', item: 'Credenciamento NFC-e', falta: 'não confirmado na SEFAZ' })

    const simples = String(cfg.crt ?? '') === '1' || String(cfg.crt ?? '') === '2'

    // No Simples a mensagem do rodapé é exigida por lei.
    if (simples && vazio(cfg.mensagem_fiscal)) {
      pendencias.push({ onde: 'empresa', item: 'Mensagem fiscal do rodapé', falta: 'obrigatória no Simples Nacional' })
    }

    // ── Perfis ───────────────────────────────────────────────────────────────
    const perfisRes = await this.db.execute(sql`
      SELECT perfil_trib_id, nome, cfop_interno, csosn, cst_icms, cst_pis, cst_cofins
        FROM t_perfil_tributario WHERE active_flg = true ORDER BY nome
    `)
    const perfis = perfisRes.rows as any[]

    let perfisIncompletos = 0
    for (const p of perfis) {
      const faltas: string[] = []
      if (vazio(p.cfop_interno)) faltas.push('CFOP dentro do estado')
      if (simples) {
        if (vazio(p.csosn)) faltas.push('CSOSN')
      } else {
        if (vazio(p.cst_icms)) faltas.push('CST de ICMS')
      }
      if (vazio(p.cst_pis))    faltas.push('CST de PIS')
      if (vazio(p.cst_cofins)) faltas.push('CST de COFINS')

      if (faltas.length > 0) {
        perfisIncompletos++
        pendencias.push({ onde: 'perfil', item: p.nome, falta: faltas.join(', ') })
      }
    }

    if (perfis.length === 0) {
      pendencias.push({ onde: 'perfil', item: 'Nenhum perfil cadastrado', falta: 'o contador precisa definir ao menos um' })
    }

    // ── Produtos ─────────────────────────────────────────────────────────────
    //
    // Só produtos vendáveis. Produto-insumo não vai em nota de venda, e cobrar
    // NCM dele encheria a lista de pendência que ninguém precisa resolver.
    const prodRes = await this.db.execute(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE COALESCE(ncm, '') = '')::int            AS sem_ncm,
             COUNT(*) FILTER (WHERE perfil_trib_id IS NULL)::int            AS sem_perfil
        FROM t_produto
       WHERE active_flg = true AND COALESCE(insumo_flg, false) = false
    `)
    const prod: any = (prodRes.rows as any[])[0] ?? { total: 0, sem_ncm: 0, sem_perfil: 0 }

    if (prod.sem_ncm > 0) {
      pendencias.push({ onde: 'produto', item: `${prod.sem_ncm} produto(s)`, falta: 'sem NCM' })
    }
    if (prod.sem_perfil > 0) {
      pendencias.push({ onde: 'produto', item: `${prod.sem_perfil} produto(s)`, falta: 'sem perfil tributário' })
    }

    return {
      pronto: pendencias.length === 0,
      pendencias,
      resumo: {
        produtos:          prod.total,
        produtosSemNcm:    prod.sem_ncm,
        produtosSemPerfil: prod.sem_perfil,
        perfis:            perfis.length,
        perfisIncompletos,
      },
    }
  }

  /**
   * Checagem por venda, na hora de emitir.
   *
   * A verificação geral responde "a empresa está pronta?". Esta responde "esta
   * venda pode virar nota?" — e a diferença importa: um produto sem NCM só
   * impede as vendas que contêm aquele produto.
   */
  async verificarVenda(vendaId: number): Promise<string[]> {
    const r = await this.db.execute(sql`
      SELECT vi.nome_produto,
             COALESCE(p.ncm, '')          AS ncm,
             p.perfil_trib_id,
             COALESCE(pt.cfop_interno,'') AS cfop
        FROM t_venda_item vi
        LEFT JOIN t_produto p             ON p.produto_id = vi.produto_id
        LEFT JOIN t_perfil_tributario pt  ON pt.perfil_trib_id = p.perfil_trib_id
       WHERE vi.venda_id = ${vendaId} AND vi.active_flg = true
    `)

    const problemas: string[] = []
    for (const item of r.rows as any[]) {
      const faltas: string[] = []
      if (!item.ncm)             faltas.push('NCM')
      if (!item.perfil_trib_id)  faltas.push('perfil tributário')
      else if (!item.cfop)       faltas.push('CFOP no perfil')
      if (faltas.length > 0) problemas.push(`${item.nome_produto}: falta ${faltas.join(' e ')}`)
    }
    return problemas
  }
}
