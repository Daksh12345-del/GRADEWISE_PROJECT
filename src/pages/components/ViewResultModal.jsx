import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Official AKTU One View result portal. This is the ONLY portal this modal
// ever talks to — no scraping, no captcha automation, nothing happens
// server-side. We just save the student a search + give them a place to
// land back on this site afterwards.
const AKTU_ONEVIEW_URL = 'https://oneview.aktu.ac.in/webpages/aktu/oneview.aspx'

// Government/college portals almost always block being embedded in an
// iframe on someone else's domain (X-Frame-Options / frame-ancestors CSP).
// We can't know AKTU's exact setting from here, so we try the iframe and
// fall back to a popup window if it doesn't load within a few seconds.
const IFRAME_LOAD_TIMEOUT_MS = 3500

export default function ViewResultModal({ open, onClose }) {
  const [roll, setRoll] = useState('')
  const [dob, setDob] = useState('')
  const [stage, setStage] = useState('form') // 'form' | 'frame' | 'blocked'
  const iframeRef = useRef(null)
  const timeoutRef = useRef(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setStage('form')
      setRoll('')
      setDob('')
      loadedRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [open])

  if (!open) return null

  function handleClose() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    onClose()
  }

  function openPortal() {
    setStage('frame')
    loadedRef.current = false
    // If the iframe's load event hasn't fired shortly, assume it was
    // blocked (blank/refused frame) and switch to the popup fallback
    // instead of showing the student a permanently blank box.
    timeoutRef.current = setTimeout(() => {
      if (!loadedRef.current) setStage('blocked')
    }, IFRAME_LOAD_TIMEOUT_MS)
  }

  function handleIframeLoad() {
    loadedRef.current = true
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  function openInNewTab() {
    window.open(AKTU_ONEVIEW_URL, '_blank', 'noopener,noreferrer')
  }

  return createPortal(
    <div id="viewResultModal" className="open">
      <div className="scan-card">
        <div style={{ flexShrink: 0, paddingBottom: '1rem', borderBottom: '1px solid rgba(139,92,246,0.15)', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <div className="scan-title">🎓 SEE RESULT</div>
            <button
              onClick={handleClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1, padding: '2px 6px', borderRadius: 6 }}
              title="Close"
              aria-label="Close"
            >✕</button>
          </div>
          <div className="scan-sub" style={{ marginBottom: 0 }}>
            Check your AKTU result without leaving this page
          </div>
        </div>

        <div className="scan-card-body">
          {stage === 'form' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  University Roll Number
                  <input
                    type="text"
                    value={roll}
                    onChange={(e) => setRoll(e.target.value)}
                    placeholder="e.g. 2200270100XX"
                    className="scan-sem-select"
                    style={{ marginTop: 6, width: '100%' }}
                  />
                </label>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Date of Birth
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="scan-sem-select"
                    style={{ marginTop: 6, width: '100%' }}
                  />
                </label>
              </div>
              <div className="scan-status" style={{ marginTop: 12 }}>
                ℹ️ AKTU's portal will ask you to enter these yourself and complete
                their verification (checkbox / image or audio challenge) — that
                step happens on their site and can't be skipped or automated.
                We're just saving you the trip to go find the URL.
              </div>
            </>
          )}

          {stage === 'frame' && (
            <div style={{ position: 'relative', width: '100%', height: '60vh', minHeight: 380 }}>
              <iframe
                ref={iframeRef}
                src={AKTU_ONEVIEW_URL}
                onLoad={handleIframeLoad}
                title="AKTU One View Result Portal"
                style={{ width: '100%', height: '100%', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}
              />
              <div className="scan-status" style={{ marginTop: 10 }}>
                Roll No: <strong>{roll || '—'}</strong> &nbsp;·&nbsp; DOB: <strong>{dob || '—'}</strong>
                &nbsp;— enter these into AKTU's form above and complete their verification step.
              </div>
              <div className="scan-status" style={{ marginTop: 6 }}>
                Once your result loads, use <strong>Scan Result</strong> (screenshot or
                "Save as PDF") to pull the marks straight into your Grades tabs.
              </div>
            </div>
          )}

          {stage === 'blocked' && (
            <div className="scan-status error">
              ❌ AKTU's site doesn't allow being embedded here (this is a security
              setting on their end, not something we can change). Click below to
              open it in a new tab instead — your roll number and DOB are below to
              copy over.
              <div style={{ marginTop: 10 }}>
                Roll No: <strong>{roll || '—'}</strong> &nbsp;·&nbsp; DOB: <strong>{dob || '—'}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="scan-actions" style={{ flexShrink: 0, paddingTop: '1rem', borderTop: '1px solid rgba(139,92,246,0.12)', marginTop: '0.8rem' }}>
          {stage === 'form' && (
            <button className="scan-btn-go" onClick={openPortal} disabled={!roll.trim() || !dob}>
              <span>🚀</span> OPEN AKTU RESULT PORTAL
            </button>
          )}
          {stage === 'blocked' && (
            <button className="scan-btn-go" onClick={openInNewTab}>
              <span>↗️</span> OPEN IN NEW TAB
            </button>
          )}
          <button className="scan-btn-cancel" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
