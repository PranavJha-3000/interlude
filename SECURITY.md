# Secrets and data handling

Eight controls, four of them enforced by tooling rather than by remembering. The last two arrived
with multi-tenancy: once restaurants sign themselves up, tenant isolation stops being tidiness and
becomes the boundary that keeps one venue's P&L out of another's dashboard.

## 1. `server-only` build guard — enforced

`src/lib/db.ts` imports `server-only`. If any client component ever imports the
database module, **the build fails** rather than bundling the connection string
into JavaScript a guest downloads. This is the control that matters most,
because Next.js will otherwise do exactly that without complaint.

The same guard belongs on any module that touches a secret — the phone HMAC
helper, the staff PIN verifier, `src/lib/operator-session.ts`, and
`src/lib/email.ts`, which holds the Resend key.

## 2. `NEXT_PUBLIC_` secret lint rule — enforced

`NEXT_PUBLIC_` is not a namespace; it is an instruction to inline a value into
the client bundle. `eslint.config.mjs` makes it an **error** to read
`process.env.NEXT_PUBLIC_*` where the name contains `KEY`, `SECRET`, `TOKEN`,
`PASSWORD`, `SALT`, `CREDENTIAL` or `DATABASE`.

`NEXT_PUBLIC_BASE_URL` is intentionally allowed — it is a public origin used to
build the QR links printed on the table tents and the venue QR, and to build the
absolute magic-link URL that goes into an email.

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

It signs the staff session cookie and the operator session cookie both. To
rotate: generate a new one, update Vercel, redeploy. Every staff session, every
owner session and every guest cookie is invalidated, which is the intended
effect — an owner being signed out is a smaller problem than a leaked secret
still being honoured.

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5. Vercel environment variables — mark them Sensitive

When adding `DATABASE_URL`, `SESSION_SECRET` and `RESEND_API_KEY` in Vercel:

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

**As of V1.5 this is live rather than dormant.** `src/lib/phone-identity.ts` is the
only thing that hashes, it is `server-only`, and it refuses an empty salt rather
than hashing without one — an unsalted hash of a ten-digit number is reversible
by brute force in seconds, since the whole keyspace is 10^10. Numbers are
normalised first (`core/mechanics/phone.ts`) because two spellings of one number
would otherwise become two guests, permanently and undetectably.

Three limits worth stating rather than discovering:

- **There is no operator-side phone lookup, deliberately.** A one-way hash plus a
  search box is a re-identification oracle, and it would answer the exact question
  this section claims the data cannot. Erasure is a guest surface only, and it
  responds identically whether or not the number was found.
- **Erasure is best-effort against backups.** Deleting the row removes it from the
  live database. It does not reach a Postgres point-in-time snapshot. The ESLint
  block on the phone routes bans `console` outright for the same reason — a raw
  number in a serverless log is the one copy erasure cannot reach.
- **Salt rotation has no code path.** Rotating one would orphan that venue's
  identities with nothing to clean them up. Out of scope for V1.5; see TODO.md
  *Later*.

## 7. Magic-link tokens — a credential, treated like one

The owner's sign-in link is a bearer credential that travels through email, which
is not a secure channel. Four properties, all of them tested:

- **Hashed at rest.** The database stores a SHA-256 of the token, never the
  token. A database dump must not yield working sign-in links.
- **Single-use.** `consumedAt` is set inside the same transaction that issues the
  session. A link forwarded, quoted in a reply, or sitting in a mail archive is
  already spent.
- **Short-lived.** Minutes, not days. An expired link offers to send a new one
  rather than explaining what went wrong.
- **Rate-limited per email.** Otherwise the endpoint is a free mail cannon
  pointed at anyone whose address is guessed.

Requesting a link must respond identically whether or not the address belongs to
an operator. A different response is an account-enumeration oracle.

`RESEND_API_KEY` lives only in `.env` and Vercel, and is read only inside
`src/lib/email.ts`, which imports `server-only`. **In development there is no key
and no network call** — the link is written to the console. That is a
convenience, but it is also the reason a developer never needs production email
credentials on their laptop. In a deployed build the same absence is refused
outright rather than falling back to the console, because a sign-in page that
says "check your email" and sends nothing locks out every operator with no error
anywhere to say why.

## 7a. Operator passwords — the second door, and what it costs

Sending anything at all requires a verified sending domain, and the pilot does
not have one. Until it does, every magic link goes nowhere, so `/signin` is an
email and a password (`src/lib/operator-password-auth.ts`).

**This is a knowing weakening of §7, not an improvement on it.** Recorded here so
it is reversed deliberately rather than forgotten:

- **Sign-up enumerates. Sign-in does not.** Telling someone their address already
  has an account is the only way they can act on it, so sign-up says so. Sign-in
  gives one answer — "Email or password is incorrect" — to a wrong password, an
  unknown address, a malformed one, and an operator who only ever had a link.
- **The timing says the same thing as the message.** A missing row would
  otherwise skip the ~100ms scrypt and turn the oracle back on as a stopwatch, so
  the unknown-address branch verifies against `DUMMY_PASSWORD_HASH` and throws
  the result away.
- **Nobody's address is verified.** No email is sent, so nothing proves the
  person typing an address can read it. Tolerable only because the account is
  worth nothing until onboarding attaches a venue to it.
- **There is no password reset,** because a reset needs the email channel whose
  absence caused all of this. An owner who forgets their password needs a hand on
  the database.
- **Hashed with scrypt** via the same `scrypt:<salt>:<hash>` scheme as the staff
  PIN. `passwordHash` is nullable: an operator created by a magic link has none,
  which means "cannot use this door", never "any password will do".
- **Throttled per IP, and deliberately never per address.** A per-address lockout
  is the usual advice and is wrong here — with no email there is no recovery
  path, so it would hand anyone who knows an owner's address the ability to lock
  them out of their own venue mid-service. `OperatorLoginAttempt` stores the IP
  and no address, because a log of which addresses were guessed at is the
  operator list §7 refuses to hand out.
- **A changed password does not end live sessions.** Harmless only while there is
  no way to change one; whoever builds that screen owns this too.

Magic link is dormant, not deleted: `/signin/verify`, `src/lib/operator-auth.ts`
and `src/lib/magic-link.ts` are untouched and tested, and an already-issued link
still signs someone in. When a domain is verified, the link returns to the front
door and most of this section goes away.

## 8. Tenant isolation — venue scoping, from the session only

Multi-tenancy means another restaurant's revenue, margins and menu are one
mistaken query away. The rule is mechanical:

**Every operator query takes its `venueId` from `requireOperator()`, never from a
URL parameter, a form field, or a header.** A route that accepts a venue id from
the client is a cross-tenant leak, and TypeScript will not catch it — a `string`
from the session and a `string` from a URL are the same type.

Enforced by test, not by care: signed in as venue A, a request for venue B's
dashboard, menu, config or QR must 404 — not 403, which confirms the venue
exists. The staff PIN is scoped the same way and additionally by capability: a
staff session can fire orders, acknowledge add-ons and confirm redemptions, and
can read no metric and change no config, at its own venue or any other.

## What is deliberately not here

No payment processing, so there are no card details to protect. No guest
accounts, so there are no passwords to leak. Both are on the never-build list
in PLATFORM.md §12, and the reduced attack surface is part of why.
