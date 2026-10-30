import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

const params = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }
const prefix = "scrypt$131072$8$1$"
const pattern = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/
// Used only to give unknown/disabled accounts the same password-verification cost.
export const DUMMY_PASSWORD_HASH = `${prefix}${"0".repeat(32)}$${"0".repeat(128)}`

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, params, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt)
  return `${prefix}${salt.toString("hex")}$${key.toString("hex")}`
}

export async function verifyPassword(
  password: string,
  encoded: string
): Promise<boolean> {
  const match = pattern.exec(encoded)
  if (!match) return false
  const actual = await derive(password, Buffer.from(match[1]!, "hex"))
  const expected = Buffer.from(match[2]!, "hex")
  return timingSafeEqual(actual, expected)
}
