// ESTE ARQUIVO VAI EM: lib/services/perfis/PerfisService.ts
import { and, eq, asc, sql } from 'drizzle-orm'
import { currentUser } from '@clerk/nextjs/server'
import type { AppDB } from '@/lib/db/connection'
import { dbPerfilAcesso, type TpDbPerfilAcessoInsert } from '@/lib/db/schemas/perfis'
import { dbUsuario } from '@/lib/db/schemas/cadastros'

export class PerfisService {
  constructor(private db: AppDB) {}

  async list() {
    return this.db
      .select()
      .from(dbPerfilAcesso)
      .where(eq(dbPerfilAcesso.activeFlag, true))
      .orderBy(asc(dbPerfilAcesso.nome))
  }

  async findById(id: number) {
    const [result] = await this.db
      .select()
      .from(dbPerfilAcesso)
      .where(and(eq(dbPerfilAcesso.perfilId, id), eq(dbPerfilAcesso.activeFlag, true)))
    return result ?? null
  }

  async criar(payload: Omit<TpDbPerfilAcessoInsert,
    'perfilId' | 'modificationNum' | 'createdDt' | 'updatedDt' | 'createdBy' | 'updatedBy'
  >, userId: number) {
    const now = new Date()
    const [result] = await this.db
      .insert(dbPerfilAcesso)
      .values({ ...payload, createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now })
      .returning({ perfilId: dbPerfilAcesso.perfilId })
    return result
  }

  async atualizar(id: number, payload: Partial<TpDbPerfilAcessoInsert>, userId: number) {
    const [result] = await this.db
      .update(dbPerfilAcesso)
      .set({ ...payload, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbPerfilAcesso.perfilId, id))
      .returning({ perfilId: dbPerfilAcesso.perfilId })
    return result ?? null
  }

  async excluir(id: number, userId: number) {
    // Verifica se há usuários usando este perfil
    const usuarios = await this.db
      .select({ usuarioId: dbUsuario.usuarioId })
      .from(dbUsuario)
      .where(and(eq((dbUsuario as any).perfilId, id), eq(dbUsuario.activeFlag, true)))

    if (usuarios.length > 0) {
      throw new Error(`Este perfil está vinculado a ${usuarios.length} usuário(s). Remova o vínculo antes de excluir.`)
    }

    await this.db
      .update(dbPerfilAcesso)
      .set({ activeFlag: false, updatedDt: new Date(), updatedBy: userId })
      .where(eq(dbPerfilAcesso.perfilId, id))
    return { ok: true }
  }

  /**
   * LOCALIZA O USUÁRIO LOCAL A PARTIR DO CLERK.
   *
   * O BUG QUE ISTO CONSERTA
   * Ao convidar alguém, o registro nasce com clerk_id = "pending_<email>".
   * Quando a pessoa aceita o convite, o Clerk passa a identificá-la por um ID
   * real (user_xxx) — mas o banco continua com o "pending_". A busca por
   * clerk_id não encontrava ninguém, e o sistema negava TUDO: a pessoa logava
   * e não via nada, mesmo marcada como Administrador.
   *
   * Agora, se a busca por clerk_id falhar, procuramos pelo e-mail da sessão
   * do Clerk e, ao encontrar, gravamos o clerk_id real. O vínculo se conserta
   * sozinho no primeiro acesso — e as próximas requisições já caem no
   * caminho rápido.
   */
  private async localizarUsuario(clerkId: string) {
    const [porClerk] = await this.db
      .select()
      .from(dbUsuario)
      .where(and(eq(dbUsuario.clerkId, clerkId), eq(dbUsuario.activeFlag, true)))
    if (porClerk) return porClerk

    // Sem correspondência: tenta pelo e-mail da sessão.
    let email = ''
    try {
      const u = await currentUser()
      email = u?.emailAddresses?.[0]?.emailAddress?.trim() ?? ''
    } catch { /* fora de contexto de requisição — segue sem e-mail */ }
    if (!email) return null

    const [porEmail] = await this.db
      .select()
      .from(dbUsuario)
      .where(and(sql`LOWER(${dbUsuario.email}) = LOWER(${email})`, eq(dbUsuario.activeFlag, true)))
    if (!porEmail) return null

    // Cura o vínculo. Se falhar, o acesso desta requisição continua valendo —
    // só voltaria a passar pelo e-mail na próxima.
    await this.db
      .update(dbUsuario)
      .set({ clerkId, updatedDt: new Date() })
      .where(eq(dbUsuario.usuarioId, porEmail.usuarioId))
      .catch(() => {})

    return { ...porEmail, clerkId }
  }

  // Retorna os ambientes que um usuário pode acessar baseado no seu perfil
  async getAcessosUsuario(clerkId: string): Promise<{
    gerencial: boolean
    pdv:       boolean
    comanda:   boolean
    delivery:  boolean
    perfil:    TpDbPerfilAcessoRow | null
  }> {
    const usuario = await this.localizarUsuario(clerkId)

    if (!usuario) return { gerencial: false, pdv: false, comanda: false, delivery: false, perfil: null }

    // Se não tem perfil_id, verifica perfil legado
    const perfilId = (usuario as any).perfilId
    if (!perfilId) {
      const isAdmin = usuario.perfil === 'admin'
      return {
        gerencial: isAdmin,
        pdv:       true,
        comanda:   isAdmin,
        delivery:  isAdmin,
        perfil:    null,
      }
    }

    const perfil = await this.findById(perfilId)
    // Perfil apagado ou inativo não pode zerar o acesso de um admin — sem
    // isto, desativar um perfil trancava a pessoa para fora do sistema.
    if (!perfil) {
      const isAdmin = usuario.perfil === 'admin'
      return {
        gerencial: isAdmin,
        pdv:       true,
        comanda:   isAdmin,
        delivery:  isAdmin,
        perfil:    null,
      }
    }

    return {
      gerencial: perfil.isAdmin || perfil.acessoGerencial,
      pdv:       perfil.isAdmin || perfil.acessoPdv,
      comanda:   perfil.isAdmin || perfil.acessoComanda,
      delivery:  perfil.isAdmin || perfil.acessoDelivery,
      perfil,
    }
  }
}

// Re-export do tipo para uso externo
import type { TpDbPerfilAcessoRow } from '@/lib/db/schemas/perfis'
export type { TpDbPerfilAcessoRow }