// Login form dropdown data — DB-only.
//
// Intentionally empty at build time. Populated at runtime from Supabase by
// src/lib/liveContent.js. See resourcesData.js for the full explanation of the
// pattern — no bundled fallback, DB is the only source of truth.
//
//   UNIVERSITY_DIRECTORY  <- tables `universities` -> `colleges` -> `college_branches`
//                            (see gradewise-backend/supabase_universities_schema.sql)
//                            Shape: [{ code, name, colleges: [{ name, city,
//                                      branches: [{ course, branch }] }] }]
//   DOMAIN_GROUPS         <- site_content key DOMAIN_GROUPS
//
// Use the selectors in universityDirectory.js instead of reading
// UNIVERSITY_DIRECTORY directly.

export const UNIVERSITY_DIRECTORY = [];
export const DOMAIN_GROUPS = [];
