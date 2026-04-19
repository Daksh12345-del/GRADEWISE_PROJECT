const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const cheerio = require('cheerio');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── SSL agent (ignores AKTU's sometimes-expired cert) ───
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── AKTU has two mirror URLs — try both ─────────────────
const AKTU_URLS = [
  'https://erp.aktu.ac.in/WebPages/OneView/OneView.aspx',
  'https://oneview.aktu.ac.in/WebPages/AKTU/OneView.aspx',
];

const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection':      'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

// ─────────────────────────────────────────────────────────
// STEP 1: GET the OneView page → grab ASP.NET tokens
// ─────────────────────────────────────────────────────────
async function getSession(baseUrl) {
  const res = await axios.get(baseUrl, {
    headers: HEADERS,
    httpsAgent,
    timeout: 15000,
    maxRedirects: 5,
  });

  const $ = cheerio.load(res.data);

  const viewState       = $('input[name="__VIEWSTATE"]').val()          || '';
  const viewStateGen    = $('input[name="__VIEWSTATEGENERATOR"]').val() || '';
  const eventValidation = $('input[name="__EVENTVALIDATION"]').val()    || '';
  const prevPage        = $('input[name="__PREVIOUSPAGE"]').val()       || '';

  // Find the roll number field name dynamically
  let rollFieldName   = 'ctl00$ContentPlaceHolder1$txtrollno';
  let submitFieldName = 'ctl00$ContentPlaceHolder1$btnsearch';

  $('input[type="text"], input[type="search"], input:not([type])').each(function() {
    const name = $(this).attr('name') || '';
    if (/roll|rno|rollno/i.test(name)) rollFieldName = name;
  });
  $('input[type="submit"], button[type="submit"], input[type="button"]').each(function() {
    const name = $(this).attr('name') || '';
    if (/search|submit|proceed|go/i.test(name)) submitFieldName = name;
  });

  console.log(`  Roll field: ${rollFieldName}`);
  console.log(`  ViewState: ${viewState.length > 0 ? 'OK (' + viewState.length + ' chars)' : 'MISSING'}`);

  const cookies = (res.headers['set-cookie'] || [])
    .map(c => c.split(';')[0]).join('; ');

  return { baseUrl, cookies, viewState, viewStateGen, eventValidation, prevPage, rollFieldName, submitFieldName };
}

// ─────────────────────────────────────────────────────────
// STEP 2: POST roll number → get result HTML
// ─────────────────────────────────────────────────────────
async function postRoll(session, rollNumber) {
  const body = new URLSearchParams();
  body.append('__VIEWSTATE',          session.viewState);
  body.append('__VIEWSTATEGENERATOR', session.viewStateGen);
  body.append('__EVENTVALIDATION',    session.eventValidation);
  if (session.prevPage) body.append('__PREVIOUSPAGE', session.prevPage);
  body.append('__EVENTTARGET',   '');
  body.append('__EVENTARGUMENT', '');
  body.append(session.rollFieldName,   rollNumber);
  body.append(session.submitFieldName, 'Search');

  const res = await axios.post(session.baseUrl, body.toString(), {
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer':      session.baseUrl,
      'Cookie':       session.cookies,
      'Origin':       new URL(session.baseUrl).origin,
    },
    httpsAgent,
    timeout: 20000,
    maxRedirects: 5,
  });

  return res.data;
}

// ─────────────────────────────────────────────────────────
// STEP 3: Parse the result HTML → clean JSON
// ─────────────────────────────────────────────────────────
function parseResult(html, rollNumber) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ');

  if (/no.*record|invalid.*roll|not.*found|no data|enter.*roll/i.test(bodyText)) {
    return { notFound: true };
  }

  // ── Student Info ──────────────────────────────────────
  const student = { rollNo: rollNumber };

  $('td, th').each(function() {
    const label = $(this).text().trim().replace(/\s+/g, ' ');
    const val   = $(this).next('td').text().trim().replace(/\s+/g, ' ');
    if (!val) return;
    if (/student.*name|^name$/i.test(label))    student.name       = student.name || val;
    if (/roll.*no|roll.*num/i.test(label))       student.rollNo     = val;
    if (/enroll/i.test(label))                   student.enrollment = val;
    if (/college/i.test(label))                  student.college    = val;
    if (/^course$/i.test(label))                 student.course     = val;
    if (/branch|programme|program/i.test(label)) student.branch     = val;
    if (/batch|session/i.test(label))            student.batch      = val;
  });

  // ── Semester Tables ───────────────────────────────────
  const semesters = [];

  $('table').each(function() {
    const tableText = $(this).text();
    if (!/subject|code|marks|grade|sgpa/i.test(tableText)) return;
    if ($(this).find('tr').length < 2) return;

    // Detect label
    let semLabel = '';
    const prev = $(this).prev();
    if (prev.length) semLabel = prev.text().trim().replace(/\s+/g, ' ');
    if (!semLabel) semLabel = $(this).find('caption').text().trim();

    const subjects = [];
    let sgpa = '', resultStatus = '';
    let hMap = {};

    $(this).find('tr').each(function() {
      const cells = $(this).find('td, th');
      const vals  = [];
      cells.each(function() { vals.push($(this).text().trim().replace(/\s+/g, ' ')); });
      if (!vals.length) return;

      const rowStr = vals.join(' ').toLowerCase();

      // Header row
      if (/subject|code.*name|name.*code/i.test(rowStr) || /grade/i.test(rowStr)) {
        vals.forEach((v, i) => {
          const lv = v.toLowerCase();
          if (/\bcode\b/.test(lv))                          hMap[i] = 'code';
          else if (/subject|name/.test(lv))                 hMap[i] = 'name';
          else if (/ext.*max|max.*ext/.test(lv))            hMap[i] = 'extMax';
          else if (/ext|external/.test(lv) && !hMap[i])    hMap[i] = 'extObt';
          else if (/int.*max|max.*int/.test(lv))            hMap[i] = 'intMax';
          else if (/int|internal/.test(lv) && !hMap[i])    hMap[i] = 'intObt';
          else if (/total|marks/.test(lv))                  hMap[i] = 'total';
          else if (/grade/.test(lv))                        hMap[i] = 'grade';
        });
        return;
      }

      // SGPA row
      if (/sgpa/.test(rowStr)) {
        const m = rowStr.match(/\b(\d+\.\d+)\b/);
        if (m) sgpa = m[1];
        const r = rowStr.match(/pass|fail|withheld|absent/i);
        if (r) resultStatus = r[0];
        return;
      }

      if (vals.length < 3) return;

      const sub = {};
      if (Object.keys(hMap).length > 0) {
        vals.forEach((v, i) => { if (hMap[i]) sub[hMap[i]] = v; });
      } else {
        [sub.code, sub.name, sub.extMax, sub.extObt, sub.intMax, sub.intObt, sub.total, sub.grade] = vals;
      }

      if ((sub.code || sub.name) && !/^(code|subject|s\.no|sr)/i.test(sub.code || '')) {
        subjects.push({
          code:        (sub.code    || '').trim(),
          name:        (sub.name    || '').trim(),
          externalMax: (sub.extMax  || '').trim(),
          externalObt: (sub.extObt  || '').trim(),
          internalMax: (sub.intMax  || '').trim(),
          internalObt: (sub.intObt  || '').trim(),
          total:       (sub.total   || '').trim(),
          grade:       (sub.grade   || '').trim(),
        });
      }
    });

    if (subjects.length > 0 || sgpa) {
      semesters.push({
        label:   /sem/i.test(semLabel) ? semLabel : `Semester ${semesters.length + 1}`,
        sgpa,
        result:  resultStatus,
        subjects,
      });
    }
  });

  // ── CGPA ─────────────────────────────────────────────
  const cgpaM = html.match(/cgpa[^0-9]*(\d+\.\d+)/i);
  const cgpa  = cgpaM ? cgpaM[1] : '';

  const notFound = semesters.length === 0 && !student.name;
  return { notFound, student, semesters, cgpa };
}

// ─────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'AKTU Result Backend running 🎓', port: PORT });
});

app.get('/result', async (req, res) => {
  const roll = (req.query.roll || '').trim().toUpperCase();

  if (!roll)
    return res.status(400).json({ error: 'Roll number required. Use ?roll=YOUR_ROLL_NO' });
  if (!/^[A-Z0-9]{6,20}$/.test(roll))
    return res.status(400).json({ error: 'Invalid roll number (6–20 alphanumeric characters).' });

  const log = msg => console.log(`[${new Date().toISOString()}] [${roll}] ${msg}`);
  log('Request received');

  let lastError = null;

  for (const url of AKTU_URLS) {
    try {
      log(`Trying: ${url}`);
      const session    = await getSession(url);
      const resultHtml = await postRoll(session, roll);
      log(`Got ${resultHtml.length} bytes`);

      const data = parseResult(resultHtml, roll);
      log(`Parsed → sems: ${data.semesters?.length || 0}, notFound: ${data.notFound}`);

      if (data.notFound) {
        return res.status(404).json({
          error: `No result found for ${roll}. Results may not be declared yet, or check the roll number.`,
          roll,
        });
      }

      return res.json({ success: true, roll, ...data });

    } catch (err) {
      log(`ERROR on ${url}: ${err.message}`);
      lastError = err;
    }
  }

  // All failed
  const msg = lastError?.message || '';
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(msg))
    return res.status(503).json({ error: 'Cannot reach AKTU server. Check your internet connection or try later.' });
  if (/timeout|ETIMEDOUT/i.test(msg))
    return res.status(504).json({ error: 'AKTU server timed out. It is overloaded — try again in a few minutes.' });
  if (/403/.test(msg))
    return res.status(403).json({ error: 'AKTU blocked the request (403). Try again in a few seconds.' });

  return res.status(500).json({
    error: 'Failed to fetch result from AKTU. Server may be temporarily unavailable.',
    detail: msg,
  });
});

// ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   AKTU Result Backend  🎓            ║');
  console.log(`  ║   Running → http://localhost:${PORT}   ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  API:  GET /result?roll=YOUR_ROLL_NUMBER');
  console.log('');
});

// ── DEBUG endpoint: see raw HTML from AKTU ──────────────
// GET /debug?roll=XXXX  → returns raw parsed HTML text
app.get('/debug', async (req, res) => {
  const roll = (req.query.roll || 'TEST').trim().toUpperCase();
  try {
    for (const url of AKTU_URLS) {
      try {
        const session = await getSession(url);
        const html    = await postRoll(session, roll);
        const $ = cheerio.load(html);
        return res.json({
          url,
          bodyTextSample: $('body').text().replace(/\s+/g,' ').substring(0, 2000),
          tables: $('table').length,
          inputs: $('input').map((i,el) => ({ name: $(el).attr('name'), type: $(el).attr('type') })).get(),
          viewStatePresent: html.includes('__VIEWSTATE'),
        });
      } catch(e) { /* try next */ }
    }
    res.status(500).json({ error: 'All URLs failed' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
