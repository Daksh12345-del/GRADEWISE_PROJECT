// Login form dropdown data (colleges, branches, domains) — DB-only.
//
// Intentionally empty at build time. Populated at runtime from the
// `site_content` table in Supabase (keys: COLLEGES_BY_CITY, BRANCHES,
// DOMAIN_GROUPS) by src/lib/liveContent.js. See resourcesData.js for the
// full explanation of the pattern — no bundled fallback, DB is the only
// source of truth.

export const COLLEGES_BY_CITY = [];
export const BRANCHES = {};
export const DOMAIN_GROUPS = [];
