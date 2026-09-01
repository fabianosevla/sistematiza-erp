// ESTE ARQUIVO VAI EM: lib/services/fiscal/PerfilTributarioService.ts
//
// PERFIS TRIBUTÁRIOS — o cadastro que o contador preenche.
//
// Cada perfil descreve COMO um grupo de produtos é tributado: CFOP, CSOSN ou
// CST, PIS, COFINS e substituição tributária. O produto aponta para um perfil
// e herda tudo. Mudou a regra de um grupo, muda no perfil.
//
// O que NÃO está aqui: NCM, CEST e origem. Esses descrevem a mercadoria, não a
// tributação, e ficam no próprio produto.
import { and, eq, asc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbPerfilTributario } from '@/lib/db/schemas/fiscal'

export class PerfilTributarioService {
  constructor(private db: AppDB) {}

  async list() {
    return this.db
      .select()
      .from(dbPerfilTributario)
      .where(eq(dbPerfilTributario.activeFlag, true))
      .orderBy(asc(dbPerfilTributario.nome))
  }

  async findById(id: number) {
    const [r] = await this.db
      .select()
      .from(dbPerfilTributario)
      .where(eq(dbPerfilTributario.perfilTribId, id))
    return r ?? null
  }

  /**
   * Quantos produtos usam cada perfil.
   *
   * Serve para a tela avisar antes de desativar um perfil que está em uso — e
   * para mostrar quantos produtos ainda estão sem classificação fiscal, que é
   * o número que interessa a quem está implantando.
   */
  async contagemPorPerfil() {
    const r = await this.db.execute(sql`
      SELECT pt.perfil_trib_id, COUNT(p.produto_id)::int AS produtos
        FROM t_perfil_tributario pt
        LEFT JOIN t_produto p
               ON p.perfil_trib_id = pt.perfil_trib_id AND p.active_flg = true
       WHERE pt.active_flg = true
       GROUP BY pt.perfil_trib_id
    `)
    const mapa: Record<number, number> = {}
    for (const row of r.rows as any[]) mapa[row.perfil_trib_id] = row.produtos
    return mapa
  }

  async criar(payload: any, userId: number) {
    const now = new Date()
    const [r] = await this.db
      .insert(dbPerfilTributario)
      .values({ ...this.normalizar(payload), createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now })
      .returning({ perfilTribId: dbPerfilTributario.perfilTribId })
    return r
  }

  async atualizar(id: number, payload: any, userId: number) {
    const [r] = await this.db
      .update(dbPerfilTributario)
      .set({ ...this.normalizar(payload), updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbPerfilTributario.perfilTribId, id))
      .returning({ perfilTribId: dbPerfilTributario.perfilTribId })
    return r ?? null
  }

  /**
   * Exclusão lógica, e só se ninguém estiver usando.
   *
   * Perfil apagado com produto apontando para ele deixaria o produto sem
   * classificação fiscal sem ninguém perceber — e o erro só apareceria na
   * próxima emissão, com a venda já feita e o cliente esperando o cupom.
   */
  async excluir(id: number, userId: number) {
    const emUso = await this.db.execute(sql`
      SELECT COUNT(*)::int AS n FROM t_produto
       WHERE perfil_trib_id = ${id} AND active_flg = true
    `)
    const n = Number((emUso.rows[0] as any)?.n ?? 0)
    if (n > 0) {
      throw new Error(`Este perfil está em uso por ${n} produto(s). Troque o perfil deles antes de excluir.`)
    }
    await this.db
      .update(dbPerfilTributario)
      .set({ activeFlag: false, updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbPerfilTributario.perfilTribId, id))
    return { ok: true }
  }

  /**
   * Guarda o que veio, sem inventar o que não veio.
   *
   * Campo em branco fica NULL, e é assim que a validação de emissão descobre
   * que falta parametrização. Preencher com um padrão aqui — CFOP 5102, CSOSN
   * 102 — esconderia a falta e produziria nota errada, que é justamente o que
   * a versão antiga deste módulo fazia.
   */
  private normalizar(p: any) {
    const txt = (v: any) => {
      const s = String(v ?? '').trim()
      return s === '' ? null : s
    }
    const dec = (v: any) => {
      const n = parseFloat(String(v ?? '0').replace(',', '.'))
      return Number.isFinite(n) ? String(n) : '0'
    }
    return {
      nome:              String(p.nome ?? '').trim(),
      descricao:         txt(p.descricao),
      cfopInterno:       txt(p.cfopInterno),
      cfopInterestadual: txt(p.cfopInterestadual),
      origemMercadoria:  txt(p.origemMercadoria),
      csosn:             txt(p.csosn),
      csosnSemSt:        txt(p.csosnSemSt),
      cstIcms:           txt(p.cstIcms),
      cstSemSt:          txt(p.cstSemSt),
      aliqIcms:          dec(p.aliqIcms),
      redBaseIcms:       dec(p.redBaseIcms),
      temSt:             !!p.temSt,
      mva:               dec(p.mva),
      aliqIcmsSt:        dec(p.aliqIcmsSt),
      cstPis:            txt(p.cstPis),
      aliqPis:           dec(p.aliqPis),
      cstCofins:         txt(p.cstCofins),
      aliqCofins:        dec(p.aliqCofins),
      cstIpi:            txt(p.cstIpi),
      aliqIpi:           dec(p.aliqIpi),
      infoAdicional:     txt(p.infoAdicional),
    }
  }
}
