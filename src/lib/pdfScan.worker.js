// Module Web Worker — runs the CPU-heavy line-grouping + regex
// classification from pdfScanCore.js off the main thread, so scanning a
// dense, multi-semester AKTU result PDF doesn't stall Framer Motion
// animations or make ScanModal's UI feel frozen on lower-end phones.
//
// Receives raw, ungrouped text tokens per page (already extracted on the
// main thread via PDF.js — see extractRawPositionalTokens in pdfScan.js)
// plus a structured-clone-safe snapshot of SEMESTERS, and posts back
// either the parsed results or a serializable error message.

import { parseMarksFromPages } from './pdfScanCore'

self.onmessage = (event) => {
  const { rawPages, semesters, semFilter } = event.data || {}
  try {
    let extracted = parseMarksFromPages(rawPages, semesters)
    if (semFilter !== -1) extracted = extracted.filter((r) => r.si === semFilter)
    self.postMessage({ ok: true, extracted })
  } catch (err) {
    self.postMessage({ ok: false, error: (err && err.message) || 'PDF parsing failed in worker.' })
  }
}
