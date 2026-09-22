import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Lobby from './pages/Lobby.jsx';
import LevelMap from './pages/LevelMap.jsx';
import GamePage from './pages/GamePage.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/map" element={<LevelMap />} />
      <Route path="/play" element={<GamePage />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
