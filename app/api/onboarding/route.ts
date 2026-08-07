import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getPublicDb, pool } from '@/lib/db/connection'
import { dbTenant } from '@/lib/db/schemas/public'
import { dbCliente, dbFornecedor, dbProduto, dbUsuario } from '@/lib/db/schemas/cadastros'
import { eq } from 'drizzle-orm'
import { tenantSlugPorEmail } from '@/lib/auth/tenant'
import { ok, serverError, badRequest } from '@/lib/api/responses'

const onboardingSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, 'Slug inválido'),
})

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return serverError(new Error('UNAUTHORIZED'))

  try {
    const body    = await req.json()
    const payload = onboardingSchema.parse(body)

    // QUEM JÁ TEM EMPRESA NÃO CRIA OUTRA.
    //
    // A tela de onboarding é rota pública no middleware, então qualquer pessoa
    // já autenticada consegue abri-la digitando /onboarding — inclusive um
    // funcionário que colou um link antigo. Sem esta guarda, ela criaria um
    // schema novo e vazio no banco, paralelo ao da empresa onde já trabalha.
    //
    // A checagem fica AQUI, e não na tela, de propósito: a tela é uma das
    // várias formas de chegar nesta rota, e proteger a porta não protege a
    // casa. Barrando no servidor, nenhuma URL ou requisição direta passa.
    //
    // Cadastro novo legítimo — um cliente seu abrindo a própria empresa —
    // continua funcionando: o e-mail dele não é usuário ativo de tenant algum.
    const quemPede = await currentUser()
    const emailPede = quemPede?.emailAddresses?.[0]?.emailAddress
    if (emailPede) {
      const jaTem = await tenantSlugPorEmail(emailPede)
      if (jaTem) {
        return badRequest(
          'Este e-mail já tem acesso a uma empresa. Entre por ela ou fale com o administrador.',
        )
      }
    }

    const { db, release } = await getPublicDb()
    try {
      // Verificar se slug já existe
      const [existing] = await db
        .select({ tenantId: dbTenant.tenantId })
        .from(dbTenant)
        .where(eq(dbTenant.slug, payload.slug))

      if (existing) return badRequest('Este identificador já está em uso.')

      const schemaName = `tenant_${payload.slug.replace(/-/g, '_')}`
      const now = new Date()

      // 1. Criar tenant no public schema
      const [tenant] = await db
        .insert(dbTenant)
        .values({
          slug: payload.slug,
          name: payload.name,
          schemaName,
          ownerClerkId: userId,
          createdDt: now,
          updatedDt: now,
        })
        .returning({ tenantId: dbTenant.tenantId })

      // 2. Criar schema do tenant no PostgreSQL
      const client = await pool.connect()
      try {
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
        await client.query(`SET search_path TO "${schemaName}", public`)

        // 3. Criar tabelas no schema do tenant
        await client.query(`
          CREATE TABLE IF NOT EXISTS t_usuario (
            usuario_id SERIAL PRIMARY KEY,
            modification_num INTEGER NOT NULL DEFAULT 0,
            created_dt TIMESTAMPTZ NOT NULL,
            created_by INTEGER NOT NULL DEFAULT 1,
            updated_dt TIMESTAMPTZ NOT NULL,
            updated_by INTEGER NOT NULL DEFAULT 1,
            active_flg BOOLEAN NOT NULL DEFAULT TRUE,
            clerk_id VARCHAR(200) NOT NULL UNIQUE,
            nome VARCHAR(200) NOT NULL,
            email VARCHAR(150) NOT NULL,
            perfil VARCHAR(20) NOT NULL DEFAULT 'admin',
            user_login VARCHAR(100)
          )
        `)

        await client.query(`
          CREATE TABLE IF NOT EXISTS t_cliente (
            cliente_id SERIAL PRIMARY KEY,
            modification_num INTEGER NOT NULL DEFAULT 0,
            created_dt TIMESTAMPTZ NOT NULL,
            created_by INTEGER NOT NULL,
            updated_dt TIMESTAMPTZ NOT NULL,
            updated_by INTEGER NOT NULL,
            active_flg BOOLEAN NOT NULL DEFAULT TRUE,
            tipo_pessoa VARCHAR(2) NOT NULL DEFAULT 'PF',
            nome_completo VARCHAR(200) NOT NULL,
            nome_fantasia VARCHAR(200),
            documento VARCHAR(20),
            email VARCHAR(150),
            telefone VARCHAR(20),
            celular VARCHAR(20),
            cep VARCHAR(10),
            endereco VARCHAR(200),
            numero VARCHAR(10),
            complemento VARCHAR(100),
            bairro VARCHAR(100),
            cidade VARCHAR(100),
            uf VARCHAR(2),
            observacao VARCHAR(500)
          )
        `)

        await client.query(`
          CREATE TABLE IF NOT EXISTS t_fornecedor (
            fornecedor_id SERIAL PRIMARY KEY,
            modification_num INTEGER NOT NULL DEFAULT 0,
            created_dt TIMESTAMPTZ NOT NULL,
            created_by INTEGER NOT NULL,
            updated_dt TIMESTAMPTZ NOT NULL,
            updated_by INTEGER NOT NULL,
            active_flg BOOLEAN NOT NULL DEFAULT TRUE,
            tipo_pessoa VARCHAR(2) NOT NULL DEFAULT 'PJ',
            nome_completo VARCHAR(200) NOT NULL,
            nome_fantasia VARCHAR(200),
            cnpj_cpf VARCHAR(20),
            email VARCHAR(150),
            telefone VARCHAR(20),
            celular VARCHAR(20),
            contato VARCHAR(100),
            cep VARCHAR(10),
            endereco VARCHAR(200),
            numero VARCHAR(10),
            complemento VARCHAR(100),
            bairro VARCHAR(100),
            cidade VARCHAR(100),
            uf VARCHAR(2),
            observacao VARCHAR(500)
          )
        `)

        await client.query(`
          CREATE TABLE IF NOT EXISTS t_produto (
            produto_id SERIAL PRIMARY KEY,
            modification_num INTEGER NOT NULL DEFAULT 0,
            created_dt TIMESTAMPTZ NOT NULL,
            created_by INTEGER NOT NULL,
            updated_dt TIMESTAMPTZ NOT NULL,
            updated_by INTEGER NOT NULL,
            active_flg BOOLEAN NOT NULL DEFAULT TRUE,
            nome VARCHAR(200) NOT NULL,
            descricao VARCHAR(500),
            codigo_barras VARCHAR(50),
            unidade VARCHAR(20) NOT NULL DEFAULT 'un',
            categoria VARCHAR(100),
            estoque_atual INTEGER NOT NULL DEFAULT 0,
            estoque_minimo INTEGER NOT NULL DEFAULT 0,
            preco_custo INTEGER NOT NULL DEFAULT 0,
            preco_varejo INTEGER NOT NULL DEFAULT 0,
            preco_atacado INTEGER NOT NULL DEFAULT 0
          )
        `)

        // 4. Inserir usuário admin no tenant
        await client.query(`
          INSERT INTO t_usuario (clerk_id, nome, email, perfil, created_dt, updated_dt)
          VALUES ($1, $2, $3, 'admin', NOW(), NOW())
          ON CONFLICT (clerk_id) DO NOTHING
        `, [userId, payload.name, ''])

      } finally {
        client.release()
      }

      // 5. Atualizar metadata do usuário no Clerk
      await clerkClient().users.updateUserMetadata(userId, {
        publicMetadata: {
          tenantSlug: payload.slug,
          tenantName: payload.name,
          role: 'admin',
        },
      })

      return ok({ tenantId: tenant.tenantId, slug: payload.slug })
    } finally {
      release()
    }
  } catch (err) {
    return serverError(err)
  }
}
