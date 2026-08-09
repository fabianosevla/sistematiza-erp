import { eq } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbConfiguracoesTenant, type TpDbConfiguracoesTenantRow } from '@/lib/db/schemas/vendas'

/**
 * ATENÇÃO: ESTE SERVIÇO ENXERGA MENOS DO QUE A TABELA TEM.
 *
 * `dbConfiguracoesTenant` declara um subconjunto de t_configuracoes_tenant.
 * Colunas que entraram por scripts de migração — crt, cnae, mensagem_fiscal,
 * serie_nfe, serie_nfce, credenciado_nfce, credenciado_nfe, qtd_caixas,
 * regime_turno — NÃO estão declaradas, e o `select()` do Drizzle só traz o
 * que está declarado. Ler qualquer uma delas por aqui devolve `undefined`.
 *
 * Quem precisa desses campos usa SQL cru: a rota /configuracoes faz
 * `SELECT *` e UPDATE campo a campo, e o FiscalService consulta direto. Por
 * isso não há bug hoje — mas é armadilha para a próxima pessoa.
 *
 * O `update()` daqui não é chamado em lugar nenhum: quem grava é a rota.
 * Usá-lo descartaria em silêncio qualquer campo não declarado.
 *
 * Está no backlog unificar isso. Enquanto não for, use este serviço só para
 * as flags de módulo e o token do emissor.
 */
export class ConfiguracoesService {
  constructor(private db: AppDB) {}

  async get(): Promise<TpDbConfiguracoesTenantRow | null> {
    const [result] = await this.db.select().from(dbConfiguracoesTenant).limit(1)
    return result ?? null
  }

  async update(data: Partial<{
    comandasAtivo:    boolean
    producaoAtivo:    boolean
    estoqueAtivo:     boolean
    fiscalAtivo:      boolean
    consultasAtivo:   boolean
    pedidosAtivo:     boolean
    planoAcaoAtivo:   boolean
    nomeEmpresa:      string
    cnpj:             string
    telefone:         string
    endereco:         string
    ieEstadual:       string
    regimeTributario: string
    uf:               string
    focusNfeToken:    string
    focusNfeAmbiente: string
  }>): Promise<TpDbConfiguracoesTenantRow | null> {
    const [current] = await this.db.select().from(dbConfiguracoesTenant).limit(1)
    if (!current) return null
    const [result] = await this.db
      .update(dbConfiguracoesTenant)
      .set({ ...data, updatedDt: new Date() })
      .where(eq(dbConfiguracoesTenant.configId, current.configId))
      .returning()
    return result ?? null
  }
}