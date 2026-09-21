import { Link, useLocation } from 'react-router-dom';
import { IconTrophy, IconMap, IconKey } from './GameIcons.jsx';
import { sfx } from '../sound.js';
import MuteToggle from './MuteToggle.jsx';

export default function TopNav({ showLeaderboard = true }) {
  const loggedIn = !!localStorage.getItem('az_token');
  const location = useLocation();

  return (
    <nav className="az-topnav" aria-label="Main Navigation">
      <Link
        to="/"
        className="az-topnav-brand"
        onClick={() => sfx.click()}
        onMouseEnter={() => sfx.hover()}
      >
        <span className="az-brand-icon-shield" style={{ width: 32, height: 32, fontSize: '0.85rem' }}>▲</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="az-topnav-brand-text">AGENT ZERO</span>
          <span style={{ fontSize: '0.75rem', color: '#60a5fa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Think • Plan • Act • Solve</span>
        </div>
      </Link>

      <div className="az-topnav-links">
        <span className="az-topnav-status" style={{ fontSize: '0.75rem' }}>
          <span className="az-status-beacon" />
          SECURE // LINK ACTIVE
        </span>
        {showLeaderboard && (
          <Link
            to="/leaderboard"
            className={`az-nav-link ${location.pathname === '/leaderboard' ? 'is-active' : ''}`}
            onClick={() => sfx.click()}
            onMouseEnter={() => sfx.hover()}
          >
            <IconTrophy size={14} style={{ marginRight: 6 }} /> Leaderboard
          </Link>
        )}
        {loggedIn && (
          <Link
            to="/map"
            className={`az-nav-link ${location.pathname === '/map' ? 'is-active' : ''}`}
            onClick={() => sfx.click()}
            onMouseEnter={() => sfx.hover()}
          >
            <IconMap size={14} style={{ marginRight: 6 }} /> Mission Map
          </Link>
        )}
        {!loggedIn && (
          <Link
            to="/login"
            className={`az-nav-link ${location.pathname === '/login' ? 'is-active' : ''}`}
            onClick={() => sfx.click()}
            onMouseEnter={() => sfx.hover()}
          >
            <IconKey size={14} style={{ marginRight: 6 }} /> Agent Login
          </Link>
        )}
        <MuteToggle />
      </div>
    </nav>
  );
}



