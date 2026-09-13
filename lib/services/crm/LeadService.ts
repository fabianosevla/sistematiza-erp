// lib/services/crm/LeadService.ts
import { eq, desc, sql } from 'drizzle-orm'
import type { AppDB } from '@/lib/db/connection'
import { dbCrmLead, type TpDbCrmLeadUpdate } from '@/lib/db/schemas/crm.schema'

const ESTAGIOS = ['novo', 'contatado', 'negociando', 'proposta', 'ganho', 'perdido'] as const
export type Estagio = typeof ESTAGIOS[number]

export class LeadService {
  constructor(private db: AppDB) {}

  async listar() {
    return this.db.select().from(dbCrmLead)
      .where(eq(dbCrmLead.activeFlag, true))
      .orderBy(desc(dbCrmLead.createdDt))
  }

  async criar(payload: {
    nomeEmpresa: string; contatoNome?: string; telefone?: string; email?: string
    valorEstimadoCentavos?: number; responsavel?: string; proximaAcaoData?: string | null
    observacao?: string
  }, userId: number) {
    const now = new Date()
    const [result] = await this.db.insert(dbCrmLead).values({
      nomeEmpresa: payload.nomeEmpresa.trim(),
      contatoNome: payload.contatoNome?.trim() || null,
      telefone:    payload.telefone?.trim() || null,
      email:       payload.email?.trim() || null,
      valorEstimadoCentavos: payload.valorEstimadoCentavos ?? 0,
      responsavel: payload.responsavel?.trim() || null,
      proximaAcaoData: payload.proximaAcaoData || null,
      observacao:  payload.observacao?.trim() || null,
      estagio:     'novo',
      origem:      'prospeccao',
      createdBy: userId, updatedBy: userId, createdDt: now, updatedDt: now,
    }).returning({ leadId: dbCrmLead.leadId })
    return result
  }

  async atualizar(id: number, payload: TpDbCrmLeadUpdate & { estagio?: Estagio }, userId: number) {
    const set: any = { ...payload, updatedBy: userId, updatedDt: new Date(), modificationNum: sql`${dbCrmLead.modificationNum} + 1` }
    // Troca de estágio pra ganho/perdido registra o momento automaticamente —
    // não é campo que o operador preenche, é o sistema que marca "agora".
    if (payload.estagio === 'ganho')   set.ganhoEm   = new Date()
    if (payload.estagio === 'perdido') set.perdidoEm = new Date()
    const [result] = await this.db.update(dbCrmLead).set(set).where(eq(dbCrmLead.leadId, id)).returning({ leadId: dbCrmLead.leadId })
    return result
  }

  async excluir(id: number, userId: number) {
    const [result] = await this.db.update(dbCrmLead)
      .set({ activeFlag: false, updatedBy: userId, updatedDt: new Date() })
      .where(eq(dbCrmLead.leadId, id))
      .returning({ leadId: dbCrmLead.leadId })
    return !!result
  }
}
