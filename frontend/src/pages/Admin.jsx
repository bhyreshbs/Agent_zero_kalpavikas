import { useEffect, useState } from 'react';
import { adminApi } from '../api/client.js';
import { Link } from 'react-router-dom';
import { IconTrophy, IconWarning, IconRefresh, IconDownload, IconShield } from '../components/GameIcons.jsx';
import { sfx } from '../sound.js';

export default function Admin() {
  const [secret, setSecret] = useState(sessionStorage.getItem('az_admin_secret') || '');
  const [authed, setAuthed] = useState(false);
  const [teams, setTeams] = useState([]);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(null); // { label, fn, id }
  const [exporting, setExporting] = useState(false);
  const [detailTeam, setDetailTeam] = useState(null); // { id, teamName } while the DETAILS modal is open
  const [detailData, setDetailData] = useState(null); // { breakdown, security } once loaded
  const [detailError, setDetailError] = useState(null);

  // New Team Form State
  const [newTeam, setNewTeam] = useState({
    teamName: '', password: '', member1: '', member2: '', member3: '', contact: ''
  });
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  async function tryAuth(s) {
    try {
      const [{ teams }, config] = await Promise.all([adminApi.teams(s), adminApi.config(s)]);
      setTeams(teams);
      setConfig(config);
      setAuthed(true);
      sessionStorage.setItem('az_admin_secret', s);
      setError(null);
      sfx.success();
    } catch (err) {
      setError(err.message);
      setAuthed(false);
      sfx.fail();
    }
  }

  useEffect(() => {
    if (secret) tryAuth(secret);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    sfx.click();
    const [{ teams }, config] = await Promise.all([adminApi.teams(secret), adminApi.config(secret)]);
    setTeams(teams);
    setConfig(config);
  }

  async function act(fn, id) {
    sfx.click();
    await fn(id, secret);
    refresh();
  }

  function askConfirm(label, fn, id) {
    sfx.warning();
    setConfirming({ label, fn, id });
  }

  async function doConfirmed() {
    if (!confirming) return;
    await act(confirming.fn, confirming.id);
    setConfirming(null);
  }

  async function handleExport() {
    sfx.click();
    setExporting(true);
    try {
      await adminApi.exportCsv(secret);
      sfx.success();
    } catch (err) {
      setError(err.message);
      sfx.fail();
    } finally {
      setExporting(false);
    }
  }

  async function saveConfig(patch) {
    sfx.click();
    await adminApi.updateConfig(patch, secret);
    refresh();
  }

  async function openDetails(team) {
    sfx.click();
    setDetailTeam(team);
    setDetailData(null);
    setDetailError(null);
    try {
      const [breakdown, security] = await Promise.all([
        adminApi.scoreBreakdown(team.id, secret),
        adminApi.security(team.id, secret),
      ]);
      setDetailData({ breakdown, security });
    } catch (err) {
      setDetailError(err.message);
    }
  }

  async function handleCreateTeam(e) {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setCreatingTeam(true);
    sfx.click();
    try {
      const res = await adminApi.createTeam(newTeam, secret);
      setCreateSuccess(`Team created successfully: ${res.team.teamName}`);
      setNewTeam({ teamName: '', password: '', member1: '', member2: '', member3: '', contact: '' });
      sfx.success();
      refresh();
    } catch (err) {
      setCreateError(err.message);
      sfx.fail();
    } finally {
      setCreatingTeam(false);
    }
  }

  if (!authed) {
    return (
      <div className="az-admin-auth-page">
        <div className="az-scene-bg" />
        <div className="az-shell" style={{ width: 460 }}>
          <div className="az-admin-auth-header">
            <div>
              <span className="az-badge az-admin-badge">
                <span className="az-status-beacon" /> COMMAND PROTOCOL
              </span>
              <h2 className="az-title az-admin-title">OPERATOR ACCESS CONSOLE</h2>
            </div>
            <Link to="/" className="az-admin-return-link">← Return</Link>
          </div>
          <div className="az-glass-panel az-admin-auth-card">
            <label className="az-hint az-admin-label">SYSTEM PASSPHRASE</label>
            <input
              className="az-input"
              type="password"
              placeholder="Enter admin secret…"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && tryAuth(secret)}
            />
            {error && <p className="az-error" style={{ marginTop: 10 }}>{error}</p>}
            <button
              className="az-btn-primary az-btn-large"
              style={{ marginTop: 20, width: '100%' }}
              onClick={() => tryAuth(secret)}
              onMouseEnter={() => sfx.hover()}
            >
              AUTHENTICATE CONSOLE ▸
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="az-admin-dashboard">
      <div className="az-scene-bg" />
      <div className="az-shell az-admin-shell">
        <div className="az-admin-topbar">
          <div>
            <span className="az-badge az-admin-badge">
              <span className="az-status-beacon" /> FACILITY SURVEILLANCE &amp; OVERRIDE
            </span>
            <h2 className="az-title az-admin-title">OPERATIONS COMMAND CONSOLE</h2>
          </div>
          <div className="az-admin-top-actions">
            <Link to="/leaderboard">
              <button className="az-btn-secondary" onMouseEnter={() => sfx.hover()}>
                <IconTrophy size={14} style={{ marginRight: 6 }} /> Leaderboard
              </button>
            </Link>
            <Link to="/">
              <button className="az-btn-secondary" onMouseEnter={() => sfx.hover()}>
                Home Terminal
              </button>
            </Link>
          </div>
        </div>

        {confirming && (
          <div className="az-glass-panel az-admin-confirm-panel">
            <p className="az-admin-confirm-text">
              <IconWarning size={14} style={{ marginRight: 6 }} /> HIGH-LEVEL DIRECTIVE: Confirm {confirming.label}?
            </p>
            <div className="az-actions">
              <button className="az-btn-danger" onClick={doConfirmed} onMouseEnter={() => sfx.hover()}>
                Yes, Execute Directive
              </button>
              <button className="az-btn-secondary" onClick={() => setConfirming(null)} onMouseEnter={() => sfx.hover()}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="az-admin-config-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Create Team Form */}
          <div className="az-glass-panel az-admin-config-panel">
            <div className="az-admin-section-header">
              <h3 className="az-admin-section-title">Create Team</h3>
            </div>
            <p className="az-hint" style={{ marginTop: 4, marginBottom: 14 }}>
              Register a new team into the Supabase authentication pool.
            </p>
            <form onSubmit={handleCreateTeam} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input required className="az-input" placeholder="Team Name (e.g. ALPHA SQUAD)" value={newTeam.teamName} onChange={e => setNewTeam({...newTeam, teamName: e.target.value})} />
              <input required className="az-input" placeholder="Password (min 6 chars)" value={newTeam.password} onChange={e => setNewTeam({...newTeam, password: e.target.value})} />
              <input required className="az-input" placeholder="Member 1 Name" value={newTeam.member1} onChange={e => setNewTeam({...newTeam, member1: e.target.value})} />
              <input required className="az-input" placeholder="Member 2 Name" value={newTeam.member2} onChange={e => setNewTeam({...newTeam, member2: e.target.value})} />
              <input className="az-input" placeholder="Member 3 Name (Optional)" value={newTeam.member3} onChange={e => setNewTeam({...newTeam, member3: e.target.value})} />
              <input required className="az-input" placeholder="Contact (Phone / Email)" value={newTeam.contact} onChange={e => setNewTeam({...newTeam, contact: e.target.value})} />
              
              {createError && <p className="az-error">{createError}</p>}
              {createSuccess && <p style={{ color: 'var(--az-accent)' }}>{createSuccess}</p>}
              
              <button type="submit" className="az-btn-primary" disabled={creatingTeam} onMouseEnter={() => sfx.hover()}>
                {creatingTeam ? 'Creating...' : 'Register Team'}
              </button>
            </form>
          </div>

          {/* Config Panel */}
          {config && (
            <div className="az-glass-panel az-admin-config-panel">
              <div className="az-admin-section-header">
                <h3 className="az-admin-section-title">Event Configuration</h3>
              </div>
              <div className="az-admin-config-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
                <ConfigField label="Duration (s)" value={config.game_duration_seconds} onSave={(v) => saveConfig({ game_duration_seconds: v })} />
                <ConfigField label="Initial Lives" value={config.initial_lives} onSave={(v) => saveConfig({ initial_lives: v })} />
                <ConfigField label="Max Recoveries" value={config.max_recoveries} onSave={(v) => saveConfig({ max_recoveries: v })} />
                <ConfigField label="Recovery Window (s)" value={config.recovery_window_seconds} onSave={(v) => saveConfig({ recovery_window_seconds: v })} />
                <div className="az-admin-toggle-wrap">
                  <label className="az-hint">Squad Registration</label>
                  <button
                    className={config.registration_open === 'true' ? 'az-btn-primary' : 'az-btn-danger'}
                    onClick={() => saveConfig({ registration_open: config.registration_open === 'true' ? 'false' : 'true' })}
                    onMouseEnter={() => sfx.hover()}
                  >
                    Registration: {config.registration_open === 'true' ? 'OPEN' : 'CLOSED'}
                  </button>
                </div>
              </div>

              <div className="az-admin-section-header" style={{ marginTop: 24 }}>
                <h3 className="az-admin-section-title">Security &amp; Surveillance Mode</h3>
              </div>
              <div className="az-admin-config-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
                <div className="az-admin-toggle-wrap">
                  <label className="az-hint">Secure Game Mode</label>
                  <button
                    className={config.secure_mode_enabled === 'false' ? 'az-btn-secondary' : 'az-btn-primary'}
                    onClick={() => saveConfig({ secure_mode_enabled: config.secure_mode_enabled === 'false' ? 'true' : 'false' })}
                    onMouseEnter={() => sfx.hover()}
                  >
                    Secure Mode: {config.secure_mode_enabled === 'false' ? 'OFF' : 'ON'}
                  </button>
                </div>
                <div className="az-admin-toggle-wrap">
                  <label className="az-hint">Fullscreen Requirement</label>
                  <button
                    className={config.fullscreen_required === 'false' ? 'az-btn-secondary' : 'az-btn-primary'}
                    onClick={() => saveConfig({ fullscreen_required: config.fullscreen_required === 'false' ? 'true' : 'false' })}
                    onMouseEnter={() => sfx.hover()}
                  >
                    Fullscreen: {config.fullscreen_required === 'false' ? 'OFF' : 'ON'}
                  </button>
                </div>
                <ConfigField label="Violation Cooldown (s)" value={config.violation_cooldown_seconds} onSave={(v) => saveConfig({ violation_cooldown_seconds: v })} />
              </div>
            </div>
          )}
        </div>

        <div className="az-admin-toolbar" style={{ marginTop: '24px' }}>
          <div className="az-actions">
            <button className="az-btn-primary" onClick={refresh} onMouseEnter={() => sfx.hover()}>
              <IconRefresh size={14} style={{ marginRight: 6 }} /> Refresh Telemetry
            </button>
            <button className="az-btn-secondary" disabled={exporting} onClick={handleExport} onMouseEnter={() => sfx.hover()}>
              {exporting ? 'Exporting…' : <><IconDownload size={14} style={{ marginRight: 6 }} /> Export CSV</>}
            </button>
          </div>
        </div>

        <div className="az-glass-panel az-admin-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="az-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Level</th>
                <th>Lives</th>
                <th>Score</th>
                <th>Time Left</th>
                <th>Recov.</th>
                <th>Viol.</th>
                <th>Directives</th>
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 && (
                <tr>
                  <td colSpan={10} className="az-table-empty">
                    No active operative units registered yet.
                  </td>
                </tr>
              )}
              {teams.map((t) => (
                <tr key={t.id} className="az-table-row">
                  <td className="az-font-bold">{t.teamName}</td>
                  <td>
                    <select
                      className="az-select"
                      value={t.paymentStatus}
                      onChange={(e) => adminApi.verifyPayment(t.id, e.target.value, secret).then(refresh)}
                    >
                      <option value="pending">pending</option>
                      <option value="verified">verified</option>
                      <option value="rejected">rejected</option>
                    </select>
                  </td>
                  <td>
                    <span className="az-status-chip">
                      {t.sessionStatus || 'not started'}
                    </span>
                  </td>
                  <td className="az-font-mono">{t.currentLevel ?? '—'}/5</td>
                  <td className="az-font-mono">{t.lives ?? '—'}</td>
                  <td className="az-font-mono az-accent-text">{t.score ?? '—'}</td>
                  <td className="az-font-mono">{t.timeRemainingSeconds ?? '—'}s</td>
                  <td className="az-font-mono">{t.recoveryAttempts ?? 0}/{config?.max_recoveries ?? 3}</td>
                  <td style={{ color: t.focusViolations ? 'var(--az-danger)' : 'inherit' }} className="az-font-mono">
                    {t.focusViolations ? `⚠ ${t.focusViolations}` : '—'}
                  </td>
                  <td>
                    <div className="az-actions az-admin-row-actions">
                      <button className="az-btn-tiny" onClick={() => openDetails(t)} onMouseEnter={() => sfx.hover()}>Details</button>
                      <button className="az-btn-tiny" onClick={() => act(adminApi.pause, t.id)} onMouseEnter={() => sfx.hover()}>Pause</button>
                      <button className="az-btn-tiny" onClick={() => act(adminApi.resume, t.id)} onMouseEnter={() => sfx.hover()}>Resume</button>
                      <button className="az-btn-tiny" onClick={() => act(adminApi.restoreLife, t.id)} onMouseEnter={() => sfx.hover()}>+1 Life</button>
                      <button className="az-btn-tiny az-btn-danger" onClick={() => askConfirm(`reset ${t.teamName}'s run`, adminApi.reset, t.id)} onMouseEnter={() => sfx.hover()}>Reset</button>
                      <button className="az-btn-tiny az-btn-danger" onClick={() => askConfirm(`disqualify ${t.teamName}`, adminApi.disqualify, t.id)} onMouseEnter={() => sfx.hover()}>Disqualify</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {detailTeam && (
          <TeamDetailModal
            team={detailTeam}
            data={detailData}
            error={detailError}
            onClose={() => { setDetailTeam(null); setDetailData(null); setDetailError(null); }}
          />
        )}
      </div>
    </div>
  );
}

function TeamDetailModal({ team, data, error, onClose }) {
  return (
    <div className="az-admin-modal-overlay" onClick={onClose}>
      <div className="az-glass-panel az-admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="az-admin-modal-header">
          <h3 style={{ margin: 0 }}>TEAM TELEMETRY: {team.teamName?.toUpperCase()}</h3>
          <button className="az-admin-modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <p className="az-error">{error}</p>}
        {!data && !error && <p className="az-hint">Synchronizing breakdown telemetry…</p>}

        {data && (
          <>
            <div className="az-admin-detail-grid">
              <span>STATUS</span><span>{data.breakdown.status}</span>
              <span>LEVEL</span><span>{data.breakdown.currentLevel} / 5</span>
              <span>LIVES</span><span style={{ display: 'flex', gap: 2 }}>{Array.from({ length: Math.max(0, data.breakdown.lives) }).map((_, i) => <IconShield key={i} size={13} color="#10b981" fill />)}</span>
              <span>TIME LEFT</span><span>{data.breakdown.timeRemainingSeconds != null ? `${Math.floor(data.breakdown.timeRemainingSeconds / 60)}:${String(data.breakdown.timeRemainingSeconds % 60).padStart(2, '0')}` : '—'}</span>
              <span>RECOVERIES</span><span>{data.breakdown.recoveryAttempts} used ({data.breakdown.recoverySuccesses} succeeded)</span>
            </div>

            <h4 className="az-sub" style={{ marginTop: 20, color: 'var(--az-accent)' }}>COMPREHENSIVE SCORE AUDIT</h4>
            <div className="az-admin-score-audit">
              {data.breakdown.levels.map((l) => (
                <div key={l.level} className="az-admin-score-row">
                  <span>Level {l.level}</span><span>+{l.points}</span>
                </div>
              ))}
              <div className="az-admin-score-row"><span>Lives remaining</span><span>+{data.breakdown.lifeScore}</span></div>
              <div className="az-admin-score-row"><span>Recovery penalties</span><span>-{data.breakdown.recoveryPenalty}</span></div>
              <div className="az-admin-score-row"><span>Time bonus</span><span>+{data.breakdown.timeBonus}</span></div>
              <div className="az-admin-score-row"><span>Efficiency</span><span>+{data.breakdown.efficiencyScore}</span></div>
              <div className="az-admin-score-row"><span>Precision</span><span>+{data.breakdown.precision}</span></div>
              <div className="az-admin-score-row az-admin-score-row-total">
                <span>Display/Base Score</span><span>{data.breakdown.baseScore}</span>
              </div>
              <div className="az-admin-score-row az-admin-score-row-total" style={{ color: 'var(--az-cyan-bright)' }}>
                <span>FINAL COMPETITIVE SCORE (leaderboard)</span><span>{data.breakdown.finalScore}</span>
              </div>
            </div>

            <h4 className="az-sub" style={{ marginTop: 20, color: 'var(--az-accent)' }}>SECURITY &amp; FOCUS LOG</h4>
            <div className="az-admin-detail-grid">
              <span>Total violations</span><span>{data.security.totalViolations}</span>
              <span>Warnings</span><span>{data.security.warnings}</span>
              <span>Life penalties</span><span>{data.security.lifePenalties}</span>
              <span>Last violation</span><span>{data.security.lastViolationAt ? `${data.security.lastViolationAt} — ${data.security.lastViolationReason}` : '—'}</span>
            </div>
            {data.security.events?.length > 0 && (
              <div className="az-admin-security-log">
                {data.security.events.map((e, i) => (
                  <div key={i} className="az-admin-security-log-row">
                    <span className="az-hint">{e.createdAt}</span>
                    <span>{e.reason}</span>
                    <span style={{ color: e.penaltyApplied ? 'var(--az-danger)' : 'var(--az-accent)', fontWeight: 600 }}>
                      {e.penaltyApplied ? 'LIFE -1' : 'WARNING'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConfigField({ label, value, onSave }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="az-admin-config-field">
      <label className="az-hint">{label}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="az-input az-admin-input-small" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="az-btn-secondary az-btn-tiny" onClick={() => onSave(v)}>Save</button>
      </div>
    </div>
  );
}
