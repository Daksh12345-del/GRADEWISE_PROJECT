// ============================================================
// PDF Result-Sheet Scanner — ported from the original vanilla-JS
// app's positional-text parser. Loads PDF.js from CDN, reads each text
// token's X/Y position, and classifies marks by column (Internal /
// External / Back Paper) instead of guessing from raw text order. No
// AI/LLM involved — fully deterministic.
//
// The CPU-heavy part (grouping every token into lines, then regex-
// classifying each one against subject codes and column positions) runs
// in a dedicated Web Worker via pdfScan.worker.js whenever Workers are
// available, falling back to running the exact same logic synchronously
// on the main thread otherwise (unsupported browser, worker failed to
// start, or timed out) — see parseInWorkerOrFallback below. Public API
// (scanResultPdf / applyScannedResults / detectBatchGroup) is unchanged.
// ============================================================

import { SEMESTERS } from './gradesData'
import { CODE_TO_GROUP } from './batchGroups'
import { parseMarksFromPages, detectBatchGroupCore } from './pdfScanCore'

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
// Stays on the main thread (needs `document` to inject PDF.js's script
// tag), but this is lightweight orchestration only — the actual PDF
// parsing already happens inside PDF.js's own internal worker (that's
// what GlobalWorkerOptions.workerSrc sets up). Returns RAW, ungrouped
// tokens per page; line-grouping is deferred to pdfScanCore so it can run
// inside our own worker instead (see below).
async function extractRawPositionalTokens(file) {
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

    pages.push({ pageNum: p, items, pageWidth: Math.round(vp.width) })
  }
  return pages
}

// ── Worker offload, with graceful fallback ───────────────────
let worker = null
let workerBroken = false

function getWorker() {
  if (workerBroken) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./pdfScan.worker.js', import.meta.url), { type: 'module' })
  } catch {
    workerBroken = true
    worker = null
  }
  return worker
}

function runFallbackOnMainThread(rawPages, semesters, semFilter) {
  let extracted = parseMarksFromPages(rawPages, semesters)
  if (semFilter !== -1) extracted = extracted.filter((r) => r.si === semFilter)
  return extracted
}

const WORKER_TIMEOUT_MS = 20000

function parseInWorkerOrFallback(rawPages, semesters, semFilter) {
  const w = getWorker()
  if (!w) {
    try {
      return Promise.resolve(runFallbackOnMainThread(rawPages, semesters, semFilter))
    } catch (err) {
      return Promise.reject(err)
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false

    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      // Worker hung for some reason — don't leave the user stuck, and mark
      // it broken so subsequent scans in this session go straight to the
      // main-thread fallback instead of waiting out this timeout again.
      workerBroken = true
      try {
        resolve(runFallbackOnMainThread(rawPages, semesters, semFilter))
      } catch (err) {
        reject(err)
      }
    }, WORKER_TIMEOUT_MS)

    function onMessage(e) {
      if (settled) return
      settled = true
      cleanup()
      if (e.data?.ok) resolve(e.data.extracted)
      else reject(new Error(e.data?.error || 'PDF parsing failed.'))
    }

    function onError() {
      if (settled) return
      settled = true
      cleanup()
      workerBroken = true
      try {
        resolve(runFallbackOnMainThread(rawPages, semesters, semFilter))
      } catch (err) {
        reject(err)
      }
    }

    function cleanup() {
      clearTimeout(timeoutId)
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
    }

    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)
    w.postMessage({ rawPages, semesters, semFilter })
  })
}

// ── Batch-group auto-detection ───────────────────────────────
export function detectBatchGroup(scanned) {
  return detectBatchGroupCore(scanned, CODE_TO_GROUP)
}

// ── Public API ────────────────────────────────────────────────
export async function scanResultPdf(file, semFilter = -1) {
  if (!file) throw new Error('Please choose a result-sheet PDF first.')
  if (file.type !== 'application/pdf') {
    throw new Error('Please upload the PDF from AKTU One View portal (erp.aktu.ac.in).')
  }

  const rawPages = await extractRawPositionalTokens(file)

  // Structured-clone-safe snapshot of SEMESTERS: the worker has its own
  // module graph and can't see the live, Supabase-populated array that
  // liveContent.js mutates in place on the main thread, so we hand it a
  // plain-JSON copy explicitly instead.
  const semesters = JSON.parse(JSON.stringify(SEMESTERS))

  const extracted = await parseInWorkerOrFallback(rawPages, semesters, semFilter)

  if (extracted.length === 0) {
    // Distinguish two different failure modes so the error message actually
    // tells the student what to do next, instead of a generic dead-end:
    //
    // 1. A genuinely wrong file (fee receipt, admit card, some other PDF) —
    //    none of the AKTU One View markers are present at all.
    // 2. The RIGHT portal page, but exported *before* clicking "Print One
    //    View" — AKTU's summary view only shows session-level totals
    //    (e.g. "Marks: 1446/1800") with no per-subject table underneath.
    //    That subject-wise data simply isn't in the PDF's text layer in
    //    this case — no amount of parsing (or even an LLM/AI reading the
    //    PDF) can recover marks that were never exported into the file.
    //    The only real fix is re-exporting from the portal correctly, so
    //    we detect this exact pattern and say so directly.
    const fullText = rawPages.flatMap(p => p.items.map(it => it.text)).join(' ')
    const looksLikeOneViewSummary =
      /session\s*:/i.test(fullText) &&
      /marks\s*:/i.test(fullText) &&
      !/sgpa/i.test(fullText) // the detailed per-semester table always includes an "SGPA" field

    if (looksLikeOneViewSummary) {
      throw new Error(
        'This PDF only has the summary totals (e.g. "Marks: 1446/1800"), not the ' +
        'subject-wise marks — that\'s because it was exported before clicking ' +
        '"Print One View" on the AKTU portal. Go back to erp.aktu.ac.in, open your ' +
        'result, click "Print One View" first, and download/print THAT expanded page instead.'
      )
    }

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
//
// `fullScan` should be true when the user scanned with the "All Semesters"
// filter (the default/recommended option). A One View PDF scanned that way
// is the complete, authoritative record up to that point — a student who's
// only completed 4 semesters simply won't have rows for 5-8 in it. Any data
// already sitting in this account for a semester the PDF has no rows for is
// therefore stale (leftover from an earlier scan/manual entry on this same
// account, or from before this student's PDF was uploaded here), not a
// legitimate other semester to preserve — so those semesters get cleared
// instead of silently carried over. A single-semester filtered scan is a
// deliberate partial/targeted update, so it never touches other semesters.
export function applyScannedResults(scanned, marksData, backData, electiveChoices = {}, fullScan = false) {
  const nextMarksData = { ...marksData }
  const nextBackData = { ...backData }
  const nextElectiveChoices = { ...electiveChoices }

  const affectedSems = new Set(scanned.map((r) => r.si))

  if (fullScan) {
    SEMESTERS.forEach((_, si) => {
      if (affectedSems.has(si)) return
      delete nextMarksData[si]
      delete nextBackData[si]
      delete nextElectiveChoices[si]
    })
  }

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
