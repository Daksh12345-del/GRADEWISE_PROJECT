// ============================================================
// Pure, DOM-free helpers that turn OCR output (Tesseract words + pixel
// bounding boxes, from a photo/screenshot of the AKTU One View table) into
// the SAME raw-token shape the PDF path produces:
//   { pageNum, items: [{ text, x, y, w }], pageWidth }
// so the existing parser (parseMarksFromPages in pdfScanCore.js) can be
// reused unchanged — Internal / External / Back Paper column detection
// included.
//
// Kept separate from pdfScan.js so it can be unit-tested in Node.
// ============================================================

// The PDF path works in PDF points (a letter page is ~612 wide). Normalise
// OCR pixel coordinates to the same scale so the parser's pixel tolerances
// (line grouping, column half-widths) mean the same thing for both inputs.
const PAGE_W = 612

// Tesseract commonly confuses letters with digits, and leaves small stubs of
// the table's ruled lines stuck to digits ("[17", "|38", "l44"). Only ever
// applied to tokens that already look like a subject code or a marks number,
// so normal words ("Engineering", "Theory") are never touched.
const CODE_LIKE = /^([A-Z]{2,5})-?([0-9OoIl|S]{3,4})([A-Z]?)$/
const DIGIT_FIX = { O: '0', o: '0', I: '1', l: '1', '|': '1', S: '5' }
const NUM_FIX = { O: '0', o: '0', I: '1', l: '1', '|': '1' }
// "37*" (back-paper marker) is often read as 37%, 37x, 37#, 37+ ...
const STAR_LIKE = /^[*%xX#+\u00b0\u2022\u00a4]$/

export function fixOcrToken(text) {
  let t = text.trim()

  // Leftover scraps of a ruled line can stay glued to either end of a token
  // ("BAS301_", "_47", "46."), which would stop the code lookup / number match.
  // Strip them — hyphens are kept ("--" is the empty back-paper cell, and
  // codes may legitimately be written "BCS-301").
  const trimmed = t.replace(/^[_.,:;'"`~]+/, '').replace(/[_.,:;'"`~]+$/, '')
  if (trimmed) t = trimmed

  const c = CODE_LIKE.exec(t)
  if (c && /[0-9]/.test(c[2])) {
    const digits = c[2].replace(/[OoIl|S]/g, (ch) => DIGIT_FIX[ch])
    return c[1] + digits + c[3]
  }

  // "BEE151" is sometimes read "BEEL51" (digit 1 -> letter L).
  const cl = /^([A-Z]{2,4})L([0-9OoIl|]{2,3})([A-Z]?)$/.exec(t)
  if (cl && /[0-9]/.test(cl[2])) {
    return cl[1] + '1' + cl[2].replace(/[OoIl|]/g, (ch) => NUM_FIX[ch]) + cl[3]
  }

  // Marks number: strip bracket/pipe stubs from either end first.
  const stripped = t.replace(/^[\[\]|!({]+/, '').replace(/[\]|!)}]+$/, '')
  if (stripped) t = stripped

  // optional trailing star-like marker
  let core = t
  let star = ''
  if (core.length > 1 && STAR_LIKE.test(core[core.length - 1])) {
    star = '*'
    core = core.slice(0, -1)
  }

  if (/^[0-9OoIl|]{1,3}$/.test(core) && /[0-9]/.test(core)) {
    // 3 chars with a leading I/l/| then two digits: that's a line stub in
    // front of a 2-digit mark ("l44" -> 44). Real 3-digit marks are "100",
    // which start with a genuine digit, so they are unaffected.
    if (core.length === 3 && /^[Il|]/.test(core) && /^[0-9OoIl|]{2}$/.test(core.slice(1)) && /[0-9]/.test(core.slice(1))) {
      core = core.slice(1)
    }
    return core.replace(/[OoIl|]/g, (ch) => NUM_FIX[ch]) + star
  }

  return t
}

// words: [{ text, bbox: { x0, y0, x1, y1 } }] in image pixels.
export function ocrWordsToRawPage(words, imgWidth, pageNum = 1) {
  const scale = PAGE_W / imgWidth
  const items = (words || [])
    .filter((w) => w && typeof w.text === 'string' && w.text.trim() && w.bbox)
    .map((w) => ({
      text: fixOcrToken(w.text),
      x: Math.round(w.bbox.x0 * scale),
      // vertical CENTRE (not top/baseline): far more stable across the
      // different glyph heights in one table row.
      y: Math.round(((w.bbox.y0 + w.bbox.y1) / 2) * scale),
      w: Math.round((w.bbox.x1 - w.bbox.x0) * scale),
    }))
    .filter((it) => it.text.length > 0)

  // lineTol: OCR centres wobble a little more than exact PDF coordinates
  // (and photos can be slightly tilted). Row spacing is ~18 units at this
  // scale, so 5 is safely tighter than one row.
  return { pageNum, items, pageWidth: PAGE_W, lineTol: 5 }
}

// ── Table-line removal ───────────────────────────────────────
// The One View result table has a full grid of ruled lines. OCR engines glue
// a vertical rule onto the digit next to it ("40" -> "Jao", "11" -> "Jr"),
// which destroys the marks. Text strokes are short; rules are long, so wipe
// any straight run of dark pixels longer than a threshold, vertically and
// horizontally, before recognition.
//
// gray: Uint8Array/Uint8ClampedArray, width*height, 0=black .. 255=white.
// Modifies `gray` in place and returns it.
export function removeTableLines(gray, width, height, opts = {}) {
  // Thresholds are relative to image width so they hold for any input size
  // (callers normalise to ~2000px wide; text is ~1% of width tall).
  const dark = opts.dark ?? 200
  const minV = opts.minVertical ?? Math.round(width * 0.03)    // ~60px @2000
  const minH = opts.minHorizontal ?? Math.round(width * 0.06)  // ~120px @2000

  // vertical runs
  for (let x = 0; x < width; x++) {
    let start = -1
    for (let y = 0; y <= height; y++) {
      const isDark = y < height && gray[y * width + x] < dark
      if (isDark) { if (start < 0) start = y }
      else if (start >= 0) {
        if (y - start >= minV) for (let k = start; k < y; k++) gray[k * width + x] = 255
        start = -1
      }
    }
  }
  // horizontal runs
  for (let y = 0; y < height; y++) {
    let start = -1
    const row = y * width
    for (let x = 0; x <= width; x++) {
      const isDark = x < width && gray[row + x] < dark
      if (isDark) { if (start < 0) start = x }
      else if (start >= 0) {
        if (x - start >= minH) for (let k = start; k < x; k++) gray[row + k] = 255
        start = -1
      }
    }
  }
  return gray
}

// ── Lighting normalisation ───────────────────────────────────
// Phone photos/screenshots often have uneven lighting (one side darker).
// Estimate the paper brightness per block (90th percentile ignores the ink),
// interpolate it smoothly, and divide it out so paper becomes uniformly
// white. Run BEFORE removeTableLines so its dark-pixel threshold is valid.
export function flattenBackground(gray, width, height) {
  const B = Math.max(24, Math.round(width / 30))
  const gx = Math.ceil(width / B)
  const gy = Math.ceil(height / B)
  const bg = new Float32Array(gx * gy)
  const hist = new Uint32Array(256)

  for (let by = 0; by < gy; by++) {
    for (let bx = 0; bx < gx; bx++) {
      hist.fill(0)
      let n = 0
      const y1 = Math.min(height, (by + 1) * B)
      const x1 = Math.min(width, (bx + 1) * B)
      for (let y = by * B; y < y1; y++) {
        const row = y * width
        for (let x = bx * B; x < x1; x++) { hist[gray[row + x]]++; n++ }
      }
      let acc = 0
      const target = n * 0.9
      let v = 255
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) { v = i; break } }
      bg[by * gx + bx] = Math.max(v, 1)
    }
  }

  for (let y = 0; y < height; y++) {
    const fy = Math.min(gy - 1, Math.max(0, y / B - 0.5))
    const y0 = Math.floor(fy), y1 = Math.min(gy - 1, y0 + 1), ty = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = Math.min(gx - 1, Math.max(0, x / B - 0.5))
      const x0 = Math.floor(fx), x1 = Math.min(gx - 1, x0 + 1), tx = fx - x0
      const top = bg[y0 * gx + x0] * (1 - tx) + bg[y0 * gx + x1] * tx
      const bot = bg[y1 * gx + x0] * (1 - tx) + bg[y1 * gx + x1] * tx
      const b = top * (1 - ty) + bot * ty
      const out = (gray[y * width + x] / b) * 255
      gray[y * width + x] = out > 255 ? 255 : out
    }
  }
  return gray
}

// ── Safety net for OCR results ───────────────────────────────
// OCR can occasionally drop a number. The PDF parser treats "internal found,
// external missing" as an internal-only subject, which for a normal subject
// would silently record a far too LOW total (e.g. 45 instead of 88). For OCR
// input that guess is unsafe, so rows that can't be trusted are removed and
// reported back, to be entered manually, instead of being filled in wrong.
//
// extracted: output of parseMarksFromPages.  semesters: plain-JSON snapshot.
// maxInternal / maxExternal: largest internal/external marks allowed by the
// active scheme's rules (pass Infinity if unknown).
export function filterSuspiciousOcrRows(extracted, semesters, maxInternal = Infinity, maxExternal = Infinity) {
  const kept = []
  const dropped = []
  const SPECIAL = new Set(['BCS753', 'BCS851']) // different mark scales

  for (const r of extracted) {
    const subj = semesters[r.si]?.subjects?.[r.ji]
    const internalOnly = !!(subj && (subj.internalOnly || subj.audit))
    let reason = null

    if (!internalOnly && r.external === null) {
      reason = 'external marks not readable'
    } else if (!SPECIAL.has(subj?.code)) {
      if (r.internal !== null && r.internal > maxInternal) reason = 'internal marks look wrong'
      else if (r.external !== null && r.external > maxExternal) reason = 'external marks look wrong'
    }

    if (reason) dropped.push({ subjectCode: r.subjectCode, si: r.si, reason })
    else kept.push(r)
  }
  return { kept, dropped }
}
