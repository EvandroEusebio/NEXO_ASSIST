import "dotenv/config"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createPrismaClient } from "../src/lib/prisma"
import { hashPassword, verifyPassword } from "../src/lib/password"
import { createAuthService } from "../src/services/auth"
import { demoAccounts, seedUsers } from "../prisma/seed-users"

const db = createPrismaClient(),
  auth = createAuthService(db),
  ids: string[] = []
const original = "Teste seguro original 2026!"
const replacement = "Nova palavra passe segura 2026!"
const base = process.env.AUTH_CHECK_URL ?? "http://localhost:3100"
async function user(
  role: "EMPLOYEE" | "ANALYST",
  enabled = true,
  withPassword = true
) {
  const saved = await db.user.create({
    data: {
      name: "Teste senha",
      email: `password-${randomUUID()}@nexo.com.br`,
      role,
      demoLoginEnabled: enabled,
      passwordHash: withPassword ? await hashPassword(original) : null,
    },
  })
  ids.push(saved.id)
  return saved
}
async function main() {
  const first = await hashPassword(original),
    second = await hashPassword(original)
  assert.notEqual(
    first,
    second,
    "Identical passwords must have different salts"
  )
  assert.match(first, /^scrypt\$131072\$8\$1\$/)
  assert.equal(await verifyPassword(original, first), true)
  assert.equal(
    await verifyPassword(original + " ", first),
    false,
    "Passwords must not be trimmed"
  )
  assert.equal(await verifyPassword(original, "invalid"), false)
  const owner = await user("EMPLOYEE"),
    other = await user("EMPLOYEE"),
    analyst = await user("ANALYST"),
    disabled = await user("EMPLOYEE", false),
    without = await user("EMPLOYEE", true, false)
  for (const email of [
    owner.email,
    disabled.email,
    without.email,
    "unknown@nexo.com.br",
  ])
    await assert.rejects(auth.login({ email, password: "wrong" }), {
      code: "INVALID_CREDENTIALS",
    })
  await assert.rejects(
    auth.login({ email: disabled.email, password: original }),
    { code: "INVALID_CREDENTIALS" }
  )
  const one = await auth.login({
    email: owner.email,
    password: original,
    rememberMe: false,
  })
  const two = await auth.login({ email: owner.email, password: original })
  const otherSession = await auth.login({
    email: other.email,
    password: original,
  })
  const analystSession = await auth.login({
    email: analyst.email,
    password: original,
  })
  const change = {
    currentPassword: original,
    newPassword: replacement,
    confirmPassword: replacement,
  }
  await assert.rejects(auth.changePassword(undefined, change), {
    code: "SESSION_REQUIRED",
  })
  await assert.rejects(auth.changePassword(analystSession.token, change), {
    code: "FORBIDDEN",
  })
  await assert.rejects(
    auth.changePassword(one.token, { ...change, currentPassword: "wrong" }),
    { code: "CURRENT_PASSWORD_INVALID" }
  )
  await assert.rejects(
    auth.changePassword(one.token, { ...change, confirmPassword: original }),
    { code: "INVALID_PASSWORD" }
  )
  await assert.rejects(
    auth.changePassword(one.token, {
      ...change,
      newPassword: "short",
      confirmPassword: "short",
    }),
    { code: "INVALID_PASSWORD" }
  )
  await assert.rejects(
    auth.changePassword(one.token, {
      currentPassword: original,
      newPassword: original,
      confirmPassword: original,
    }),
    { code: "SAME_PASSWORD" }
  )
  await assert.rejects(
    auth.changePassword(one.token, { ...change, userId: other.id }),
    { code: "INVALID_PASSWORD" }
  )
  const updated = await auth.changePassword(one.token, change)
  assert.notEqual(updated.token, one.token)
  assert.equal(updated.rememberMe, false)
  assert.equal(await auth.currentUser(one.token), null)
  assert.equal(await auth.currentUser(two.token), null)
  assert.equal((await auth.currentUser(updated.token))?.id, owner.id)
  assert.equal((await auth.currentUser(otherSession.token))?.id, other.id)
  assert.deepEqual(
    Object.keys((await auth.currentUser(updated.token))!).sort(),
    ["email", "id", "name", "role"]
  )
  await assert.rejects(auth.login({ email: owner.email, password: original }), {
    code: "INVALID_CREDENTIALS",
  })
  const stored = await db.user.findUniqueOrThrow({ where: { id: owner.id } })
  assert.ok(stored.passwordChangedAt)
  assert.notEqual(stored.passwordHash, owner.passwordHash)
  assert.equal(await verifyPassword(replacement, stored.passwordHash!), true)
  const race = await Promise.allSettled(
    ["Password concorrente A 2026!", "Password concorrente B 2026!"].map(
      (password) =>
        auth.changePassword(updated.token, {
          currentPassword: replacement,
          newPassword: password,
          confirmPassword: password,
        })
    )
  )
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1)
  const seededBefore = await db.user.findMany({
    where: { email: { in: demoAccounts.map((account) => account.email) } },
    select: { email: true, passwordHash: true },
    orderBy: { email: "asc" },
  })
  await seedUsers(db)
  assert.deepEqual(
    await db.user.findMany({
      where: { email: { in: demoAccounts.map((account) => account.email) } },
      select: { email: true, passwordHash: true },
      orderBy: { email: "asc" },
    }),
    seededBefore,
    "Repeating the seed must preserve passwords"
  )
  if (process.argv.includes("--http")) {
    const httpOwner = await user("EMPLOYEE")
    const request = (path: string, init: RequestInit = {}) =>
      fetch(new URL(path, base), { redirect: "manual", ...init })
    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: httpOwner.email,
        password: original,
        rememberMe: false,
      }),
    })
    assert.equal(login.status, 200)
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!
    const post = (body: unknown, extra: Record<string, string> = {}) =>
      request("/api/auth/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          ...extra,
        },
        body: JSON.stringify(body),
      })
    assert.equal(
      (
        await request("/api/auth/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        })
      ).status,
      401
    )
    assert.equal(
      (await post(change, { Origin: "https://outro.exemplo" })).status,
      403
    )
    assert.equal(
      (await post({ ...change, currentPassword: "wrong" })).status,
      401
    )
    assert.equal(
      (
        await post({
          ...change,
          newPassword: "short",
          confirmPassword: "short",
        })
      ).status,
      400
    )
    assert.equal(
      (await post({ ...change, confirmPassword: original })).status,
      400
    )
    assert.equal((await post({ ...change, userId: other.id })).status, 400)
    assert.equal(
      (
        await request("/api/auth/password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `nexo_session=${analystSession.token}`,
          },
          body: JSON.stringify(change),
        })
      ).status,
      403
    )
    const result = await post(change)
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), { ok: true })
    const newCookie = result.headers.get("set-cookie")!
    assert.match(newCookie, /HttpOnly/)
    assert.match(newCookie, /SameSite=lax/i)
    assert.doesNotMatch(newCookie, /max-age|expires=/i)
    assert.notEqual(newCookie.split(";")[0], cookie)
    assert.equal(
      (await request("/api/auth/session", { headers: { Cookie: cookie } }))
        .status,
      401
    )
    assert.equal(
      (
        await request("/api/auth/session", {
          headers: { Cookie: newCookie.split(";")[0]! },
        })
      ).status,
      200
    )
    assert.equal(
      (await auth.login({ email: httpOwner.email, password: replacement })).user
        .id,
      httpOwner.id
    )
    await assert.rejects(
      auth.login({ email: httpOwner.email, password: original }),
      { code: "INVALID_CREDENTIALS" }
    )
  }
  console.log(
    "Senhas: hashes/salts, credenciais, política, troca, sessões, concorrência e seed idempotente: OK"
  )
}
main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.user.deleteMany({ where: { id: { in: ids } } })
    await db.$disconnect()
  })
