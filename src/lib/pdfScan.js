// ============================================================
// PDF Result-Sheet Scanner — ported from the original vanilla-JS
// app's positional-text parser. Same approach: load PDF.js from
// CDN, read each text token's X/Y position, and classify marks by
// column (Internal / External / Back Paper) instead of guessing
// from raw text order. No AI/LLM involved — fully deterministic.
// ============================================================

import { SEMESTERS } from './gradesData'

let pdfJsReady = false
function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (pdfJsReady || window.pdfjsLib) { pdfJsReady = true; resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      pdfJsReady = true
      resolve()
    }
    s.onerror = () => reject(new Error('Failed to load PDF.js library. Check your network connection.'))
    document.head.appendChild(s)
  })
}

// ── Positional text extraction ───────────────────────────────
async function extractPositionalText(file) {
  await loadPdfJs()
  const buf = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise
  const pages = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const vp = page.getViewport({ scale: 1 })
    const items = content.items
      .map((it) => ({
        text: it.str.trim(),
        x: Math.round(it.transform[4]),
        y: Math.round(vp.height - it.transform[5]),
        w: Math.round(it.width),
      }))
      .filter((it) => it.text.length > 0)

    const lines = []
    items.forEach((tok) => {
      let found = false
      for (const ln of lines) {
        if (Math.abs(ln.y - tok.y) <= 2) {
          ln.tokens.push(tok)
          ln.y = (ln.y + tok.y) / 2
          found = true
          break
        }
      }
      if (!found) lines.push({ y: tok.y, tokens: [tok] })
    })

    lines.sort((a, b) => a.y - b.y)
    lines.forEach((ln) => ln.tokens.sort((a, b) => a.x - b.x))

    pages.push({ pageNum: p, lines, pageWidth: Math.round(vp.width) })
  }
  return pages
}

// ── Subject code lookup ────────────────────────────────────────
function buildCodeIndex() {
  const idx = new Map()
  function reg(codeStr, si, ji, subj) {
    const key = codeStr.toUpperCase().replace(/-/g, '').trim()
    if (key && !idx.has(key)) idx.set(key, { si, ji, subj })
  }

  SEMESTERS.forEach((sem, si) => {
    sem.subjects.forEach((subj, ji) => {
      const raw = subj.code.toUpperCase().replace(/-/g, '')
      const parts = raw.split('/')
      const base = parts[0].trim()
      reg(base, si, ji, subj)
      if (parts[1]) {
        const sec = parts[1].trim()
        if (/^\d+$/.test(sec)) {
          reg(base.replace(/\d+$/, '') + sec, si, ji, subj)
        } else {
          reg(sec, si, ji, subj)
        }
      }
      if (subj.options) {
        subj.options.forEach((opt) => {
          const optCode = opt.split(/[\s\-–]/)[0].trim()
          if (optCode) reg(optCode, si, ji, subj)
        })
      }
    })
  })
  return idx
}

// ── AKTU result row parser ──────────────────────────────────────
// AKTU One View PDFs: Code | Subject Name | Type | Internal | External | Back Paper | Grade
// Column boundaries are detected dynamically from the "Internal"/"External" header
// row on each page, then every numeric token is classified by X-zone.
function parseMarksFromPages(pages) {
  const codeIdx = buildCodeIndex()
  const bestResult = new Map()
  const CODE_RE = /^([A-Z]{2,5})-?(\d{3,4}[A-Z]?)$/

  function detectColumns(lines) {
    for (const line of lines) {
      const texts = line.tokens.map((t) => t.text.toLowerCase())
      const intIdx = texts.indexOf('internal')
      const extIdx = texts.findIndex((t) => t === 'external')
      if (intIdx === -1 || extIdx === -1) continue
      const intX = line.tokens[intIdx].x
      const extX = line.tokens[extIdx].x
      const bpX = extX + (extX - intX)
      return { intX, extX, bpX }
    }
    return { intX: 352, extX: 398, bpX: 446 }
  }

  function classifyX(x, cols) {
    const HALF = (cols.extX - cols.intX) / 2
    if (Math.abs(x - cols.intX) <= HALF) return 'internal'
    if (Math.abs(x - cols.extX) <= HALF) return 'external'
    if (Math.abs(x - cols.bpX) <= HALF + 10) return 'backpaper'
    return 'other'
  }

  for (const page of pages) {
    const cols = detectColumns(page.lines)

    for (const line of page.lines) {
      const tokens = line.tokens
      if (tokens.length < 2) continue

      let codeHit = null
      let codeTokIdx = -1
      for (let ti = 0; ti < tokens.length; ti++) {
        const t = tokens[ti].text.toUpperCase().replace(/-/g, '')
        const m = CODE_RE.exec(t)
        if (!m) continue
        const full = m[1] + m[2]
        if (codeIdx.has(full)) {
          codeHit = { ...codeIdx.get(full), rawCode: full }
          codeTokIdx = ti
          break
        }
      }
      if (!codeHit) continue
      const { si, ji, subj, rawCode } = codeHit

      let intMarks = null
      let extMarks = null
      let bpMarks = null

      for (let ti = codeTokIdx + 1; ti < tokens.length; ti++) {
        const tok = tokens[ti]
        const raw = tok.text.trim()
        let val = null
        if (/^ABS$/i.test(raw)) {
          val = 0
        } else {
          const stripped = raw.replace(/\*$/, '')
          if (/^\d+(\.\d+)?$/.test(stripped)) {
            val = Math.round(parseFloat(stripped))
            const absMax = subj.code === 'BCS753' ? 150 : subj.code === 'BCS851' ? 450 : 100
            if (val > absMax) continue
          }
        }
        if (val === null) continue

        const col = classifyX(tok.x, cols)
        if (col === 'internal' && intMarks === null) intMarks = val
        else if (col === 'external' && extMarks === null) extMarks = val
        else if (col === 'backpaper' && bpMarks === null) bpMarks = val
      }

      const effectiveExt = bpMarks !== null && bpMarks > 0 ? bpMarks : extMarks

      let total = null
      let finalInt = intMarks
      let finalExt = null
      let finalBp = bpMarks

      if (subj.internalOnly) {
        if (intMarks !== null) {
          total = intMarks
          finalInt = intMarks
          finalExt = null
          finalBp = null
        }
      } else if (subj.code === 'BCS851') {
        if (intMarks !== null || extMarks !== null) {
          finalInt = intMarks
          finalExt = extMarks
          total = (intMarks !== null ? intMarks : 0) + (extMarks !== null ? extMarks : 0)
        }
      } else {
        if (intMarks !== null && effectiveExt !== null) {
          total = intMarks + effectiveExt
          finalInt = intMarks
          finalExt = extMarks !== null ? extMarks : 0
        } else if (intMarks !== null && effectiveExt === null) {
          total = intMarks
          finalInt = intMarks
          finalExt = null
          finalBp = null
        } else {
          continue
        }
      }

      const maxTotal = subj.code === 'BCS753' ? 150 : subj.code === 'BCS851' ? 450 : 100
      if (total === null || total < 0 || total > maxTotal) continue

      const key = `${si}-${ji}`
      const existing = bestResult.get(key)

      let matchedOption = null
      if (subj.options) {
        matchedOption =
          subj.options.find((opt) =>
            opt.toUpperCase().replace(/-/g, '').startsWith(rawCode.toUpperCase().replace(/-/g, ''))
          ) || null
      }

      if (!existing || total > existing.marks) {
        bestResult.set(key, {
          si,
          ji,
          marks: total,
          internal: finalInt !== null ? finalInt : null,
          external: finalExt !== null ? finalExt : null,
          backPaper: finalBp !== null && finalBp !== undefined ? finalBp : null,
          subjectCode: rawCode,
          subjectName: matchedOption ? matchedOption.replace(/^[A-Z0-9]+\s*[-–]\s*/i, '') : subj.name,
          matchedOption,
        })
      }
    }
  }

  return [...bestResult.values()].sort((a, b) => (a.si !== b.si ? a.si - b.si : a.ji - b.ji))
}

// ── Public API ────────────────────────────────────────────────
export async function scanResultPdf(file, semFilter = -1) {
  if (!file) throw new Error('Please choose a result-sheet PDF first.')
  if (file.type !== 'application/pdf') {
    throw new Error('Please upload the PDF from AKTU One View portal (erp.aktu.ac.in).')
  }
  const pages = await extractPositionalText(file)
  let extracted = parseMarksFromPages(pages)
  if (semFilter !== -1) extracted = extracted.filter((r) => r.si === semFilter)

  if (extracted.length === 0) {
    throw new Error(
      'No subject marks found in this PDF. Make sure you uploaded the result sheet ' +
        '(not fee receipt / admit card) from AKTU One View.' +
        (semFilter !== -1 ? ' Also try switching the semester filter to "All Semesters".' : '')
    )
  }
  return extracted
}

// Applies scanned results into the marksData/backData/electiveChoices shape
// used by useMarksData. Returns { nextMarksData, nextBackData, nextElectiveChoices, affectedSems }.
export function applyScannedResults(scanned, marksData, backData, electiveChoices = {}) {
  const nextMarksData = { ...marksData }
  const nextBackData = { ...backData }
  const nextElectiveChoices = { ...electiveChoices }

  const affectedSems = new Set(scanned.map((r) => r.si))
  affectedSems.forEach((si) => {
    nextBackData[si] = { ...(nextBackData[si] || {}) }
    SEMESTERS[si].subjects.forEach((_, ji) => {
      nextBackData[si][ji] = ''
    })
  })

  scanned.forEach((item) => {
    const { si, ji } = item
    const subj = SEMESTERS[si]?.subjects[ji]
    if (!subj) return

    nextMarksData[si] = { ...(nextMarksData[si] || {}) }

    // If this slot is an elective and the scanner matched a specific option
    // (e.g. "BCS052" → "BCS052 - Data Analytics"), pre-select it in the
    // dropdown so the card shows what was actually taken, not a blank select.
    if (subj.options && item.matchedOption) {
      nextElectiveChoices[si] = { ...(nextElectiveChoices[si] || {}), [ji]: item.matchedOption }
    }

    if (subj.internalOnly) {
      if (subj.code === 'BCS851') {
        nextMarksData[si][ji] = {
          internal: item.internal !== null ? String(item.internal) : '',
          external: item.external !== null ? String(item.external) : '',
        }
      } else {
        const val = item.internal !== null ? String(item.internal) : String(item.marks)
        nextMarksData[si][ji] = { internal: val, external: '' }
      }
      return
    }

    if (item.internal !== null && item.external !== null) {
      nextMarksData[si][ji] = { internal: String(item.internal), external: String(item.external) }
    } else if (item.internal !== null) {
      nextMarksData[si][ji] = { internal: String(item.internal), external: '' }
    }

    if (item.backPaper !== null && item.backPaper !== undefined) {
      nextBackData[si][ji] = String(item.backPaper)
    }
  })

  return { nextMarksData, nextBackData, nextElectiveChoices, affectedSems: [...affectedSems] }
}
