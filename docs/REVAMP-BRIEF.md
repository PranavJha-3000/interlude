# Interlude — UI Revamp Brief

**For Claude Code. Companion to the Pilot Build Specification v1.0 — that document still governs the game, the measurement design, the compliance rules and the engine. This one governs how the whole thing feels in the hand.**

You are not redecorating. You are rebuilding every surface of this product to a standard it has not been held to yet, and you are shipping it working — real data, real polling, real degradation behaviour — not as mockups, not as a Figma-in-code, not as a screen that renders a fixture and lies about it.

---

## Part one — The standard you are building to

Build this as if it were the first product of a new venture, launched by someone whose entire reputation rests on it, into a market that has never once been surprised by restaurant software.

That framing is not a mood. It cashes out into eight decisions you will make over and over:

**Start from the experience and work backwards to the technology.** Never the reverse. If the data model makes a screen awkward, change the data model. The guest waiting for food does not care that the countdown is server-issued; they care that it does not lie.

**Deciding what not to build is the job.** Every screen in this product currently has more on it than it needs. Your first pass on each surface is a deletion pass. You are allowed to ship a screen with three elements on it. You are not allowed to ship a screen with a control nobody will touch on a Saturday.

**The inside of the cabinet matters.** The refusal log is the part of this product that no guest will ever see, and it is the part the whole business rests on. It gets the same craft as the prize reveal. So do the error states, the empty states, and the screen a guest sees when Interlude is not running.

**Simple is harder than complex.** If a screen feels simple because you removed information the person needed, you have not simplified it, you have broken it. Simplicity here means: one job per surface, one glance to know what to do, and no second-guessing about what a control does.

**No preferences, no configuration, no onboarding tour.** The guest gets zero settings. Zero. Not a theme toggle, not a sound toggle, not a "how to play" modal. If a screen needs explaining, redesign the screen. The only configuration in this product lives with the operator, and even there it is three things during service and nothing else.

**Details are not details, they make the product.** The 200 milliseconds between a tap and the card settling. Whether the streak number nudges or snaps. Whether the table number on the tent is legible from a standing server's eye height. Whether the wrong-answer state feels like a loss or like a shrug. Get these right and the room feels it without being able to name it.

**Real artists ship.** Every commit leaves the product demoable. There is never a state of this repository where you would be embarrassed to hand a phone to a stranger.

**The demo is the design review.** The test for every screen: a founder standing in a loud dining room at nine on a Saturday, handing an unlocked phone to a guest who has never seen this before, saying one sentence and nothing more. If the guest hesitates, the screen failed. Not the guest.

---

## Part two — What a revamp does not get to touch

A visual revamp is the classic vector for quietly reopening settled decisions. It will not happen here. The following are closed. If a beautiful idea conflicts with any of them, the idea dies and you tell me why it was tempting.

**The compliance rules stand in full.** No chance mechanics anywhere, randomness banned by lint inside the engine and the mechanics module. Reviews never incentivised, never gated, never sentiment-filtered — the review module is constructed with no access to prize, award, life or game state, and no rating is captured before hand-off. Purpose-limited consent before anything is recorded. Phone numbers hashed with a per-venue salt. The floor is never put in an argument. If a redesign makes the review prompt prettier by putting it near a win screen, the redesign is wrong.

**The never-build list stands in full,** including under new names and including in brainstorms. No points, levels, badges or leaderboards. No cross-venue identity. No accounts before value. No spin wheels, scratch cards or anything with a random outcome. No payment processing. No multiplayer of any kind. No second mechanic. A revamp is exactly when a second mechanic tries to sneak in wearing a new coat.

**One mechanic ships.** Higher-or-lower on the venue's own menu. If you think of a better game, write it in a notes file and do not build it.

**Token discipline stands.** Every colour, type size, radius, duration and easing curve is a named token in one file. No raw hex, no magic numbers, no one-off values anywhere else in the codebase. If you need a value that does not exist, add a token and say what it is for.

**The accent ledger stands at four uses.** The won price on the guest phone beside the struck menu price. A primary button while pressed. The single landing-page call to action. The active step in the onboarding stepper. That is all. Not links, not headings, not icons, not borders, not the dashboard headline, and nothing at all on the pass. If you spend a fifth use, you have to remove one of the four and justify the trade.

**No hard-coded thresholds.** Not one price, duration, ratio, margin band or gate outside the config, including anything new you introduce during the revamp.

---

## Part three — One job per surface

Before you write a line of interface code, write down the single sentence that describes what each surface exists to do, and the single question it must answer at a glance. Then check every element on that surface against it. Anything that does not serve the sentence comes off.

**The guest phone.** Exists to make waiting for food feel like something instead of nothing. At a glance: *how long do I have, and what am I choosing between?* The guest never sees a metric, never sees a sales figure, never sees anything about the restaurant's business.

**The kitchen pass.** Exists to let a chef with wet hands, mid-service, three metres away, control what the engine may give away tonight. At a glance: *what state am I in, and what is on the list?* One switch, one list, one kill switch. Never a metric, never a revenue figure, never a graph.

**The server's phone.** Exists to tell one person what to do, at which table, right now. At a glance: *what is the oldest thing waiting for me?* One list, oldest first, one row one tap. Never a dashboard, never a metric, never a leaderboard of servers.

**The owner's dashboard.** Exists to show one number and prove it. At a glance: *did tonight make money, and can I see why?* The number, what it can and cannot see in plain language, the ledger behind it, and the refusal log.

**The landing page.** Exists to make an operator believe this product knows restraint. At a glance: *this thing refuses to give away my hero items.*

**The printed tent.** Exists to get scanned. At a glance: *there is a game, and it is about food I can win.*

---

## Part four — The materials

The design system already exists and it is good. Your job is to execute it with more precision than it has been executed with so far, not to replace it.

**The grounds are audience signals, not decoration.** Cotton for operator surfaces — landing, dashboard, printed tents. Clay for the guest phone. Iron for the kitchen pass and the server's floor list. Panel-iron for raised rows on iron. A person should be able to tell whose screen they are looking at from across a room, from the ground alone, before reading a single word. Test this literally: render all four at thumbnail size and check that they are unmistakable.

**Every figure is monospaced, without exception.** Currency, clock times, durations, counts, table numbers, streak, margins, percentages, cost prices. Tabular figures on, so numbers do not shift width as they tick. This is not a stylistic preference — it is the single most identity-carrying decision in the product, and it is what makes the dashboard read as an instrument rather than a marketing page. Audit for violations; there will be some.

**The display face appears in four places and nowhere else,** at 28px and above. Choose the four deliberately and write them down. Everything else is the body face.

**Saturation belongs to kitchen load, not to brand.** The three load colours are more saturated than the accent on purpose, so status outshouts identity on every surface. Do not undermine this by adding any other saturated element anywhere. Text on a load fill is always the darkest ink. The active load state is a filled block with dark text, readable by fill area and position alone — colour is confirmation, never the sole carrier of meaning. Verify this by rendering every screen in greyscale and checking that nothing becomes ambiguous.

### A warning about your own defaults

Your palette — warm cream ground, high-contrast serif display, burnt-sienna accent — is, by coincidence, almost exactly the look that machine-generated design converges on right now. It is the single most common tell in the category. Here it is a considered choice with a real argument behind it, so it stays. But it means the palette cannot be the thing that makes this product feel designed rather than generated. That distinctiveness has to come from somewhere else, and here is where it comes from:

- The monospace-every-number rule, held absolutely, including in places it feels excessive.
- The load-status chroma hierarchy — brand deliberately quieter than operational state, which almost nobody does.
- The refusal log rendered as the hero of the dashboard rather than a diagnostic panel.
- The near-total absence of motion, in a category that animates everything.
- The print tent, which is a real physical object and can carry weight that no screen can.

Those five are the identity. Spend your craft there. Do not spend it on a gradient, a glass panel, a glow, a card that lifts on hover, an emoji, or an illustration of a chef.

---

## Part five — Interaction physics

Write these as tokens and enforce them.

**Motion budget: the countdown is the only continuously moving element in the entire product.** The kitchen is the clock, so the clock is the only thing that moves. Everything else is discrete — a state either is or is not. No looping animations, no pulsing, no shimmer, no skeleton waves, no confetti, ever.

**Transitions are short and few.** One duration token for state changes, in the region of 160 to 220 milliseconds, with a single easing curve used everywhere. A tap resolves immediately; nothing waits on an animation to become interactive.

**The one orchestrated moment is the rung reveal.** When a guest reaches a rung, the countdown stops, the dish cards settle, and the prize name arrives — one beat, under half a second, no bounce, no celebration. This is the only place in the product where anything is staged. It earns its theatre by being the only one.

**Haptics: three, and no more.** A light tap on answering. A heavier one on reaching a rung. Nothing on a wrong answer — a buzz on losing a dessert reads as mockery. Nothing anywhere else.

**Sound: none.** No jingle, no chime, no click. A restaurant is loud, phones are on silent, and a sound effect in a dining room is embarrassing for the guest holding the phone.

**Reduced motion:** the countdown degrades to a static remaining figure, and the rung reveal becomes an instant state change. Nothing else needs to degrade because nothing else moves.

**Thumb geometry on the guest phone.** 390 pixels, one-handed, portrait. Everything tappable sits in the lower two-thirds. The two dish cards are the largest tap targets in the product and are separated by enough dead space that a mis-tap is not a lost dessert. Nothing important sits in the top-left corner.

**Tap targets on the pass** are sized for wet hands and glances, not for cursors — 64 pixels minimum, and the load switch is the physically largest control anywhere in the product.

**Everything is verified at twenty percent screen brightness** on a mid-range Android over the venue's own wifi. Not on a desk monitor. If you cannot test at that brightness, simulate it and then note that it still needs a real-device check before launch.

---

## Part six — The surfaces, one at a time

### The guest phone

Header on every state: venue name, then table number in the mono. That is the entire persistent chrome. No nav, no menu, no logo lockup, no footer.

**Before the fire.** The hardest screen to get right, because the guest has arrived early and there is nothing to do. It must not feel like a loading state. Explain that a clock starts when the kitchen starts their order and that beating it wins something off the menu, tell them to keep the page open because it wakes on its own, and disable the primary action with a label that says plainly there is nothing to do yet. Give this screen real craft — it is the first impression and it is currently the weakest thing in the product.

**The round.** Streak and countdown in the mono. A line stating when the kitchen fires their dish. Two dish cards, photo and name, one tap answers. Nothing else on the screen at all. Where a photo is missing, the card becomes typographic at the same size and weight — never a broken image, never a placeholder icon, and the typographic card should be good enough that you would not mind if half the menu lacked photos.

**Rung reached.** Name the prize. The won price at 32px in accent beside the struck menu price — this is accent use one of four and the only accent the guest will ever see. State when it arrives and that it is valid tonight only. Then the choice: take it, or push for the next rung with the downside stated plainly and without softening.

**Won.** Their time against the kitchen's, both in the mono. Prize, prices, and the instruction to show the screen to their server. Resting button ink, pressed accent.

**Lost.** State the margin plainly, note the food is on its way, close warmly. No consolation, no discount, no second chance offered here. This screen should feel like a good loss, not a punishment.

**Device spent.** The most frequently seen state on night one and the one most likely to end the session. It must read as an instruction with a little theatre, in the game-show register the room already knows — lifelines used up, ask a friend, hand the phone over. Show the table's current streak and rung, name what happens next, and offer the three extra-life actions. A flat rejection is where people put the phone down. Rebuild this one first.

**Not running.** Copy identical to a closed venue, no distinguishing colour, icon or empty state. This is a compliance rule, not a design preference.

**Review prompt.** Its own screen, at the bill, shown to every table. Two buttons. Nothing attached to it, nothing near it, no prize, no win state, no life. Structurally isolated.

### The kitchen pass

Iron ground, wall tablet, landscape, glanceable at three metres.

The load switch is the hero and should occupy more of the screen than feels reasonable. Three segmented states with their labels spelled out — everything on, low-effort prizes only, nothing that makes me cook. The active state is a filled block with dark text.

Below it, tonight's pool. Tap to veto, tap again to restore. Each row shows item, station and fire time, plus a chip reading in pool or vetoed. Vetoed rows strike through and drop to the soft ink.

The kill switch is separate from red and must look separate — it is not a fourth load state and must never be positioned as one. Red is a kitchen state; this is an "it is embarrassing me" button. Make it findable in a hurry and hard to hit by accident.

No metrics, no revenue, no graphs, no accent, ever.

### The server's phone

Iron ground, portrait. Header is floor, venue name, clock. The load switch appears here as the same component as the pass, read-only — same shape, same meaning, no floor-specific colour.

One list, now, oldest first. Each row is table, action, detail, age. Three actions only: fire the order, add-on request, confirm redemption. One row, one tap. Age in the mono, and it should be immediately obvious which row has been waiting longest without reading the numbers.

Firing the order captures party size in the same tap flow — segmented, two, three, four, five-plus, one thumb, no keyboard. Do not let this become a second screen.

The server is never shown a metric. Not their own, not the venue's.

### The owner's dashboard

Cotton ground. Net contribution tonight in the mono at display size, with a tier chip beside it reading app estimate or point-of-sale backed. No accent anywhere on this screen — money is not a promotion, so a positive figure stays ink and stays mono. Only a negative figure earns the loss colour and the display face.

Directly under the number, in plain language, what the estimate can and cannot see, with a working link to edit that assumption. This paragraph is not fine print and should not be styled as fine print.

The ledger table: time, table, result, prize, prize cost, extra spend, net, with a totals row.

**The refusal log is the hero of this screen, not a panel at the bottom.** What the engine cleared tonight and what it refused, each with its reason in the operator's own register. The refusal must read louder than the acceptance — give the refused column more visual weight, more rows visible without scrolling, reasons at full size, while the cleared items sit compact. That inversion is the entire product argument rendered as layout. If a stranger looked at this screen for three seconds, they should come away thinking this software says no for a living.

Tiers are told apart by label and a dashed underline, never by colour, and never averaged.

When the night is negative, explain it rather than hiding it, and link to the refusal log.

### The landing page

Headline: it knows what not to give away.

The hero is the clearing panel itself, running live against a real menu — cleared for tonight and refused, side by side, each item with its reason. Not a screenshot of it, not an illustration of it. The most characteristic thing this product does, doing it, above the fold.

Single call to action in accent. Reassurance line about existing QR codes, no app, no signup, no hardware. Four-step stepper — import menu, set margin floors, print QR tents, go live — with the active step in accent.

### The printed tent

105 by 148 millimetres, cotton, table number visible so the paper log and the database describe the same table.

The QR is pure black on pure white with a full quiet zone. Never tinted, never on clay or cotton, no brand colour anywhere near it. A tinted QR is a scan failure and a scan failure is the entire funnel.

Laser-printer safe, greyscale safe, no tints anywhere on the sheet. Design it as a physical object that survives a wet table and looks deliberate face-down.

---

## Part seven — The mechanic fix, which is a design problem

There is a hole in the pairing rule and it will show up as a design failure before it shows up as a bug.

The winner stays on screen, and the winner is by definition the higher seller. So within two rounds a guest can work out that the survivor is always the popular one, and just keep tapping it. Because restaurant sales distributions are top-heavy, most eligible challengers sit below any given incumbent, so that heuristic wins most rounds and gets more reliable the deeper the streak goes. The result on a Saturday: streaks run deeper than the depth caps were priced for, caps get consumed early, and the room's normal state becomes "they stopped giving things away."

The gap ratio cannot fix this alone. Add a second pairing parameter: the probability that a challenger is drawn from *above* the incumbent rather than below, rising with the streak, tuned so that always-tapping-the-incumbent wins roughly two thirds of the time rather than nearly always. Deterministic, seeded from the table run, and a config value like everything else.

Note the tension and surface it rather than burying it: eligible upward challengers get scarce near the top of the ranking, because the gap between a venue's top two sellers is rarely two times. That means this same parameter sets the maximum reachable rung. Compute the reachable ladder depth for the pilot venue's actual menu during the import wave, and show it to me before you tune anything.

---

## Part eight — Copy

Words are interface material here, not decoration.

Short, plain, never chirpy, never exclamatory. Sentence case everywhere. No exclamation marks, no emoji, no "oops", no "uh oh", no apologising, no praise for the guest, no jokes about food.

Name things by what people control, not by how the system works. A server fires an order; they do not trigger an event.

A control says exactly what happens when it is used, and the same action keeps the same name through the entire flow — the button that says take it produces a screen that says taken.

Failure and emptiness are moments for direction. Say what happened and what to do next, in the interface's voice.

The refusal reasons are the register to match for everything else in the product: pre-made, zero fire time; near-zero cost, high goodwill; hero item, never discounted; kitchen is slammed, eighteen-minute fire. That is how an operator talks. Write every string in the product as if it will be read aloud by a chef.

Externalise every string from the first commit. English first, Hindi as a translation job and never a refactor.

---

## Part nine — The subtraction pass

Before you consider any screen finished, take one thing off it. Then check whether the screen got worse. Most of the time it will not.

Specific things to go looking for and delete: any element that exists to fill space; any label that repeats what the value already says; any icon accompanying a word that already means the same thing; any border that could be whitespace; any card that could be a row; any hover state on a surface that only ever sees touch; any tooltip; any modal that could be a screen; any confirmation dialog for an action that could be undone instead; any progress indicator for something that takes under a second; any secondary button that nobody will press.

Write down what you removed and why, in a running notes file, so we can see the shape of what got cut.

---

## Part ten — How to work

**Build working software, not screens.** Every surface runs against the real data layer, the real polling intervals, the real degradation behaviour. No fixtures in the shipped path. A screen that renders correctly but is not wired is not done and does not get demoed.

**Order of work.** The device-spent screen first, because it is the most-seen failure state and the biggest leak. Then the rest of the guest flow end to end. Then the pass, then the floor, then the dashboard with the refusal log as hero, then the landing page, then the print sheet. Each one lands complete before the next one starts.

**Screenshot as you go.** Render each screen, look at it, critique it in writing, revise, and only then move on. A picture catches things a diff never will — particularly spacing, optical alignment of the mono figures, and whether a screen reads at thumbnail size.

**Two passes on every surface.** First pass gets it working and correct. Second pass is craft — spacing rhythm, optical alignment, the exact weight of the streak number against the countdown, whether the wrong-answer state has the right amount of air. Do not skip the second pass because the first one looked fine.

**Propose before deviating.** Where this brief is silent, propose rather than assume. Where this brief conflicts with the build spec on anything other than visual craft, the build spec wins and you tell me about the conflict.

**Commit discipline.** One surface per branch, demoable at every commit, no work-in-progress states on the main line.

---

## Part eleven — Done

The revamp is finished when all of these hold.

Every surface is identifiable by its ground alone at thumbnail size. Every figure in the product is monospaced with tabular figures, verified by audit. The accent appears in exactly four places and nowhere else. The display face appears in exactly four places and nowhere else. No raw hex, no magic duration, no hard-coded threshold outside the config.

Every screen renders correctly in greyscale with no loss of meaning. Every screen is legible at twenty percent brightness, one-handed, on a mid-range Android over venue wifi. Reduced motion is respected and the countdown degrades to a static figure. Keyboard focus is visible on every operator surface.

The countdown is the only thing that moves. The rung reveal is the only staged moment. There are exactly three haptics and no sounds.

The review prompt sits alone on its own screen and the review module still cannot read prize, award, life or game state — verified by test after the revamp, not assumed to have survived it.

The not-running screen is byte-identical in appearance to a closed venue.

The refusal log reads louder than the acceptance on the dashboard, and a stranger given three seconds says so unprompted.

Every degradation case in the build spec has been triggered deliberately against the new interface and behaves as specified — connection dropping mid-round, order never fired, kitchen red all night, depth cap consumed, kill switch hit, bill export never arriving, photo missing.

And the last one, which is the real test: a founder can hand an unlocked phone to a stranger in a loud room, say one sentence, and walk away.
