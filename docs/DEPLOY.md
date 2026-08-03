# Deploy — the runbook for build item 8

Everything in this file needs an account or a credential, which is why it is the one build item
that could not be finished from inside the repo. The code side is done: `vercel.json` carries the
region, the build command and the cron; `npm run check:env` refuses a misconfigured deployment
before it can replace a working one.

Read it start to finish before touching anything. Two steps are irreversible in practice — the
public origin gets printed onto paper, and the pilot database is the evidentiary basis of the
business.

---

## 0. Before you start

You need four accounts. Three are free at this scale.

| What | Why | Blocking? |
|---|---|---|
| **Neon Postgres**, region `ap-southeast-1` (Singapore) | The functions are pinned to `sin1`; a database in another region adds a round trip to every poll | Yes |
| **Vercel** | Hosting and Cron | Yes |
| **Resend**, with a **verified sending domain** | Operator sign-in. Until a domain is verified Resend delivers only to the address that owns the account, which means only you can sign in | Yes |
| **Anthropic API key** | Menu extraction from a photo or PDF | No — CSV and typed entry still work, and the deploy is allowed through with a warning |

---

## 1. Decide the public origin first

`NEXT_PUBLIC_BASE_URL` is inlined at build time and **printed onto the table tents**. Paper cannot
be redeployed. Settle the final domain before the first build, not after.

If the pilot runs on a `*.vercel.app` domain, that is fine — but it must be the *production* alias,
not a per-deployment URL, or every reprint invalidates the last batch of tents.

## 2. Create the database

In Neon, create the project in **Singapore (`ap-southeast-1`)**. Copy both connection strings:

- **`DATABASE_URL`** — the **pooled** one. Its hostname contains `-pooler`. Used at runtime.
  Serverless opens a connection per invocation and this product polls; an unpooled runtime URL
  exhausts the connection limit at peak, which is the one hour it must not.
- **`DIRECT_URL`** — the **unpooled** one, no `-pooler`. Used only by `prisma migrate deploy`.
  A transaction-mode pooler breaks the migration engine's advisory locks.

The pooled hostname is the direct one with `-pooler` appended to the endpoint id, before the first
dot. `check-env` warns if `DATABASE_URL` has no `-pooler` — it warns rather than refuses, because a
host other than Neon may pool elsewhere.

## 3. Generate the two secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # CRON_SECRET
```

`SESSION_SECRET` signs guest, staff **and** operator cookies. Rotating it signs everyone out, which
is the intended effect but not one to discover mid-service. `check-env` refuses anything under 32
characters: a forged staff cookie is somebody else's venue.

`CRON_SECRET` is the one most likely to be forgotten, because nothing breaks loudly without it —
`/api/cron/weekly-report` answers 404 and the Monday report simply never arrives. `check-env`
refuses a deploy without it for exactly that reason.

## 4. Create the Vercel project

Import the repo. `vercel.json` already sets:

- `regions: ["sin1"]` — next to the database.
- `buildCommand: npm run check:env && prisma generate && prisma migrate deploy && next build`.
  The check runs **first** so a missing `DIRECT_URL` is reported by name instead of as a Prisma
  error four steps later, and so a bad environment fails the build while the previous deployment
  keeps serving.
- The cron: `/api/cron/weekly-report` at `30 3 * * 1` UTC = **09:00 IST Monday**. A venue outside
  IST needs its own handling; nothing in the code does that yet.

## 5. Set the environment variables

All of these go in the Vercel project, scoped to Production (and Preview, if you use previews —
`check-env` treats a preview as a real deployment, because real people open preview URLs).

```
DATABASE_URL          pooled Neon URL (hostname contains -pooler)
DIRECT_URL            unpooled Neon URL
SESSION_SECRET        64 hex chars from step 3
NEXT_PUBLIC_BASE_URL  https://your-final-domain          ← https, never localhost
RESEND_API_KEY        re_...
EMAIL_FROM            Interlude <signin@your-verified-domain>
CRON_SECRET           64 hex chars from step 3
ANTHROPIC_API_KEY     sk-ant-...   (optional — omit and menu photo/PDF reading is unavailable)
AI_MODEL              claude-haiku-4-5   (optional; this is the default)
```

**Do not set `EMAIL_TRANSPORT` or `AI_TRANSPORT`.** Both are test waivers and `check-env` refuses a
deployment that carries either. `EMAIL_TRANSPORT=console` would write sign-in links into a
serverless log nobody reads while `/signin` still says "check your email"; `AI_TRANSPORT=mock`
would hand an operator the test fixture instead of their own menu, at the exact moment the product
was meant to win them.

To check the list before deploying, from a shell with the same variables set:

```bash
VERCEL_ENV=production npm run check:env
```

It names everything wrong at once. One redeploy per missing variable is how a Saturday launch
becomes a Sunday one.

## 6. Deploy

The build runs the migrations. There is nothing else to run.

**Do not run `prisma db seed` against the pilot database.** The seed creates a demo Delhi venue with
~40 items and a full config — useful on a laptop, and pollution in production. See step 7 for why
that matters more than it sounds.

---

## 7. Smoke test — and the trap in it

TODO item 8 says: *deploy, seed, open `/t/<token>` on a real phone.* Do the first and the third.
Skip the seed, and read this before you play a single round.

**`scripts/pilot-report.mts` pools every venue in the database, unfiltered.** A venue only drops out
if it has no runs and no tented tables. So a smoke-test venue that you actually open a service on
and play a round through **enters the pooled pilot numbers** — its scan rate, its add-ons, its
contribution. On a pilot sized at ~200 tented tables, a handful of fake rows is not noise.

Two ways to handle it, and you should pick one deliberately:

1. **Delete the smoke-test venue's rows before the pilot weekend.** Simple, and it works, but it
   depends on remembering.
2. **Smoke test by signing up a real pilot venue through `/signup` and stopping before you open a
   service.** This is better: it exercises the onboarding path, which is the thing you most need
   working on Friday, and it leaves no play data behind.

**And do not switch loyalty on at a pilot venue during a measurement weekend.** `loyaltyEnabled`
defaults to `false` for exactly this reason. A stamp card changes who comes back, which is the
variable the arm split is measuring: a guest stamped on a LIVE Friday is likelier to return, and if
they return on a CONTROL Saturday they arrive carrying intent formed by the treatment and spend it
on the control arm's bill. The delta absorbs that as noise pushing toward zero and nobody reading
the number can see it. `pilot-report.mts` prints `Loyalty: on/off` for every pooled venue and
**withholds the attach delta entirely** if any of them had it on — but the cheaper fix is to leave
it off until the measurement weekend is over.

Either way the checks are:

- `/signup` → `/onboarding` → all six steps → a printable QR. On a phone, not a desktop.
- Sign-in email actually arrives. If it does not, the sending domain is not verified.
- `/v/<venueToken>` → table picker → `/t/<qrToken>` on a **real phone**, not an emulator. The
  countdown is driven by a server timestamp, so lock the phone mid-round and confirm it has not
  desynced when you unlock it.
- A **control** table must fail indistinguishably from a closed venue. If you can tell them apart,
  the experiment is contaminated.
- Print a tent sheet from `/tents` and scan it **off paper**. This is where a wrong
  `NEXT_PUBLIC_BASE_URL` finally shows up, and by then it is a stack of wasted paper.
- `/floor/<venueSlug>` and `/pass` on the staff phones, with venue PINs.

## 8. Verify the cron before Monday

Do not wait for Monday to find out. From a shell:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/weekly-report
```

A 404 means the secret does not match — the route refuses rather than running open, because it
emails a venue's P&L. A JSON body with `sent`, `venues` and `skipped` means it works. `skipped`
entries name the reason per venue, which is the only place a "no operator to send to" or a
misconfigured mailer surfaces.

---

## Still open after this

- **The bill parser has never seen a real POS export.** `/dash/import` and its tests run against
  fixtures. Get one real end-of-day export from one pilot venue and run it through before the
  weekend, because tier 2 takes the dashboard headline the moment the first export lands.
- **Voice on the review screen.** Typed works end to end; speech is in *Later*.
- **A venue outside IST.** The cron is a single UTC expression.
