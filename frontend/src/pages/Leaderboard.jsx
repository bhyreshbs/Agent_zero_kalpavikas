import { useEffect, useState } from 'react';
import { adminApi } from '../api/client.js';
import AdminNav from '../components/AdminNav.jsx';
import { IconShield, IconTrophy } from '../components/GameIcons.jsx';
import { useNavigate } from 'react-router-dom';
import { sfx } from '../sound.js';

function fmtTime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    let active = true;
    const adminSecret = sessionStorage.getItem('az_admin_secret');
    if (!adminSecret) {
      nav('/');
      return;
    }

    async function poll() {
      try {
        const { leaderboard } = await adminApi.leaderboard(adminSecret);
        if (active) setRows(leaderboard);
      } catch (err) {
        if (active) setError(err.message);
      }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="ds-page" style={{ minHeight: '100vh' }}>
      <AdminNav active="leaderboard" />
      <main className="ds-container ds-stack" style={{ gap: 'var(--ds-space-lg)' }}>
        <header className="ds-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div className="ds-stack" style={{ gap: 4 }}>
            <span className="ds-label">Global agent deployment</span>
            <h1 className="ds-title">Agent Zero — Live Rankings</h1>
          </div>
          <span className="ds-badge ds-badge-success">
            <span className="ds-dot ds-dot-live" /> Live telemetry // 5s sync
          </span>
        </header>

        <div className="ds-card-inset" style={{ padding: 'var(--ds-space-md) var(--ds-space-lg)' }}>
          <span className="ds-label ds-accent">Scoring system</span>
          <p className="ds-mono-sm" style={{ margin: '4px 0 0', lineHeight: '20px' }}>
            Rank is determined by <strong style={{ color: 'var(--ds-text)' }}>Total Score</strong>. Score = Base Points (Levels Cleared) + Time Bonus (If Escaped) + Shields Remaining − Recovery Penalties.
          </p>
        </div>

        {error && <p className="ds-alert ds-alert-error" role="alert" style={{ margin: 0 }}>{error}</p>}

        <div className="ds-table-wrap ds-table-scroll">
          <table className="ds-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Operative unit</th>
                <th>Status</th>
                <th>Sector</th>
                <th style={{ textAlign: 'right' }}>Score</th>
                <th>Elapsed</th>
                <th>Shields</th>
                <th>Recoveries</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="ds-table-empty">
                    <span className="ds-loading" style={{ justifyContent: 'center' }}>
                      <span className="ds-spinner" /> Awaiting initial operative telemetries…
                    </span>
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isTop3 = r.rank <= 3;
                const statusBadge = r.status === 'failed' ? 'ds-badge-danger' : r.status === 'completed' ? 'ds-badge-success' : '';
                return (
                  <tr
                    key={r.teamName}
                    className={isTop3 ? 'is-active' : ''}
                    onMouseEnter={() => sfx.hover()}
                  >
                    <td>
                      <span className={`ds-badge ${isTop3 ? '' : 'ds-badge-muted'}`}>
                        {isTop3 && <IconTrophy size={11} color="currentColor" />}#{r.rank}
                      </span>
                    </td>
                    <td className="ds-cell-name">{r.teamName}</td>
                    <td>
                      <span className={`ds-badge ${statusBadge}`}>
                        {r.status === 'completed' || r.status === 'failed' ? r.status : 'Active run'}
                      </span>
                    </td>
                    <td className="ds-num">{r.level}/5</td>
                    <td className="ds-num ds-accent" style={{ textAlign: 'right', fontSize: 14 }}>
                      {r.score.toLocaleString()}
                    </td>
                    <td className="ds-num">{r.timeSeconds != null ? fmtTime(r.timeSeconds) : '—'}</td>
                    <td>
                      <span className="ds-row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                        {r.lives > 0 ? (
                          Array.from({ length: Math.min(5, r.lives) }).map((_, i) => (
                            <IconShield key={i} size={13} color="#5e7862" fill />
                          ))
                        ) : (
                          <span className="ds-badge ds-badge-danger">Offline</span>
                        )}
                      </span>
                    </td>
                    <td className="ds-num">{r.recoveryAttempts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
      <div className="ds-footer-strip">Echo Station // Live rankings // Authorized eyes only</div>
    </div>
  );
}
