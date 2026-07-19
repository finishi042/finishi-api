/**
 * AES-256-GCM encryption for payment provider secrets at rest.
 *
 * Secrets are encrypted before storing in the database and decrypted
 * only when needed at runtime (in the billing adapters).
 *
 * The encryption key is stored in .env (PAYMENT_ENCRYPTION_KEY) and
 * never in the database — so a DB breach alone cannot expose secrets.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit IV for GCM

/**
 * Get the encryption key from environment.
 * Must be a 32-byte hex string (64 hex characters).
 */
function getEncryptionKey(): Buffer {
  const key = process.env.PAYMENT_ENCRYPTION_KEY
  if (!key) {
    throw new Error('PAYMENT_ENCRYPTION_KEY is not set in environment variables')
  }
  if (key.length !== 64) {
    throw new Error('PAYMENT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

/**
 * Encrypt a plaintext secret.
 * Returns a string in format: iv:authTag:ciphertext (all hex-encoded).
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt an encrypted secret.
 * Expects the format produced by encryptSecret: iv:authTag:ciphertext
 */
export function decryptSecret(encrypted: string): string {
  const key = getEncryptionKey()
  const parts = encrypted.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const ciphertext = parts[2]

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Check if a string looks like an encrypted value (has the iv:tag:cipher format).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  if (parts.length !== 3) return false
  // IV should be 24 hex chars (12 bytes), auth tag 32 hex chars (16 bytes)
  return parts[0].length === 24 && parts[1].length === 32 && parts[2].length > 0
}

/**
 * Generate a new random encryption key (for initial setup).
 * Run this once and add the result to your .env file.
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex')
}
