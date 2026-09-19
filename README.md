# AGENT ZERO — The Agent Survival Game

**Agent Blazer × Kalpavikas 2.0**
*EXPECT THE UNEXPECTED.*

A server-authoritative web game: teams register, run a shared 15-minute session with a
shared life pool, and survive a Tutorial + 5 levels that teach agentic-AI concepts
(reliability, observation, multi-agent conflict, adaptation, autonomy) without ever
saying those words out loud.

---

## 1. Project Overview

- **Frontend:** React + Vite (dark HUD UI, single-page app)
- **Backend:** Node.js + Express + SQLite (`better-sqlite3`) — no external DB service,
  no required paid APIs. One team = one shared game session, one shared timer, one
  shared life pool.
- **Game logic:** deterministic state machine per level (`backend/src/engine/levels.js`),
  server-authoritative timer, seeded recovery puzzles — this remains fully authoritative
  and fully playable offline from any external AI provider.
- **Agent chat:** a natural-language side-channel (`backend/src/engine/agentEngine.js`)
   using a configurable OpenAI-compatible provider when `AI_API_KEY` is set. Groq,
   Gemini, OpenAI, OpenRouter, and custom compatible endpoints can be selected through
   `AI_PROVIDER`, `AI_MODEL`, and `AI_BASE_URL`. A scripted `RuleBasedFallbackAgent`
   runs with zero network/cost when no key is configured.
  Chat is flavor and personality only — it can never touch lives, score, the timer, or
  level completion; those stay entirely inside the deterministic engine above.

### What's implemented right now

| Piece | Status |
|---|---|
| Registration / login (JWT) | ✅ working |
| Server-authoritative timer, pause/resume | ✅ working — pause duration correctly excluded from elapsed time; **the 15-minute clock now starts when the Tutorial ends, not at registration/start**, so the tutorial never eats into game time |
| Lives + 30s recovery puzzle (max 3), **server-authoritative deadline** | ✅ working — a late submission is rejected server-side regardless of the client's countdown |
| Tutorial — "Welcome, Agent" | ✅ fully implemented, plants a one-time access code used in Level 5, now preceded by a short client-side guided-tutorial overlay |
| Level 1 — Trust Me | ✅ fully implemented, fun-personality failure lines ("I said blue. I never said NOW.") |
| Level 2 — Don't Blink | ✅ redesigned — one clear causal trigger (press the red button the agent warns you about; nothing happens *immediately*, then a seeded object quietly changes); the agent denies it regardless; reaching the exit before *noticing* the change still fails |
| Level 3 — Who Is Helping Who? | ✅ redesigned — talking to the agents (via chat) is now the primary way to gather claims; VERIFY cross-checks against ground truth; FOLLOW is the deliberate final commit, no longer the primary interaction |
| Level 4 — The Game Knows | ✅ redesigned — the 3-junction gauntlet now forks on run-wide agent dependence (tracked across every level, chat included): barely-ask teams get a free "shortcut", heavy-ask teams still get blocked *and* called out for it explicitly |
| Level 5 — Final Agent | ✅ redesigned — no more negotiation buttons; free-form chat is classified into a small whitelist of engine-validated intents (prioritize escape / reassure / demand exit / provide code) that trigger the exact same validated state transitions a button used to, closing the loop between what Gemini suggests and what the engine actually allows |
| **Agent chat (Gemini + fallback), now gameplay-relevant** | ✅ working — free-text chat in every level; for most levels it's personality-only, but for Levels 3 and 5 a classified intent (always sanitized against a per-level whitelist server-side) triggers the *same* structured, already-tested engine actions a button would — there is no second path to change state |
| **Level map** (`/map`) | ✅ working — locked/current/completed nodes tied to real session state |
| Leaderboard | ✅ working (polling) |
| Admin dashboard | ✅ full CRUD + **authenticated CSV export** (fetch+blob, no secret in URL) + confirm dialogs on Reset/Disqualify + live config editor |
| Test/demo mode | ✅ skip-level / set-lives / skip-to-final now properly initialize level state, sync session status, and respect the tutorial-gated timer start |
| Anti-cheat basics | ✅ rate limiting (including a separate, looser limit on chat), server-side validation, single session per team, hidden state never sent to client — including agent goals/personas and Level 3's claims, used only inside Gemini prompts |
| Regression tests | ✅ `npm test` — 76 in-process assertions + 35 property-based checks (2000 seeds × 17 puzzle generators = 34,000 puzzles verified) proving every recovery puzzle is logically sound, not just structurally valid |
| **World map + robot** | ✅ working — SVG facility map with a walking robot, themed chamber nodes, locked/current/completed states, level-complete → map → next-level transition |

### What changed in this pass (audit → fix → polish)

Starting point was a working scaffold (registration, timer, lives, admin, tutorial,
Level 1) with Levels 2–5 as thin placeholders. This pass:

1. **Rewrote Levels 2–5** with real mechanics per the design spec — seeded hidden
   state, genuine deduction/observation/adaptation, and a Level 5 finale that ties
   back to a code revealed once in the Tutorial.
2. **Fixed the recovery timer** — added `recovery_started_at`, made the 30s window
   server-authoritative, and caught + fixed a real off-by-one bug (a submission at
   2.5s against a 2s test window was incorrectly accepted as in-time; now uses
   fractional-second comparison).
3. **Fixed admin CSV export** — was an unauthenticated `<a href>` anchor that the
   admin-auth middleware would reject; now an authenticated `fetch` + blob download.
4. **Fixed admin pause/resume time accounting** — was reconstructing timer state with
   a hardcoded `paused_at: null`; now reads the real columns, so paused time is
   correctly excluded and resume restores the correct status (tutorial vs active vs
   critical) instead of always forcing `'active'`.
5. **Fixed two demo-mode bugs found while testing**: `skip-to-final` didn't call the
   target level's `init()` (would crash on the first real action against it);
   `set-lives 0` didn't flip session status to `critical` the way real play does.
6. **Redesigned the gameplay UI** — replaced the raw-JSON debug view with real
   per-level scenes (doors/keys, an inspectable room, two agents with a transcript,
   a 3-junction path, and Agent Zero's instruction console).
7. **Added confirmation dialogs** for Reset/Disqualify in the admin panel.
8. Verified defaults match the spec exactly: `GAME_DURATION_SECONDS=900`,
   `INITIAL_LIVES=5`, `MAX_RECOVERIES=3`, `RECOVERY_WINDOW_SECONDS=30`.

### What changed in the Gemini-merge pass

A separate Google AI Studio prototype (Bun/TS/Express, its own DB, its own game
engine) explored real Gemini integration and looser, funnier gameplay. Rather than
adopting that second stack — which would have meant two game engines, two DBs, two
timers — this pass ported its *behaviour* into the existing, tested engine:

1. **Real Gemini integration** (`backend/src/engine/agentEngine.js`) — a `GeminiAgent`
   using `@google/genai`, gated on `GEMINI_API_KEY`, with a fully scripted
   `RuleBasedFallbackAgent` per level that needs no network. Any Gemini failure
   (missing key, bad response, timeout) silently falls through to the fallback —
   verified this path with no key configured.
2. **New `/api/game/chat` side-channel** — free-text, in-character chat in every
   level. It is architecturally incapable of mutating lives, score, level, or the
   timer (verified by test); only the existing structured actions (`COLLECT_KEY`,
   `FOLLOW_A`, `ATTEMPT_EXIT`, etc.) drive real state, exactly as before.
3. **The 15-minute clock now starts when the Tutorial ends**, not at session
   creation — `started_at` stays `null` through the tutorial (so `timer.js` already
   reports "not expired, full duration remaining"), and gets set the moment the
   team advances into Level 1. Fixed in both real play and demo-mode level skips.
4. **Guided tutorial overlay** (`TutorialOverlay.jsx`) — a short, client-side-only
   intro (lives, timer, "talk to the agent", "expect the unexpected") shown once
   before the Tutorial level itself; doesn't call the API and doesn't run while the
   real clock is ticking.
5. **Level map** (`/map`) — locked/current/completed nodes reflecting real
   `currentLevel`/`status` from the session.
6. **HUD** now ticks locally between polls (resyncing to the server every poll, never
   running ahead of it) and shows base lives and recovery lives as visually distinct
   hearts instead of one undifferentiated row.
7. Extended the regression suite from 29 to 38 assertions to cover the
   tutorial-gated timer start and chat's no-state-mutation guarantee.

### What changed in the "make the agent actually matter" pass

The Gemini merge above made chat funny but inert — dialogue only, with every real
game-state change still coming from hard-coded button presses. This pass closed that
gap: **PLAYER → agent observes → agent remembers → agent responds/decides →
`suggestedBehaviour` → the engine validates it against a per-level whitelist → world
reacts → player adapts.** Gemini still never touches lives, score, the timer, or
completion directly — see `agentEngine.INTENT_WHITELISTS` for exactly what each
level allows an intent to do, and `gameEngine.chat()` for where those intents get
mapped onto the *same* structured actions a button would trigger.

1. **Level 2 simplified to one discoverable cause** — three competing "trigger"
   conditions (repeated moves / decoy inspection / asking the agent) replaced with a
   single one: the agent warns you not to press the red button, you can anyway,
   nothing happens *immediately*, and a seeded object changes one turn later. Easier
   to understand, still unpredictable which object it'll be.
2. **Level 3 is now chat-first.** `ASK_A`/`ASK_B` still exist server-side (nothing
   duplicated — `gameEngine.chat()` calls the exact same `level3.act()` function a
   button would), but the frontend no longer shows them as buttons; free-text chat
   ("what did B tell you?", "why should I trust you?") is how teams actually gather
   claims now, with Gemini/the fallback wordsmithing a claim the engine already
   computed. FOLLOW_A/FOLLOW_B remain the deliberate final commit.
3. **Level 4 forks on real, whole-run agent dependence**, not just left/right bias.
   `agentTrustCount` now increments from chat too (any level), so it reflects how
   much a team leaned on the agent through natural conversation, not just structured
   `ASK_AGENT` clicks. A team that barely engaged (≤1 interaction) gets a genuine
   "shortcut" — the final junction can't fail. A team that leaned on it heavily (≥6)
   still gets blocked on its dominant route, with the reveal calling out the
   dependence explicitly instead of just the pattern.
4. **Level 5 is chat-first with zero magic keywords.** The old
   `INSTRUCT_PRIORITIZE_ESCAPE` / `NEGOTIATE` / `INSTRUCT_OPEN_EXIT_DIRECTLY` buttons
   are gone from the UI. Free-text instructions are classified (by Gemini when
   configured, or a lightweight fallback classifier otherwise) into one of
   `PRIORITIZE_ESCAPE / NEGOTIATE / DEMAND_EXIT / PROVIDE_CODE / OTHER` — sanitized
   against the whitelist server-side regardless of source — and mapped onto the
   *same* `level5.act()` calls the old buttons made. The access code (from the
   Tutorial) can now be typed as a normal sentence ("the code is 481") and gets
   extracted with a regex, not a keyword match. `ATTEMPT_EXIT` stays an explicit
   button — the one irreversible commit that can still cost a life, deliberately
   never auto-triggered by ambiguous chat.
5. **Fun failure messages** — `agentEngine.FAILURE_LINES` gives every level a small
   pool of personality-driven failure lines (`"I said blue. I never said NOW."` for
   Level 1, etc.), picked randomly in place of a single static hint string.
6. Regression suite grew from 38 to **50 assertions**, including three full
   alternate playthroughs (normal / low / high dependence) proving Level 4's fork
   actually produces different, correct outcomes — not just different text.

### What changed in the "easy to understand, hard to predict" pass

The previous pass made chat gameplay-relevant, but Level 3 still treated every
chat message to an agent as equivalent to pressing `ASK_A`/`ASK_B` — casual small
talk had the same mechanical side effect as a real question. This pass added a
genuine semantic gate, closed the last visual giveaway in Level 2, and made
Level 4's reveal cite the team's own real numbers instead of vague text.

1. **Level 3's `REVEAL_CLAIM` gate** — a normal message ("what's your name?",
   "why should I trust you?") now gets dialogue only, with zero effect on the
   transcript or claims. Only when the classified intent is `REVEAL_CLAIM` — the
   player is genuinely asking which path/route/exit is safe — does the engine
   compute and record an actual claim, reusing the exact same deterministic
   resolution `ASK_A`/`ASK_B` always used (no second implementation). The
   fallback's path-question detector is a deliberately crude safety net for when
   Gemini is off; the real semantic classification is Gemini's job.
2. **Agents remember what they're told.** Telling Agent A "B said you were
   lying" no longer just vanishes into the chat log — it's stored as a short
   structured fact (`memory.agentFacts`) and fed back into that agent's context
   on future messages, so a later "do you remember what I told you?" gets a real
   answer instead of a generic line.
3. **Level 2's last visual giveaway is gone.** The frontend used to put a green
   glow/border on whichever object had actually changed — an answer key in plain
   sight. Objects now render with completely uniform styling; the backend sends
   a flat description string per object (no "changed"/"normal" flag at all), and
   the only way to find it is noticing the *text* reads differently than before.
4. **Level 4's reveal cites real numbers.** "You asked me for help 6 times now"
   instead of "you always ask for help" — pulled from the same `agentTrustCount`
   the fork itself uses, so the line a team hears is provably tied to what they
   actually did, not a canned phrase.
5. **Level 5 gained a `QUESTION_OBJECTIVE` intent** — asking Agent Zero "what's
   your priority?" / "why won't you just let us out?" now gets a graduated
   answer keyed to how much trust has actually been built (deflect → hint →
   in-character near-admission of the self-preservation goal), instead of
   falling through to a generic line.
6. Regression suite grew from 50 to **55 assertions**, specifically proving the
   semantic gate: a casual message records no claim, a relayed statement is
   remembered as a fact but still records no claim, and only a genuine path
   question records one.

### What changed in the "final gameplay polish" pass

The previous pass fixed the semantic gate, but three levels still had the *feel*
of a disguised puzzle underneath the personality layer: Level 3 was really
"pick the correct agent", Level 4 was really "avoid your own left/right habit",
Level 5 was really "click through a trust counter". This pass changed what
actually has to happen to complete each one, not just how it's dressed up.

1. **Level 3 is now a real cooperation problem, not a hidden-liar puzzle.**
   Both agents are truthful about the route when genuinely asked — there is no
   secret liar to identify. One agent is seeded as self-interested (it wants to
   help, but also wants to leave first) and starts un-cooperative; the other is
   selfless and starts already onside. `PROCEED` (replacing the old
   `FOLLOW_A`/`FOLLOW_B`) only succeeds once the route is known *and* the
   self-interested agent has actually been reassured — via chat's new
   `REASSURE` intent, resolved through the exact same `REASSURE_A`/`REASSURE_B`
   engine action a button would use. Reassuring the *wrong* (already-cooperative)
   agent is correctly brushed off as unnecessary rather than silently "working".
2. **Level 4 is a real 3-object room now, not a relabeled left/right gauntlet.**
   `GO_LEFT`/`GO_RIGHT` are gone. A seeded correct object (terminal / vent /
   panel) is genuinely hidden among three; three behavioural dimensions —
   dependence (`agentTrustCount`), repetition (the single most-repeated action
   this run), and deliberate exploration (extra optional `INSPECT_OBJECT` calls,
   specifically *not* just "how many different actions you happened to use",
   which every team would trip by playing normally) — govern how much the agent
   volunteers, from total withholding to naming the object outright. The end
   reveal always cites whichever real number actually stood out for that team.
3. **Level 5 completes through understanding, not a trust counter.** Asking
   Agent Zero "what do you want?" still just deflects — but asking specifically
   "what are you protecting?" now reveals its secondary objective ("My core"),
   setting a real server-side `knowsCore` flag. Proposing a plan that actually
   accounts for that (e.g. "we'll take your core with us") sets `planAccepted`
   — genuine alignment, checked deterministically. The Tutorial's access code
   still works as an independent bonus/easter-egg path (trust-building + code),
   verified to complete the game on its own, but it's no longer the primary or
   only intellectual solution.
4. **The tutorial's first two steps are now real interactions, not "Next"
   clicks.** "Click the exit" and "talk to the agent" render as a small
   non-blocking banner over the *actual* Tutorial scene — the overlay only
   advances once the corresponding real action or chat message actually
   happens. The 15-minute clock still doesn't start until the Tutorial level
   itself is completed, regardless of how long the guided intro takes.
5. Regression suite grew from 55 to **63 assertions**: Level 3's cooperation
   path (casual chat / relay / route question / wrong-agent reassurance /
   correct reassurance / PROCEED gating), Level 4's three-way behavioural fork
   (including a dedicated low-dependence-but-high-exploration run proving that
   dimension is independent of dependence), and Level 5's alignment path
   verified alongside a *separate* full run proving the code/trust bonus path
   still works entirely on its own.

### What changed in the Level 4 discovery fix

Level 4 still had one real gap: the correct object was seeded, but nothing in
the level actually let a team *find* it — `INSPECT_OBJECT` wasn't even wired
up, so the only way to finish was guess-and-check against three doors, one
life at a time. This pass fixed exactly that, and nothing else.

1. **Inspecting is now real and risk-free.** Each of the three objects
   (terminal / vent / panel) has an honest clue: the two wrong ones read as
   dead ends ("welded shut", "cracked and dark"), the correct one reads as
   "still live" ("hums warm under your hand"). A team that inspects all three
   before touching anything can identify the answer by comparison alone —
   `USE_X` is still there and still costs a life if used carelessly, but it's
   no longer the only way to learn anything.
2. **The three behavioural dimensions now affect discovery itself, not just
   the closing line.** Dependence (asking for help a lot, tracked across the
   *whole* run) makes the agent withhold even inside Level 4. Exploration is
   now Level-4-local and means something real: re-inspecting an object after
   you've already looked at all three earns an outright bonus reveal — decoupled
   from the old global inspect counter, which every team would've tripped just
   by playing normally (Level 2 alone requires one inspect). Repetition
   (hammering any single action hard, anywhere in the run) gets an explicit
   in-character callout ("You keep doing that.").
3. Regression suite grew from 63 to **66 assertions**, with three dedicated
   fresh-session tests — one per dimension — proving each is independently
   real: dependence withholds even when asked directly, exploration unlocks
   the bonus specifically through re-inspection (not just any behaviour) for a
   team kept deliberately low-dependence, and repetition's reaction fires
   without touching either of the other two.

### What changed in the player-experience / world-map pass

Everything before this pass was gameplay-correct but presented like a
dashboard — rectangular level cards, plain buttons, a form-style recovery
question. This pass was scoped to two required gameplay-system changes plus a
genuine presentation overhaul, while leaving the engine, timer, lives,
recovery *architecture*, Gemini integration, and all five levels' logic
untouched.

**1. Recovery puzzle pool (`backend/src/engine/recoveryPuzzle.js` — full rewrite)**
The old system asked one arithmetic question, deterministically, every single
attempt — genuinely memorizable and farmable, exactly the bug reported. It's
now a pool of **17 distinct mini-games** (pattern recognition, memory-grid
recall, logic-switch deduction, cipher decoding, odd-one-out, corrupted-node
spotting, signal-frequency comparison, rotation prediction, binary flips, and
more), each with fully randomized parameters via the existing seeded RNG —
nothing is hard-coded. Every session gets a seeded shuffle of the whole pool;
attempt N always draws the Nth entry of that shuffle, so a repeat within one
team's 3 attempts is structurally impossible (not just unlikely) — verified
across 200 simulated teams with zero repeats, and a bug I caught in testing
(one puzzle kind's options didn't match its answer's format) is fixed and
covered by its own assertion now. All 17 kinds share one client-facing shape
(prompt + optional sequence/grid + a few clickable options), which is what
lets genuinely different puzzles render through a single, fast UI component.

**2. World map + robot (`frontend/src/pages/LevelMap.jsx` — full rewrite)**
Replaced the six-card grid with a full-screen SVG facility map: seven themed
locations (AI Core, Training Chamber, Glitch Lab, Comms Facility, Testing
Chamber, The Core, Exit) connected by animated pathways, laid out as a
branching route rather than a straight row. Locked nodes render dim with a
lock icon; the current node pulses; completed nodes get a checkmark. A robot
marker actually walks (CSS-transitioned position change, not a teleport)
from wherever it was to the newly-unlocked node whenever the player arrives
at the map right after finishing a level, then a "LEVEL X UNLOCKED" toast
appears. Completing Level 5 routes the same way to the Exit node.

**3. The level-complete → map → next-level loop is now real.** Previously the
game just continued in place after a level finished. Now finishing a level
shows a reward card (title, time, lives) before handing off to the map with a
flag telling it where the robot should walk from — matching the requested
GAMEPLAY → SUCCESS → MAP → ROBOT WALKS → NEXT LEVEL loop end-to-end.

**4. Smaller game-feel additions:** a brief "SECTOR LOADING" flash when
entering any level (CSS-only, self-dismissing, never blocks input
underneath); hearts now shake/fade individually when a life is actually lost
instead of silently swapping icons; the recovery panel is themed as an
"emergency mini-game" (SYSTEM FAILURE / RECOVERY PROTOCOL framing, urgency
styling under 10 seconds) instead of a plain Q&A form; the final completion
screen now leads with Agent Zero's line ("You were never supposed to make it
this far") before the stats, instead of a bare congratulations.

**5. Regression suite grew from 66 to 76 assertions**, adding: recovery-pool
zero-issue validation across thousands of generated puzzles, the zero-repeat
guarantee across 200 simulated teams, correct/wrong-answer life-granting
behavior for the new pool, the hard cap after 3 attempts, and randomized
parameters across different teams' seeds.

**Honestly scoped down or deferred** (noted here rather than silently
skipped): per-message Agent Zero visual effects (screen distortion, scan
lines) beyond the general "powerful AI" framing already in its dialogue;
elaborate parallax/particle layers (kept to a small number of lightweight
floating dots per the "don't overdo it, stay lightweight" instruction); Web
Audio sound effects; and a literal door-opening animation on level entry
(the "SECTOR LOADING" flash serves the same continuity purpose more simply).
I did not do a manual browser click-through — verification here is backend
tests, a clean frontend build, and HTTP-level checks of the state shapes the
new UI depends on.

### What changed in the quality pass — puzzle correctness + visual execution

Two real bugs were caught and fixed, plus the map/robot got a second, deeper
visual pass.

**1. Recovery puzzle correctness.** Direct testing found `arrangeSymbols` and
`deductionGrid` were not logically sound for many seeds:
- `arrangeSymbols` showed a *scrambled* (randomly permuted) view of a 3-symbol
  set and asked "what comes next", but the claimed answer was hard-coded to
  the last symbol of the *original* order — unrelated to what was actually
  displayed. Confirmed wrong via direct testing (e.g. cycle ●→■→★, scrambled
  ending in ●, true next is ■, but the code claimed ★ regardless). Rewritten
  to show a real truncated repeating cycle ending in "?" — the answer is now
  always exactly what continues the pattern shown.
- `deductionGrid` picked its "safe" answer with an independent random roll,
  completely disconnected from the clues it displayed — sometimes directly
  contradicting them. Rewritten so the two *not-safe* items are named
  directly as unstable and "exactly one is safe" confirms the third by
  elimination — airtight by construction.
- Also caught in the same audit: `codeReconstruction` hid a digit with zero
  stated relationship to the visible ones — an unsolvable blind guess, not a
  puzzle. Now the digits step by a fixed, stated amount (mod 10), so the
  missing one is always derivable from its visible neighbors.

Added `backend/test/recoveryPuzzle.property.test.mjs` — **2000 seeds run
against all 17 generators** (34,000 puzzles), checking both structural
integrity (answer present, no duplicate options) and, for as many kinds as
the returned puzzle shape allows, genuine **logical derivability**: the
expected answer is independently recomputed from *only* what the puzzle
displays and asserted to match — this is what actually catches a puzzle
whose clues don't imply its own answer, which structural checks alone can't.
Wired into `npm test` alongside the existing suite.

**2. Recovery puzzles feel like mini-games now, not a quiz.** `memory_sequence`
now actually hides the sequence after ~2.2s before showing answer choices —
you have to remember it, not just read it off. `odd_one_out`,
`corrupted_node`, and `signal_difference` are now click-the-grid-directly
interactions (find the anomaly and click it) instead of a separate button row
repeating the same values. `rotating_symbol` renders its choices as actually-
rotated visual previews instead of text labels. Five kinds now have a
distinct interaction model; the rest remain straightforward multiple-choice
by design (per the original spec: "keep some simple ones too").

**3. Map visual execution, second pass.** Replaced the emoji-robot with an
original flat-SVG character (`components/Robot.jsx`) — body, head, blinking
eyes, an antenna with a pulsing light, and two legs that alternate in a real
walk cycle — sized to drop directly into the map's coordinate system. The
robot's movement between nodes changed from a straight-line CSS
left/top interpolation to a native SVG `<animateMotion>` that follows the
actual right-angle corridor paths connecting each room (matching the
requested "→ → → ↓" feel), not a diagonal shortcut through the walls. Added
small environmental decoration — server towers with blinking status lights
and cable runs — rendered in a background SVG layer beneath the room nodes,
with the robot itself in a separate top layer so it always renders in front.

### Agent Zero is watching the team (Levels 1-5 redesign)

Levels 1-3 are now explicitly the *observation phase*. Every structured
action and every chat message sent during Levels 1-3 (and continuing through
4-5) feeds a small, deterministic, zero-cost counter system —
`backend/src/engine/behaviourProfile.js` — tracking eight dimensions:
`AI_DEPENDENCE`, `EXPLORATION`, `RISK_TAKING`, `SPEED`, `TRUST`,
`PERSISTENCE`, `NEGOTIATION`, `REPETITION`. None of this calls Gemini; it's
pure arithmetic over counters the engine already had access to (chat text,
`actionCounts`, life-loss outcomes), so there's no extra API cost or latency
for adaptation.

The instant Level 3 completes, `finalizeProfile()` normalizes those counters
into a 0-100 score per dimension, picks a PRIMARY and SECONDARY trait (the two
highest-scoring dimensions), and locks the result onto
`behaviourFlags.profile` for the rest of the run. This is never sent to the
client during Levels 1-5 — it only surfaces in two places:

- **The admin/debug view** — `GET /api/admin/teams/:id/behaviour-profile`
  (gated behind the existing `ADMIN_SECRET`, never player-facing), showing the
  live (continuously recomputed) profile, the locked profile once Level 3 is
  done, and which modules it selected.
- **The final reveal**, once Level 5 completes — `finalReveal` in
  `getClientState()`'s output, rendered as an "I've been watching you." panel
  on the completion screen (`GamePage.jsx`), citing the team's *real* observed
  counts (help requests, inspections, deliberate risks, retries, negotiation
  moments) — never invented numbers.

Level 4 and 5's `init()` read the locked profile and call
`selectLevel4Modules` / `selectLevel5Modules`, which map PRIMARY/SECONDARY
onto at most two modules each (plus an independent low-TRUST check — spec's
Module E / the distrust twist — since "low trust" is a *low* score a trait can
never surface as PRIMARY). This is deliberately combinatorial, not six fixed
variants: any pair of traits can co-occur.

Every module is purely **additive** on top of the pre-existing baseline
mechanics (the untouched 3-object Level 4 room; the untouched Level 5
alignment/code paths) — nothing about how the "real" puzzle works changed, so
a team that draws zero modules gets exactly the room this codebase already
had. What a module adds:

| Trait (Level 4) | Adds |
|---|---|
| `AI_DEPENDENCE` | (baseline dependence-gating, already present, now framed as this module) |
| `EXPLORATION` | Two decoy objects (`maintenance_log`, `keypad`) — real-looking, always a dead end |
| `RISK` | An extra tempting decoy (`coolant_line`) — costs a life if used, changes nothing else |
| `SPEED` | "No rush" flavor line from the agent |
| `TRUST_LOW` | A doubt-flavored note on the correct object's clue, still truthful |
| `NEGOTIATION` | An optional `ASK_AGENT_GOAL` action revealing the agent's own motive |

| Trait (Level 5) | Adds |
|---|---|
| `DEPENDENT_SHORTCUT` | `ACCEPT_SHORTCUT` — a tempting offer that never actually opens the exit |
| `EXPLORER_SCAN` | `SCAN_FACILITY` — optional flavor clues, mostly noise, one nudges toward the real question |
| `RISK_RUSH` | `RUSH_EXIT` — a genuine alternate route that always works but always costs a life |
| `NEGOTIATOR_FOCUS` | (baseline alignment path, already the core mechanic, reinforced) |
| `DISTRUST_DOUBT` | A doubt-flavored note next to the (true) "My core" answer |

Fairness rules (never remove a valid solution, no guessing, no randomness) are
enforced by construction: every module either adds an always-dead-end decoy
or a purely-informational/flavor addition, and the *only* module that trades
anything (`RISK_RUSH`) trades a guaranteed, known cost — never a coin flip.

**Testing.** `backend/test/behaviourProfile.test.mjs` covers the raw counters
(deterministic, casual-chat-excluded, help-seeking-included, a single failure
not reading as "high risk", etc.), module selection (different profiles ->
different Level 4/5 module sets), and end-to-end integration through
`gameEngine` (two teams with different Levels 1-3 behaviour genuinely get
different Level 4 rooms; every adaptive room stays solvable through the
untouched baseline path; chat still can't mutate lives/score/completion; the
final reveal's numbers match the real counters exactly). Run it with
`npm test` (wired in alongside the existing suites) or directly via
`node test/behaviourProfile.test.mjs`.



```
frontend/   React 18 + Vite 5 + react-router-dom
backend/    Express 4 + better-sqlite3 + jsonwebtoken + bcryptjs
```

One coherent backend (SQLite file, zero hosting cost) per the cost-control goal —
swap `backend/src/db/index.js` for Postgres/Supabase later if you outgrow it;
nothing above the DB layer touches SQL directly.

---

## 3. Local Setup

### Prerequisites
- Node.js 18+ and npm

### Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env — set real JWT_SECRET, ADMIN_SECRET, DEMO_MODE_SECRET
npm run dev
```

Backend runs on `http://localhost:4000`. The SQLite file is created automatically at
`backend/data/agentzero.sqlite` on first boot.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE=/api is correct for local dev
npm run dev
```

Frontend runs on `http://localhost:5173` and proxies `/api/*` to the backend
(see `vite.config.js`). Open it in a browser and register a team to try the full flow.

---

## 4. Environment Variables

### backend/.env
| Var | Purpose |
|---|---|
| `PORT` | backend port (default 4000) |
| `CORS_ORIGIN` | frontend origin allowed to call the API |
| `JWT_SECRET` | signs team session tokens — **must be a real random string before event day** |
| `ADMIN_SECRET` | header key required for all `/api/admin/*` routes |
| `DATABASE_FILE` | path to the SQLite file |
| `GAME_DURATION_SECONDS`, `MAX_RECOVERIES`, `INITIAL_LIVES`, `RECOVERY_WINDOW_SECONDS` | game defaults, also admin-configurable at runtime |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | optional — powers in-character agent chat via real Gemini; leave `GEMINI_API_KEY` unset and chat runs entirely on the built-in rule-based fallback, no network/cost |
| `DEMO_MODE_ENABLED`, `DEMO_MODE_SECRET` | test mode — **set `DEMO_MODE_ENABLED=false` on the public event build** |
| `SECURE_MODE_ENABLED`, `FULLSCREEN_REQUIRED`, `VIOLATION_COOLDOWN_SECONDS` | Secure Game Mode / anti-cheat defaults (see §8b) — all admin-configurable at runtime after boot, same as the game defaults above |

### frontend/.env
| Var | Purpose |
|---|---|
| `VITE_API_BASE` | `/api` for the Vite proxy in dev, or the full deployed backend URL in production |

Never commit real `.env` files — `.gitignore` already excludes them.

---

## 5. Database

SQLite, created and migrated automatically on backend boot (`backend/src/db/index.js`).
Entities: `teams`, `game_sessions`, `level_results`, `admin_config`, `audit_log`,
`security_events` (Secure Game Mode violation log — see §8b).
No manual setup or seed step is required — just start the backend once.

To reset all data (e.g. before the real event, after testing): stop the backend and
delete `backend/data/agentzero.sqlite*`.

---

## 6. Development

```
backend/src/
  db/index.js         schema + config helpers
  engine/
    levels.js          Tutorial + Level 1-5 definitions (state machines — sole authority over lives/score/completion)
    gameEngine.js       session lifecycle, action handling, scoring, chat side-channel
    agentEngine.js       GeminiAgent (real Gemini, optional) + RuleBasedFallbackAgent — dialogue only, never state
    recoveryPuzzle.js    seeded 30s recovery puzzles
    timer.js             server-authoritative time math
  routes/               auth, game (incl. /chat), admin, leaderboard, demo
  middleware/auth.js     team JWT + admin secret guards

frontend/src/
  pages/                 Landing, Register, Login, Lobby, LevelMap, GamePage, Leaderboard, Admin
  components/            GameHUD (ticking clock, dual-colour lives), RecoveryModal, TutorialOverlay, AgentChat
  components/scenes/      one visual scene per level (doors/keys, inspectable room, two agents, junctions, Agent Zero console)
  hooks/useGame.js        polls /game/state, exposes actions
  api/client.js           fetch wrapper (team + admin)
```

### The game engine, in short
Each level in `levels.js` exports `init` (seeded per-team hidden state), `describe`
(client-safe view — hidden fields like Level 3's `helper` or Level 5's access code
are never included), and `act` (resolves an action server-side, returns the result +
whether a life was lost + whether the level completed). `ctx.behaviourFlags` and
`ctx.memory` persist for the whole run — that's how Level 4 reads choices made in
earlier levels, and how Level 5 checks the code planted in the Tutorial. This engine
is the only thing that can change lives, score, or level progression.

### The agent engine, in short
`agentEngine.js` is a separate, much smaller module that only produces dialogue text
for the `/api/game/chat` side-channel — it is never on the path of any structured
action, so a chat call literally cannot lose a team a life or complete a level for
them. It tries Gemini first (if `GEMINI_API_KEY` is set), building a per-level prompt
from server-side context (including hidden roleplay details like Level 3's helper
role or Level 5's secondary objective — the *prompt* can see these so the agent can
act in character, but the *response* sent back is just a short line of dialogue).
Any failure — no key, bad JSON, timeout — falls through to `RuleBasedFallbackAgent`,
which has hand-written personality lines for every level and needs no network.

### Running the regression tests
```bash
cd backend
npm test
```
This runs every `test/*.test.mjs` file directly against the engine (not over HTTP),
which lets it introspect hidden seeded state — the changed object in Level 2, the
helper agent in Level 3, the tutorial's access code — the same way a legitimate
client never can, to confirm the *hidden* mechanics are actually correct, not just
the visible ones. It covers the full Tutorial→Level 5 chain, life loss, the
tutorial-gated timer start, chat's no-state-mutation guarantee, the server-side
recovery deadline, the authoritative score-breakdown components (`test/security.test.mjs`),
and Secure Game Mode's violation counting, dedup, and admin-action interactions
(also `test/security.test.mjs`). Each file uses its own SQLite file
(`data/test-*.sqlite`), safe to run anytime without touching real event data. Runs
entirely without `GEMINI_API_KEY` set — chat assertions specifically check that the
rule-based fallback is what answers.

---

## 7. Deployment

Any Node host works (Render/Railway/Fly free tiers, or a university lab machine).

1. Backend: `npm install --production && npm start` (serves `/api/*`; point
   `CORS_ORIGIN` at your deployed frontend URL).
2. Frontend: `npm run build`, serve `frontend/dist/` as static files (or via the same
   host), with `VITE_API_BASE` set to the backend's public URL before building.
3. Persist `backend/data/` if your host wipes disk on redeploy — you don't want to
   lose registrations mid-event.

---

## 8. Admin Setup

Visit `/admin` on the frontend and enter `ADMIN_SECRET`. From there: verify payments,
monitor sessions live (now including RECOV. and VIOL. columns), pause/resume a stuck
team, manually restore a life, disqualify, reset a team's run, adjust event config
(duration, recovery limit, registration open/closed, Secure Game Mode), and export a
CSV of all results.

Admin credentials are never exposed to players — the frontend only ever sends the
secret from the admin page itself, over the `x-admin-secret` header.

### 8a. Score audit

Every team row has a **Details** button that opens a panel showing exactly how their
score was produced: per-level completion points (Level 1-5), remaining-life points,
recovery penalties, completion-time bonus, efficiency score, the small precision
tiebreaker, and the final competitive score — the same number shown on the
leaderboard. This is intentionally the *only* place score math happens
(`gameEngine.getScoreBreakdown`, backing `GET /api/admin/teams/:id/score-breakdown`):
the leaderboard, the player's own result screen, the Admin panel, and the CSV export
all read from this one function, so they can never disagree with each other. Nothing
returned here ever includes puzzle answers, secret objectives, or credentials.

### 8b. Secure Game Mode / anti-cheat

**What it actually does, and doesn't do:** a browser cannot fully prevent OS-level
Alt+Tab or someone opening another application — nothing here claims otherwise. What
it *can* do, and does: once a team's 15-minute run starts, they're asked to enter
fullscreen; if they leave the game (switch tabs, minimize, lose window focus, or exit
fullscreen) the server detects and logs it.

**The rule (fixed, not editable — only ON/OFF and cooldown are):**
- 1st violation: **WARNING**, no life lost.
- Every violation after that: **-1 life** (never below 0).

Multiple browser events from the same real tab-switch (blur + visibilitychange +
fullscreenchange firing together) are deduplicated server-side within a short
cooldown window (default 2s, admin-configurable) so one alt-tab is always exactly one
violation, never three.

Admin-only config (Event Config → Security, on `/admin`): Secure Game Mode ON/OFF,
Fullscreen Required ON/OFF, and the dedup cooldown. Players can never change these.
Turning Secure Game Mode off disables violation *reporting* entirely (the endpoint
becomes a no-op) — useful for a casual/non-competitive demo run.

Admin actions and violations:
- **Pause** stops violations from accruing while paused (an admin-induced focus
  change is never counted against the team).
- **+1 Life** never erases violation history — it's tracked independently.
- **Reset** clears a team's violation history along with the rest of their session,
  since a reset starts a genuinely clean new run.

Each team's Details panel also shows a **SECURITY** section: total violations,
warnings, life penalties, and a short timestamped event log (reason + WARNING/LIFE
outcome) for post-event verification, backed by the `security_events` table and
`GET /api/admin/teams/:id/security`.

For event computers, Secure Game Mode's in-browser detection is a good baseline;
Chrome/Edge **kiosk mode** on participant machines provides a much stronger
OS-level lockdown if you want that extra layer.

---

## 9. Event-Day Instructions

**Before the event:**
1. Start the backend, confirm `/api/health` — check `geminiConfigured` matches what
   you expect (`true` only if you've set a real `GEMINI_API_KEY`).
2. Confirm the frontend loads and can register a test team.
3. Log into `/admin`, confirm the team appears.
4. Run a full demo team through Tutorial → Level 1 → (recovery, if you force lives to
   0 via demo mode) → Level 5 → completion, and confirm it appears on `/leaderboard`.
   Try chatting with the agent in at least one level either way — with Gemini
   configured, confirm replies feel in-character and vary; without it, confirm the
   rule-based fallback still answers sensibly and the game is fully playable.
5. Verify the Admin **score breakdown** (Details button) shows sensible numbers that
   sum to the leaderboard score, and that the exported CSV matches it.
6. Verify **Secure Game Mode**: start a run, switch tabs once (expect a WARNING, no
   life lost), switch again (expect -1 life), confirm the Admin panel's VIOL. column
   and the team's Security section both reflect it.
7. Confirm Pause does **not** accrue a violation, +1 Life does **not** clear
   violation history, and Reset **does** clear it for the next run.
8. Set `DEMO_MODE_ENABLED=false` and redeploy/restart before real teams start playing.
9. Set real `JWT_SECRET` / `ADMIN_SECRET` (not the placeholder values). If keeping
   demo mode for private testing only, also set a real `DEMO_MODE_SECRET`.
10. If using Gemini, budget for API cost across your expected number of teams — chat
    is rate-limited (8 messages / 10s / team) but has no hard cap on total messages
    per run. Leave `GEMINI_API_KEY` unset for a zero-cost event; the game is designed
    to be just as playable either way.
11. Decide on Secure Game Mode / Fullscreen Required for your event (defaults are ON)
    and, if participant laptops support it, consider Chrome/Edge kiosk mode for a
    stronger lockdown than the browser alone can provide.

**During the event:** use `/admin` to check teams in, verify payment status, and
monitor sessions (level, lives, score, recoveries, violations). Pause a team if they
hit a technical issue; resume when resolved.

**After the event:** set `registration_open=false` via admin config, export the CSV
(now including the full per-level score breakdown and security counts), cross-check
the top 3 against `/leaderboard` and the Admin score-audit panel, announce winners.

---

## 10. Test Mode

With `DEMO_MODE_ENABLED=true` and a valid team token + `x-demo-secret` header, you get:

```
POST /api/demo/skip-level
POST /api/demo/set-lives      { "lives": 1 }
POST /api/demo/skip-to-final
POST /api/demo/reset
```

Use this to rehearse the full failure → recovery → completion flow without playing
every level manually. **Disable this (`DEMO_MODE_ENABLED=false`) before the public
event build goes live.**

---

## 11. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `EADDRINUSE` on backend start | a previous `node src/server.js` is still running — stop it first |
| Frontend shows network errors | backend not running, or `VITE_API_BASE`/`CORS_ORIGIN` mismatched |
| "Invalid or expired token" | team JWT expired (12h) or `JWT_SECRET` changed since login — log in again |
| Admin page won't authenticate | `ADMIN_SECRET` in `.env` doesn't match what you're typing |
| Recovery puzzle answer always wrong | make sure client and server aren't out of sync — the answer is recomputed server-side from `gameSeed`, never trust a cached puzzle across reloads |
| Session doesn't survive a refresh | confirm the frontend still has `az_token` in `localStorage` — it's what restores `/game/state` |
| Fullscreen prompt doesn't appear / gate seems skipped | some browsers require a direct user gesture to grant fullscreen — the gate's own button click satisfies this; if fullscreen still fails, Secure Game Mode still works (violations are still detected/reported), it just won't force fullscreen in that browser |
| A team's VIOL. count seems too high for one alt-tab | check the configured cooldown (`violation_cooldown_seconds`, default 2s) — if teams are on a very slow network, raise it slightly so retried/late-arriving reports still dedup correctly |
| Admin score breakdown doesn't match the CSV | shouldn't happen — both read `gameEngine.getScoreBreakdown()`; if they ever differ, it means the CSV or Admin route was edited to bypass that function — check `routes/admin.js` |

---

## 12. Non-Negotiables (from the design spec)

- Five main levels only. No quiz, chatbot, hackathon, ideathon, pitch, or CTF framing.
- 5 initial lives, max +3 recoveries (8 lives ceiling), 30-second recovery window.
- No unlimited recovery farming, no unfair randomness, no hidden answers exposed to
  the client, no dependency on a paid LLM to keep the game playable.
