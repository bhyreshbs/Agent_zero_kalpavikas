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
      const { session } = await api.login({ teamName, password });
      await setSession(session);
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
    <div className="az-auth-page">
      <div className="az-scene-bg" />
      <TopNav />
      <main className="az-shell az-auth-shell" style={{ maxWidth: 460 }}>
        <div className="az-auth-header">
          <span className="az-badge az-auth-badge">
            <span className="az-status-beacon" />
            SECURITY CLEARANCE TERMINAL
          </span>
          <h2 className="az-title az-auth-title">TEAM AUTHENTICATION</h2>
          <p className="az-hint az-auth-hint">Enter authorized squad credentials to access the facility link.</p>
        </div>
        <form className="az-glass-panel az-auth-card" onSubmit={submit}>
          <div className="az-form-row">
            <label className="az-form-label">TEAM IDENTIFIER / SQUAD NAME</label>
            <input
              className="az-input"
              required
              placeholder="e.g. ALPHA-VANGUARD"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>
          <div className="az-form-row" style={{ marginTop: 18 }}>
            <label className="az-form-label">ACCESS PASSCODE</label>
            <input
              className="az-input"
              required
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="az-error az-auth-error">{error}</p>}
          <button
            className="az-btn-primary az-btn-large"
            disabled={loading}
            type="submit"
            style={{ width: '100%', marginTop: 22 }}
            onMouseEnter={() => sfx.hover()}
          >
            {loading ? 'AUTHENTICATING ACCESS…' : 'AUTHORIZE ENTRY ▸'}
          </button>
        </form>
      </main>
    </div>
  );
}
