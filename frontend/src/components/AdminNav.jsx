import { Link } from 'react-router-dom';
import { IconGear, IconHome, IconTrophy } from './GameIcons.jsx';
import { sfx } from '../sound.js';

// Admin header. Same .ds-nav pattern as the player TopNav; shared by every admin-only page.
// `active` is 'console' or 'leaderboard'.
export default function AdminNav({ active = 'console' }) {
  return (
    <div className="ds-page ds-page-embed">
      <header className="ds-nav">
        <Link to="/admin" className="ds-nav-brand" aria-label="Agent Zero admin console">
          <svg viewBox="0 0 100 100" width="20" height="20" aria-hidden="true">
            <circle cx="50" cy="50" r="42" stroke="#D4A853" strokeWidth="5" fill="none" opacity="0.5" />
            <circle cx="50" cy="50" r="12" fill="#D4A853" />
            <path d="M50 2v18M50 80v18M2 50h18M80 50h18" stroke="#D4A853" strokeWidth="5" />
          </svg>
          Agent Zero
          <span className="ds-badge ds-badge-muted ds-nav-tag">Ops</span>
        </Link>
        <nav className="ds-nav-links" aria-label="Admin navigation">
          <Link
            to="/admin"
            className={`ds-nav-link${active === 'console' ? ' is-active' : ''}`}
            aria-current={active === 'console' ? 'page' : undefined}
            onMouseEnter={() => sfx.hover()}
          >
            <IconGear size={12} color="currentColor" /> Console
          </Link>
          <Link
            to="/leaderboard"
            className={`ds-nav-link${active === 'leaderboard' ? ' is-active' : ''}`}
            aria-current={active === 'leaderboard' ? 'page' : undefined}
            onMouseEnter={() => sfx.hover()}
          >
            <IconTrophy size={12} color="currentColor" /> Leaderboard
          </Link>
          <Link to="/" className="ds-nav-link" onMouseEnter={() => sfx.hover()}>
            <IconHome size={12} color="currentColor" /> Player home
          </Link>
        </nav>
        <span className="ds-nav-meta"><span className="ds-dot ds-dot-live" /> Op-station // Top secret</span>
      </header>
    </div>
  );
}
