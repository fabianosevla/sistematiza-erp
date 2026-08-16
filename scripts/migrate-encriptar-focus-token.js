/**
 * scripts/migrate-encriptar-focus-token.js
 *
 * O token da Focus NFe (t_configuracoes_tenant.focus_nfe_token) foi
 * identificado em texto puro no banco, em produção. O código já foi
 * ajustado para gravar e ler esse campo cifrado (AES-256-GCM, mesma chave
 * do token do WhatsApp — FIDELIDADE_ENC_KEY) — mas o valor que já está
 * salvo continua em texto puro até esta migration rodar.
 *
 * O código de leitura (decryptSecretOuTextoPuro) aceita os dois formatos,
 * então não há janela de quebra: rodar isto antes ou depois do deploy do
 * código novo funciona igual. Idempotente — se o valor já estiver cifrado,
 * pula o schema.
 *
 * Requer FIDELIDADE_ENC_KEY em .env.local (a mesma usada pelo módulo
 * Fidelidade). Rodar: node scripts/migrate-encriptar-focus-token.js
 */
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const crypto = require('crypto')

const ALGO = 'aes-256-gcm'

function getKey() {
  const raw = process.env.FIDELIDADE_ENC_KEY
  if (!raw) throw new Error('FIDELIDADE_ENC_KEY não configurada em .env.local')
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error('FIDELIDADE_ENC_KEY deve ter 32 bytes (hex de 64 chars ou base64)')
  return buf
}

function encryptSecret(plain) {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

function jaEstaCifrado(payload) {
  try {
    const key = getKey()
    const data = Buffer.from(payload, 'base64')
    if (data.length < 29) return false // menor que iv(12)+tag(16)+1 byte não é payload nosso
    const iv = data.subarray(0, 12)
    const tag = data.subarray(12, 28)
    const ct = data.subarray(28)
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    decipher.update(ct)
    decipher.final()
    return true
  } catch {
    return false
  }
}

const pool = new Pool({
  host: process.env.DB_HOST, port: 5432,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
})

pool.connect().then(async client => {
  const res = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name
  `)
  const schemas = res.rows.map(r => r.schema_name)
  console.log(`\nVerificando token Focus NFe em ${schemas.length} schema(s)...\n`)

  for (const schema of schemas) {
    try {
      await client.query(`SET search_path TO "${schema}", public`)

      const { rows } = await client.query(
        `SELECT config_id, focus_nfe_token FROM t_configuracoes_tenant LIMIT 1`
      )
      const row = rows[0]
      if (!row || !row.focus_nfe_token) {
        console.log(`  ${schema}: sem token, pulado`)
        continue
      }
      if (jaEstaCifrado(row.focus_nfe_token)) {
        console.log(`  ${schema}: já cifrado, pulado`)
        continue
      }

      const cifrado = encryptSecret(row.focus_nfe_token)
      await client.query(
        `UPDATE t_configuracoes_tenant SET focus_nfe_token = $1 WHERE config_id = $2`,
        [cifrado, row.config_id]
      )
      console.log(`  ${schema}: token cifrado com sucesso`)
    } catch (err) {
      console.error(`  ${schema}: ERRO — ${err.message}`)
    }
  }

  console.log('\nConcluído.\n')
  await pool.end()
}).catch(err => {
  console.error('Falha ao conectar:', err.message)
  process.exit(1)
})
