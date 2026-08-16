// Deliberately NOT a full markdown library — Groq's responses only ever
// use a small, predictable subset (bold, bullet lists, numbered lists,
// paragraphs), so a tiny hand-rolled renderer keeps this dependency-free
// and gives full control over styling to match the app's design tokens.

function renderInline(text, keyPrefix) {
  // Splits on **bold** segments, keeping everything else as plain text.
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${i}`} style={{ color: 'var(--text)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

export default function FormattedAiText({ text }) {
  if (!text) return null

  const lines = text.split('\n')
  const blocks = [] // { type: 'p' | 'ul' | 'ol', items: string[] }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const bulletMatch = line.match(/^[-*•]\s+(.*)/)
    const numberedMatch = line.match(/^\d+[.)]\s+(.*)/)

    if (bulletMatch) {
      const last = blocks[blocks.length - 1]
      if (last && last.type === 'ul') last.items.push(bulletMatch[1])
      else blocks.push({ type: 'ul', items: [bulletMatch[1]] })
    } else if (numberedMatch) {
      const last = blocks[blocks.length - 1]
      if (last && last.type === 'ol') last.items.push(numberedMatch[1])
      else blocks.push({ type: 'ol', items: [numberedMatch[1]] })
    } else {
      // A short ALL-CAPS-ish or **Bold**-only line reads like a section
      // header (e.g. "**Week 1-2: Arrays & Strings**") — give it a bit
      // more visual weight than a normal paragraph.
      const isHeaderLike = /^\*\*[^*]+\*\*:?$/.test(line) && line.length < 60
      const last = blocks[blocks.length - 1]
      if (isHeaderLike) {
        blocks.push({ type: 'h', text: line.replace(/\*\*/g, '') })
      } else if (last && last.type === 'p') {
        last.text += ' ' + line
      } else {
        blocks.push({ type: 'p', text: line })
      }
    }
  }

  return (
    <div style={{ fontSize: '0.87rem', lineHeight: 1.7, color: 'inherit' }}>
      {blocks.map((b, i) => {
        if (b.type === 'ul') {
          return (
            <ul key={i} style={{ margin: '0 0 10px', paddingLeft: 20 }}>
              {b.items.map((item, j) => <li key={j} style={{ marginBottom: 4 }}>{renderInline(item, `${i}-${j}`)}</li>)}
            </ul>
          )
        }
        if (b.type === 'ol') {
          return (
            <ol key={i} style={{ margin: '0 0 10px', paddingLeft: 20 }}>
              {b.items.map((item, j) => <li key={j} style={{ marginBottom: 4 }}>{renderInline(item, `${i}-${j}`)}</li>)}
            </ol>
          )
        }
        if (b.type === 'h') {
          return <div key={i} style={{ fontWeight: 700, color: 'var(--cyan)', marginTop: i > 0 ? 10 : 0, marginBottom: 4, fontSize: '0.88rem' }}>{b.text}</div>
        }
        return <p key={i} style={{ margin: '0 0 10px' }}>{renderInline(b.text, `${i}`)}</p>
      })}
    </div>
  )
}
