import { describe, it, expect } from 'vitest'
import {
  fixOcrToken, ocrWordsToRawPage, removeTableLines, flattenBackground, filterSuspiciousOcrRows,
} from './ocrScanCore'
import { parseMarksFromPages } from './pdfScanCore'

describe('fixOcrToken', () => {
  it('repairs letter/digit confusions in subject codes', () => {
    expect(fixOcrToken('BAS1O1')).toBe('BAS101')
    expect(fixOcrToken('BEEL51')).toBe('BEE151')
    expect(fixOcrToken('BCS4O2')).toBe('BCS402')
  })
  it('strips ruled-line stubs from marks and normalises the back-paper star', () => {
    expect(fixOcrToken('[17')).toBe('17')
    expect(fixOcrToken('|38')).toBe('38')
    expect(fixOcrToken('l44')).toBe('44')
    expect(fixOcrToken('37%')).toBe('37*')
    expect(fixOcrToken('2O')).toBe('20')
  })
  it('strips stray underscore/dot scraps from the ends of codes and marks', () => {
    expect(fixOcrToken('BAS301_')).toBe('BAS301')
    expect(fixOcrToken('_47')).toBe('47')
    expect(fixOcrToken('46.')).toBe('46')
  })
  it('leaves ordinary words and real 3-digit marks alone', () => {
    for (const w of ['Engineering', 'Theory', 'Practical', '--', '100', 'A+']) expect(fixOcrToken(w)).toBe(w)
  })
})

describe('removeTableLines / flattenBackground', () => {
  it('erases long rules but keeps short text strokes', () => {
    const w = 400, h = 300
    const g = new Uint8Array(w * h).fill(255)
    for (let y = 0; y < h; y++) g[y * w + 100] = 0           // long vertical rule
    for (let x = 0; x < w; x++) g[50 * w + x] = 0            // long horizontal rule
    for (let y = 120; y < 130; y++) g[y * w + 200] = 0       // short "text" stroke
    removeTableLines(g, w, h)
    expect(g[200 * w + 100]).toBe(255)
    expect(g[50 * w + 300]).toBe(255)
    expect(g[125 * w + 200]).toBe(0)
  })
  it('turns an unevenly lit blank page uniformly white', () => {
    const w = 300, h = 200
    const g = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = 150 + Math.round((x / w) * 100)
    flattenBackground(g, w, h)
    expect(Math.min(...g)).toBeGreaterThan(240)
  })
})

describe('OCR words -> existing marks parser', () => {
  const semesters = [{ sem: 1, subjects: [
    { code: 'BAS101', name: 'Physics' },
    { code: 'BAS151', name: 'Physics Lab' },
    { code: 'BVA151', name: 'Sports', audit: true, internalOnly: true },
  ] }]
  const W = (text, x0, y) => ({ text, bbox: { x0, x1: x0 + 20, y0: y - 5, y1: y + 5 } })
  // image 1224 wide => scale 0.5 to the parser's 612 space
  const words = [
    W('Internal', 690, 100), W('External', 790, 100),
    W('BAS1O1', 100, 140), W('Theory', 600, 140), W('[21', 690, 141), W('40', 790, 139),
    W('BAS151', 100, 180), W('Practical', 600, 180), W('47', 690, 180), // external unreadable
    W('BVA151', 100, 220), W('95', 690, 220),
  ]
  it('parses repaired tokens and reads the columns', () => {
    const page = ocrWordsToRawPage(words, 1224)
    const rows = parseMarksFromPages([page], semesters)
    const phys = rows.find((r) => r.subjectCode === 'BAS101')
    expect(phys).toMatchObject({ internal: 21, external: 40, marks: 61 })
  })
  it('drops rows that would otherwise be recorded with a wrong (too low) total', () => {
    const rows = parseMarksFromPages([ocrWordsToRawPage(words, 1224)], semesters)
    const { kept, dropped } = filterSuspiciousOcrRows(rows, semesters, 100, 70)
    expect(dropped.map((d) => d.subjectCode)).toEqual(['BAS151'])
    expect(kept.map((r) => r.subjectCode).sort()).toEqual(['BAS101', 'BVA151'])
  })
})
