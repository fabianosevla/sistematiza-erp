import { eq } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbConfiguracoesTenant, type TpDbConfiguracoesTenantRow } from '@/lib/db/schemas/vendas'

export class ConfiguracoesService {
  constructor(private db: AppDB) {}

  async get(): Promise<TpDbConfiguracoesTenantRow | null> {
    const [result] = await this.db
      .select()
      .from(dbConfiguracoesTenant)
      .where(eq(dbConfiguracoesTenant.activeFlag, true))
      .limit(1)
    return result ?? null
  }

  async update(data: {
    comandasAtivo?: boolean
    nomeEmpresa?: string
    cnpj?: string
    telefone?: string
    endereco?: string
  }): Promise<TpDbConfiguracoesTenantRow | null> {
    const [current] = await this.db
      .select()
      .from(dbConfiguracoesTenant)
      .limit(1)

    if (!current) return null

    const [result] = await this.db
      .update(dbConfiguracoesTenant)
      .set({ ...data, updatedDt: new Date() })
      .where(eq(dbConfiguracoesTenant.configId, current.configId))
      .returning()

    return result ?? null
  }
}