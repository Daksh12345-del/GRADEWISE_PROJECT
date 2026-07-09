// Subject knowledge base (importance, unit topics, study tips) — DB-only.
//
// SUBJECT_KB is intentionally empty at build time. It's populated at
// runtime from the `site_content` table in Supabase (key: SUBJECT_KB) by
// src/lib/liveContent.js. See resourcesData.js for the full explanation
// of the pattern — no bundled fallback, DB is the only source of truth.
//
// getKB() below is matching LOGIC, not data — it stays in code. It looks
// up a subject's entry in SUBJECT_KB (populated from DB) by code, falling
// back to name-based matching, then to the 'DEFAULT' entry.

export const SUBJECT_KB = {};

export function getKB(subj) {
  const codes = subj.code.replace(/\*/g, '').split('/').map(c => c.trim())
  for (const c of codes) if (SUBJECT_KB[c]) return SUBJECT_KB[c]
  const n = subj.name.toLowerCase()
  if (n.includes('engineering physics'))                             return SUBJECT_KB['BAS101']
  if (n.includes('engineering chemistry'))                           return SUBJECT_KB['BAS102']
  if (n.includes('mathematics-i') || n.includes('math i'))           return SUBJECT_KB['BAS103']
  if (n.includes('mathematics-ii') || n.includes('mathematics ii'))  return SUBJECT_KB['BAS203']
  if (n.includes('electrical engg') || n.includes('electrical eng')) return SUBJECT_KB['BEE101']
  if (n.includes('electronics engg') || n.includes('electronics eng')) return SUBJECT_KB['BEC101']
  if (n.includes('programming') || n.includes('problem solving'))   return SUBJECT_KB['BCS101']
  if (n.includes('data struct'))                                     return SUBJECT_KB['BCS301']
  if (n.includes('organization') || n.includes('architecture'))     return SUBJECT_KB['BCS302']
  if (n.includes('discrete'))                                        return SUBJECT_KB['BCS303']
  if (n.includes('operating'))                                       return SUBJECT_KB['BCS401']
  if (n.includes('automata') || n.includes('formal'))               return SUBJECT_KB['BCS402']
  if (n.includes('java') || n.includes('object oriented'))          return SUBJECT_KB['BCS403']
  if (n.includes('database') || n.includes('dbms'))                 return SUBJECT_KB['BCS501']
  if (n.includes('web tech'))                                        return SUBJECT_KB['BCS502']
  if (n.includes('algorithm') || n.includes('daa'))                 return SUBJECT_KB['BCS503']
  if (n.includes('software eng'))                                    return SUBJECT_KB['BCS601']
  if (n.includes('compiler'))                                        return SUBJECT_KB['BCS602']
  if (n.includes('network'))                                         return SUBJECT_KB['BCS603']
  if (n.includes('artificial intelligence'))                         return SUBJECT_KB['BCS701']
  if (n.includes('internet of things') || n.includes('iot'))        return SUBJECT_KB['BCS070']
  if (n.includes('cloud'))                                           return SUBJECT_KB['BCS071']
  if (n.includes('cryptography'))                                    return SUBJECT_KB['BCS072']
  if (n.includes('mobile') || n.includes('development of app'))     return SUBJECT_KB['BCS073']
  return SUBJECT_KB['DEFAULT']
}
