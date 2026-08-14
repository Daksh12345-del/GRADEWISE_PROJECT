import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getClerkUserId } from '../../lib/clerkUser'
import { useAuthUser } from '../../lib/useAuthUser'
import {
  fetchCgpaLeaderboard, upsertCgpaLeaderboardEntry, leaveCgpaLeaderboard,
  isOptedIntoCgpaLeaderboard,
} from '../../lib/leaderboard'

export default function CgpaLeaderboard({ open, onClose, myCgpa, myCreditsCompleted, mySemestersDone }) {
  const { user } = useAuthUser()
  const displayName = user?.name || 'Student'
  const [entries, setEntries] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [optedIn, setOptedIn] = useState(isOptedIntoCgpaLeaderboard())
  const [saving, setSaving] = useState(false)
  const myUserId = getClerkUserId()

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

  useEffect(() => { if (open) load() }, [open, load])

  if (!open) return null

  async function handleJoin() {
    setSaving(true)
    try {
      await upsertCgpaLeaderboardEntry({
        displayName, cgpa: myCgpa, creditsCompleted: myCreditsCompleted, semestersDone: mySemestersDone,
      })
      setOptedIn(true)
      await load()
    } catch (e) {
      console.error('Failed to join leaderboard:', e)
      alert('Could not join the leaderboard — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLeave() {
    setSaving(true)
    try {
      await leaveCgpaLeaderboard()
      setOptedIn(false)
      await load()
    } catch (e) {
      console.error('Failed to leave leaderboard:', e)
    } finally {
      setSaving(false)
    }
  }

  const hasCgpa = myCgpa > 0

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
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Opt-in only — nobody's marks are shared unless they choose to join</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {!optedIn && (
            <div style={{ marginBottom: 18, padding: 14, borderRadius: 10, border: '1px dashed var(--border)' }}>
              {!hasCgpa ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                  Fill in your marks first so a real CGPA can be shared to the leaderboard.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text)', marginBottom: 8 }}>
                    Join as <strong>{displayName}</strong> with your current CGPA: <strong>{myCgpa.toFixed(2)}</strong> ({mySemestersDone} sem completed)
                  </div>
                  <button className="job-apply-btn" onClick={handleJoin} disabled={saving}>
                    {saving ? 'Joining…' : 'Join Leaderboard'}
                  </button>
                </>
              )}
            </div>
          )}

          {optedIn && (
            <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 10, background: 'var(--bg-card2)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>✅ You're on the leaderboard as <strong>{displayName}</strong></span>
              <button onClick={handleLeave} disabled={saving} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: '0.72rem', color: 'var(--text-dim)', cursor: 'pointer' }}>
                {saving ? '…' : 'Leave'}
              </button>
            </div>
          )}

          {status === 'loading' && <div className="dsa-idle">Loading leaderboard…</div>}
          {status === 'error' && <div className="dsa-error">⚠️ Could not load the leaderboard. Has the DB migration been run?</div>}
          {status === 'ready' && entries.length === 0 && <div className="dsa-idle">No one's joined yet — be the first!</div>}

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
