import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

// Dado de ERP muda a toda hora e é por usuário: nenhuma resposta da API
// pode ser reaproveitada de cache (navegador, CDN da Vercel). Sem isso, sair
// de Pedidos e abrir Produção podia mostrar a grade antiga até um F5 (QA #129).
const SEM_CACHE = { 'Cache-Control': 'no-store, max-age=0' }

export const ok = (data: unknown) =>
  NextResponse.json({ status: 'success', data }, { status: 200, headers: SEM_CACHE })
export const created = (data: unknown) =>
  NextResponse.json({ status: 'success', data }, { status: 201, headers: SEM_CACHE })
export const notFound = (message = 'Não encontrado') =>
  NextResponse.json({ status: 'error', message }, { status: 404 })
export const unauthorized = () =>
  NextResponse.json({ status: 'error', message: 'Não autorizado' }, { status: 401 })
export const forbidden = () =>
  NextResponse.json({ status: 'error', message: 'Sem permissão' }, { status: 403 })
export const conflict = (message: string, modificationNum?: number) =>
  NextResponse.json(
    { status: 'error', message, modification_num: modificationNum },
    { status: 409 }
  )
export const badRequest = (message: string) =>
  NextResponse.json({ status: 'error', message }, { status: 400 })
export const tooManyRequests = (message = 'Muitas tentativas. Aguarde um pouco e tente de novo.') =>
  NextResponse.json({ status: 'error', message }, { status: 429 })

export const serverError = (err: unknown) => {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Dados inválidos',
        errors: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
      { status: 400 }
    )
  }

  const message = err instanceof Error ? err.message : String(err)

  // Erro de duplicata PostgreSQL (unique_violation)
  const pgCode = (err as any)?.code ?? (err as any)?.cause?.code
  if (pgCode === '23505') {
    return NextResponse.json(
      { status: 'error', message: 'Já existe um registro com este nome.' },
      { status: 409 }
    )
  }

  if (message === 'UNAUTHORIZED') return unauthorized()
  if (message === 'FORBIDDEN') return forbidden()
  if (message === 'TENANT_NOT_FOUND') return notFound('Tenant não encontrado')
  if (message === 'USER_NOT_IN_TENANT') return forbidden()
  if (message === 'USER_INACTIVE') return forbidden()

  console.error('[sistematiza.erp]', err)
  return NextResponse.json(
    { status: 'error', message: 'Erro interno do servidor' },
    { status: 500 }
  )
}
