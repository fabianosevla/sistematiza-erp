// lib/crypto/secretBox.ts
//
// Cifra/decifra segredos por tenant (ex.: token da Meta WhatsApp) com AES-256-GCM.
// A chave vem da env FIDELIDADE_ENC_KEY (32 bytes em hex[64] ou base64).
// Gere uma com:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// e coloque em .env.local / variáveis da Vercel como FIDELIDADE_ENC_KEY.
import crypto from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.FIDELIDADE_ENC_KEY
  if (!raw) throw new Error('FIDELIDADE_ENC_KEY não configurada')
  // aceita hex (64 chars) ou base64
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error('FIDELIDADE_ENC_KEY deve ter 32 bytes (hex de 64 chars ou base64)')
  return buf
}

export function isEncKeyConfigured(): boolean {
  try { getKey(); return true } catch { return false }
}

/** Retorna string base64 no formato iv(12) | tag(16) | ciphertext. */
export function encryptSecret(plain: string): string {
  const key = getKey()
  const iv  = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct  = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

/** Recebe a string produzida por encryptSecret e devolve o texto original. */
export function decryptSecret(payload: string): string {
  const key  = getKey()
  const data = Buffer.from(payload, 'base64')
  const iv   = data.subarray(0, 12)
  const tag  = data.subarray(12, 28)
  const ct   = data.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/**
 * Decifra um segredo que pode ainda estar em texto puro (gravado antes da
 * criptografia existir, ou tenant que não rodou a migração de re-cifragem).
 * Se a decifragem falhar (auth tag inválida, payload curto demais), devolve
 * o valor original em vez de derrubar a requisição.
 */
export function decryptSecretOuTextoPuro(payload: string | null | undefined): string {
  if (!payload) return ''
  try {
    return decryptSecret(payload)
  } catch {
    return payload
  }
}