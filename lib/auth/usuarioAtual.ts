// ESTE ARQUIVO VAI EM: lib/auth/usuarioAtual.ts
//
// Descobre o usuário LOCAL (t_usuario.usuario_id) de quem está fazendo a
// requisição.
//
// Contexto: os services de cadastro sempre aceitaram `userId` como parâmetro.
// Quem passava `1` eram as rotas — um literal, não o usuário logado. Por isso
// a tela de auditoria mostrava sempre a mesma pessoa, ou ninguém.
//
// Duas versões porque o projeto tem dois estilos de acesso ao banco:
//
//   pool cru      → const uid = await usuarioAtualId(client)
//   Drizzle       → const uid = await usuarioAtualIdDb(db)
//
// Em ambas, se não der para identificar (cron, webhook, sessão expirada),
// devolve 1 — exatamente o comportamento de antes. Nenhuma rota quebra.
import { currentUser } from '@clerk/nextjs/server'
import { sql } from 'drizzle-orm'

const PADRAO = 1

/** Para rotas que usam `pool.connect()` (search_path já aplicado). */
export async function usuarioAtualId(client: any): Promise<number> {
  try {
    const u = await currentUser()
    if (!u) return PADRAO

    // Vínculo forte: clerk_id.
    const porClerk = await client.query(
      `SELECT usuario_id FROM t_usuario WHERE clerk_id = $1 LIMIT 1`,
      [u.id],
    )
    if (porClerk.rows.length > 0) return Number(porClerk.rows[0].usuario_id)

    // Convite aceito mas ainda não vinculado: o registro local nasceu com
    // clerk_id = "pending_<email>". Casa pelo e-mail e aproveita para gravar
    // o vínculo — a próxima requisição já cai no caminho de cima.
    const email = u.emailAddresses?.[0]?.emailAddress?.trim()
    if (email) {
      const porEmail = await client.query(
        `SELECT usuario_id FROM t_usuario WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email],
      )
      if (porEmail.rows.length > 0) {
        const id = Number(porEmail.rows[0].usuario_id)
        await client
          .query(`UPDATE t_usuario SET clerk_id = $1 WHERE usuario_id = $2`, [u.id, id])
          .catch(() => {})
        return id
      }
    }

    return PADRAO
  } catch {
    return PADRAO
  }
}

/** Para rotas que usam `getDbForTenant()` (Drizzle). */
export async function usuarioAtualIdDb(db: any): Promise<number> {
  try {
    const u = await currentUser()
    if (!u) return PADRAO

    const porClerk = await db.execute(
      sql`SELECT usuario_id FROM t_usuario WHERE clerk_id = ${u.id} LIMIT 1`,
    )
    if (porClerk.rows.length > 0) return Number((porClerk.rows[0] as any).usuario_id)

    const email = u.emailAddresses?.[0]?.emailAddress?.trim()
    if (email) {
      const porEmail = await db.execute(
        sql`SELECT usuario_id FROM t_usuario WHERE LOWER(email) = LOWER(${email}) LIMIT 1`,
      )
      if (porEmail.rows.length > 0) {
        const id = Number((porEmail.rows[0] as any).usuario_id)
        await db
          .execute(sql`UPDATE t_usuario SET clerk_id = ${u.id} WHERE usuario_id = ${id}`)
          .catch(() => {})
        return id
      }
    }

    return PADRAO
  } catch {
    return PADRAO
  }
}