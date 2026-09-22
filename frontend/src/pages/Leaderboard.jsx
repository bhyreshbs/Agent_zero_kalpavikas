import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import TopNav from '../components/TopNav.jsx';
import { IconShield, IconTrophy } from '../components/GameIcons.jsx';
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

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const { leaderboard } = await api.leaderboard();
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
    <div className="az-leaderboard-page">
      <div className="az-scene-bg" />
      <TopNav showLeaderboard={false} />
      <main className="az-shell az-leaderboard-shell">
        <div className="az-leaderboard-header">
          <div>
            <span className="az-badge az-leaderboard-badge">
              <span className="az-status-beacon" /> GLOBAL AGENT DEPLOYMENT
            </span>
            <h2 className="az-title az-leaderboard-title">AGENT ZERO — LIVE RANKINGS</h2>
          </div>
          <div className="az-telemetry-badge">
            <span className="az-telemetry-dot" />
            <span className="az-telemetry-text">LIVE TELEMETRY // 5s SYNC</span>
          </div>
        </div>

        <div className="az-leaderboard-rules-banner" style={{
          background: 'rgba(6, 11, 22, 0.6)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          padding: '12px 16px',
          borderRadius: '4px',
          marginBottom: '16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
          <span style={{ color: '#00f0ff', fontWeight: 'bold' }}>ℹ️ SCORING SYSTEM:</span>
          <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Rank is determined by <strong>Total Score</strong>. Score = Base Points (Levels Cleared) + Time Bonus (If Escaped) + Shields Remaining − Recovery Penalties.
          </span>
        </div>

        {error && <p className="az-error az-leaderboard-error">{error}</p>}

        <div className="az-glass-panel az-leaderboard-table-panel">
          <table className="az-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Operative Unit</th>
                <th>Status</th>
                <th>Sector</th>
                <th>Score</th>
                <th>Elapsed</th>
                <th>Shields</th>
                <th>Recoveries</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="az-table-empty">
                    <span className="az-status-beacon" /> Awaiting initial operative telemetries…
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isTop3 = r.rank <= 3;
                const statusColor = r.status === 'failed' ? 'var(--az-danger)' : r.status === 'completed' ? 'var(--az-accent)' : '#00f0ff';
                return (
                  <tr
                    key={r.teamName}
                    className={`az-table-row ${isTop3 ? 'is-top-rank' : ''}`}
                    onMouseEnter={() => sfx.hover()}
                  >
                    <td className="az-table-cell-rank">
                      <span className={`az-rank-badge ${isTop3 ? `is-medal rank-${r.rank}` : ''}`}>
                        {isTop3 && <IconTrophy size={11} style={{ marginRight: 4 }} />}#{r.rank}
                      </span>
                    </td>
                    <td className="az-table-cell-team">
                      <span className="az-team-name">{r.teamName}</span>
                    </td>
                    <td>
                      <span
                        className={`az-status-chip az-status-${r.status || 'active'}`}
                        style={{
                          color: statusColor,
                          background: `rgba(${r.status === 'failed' ? '255, 59, 92' : r.status === 'completed' ? '53, 242, 194' : '0, 240, 255'}, 0.12)`,
                          borderColor: `rgba(${r.status === 'failed' ? '255, 59, 92' : r.status === 'completed' ? '53, 242, 194' : '0, 240, 255'}, 0.35)`,
                        }}
                      >
                        {r.status === 'completed' || r.status === 'failed' ? r.status.toUpperCase() : 'ACTIVE RUN'}
                      </span>
                    </td>
                    <td className="az-font-mono">{r.level}/5</td>
                    <td className="az-table-cell-score">
                      {r.score.toLocaleString()}
                    </td>
                    <td className="az-font-mono">
                      {r.timeSeconds != null ? fmtTime(r.timeSeconds) : '—'}
                    </td>
                    <td className="az-table-cell-shields">
                      <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                        {r.lives > 0 ? (
                          Array.from({ length: Math.min(5, r.lives) }).map((_, i) => (
                            <IconShield key={i} size={13} color="#10b981" fill />
                          ))
                        ) : (
                          <span style={{ color: 'var(--az-danger)', fontSize: '0.92rem', fontWeight: 700 }}>OFFLINE</span>
                        )}
                      </span>
                    </td>
                    <td className="az-font-mono">{r.recoveryAttempts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

