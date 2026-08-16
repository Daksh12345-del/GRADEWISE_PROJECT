import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { SidebarToggleButton } from './components/Sidebar'
import ThemeToggleButton from './components/ThemeToggleButton'
import Logo from './components/Logo'
import FormattedAiText from './components/FormattedAiText'
import { useSidebarToggle } from '../lib/useSidebarToggle'
import { useTheme } from '../lib/useTheme'
import { fetchAiExplain, fetchAiDsaRoadmap } from '../lib/api'

const QUICK_PROMPTS = [
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
        color: isUser ? '#04202a' : (error ? '#ef4444' : 'var(--text)'),
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

  const [mode, setMode] = useState('explain') // 'explain' | 'roadmap'
  const [level, setLevel] = useState('beginner')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm your AI Career Coach. Ask me to explain any subject topic in a couple of lines, or get a personalized DSA roadmap based on your level." },
  ])
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

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
      } else {
        reply = await fetchAiExplain(text)
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
                    color: mode === p.mode ? '#04202a' : 'var(--text)', fontWeight: 600, fontSize: '0.78rem',
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
                placeholder={mode === 'roadmap' ? 'Type a weak topic (e.g. Dynamic Programming) or hit "Get general roadmap" above…' : 'Type a subject or topic, e.g. "Operating Systems deadlock"…'}
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
