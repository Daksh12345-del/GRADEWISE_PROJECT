import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { SEMESTERS } from '../../lib/gradesData'
import { applyScannedResults } from '../../lib/pdfScan'
import { useGrades } from '../../lib/GradesContext'

const CAPTCHA_ENDPOINT = 'https://gradewise-backend.onrender.com/api/get-captcha'
const RESULT_ENDPOINT = 'https://gradewise-backend.onrender.com/api/fetch-result'

export default function ViewResultModal({ open, onClose }) {
  const grades = useGrades()
  const [roll, setRoll] = useState('')
  const [dob, setDob] = useState('')
  const [captchaInput, setCaptchaInput] = useState('')
  const [captchaUrl, setCaptchaUrl] = useState('')
  const [sessionData, setSessionData] = useState(null)
  
  const [status, setStatus] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      loadFreshCaptcha()
    } else {
      reset()
    }
  }, [open])

  function reset() {
    setRoll('')
    setDob('')
    setCaptchaInput('')
    setCaptchaUrl('')
    setSessionData(null)
    setStatus(null)
    setResults(null)
  }

  async function loadFreshCaptcha() {
    setBusy(true)
    setStatus({ type: 'loading', msg: '⏳ Loading Captcha from AKTU Portal...' })
    try {
      const res = await fetch(CAPTCHA_ENDPOINT)
      const data = await res.json()
      if (data.success) {
        setCaptchaUrl(data.captcha_url)
        setSessionData(data.session_data)
        setStatus(null)
      } else {
        setStatus({ type: 'error', msg: '❌ ' + (data.error || 'Failed to load Captcha') })
      }
    } catch (e) {
      setStatus({ type: 'error', msg: '❌ Error connecting to server' })
    } finally {
      setBusy(false)
    }
  }

  async function fetchResult() {
    if (!roll.trim() || !dob || !captchaInput.trim()) {
      setStatus({ type: 'error', msg: '⚠️ Please fill Roll No, DOB & Captcha code!' })
      return
    }

    setBusy(true)
    setStatus({ type: 'loading', msg: '📡 Validating details & fetching result...' })

    try {
      let formattedDob = dob
      if (dob.includes('-')) {
        const [year, month, day] = dob.split('-')
        formattedDob = `${day}/${month}/${year}`
      }

      const res = await fetch(RESULT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll_no: roll.trim(),
          dob: formattedDob,
          captcha: captchaInput.trim(),
          session_data: sessionData
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch result')
      }

      setStatus({ type: 'success', msg: '✅ Result fetched successfully!' })
      setResults(data.subjects || [])
    } catch (err) {
      setStatus({ type: 'error', msg: '❌ ' + err.message })
      loadFreshCaptcha() // Reload captcha on failure
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div id="viewResultModal" className="open">
      <div className="scan-card">
        <div style={{ paddingBottom: '1rem', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div className="scan-title">🎓 SEE RESULT</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        <div className="scan-card-body" style={{ marginTop: 12 }}>
          <label style={{ fontSize: '0.8rem' }}>Roll Number
            <input type="text" value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="e.g. 2400320100XX" className="scan-sem-select" style={{ marginTop: 4, width: '100%' }} />
          </label>

          <label style={{ fontSize: '0.8rem', marginTop: 10, display: 'block' }}>Date of Birth
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="scan-sem-select" style={{ marginTop: 4, width: '100%' }} />
          </label>

          {captchaUrl && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={captchaUrl} alt="Captcha" style={{ height: 40, background: '#fff', borderRadius: 4 }} />
                <button type="button" onClick={loadFreshCaptcha} style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer' }}>🔄 Reload</button>
              </div>
              <input type="text" value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} placeholder="Enter Captcha Code" className="scan-sem-select" style={{ marginTop: 6, width: '100%' }} />
            </div>
          )}

          {status && <div className={`scan-status ${status.type === 'error' ? 'error' : ''}`} style={{ marginTop: 12 }}>{status.msg}</div>}
        </div>

        <div className="scan-actions" style={{ marginTop: 16 }}>
          <button className="scan-btn-go" onClick={fetchResult} disabled={busy}>
            {busy ? 'FETCHING...' : 'GET RESULT'}
          </button>
          <button className="scan-btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
