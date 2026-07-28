# Secrets and data handling

Six controls, four of them enforced by tooling rather than by remembering.

## 1. `server-only` build guard — enforced

`src/lib/db.ts` imports `server-only`. If any client component ever imports the
database module, **the build fails** rather than bundling the connection string
into JavaScript a guest downloads. This is the control that matters most,
because Next.js will otherwise do exactly that without complaint.

The same guard belongs on any future module that touches a secret — the phone
HMAC helper, the staff PIN verifier, the Resend client.

## 2. `NEXT_PUBLIC_` secret lint rule — enforced

`NEXT_PUBLIC_` is not a namespace; it is an instruction to inline a value into
the client bundle. `eslint.config.mjs` makes it an **error** to read
`process.env.NEXT_PUBLIC_*` where the name contains `KEY`, `SECRET`, `TOKEN`,
`PASSWORD`, `SALT`, `CREDENTIAL` or `DATABASE`.

`NEXT_PUBLIC_BASE_URL` is intentionally allowed — it is a public origin used to
build the QR links printed on the table tents.

## 3. Pre-commit secret scan — enforced

`.githooks/pre-commit`, enabled with `git config core.hooksPath .githooks`.
Blocks a commit containing a database URL with real credentials, a
provider-shaped API key (`sk-`, `ghp_`, `AKIA`, `xox*`, `re_`), a long opaque
value assigned to a secret-shaped name, or a PEM private key block.

Placeholders pass; `.env.example` and lockfiles are skipped. Bypass with
`--no-verify` only knowingly.

Verified working: a Neon-shaped connection string is rejected, the
`user:password@host` placeholder is accepted.

## 4. `SESSION_SECRET` — real, and never committed

Generated with `crypto.randomBytes(32)`, 64 hex characters, living only in
`.env` locally and in Vercel's environment settings in production. `.env` is
gitignored and has never been committed; only `.env.example` is tracked, and it
holds placeholders.

To rotate: generate a new one, update Vercel, redeploy. Every staff session and
guest cookie is invalidated, which is the intended effect.

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5. Vercel environment variables — mark them Sensitive

When adding `DATABASE_URL` and `SESSION_SECRET` in Vercel:

- Tick **Sensitive**. The value cannot be read back out of the dashboard
  afterwards — only overwritten. Without this, anyone with project access can
  copy your production database credentials out of a web page.
- Scope per environment. Preview deployments should **not** carry the
  production database URL; a preview branch is one bad migration away from
  destroying real pilot data.
- Use the **pooled** connection string, not the direct one. Serverless
  functions open a connection per invocation and will exhaust a direct
  Postgres connection limit under polling load.

## 6. Phone numbers — HMAC with a per-venue salt

`Venue.phoneSalt` is a column, not an environment variable and not a constant.
Each venue gets its own, so the same phone number hashes differently at every
venue and **no cross-venue join is possible in V1 by construction** — which is
the DPDP position in PLATFORM.md §7, and it is structural rather than a policy
promise.

Consequences that are features, not bugs:

- A raw phone number is never stored, so it cannot be exported, subpoenaed out
  of the database, or leaked in a dump.
- Losing a venue's salt makes its identities permanently unreadable. That is
  acceptable — recognition is a nicety, and the alternative is a joinable
  cross-venue identity graph, which is on the never-build list.

## What is deliberately not here

No payment processing, so there are no card details to protect. No guest
accounts, so there are no passwords to leak. Both are on the never-build list
in PLATFORM.md §12, and the reduced attack surface is part of why.
