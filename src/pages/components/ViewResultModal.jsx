import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function ViewResultModal({ open, onClose }) {
  const [roll, setRoll] = useState('')
  const [dob, setDob] = useState('')
  const [captchaInput, setCaptchaInput] = useState('')
  const [captchaTs, setCaptchaTs] = useState(Date.now())
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  // Modal open hone par captcha refresh karna
  useEffect(() => {
    if (open) {
      setCaptchaTs(Date.now())
      setStatus(null)
      setCaptchaInput('')
    }
  }, [open])

  // Direct client-side AKTU Captcha URL
  const captchaUrl = `https://erp.aktu.ac.in/webpages/oneview/captcha.aspx?t=${captchaTs}`

  function reloadCaptcha() {
    setCaptchaTs(Date.now())
    setCaptchaInput('')
  }

  async function fetchResult() {
    if (!roll.trim() || !dob || !captchaInput.trim()) {
      setStatus({ type: 'error', msg: '⚠️ Roll No, DOB aur Captcha teeno enter karo!' })
      return
    }

    setBusy(true)
    setStatus({ type: 'loading', msg: '📡 Fetching Result from AKTU Portal...' })

    try {
      // Date format conversion (YYYY-MM-DD -> DD/MM/YYYY)
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
          captcha: captchaInput.trim(),
          session_data: {}
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch result')
      }

      setStatus({ type: 'success', msg: '✅ Result Fetched Successfully!' })
      
      // Result display logic / state handler here
      if (data.html) {
        // e.g., open result in new tab or display inside modal
        const resultWindow = window.open('', '_blank')
        resultWindow.document.write(data.html)
        resultWindow.document.close()
      }

    } catch (err) {
      setStatus({ type: 'error', msg: '❌ ' + err.message })
      reloadCaptcha()
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

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: '0.8rem', color: '#a78bfa', display: 'block', marginBottom: 4 }}>
              Captcha Security Code
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img 
                src={captchaUrl} 
                alt="Captcha" 
                style={{ height: 42, background: '#fff', borderRadius: 6, padding: '2px 6px' }} 
              />
              <button 
                type="button" 
                onClick={reloadCaptcha} 
                style={{ 
                  background: 'rgba(139,92,246,0.2)', 
                  border: '1px solid #8b5cf6', 
                  color: '#fff', 
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                🔄 Reload
              </button>
            </div>
            <input 
              type="text" 
              value={captchaInput} 
              onChange={(e) => setCaptchaInput(e.target.value)} 
              placeholder="Enter Captcha Code" 
              className="scan-sem-select" 
              style={{ marginTop: 8, width: '100%' }} 
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
            disabled={busy}
            style={{ opacity: busy ? 0.7 : 1 }}
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
