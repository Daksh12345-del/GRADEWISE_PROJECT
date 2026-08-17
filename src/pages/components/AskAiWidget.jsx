import { useState, useEffect, useCallback, useRef } from 'react'
import { useGrades } from '../../lib/GradesContext'
import { useAuthUser, useSetTargetRole } from '../../lib/useAuthUser'
import { getWeakSubjectNames } from '../../lib/gradesEngine'
import { fetchAskCoach, fetchTranscribeAudio } from '../../lib/api'
import FormattedAiText from './FormattedAiText'

const QUICK_PROMPTS = [
  { label: '📘 Study Planner', build: (weak) => weak[0] ? `Mujhe ${weak[0]} mein improve karna hai` : 'Mujhe apni sabse kamzor subject mein improve karna hai' },
  { label: '🗺️ DSA Roadmap', build: () => 'Mujhe DSA strong karni hai — abhi mujhe kya focus karna chahiye?' },
  { label: '🎯 Weak Subjects', build: (weak) => weak.length > 0 ? `Meri weak subjects (${weak.join(', ')}) ke liye priority kya honi chahiye?` : 'Mere marks ke hisaab se kaunsi subjects pe focus karna chahiye?' },
  { label: '💼 Career Guidance', build: () => 'Mere current progress ke hisaab se career ke liye agla step kya hona chahiye?' },
  { label: '🎤 Interview Prep', build: () => 'Mere target role ke liye interview prep kaise karu?' },
]

// Voice input uses the browser's MediaRecorder to capture audio, then
// sends it to OUR backend, which forwards it to Groq's Whisper endpoint
// (see app/ai/coach.py) — same Groq account as the rest of the AI Coach,
// deliberately not routed through any other platform (e.g. the browser's
// built-in Web Speech API, which would send audio to Google instead).
const hasMicSupport = typeof window !== 'undefined'
  && typeof navigator !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia
  && typeof window.MediaRecorder !== 'undefined'

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
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [micError, setMicError] = useState('')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  useEffect(() => {
    // Stop the mic stream if the widget unmounts mid-recording.
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  async function startRecording() {
    setMicError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '')
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        if (blob.size === 0) return
        setTranscribing(true)
        try {
          const text = await fetchTranscribeAudio(blob)
          setInput(prev => (prev ? `${prev} ${text}` : text))
        } catch (e) {
          setMicError(e.message || 'Voice input failed — please try again or type instead.')
        } finally {
          setTranscribing(false)
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setMicError('Mic access was blocked — allow microphone permission and try again.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  function toggleRecording() {
    if (busy || transcribing) return
    if (recording) stopRecording()
    else startRecording()
  }

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
          placeholder={recording ? 'Listening…' : transcribing ? 'Transcribing…' : 'e.g. "Mera CGPA 6.8 hai, product-based company ke liye kya improve karu?" — or anything else'}
          className="dsa-username-input"
          style={{ flex: 1 }}
        />
        {hasMicSupport && (
          <button
            type="button"
            onClick={toggleRecording}
            disabled={busy || transcribing}
            title={recording ? 'Stop recording' : 'Ask by voice'}
            aria-label={recording ? 'Stop recording' : 'Ask by voice'}
            style={{
              width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--border)',
              background: recording ? '#ef4444' : 'var(--bg-card2)',
              color: recording ? '#fff' : 'var(--text)',
              cursor: (busy || transcribing) ? 'default' : 'pointer',
              opacity: transcribing ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', flexShrink: 0,
              animation: recording ? 'gw-mic-pulse 1.2s ease-in-out infinite' : 'none',
            }}
          >
            {transcribing ? '…' : '🎤'}
          </button>
        )}
        <button className="job-apply-btn" onClick={() => ask(input)} disabled={busy || !input.trim()}>
          {busy ? '…' : 'Ask'}
        </button>
      </div>
      {micError && (
        <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 6 }}>{micError}</div>
      )}
      <style>{`
        @keyframes gw-mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  )
}
