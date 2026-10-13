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

import { SEMESTERS, GRADE_RULES } from './gradesData'
import { CODE_TO_GROUP } from './batchGroups'
import { parseMarksFromPages, detectBatchGroupCore, buildCodeIndex } from './pdfScanCore'
import { ocrWordsToRawPage, removeTableLines, flattenBackground, filterSuspiciousOcrRows } from './ocrScanCore'

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

// Tells us WHY a scan found nothing (shown at the end of the error message).
//   tokens=0                  -> PDF is a scanned image, no text layer
//   curriculumCodes=0         -> live curriculum (Supabase) not loaded yet
//   codesInPdf=0, tokens>0    -> layout changed (code+name merged in 1 token)
//   matched=0, unmatched=...  -> PDF subject codes aren't in this account's
//                                university/course/branch/scheme curriculum
function buildScanDebug(rawPages, semesters) {
  const CODE_RE = /^([A-Z]{2,5})-?(\d{3,4}[A-Z]?)$/
  const idx = buildCodeIndex(semesters)
  const tokens = rawPages.flatMap((p) => p.items.map((it) => it.text))
  const found = [...new Set(
    tokens.map((t) => t.toUpperCase().replace(/-/g, '')).filter((t) => CODE_RE.test(t))
  )]
  const unmatched = found.filter((c) => !idx.has(c))
  return ` [debug: pages=${rawPages.length} tokens=${tokens.length} curriculumCodes=${idx.size}` +
    ` codesInPdf=${found.length} matched=${found.length - unmatched.length}` +
    ` unmatched=${unmatched.slice(0, 12).join(',')}]`
}

// ── Photo / screenshot support (OCR) ─────────────────────────
// For images instead of a PDF: clean the picture (even out lighting, remove
// the table's ruled lines), run Tesseract OCR in the browser, then feed the
// recognised words — with their positions — through the SAME column parser
// the PDF path uses. See ocrScanCore.js for the pure helpers.
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
let tesseractLoading = null
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve()
  if (tesseractLoading) return tesseractLoading
  tesseractLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = TESSERACT_URL
    s.onload = () => resolve()
    s.onerror = () => {
      tesseractLoading = null
      reject(new Error('Failed to load the photo-reading library. Check your network connection.'))
    }
    document.head.appendChild(s)
  })
  return tesseractLoading
}

const OCR_TARGET_WIDTH = 2000
const OCR_MAX_HEIGHT = 6000 // keeps the canvas under mobile browsers' size limits

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch { /* fall through to <img> */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Couldn't open "${file.name}" as an image. Try a PNG or JPG screenshot.`))
    }
    img.src = url
  })
}

// Returns a canvas ready for OCR: ~2000px wide, grayscale, evenly lit, with
// the table grid removed. `source` is an image File, or an already-rendered
// <canvas> (used for PDFs that have no text layer — see renderPdfPagesToCanvases).
async function prepareImageForOcr(source) {
  const bmp = typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement
    ? source
    : await decodeImage(source)
  const srcW = bmp.width
  const srcH = bmp.height
  const scale = Math.min(OCR_TARGET_WIDTH / srcW, OCR_MAX_HEIGHT / srcH)
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  if (bmp.close) bmp.close()

  const img = ctx.getImageData(0, 0, w, h)
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (img.data[p] * 299 + img.data[p + 1] * 587 + img.data[p + 2] * 114) / 1000
  }
  flattenBackground(gray, w, h)
  removeTableLines(gray, w, h)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    img.data[p] = img.data[p + 1] = img.data[p + 2] = gray[i]
    img.data[p + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// ── PDF without a text layer → page images ───────────────────
// "Microsoft Print to PDF" (and screenshots saved as PDF) produce pages made
// of drawn shapes/pictures with no text for PDF.js to read. Render each page
// to a canvas instead, then let the OCR pipeline below read it exactly like a
// screenshot. Page size is chosen so the canvas is ~OCR_TARGET_WIDTH wide.
const MAX_OCR_PDF_PAGES = 12

async function renderPdfPagesToCanvases(file) {
  await loadPdfJs()
  const buf = await file.arrayBuffer()
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise
  const canvases = []
  const pageCount = Math.min(pdf.numPages, MAX_OCR_PDF_PAGES)

  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(OCR_TARGET_WIDTH / base.width, OCR_MAX_HEIGHT / base.height)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    // PDF pages are transparent by default; OCR needs black text on white.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    canvases.push(canvas)
  }
  return canvases
}

// `sources` is an array of image Files and/or rendered <canvas> pages.
async function extractRawTokensFromImages(sources, onProgress) {
  const files = sources
  await loadTesseract()
  onProgress?.('🔤 Loading text reader (first time can take a few seconds)…')
  let current = ''
  const worker = await window.Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(`${current} ${Math.round(m.progress * 100)}%`)
      }
    },
  })
  const pages = []
  try {
    // PSM 6 = "single uniform block of text" — best for a ruled table.
    await worker.setParameters({ tessedit_pageseg_mode: '6' })
    for (let i = 0; i < files.length; i++) {
      const isCanvas = typeof HTMLCanvasElement !== 'undefined' && files[i] instanceof HTMLCanvasElement
      current = `🔍 Reading ${isCanvas ? 'page' : 'image'} ${i + 1} of ${files.length}…`
      onProgress?.(current)
      const canvas = await prepareImageForOcr(files[i])
      const { data } = await worker.recognize(canvas)
      pages.push(ocrWordsToRawPage(data.words || [], canvas.width, i + 1))
    }
  } finally {
    try { await worker.terminate() } catch { /* ignore */ }
  }
  return pages
}

function isImageFile(f) {
  return !!f && (/^image\//.test(f.type || '') || /\.(png|jpe?g|webp|bmp)$/i.test(f.name || ''))
}

// ── Public API ────────────────────────────────────────────────
// Accepts ONE result-sheet PDF, or one-or-more screenshots/photos of it.
// `onProgress(msg)` is optional (used to show OCR progress in the modal).
// For images the returned array also carries `viaOcr = true` and
// `dropped = [{ subjectCode, si, reason }]` (rows that were too uncertain to
// fill in automatically).
export async function scanResultPdf(fileOrFiles, semFilter = -1, onProgress) {
  const files = (Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]).filter(Boolean)
  if (files.length === 0) throw new Error('Please choose a result-sheet PDF or screenshot first.')

  const imageCount = files.filter(isImageFile).length
  if (imageCount > 0) {
    if (imageCount !== files.length) {
      throw new Error('Please upload either one PDF, or only images — not a mix of both.')
    }
    return scanResultImages(files, semFilter, onProgress)
  }

  if (files.length > 1) throw new Error('Please upload a single PDF (or several images of the result sheet).')
  const file = files[0]
  if (file.type !== 'application/pdf') {
    throw new Error('Please upload the PDF from AKTU One View portal (erp.aktu.ac.in), or a screenshot of it.')
  }

  const rawPages = await extractRawPositionalTokens(file)

  // A PDF made with a "print to image" driver (e.g. Windows "Microsoft Print
  // to PDF", or a screenshot/photo saved as PDF) has no text layer at all —
  // the page is drawn shapes/pictures, so there is nothing for PDF.js to
  // extract. Instead of giving up, render the pages to images and read them
  // with OCR, the same way a screenshot upload is handled.
  const totalTokens = rawPages.reduce((n, p) => n + p.items.length, 0)
  if (totalTokens < 20) {
    onProgress?.('📄 This PDF has no text layer — reading it as an image…')
    let canvases
    try {
      canvases = await renderPdfPagesToCanvases(file)
    } catch {
      throw new Error(
        "This PDF is just a picture of the page and couldn't be opened for reading. " +
        'On the AKTU portal click "Print One View", then in the print window set Destination to ' +
        '"Save as PDF" (the Chrome/Edge built-in option, NOT "Microsoft Print to PDF") and upload that file, ' +
        'or upload a screenshot of the result table instead.'
      )
    }
    return scanResultImages(canvases, semFilter, onProgress, true)
  }

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
        (semFilter !== -1 ? ' Also try switching the semester filter to "All Semesters".' : '') +
        buildScanDebug(rawPages, semesters)
    )
  }
  return extracted
}

// `files` is image Files and/or rendered PDF-page canvases. `fromPdf` only
// changes the wording of the failure message.
async function scanResultImages(files, semFilter, onProgress, fromPdf = false) {
  const rawPages = await extractRawTokensFromImages(files, onProgress)
  onProgress?.('🔍 Scanning result table for marks…')

  const semesters = JSON.parse(JSON.stringify(SEMESTERS))
  const parsed = await parseInWorkerOrFallback(rawPages, semesters, semFilter)

  const marks = Object.values(GRADE_RULES?.marks || {})
  const maxInternal = Math.max(0, ...marks.map((m) => m?.internal || 0)) || Infinity
  const maxExternal = Math.max(0, ...marks.map((m) => m?.external || 0)) || Infinity
  const { kept, dropped } = filterSuspiciousOcrRows(parsed, semesters, maxInternal, maxExternal)

  if (kept.length === 0) {
    throw new Error(
      (fromPdf
        ? "This PDF is only a picture of the page, and the marks couldn't be read from it. " +
          'Save the result with "Save as PDF" (Chrome/Edge built-in, NOT "Microsoft Print to PDF") from the ' +
          '"Print One View" page, or upload a clear full-width screenshot of the result table.'
        : "Couldn't read marks from the image. Use a clear, straight, full-width screenshot of the " +
          '"Print One View" result table (no glare, no tilt, whole table visible), or upload the PDF instead.') +
      (dropped.length ? ` (${dropped.length} row(s) were found but too unclear to trust.)` : '') +
      buildScanDebug(rawPages, semesters)
    )
  }
  kept.viaOcr = true
  kept.dropped = dropped
  return kept
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
