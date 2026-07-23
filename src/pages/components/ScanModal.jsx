import { useRef, useState } from 'react'
import { SEMESTERS } from '../../lib/gradesData'
import { scanResultPdf, applyScannedResults } from '../../lib/pdfScan'
import { useGrades } from '../../lib/GradesContext'

const SEM_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

export default function ScanModal({ open, onClose }) {
  const grades = useGrades()
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [semFilter, setSemFilter] = useState(-1)
  const [status, setStatus] = useState(null) // { type: 'loading'|'success'|'error', msg }
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  if (!open) return null

  function reset() {
    setFile(null)
    setStatus(null)
    setResults(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFile(f) {
    if (!f) return
    setFile(f)
    setStatus(null)
    setResults(null)
  }

  async function runScan() {
    if (!file) {
      setStatus({ type: 'error', msg: '⚠️ Please upload a result sheet first.' })
      return
    }
    setBusy(true)
    setStatus({ type: 'loading', msg: '📄 Reading PDF layout…' })
    try {
      const extracted = await scanResultPdf(file, semFilter)
      setStatus({ type: 'loading', msg: '🔍 Scanning result table for marks…' })
      const semsFound = [...new Set(extracted.map((r) => r.si + 1))]
      const semLabel = semsFound.length > 1 ? `Semesters ${semsFound.join(', ')}` : `Semester ${semsFound[0]}`
      setResults(extracted)
      setStatus({
        type: 'success',
        msg: `✅ Found ${extracted.length} subject(s) across ${semLabel}! Review below and click "Fill All Marks".`,
      })
    } catch (err) {
      setStatus({ type: 'error', msg: '❌ ' + (err.message || 'Something went wrong. Please try again.') })
    } finally {
      setBusy(false)
    }
  }

  function fillAllScannedMarks() {
    if (!results || results.length === 0) return
    const { nextMarksData, nextBackData, nextElectiveChoices } = applyScannedResults(
      results, grades.marksData, grades.backData, grades.electiveChoices
    )
    grades.bulkApply(nextMarksData, nextBackData, nextElectiveChoices)
    setStatus({ type: 'success', msg: `✅ Filled ${results.length} subject(s). You can review them on the Grades tabs.` })
    setTimeout(handleClose, 900)
  }

  return (
    <div id="scanModal" className="open">
      <div className="scan-card">
        <div style={{ flexShrink: 0, paddingBottom: '1rem', borderBottom: '1px solid rgba(139,92,246,0.15)', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <div className="scan-title">📄 SCAN RESULT SHEET</div>
            <button
              onClick={handleClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1, padding: '2px 6px', borderRadius: 6 }}
              title="Close"
              aria-label="Close"
            >✕</button>
          </div>
          <div className="scan-sub" style={{ marginBottom: 0 }}>
            Upload your AKTU One View result PDF — marks are extracted and filled automatically
          </div>
        </div>

        <div className="scan-card-body">
          <div
            className={`scan-drop-zone ${dragOver ? 'drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              handleFile(e.dataTransfer.files[0])
            }}
          >
            <div className="scan-drop-icon">🖼️</div>
            <div className="scan-drop-text">
              <strong>Click to upload</strong> or drag & drop here<br />
              PDF from AKTU One View portal recommended
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {file && (
            <div className="scan-preview-wrap show" style={{ display: 'flex' }}>
              <span style={{ fontSize: '1.2rem' }}>📄</span>
              <span className="scan-preview-name">{file.name}</span>
              <span
                className="scan-preview-remove"
                onClick={reset}
                title="Remove"
                aria-label="Remove selected file"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reset() } }}
              >✕</span>
            </div>
          )}

          <div className="scan-sem-select-wrap">
            <label className="scan-sem-label">Filter by semester (or leave as All to fill everything at once)</label>
            <select className="scan-sem-select" value={semFilter} onChange={(e) => setSemFilter(parseInt(e.target.value, 10))}>
              <option value={-1}>✦ All Semesters (recommended — fills CGPA in one go)</option>
              {SEMESTERS.map((s, si) => (
                <option key={s.sem} value={si}>Semester {SEM_ROMAN[si]}</option>
              ))}
            </select>
          </div>

          {status && (
            <div className={`scan-status ${status.type}`}>{status.msg}</div>
          )}

          {results && results.length > 0 && (
            <div id="scanResultsArea" style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map((r) => (
                <div
                  key={`${r.si}-${r.ji}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '0.5rem 0.7rem', borderRadius: 8, background: 'var(--bg-card2)', border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{r.subjectCode}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.subjectName} · Sem {SEM_ROMAN[r.si]}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--cyan)', flexShrink: 0 }}>
                    {r.marks}{r.backPaper !== null ? ` (back: ${r.backPaper}*)` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="scan-actions" style={{ flexShrink: 0, paddingTop: '1rem', borderTop: '1px solid rgba(139,92,246,0.12)', marginTop: '0.8rem' }}>
          {results && results.length > 0 ? (
            <button className="scan-btn-go" onClick={fillAllScannedMarks}>
              <span>✅</span> FILL ALL MARKS
            </button>
          ) : (
            <button className="scan-btn-go" onClick={runScan} disabled={busy}>
              <span>⚡</span> {busy ? 'SCANNING…' : 'EXTRACT & FILL MARKS'}
            </button>
          )}
          <button className="scan-btn-cancel" onClick={handleClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
