import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, setToken } from '../api/client.js';
import TopNav from '../components/TopNav.jsx';
import { sfx } from '../sound.js';

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({ teamName: '', member1: '', member2: '', member3: '', contact: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    sfx.click();
    try {
      const { token } = await api.register(form);
      setToken(token);
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
      <main className="az-shell az-auth-shell" style={{ maxWidth: 520 }}>
        <div className="az-auth-header">
          <span className="az-badge az-auth-badge">
            <span className="az-status-beacon" />
            AGENT ENLISTMENT PROTOCOL
          </span>
          <h1 className="az-title az-auth-title">REGISTER SQUAD</h1>
          <p className="az-hint az-auth-hint">
            2–3 Operatives per squad. ₹100/squad entry fee verified at on-site check-in.
          </p>
        </div>

        <form className="az-glass-panel az-auth-card" onSubmit={submit}>
          <Row label="SQUAD / TEAM NAME">
            <input className="az-input" required placeholder="e.g. CYBER-GHOSTS" value={form.teamName} onChange={update('teamName')} />
          </Row>
          <Row label="OPERATIVE 1 (LEAD)">
            <input className="az-input" required placeholder="Lead Agent Name" value={form.member1} onChange={update('member1')} />
          </Row>
          <Row label="OPERATIVE 2">
            <input className="az-input" required placeholder="Agent 2 Name" value={form.member2} onChange={update('member2')} />
          </Row>
          <Row label="OPERATIVE 3 (OPTIONAL)">
            <input className="az-input" placeholder="Agent 3 Name" value={form.member3} onChange={update('member3')} />
          </Row>
          <Row label="TACTICAL CONTACT (EMAIL / PHONE)">
            <input className="az-input" required placeholder="operative@email.com" value={form.contact} onChange={update('contact')} />
          </Row>
          <Row label="SECURITY PASSCODE">
            <input className="az-input" required type="password" placeholder="••••••••" value={form.password} onChange={update('password')} />
          </Row>
          {error && <p className="az-error az-auth-error">{error}</p>}
          <button
            className="az-btn-primary az-btn-large az-auth-submit-btn"
            disabled={loading}
            type="submit"
            style={{ width: '100%', marginTop: 20 }}
            onMouseEnter={() => sfx.hover()}
          >
            {loading ? (
              <span>INITIALIZING SQUAD ENLISTMENT…</span>
            ) : (
              <span className="az-btn-inline-content">
                <span>INITIALIZE SQUAD REGISTRATION</span>
                <span className="az-btn-inline-arrow" aria-hidden="true">▸</span>
              </span>
            )}
          </button>
        </form>
        <p className="az-hint az-auth-footer-link" style={{ textAlign: 'center', marginTop: 22 }}>
          Squad already registered? <Link to="/login" className="az-link-highlight">Agent Login</Link>
        </p>
      </main>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="az-form-row">
      <label className="az-form-label">{label}</label>
      {children}
    </div>
  );
}

