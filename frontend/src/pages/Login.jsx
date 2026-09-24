import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setSession } from '../api/client.js';
import TopNav from '../components/TopNav.jsx';
import { sfx } from '../sound.js';

export default function Login() {
  const nav = useNavigate();
  const [teamName, setTeamName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    sfx.click();
    try {
      const { session, team } = await api.login({ teamName, password });
      await setSession(session);
      if (team?.teamName) localStorage.setItem('az_team_name', team.teamName);
      sfx.success();
      nav('/lobby');
    } catch (err) {
      sfx.fail();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ds-page" style={{ minHeight: '100vh' }}>
      <TopNav />
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
          <span className="ds-badge ds-badge-chamfer">Security terminal // Clearance level 0</span>
          <h1 className="ds-title">Team Authentication</h1>
          <p className="ds-mono-sm" style={{ margin: 0 }}>
            Enter authorized squad credentials to access the facility link.
          </p>
        </div>

        <form className="ds-card" onSubmit={submit}>
          <div className="ds-card-header">
            <span className="ds-label">Squad credentials</span>
            <span className="ds-mono-sm"><span className="ds-dot ds-dot-warn" /> Echo station</span>
          </div>
          <div className="ds-card-body ds-stack">
            <div className="ds-field">
              <label className="ds-label" htmlFor="login-team">Team identifier / squad name</label>
              <input
                id="login-team"
                className={`ds-input${error ? ' is-error' : ''}`}
                required
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="e.g. ALPHA-VANGUARD"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
            <div className="ds-field">
              <label className="ds-label" htmlFor="login-pass">Access passcode</label>
              <input
                id="login-pass"
                className={`ds-input${error ? ' is-error' : ''}`}
                required
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="ds-alert ds-alert-error" role="alert" style={{ margin: 0 }}>{error}</p>
            )}
            <button
              className={`ds-btn ds-btn-primary ds-btn-block${loading ? ' is-loading' : ''}`}
              disabled={loading}
              type="submit"
              onMouseEnter={() => sfx.hover()}
            >
              {loading ? 'Authenticating access…' : 'Authorize entry ▸'}
            </button>
          </div>
          <div className="ds-card-footer" style={{ flexWrap: 'nowrap' }}>
            <Link to="/" className="ds-btn ds-btn-ghost ds-btn-sm" style={{ paddingLeft: 0 }}>← Return to briefing</Link>
            <span className="ds-mono-sm">Encrypted link</span>
          </div>
        </form>
      </main>
      <div className="ds-footer-strip">Echo Station // Security terminal // Authorized eyes only</div>
    </div>
  );
}
