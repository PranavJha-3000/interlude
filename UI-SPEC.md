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

**Enforcement:** `next/font` is imported **only** in `src/app/fonts.ts`, which exports the three
faces and an `operatorFontVars` string. Exactly two entry points apply it: `(operator)/layout.tsx`,
and `src/app/page.tsx` — the landing page is an operator surface but sits at the root rather than
inside the group, because that group's layout renders the signed-in nav shell and `/` is read by
someone who has never signed in. Next.js preloads font files per-route, so a route that imports
neither pays nothing. A `next/font` or `@/app/fonts` import anywhere under `(guest)` is a budget
regression and should fail review.

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

**Operator** — three faces: **IBM Plex Sans** for prose, **IBM Plex Mono** for every number and every
`reason` string, **Instrument Serif** for display at 28px and up.

**Instrument Serif appears in exactly four places**, and the scarcity is the point — it is what makes
the landing page feel authored rather than generated:

1. The landing wordmark and the one `<h1>`
2. The `/dash` headline number **only when contribution is negative**
3. The tent's wordmark
4. The guest's win heading — *with the caveat below*

**`font-display` and `font-mono` resolve differently per surface, and that is deliberate.**
`src/app/fonts.ts` is applied on the operator layout and the landing page and nowhere else, so it
defines `--font-instrument` and `--font-plex-mono` on those subtrees only. Elsewhere those variables are
undefined and the fallback in the token wins — Georgia for display, the system monospace for figures.
So the guest route can use the same two utilities and pay **zero bytes**, while the operator gets the
real faces. A `next/font` import under `(guest)` would put ~30KB of webfont on a phone whose entire
discretionary budget is 15KB; the fallback stack is not a compromise here, it is the mechanism.

Everything below applies to the operator surfaces.

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

Tokens live in `globals.css`. **No new colour tokens without editing this table first.**

The palette is warm on purpose. Heat drives appetite and arousal — it is why quick-service
restaurants and arcades both live there — and this product is a game played over food, whose whole
moment is "beat the kitchen before the food lands."

**The difficulty that shapes everything below:** red, amber and green already carry *meaning* here.
The chef's load switch is the biggest control in the product, and the owner's headline number turns
red only when contribution is negative. An ambient palette of reds would drown its own alarms.

### The rule

**Saturation is information.** Every ambient colour is a low-chroma warm. The only saturated colours
in the product are the three load hues, the loss red, and one accent — and the accent is deliberately
duller than all of them, so status always outshouts brand, on any surface, in any future feature.
Heat comes from temperature and type, not from saturation.

This is the rule to enforce in review, because it survives new surfaces. "Heat only on certain
routes" would not — there are four more operator screens coming.

A corollary worth stating separately: **status colours own the dark.** The staff surfaces are
near-black and the load hues are the only chroma in the room. The accent never appears on them.

### Light surfaces

Two grounds, because the guest and the operator are not reading the same kind of screen. Cotton is
the operator's; clay is the guest's, and doubles as the panel colour on cotton.

| Role | Token | Value | On cotton | On clay | Usage |
|---|---|---|---|---|---|
| Operator ground | `paper` | `#faf5ee` | — | — | Landing, `/dash`, `/tents` |
| Guest ground / panel | `warm` | `#efe4d4` | — | — | Guest phone; cards and panels on cotton |
| Line | `line` | `#dccebb` | 1.28 | — | Borders, dividers |
| Text | `ink` | `#2b211a` | 14.50 | 12.52 | Body copy, primary buttons |
| Deep umber | `ink-warm` | `#4a3527` | 10.58 | 9.14 | Subheads, table-header rule |
| Muted text | `muted` | `#6e5b49` | 5.95 | 5.14 | Captions, reasons, secondary labels |
| **Accent** | `accent` | `#a8380b` | 5.98 | 5.17 | **See the reserved list below** |
| Accent wash | `accent-soft` | `#ebccb8` | 1.40 | 1.21 | Pressed state on add-on options |
| Alarm | `bad` | `#b01e1e` | 6.35 | — | **Negative contribution only** |

`paper` text on an `accent` fill is 5.98. `staff-ink` on an `ink` fill — the guest's primary button —
is 13.20. Every ink weight clears AA on **both** grounds, which is the constraint that set them: the
guest surface is read at 20% brightness, so even the softest has to carry body copy.

### Dark surfaces — `/floor` and `/pass` only

| Role | Token | Value | On ground | On panel | Usage |
|---|---|---|---|---|---|
| Ground | `staff-ground` | `#161210` | — | — | `.surface-staff` background |
| Panel | `staff-panel` | `#221b16` | — | — | Raised rows |
| Text | `staff-ink` | `#f2eae0` | 15.62 | 14.25 | Body copy on dark |
| Muted | `staff-muted` | `#a99a8b` | 6.81 | 6.21 | Secondary text on dark |
| Load GREEN | `load-green` | `#3ddc84` | 10.43 | — | Kitchen GREEN, add-on ack row |
| Load AMBER | `load-amber` | `#ffb648` | 10.67 | — | Kitchen AMBER, "tented" arm marker |
| Load RED | `load-red` | `#ff5b3d` | 6.04 | — | Kitchen RED, veto, refused PIN |

**An active fill carries `text-staff-ground`, never white.** These hues are bright because they must
read across a pass; white on them is about 1.8:1. Dark text on them is 6.1:1 at worst.

**Why light and dark status are separate tokens.** They used to be one set. The single `bad`
(`#9b2c2c`) sat at **2.48:1** on the staff ground and `good` at **2.97:1** — both far below AA — which
is why neither could honestly be used as text there, and why an implementer building the venue-scoped
sign-in had to reach for a filled band instead of coloured type. One token cannot serve a cream page
and a near-black tablet.

### Accent discipline

**Accent is reserved for exactly these, and nothing else:**

1. The price line on a guest's won prize
2. The pressed state of a guest primary button and add-on option
3. The single primary CTA on the landing page and on each onboarding step
4. The active step marker in onboarding

It is **not** for links, not for headings, not for every interactive element, and not for the `/dash`
headline number — that number is `ink`, or `bad` when negative. Contribution turning red is the only
time the dashboard should raise its voice.

**`/dash` defects from the heat.** The money screen is `paper`, `ink` and one alarm. No accent, no
gold, no warm panel behind a figure. A P&L that looks promotional undercuts the one claim this
product rests on, and arousal palettes read as less trustworthy exactly where trust is the product.

**Known exception, recorded rather than hidden:** `/floor` fills its redemption rows with `accent`,
which is not on the list above. It predates this table. The row is the single most urgent action on
the server's screen and nothing else on that surface competes for the colour, so it stays until
`/floor` is revisited — but it is drift, not precedent.

**Focus rings are part of the colour contract, not an afterthought.** 2px accent at 2px offset on
light grounds; 2px `staff-ink` on the dark ones. **The offset is load-bearing.** It puts a gap of
ground on both sides of the ring, so the ring is measured against the ground (5.98:1 on cotton) —
without it, a ring around a dark `ink` button would be judged against the button at 2.42:1 and fail
WCAG 1.4.11. Declared globally in `globals.css`, so a new control cannot forget it.

**Print is not a surface this palette applies to.** The QR on a table tent is pure `#000000` on pure
`#ffffff` with the full 4-module quiet zone, never tinted and never sitting directly on cotton or
clay. A brand-coloured QR is a scan-rate problem dressed as a brand decision, and a scan failure is
the entire funnel.

**Dark mode: no.** `color-scheme: light` is declared and the staff surfaces are permanently dark by
design. Guests scan for four minutes; a theme toggle is a preference control for a product nobody
lives in.

**What was rejected and why it matters:** the first palette was cream plus terracotta
(`#fbf7f0` / `#b4451f`) — not wrong, but the look an AI reaches for by default, and it did nothing
for the arousal moment the guest surface is built around. The second attempt went the other way, hot
enough that the accent sat 16° of hue from the crimson alarm and a brand button could be misread as a
loss. What shipped keeps the heat in the grounds and the type, and spends saturation only on things
that mean something.

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

- **`/floor` fills its redemption rows with `accent`**, which is not one of the four reserved uses.
  Recorded in §5; stays until `/floor` is revisited.
**Fixed:** the stale `globals.css` header comment claiming a sub-100KB budget now states the
measured rule — ≤15KB over the framework floor, 200KB ceiling. The type decision is applied: IBM
Plex Sans + Mono + Instrument Serif ship on the operator subtree and the landing page via
`src/app/fonts.ts`, and the guest route still imports no font.

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
