import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/engine/gameEngine.js');
let code = fs.readFileSync(file, 'utf8');

const applyActionOriginal = code.substring(
  code.indexOf('export async function applyAction(session, action, payload) {'),
  code.indexOf('export async function reconcileRecoveryDeadline(session) {')
);

const chatOriginal = code.substring(
  code.indexOf('export async function chat(session, message, target) {'),
  code.indexOf('const HINTS_BY_LEVEL = {')
);

// We define our new applyAction
const newApplyAction = `export async function applyAction(unlockedSession, action, payload) {
  const client = await getClient();
  let resultToReturn = null;
  let auditsToLog = [];

  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM game_sessions WHERE id = $1 FOR UPDATE', [unlockedSession.id]);
    let session = rows[0];

    // Evaluate timer inside lock
    if (isExpired(session) && !TERMINAL_STATUSES.has(session.status)) {
      if (session.status === 'active' && session.paused_at && !TERMINAL_STATUSES.has(session.status)) {
        const pAt = session.paused_at instanceof Date ? session.paused_at : new Date(session.paused_at + (session.paused_at.endsWith('Z') ? '' : 'Z'));
        const start = pAt.getTime();
        const elapsed = Math.floor((Date.now() - start) / 1000);
        session.time_paused_seconds = (session.time_paused_seconds || 0) + elapsed;
        session.paused_at = null;
      }
      session.status = 'failed';
      if (!session.completed_at) session.completed_at = new Date().toISOString();
      session.score = await calculateScore(session, { includeTimeBonus: false });
      
      await client.query(
        \`UPDATE game_sessions SET status=$1, completed_at=$2, score=$3, time_paused_seconds=$4, paused_at=NULL WHERE id=$5\`,
        [session.status, session.completed_at, session.score, session.time_paused_seconds || 0, session.id]
      );
      await client.query('COMMIT');
      client.release();
      await logAudit(session.team_id, 'game_failed', { score: session.score, level: session.current_level });
      return { error: 'TIME_UP', clientState: await getClientState(session) };
    }

    const isTransition = session.status === 'paused' && session.paused_at === null;
    if (session.status === 'paused' && !isTransition) {
      await client.query('ROLLBACK');
      client.release();
      return { error: 'Session is paused by admin.' };
    }

    if (action === 'ENTER_SECTOR') {
      if (!isTransition) {
        await client.query('ROLLBACK');
        client.release();
        return { error: 'Not in transition state.', clientState: await getClientState(session) };
      }
      session.status = session.current_level === 0 ? 'tutorial' : 'active';
      session.paused_at = new Date().toISOString();
      await client.query(
        \`UPDATE game_sessions SET status = $1, paused_at = $2 WHERE id = $3\`,
        [session.status, session.paused_at, session.id]
      );
      await client.query('COMMIT');
      client.release();
      return {
        result: { ok: true, message: 'Sector active.' },
        lifeLost: false,
        levelCompleted: false,
        advancedToLevel: null,
        clientState: await getClientState(session),
      };
    }

    if (isTransition) {
      await client.query('ROLLBACK');
      client.release();
      return { error: 'Must enter sector first.', clientState: await getClientState(session) };
    }

    if (['completed', 'failed', 'disqualified'].includes(session.status)) {
      await client.query('ROLLBACK');
      client.release();
      return { error: \`Session already \${session.status}.\` };
    }
    if (session.status === 'critical') {
      await client.query('ROLLBACK');
      client.release();
      return { error: 'Session is in critical state — resolve the recovery puzzle first.' };
    }

    const level          = LEVEL_BY_INDEX[session.current_level];
    const levelStates    = parseJson(session.level_states);
    const behaviourFlags = parseJson(session.behaviour_flags);
    const memory         = parseJson(session.agent_memory);

    behaviourFlags.actionCounts = behaviourFlags.actionCounts || {};
    behaviourFlags.actionCounts[action] = (behaviourFlags.actionCounts[action] || 0) + 1;

    const outcome = level.act(session, levelStates[level.key], action, payload, { behaviourFlags, memory });
    recordActionObservation(behaviourFlags, level.index, action, payload, outcome);

    levelStates[level.key]     = outcome.levelState;
    session.level_states       = JSON.stringify(levelStates);
    session.behaviour_flags    = JSON.stringify(behaviourFlags);
    session.agent_memory       = JSON.stringify(memory);

    let lifeLostThisTurn = false;
    let advanced = false;

    await client.query(
      \`UPDATE level_results SET attempts = attempts + 1, failures = failures + $1 WHERE session_id = $2 AND level = $3\`,
      [outcome.lifeLost ? 1 : 0, session.id, level.index]
    );

    if (outcome.lifeLost && level.costsLife) {
      session.lives -= 1;
      lifeLostThisTurn = true;
      auditsToLog.push(['life_lost', { level: level.index, lives: session.lives }]);
    }

    if (outcome.completed) {
      const levelPoints = LEVEL_PROGRESSION_POINTS[level.index] || 0;
      await client.query(
        \`UPDATE level_results SET completed = 1, completed_at = NOW(), score = $1 WHERE session_id = $2 AND level = $3\`,
        [levelPoints, session.id, level.index]
      );

      if (level.index >= MAIN_LEVEL_COUNT) {
        if (session.status === 'active' && session.paused_at) {
          const pAt = session.paused_at instanceof Date ? session.paused_at : new Date(session.paused_at + (session.paused_at.endsWith('Z') ? '' : 'Z'));
          const start = pAt.getTime();
          const elapsed = Math.floor((Date.now() - start) / 1000);
          session.time_paused_seconds = (session.time_paused_seconds || 0) + elapsed;
          session.paused_at = null;
        }
        session.status = 'completed';
        if (!session.completed_at) session.completed_at = new Date().toISOString();
        session.score = await calculateScore(session, { includeTimeBonus: true });
        auditsToLog.push(['game_completed', { score: session.score, level: session.current_level }]);
      } else {
        const nextIndex = level.index + 1;
        session.current_level = nextIndex;
        session.status = 'paused';

        if (session.paused_at) {
          const pAt = session.paused_at instanceof Date ? session.paused_at : new Date(session.paused_at + (session.paused_at.endsWith('Z') ? '' : 'Z'));
          const start = pAt.getTime();
          const elapsed = Math.floor((Date.now() - start) / 1000);
          session.time_paused_seconds = (session.time_paused_seconds || 0) + elapsed;
          session.paused_at = null;
        }

        if (level.index === 0 && !session.started_at) {
          session.started_at = new Date().toISOString();
        }
        if (level.index === 3) {
          finalizeProfile(behaviourFlags);
          session.behaviour_flags = JSON.stringify(behaviourFlags);
        }

        const nextLevel = LEVEL_BY_INDEX[nextIndex];
        levelStates[nextLevel.key] = nextLevel.init(session, { memory, behaviourFlags });
        session.level_states    = JSON.stringify(levelStates);
        session.behaviour_flags = JSON.stringify(behaviourFlags);
        session.agent_memory    = JSON.stringify(memory);

        await client.query(
          \`INSERT INTO level_results (session_id, level) VALUES ($1, $2)\`,
          [session.id, nextIndex]
        );
        advanced = true;
      }
    }

    if (session.lives <= 0 && session.status !== 'completed') {
      session.status = 'critical';
      auditsToLog.push(['entered_critical', {}]);
    }

    if (!['completed', 'failed'].includes(session.status)) {
      session.score = await calculateScore(session, { includeTimeBonus: false });
    }

    await client.query(
      \`UPDATE game_sessions SET
        status=$1, started_at=$2, completed_at=$3, current_level=$4, lives=$5,
        max_lives_gained=$6, score=$7, recovery_attempts=$8, recovery_successes=$9,
        behaviour_flags=$10, agent_memory=$11, level_states=$12,
        time_paused_seconds=$13, paused_at=$14, recovery_started_at=$15,
        focus_violations=$16, security_warnings=$17, security_life_penalties=$18,
        last_violation_at=$19, last_violation_reason=$20
       WHERE id=$21\`,
      [
        session.status, session.started_at || null, session.completed_at || null,
        session.current_level, session.lives, session.max_lives_gained || 0,
        session.score, session.recovery_attempts, session.recovery_successes,
        toJsonStr(session.behaviour_flags), toJsonStr(session.agent_memory),
        toJsonStr(session.level_states), session.time_paused_seconds || 0,
        session.paused_at || null, session.recovery_started_at || null,
        session.focus_violations || 0, session.security_warnings || 0,
        session.security_life_penalties || 0, session.last_violation_at || null,
        session.last_violation_reason || null, session.id,
      ]
    );

    await client.query('COMMIT');
    
    resultToReturn = {
      result: outcome.result,
      lifeLost: lifeLostThisTurn,
      levelCompleted: outcome.completed,
      advancedToLevel: advanced ? session.current_level : null,
      clientState: await getClientState(session),
    };

    // run audits outside lock
    for (const [action, payload] of auditsToLog) {
      logAudit(session.team_id, action, payload).catch(e => console.error("Audit error", e));
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    if (client) client.release();
  }

  return resultToReturn;
}
// ---------------------------------------------------------------------------
`;

const newChat = `export async function chat(unlockedSession, message, target) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    return { error: 'A message is required.' };
  }
  
  const trimmedMessage = message.trim().slice(0, 300);

  // We fetch a read-only snapshot first to avoid blocking the DB while the AI responds
  let currentLevelIdx = unlockedSession.current_level;
  let levelStates    = parseJson(unlockedSession.level_states);
  let behaviourFlags = parseJson(unlockedSession.behaviour_flags);
  let memory         = parseJson(unlockedSession.agent_memory);
  memory.agentFacts  = memory.agentFacts || {};
  
  behaviourFlags.chatCountByLevel = behaviourFlags.chatCountByLevel || {};
  let totalChats = Object.values(behaviourFlags.chatCountByLevel).reduce((a, b) => a + b, 0) + 1;

  const context = buildChatContext(unlockedSession, levelStates, behaviourFlags, memory, target, { totalChats });
  
  // AI Call happens OUTSIDE the transaction lock!
  let response = await agentChat(context, trimmedMessage);

  if (!response.dialogue) response = { ...response, dialogue: 'Processing...' };

  const client = await getClient();
  let resultToReturn = null;
  try {
    await client.query('BEGIN');
    
    // NOW acquire lock and merge updates
    const { rows } = await client.query('SELECT * FROM game_sessions WHERE id = $1 FOR UPDATE', [unlockedSession.id]);
    const session = rows[0];

    if (!['tutorial', 'active'].includes(session.status)) {
      await client.query('ROLLBACK');
      client.release();
      return { error: \`Chat is unavailable while the session is \${session.status}.\` };
    }

    const level = LEVEL_BY_INDEX[session.current_level];
    levelStates = parseJson(session.level_states);
    behaviourFlags = parseJson(session.behaviour_flags);
    memory = parseJson(session.agent_memory);
    memory.agentFacts = memory.agentFacts || {};

    // Only apply the intent if the level hasn't changed since the AI call started
    if (session.current_level === currentLevelIdx) {
      behaviourFlags.chatCountByLevel = behaviourFlags.chatCountByLevel || {};
      behaviourFlags.chatCountByLevel[level.index] = (behaviourFlags.chatCountByLevel[level.index] || 0) + 1;
      behaviourFlags.agentTrustCount = (behaviourFlags.agentTrustCount || 0) + 1;
      recordChatObservation(behaviourFlags, level.index, trimmedMessage);

      const speaker = level.index === 3 ? (target === 'B' ? 'B' : 'A') : null;
      const factKey = level.index === 3 ? \`3:\${speaker}\` : \`\${level.index}:default\`;

      const mapped = intentToAction(level.index, response.intent, trimmedMessage, target);
      if (mapped) {
        const ls = levelStates[level.key];
        const outcome = level.act(session, ls, mapped.action, mapped.payload || {}, { behaviourFlags, memory });
        levelStates[level.key] = outcome.levelState;
        if (ENGINE_RESOLVED_DIALOGUE.includes(response.intent)) {
          response = { ...response, dialogue: outcome.result.agentLine || outcome.result.message };
        }
      }

      if (response.memoryUpdates?.length) {
        memory.agentFacts[factKey] = [...(memory.agentFacts[factKey] || []), ...response.memoryUpdates].slice(-AGENT_FACTS_LIMIT);
      }
      if (response.relationshipUpdate) {
        memory.agentRelationship = memory.agentRelationship || {};
        const current = memory.agentRelationship[factKey] || 0;
        memory.agentRelationship[factKey] = Math.max(-5, Math.min(5, current + response.relationshipUpdate.trustDelta));
      }
    }

    memory.chatLog = memory.chatLog || [];
    memory.chatLog.push({ level: session.current_level, player: trimmedMessage, agent: response.dialogue, at: Date.now() });
    if (memory.chatLog.length > CHAT_LOG_LIMIT) memory.chatLog = memory.chatLog.slice(-CHAT_LOG_LIMIT);

    session.level_states    = JSON.stringify(levelStates);
    session.behaviour_flags = JSON.stringify(behaviourFlags);
    session.agent_memory    = JSON.stringify(memory);

    await client.query(
      \`UPDATE game_sessions SET level_states = $1, behaviour_flags = $2, agent_memory = $3 WHERE id = $4\`,
      [toJsonStr(levelStates), toJsonStr(behaviourFlags), toJsonStr(memory), session.id]
    );

    await client.query('COMMIT');
    resultToReturn = { dialogue: response.dialogue, source: response.source, clientState: await getClientState(session) };

    logAudit(session.team_id, 'chat', { level: session.current_level, source: response.source, intent: response.intent }).catch(e=>console.error(e));

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    if (client) client.release();
  }

  return resultToReturn;
}
// ---------------------------------------------------------------------------
`;

code = code.replace(applyActionOriginal, newApplyAction);
code = code.replace(chatOriginal, newChat);

fs.writeFileSync(file, code, 'utf8');
console.log('Successfully rewrote gameEngine.js');
