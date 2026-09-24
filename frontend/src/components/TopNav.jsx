import { Link, useLocation, useNavigate } from 'react-router-dom';
import { IconMap, IconHome, IconUser } from './GameIcons.jsx';
import { sfx } from '../sound.js';
import MuteToggle from './MuteToggle.jsx';
import { isLoggedIn, logout } from '../api/client.js';
import { levelLabel } from '../story.js';

// Player header. Uses the shared Agent Zero design-system nav (.ds-nav);
// the admin console header uses the same classes.
export default function TopNav({ currentLevel = null }) {
  const loggedIn = isLoggedIn();
  const location = useLocation();
  const nav = useNavigate();
  const teamName = localStorage.getItem('az_team_name') || 'Player';

  return (
    <div className="ds-page ds-page-embed">
      <header className="ds-nav">
        <Link to="/" className="ds-nav-brand" onClick={() => sfx.click()} aria-label="Agent Zero home">
          <svg viewBox="0 0 100 100" width="20" height="20" aria-hidden="true">
            <circle cx="50" cy="50" r="42" stroke="#D4A853" strokeWidth="5" fill="none" opacity="0.5" />
            <circle cx="50" cy="50" r="12" fill="#D4A853" />
            <path d="M50 2v18M50 80v18M2 50h18M80 50h18" stroke="#D4A853" strokeWidth="5" />
          </svg>
          Agent Zero
        </Link>

        <nav className="ds-nav-links" aria-label="Main navigation">
          <Link
            to="/"
            className={`ds-nav-link ${location.pathname === '/' ? 'is-active' : ''}`}
            aria-current={location.pathname === '/' ? 'page' : undefined}
            onClick={() => sfx.click()}
          >
            <IconHome size={12} color="currentColor" /> Home
          </Link>
          {loggedIn && (
            <Link
              to="/map"
              className={`ds-nav-link ${location.pathname === '/map' ? 'is-active' : ''}`}
              aria-current={location.pathname === '/map' ? 'page' : undefined}
              onClick={() => sfx.click()}
            >
              <IconMap size={12} color="currentColor" /> Levels
            </Link>
          )}
        </nav>

        <div className="ds-row" style={{ flexWrap: 'nowrap', gap: 'var(--ds-space-sm)' }}>
          {loggedIn ? (
            <>
              {currentLevel !== null && (
                <span className="ds-badge ds-badge-muted">{levelLabel(currentLevel)}</span>
              )}
              <span className="ds-badge">
                <IconUser size={11} color="currentColor" /> {teamName}
              </span>
              <button
                className="ds-btn ds-btn-ghost ds-btn-sm"
                title="Terminate Link (Log Out)"
                onClick={async () => {
                  sfx.click();
                  localStorage.removeItem('az_token');
                  localStorage.removeItem('az_team_id');
                  localStorage.removeItem('az_team_secret');
                  localStorage.removeItem('az_team_name');
                  await logout(); // actually end the session (the old handler only cleared legacy keys)
                  nav('/');
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <Link to="/login" className="ds-btn ds-btn-secondary ds-btn-sm" onClick={() => sfx.click()}>
              Agent login
            </Link>
          )}
          <MuteToggle variant="ds" />
        </div>
      </header>
    </div>
  );
}
