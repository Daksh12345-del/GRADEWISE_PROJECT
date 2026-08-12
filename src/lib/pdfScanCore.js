// ============================================================
// Pure, DOM-free PDF-scan parsing/classification logic.
//
// Split out of pdfScan.js so this exact code can run inside a Web Worker
// (src/lib/pdfScan.worker.js) — this is the CPU-heavy part (grouping every
// text token on every page into lines, then regex-classifying every token
// against subject codes and column positions), which is what was actually
// causing the UI-thread hitching on dense, multi-semester AKTU result
// PDFs on lower-end phones, not the PDF.js text extraction itself (that
// already runs mostly inside PDF.js's own internal worker).
//
// Takes `semesters` as a plain, structured-clone-safe parameter instead of
// importing the live SEMESTERS export directly, because a Worker has its
// own separate module graph — it would otherwise see the build-time EMPTY
// constant, not the Supabase-populated one that liveContent.js mutates in
// place on the main thread. The caller (pdfScan.js) is responsible for
// passing a JSON-safe snapshot.
// ============================================================

// ── Line grouping ──
// O(tokens × lines-seen-so-far) per page — the actual hot loop for a
// dense, many-row result table.
export function groupIntoLines(items) {
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
  return lines
}

// ── Subject code lookup ────────────────────────────────────────
export function buildCodeIndex(semesters) {
  const idx = new Map()
  function reg(codeStr, si, ji, subj) {
    const key = codeStr.toUpperCase().replace(/-/g, '').trim()
    if (key && !idx.has(key)) idx.set(key, { si, ji, subj })
  }

  semesters.forEach((sem, si) => {
    sem.subjects.forEach((subj, ji) => {
      const raw = subj.code.toUpperCase().replace(/-/g, '')
      const parts = raw.split('/')
      const base = parts[0].trim()
      reg(base, si, ji, subj)

      // AKTU prints the Sports/Yoga/NSS audit courses under a "BVA" code,
      // but curriculum data for these has sometimes been entered as "BVE"
      // (mixed up with the unrelated BVE Human Values subjects). A code
      // typo here means the scanner silently skips the row — the subject
      // still renders fine for manual entry, so this is easy to miss.
      // Registering both prefixes for audit subjects only (never for
      // regular theory/practical subjects) makes scanning resilient to
      // that specific, known mismatch without risking false matches
      // elsewhere.
      if (subj.audit) {
        if (base.startsWith('BVA')) reg('BVE' + base.slice(3), si, ji, subj)
        else if (base.startsWith('BVE')) reg('BVA' + base.slice(3), si, ji, subj)
      }

      if (parts[1]) {
        const sec = parts[1].trim()
        if (/^\d+$/.test(sec)) {
          const secCode = base.replace(/\d+$/, '') + sec
          reg(secCode, si, ji, subj)
          if (subj.audit) {
            if (secCode.startsWith('BVA')) reg('BVE' + secCode.slice(3), si, ji, subj)
            else if (secCode.startsWith('BVE')) reg('BVA' + secCode.slice(3), si, ji, subj)
          }
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
//
// `rawPages` is [{ pageNum, items: [{text,x,y,w}], pageWidth }] — ungrouped
// tokens as extracted directly from PDF.js's getTextContent(). Line
// grouping happens here (see groupIntoLines above), inside whichever
// thread this function is called from.
export function parseMarksFromPages(rawPages, semesters) {
  const pages = rawPages.map((p) => ({ ...p, lines: groupIntoLines(p.items) }))
  const codeIdx = buildCodeIndex(semesters)
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

      if (subj.code === 'BCS851') {
        // Project-II is flagged internalOnly in the curriculum data (it's a
        // single practical row, not a theory subject), but it still has a
        // real internal/external split on the AKTU result sheet — so this
        // check must run before the generic `subj.internalOnly` branch below,
        // or `external` gets wiped out before it's ever read.
        if (intMarks !== null || extMarks !== null) {
          finalInt = intMarks
          finalExt = extMarks
          total = (intMarks !== null ? intMarks : 0) + (extMarks !== null ? extMarks : 0)
        }
      } else if (subj.internalOnly) {
        if (intMarks !== null) {
          total = intMarks
          finalInt = intMarks
          finalExt = null
          finalBp = null
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

// ── Batch-group auto-detection ───────────────────────────────
// A student's scanned result sheet already contains hard evidence of which
// batch group they're in — the specific subject codes on it. Every
// group-swap subject code found in the scan casts one vote; if every vote
// agrees, that's the detected group. Cheap enough to not need worker
// offload, but parameterized the same way for consistency / testability.
export function detectBatchGroupCore(scanned, codeToGroup) {
  let votesA = 0
  let votesB = 0
  scanned.forEach((item) => {
    const g = codeToGroup[item.subjectCode]
    if (g === 'A') votesA++
    else if (g === 'B') votesB++
  })
  if (votesA > 0 && votesB === 0) return { group: 'A', votes: votesA }
  if (votesB > 0 && votesA === 0) return { group: 'B', votes: votesB }
  if (votesA > 0 && votesB > 0) return { group: null, conflict: true, votesA, votesB }
  return { group: null }
}
