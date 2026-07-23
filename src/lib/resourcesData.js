// Resource links (unit videos, notes, PYQs) — DB-only.
//
// These are intentionally empty. All values are populated at runtime from
// the `site_content` table in Supabase (keys: VIDEO_DATA, PYQ_LINKS,
// SUBJECT_NOTES) by src/lib/liveContent.js, which mutates these objects
// in place after fetching. There is no bundled fallback anymore — if
// Supabase is unreachable, these stay empty and LiveContentGate shows an
// error/retry screen instead of silently serving stale data.
//
// To add/edit resources: Supabase Dashboard → Table Editor → site_content
// → edit the `value` JSON for the relevant key → save. No redeploy needed.

export const VIDEO_DATA = {};
export const PYQ_LINKS = {};
export const SUBJECT_NOTES = {};
