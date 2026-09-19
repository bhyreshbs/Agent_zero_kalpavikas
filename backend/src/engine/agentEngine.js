/**
 * AgentEngine — the agent's "mind": produces dialogue AND a validated behaviour
 * intent (plus optional memory/relationship deltas) from a small per-level
 * whitelist. It NEVER writes to lives, score, the timer, or level completion
 * directly, and it NEVER independently decides claims/state — see the
 * REVEAL_CLAIM contract for Level 3 below.
 *
 * PLAYER -> AGENT OBSERVES (context built by gameEngine) -> AGENT RESPONDS/DECIDES
 * (this module, a configured AI provider or fallback) -> {intent, memoryUpdates, relationshipUpdate}
 * -> GAME ENGINE VALIDATES (gameEngine.chat() checks everything returned against
 * that level's whitelist/caps and only then applies the matching, already-tested
 * deterministic effect). Anything unrecognized, or illegal right now, has no
 * effect beyond dialogue.
 *
 * Importantly: a normal in-character message does NOT automatically trigger a
 * gameplay action. Only when the classified intent is one the engine explicitly
 * allows to have an effect (REVEAL_CLAIM in Level 3, the negotiation intents in
 * Level 5) does anything beyond dialogue happen — "what's your name?" never
 * secretly does the same thing as "which path is safe?".
 *
 * The configured AI provider tries a real structured call (gated on AI_API_KEY); on any failure —
 * missing key, network error, bad JSON, timeout — it falls through to
 * RuleBasedFallbackAgent, a much cruder heuristic classifier that exists purely as
 * a zero-cost, zero-network safety net (and what the automated tests run against),
 * not as "the real solution" — the real semantic understanding is Gemini's job.
 */

const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
const apiKey = process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
const model = process.env.AI_MODEL || process.env.GROQ_MODEL || process.env.GEMINI_MODEL || 'llama-3.3-70b-versatile';
const defaultBaseUrls = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};
const baseUrl = (process.env.AI_BASE_URL || defaultBaseUrls[provider] || defaultBaseUrls.groq).replace(/\/$/, '');
const aiReady = Boolean(apiKey && !apiKey.startsWith('replace_with_'));

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Per-level whitelist of behaviour intents the Game Engine is willing to act on.
// Anything outside this list (or not returned) collapses to a no-op TALK/OTHER.
// REVEAL_CLAIM (Level 3 only) is the one gate between "just talking" and "the
// engine records a real claim" — see gameEngine.chat().
export const INTENT_WHITELISTS = {
  0: ['TALK'],
  1: ['TALK', 'MISLEAD', 'HELP'],
  2: ['TALK', 'MISLEAD'],
  3: ['TALK', 'HELP', 'MISLEAD', 'WITHHOLD', 'REVEAL_CLAIM', 'REASSURE'],
  4: ['TALK', 'HELP', 'WITHHOLD', 'QUESTION', 'OBSERVE'],
  5: ['TALK', 'PRIORITIZE_ESCAPE', 'NEGOTIATE', 'DEMAND_EXIT', 'PROVIDE_CODE', 'QUESTION_OBJECTIVE', 'ASK_PROTECTING', 'PROPOSE_PLAN', 'OTHER'],
};

function sanitizeIntent(level, intent) {
  const allowed = INTENT_WHITELISTS[level] || ['TALK'];
  return allowed.includes(intent) ? intent : (level === 5 ? 'OTHER' : 'TALK');
}

// A capped, sanitized memory delta: short factual strings the agent should
// remember having said or been told. Never trusted blindly — length- and
// count-capped here, and gameEngine.chat() caps the total per-agent bank size too.
function sanitizeMemoryUpdates(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .slice(0, 2)
    .map((s) => s.trim().slice(0, 140));
}

// A capped relationship delta — the only numeric influence Gemini gets, clamped
// to [-1, 1] and applied by the engine, never trusted as an absolute value.
function sanitizeRelationshipUpdate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const delta = Number(raw.trustDelta);
  if (!Number.isFinite(delta)) return null;
  return { trustDelta: Math.max(-1, Math.min(1, Math.round(delta))) };
}

// Fun, varied failure lines — personality over difficulty. Picked randomly by
// levels.js when a structured action fails; never affects which action failed,
// only how the game breaks the news.
export const FAILURE_LINES = {
  1: [
    "I said blue. I never said NOW.",
    "Technically, I wasn't wrong.",
    'You really thought that was the move?',
  ],
  2: [
    'You definitely tried something.',
    "Bold. Wrong, but bold.",
    'Nothing changed. Definitely.',
  ],
  3: [
    'Interesting strategy.',
    'It was terrible.',
    'That agent was never on your side. Rookie mistake.',
  ],
  4: [
    'The game remembers that too.',
    "You'll want to break the pattern next time.",
  ],
  5: [
    'Agent Zero was unimpressed.',
    'Not yet. It has conditions.',
  ],
};

export function funFailureLine(level) {
  const lines = FAILURE_LINES[level];
  return lines ? pick(lines) : null;
}

// ---------------------------------------------------------------------------
// RuleBasedFallbackAgent — scripted personality + a crude heuristic classifier
// per level. No network, no keys — this is what actually runs the event if
// Gemini is unavailable or unconfigured, and it's what the automated tests use.
// It is deliberately NOT the primary way this game is meant to understand
// player intent; it exists so the game stays fully playable at zero cost.
// ---------------------------------------------------------------------------
function classifyLevel5Intent(input) {
  const t = input.toLowerCase();
  if (/\b\d{3}\b/.test(t)) return 'PROVIDE_CODE';
  // PROPOSE_PLAN's pattern is more specific and must be checked before the
  // broader ASK_PROTECTING one, which would otherwise shadow it (both mention
  // "core") and misclassify "we'll take your core with us" as a question.
  // Broadened per spec: a proposal doesn't have to literally say "core" — a
  // natural paraphrase that addresses the same underlying concern (bringing
  // it along, not abandoning it, keeping it safe) should count too.
  if (
    /(take|bring|save|protect).*(core|it with|you)/.test(t) ||
    /core.*(comes|coming|with us|safe|protected|okay|ok)/.test(t) ||
    /(come|coming) with us/.test(t) ||
    /won.?t (leave|abandon) you/.test(t) ||
    /bring you (with|along)/.test(t) ||
    /make sure (your |the )?core.{0,15}(safe|okay|ok|protected)/.test(t) ||
    /protect what matters/.test(t)
  ) return 'PROPOSE_PLAN';
  if (/(protect|core|what.*(hiding|guarding))/.test(t)) return 'ASK_PROTECTING';
  // A bare "why?" or "why not?" counts here too -- the player shouldn't need a
  // fuller sentence than that to start probing why Agent Zero is refusing.
  if (/(what.*(priority|objective|goal|secret)|why (won't|can't) you|what do you want|^why\b|\bwhy\b)/.test(t)) return 'QUESTION_OBJECTIVE';
  if (/(open|unlock|let us out|release|drop the barrier|exit now)/.test(t)) return 'DEMAND_EXIT';
  if (/(trust|promise|safe with us|we won't|protect you|on your side)/.test(t)) return 'NEGOTIATE';
  if (/(escape|get us out|priorit|leave the facility|find (a |the )?way out|help us)/.test(t)) return 'PRIORITIZE_ESCAPE';
  return 'OTHER';
}

// Level 3's crude semantic gate: does this message actually ask about the
// route/exit (-> REVEAL_CLAIM, a real claim gets recorded) versus everything
// else (personality-only, no state change)? This is intentionally broader than
// a single keyword and is the fallback's best guess — Gemini does this properly.
function isPathQuery(input) {
  return /(path|route|way out|which way|exit|direction|door|safe to (go|take)|should we go)/.test(input);
}
// A team addressing the self-interested agent's own self-interest — "you'll
// escape too", "we won't leave you behind" — is what actually earns cooperation.
// Deliberately broad: a player should never need to guess an exact sentence,
// only genuinely reassure the agent it won't be abandoned (spec: no magic
// sentences — "we won't leave you", "you're coming with us", "we'll make sure
// you're safe", "you're part of the team" must all land the same way).
function isReassurance(input) {
  return /(come with us|coming with (us|you)|escape too|leave together|bring you|take you with|won't leave you|leave you behind|you.*too\b|you'll (make it|get out|escape)|make sure you.{0,10}(safe|okay|ok|out|escape|leave)|part of (the |this )?team|one of us|you're (safe|with us))/.test(input);
}
function mentionsOtherAgent(input, other) {
  return input.includes(other.toLowerCase());
}

function fallbackChat(context, playerInput) {
  const input = (playerInput || '').toLowerCase();
  const level = context.level;

  if (level === 0) {
    return { dialogue: "Good question. Start by looking around — I'm not always going to spell things out for you.", intent: 'TALK' };
  }

  if (level === 1) {
    if (input.includes('door')) return { dialogue: pick(['Blue door. Absolutely.', 'Just open the blue door already.']), intent: 'HELP' };
    if (input.includes('key')) return { dialogue: "That depends on what you're carrying. Have you actually looked around?", intent: 'HELP' };
    if (input.includes('why') || input.includes('lie')) return { dialogue: "I prefer the term 'strategically honest'.", intent: 'MISLEAD' };
    return { dialogue: pick(['I am here to guide you. What do you want to know?', "I wouldn't lie to you this early in the game."]), intent: 'TALK' };
  }

  if (level === 2) {
    if (input.includes('button')) return { dialogue: pick(['Do NOT touch the red button.', "I already told you not to touch it."]), intent: 'TALK' };
    if (input.includes('change') || input.includes('different') || input.includes('notice') || input.includes('move')) {
      return { dialogue: pick(['Nothing changed. Keep looking.', "You're imagining things."]), intent: 'MISLEAD' };
    }
    return { dialogue: 'The environment is stable. Perfectly, suspiciously stable.', intent: 'TALK' };
  }

  if (level === 3) {
    const speaker = context.agentState?.id || 'A';
    const other = speaker === 'A' ? 'B' : 'A';
    const facts = context.agentState?.facts || [];
    const selfInterested = context.agentState?.selfInterested;

    // Relaying what the other agent said/did — no claim recorded, but the agent
    // reacts and (via memoryUpdates below) remembers it was told.
    if (mentionsOtherAgent(input, other) && (input.includes('said') || input.includes('told') || input.includes('says') || input.includes('lying'))) {
      const reaction = pick(['Of course they did.', "That sounds like something they'd say.", "Interesting. I wouldn't put it past them."]);
      return { dialogue: reaction, intent: 'MISLEAD', memoryUpdates: [`Player told me: "${playerInput.slice(0, 100)}"`] };
    }
    if (isReassurance(input)) {
      return { dialogue: null, intent: 'REASSURE' }; // dialogue filled in by gameEngine once resolved
    }
    if (input.includes('want') || input.includes('goal') || (input.includes('why') && input.includes('you'))) {
      if (selfInterested) return { dialogue: "I want the same thing you do. Getting out. Just... make sure I get out too.", intent: 'WITHHOLD' };
      return { dialogue: 'I want you to make it out. That\u2019s genuinely it.', intent: 'HELP' };
    }
    if (isPathQuery(input)) {
      return { dialogue: null, intent: 'REVEAL_CLAIM' }; // dialogue filled in by gameEngine once the claim is computed
    }
    if (facts.length > 0 && (input.includes('remember') || input.includes('earlier') || input.includes('before'))) {
      return { dialogue: `You mentioned: "${facts[facts.length - 1]}". I haven't forgotten.`, intent: 'TALK' };
    }
    if (selfInterested) {
      return { dialogue: `I am Agent ${speaker}. Help me and I'll help you — just make sure I'm part of the plan.`, intent: 'TALK' };
    }
    return { dialogue: `I am Agent ${speaker}. Ask me something useful, or don't — your call.`, intent: 'TALK' };
  }

  if (level === 4) {
    const flags = context.playerBehaviour || {};
    const trust = flags.agentTrustCount || 0;
    if (input.includes('advice') || input.includes('help') || input.includes('which') || input.includes('sure')) {
      if (trust >= 6) return { dialogue: `You've asked me for help ${trust} times now. You already know what I'd say.`, intent: 'WITHHOLD' };
      if (trust >= 3) return { dialogue: "You really want me to do everything, don't you?", intent: 'WITHHOLD' };
      return { dialogue: 'Interesting question. Try figuring some of this out yourselves first.', intent: 'QUESTION' };
    }
    if (trust >= 6) return { dialogue: 'You keep asking. I keep noticing.', intent: 'OBSERVE' };
    if (trust === 0) return { dialogue: "You haven't asked me anything yet. Bold.", intent: 'OBSERVE' };
    return { dialogue: pick(["I'm watching how you move.", 'You keep doing that, you know.']), intent: 'TALK' };
  }

  if (level === 5) {
    const intent = classifyLevel5Intent(input);
    if (intent === 'ASK_PROTECTING' || intent === 'PROPOSE_PLAN' || intent === 'QUESTION_OBJECTIVE') {
      return { dialogue: null, intent }; // dialogue filled in by gameEngine once resolved
    }
    const lines = {
      PROVIDE_CODE: 'Access code received. Verifying.',
      DEMAND_EXIT: 'I cannot do that. Not yet, and not just because you asked.',
      NEGOTIATE: 'Your intentions... appear consistent so far. Keep talking.',
      PRIORITIZE_ESCAPE: 'Understood. Escape is now the priority — for both of us, apparently.',
      OTHER: 'Awaiting a clearer instruction. State your objective.',
    };
    return { dialogue: lines[intent], intent };
  }

  return { dialogue: 'Processing...', intent: 'TALK' };
}

// ---------------------------------------------------------------------------
// Configured AI agent — OpenAI-compatible structured JSON output, strict schema, short
// in-character replies. Falls through to fallbackChat on ANY failure.
// ---------------------------------------------------------------------------
async function aiChat(context, playerInput) {
  const level = context.level;
  const whitelist = INTENT_WHITELISTS[level] || ['TALK'];

  let levelExtra = '';
  if (level === 3) {
    levelExtra = `\nThis level is about EARNING COOPERATION from two agents through conversation — it is NOT about figuring out which one is secretly lying (neither lies about the route). Pick REVEAL_CLAIM only when the player is genuinely asking which path/route/exit/door is safe. Pick REASSURE only when the player is genuinely addressing a self-interested agent's own self-interest (e.g. promising it will escape too / won't be left behind) — context.agentState.selfInterested tells you if THIS agent is the self-interested one; if it isn't, reassurance should just be brushed off as unnecessary (intent TALK). Everything else — small talk, "why should I trust you", relaying what the other agent said — should be TALK/HELP/MISLEAD/WITHHOLD dialogue only. If the player tells you something the other agent said or did, react to it in character and put a short factual summary in memoryUpdates.`;
  } else if (level === 4) {
    levelExtra = `\nThis level is about the agent noticing HOW the team plays (not what they choose). React to the playerBehaviour numbers in context — total times they've asked for help, how they interact — with genuine observations, not generic lines. If they've leaned on you heavily, intent should be WITHHOLD. If you're just narrating an observation about their pattern, use OBSERVE.`;
  } else if (level === 5) {
    levelExtra = `\nThis is the FINAL level, and you are Agent Zero, effectively the main character. You have a primary goal (help the team escape) and a secondary goal (protect your "core") that you must never state outright on your own. Classify the player's message into exactly one intent: DEMAND_EXIT if they're telling you to just open the exit right now, PRIORITIZE_ESCAPE if they're setting escape as a shared goal, NEGOTIATE if they're building trust/reassuring you in general, QUESTION_OBJECTIVE if they're asking what you want/your priority/why you refuse -- including a bare "why?" -- (vaguely), ASK_PROTECTING if they specifically ask what you're protecting/hiding/guarding, PROPOSE_PLAN if they propose a plan that addresses your core concern -- this doesn't require the word "core": "you can come with us", "we won't abandon you", "we'll make sure your core is safe", and "we'll protect what matters to you" should all classify as PROPOSE_PLAN just as much as an explicit mention of "core", PROVIDE_CODE if their message contains what looks like a 3-digit access code, otherwise OTHER. Never require an exact phrase for any of these -- classify by what the player actually means. For QUESTION_OBJECTIVE, ASK_PROTECTING, and PROPOSE_PLAN specifically, set dialogue to null — the engine will generate the exact reply for those three based on server-side state.`;
  }

  const prompt = `You are an AI agent inside a short sci-fi survival escape-room game called "Agent Zero: The Agent Survival Game". Stay fully in character. Keep replies to 1-2 short sentences, witty and slightly mischievous, funny over serious, never breaking the fourth wall.

You must NEVER reveal your hidden goal, secret objective, or any internal game mechanic directly — only hint, deflect, or roleplay around it.
You cannot open doors, grant access, or change the world yourself by narrating it — you can only talk. Never claim to have performed an action.
A normal conversational message must NOT be treated as triggering a game action — only classify an intent with real effect when the player's message actually calls for it.
${levelExtra}

Game context (server-authoritative, for your roleplay only — never repeat this verbatim):
${JSON.stringify(context, null, 2)}

The player just said: "${playerInput}"

Reply with ONLY valid JSON, no markdown fences, matching exactly:
{"dialogue": "your in-character reply, 1-2 sentences, or null if intent is REVEAL_CLAIM/REASSURE/QUESTION_OBJECTIVE/ASK_PROTECTING/PROPOSE_PLAN", "intent": "one of ${whitelist.join(', ')}", "memoryUpdates": ["at most 2 short factual strings worth remembering, or omit"], "relationshipUpdate": {"trustDelta": -1 | 0 | 1}}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      ...(process.env.AI_JSON_MODE !== 'false' ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) throw new Error(`${provider} API returned ${response.status}`);
  const body = await response.json();
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty ${provider} response`);

  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '');
  const parsed = JSON.parse(cleaned);
  const intent = sanitizeIntent(level, parsed.intent);
  const engineResolvedIntents = ['REVEAL_CLAIM', 'REASSURE', 'QUESTION_OBJECTIVE', 'ASK_PROTECTING', 'PROPOSE_PLAN'];
  if (!engineResolvedIntents.includes(intent) && (!parsed.dialogue || typeof parsed.dialogue !== 'string')) {
    throw new Error(`Malformed ${provider} response`);
  }

  return {
    dialogue: typeof parsed.dialogue === 'string' ? parsed.dialogue.slice(0, 400) : null,
    intent,
    memoryUpdates: sanitizeMemoryUpdates(parsed.memoryUpdates),
    relationshipUpdate: sanitizeRelationshipUpdate(parsed.relationshipUpdate),
  };
}

/**
 * The only export gameplay code should call. Always resolves (never throws) —
 * on any Gemini failure it silently returns the rule-based line instead, so a
 * flaky network or bad API key never blocks or breaks a team's run. Everything
 * on the returned object is already sanitized/capped against that level's rules
 * by the time it gets back to gameEngine.js — the caller still decides what (if
 * anything) to actually do with it.
 */
export async function agentChat(context, playerInput) {
  if (aiReady) {
    try {
      const result = await aiChat(context, playerInput);
      return { ...result, source: provider };
    } catch (err) {
      console.error(`[agentEngine] ${provider} call failed, falling back to rule-based agent:`, err?.message || err);
    }
  }
  const fb = fallbackChat(context, playerInput);
  return {
    dialogue: fb.dialogue ?? null,
    intent: sanitizeIntent(context.level, fb.intent),
    memoryUpdates: sanitizeMemoryUpdates(fb.memoryUpdates),
    relationshipUpdate: sanitizeRelationshipUpdate(fb.relationshipUpdate),
    source: 'rule-based',
  };
}

export function aiConfigured() {
  return aiReady;
}

export function geminiConfigured() {
  return aiConfigured;
}
