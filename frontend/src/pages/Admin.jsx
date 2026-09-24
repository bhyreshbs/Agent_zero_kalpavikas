import { useEffect, useState } from 'react';
import { adminApi } from '../api/client.js';
import { Link } from 'react-router-dom';
import { IconWarning, IconRefresh, IconDownload, IconShield } from '../components/GameIcons.jsx';
import AdminNav from '../components/AdminNav.jsx';
import { sfx } from '../sound.js';

const MUTED = 'var(--ds-text-muted)';

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
  const [showSecret, setShowSecret] = useState(false); // UI-only: reveal passphrase
  const [teamQuery, setTeamQuery] = useState(''); // UI-only: filters the squad table

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
      <div className="ds-page">
        <AdminNav />
        <main
          className="ds-container"
          style={{ maxWidth: 460, minHeight: 'calc(100vh - var(--ds-nav-h) - 40px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
        >
          <div className="ds-stack" style={{ gap: 'var(--ds-space-sm)', marginBottom: 'var(--ds-space-lg)', alignItems: 'center', textAlign: 'center' }}>
            <svg viewBox="0 0 100 100" width="56" height="56" aria-hidden="true">
              <circle cx="50" cy="50" r="44" stroke="#D4A853" strokeWidth="1.5" fill="none" opacity="0.4" />
              <circle cx="50" cy="50" r="38" stroke="#D4A853" strokeWidth="0.8" strokeDasharray="3 3" fill="none" opacity="0.6" />
              <circle cx="50" cy="50" r="14" stroke="#D4A853" strokeWidth="1.5" fill="#141312" />
              <circle cx="50" cy="50" r="6" fill="#D4A853" />
              <path d="M50 2v16M50 82v16M2 50h16M82 50h16" stroke="#D4A853" strokeWidth="1.5" />
            </svg>
            <span className="ds-badge ds-badge-chamfer">Command protocol // Clearance level 0</span>
            <h1 className="ds-title">Operator Access Console</h1>
            <p className="ds-mono-sm" style={{ margin: 0 }}>
              Authenticate event master credentials to unlock facility telemetry &amp; team override controls.
            </p>
          </div>

          <div className="ds-card">
            <div className="ds-card-header">
              <span className="ds-label">Master cipher</span>
              <span className="ds-mono-sm"><span className="ds-dot ds-dot-warn" /> Sec-gate 00-primary</span>
            </div>
            <div className="ds-card-body ds-stack">
              <div className={`ds-field${error ? ' is-error' : ''}`}>
                <label className="ds-label" htmlFor="admin-secret">System passphrase</label>
                <div className="ds-row" style={{ flexWrap: 'nowrap', gap: 0 }}>
                  <input
                    id="admin-secret"
                    className={`ds-input${error ? ' is-error' : ''}`}
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Enter admin secret…"
                    autoComplete="off"
                    autoFocus
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && tryAuth(secret)}
                  />
                  <button
                    type="button"
                    className="ds-btn ds-btn-ghost"
                    style={{ minHeight: 40 }}
                    onClick={() => setShowSecret((v) => !v)}
                    aria-pressed={showSecret}
                  >
                    {showSecret ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {error && (
                <p className="ds-alert ds-alert-error" role="alert" style={{ margin: 0 }}>
                  <IconWarning size={12} color="currentColor" /> {error}
                </p>
              )}
              <button
                className="ds-btn ds-btn-primary ds-btn-block"
                onClick={() => tryAuth(secret)}
                onMouseEnter={() => sfx.hover()}
              >
                Authenticate console ▸
              </button>
            </div>
            <div className="ds-card-footer">
              <Link to="/" className="ds-btn ds-btn-ghost ds-btn-sm">← Return to briefing</Link>
              <span className="ds-mono-sm">Master activity is logged</span>
            </div>
          </div>
        </main>
        <div className="ds-footer-strip">Echo Station // Operations gateway // Authorized eyes only</div>
      </div>
    );
  }

  // Derived, read-only dashboard figures computed from the teams list already loaded.
  const count = (pred) => teams.filter(pred).length;
  const stats = [
    { label: 'Squads registered', value: teams.length, hint: `${count((t) => t.paymentStatus === 'pending')} payment pending` },
    { label: 'Active runs', value: count((t) => t.sessionStatus === 'active' || t.sessionStatus === 'tutorial'), hint: `${count((t) => t.sessionStatus === 'paused')} paused` },
    { label: 'Completed', value: count((t) => t.sessionStatus === 'completed'), hint: `${count((t) => t.sessionStatus === 'failed')} failed` },
    { label: 'Focus violations', value: teams.reduce((n, t) => n + (t.focusViolations || 0), 0), hint: `${count((t) => t.focusViolations > 0)} squads flagged` },
  ];
  const q = teamQuery.trim().toLowerCase();
  const visibleTeams = q ? teams.filter((t) => (t.teamName || '').toLowerCase().includes(q)) : teams;
  const regOpen = config?.registration_open === 'true';
  const secureOn = config?.secure_mode_enabled !== 'false';
  const fsOn = config?.fullscreen_required !== 'false';

  return (
    <div className="ds-page">
      <AdminNav />
      <main className="ds-container ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
        {/* 1-2. Title + system status */}
        <section className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
          <div className="ds-row" style={{ justifyContent: 'space-between' }}>
            <div className="ds-stack" style={{ gap: 4 }}>
              <span className="ds-label">Facility surveillance &amp; override</span>
              <h1 className="ds-title">Operations Command Console</h1>
            </div>
            <div className="ds-row">
              <button className="ds-btn ds-btn-primary" onClick={refresh} onMouseEnter={() => sfx.hover()}>
                <IconRefresh size={14} color="currentColor" /> Refresh telemetry
              </button>
              <button className="ds-btn ds-btn-secondary" disabled={exporting} onClick={handleExport} onMouseEnter={() => sfx.hover()}>
                {exporting ? 'Exporting…' : <><IconDownload size={14} color="currentColor" /> Export CSV</>}
              </button>
            </div>
          </div>
          <div className="ds-row">
            <span className={`ds-badge ${regOpen ? 'ds-badge-success' : 'ds-badge-danger'}`}>
              <span className={`ds-dot ${regOpen ? 'ds-dot-live' : 'ds-dot-danger'}`} /> Registration {regOpen ? 'open' : 'closed'}
            </span>
            <span className={`ds-badge ${secureOn ? '' : 'ds-badge-muted'}`}>Secure mode {secureOn ? 'on' : 'off'}</span>
            <span className={`ds-badge ${fsOn ? '' : 'ds-badge-muted'}`}>Fullscreen {fsOn ? 'required' : 'optional'}</span>
          </div>
          {error && <p className="ds-alert ds-alert-error" style={{ margin: 0 }}>{error}</p>}
        </section>

        {/* 3. Stats */}
        <section className="ds-grid ds-grid-4">
          {stats.map((s) => (
            <div key={s.label} className="ds-stat">
              <span className="ds-label">{s.label}</span>
              <span className="ds-stat-value">{s.value}</span>
              <span className="ds-stat-hint">{s.hint}</span>
            </div>
          ))}
        </section>

        {/* 4-5. Registration + configuration */}
        <section className="ds-grid ds-grid-2" style={{ alignItems: 'start' }}>
          <div className="ds-card">
            <div className="ds-card-header">
              <h2 className="ds-card-title">Register Squad</h2>
              <span className="ds-badge ds-badge-muted">Team auth pool</span>
            </div>
            <form onSubmit={handleCreateTeam} className="ds-card-body ds-stack">
              <p className="ds-mono-sm" style={{ margin: 0 }}>Register a new team into the authentication pool.</p>
              <Field label="Team name">
                <input required className="ds-input" placeholder="e.g. ALPHA SQUAD" value={newTeam.teamName} onChange={(e) => setNewTeam({ ...newTeam, teamName: e.target.value })} />
              </Field>
              <Field label="Password">
                <input required className="ds-input" placeholder="Min 6 chars" value={newTeam.password} onChange={(e) => setNewTeam({ ...newTeam, password: e.target.value })} />
              </Field>
              <div className="ds-grid ds-grid-2" style={{ gap: 'var(--ds-space-md)' }}>
                <Field label="Member 1">
                  <input required className="ds-input" placeholder="Name" value={newTeam.member1} onChange={(e) => setNewTeam({ ...newTeam, member1: e.target.value })} />
                </Field>
                <Field label="Member 2">
                  <input required className="ds-input" placeholder="Name" value={newTeam.member2} onChange={(e) => setNewTeam({ ...newTeam, member2: e.target.value })} />
                </Field>
                <Field label="Member 3 (optional)">
                  <input className="ds-input" placeholder="Name" value={newTeam.member3} onChange={(e) => setNewTeam({ ...newTeam, member3: e.target.value })} />
                </Field>
                <Field label="Contact">
                  <input required className="ds-input" placeholder="Phone / email" value={newTeam.contact} onChange={(e) => setNewTeam({ ...newTeam, contact: e.target.value })} />
                </Field>
              </div>
              {createError && <p className="ds-alert ds-alert-error" style={{ margin: 0 }}>{createError}</p>}
              {createSuccess && <p className="ds-alert ds-alert-success" style={{ margin: 0 }}>{createSuccess}</p>}
              <button type="submit" className={`ds-btn ds-btn-primary${creatingTeam ? ' is-loading' : ''}`} disabled={creatingTeam} onMouseEnter={() => sfx.hover()}>
                Register team
              </button>
            </form>
          </div>

          {config ? (
            <div className="ds-card">
              <div className="ds-card-header">
                <h2 className="ds-card-title">Event Configuration</h2>
                <span className="ds-badge ds-badge-muted">Global</span>
              </div>
              <div className="ds-card-body ds-stack">
                <ConfigField label="Duration (s)" value={config.game_duration_seconds} onSave={(v) => saveConfig({ game_duration_seconds: v })} />
                <ConfigField label="Initial lives" value={config.initial_lives} onSave={(v) => saveConfig({ initial_lives: v })} />
                <ConfigField label="Max recoveries" value={config.max_recoveries} onSave={(v) => saveConfig({ max_recoveries: v })} />
                <ConfigField label="Recovery window (s)" value={config.recovery_window_seconds} onSave={(v) => saveConfig({ recovery_window_seconds: v })} />
                <ToggleRow
                  label="Squad registration"
                  on={regOpen}
                  text={regOpen ? 'OPEN' : 'CLOSED'}
                  danger={!regOpen}
                  onClick={() => saveConfig({ registration_open: regOpen ? 'false' : 'true' })}
                />
                <hr className="ds-divider ds-divider-amber" style={{ margin: 'var(--ds-space-sm) 0' }} />
                <span className="ds-label ds-accent">Security &amp; surveillance mode</span>
                <ToggleRow
                  label="Secure game mode"
                  on={secureOn}
                  text={secureOn ? 'ON' : 'OFF'}
                  onClick={() => saveConfig({ secure_mode_enabled: config.secure_mode_enabled === 'false' ? 'true' : 'false' })}
                />
                <ToggleRow
                  label="Fullscreen requirement"
                  on={fsOn}
                  text={fsOn ? 'ON' : 'OFF'}
                  onClick={() => saveConfig({ fullscreen_required: config.fullscreen_required === 'false' ? 'true' : 'false' })}
                />
                <ConfigField label="Violation cooldown (s)" value={config.violation_cooldown_seconds} onSave={(v) => saveConfig({ violation_cooldown_seconds: v })} />
              </div>
            </div>
          ) : (
            <div className="ds-card ds-card-body ds-loading"><span className="ds-spinner" /> Loading configuration…</div>
          )}
        </section>

        {/* 6-7. Squad management table + actions */}
        <section className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
          <div className="ds-row" style={{ justifyContent: 'space-between' }}>
            <h2 className="ds-h2">Operational Manifest</h2>
            <div className="ds-row" style={{ flexWrap: 'nowrap' }}>
              <input
                className="ds-input ds-input-sm"
                type="search"
                style={{ width: 260 }}
                placeholder="Search team name…"
                aria-label="Search team names"
                value={teamQuery}
                onChange={(e) => setTeamQuery(e.target.value)}
              />
              {teamQuery && (
                <button className="ds-btn ds-btn-ghost ds-btn-sm" onClick={() => setTeamQuery('')}>Clear</button>
              )}
              <span className="ds-badge ds-badge-muted">
                {q ? `${visibleTeams.length} / ${teams.length}` : teams.length} squads
              </span>
            </div>
          </div>
          <div className="ds-table-wrap ds-table-scroll">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Level</th>
                  <th>Lives</th>
                  <th>Score</th>
                  <th>Time left</th>
                  <th>Recov.</th>
                  <th>Viol.</th>
                  <th>Directives</th>
                </tr>
              </thead>
              <tbody>
                {visibleTeams.length === 0 && (
                  <tr>
                    <td colSpan={10} className="ds-table-empty">
                      {teams.length === 0 ? 'No active operative units registered yet.' : `No squads match “${teamQuery}”.`}
                    </td>
                  </tr>
                )}
                {visibleTeams.map((t) => (
                  <tr key={t.id} className={detailTeam?.id === t.id ? 'is-active' : ''}>
                    <td className="ds-cell-name">{t.teamName}</td>
                    <td>
                      <select
                        className="ds-select ds-select-sm"
                        value={t.paymentStatus}
                        onChange={(e) => adminApi.verifyPayment(t.id, e.target.value, secret).then(refresh)}
                      >
                        <option value="pending">pending</option>
                        <option value="verified">verified</option>
                        <option value="rejected">rejected</option>
                      </select>
                    </td>
                    <td>
                      <span className={`ds-badge ${statusClass(t.sessionStatus)}`}>{t.sessionStatus || 'not started'}</span>
                    </td>
                    <td className="ds-num">{t.currentLevel ?? '—'}/5</td>
                    <td className="ds-num">{t.lives ?? '—'}</td>
                    <td className="ds-num ds-accent">{t.score ?? '—'}</td>
                    <td className="ds-num">{t.timeRemainingSeconds ?? '—'}s</td>
                    <td className="ds-num">{t.recoveryAttempts ?? 0}/{config?.max_recoveries ?? 3}</td>
                    <td className="ds-num" style={{ color: t.focusViolations ? 'var(--ds-danger-text)' : MUTED }}>
                      {t.focusViolations ? `⚠ ${t.focusViolations}` : '—'}
                    </td>
                    <td>
                      <div className="ds-row" style={{ gap: 4, width: 250 }}>
                        <button className="ds-btn ds-btn-danger ds-btn-sm" onClick={() => askConfirm(`reset ${t.teamName}'s run`, adminApi.reset, t.id)} onMouseEnter={() => sfx.hover()}>Reset</button>
                        <button className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => act(adminApi.restoreLife, t.id)} onMouseEnter={() => sfx.hover()}>+1 Life</button>
                        <button className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => openDetails(t)} onMouseEnter={() => sfx.hover()}>Details</button>
                        <button className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => act(adminApi.pause, t.id)} onMouseEnter={() => sfx.hover()}>Pause</button>
                        <button className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => act(adminApi.resume, t.id)} onMouseEnter={() => sfx.hover()}>Resume</button>
                        <button className="ds-btn ds-btn-danger ds-btn-sm" onClick={() => askConfirm(`disqualify ${t.teamName}`, adminApi.disqualify, t.id)} onMouseEnter={() => sfx.hover()}>Disqualify</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <div className="ds-footer-strip">Echo Station // Operations console // Authorized eyes only</div>

      {confirming && (
        <div className="ds-overlay" onClick={() => setConfirming(null)}>
          <div className="ds-modal ds-modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-header">
              <span className="ds-label ds-accent"><IconWarning size={12} color="currentColor" /> High-level directive</span>
            </div>
            <div className="ds-modal-body">
              <p className="ds-body" style={{ margin: 0 }}>Confirm {confirming.label}?</p>
            </div>
            <div className="ds-modal-footer">
              <button className="ds-btn ds-btn-secondary" onClick={() => setConfirming(null)} onMouseEnter={() => sfx.hover()}>Cancel</button>
              <button className="ds-btn ds-btn-danger" onClick={doConfirmed} onMouseEnter={() => sfx.hover()}>Yes, execute directive</button>
            </div>
          </div>
        </div>
      )}

      {detailTeam && (
        <TeamDetailModal
          team={detailTeam}
          data={detailData}
          error={detailError}
          onClose={() => { setDetailTeam(null); setDetailData(null); setDetailError(null); }}
        />
      )}
    </div>
  );
}

function statusClass(status) {
  if (status === 'active' || status === 'tutorial' || status === 'completed') return 'ds-badge-success';
  if (status === 'failed' || status === 'disqualified') return 'ds-badge-danger';
  if (!status) return 'ds-badge-muted';
  return '';
}

function Field({ label, children }) {
  return (
    <div className="ds-field">
      <label className="ds-label">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, on, text, danger, onClick }) {
  return (
    <div className="ds-row" style={{ justifyContent: 'space-between' }}>
      <span className="ds-label">{label}</span>
      <button
        className={`ds-btn ds-btn-sm ${danger ? 'ds-btn-danger' : on ? 'ds-btn-primary' : 'ds-btn-secondary'}`}
        onClick={onClick}
        onMouseEnter={() => sfx.hover()}
      >
        {text}
      </button>
    </div>
  );
}

function TeamDetailModal({ team, data, error, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const b = data?.breakdown;
  const sec = data?.security;
  const timeLeft = b?.timeRemainingSeconds != null
    ? `${Math.floor(b.timeRemainingSeconds / 60)}:${String(b.timeRemainingSeconds % 60).padStart(2, '0')}`
    : '—';
  const scoreRows = b ? [
    ...b.levels.map((l) => [`Level ${l.level}`, `+${l.points}`]),
    ['Lives remaining', `+${b.lifeScore}`],
    ['Recovery penalties', `-${b.recoveryPenalty}`, true],
    ['Time bonus', `+${b.timeBonus}`],
    ['Efficiency', `+${b.efficiencyScore}`],
    ['Precision', `+${b.precision}`],
  ] : [];

  return (
    <div className="ds-overlay" onClick={onClose}>
      <div className="ds-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="ds-modal-header">
          <div className="ds-stack" style={{ gap: 4 }}>
            <span className="ds-label">Team telemetry</span>
            <h3 className="ds-card-title">{team.teamName}</h3>
          </div>
          <div className="ds-row" style={{ flexWrap: 'nowrap' }}>
            {b && <span className={`ds-badge ${statusClass(b.status)}`}>{b.status}</span>}
            <button className="ds-modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <div className="ds-modal-body ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
          {error && <p className="ds-alert ds-alert-error" role="alert" style={{ margin: 0 }}>{error}</p>}
          {!data && !error && <p className="ds-loading"><span className="ds-spinner" /> Synchronizing breakdown telemetry…</p>}

          {data && (
            <>
              <div className="ds-grid ds-grid-4" style={{ gap: 'var(--ds-space-sm)' }}>
                <MiniStat label="Level" value={`${b.currentLevel} / 5`} />
                <MiniStat label="Lives" value={
                  <span className="ds-row" style={{ gap: 2 }}>
                    {Array.from({ length: Math.max(0, b.lives) }).map((_, i) => <IconShield key={i} size={13} color="#5e7862" fill />)}
                    {b.lives <= 0 && '—'}
                  </span>
                } />
                <MiniStat label="Time left" value={timeLeft} />
                <MiniStat label="Recoveries" value={`${b.recoveryAttempts} used`} hint={`${b.recoverySuccesses} succeeded`} />
              </div>

              <Section title="Comprehensive score audit">
                <div className="ds-table-wrap">
                  <table className="ds-table">
                    <thead><tr><th>Component</th><th style={{ textAlign: 'right' }}>Points</th></tr></thead>
                    <tbody>
                      {scoreRows.map(([k, v, neg]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td className="ds-num" style={{ textAlign: 'right', color: neg ? 'var(--ds-danger-text)' : undefined }}>{v}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="ds-label">Display / base score</td>
                        <td className="ds-num" style={{ textAlign: 'right' }}>{b.baseScore}</td>
                      </tr>
                      <tr style={{ background: 'var(--ds-tint)' }}>
                        <td className="ds-label ds-accent">Final competitive score (leaderboard)</td>
                        <td className="ds-num ds-accent" style={{ textAlign: 'right', fontWeight: 600 }}>{b.finalScore}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="Security & focus log">
                <div className="ds-grid ds-grid-3" style={{ gap: 'var(--ds-space-sm)' }}>
                  <MiniStat label="Total violations" value={sec.totalViolations} />
                  <MiniStat label="Warnings" value={sec.warnings} />
                  <MiniStat label="Life penalties" value={sec.lifePenalties} />
                </div>
                <p className="ds-mono-sm" style={{ margin: 0 }}>
                  Last violation: {sec.lastViolationAt ? `${sec.lastViolationAt} — ${sec.lastViolationReason}` : '—'}
                </p>
                {sec.events?.length > 0 && (
                  <div className="ds-table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    <table className="ds-table">
                      <thead><tr><th>Time</th><th>Reason</th><th>Result</th></tr></thead>
                      <tbody>
                        {sec.events.map((e, i) => (
                          <tr key={i}>
                            <td className="ds-mono-sm">{e.createdAt}</td>
                            <td>{e.reason}</td>
                            <td>
                              <span className={`ds-badge ${e.penaltyApplied ? 'ds-badge-danger' : ''}`}>
                                {e.penaltyApplied ? 'LIFE -1' : 'WARNING'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        <div className="ds-modal-footer">
          <button className="ds-btn ds-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="ds-stack" style={{ gap: 'var(--ds-space-sm)' }}>
      <span className="ds-label ds-accent" style={{ paddingBottom: 4, borderBottom: '1px solid var(--ds-frame)' }}>{title}</span>
      {children}
    </section>
  );
}

function MiniStat({ label, value, hint }) {
  return (
    <div className="ds-card-inset" style={{ padding: 'var(--ds-space-sm) var(--ds-space-md)' }}>
      <span className="ds-label">{label}</span>
      <div className="ds-num" style={{ fontSize: 18, lineHeight: '26px' }}>{value}</div>
      {hint && <span className="ds-stat-hint">{hint}</span>}
    </div>
  );
}

function ConfigField({ label, value, onSave }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const dirty = String(v ?? '') !== String(value ?? '');
  return (
    <div className="ds-field">
      <div className="ds-row" style={{ justifyContent: 'space-between' }}>
        <label className="ds-label" htmlFor={`cfg-${label}`}>{label}</label>
        {dirty && <span className="ds-badge ds-badge-muted">Unsaved</span>}
      </div>
      <div className="ds-row" style={{ flexWrap: 'nowrap' }}>
        <input
          id={`cfg-${label}`}
          className="ds-input"
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
        <button className={`ds-btn ${dirty ? 'ds-btn-primary' : 'ds-btn-secondary'} ds-btn-sm`} onClick={() => onSave(v)}>Save</button>
      </div>
    </div>
  );
}
