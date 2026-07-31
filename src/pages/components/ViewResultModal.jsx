import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import ReCAPTCHA from 'react-google-recaptcha'

export default function ViewResultModal({ open, onClose }) {
  const [roll, setRoll] = useState('')
  const [dob, setDob] = useState('')
  const [captchaToken, setCaptchaToken] = useState(null)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const recaptchaRef = useRef(null)

  // AKTU OneView Official Google reCAPTCHA v2 Sitekey
  const AKTU_SITE_KEY = '6Ld_4AITAAAAAFH9tJ0t0W8X-eY-1m5L80N_0-0-'

  useEffect(() => {
    if (open) {
      setStatus(null)
      setCaptchaToken(null)
      if (recaptchaRef.current) {
        recaptchaRef.current.reset()
      }
    }
  }, [open])

  const onCaptchaChange = (token) => {
    setCaptchaToken(token)
  }

  async function fetchResult() {
    if (!roll.trim() || !dob) {
      setStatus({ type: 'error', msg: '⚠️ Roll Number aur Date of Birth enter karein!' })
      return
    }

    if (!captchaToken) {
      setStatus({ type: 'error', msg: '⚠️ Please complete the "I am not a robot" reCAPTCHA!' })
      return
    }

    setBusy(true)
    setStatus({ type: 'loading', msg: '📡 Fetching Result from AKTU Portal...' })

    try {
      let formattedDob = dob
      if (dob.includes('-')) {
        const [year, month, day] = dob.split('-')
        formattedDob = `${day}/${month}/${year}`
      }

      const res = await fetch('https://gradewise-backend.onrender.com/api/fetch-result', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          roll_no: roll.trim(),
          dob: formattedDob,
          g_recaptcha_response: captchaToken
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch result')
      }

      setStatus({ type: 'success', msg: '✅ Result Fetched Successfully!' })

      if (data.html) {
        const resultWindow = window.open('', '_blank')
        resultWindow.document.write(data.html)
        resultWindow.document.close()
      }

    } catch (err) {
      setStatus({ type: 'error', msg: '❌ ' + err.message })
      if (recaptchaRef.current) {
        recaptchaRef.current.reset()
      }
      setCaptchaToken(null)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div id="viewResultModal" className="open">
      <div className="scan-card">
        <div style={{ paddingBottom: '1rem', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="scan-title">🎓 SEE RESULT</div>
            <button 
              onClick={onClose} 
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="scan-card-body" style={{ marginTop: 12 }}>
          <label style={{ fontSize: '0.8rem', color: '#a78bfa' }}>
            Roll Number
            <input 
              type="text" 
              value={roll} 
              onChange={(e) => setRoll(e.target.value)} 
              placeholder="e.g. 2400320100XX" 
              className="scan-sem-select" 
              style={{ marginTop: 4, width: '100%' }} 
            />
          </label>

          <label style={{ fontSize: '0.8rem', color: '#a78bfa', marginTop: 10, display: 'block' }}>
            Date of Birth
            <input 
              type="date" 
              value={dob} 
              onChange={(e) => setDob(e.target.value)} 
              className="scan-sem-select" 
              style={{ marginTop: 4, width: '100%' }} 
            />
          </label>

          {/* Real Google reCAPTCHA v2 Component */}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={AKTU_SITE_KEY}
              onChange={onCaptchaChange}
              theme="dark"
            />
          </div>

          {status && (
            <div 
              className={`scan-status ${status.type === 'error' ? 'error' : ''}`} 
              style={{ 
                marginTop: 12, 
                padding: '8px 12px', 
                borderRadius: 6, 
                fontSize: '0.85rem',
                background: status.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                color: status.type === 'error' ? '#f87171' : '#34d399',
                border: `1px solid ${status.type === 'error' ? '#ef4444' : '#10b981'}`
              }}
            >
              {status.msg}
            </div>
          )}
        </div>

        <div className="scan-actions" style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button 
            className="scan-btn-go" 
            onClick={fetchResult} 
            disabled={busy || !captchaToken}
            style={{ opacity: (busy || !captchaToken) ? 0.6 : 1 }}
          >
            {busy ? 'FETCHING...' : 'GET RESULT'}
          </button>
          <button className="scan-btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
