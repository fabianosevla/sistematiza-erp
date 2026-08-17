import { idLogado } from '@/lib/auth/identidade'
import type { NextRequest } from 'next/server'
import { forbidden, serverError } from '@/lib/api/responses'

/**
 * CADASTRO DE EMPRESA NÃO É SELF-SERVICE. NUNCA FOI PRA SER.
 *
 * Esta rota chegou a criar schema + tabelas + admin pra qualquer conta Clerk
 * autenticada, sem checar convite nenhum — bastava criar uma conta com
 * qualquer e-mail (o Clerk aceitava cadastro aberto) pra virar admin de um
 * tenant novo, de graça, sem o Fabiano saber. Achado em produção em 09/2026.
 *
 * Quem provisiona tenant é o Fabiano, à mão, via scripts/provisionar-tenant.js
 * (ver docs/provisionamento.md). Esta rota só existe pra devolver uma
 * recusa clara pra quem cair aqui por engano ou por link antigo.
 */
export async function POST(req: NextRequest) {
  const userId = await idLogado()
  if (!userId) return serverError(new Error('UNAUTHORIZED'))
  return forbidden()
}
