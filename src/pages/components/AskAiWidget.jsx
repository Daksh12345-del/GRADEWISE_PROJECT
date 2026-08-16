import { useState, useEffect, useCallback } from 'react'
import { useGrades } from '../../lib/GradesContext'
import { useAuthUser, useSetTargetRole } from '../../lib/useAuthUser'
import { getWeakSubjectNames } from '../../lib/gradesEngine'
import { fetchAskCoach } from '../../lib/api'
import FormattedAiText from './FormattedAiText'

const QUICK_PROMPTS = [
  { label: '📘 Study Planner', build: (weak) => weak[0] ? `Mujhe ${weak[0]} mein improve karna hai` : 'Mujhe apni sabse kamzor subject mein improve karna hai' },
  { label: '🗺️ DSA Roadmap', build: () => 'Mujhe DSA strong karni hai — abhi mujhe kya focus karna chahiye?' },
  { label: '🎯 Weak Subjects', build: (weak) => weak.length > 0 ? `Meri weak subjects (${weak.join(', ')}) ke liye priority kya honi chahiye?` : 'Mere marks ke hisaab se kaunsi subjects pe focus karna chahiye?' },
  { label: '💼 Career Guidance', build: () => 'Mere current progress ke hisaab se career ke liye agla step kya hona chahiye?' },
  { label: '🎤 Interview Prep', build: () => 'Mere target role ke liye interview prep kaise karu?' },
]

// dsaStats comes from the parent (DashboardPage), which already fetches it
// once for its own "DSA Progress" cards — passed down here instead of
// firing a second, redundant Supabase query for the same row.
export default function AskAiWidget({ dsaStats }) {
  const grades = useGrades()
  const { user } = useAuthUser()
  const setTargetRole = useSetTargetRole()

  const [roleInput, setRoleInput] = useState(user?.targetRole || '')
  const [editingRole, setEditingRole] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => { setRoleInput(user?.targetRole || '') }, [user?.targetRole])

  const weakSubjects = getWeakSubjectNames(grades.marksData, 4)

  const buildContext = useCallback(() => ({
    cgpa: grades.cgpa > 0 ? Number(grades.cgpa.toFixed(2)) : null,
    semestersDone: grades.semestersDone || null,
    weakSubjects,
    dsaTotalSolved: dsaStats?.total_solved ?? null,
    dsaConsistencyScore: dsaStats?.consistency_score ?? null,
    dsaBestStreak: dsaStats?.best_streak ?? null,
    targetRole: user?.targetRole || null,
  }), [grades.cgpa, grades.semestersDone, weakSubjects, dsaStats, user?.targetRole])

  async function ask(question) {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setBusy(true)
    try {
      const answer = await fetchAskCoach(q, buildContext())
      setMessages(prev => [...prev, { role: 'assistant', text: answer }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ ${e.message || 'Something went wrong.'}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  async function saveRole() {
    await setTargetRole(roleInput)
    setEditingRole(false)
  }

  return (
    <div className="panel-section" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>🤖 Ask GradeWallah AI</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Have a doubt? Ask me anything — I know your real progress.</div>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          {editingRole ? (
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={roleInput}
                onChange={e => setRoleInput(e.target.value)}
                placeholder="e.g. SDE, Data Analyst"
                className="dsa-username-input"
                style={{ width: 160, padding: '4px 8px', fontSize: '0.75rem' }}
                autoFocus
              />
              <button onClick={saveRole} className="job-apply-btn" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>Save</button>
            </span>
          ) : (
            <span>
              Target role: <strong style={{ color: 'var(--text)' }}>{user?.targetRole || 'not set'}</strong>{' '}
              <button onClick={() => setEditingRole(true)} style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', fontSize: '0.72rem' }}>edit</button>
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        {QUICK_PROMPTS.map(p => (
          <button
            key={p.label}
            onClick={() => ask(p.build(weakSubjects))}
            disabled={busy}
            style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '0.74rem', cursor: 'pointer' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {messages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, maxHeight: 340, overflowY: 'auto' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%', padding: m.role === 'user' ? '9px 13px' : '13px 15px', borderRadius: 12,
                background: m.role === 'user' ? 'var(--cyan)' : (m.error ? 'rgba(239,68,68,0.12)' : 'var(--bg-card2)'),
                color: m.role === 'user' ? '#04202a' : (m.error ? '#ef4444' : 'var(--text)'),
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
              }}>
                {m.role === 'user'
                  ? <span style={{ fontSize: '0.84rem', lineHeight: 1.55 }}>{m.text}</span>
                  : <FormattedAiText text={m.text} />}
              </div>
            </div>
          ))}
          {busy && <div className="dsa-idle">Thinking…</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') ask(input) }}
          placeholder='e.g. "Mera CGPA 6.8 hai, product-based company ke liye kya improve karu?"'
          className="dsa-username-input"
          style={{ flex: 1 }}
        />
        <button className="job-apply-btn" onClick={() => ask(input)} disabled={busy || !input.trim()}>
          {busy ? '…' : 'Ask'}
        </button>
      </div>
    </div>
  )
}
