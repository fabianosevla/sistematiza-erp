import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export const ok = (data: unknown) =>
  NextResponse.json({ status: 'success', data }, { status: 200 })
export const created = (data: unknown) =>
  NextResponse.json({ status: 'success', data }, { status: 201 })
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
