import { useState } from 'react'
import { createPortal } from 'react-dom'
import { SEMESTERS } from '../../lib/gradesData'
import { applyScannedResults } from '../../lib/pdfScan'
import { useGrades } from '../../lib/GradesContext'

function mapApiResponseToScanned(subjects) {
  const scanned = []
  for (const item of subjects || []) {
    const sem = SEMESTERS[item.semesterIndex]
    if (!sem) continue
    const ji = sem.subjects.findIndex((s) => s.code === item.code)
    if (ji === -1) continue
    scanned.push({
      si: item.semesterIndex,
      ji,
      internal: item.internal ?? null,
      external: item.external ?? null,
      backPaper: item.backPaper ?? null,
      matchedOption: item.matchedOption ?? null,
    })
  }
  return scanned
}

export default function ViewResultModal({ open, onClose }) {
  const grades = useGrades()
  const [roll, setRoll] = useState('')
  const [dob, setDob] = useState('')
  const [status, setStatus] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  function reset() {
    setRoll('')
    setDob('')
    setStatus(null)
    setResults(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function fetchResult() {
    if (!roll.trim() || !dob) {
      setStatus({ type: 'error', msg: '⚠️ Enter your roll number and date of birth first.' })
      return
    }

    setBusy(true)
    setResults(null)
    setStatus({ type: 'loading', msg: '📡 Connecting to AKTU OneView…' })

    try {
      // Format DOB to DD/MM/YYYY for AKTU Portal
      let formattedDob = dob
      if (dob.includes('-')) {
        const [year, month, day] = dob.split('-')
        formattedDob = `${day}/${month}/${year}`
      }

      const targetUrl = 'https://erp.aktu.ac.in/webpages/oneview/oneview.aspx'
      
      // 1. Initial Page Session Fetch via AllOrigins JSON proxy
      const getProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`
      const getRes = await fetch(getProxyUrl)
      if (!getRes.ok) throw new Error('AKTU OneView Portal unreachable right now.')
      
      const jsonRes = await getRes.json()
      const htmlText = jsonRes.contents

      const parser = new DOMParser()
      const doc = parser.parseFromString(htmlText, 'text/html')

      const viewState = doc.querySelector('#__VIEWSTATE')?.value
      const viewStateGen = doc.querySelector('#__VIEWSTATEGENERATOR')?.value
      const eventValidation = doc.querySelector('#__EVENTVALIDATION')?.value

      if (!viewState || !eventValidation) {
        throw new Error('Unable to extract session keys from AKTU Portal.')
      }

      setStatus({ type: 'loading', msg: '⌛ Submitting credentials…' })

      // 2. Submit Form Credentials using AllOrigins Raw Proxy
      const formData = new URLSearchParams()
      formData.append('__VIEWSTATE', viewState)
      if (viewStateGen) formData.append('__VIEWSTATEGENERATOR', viewStateGen)
      formData.append('__EVENTVALIDATION', eventValidation)
      formData.append('txtRollNo', roll.trim())
      formData.append('txtDOB', formattedDob)
      formData.append('btnSearch', 'Search')

      const postProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`

      const postRes = await fetch(postProxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      })

      if (!postRes.ok) throw new Error(`AKTU server responded with status ${postRes.status}`)

      const resultHtml = await postRes.text()

      if (resultHtml.includes('Invalid') || resultHtml.includes('not found')) {
        throw new Error('Invalid Roll Number or Date of Birth. Please check again.')
      }

      setStatus({ 
        type: 'success', 
        msg: '✅ Result fetched successfully from AKTU OneView!' 
      })

    } catch (err) {
      setStatus({ type: 'error', msg: '❌ ' + (err.message || 'Failed to connect. Try again.') })
    } finally {
      setBusy(false)
    }
  }

  function fillAllResults() {
    if (!results || results.length === 0) return
    const { nextMarksData, nextBackData, nextElectiveChoices } = applyScannedResults(
      results, grades.marksData, grades.backData, grades.electiveChoices
    )
    grades.bulkApply(nextMarksData, nextBackData, nextElectiveChoices)
    setStatus({ type: 'success', msg: `✅ Filled ${results.length} subject(s).` })
    setTimeout(handleClose, 900)
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
            Enter your details — your result is fetched and filled automatically
          </div>
        </div>

        <div className="scan-card-body">
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
                disabled={busy}
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
                disabled={busy}
              />
            </label>
          </div>

          {status && (
            <div className={`scan-status ${status.type === 'error' ? 'error' : ''}`} style={{ marginTop: 12 }}>
              {status.msg}
            </div>
          )}

          {results && results.length > 0 && (
            <div className="scan-results-table-wrap" style={{ marginTop: 12, maxHeight: 220, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Sem</th>
                    <th style={{ textAlign: 'left' }}>Subject</th>
                    <th>Internal</th>
                    <th>External</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => {
                    const subj = SEMESTERS[r.si]?.subjects[r.ji]
                    return (
                      <tr key={idx}>
                        <td>{r.si + 1}</td>
                        <td>{subj?.code || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{r.internal ?? '—'}</td>
                        <td style={{ textAlign: 'center' }}>{r.external ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="scan-actions" style={{ flexShrink: 0, paddingTop: '1rem', borderTop: '1px solid rgba(139,92,246,0.12)', marginTop: '0.8rem' }}>
          {!results && (
            <button className="scan-btn-go" onClick={fetchResult} disabled={busy || !roll.trim() || !dob}>
              <span>📡</span> {busy ? 'FETCHING…' : 'GET RESULT'}
            </button>
          )}
          {results && results.length > 0 && (
            <button className="scan-btn-go" onClick={fillAllResults}>
              <span>✅</span> FILL ALL MARKS
            </button>
          )}
          <button className="scan-btn-cancel" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
