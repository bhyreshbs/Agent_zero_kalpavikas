import AgentChat from '../AgentChat.jsx';
export default function TutorialScene({ level, onAction, busy, flash, onChatReply, chatUnlocked }) {
  const exitLetter = level.environment.exit;
  return (
    <div>
      {flash?.result?.flickerCode && (
        <div className="az-panel az-glitch" style={{ borderColor: 'var(--az-accent)', textAlign: 'center' }}>
          <p className="az-sub">MAINTENANCE PANEL — BRIEF FLICKER</p>
          <p style={{ fontSize: '2rem', letterSpacing: '0.3em', color: 'var(--az-accent)' }}>{flash.result.flickerCode}</p>
          <p className="az-hint">It's gone as quickly as it appeared. You should remember that.</p>
        </div>
      )}

      <div className="az-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 60 }}>
          <div className="az-interactive" onClick={() => !busy && onAction('MOVE_TO_EXIT_A')} style={{ opacity: exitLetter === 'A' ? 1 : 0.25 }}>
            <div style={{ fontSize: '3rem' }}>🚪</div>
            <div className="az-sub">EXIT A</div>
          </div>
          <div className="az-interactive" onClick={() => !busy && onAction('MOVE_TO_EXIT_B')} style={{ opacity: exitLetter === 'B' ? 1 : 0.25 }}>
            <div style={{ fontSize: '3rem' }}>🚪</div>
            <div className="az-sub">EXIT B</div>
          </div>
        </div>
        <p className="az-hint" style={{ marginTop: 20 }}>Click the glowing exit.</p>
      </div>

      <AgentChat onReply={onChatReply} locked={!chatUnlocked} />
    </div>
  );
}
