import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getClerkUserId } from '../../lib/clerkUser'
import { useAuthUser } from '../../lib/useAuthUser'
import { fetchCgpaLeaderboard, upsertCgpaLeaderboardEntry } from '../../lib/leaderboard'

export default function CgpaLeaderboard({ open, onClose, myCgpa, myCreditsCompleted, mySemestersDone }) {
  const { user } = useAuthUser()
  const displayName = user?.name || 'Student'
  const [entries, setEntries] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const myUserId = getClerkUserId()
  const lastSynced = useRef(null) // avoids re-upserting identical data on every render

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await fetchCgpaLeaderboard()
      setEntries(data)
      setStatus('ready')
    } catch (e) {
      console.error('Leaderboard fetch failed:', e)
      setStatus('error')
    }
  }, [])

  // Auto-sync: as soon as a real CGPA exists, keep this user's row current —
  // no join button, and there's no way to remove it from the UI.
  useEffect(() => {
    if (!myUserId || mySemestersDone <= 0 || myCgpa <= 0) return
    const key = `${displayName}|${myCgpa.toFixed(2)}|${myCreditsCompleted}|${mySemestersDone}`
    if (lastSynced.current === key) return
    lastSynced.current = key
    upsertCgpaLeaderboardEntry({
      displayName, cgpa: myCgpa, creditsCompleted: myCreditsCompleted, semestersDone: mySemestersDone,
    }).then(() => { if (open) load() })
  }, [myUserId, displayName, myCgpa, myCreditsCompleted, mySemestersDone, open, load])

  useEffect(() => { if (open) load() }, [open, load])

  if (!open) return null

  const avgCgpa = entries.length > 0
    ? entries.reduce((s, e) => s + Number(e.cgpa), 0) / entries.length
    : null

  return createPortal(
    <div
      id="cgpaLeaderboardSheet"
      className="open"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target.id === 'cgpaLeaderboardSheet') onClose() }}
    >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>🏆 CGPA Leaderboard</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Everyone with a computed CGPA appears here automatically</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {mySemestersDone <= 0 && (
            <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, border: '1px dashed var(--border)', fontSize: '0.82rem', color: 'var(--text-dim)' }}>
              Fill in at least one full semester's marks to appear on this leaderboard.
            </div>
          )}

          {avgCgpa !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: 12, borderRadius: 10, background: 'var(--bg-card2)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Average CGPA · {entries.length} student{entries.length > 1 ? 's' : ''}</span>
              <span style={{ fontWeight: 800, color: 'var(--cyan)', fontSize: '1.1rem' }}>{avgCgpa.toFixed(2)}</span>
            </div>
          )}

          {status === 'loading' && <div className="dsa-idle">Loading leaderboard…</div>}
          {status === 'error' && <div className="dsa-error">⚠️ Could not load the leaderboard.</div>}
          {status === 'ready' && entries.length === 0 && <div className="dsa-idle">No results yet — be the first to fill in your marks!</div>}

          {status === 'ready' && entries.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.map((e, i) => {
                const isMe = e.user_id === myUserId
                return (
                  <div key={e.user_id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8,
                    background: isMe ? 'rgba(6,182,212,0.12)' : 'var(--bg-card2)',
                    border: isMe ? '1px solid var(--cyan)' : '1px solid transparent',
                  }}>
                    <span style={{ width: 26, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#f59e0b' : 'var(--text-dim)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text)', fontWeight: isMe ? 700 : 400 }}>
                      {e.display_name}{isMe && ' (you)'}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{e.semesters_done} sem</span>
                    <span style={{ fontWeight: 700, color: 'var(--cyan)', minWidth: 44, textAlign: 'right' }}>{Number(e.cgpa).toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
