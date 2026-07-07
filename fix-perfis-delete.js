const fs = require('fs')
let r = fs.readFileSync('app/api/[tenant]/perfis/[id]/route.ts', 'utf8')

const novoDelete = `export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { pool: dbPool } = await import('@/lib/db/connection')
    const client = await dbPool.connect()
    try {
      await client.query(\`SET search_path TO "\${tenant.schemaName}", public\`)
      const id = Number(params.id)

      // Verificar usuários vinculados
      const usersRes = await client.query(
        'SELECT usuario_id, nome FROM t_usuario WHERE perfil_id = $1 AND active_flg = true',
        [id]
      )
      if (usersRes.rows.length > 0) {
        const nomes = usersRes.rows.map(u => u.nome).join(', ')
        return badRequest(\`Não é possível excluir: \${usersRes.rows.length} usuário(s) vinculado(s): \${nomes}.\`)
      }

      // Soft delete do perfil
      const delRes = await client.query(
        'UPDATE t_perfil_acesso SET active_flg = false, updated_dt = NOW() WHERE perfil_id = $1 AND active_flg = true RETURNING perfil_id',
        [id]
      )
      if (delRes.rows.length === 0) return notFound('Perfil não encontrado')
      return ok({ excluido: true })
    } finally { client.release() }
  } catch (err) { return serverError(err) }
}`

// Substituir o DELETE existente
r = r.replace(/export async function DELETE[\s\S]*$/, novoDelete)

// Adicionar import do pool se nao tiver
if (!r.includes("import { pool }")) {
  r = r.replace(
    "import { getDbForTenant } from '@/lib/db/connection'",
    "import { getDbForTenant, pool } from '@/lib/db/connection'"
  )
}

fs.writeFileSync('app/api/[tenant]/perfis/[id]/route.ts', r, 'utf8')
console.log('OK: DELETE de perfil reescrito com pool+search_path')