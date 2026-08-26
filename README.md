# Interlude

Interlude turns a restaurant table QR into a short, food-native guest experience. Guests play while they wait for food; the platform uses the venue's menu, kitchen load, prize rules and guardrails to offer relevant add-ons. Owners get a dashboard, staff and kitchen surfaces, printable QR tents, bill import, review hand-off, private feedback and optional loyalty.

The product is multi-tenant and designed for a mobile-first restaurant flow:

- **Guests:** `/v/[venueToken]` and `/t/[qrToken]`
- **Floor staff:** `/floor/[venueSlug]`
- **Kitchen:** `/pass`
- **Operators:** `/signup`, `/onboarding`, `/dash`, and `/tents`

`PLATFORM.md` is the product and architecture reference. `docs/DEPLOY.md` is the production runbook.

## Local setup

Requirements: Node.js 20+ and a PostgreSQL database (Neon Postgres is the production target).

```bash
npm ci
Copy-Item .env.example .env
```

Set at least `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, and `NEXT_PUBLIC_BASE_URL` in `.env`. For local development, email logs to the terminal when no Resend key is configured and menu extraction uses the deterministic mock when no Anthropic key is present.

Create the local development schema and demo data:

```bash
npm run db:push
npm run db:seed
npm run dev
```

The seed resets its target database. Use it only with a dedicated local/development database, never with pilot or production data. It creates two demo venues:

| Surface | Pilot credentials |
| --- | --- |
| Operator | `owner@example.com` / `pilot-owner-dev` |
| Floor | `/floor/pilot` — PIN `1234` |
| Kitchen | `/pass` — PIN `5678` |

Change the seed credentials before using any non-development database.

## Automated verification

Run these before handing off a change:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
```

The Playwright suite runs a production build on a Pixel 7 viewport and directly arranges test state in the configured database. Start from freshly seeded **development-only** data, then run:

```bash
npm run test:e2e
```

It starts `next start` on port `3200`; set `E2E_BASE_URL` only when targeting an already-running test instance. The suite uses `EMAIL_TRANSPORT=console` and `AI_TRANSPORT=mock` only for its isolated test build. Never set either variable in a deployment.

## End-to-end acceptance checklist

Use this as the real-device pass after the automated suite. Do it against a safe test venue; not against an active measurement weekend.

1. On a phone, open `/signup`, complete the six-step onboarding, and generate a printable QR.
2. Confirm the sign-in email is delivered. In production, its sender domain must be verified in Resend.
3. Scan the venue QR, choose a table, then scan the table QR from **printed paper**. Play a round, lock and unlock the phone, and confirm the server-timestamp countdown remains correct.
4. Check `/floor/[venueSlug]` with the floor PIN and `/pass` with the kitchen PIN. Change kitchen load, add a veto, and confirm the guest offering respects both.
5. Exercise the bill-wait routes: review hand-off, private feedback, and (if enabled) loyalty phone capture.
6. Upload one representative POS export at `/dash/import` and inspect the dashboard and activity/refusal logs.
7. Call the weekly-report route with its bearer secret and verify its JSON response before relying on Monday's cron.

For production-specific rules and the exact cron command, follow [the deployment runbook](docs/DEPLOY.md). In particular: choose the final HTTPS origin before printing QR tents, do not seed production, and do not run a fake game through a pilot database because it affects pooled pilot reporting.

## Production deployment

Vercel builds with `npm run check:env && prisma generate && prisma migrate deploy && next build`. Configure the production variables described in [docs/DEPLOY.md](docs/DEPLOY.md): pooled `DATABASE_URL`, unpooled `DIRECT_URL`, `SESSION_SECRET`, final `NEXT_PUBLIC_BASE_URL`, Resend credentials, and `CRON_SECRET`; `ANTHROPIC_API_KEY` is optional.

The deployment is pinned to Singapore (`sin1`) to sit near the intended Neon database. Do not set `EMAIL_TRANSPORT` or `AI_TRANSPORT` in Vercel.

## Useful commands

```bash
npm run dev             # local development server
npm run build           # production build
npm run start           # serve a production build
npm run check:env       # validates deployment variables when VERCEL_ENV is set
npm run db:generate     # regenerate Prisma client
npm run db:migrate      # create/apply a development migration
npm run db:studio       # inspect the configured database
```

## Documentation

- [Platform reference](PLATFORM.md)
- [Production deployment runbook](docs/DEPLOY.md)
- [Security notes](SECURITY.md)
- [Execution checklist](TODO.md)
