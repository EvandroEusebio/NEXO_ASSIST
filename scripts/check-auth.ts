import assert from "node:assert/strict"

const baseUrl = process.env.AUTH_CHECK_URL ?? "http://localhost:3100"

async function request(path: string, init: RequestInit = {}) {
  return fetch(new URL(path, baseUrl), { redirect: "manual", ...init })
}

async function login(email: string, password = "senha-de-demonstracao") {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
}

async function main() {
  const temporaryLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "ana.souza@nexo.com.br",
      password: "demo",
      rememberMe: false,
    }),
  })
  assert.equal(temporaryLogin.status, 200)
  const temporaryCookie = temporaryLogin.headers.get("set-cookie") ?? ""
  assert.ok(temporaryCookie.startsWith("nexo_session="))
  assert.doesNotMatch(temporaryCookie, /max-age|expires=/i)
  await request("/api/auth/logout", {
    method: "POST",
    headers: { Cookie: temporaryCookie.split(";")[0]! },
  })
  assert.equal((await request("/api/tickets")).status, 401)
  assert.equal((await request("/tickets")).status, 307)
  const analystLogin = await login("rafael.lima@nexo.com.br")
  assert.equal(analystLogin.status, 200)
  const analystHeaders = {
    Cookie: analystLogin.headers.get("set-cookie")!.split(";")[0]!,
  }
  assert.equal(
    (await request("/api/analyst/conversations", { headers: analystHeaders }))
      .status,
    200
  )
  assert.equal(
    (await request("/api/tickets", { headers: analystHeaders })).status,
    401
  )
  assert.equal(
    (await request("/analyst", { headers: analystHeaders })).status,
    200
  )
  await request("/api/auth/logout", { method: "POST", headers: analystHeaders })
  assert.equal((await login("desconhecido@nexo.com.br")).status, 401)
  assert.equal((await login("ana.souza@nexo.com.br", "")).status, 400)
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        headers: {
          Origin: "https://outro.exemplo",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "ana.souza@nexo.com.br",
          password: "senha",
        }),
      })
    ).status,
    403
  )

  const anaLogin = await login("ANA.SOUZA@nexo.com.br")
  const brunoLogin = await login("bruno.tavares@nexo.com.br")
  assert.equal(anaLogin.status, 200)
  assert.equal(brunoLogin.status, 200)
  const anaCookie = anaLogin.headers.get("set-cookie")?.split(";")[0]
  const brunoCookie = brunoLogin.headers.get("set-cookie")?.split(";")[0]
  assert.ok(anaCookie)
  assert.ok(brunoCookie)
  assert.ok(anaCookie.startsWith("nexo_session="))
  assert.ok(brunoCookie.startsWith("nexo_session="))
  assert.match(anaLogin.headers.get("set-cookie") ?? "", /HttpOnly/)
  assert.match(anaLogin.headers.get("set-cookie") ?? "", /SameSite=lax/i)
  assert.notEqual(anaCookie, brunoCookie)

  const asAna = { Cookie: anaCookie }
  const asBruno = { Cookie: brunoCookie }
  assert.equal(
    (await request("/api/analyst/conversations", { headers: asAna })).status,
    403
  )
  const anaSession = await request("/api/auth/session", { headers: asAna })
  assert.equal(anaSession.status, 200)
  assert.equal((await anaSession.json()).user.email, "ana.souza@nexo.com.br")
  assert.equal((await request("/tickets", { headers: asAna })).status, 200)

  const anaResponse = await request("/api/tickets", { headers: asAna })
  const brunoResponse = await request("/api/tickets", { headers: asBruno })
  assert.equal(anaResponse.status, 200)
  assert.equal(brunoResponse.status, 200)
  const anaTickets = (await anaResponse.json()).tickets as { number: string }[]
  const brunoTickets = (await brunoResponse.json()).tickets as {
    number: string
  }[]
  assert.ok(anaTickets.some((ticket) => ticket.number === "INC-20311"))
  assert.ok(brunoTickets.some((ticket) => ticket.number === "INC-20517"))
  assert.ok(!anaTickets.some((ticket) => ticket.number === "INC-20517"))
  assert.ok(!brunoTickets.some((ticket) => ticket.number === "INC-20311"))
  assert.equal(
    (await request("/api/tickets/INC-20311", { headers: asAna })).status,
    200
  )
  assert.equal(
    (await request("/api/tickets/INC-20311", { headers: asBruno })).status,
    404
  )
  assert.equal(
    (await request("/tickets/INC-20311", { headers: asBruno })).status,
    404
  )

  const logout = await request("/api/auth/logout", {
    method: "POST",
    headers: asAna,
  })
  assert.equal(logout.status, 200)
  assert.equal(
    (await request("/api/auth/session", { headers: asAna })).status,
    401
  )
  assert.equal((await request("/api/tickets", { headers: asAna })).status, 401)
  assert.equal(
    (await request("/api/tickets", { headers: asBruno })).status,
    200
  )
  console.log("Login, sessão, privacidade entre Ana e Bruno e logout: OK")
}

main().catch((error: unknown) => {
  console.error("Falha no teste HTTP de autenticação:", error)
  process.exitCode = 1
})
