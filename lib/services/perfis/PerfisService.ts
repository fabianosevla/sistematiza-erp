import { and, eq, asc } from 'drizzle-orm'
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

  // Retorna os ambientes que um usuário pode acessar baseado no seu perfil
  async getAcessosUsuario(clerkId: string): Promise<{
    gerencial: boolean
    pdv:       boolean
    comanda:   boolean
    delivery:  boolean
    perfil:    TpDbPerfilAcessoRow | null
  }> {
    const [usuario] = await this.db
      .select()
      .from(dbUsuario)
      .where(and(eq(dbUsuario.clerkId, clerkId), eq(dbUsuario.activeFlag, true)))

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
    if (!perfil) return { gerencial: false, pdv: false, comanda: false, delivery: false, perfil: null }

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