# Interlude — UI Design Contract

> Visual and interaction contract for every surface. Locks spacing, typography, colour and
> copywriting **before** the operator screens get built, so phases 4–8 don't accumulate design debt
> one ad-hoc `className` at a time.
>
> Status: **draft, self-reviewed.** This was written outside the GSD workflow — the repo has no
> `.planning/` tree, so `gsd-ui-researcher` and `gsd-ui-checker` never ran. The six-dimension
> sign-off at the bottom is my own review, not an agent's, and is labelled as such.

**Scope:** all four archetypes. The guest, floor and pass surfaces are already built — this documents
what they are so the new operator screens match them instead of inventing a second look.

---

## 1. The two halves

The product has one palette and **two typographic identities**, and the split is not a style choice —
it falls out of a constraint that already exists in the codebase.

| | Guest + staff | Operator |
|---|---|---|
| Routes | `/v/[venueToken]`, `/t/[qrToken]`, `/floor`, `/pass` | `/`, `/signin`, `/onboarding`, `/dash/*`, `/tents` |
| Device | A phone at 20% brightness in a dim dining room; a tablet with wet hands | A laptop in a back office, or a phone on a Sunday morning |
| Budget | Framework floor +≤15KB. **No web font** | Static or low-traffic. A web font is affordable |
| Read in | Seconds, one-handed, mid-service | Minutes, seated, deliberately |

**So: the operator surfaces get a display face the guest route cannot have.** Same palette, same
spacing, different voice. The guest side stays on the system stack because every kilobyte there is
measured; the owner's side can afford personality and needs it, because it is the surface that has to
sell.

**Enforcement:** `next/font` may be imported **only** in `src/app/(operator)/layout.tsx`. Next.js
preloads font files per-route, so this keeps the guest bundle untouched. A `next/font` import
anywhere under `(guest)` is a budget regression and should fail review.

---

## 2. Design system

| Property | Value |
|---|---|
| Tool | **none** — no shadcn, no Radix, no Base UI |
| Component library | none |
| Icon library | **none** — no icon set is installed and none should be |
| Styling | Tailwind v4, `@theme` tokens in `src/app/globals.css` |
| Guest/staff font | System stack (`--font-sans`) |
| Operator font | **IBM Plex Sans** + **IBM Plex Mono**, self-hosted via `next/font/google` |

**Why no component library, stated once so it stops being re-litigated:** every shadcn block is a
client component. The guest route's whole discretionary budget is 15KB and it currently spends ~3KB.
One `<Dialog>` would eat the lot. The staff and operator surfaces have no such constraint but share
the codebase, and a component library that is only allowed in half a repo is a library nobody can
reason about. The surfaces are forms, lists and one big number — the parts that already exist in
`src/app/(guest)/t/[qrToken]/ui.tsx` cover it.

**Why IBM Plex:** not the elegant editorial serif that cream backgrounds usually attract. Three
reasons specific to this product:

1. **Plex Mono's tabular figures.** The operator's world is numbers in columns — price, food cost,
   contribution, depth %, attach-rate delta. The most characteristic typographic artifact on these
   screens is a column of rupee figures that has to align. That is the type decision worth making.
2. **Plex Devanagari exists.** Hindi is a planned translation job, not a rewrite (PLATFORM.md §13).
   Choosing a family that already covers Devanagari means the translation needs no second type
   decision and no fallback-metrics work.
3. It reads as instrument rather than magazine, which is what a P&L screen should be.

---

## 3. Spacing

Tailwind's default scale, which is already 4px-based. **No custom spacing tokens** — a second scale
is how two screens end up 2px apart forever.

| Token | Value | Usage |
|---|---|---|
| `1` | 4px | Icon-less inline gaps, `mt-1` under a label |
| `2` | 8px | Compact list gaps (`gap-2` on the pass pool) |
| `3` | 12px | Grid gaps, button rows |
| `4` | 16px | Default padding inside a row |
| `5` | 20px | Guest screen horizontal padding (`px-5`) |
| `6` | 24px | Card padding |
| `8` | 32px | Section padding, guest vertical rhythm (`py-8`) |
| `10` | 40px | Between major sections (`mt-10`) |
| `16` | 64px | Landing page section breaks |

**Touch-target exceptions — these are minimums, not spacing, and they are load-bearing:**

| Target | Minimum | Where |
|---|---|---|
| Guest primary button | `min-h-14` (56px) | Tapped one-handed, often holding a drink |
| Venue-QR table tile | `min-h-16` (64px) | Four across at 390px |
| Staff action button | `min-h-11` (44px) | `/floor` rows, veto toggles |
| Kitchen load switch | `min-h-28` (112px) | Hit with a knuckle or a wrist, wet hands |

Operator surfaces may go to 40px controls — a mouse is precise and a back office is calm.

---

## 4. Typography

**Guest and staff** — system stack, no web font.

| Role | Size | Weight | Tracking | Where |
|---|---|---|---|---|
| Display | `text-6xl` tabular | 600 | normal | The one number on `/dash` |
| Heading | `text-3xl` | 600 | tight, balanced | Guest `<Heading>` |
| Body | `text-lg` | 400 | relaxed, pretty | Guest `<Body>`, staff rows |
| Label | `text-sm` | 400–600 | wide, uppercase | Section headings, eyebrows |
| Micro | `text-xs` | 400 | widest, uppercase | Venue name, reason strings |

**Operator** — Plex Sans for prose, **Plex Mono for every number and every `reason` string.**

That second rule is the one that matters. A `reason` is machine output quoted verbatim to a human
("High margin (71%), not selling, 4 days since the last one"). Setting it in mono marks it as
*the system talking* rather than us writing marketing copy, which is exactly the distinction the
audit-trail promise rests on. Prose and evidence must not look the same.

| Role | Face | Size | Weight |
|---|---|---|---|
| Landing display | Plex Sans | `clamp(2.5rem, 6vw, 4.5rem)` | 600, tight tracking |
| Section heading | Plex Sans | `text-2xl` | 600 |
| Body | Plex Sans | `text-base`/`text-lg` | 400 |
| **Figures** | **Plex Mono** | inherits | 500, `tabular-nums` |
| **Reason strings** | **Plex Mono** | `text-xs`/`text-sm` | 400, muted |

`tabular-nums` is mandatory on every rupee figure, percentage and count. A column of prices that
shifts as it updates is the fastest way to make a money screen feel untrustworthy.

---

## 5. Colour

Tokens already in `globals.css`. **No new colour tokens without editing this table first.**

| Role | Token | Value | Usage |
|---|---|---|---|
| Dominant (60%) | `paper` | `#fbf7f0` | Page background, guest + operator |
| Secondary (30%) | `warm` | `#f4ede1` | Cards, stat tiles, inset panels |
| Line | `line` | `#e2d8c8` | Borders, dividers |
| Text | `ink` | `#16130f` | Body copy |
| Muted text | `muted` | `#6f665a` | Captions, reasons, secondary labels |
| **Accent (10%)** | `accent` | `#b4451f` | **See the reserved list below** |
| Accent wash | `accent-soft` | `#f6e4dc` | Pressed state on add-on options |
| Positive | `good` | `#2f6b4f` | Kitchen GREEN, add-on ack |
| Caution | `amber` | `#b8860b` | Kitchen AMBER, "tented" arm marker |
| Destructive | `bad` | `#9b2c2c` | Kitchen RED, veto, negative contribution |
| Staff ground | `.surface-staff` | `#14120f` / `#f6f1e8` | `/floor` and `/pass` only |

**Accent is reserved for exactly these, and nothing else:**

1. The price line on a guest's won prize
2. The pressed state of a guest primary button and add-on option
3. The single primary CTA on the landing page and on each onboarding step
4. The active step marker in onboarding

It is **not** for links, not for headings, not for every interactive element, and not for the `/dash`
headline number — that number is `ink`, or `bad` when negative. Contribution turning red is the only
time the dashboard should raise its voice.

**The named risk:** cream-plus-terracotta is a well-worn default. It stays because it is right for a
phone held at low brightness in a dim room and because terracotta belongs to this food vernacular —
not because it was the first thing to hand. If the guest surface is ever restyled, that reasoning is
the thing to re-examine, not the hex values.

**Dark mode: no.** `color-scheme: light` is declared and the staff surfaces are permanently dark by
design. Guests scan for four minutes; a theme toggle is a preference control for a product nobody
lives in.

---

## 6. The landing page — thesis and signature

The one screen with real freedom, and the only one that has to *sell*. Locking it here so it doesn't
become a gradient and three feature cards.

**Audience:** an owner or F&B head who has already been sold "engagement" by somebody and did not
get more money. Assume suspicion, not curiosity.

**Thesis:** the dead time between ordering and eating is unsold inventory, and the product decides
what to do with it *inside fences the restaurant sets*.

**Signature element — the decision card.** The hero is not a screenshot, not a phone mockup, and not
a big stat with a gradient. It is a rendered fragment of the product's own audit trail: what the
engine put in tonight's pool and what it refused, each with its `reason`, set in Plex Mono.

```
┌─────────────────────────────────────────────────┐
│  TONIGHT, TABLE 12                              │
│                                                 │
│  IN    Tiramisu               ₹299   free       │
│        high margin (71%), not selling,          │
│        4 days since the last one                │
│                                                 │
│  OUT   Butter Chicken                           │
│        hero item — never discounted             │
│                                                 │
│  OUT   Rogan Josh                               │
│        kitchen is slammed (RED)                 │
└─────────────────────────────────────────────────┘
```

**Why this is the risk worth taking:** every competitor's landing page shows a happy phone. None of
them shows the machine declining to discount the thing that already sells. That refusal *is* the
pitch — "you set the fences, we optimise inside them" — and it is the one claim a screenshot cannot
clone. It is austere for a marketing hero, deliberately: the buyer trusts arithmetic more than
enthusiasm.

**Constraints on it:** server-rendered from real seed data or a static fixture, zero client JS, no
animation on first paint. If it needs a spinner it has already failed.

**Below the hero, in order:** what the guest experiences (three lines, no app, no signup) → what the
restaurant controls (menu, prizes, vetoes, kitchen load) → the honest measurement note (attach-rate
delta vs. same-night control, and that night one shows an app-side estimate) → one CTA.

**No pricing table, no logo wall, no testimonials.** There are no customers yet, and inventing social
proof on the front door of a product whose entire promise is honest measurement would be the single
most expensive lie available.

---

## 7. Copywriting contract

`src/strings/en.ts` is the **only** source of user-facing text. A literal in a component is a bug —
Hindi has to be a translation job, not a refactor.

**Voice, per archetype:**

| Archetype | Register | Never |
|---|---|---|
| Guest | Warm, short, second person, present tense | Anything implying a draw, wheel, lottery or chance |
| Server | Imperative, table-first, three words where possible | Metrics, percentages, praise |
| Chef | Blunt. State, not explanation | Apology, hedging, "please" |
| Owner | Plain arithmetic with the caveat attached | Hype, rounded-up numbers, unqualified claims |

**Locked copy:**

| Element | Copy |
|---|---|
| Landing CTA | **Get started** → `/signin` |
| Sign-in CTA | **Email me a link** |
| Sign-in sent state | "Check your email. The link works once and expires in 15 minutes." |
| Onboarding step CTA | **Save and continue** (never "Next") |
| Final onboarding CTA | **Print my QR codes** |
| Menu empty state | "No menu items yet." / "Add your first item, or import a CSV." |
| Prize-pool empty state | "Nothing in the pool right now." / reason strings explain why |
| Dash empty state | "No service running." |
| Destructive — deactivate item | "Deactivate {name}? It stops being offered as a prize. Past awards keep their record." |
| Destructive — delete rule | "Delete "{label}"? Guests matching it fall through to the next rule." |
| Error | "Something went wrong at our end. Your table's fine — try again." |

**Three copy rules that are compliance, not style:**

1. **Never "win a discount" or anything implying chance.** The guest wins on skill or buys at a fixed
   price (PLATFORM.md §7). This is a gambling-law line.
2. **The tier-1 dashboard caveat is not optional copy.** Net contribution is always labelled an
   app-side estimate until a bill export lands.
3. **A control table's screen must be byte-identical to a closed venue's.** Any copy change to
   `guest.closed` must keep `e2e/venue-qr.spec.ts` green.

**Action names survive the flow.** The button that says **Fire order** produces a row that says
*Order fired*. **Veto** produces *Vetoed*. **Confirm** produces *Done*.

---

## 8. Per-surface contracts

| Surface | Ground | Leads with | Must never |
|---|---|---|---|
| `/` | paper | The decision card | Fake social proof, pricing, a phone mockup |
| `/v/[venueToken]` | paper | "Which table are you at?" | Omit or mark control tables; write any row |
| `/t/[qrToken]` | paper | One heading, one action | More than one primary action on screen |
| `/signin`, `/onboarding` | paper | One decision per screen | Lose entered data on Back |
| `/floor` | `.surface-staff` | Whatever a guest is waiting on | Show a metric of any kind |
| `/pass` | `.surface-staff` | The GREEN/AMBER/RED switch | Put anything above the load switch |
| `/dash` | paper | One number, `text-6xl` | Merge tier 1 and tier 2 into one figure |
| `/dash/menu` | paper | The item list | Hard-delete anything an `Award` references |
| `/dash/prizes` | paper | The fences, then tonight's pool | Show a config value without its unit |
| `/tents` | paper + print CSS | Print instructions | Break `break-inside-avoid` |

---

## 9. Quality floor

Not negotiable, not announced in the UI:

- **Keyboard focus is visible on every interactive element.** Currently relies on browser defaults;
  operator surfaces must add an explicit `:focus-visible` ring since they are keyboard-driven.
- `prefers-reduced-motion` is already honoured globally in `globals.css`. Any new animation inherits
  it or it does not ship.
- Every form control has a real `<label>`. The venue-QR tiles carry `aria-label="Table 7"` because
  the visible text is a bare numeral.
- Responsive from 360px. The guest surface is `max-w-md`; operator surfaces cap at `max-w-4xl`.
- No layout shift from font loading — `next/font` with `display: swap` and a metric-compatible
  fallback, operator routes only.
- Colour is never the sole carrier of meaning. The kitchen load switch has text labels as well as
  colour; the arm marker says "Tented"/"Control" as well as changing shade.

---

## 10. Known drift to fix

- **`src/app/globals.css` header comment is stale.** It still states "the budget is under 100KB of JS
  and interactive in under 2s on 3G" — the rule that was measured and revised. It should read
  ≤15KB over the framework floor, 200KB regression ceiling. Fix when the operator layout lands.

---

## Six-dimension review

Self-reviewed, not agent-verified — `gsd-ui-checker` did not run.

| # | Dimension | Verdict | Note |
|---|---|---|---|
| 1 | Copywriting | **PASS** | Single source in `en.ts`; CTAs are verb+noun; empty and destructive states specified |
| 2 | Visuals | **PASS** | One signature element; no icon library; no decoration without a job |
| 3 | Colour | **PASS** | Accent restricted to four named uses; 60/30/10 holds; risk named rather than hidden |
| 4 | Typography | **PASS** | Two identities with a stated constraint-based reason; tabular figures mandated |
| 5 | Spacing | **PASS** | Tailwind's 4px scale only; touch minimums documented as minimums |
| 6 | Registry safety | **PASS** | No registry in use; the reason it stays that way is recorded |

**Open, deliberately:** the landing page's exact type scale and the decision card's final composition
are locked in intent here but will be judged on screen. Expect one revision after the first build.

**Approval:** pending — phase 4 build is the test.
