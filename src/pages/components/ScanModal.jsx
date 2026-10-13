import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SEMESTERS } from '../../lib/gradesData'
import { scanResultPdf, applyScannedResults, detectBatchGroup } from '../../lib/pdfScan'
import { useGrades } from '../../lib/GradesContext'
import { useAuthUser, useSetUserGroup } from '../../lib/useAuthUser'

const SEM_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const GROUP_LABEL = { A: 'Physics-first (Group A)', B: 'Chemistry-first (Group B)' }

export default function ScanModal({ open, onClose }) {
  const grades = useGrades()
  const { user } = useAuthUser()
  const setUserGroup = useSetUserGroup()
  const fileInputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [semFilter, setSemFilter] = useState(-1)
  const [status, setStatus] = useState(null) // { type: 'loading'|'success'|'error', msg }
  const [results, setResults] = useState(null)
  const [detectedGroup, setDetectedGroup] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ocrNotice, setOcrNotice] = useState(null) // { dropped: [{subjectCode, reason}] } when read from photos
  const [dragOver, setDragOver] = useState(false)

  if (!open) return null

  function reset() {
    setFiles([])
    setStatus(null)
    setResults(null)
    setDetectedGroup(null)
    setOcrNotice(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  // One PDF, or one-or-more images (screenshots/photos) of the result sheet.
  function handleFiles(list) {
    const arr = Array.from(list || []).filter(Boolean)
    if (arr.length === 0) return
    const isImg = (f) => /^image\//.test(f.type || '') || /\.(png|jpe?g|webp|bmp)$/i.test(f.name || '')
    const images = arr.filter(isImg)
    // A PDF is always scanned on its own; images can be combined (a result
    // sheet is often 2-3 screenshots tall).
    setFiles(images.length === arr.length ? images : [arr.find((f) => !isImg(f))])
    setStatus(null)
    setResults(null)
    setOcrNotice(null)
  }

  async function runScan() {
    if (files.length === 0) {
      setStatus({ type: 'error', msg: '⚠️ Please upload a result sheet first.' })
      return
    }
    setBusy(true)
    setOcrNotice(null)
    const fromImages = files.some((f) => /^image\//.test(f.type || '') || /\.(png|jpe?g|webp|bmp)$/i.test(f.name || ''))
    setStatus({ type: 'loading', msg: fromImages ? '🖼️ Preparing image…' : '📄 Reading PDF layout…' })
    try {
      const extracted = await scanResultPdf(
        fromImages ? files : files[0],
        semFilter,
        (msg) => setStatus({ type: 'loading', msg })
      )
      setStatus({ type: 'loading', msg: '🔍 Scanning result table for marks…' })
      const semsFound = [...new Set(extracted.map((r) => r.si + 1))]
      const semLabel = semsFound.length > 1 ? `Semesters ${semsFound.join(', ')}` : `Semester ${semsFound[0]}`

      // Detect batch group straight from the codes actually found on this
      // sheet — never trusted from the account, always re-verified per scan.
      const detection = detectBatchGroup(extracted)
      setDetectedGroup(detection.group)

      setResults(extracted)
      let msg = `✅ Found ${extracted.length} subject(s) across ${semLabel}!`
      if (detection.group) {
        msg += ` Detected ${GROUP_LABEL[detection.group]}.`
      } else if (detection.conflict) {
        msg += ' ⚠️ Codes from both batch groups appeared — skipping group update, please double check this PDF.'
      }
      msg += ' Review below and click "Fill All Marks".'
      if (extracted.viaOcr) setOcrNotice({ dropped: extracted.dropped || [] })
      setStatus({ type: 'success', msg })
    } catch (err) {
      setStatus({ type: 'error', msg: '❌ ' + (err.message || 'Something went wrong. Please try again.') })
    } finally {
      setBusy(false)
    }
  }

  function fillAllScannedMarks() {
    if (!results || results.length === 0) return
    // semFilter === -1 means "All Semesters" was scanned — treat the PDF as
    // the complete record and clear any semester it has no rows for, instead
    // of leaving old/stale data from before sitting in the account.
    // Exception: a photo/screenshot may show only part of the sheet (e.g. the
    // first of three pages), so its absence of a semester proves nothing —
    // never clear other semesters' data based on an image scan.
    const { nextMarksData, nextBackData, nextElectiveChoices } = applyScannedResults(
      results, grades.marksData, grades.backData, grades.electiveChoices, semFilter === -1 && !results.viaOcr
    )
    grades.bulkApply(nextMarksData, nextBackData, nextElectiveChoices)

    // Only overwrite the stored group when this scan gave an unambiguous
    // answer AND it actually differs from what's stored — avoids a pointless
    // write, and never touches it on a conflicting/undetected scan.
    if (detectedGroup && detectedGroup !== user?.group) {
      setUserGroup(detectedGroup)
    }

    setStatus({ type: 'success', msg: `✅ Filled ${results.length} subject(s). You can review them on the Grades tabs.` })
    setTimeout(handleClose, 900)
  }

  return createPortal(
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
            Upload your AKTU One View result PDF (or screenshots of it) — marks are extracted and filled automatically
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
              handleFiles(e.dataTransfer.files)
            }}
          >
            <div className="scan-drop-icon">🖼️</div>
            <div className="scan-drop-text">
              <strong>Click to upload</strong> or drag & drop here<br />
              PDF from AKTU One View portal recommended<br />
              Screenshots / photos also work
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />

          {files.length > 0 && (
            <div className="scan-preview-wrap show" style={{ display: 'flex' }}>
              <span style={{ fontSize: '1.2rem' }}>{/^image\//.test(files[0].type || '') ? '🖼️' : '📄'}</span>
              <span className="scan-preview-name">
                {files.length === 1 ? files[0].name : `${files.length} images selected`}
              </span>
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

          {ocrNotice && (
            <div className="scan-status error" style={{ marginTop: '0.6rem' }}>
              📷 Read from an image, so a digit can occasionally be misread. Please compare each mark below with your result sheet before filling.
              {ocrNotice.dropped.length > 0 && (
                <> ⚠️ Couldn't read {ocrNotice.dropped.length} subject(s) clearly
                  ({ocrNotice.dropped.slice(0, 8).map((d) => d.subjectCode).join(', ')}
                  {ocrNotice.dropped.length > 8 ? ', …' : ''}) — they were skipped, please enter them manually.</>
              )}
            </div>
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
                    {results.viaOcr && r.internal !== null
                      ? `${r.internal}${r.external !== null ? ` + ${r.external}` : ''} = `
                      : ''}
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
    </div>,
    document.body
  )
}
