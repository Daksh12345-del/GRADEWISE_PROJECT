import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import Logo from './components/Logo'
import FormattedAiText from './components/FormattedAiText'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import { useGrades } from '../lib/GradesContext'
import { useAuthUser } from '../lib/useAuthUser'
import { getWeakSubjectNames } from '../lib/gradesEngine'
import { fetchMyDsaStats } from '../lib/leaderboard'
import { fetchAiExplain, fetchAiDsaRoadmap, fetchAskCoach } from '../lib/api'

const QUICK_PROMPTS = [
  { label: '💬 Ask anything', mode: 'ask' },
  { label: '📘 Explain a subject', mode: 'explain' },
  { label: '🗺️ DSA roadmap', mode: 'roadmap' },
]

function ChatBubble({ role, text, error }) {
  const isUser = role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
      <div style={{
        maxWidth: '82%', padding: isUser ? '10px 15px' : '14px 16px', borderRadius: 14,
        borderBottomRightRadius: isUser ? 4 : 14,
        borderBottomLeftRadius: isUser ? 14 : 4,
        background: isUser ? 'var(--cyan)' : (error ? 'rgba(239,68,68,0.12)' : 'var(--bg-card2)'),
        color: isUser ? '#fff' : (error ? '#ef4444' : 'var(--text)'),
        border: error ? '1px solid #ef4444' : (isUser ? 'none' : '1px solid var(--border)'),
        fontFamily: 'var(--font-body, inherit)',
      }}>
        {isUser
          ? <span style={{ fontSize: '0.86rem', lineHeight: 1.5 }}>{text}</span>
          : <FormattedAiText text={text} />}
      </div>
    </div>
  )
}

export default function AiCoachPage() {
  const navigate = useNavigate()
  const { isLight, toggleTheme } = useTheme()
  const sidebarToggle = useSidebarToggle()
  const grades = useGrades()
  const { user } = useAuthUser()

  const [mode, setMode] = useState('ask') // 'ask' | 'explain' | 'roadmap'
  const [level, setLevel] = useState('beginner')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm your AI Career Coach. Ask me anything, get a subject explained in a couple of lines, or get a personalized DSA roadmap based on your level." },
  ])
  const [busy, setBusy] = useState(false)
  const [dsaStats, setDsaStats] = useState(undefined) // undefined = loading, null = none yet, {...} = real stats
  const scrollRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchMyDsaStats().then(d => { if (!cancelled) setDsaStats(d) }).catch(() => { if (!cancelled) setDsaStats(null) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Same real-data context AskAiWidget sends — CGPA, weak subjects, DSA
  // stats, target role — so "Ask anything" answers are grounded in this
  // student's actual progress, not generic advice.
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

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setBusy(true)
    try {
      let reply
      if (mode === 'roadmap') {
        reply = await fetchAiDsaRoadmap(level, [text])
      } else if (mode === 'explain') {
        reply = await fetchAiExplain(text)
      } else {
        reply = await fetchAskCoach(text, buildContext())
      }
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ ${e.message || 'Something went wrong.'}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  async function getGeneralRoadmap() {
    if (busy) return
    setMessages(prev => [...prev, { role: 'user', text: `Give me a ${level} DSA roadmap` }])
    setBusy(true)
    try {
      const reply = await fetchAiDsaRoadmap(level, [])
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ ${e.message || 'Something went wrong.'}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }} id="aiCoachPage">
      <header className="header">
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SidebarToggleButton {...sidebarToggle} />
          <div className="h-logo-icon" style={{ background: 'none', padding: 0, width: 36, height: 36, display: 'flex', alignItems: 'center' }}>
            <Logo />
          </div>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.05rem' }}>🤖 AI Career Coach</span>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: 1 }}>
              Ask about subjects or get a DSA roadmap
            </div>
          </div>
        </div>
        <div className="header-user">
          <ThemeToggleButton isLight={isLight} toggleTheme={toggleTheme} title="Toggle theme" />
        </div>
      </header>

      <div className="dash-layout">
        <Sidebar
          activePath="/ai-coach"
          navigate={navigate}
          open={sidebarToggle.open}
          mobileOpen={sidebarToggle.mobileOpen}
          closeMobile={sidebarToggle.closeMobile}
        />

        <div className="res-body">
          <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 110px)' }}>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p.mode}
                  onClick={() => setMode(p.mode)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer',
                    background: mode === p.mode ? 'var(--cyan)' : 'var(--bg-card2)',
                    color: mode === p.mode ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: '0.78rem',
                  }}
                >
                  {p.label}
                </button>
              ))}
              {mode === 'roadmap' && (
                <>
                  <select
                    value={level}
                    onChange={e => setLevel(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-card2)', color: 'var(--text)', fontSize: '0.78rem' }}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                  <button
                    onClick={getGeneralRoadmap}
                    disabled={busy}
                    className="job-apply-btn"
                    style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                  >
                    Get general roadmap
                  </button>
                </>
              )}
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 4px 12px' }}>
              {messages.map((m, i) => <ChatBubble key={i} role={m.role} text={m.text} error={m.error} />)}
              {busy && <div className="dsa-idle">Thinking…</div>}
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '10px 0' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === 'roadmap'
                    ? 'Type a weak topic (e.g. Dynamic Programming) or hit "Get general roadmap" above…'
                    : mode === 'explain'
                      ? 'Type a subject or topic, e.g. "Operating Systems deadlock"…'
                      : 'Ask anything — e.g. "My CGPA is 6.8, what should I improve for product-based companies?"'
                }
                rows={1}
                className="dsa-username-input"
                style={{ flex: 1, resize: 'none', fontFamily: 'inherit' }}
              />
              <button className="job-apply-btn" onClick={send} disabled={busy || !input.trim()}>
                {busy ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
