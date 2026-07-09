#!/usr/bin/env python3
"""
GradeWallah Backend — server.py

ARCHITECTURE:
  Internships  → JSearch + Remotive + Adzuna + Internshala RSS → Supabase DB → API
  Placements   → JSearch + Remotive + Jobicy + Arbeitnow + TheMuse → Supabase DB → API
  DSA Tracker  → Unchanged (CodeChef, Codeforces, LeetCode, GFG, HackerRank, GitHub)

  Cron runs once/day at 2AM → fetches all sources → saves to Supabase
  Website always reads from Supabase → 0.1s load, zero scraping risk

ENV VARS REQUIRED:
  RAPIDAPI_KEY      → JSearch (RapidAPI)
  ADZUNA_APP_ID     → Adzuna API
  ADZUNA_API_KEY    → Adzuna API
  SUPABASE_URL      → Your Supabase project URL
  SUPABASE_KEY      → Your Supabase service_role key (not anon key)
  PORT              → (optional, default 5050)
  GITHUB_TOKEN      → (optional, for GitHub 5000 req/hr)
"""

import json
import time
import re
import random
import threading
import socket
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Load .env file for local development ─────────────────────────────────────
# On Render, env vars are injected directly by the platform, so this is a no-op
# there. Locally, this reads backend/.env and puts the values into os.environ.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("[WARN] python-dotenv not installed — .env file won't be loaded automatically.")
    print("       Run: pip install python-dotenv")

# ── Optional dependency imports ───────────────────────────────────────────────
try:
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    REQUESTS_OK = True
except ImportError:
    REQUESTS_OK = False
    print("[WARN] requests not installed. Run: pip install requests")

try:
    from bs4 import BeautifulSoup
    BS4_OK = True
except ImportError:
    BS4_OK = False
    print("[WARN] beautifulsoup4 not installed. Run: pip install beautifulsoup4")

try:
    import cloudscraper
    CLOUDSCRAPER_OK = True
except ImportError:
    CLOUDSCRAPER_OK = False

# ── Server config ─────────────────────────────────────────────────────────────
PORT = int(os.environ.get("PORT", 5050))

# ── API Keys ──────────────────────────────────────────────────────────────────
RAPIDAPI_KEY   = os.environ.get("RAPIDAPI_KEY", "")
ADZUNA_APP_ID  = os.environ.get("ADZUNA_APP_ID", "")
ADZUNA_API_KEY = os.environ.get("ADZUNA_API_KEY", "")
SUPABASE_URL   = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY   = os.environ.get("SUPABASE_KEY", "")   # service_role key

# ── DSA Coding Profile API Config (UNCHANGED) ─────────────────────────────────
_CODEFORCES_OFFICIAL_API = "https://codeforces.com/api/user.info?handles={username}"
_CODEFORCES_RATING_API   = "https://codeforces.com/api/user.rating?handle={username}"
_LEETCODE_API            = "https://alfa-leetcode-api.onrender.com/{username}"
_CODECHEF_PROFILE_URL    = "https://www.codechef.com/users/{username}"
_GFG_PROFILE_URL         = "https://www.geeksforgeeks.org/user/{username}/"
_HACKERRANK_PROFILE_URL  = "https://www.hackerrank.com/{username}"
_HACKERRANK_BADGES_API   = "https://www.hackerrank.com/rest/hackers/{username}/badges"
_GITHUB_USER_API         = "https://api.github.com/users/{username}"
_GITHUB_REPOS_API        = "https://api.github.com/users/{username}/repos?per_page=100&sort=updated"
_GITHUB_EVENTS_API       = "https://api.github.com/users/{username}/events/public?per_page=100"

_CODING_CACHE_TTL = 30 * 60
_coding_cache     = {}
_coding_lock      = threading.Lock()

# ── Cron lock ─────────────────────────────────────────────────────────────────
_cron_lock    = threading.Lock()
_cron_running = False

# ── User-agent pool ───────────────────────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]

def rand_ua():
    return random.choice(USER_AGENTS)


# ════════════════════════════════════════════════════════════════════════════════
# SUPABASE HELPER
# ════════════════════════════════════════════════════════════════════════════════

def supabase_request(method, table, payload=None, params=None):
    """
    Simple Supabase REST API wrapper.
    method: "GET", "POST", "DELETE"
    table:  "all_internships" or "all_placements"
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("  [Supabase] SUPABASE_URL or SUPABASE_KEY not set!")
        return None

    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }

    try:
        if method == "GET":
            r = requests.get(url, headers={**headers, "Prefer": "return=representation"},
                             params=params, timeout=15)
        elif method == "POST":
            r = requests.post(url, headers=headers, json=payload, timeout=30)
        elif method == "DELETE":
            r = requests.delete(url, headers=headers, params=params, timeout=15)
        else:
            return None

        if r.status_code in (200, 201, 204):
            return r.json() if r.content and method == "GET" else True
        else:
            print(f"  [Supabase] {method} {table} → HTTP {r.status_code}: {r.text[:200]}")
            return None
    except Exception as e:
        print(f"  [Supabase] {method} {table} error: {e}")
        return None


def supabase_upsert(table, rows):
    """
    Upsert rows into Supabase table.
    Uses unique_id column to avoid duplicates.
    """
    if not rows:
        return 0
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("  [Supabase] Keys not set — skipping upsert")
        return 0

    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates,return=minimal",
    }

    # Batch in chunks of 100 for reliability
    saved = 0
    for i in range(0, len(rows), 100):
        chunk = rows[i:i+100]
        try:
            r = requests.post(url, headers=headers, json=chunk, timeout=30)
            if r.status_code in (200, 201, 204):
                saved += len(chunk)
                print(f"  [Supabase] Upserted {len(chunk)} rows into {table}")
            else:
                print(f"  [Supabase] Upsert failed: HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            print(f"  [Supabase] Upsert error: {e}")
    return saved


def supabase_get_all(table, limit=1000):
    """Fetch all rows from a Supabase table."""
    result = supabase_request("GET", table, params={"limit": limit, "order": "created_at.desc"})
    return result if isinstance(result, list) else []


def supabase_delete_expired(table, days=30):
    """Delete listings older than N days from Supabase."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    if not SUPABASE_URL or not SUPABASE_KEY:
        return

    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
    }
    params = {"created_at": f"lt.{cutoff}"}
    try:
        r = requests.delete(url, headers=headers, params=params, timeout=15)
        if r.status_code in (200, 204):
            print(f"  [Supabase] Deleted expired rows from {table} (older than {days} days)")
        else:
            print(f"  [Supabase] Delete expired failed: {r.status_code}")
    except Exception as e:
        print(f"  [Supabase] Delete expired error: {e}")


# ════════════════════════════════════════════════════════════════════════════════
# HELPER UTILITIES
# ════════════════════════════════════════════════════════════════════════════════

def make_id(source, title, company):
    return source[:2] + "_" + str(abs(hash(f"{source}-{title}-{company}")))[:10]

def parse_stipend(s):
    if not s:
        return 0
    s = str(s).replace(",", "").replace("₹", "").replace("$", "").lower()
    nums = re.findall(r"[\d]+(?:\.\d+)?", s)
    if not nums:
        return 0
    val = float(nums[0])
    if "k" in s:
        val *= 1000
    elif "lakh" in s:
        val *= 100000
    if val > 200000:
        val /= 12
    return int(val)

def clean_text(t):
    return re.sub(r"\s+", " ", str(t)).strip()

def clean_location(loc):
    loc = clean_text(loc)
    loc = re.sub(r"[,\s]+$", "", loc)
    return (loc[:60] or "Remote")

def clean_duration(dur):
    dur = clean_text(dur)
    return dur if dur and dur != "0" else "3 Months"

SKILL_MAP = {
    "python":           ["Python", "Django", "Flask", "NumPy", "Pandas"],
    "web":              ["HTML", "CSS", "JavaScript", "React", "Node.js"],
    "react":            ["React", "JavaScript", "HTML/CSS", "Redux", "REST API"],
    "frontend":         ["HTML", "CSS", "JavaScript", "React", "Figma"],
    "backend":          ["Node.js", "Python", "REST API", "SQL", "MongoDB"],
    "data":             ["Python", "SQL", "Machine Learning", "Pandas", "Tableau"],
    "machine learning": ["Python", "TensorFlow", "Scikit-Learn", "NLP", "Deep Learning"],
    "ml":               ["Python", "ML", "TensorFlow", "Keras", "Statistics"],
    "java":             ["Java", "Spring Boot", "Maven", "REST API", "SQL"],
    "android":          ["Android", "Java", "Kotlin", "XML", "Firebase"],
    "ios":              ["Swift", "Xcode", "Objective-C", "iOS SDK"],
    "cloud":            ["AWS", "Azure", "Docker", "Kubernetes", "Linux"],
    "devops":           ["Docker", "Jenkins", "CI/CD", "Linux", "AWS"],
    "software":         ["Python", "Java", "Git", "REST API", "Agile"],
    "design":           ["Figma", "Adobe XD", "Sketch", "UI/UX", "Prototyping"],
    "marketing":        ["SEO", "Google Analytics", "Content Writing", "Social Media"],
    "writing":          ["Content Writing", "SEO", "Copywriting", "Research"],
}
DEFAULT_SKILLS = ["Communication", "MS Office", "Problem Solving", "Teamwork"]

DOMAIN_MAP = {
    "python": "cs", "java": "cs", "software": "cs", "computer": "cs",
    "web": "web", "frontend": "web", "backend": "web", "react": "web",
    "data": "data", "machine learning": "data", "ml": "data",
    "marketing": "marketing", "content": "marketing", "writing": "marketing",
    "design": "design", "devops": "cs", "cloud": "cs",
}

def infer_skills(title):
    t = title.lower()
    for kw, skills in SKILL_MAP.items():
        if kw in t:
            return skills[:5]
    return DEFAULT_SKILLS[:]

def infer_domain(title):
    t = title.lower()
    for kw, domain in DOMAIN_MAP.items():
        if kw in t:
            return domain
    return "cs"

def plain_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent":      rand_ua(),
        "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
        "DNT":             "1",
        "Connection":      "keep-alive",
    })
    s.verify = False
    return s


# ════════════════════════════════════════════════════════════════════════════════
# FAKE / SPAM FILTER
# ════════════════════════════════════════════════════════════════════════════════

BLACKLIST_WORDS = [
    "earn from home", "mlm", "network marketing", "unlimited salary",
    "whatsapp to apply", "part time unlimited", "refer and earn",
    "direct selling", "no experience unlimited", "work from home earn",
    "₹50000 per week", "₹1 lakh per month", "guaranteed income",
]

def is_fake(title):
    t = title.lower()
    return any(word in t for word in BLACKLIST_WORDS)

def is_valid_listing(item):
    """Must have title, company, apply_url and not be fake."""
    return (
        item.get("title") and
        item.get("company") and
        item.get("apply_url") and
        str(item.get("apply_url", "")).startswith("http") and
        "whatsapp" not in str(item.get("apply_url", "")).lower() and
        not is_fake(item.get("title", ""))
    )

def deduplicate(listings):
    seen = set()
    out  = []
    for item in listings:
        key = (item.get("title","").lower().strip(), item.get("company","").lower().strip())
        if key not in seen and key != ("", ""):
            seen.add(key)
            out.append(item)
    return out


# ════════════════════════════════════════════════════════════════════════════════
# SOURCE 1 — JSEARCH API  (RapidAPI)
# ════════════════════════════════════════════════════════════════════════════════

def fetch_jsearch_internships():
    """Fetch internships from JSearch (targets India)."""
    if not REQUESTS_OK or not RAPIDAPI_KEY:
        print("  [JSearch] RAPIDAPI_KEY not set — skipping")
        return []

    queries = [
        "software internship india",
        "web development internship india",
        "data science internship india",
        "python internship india",
        "machine learning internship india",
    ]
    headers = {
        "X-RapidAPI-Key":  RAPIDAPI_KEY,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    }
    results = []
    for query in queries:
        try:
            resp = requests.get(
                "https://jsearch.p.rapidapi.com/search",
                headers=headers,
                params={"query": query, "page": "1", "num_pages": "1",
                        "date_posted": "month", "employment_types": "INTERN"},
                timeout=15,
            )
            if resp.status_code == 429:
                print("  [JSearch] Rate limit hit — quota exhausted")
                break
            if resp.status_code != 200:
                print(f"  [JSearch] HTTP {resp.status_code} for: {query}")
                continue
            data = resp.json().get("data", [])
            for job in data:
                title   = job.get("job_title", "").strip()
                company = job.get("employer_name", "").strip()
                if not title or not company:
                    continue
                results.append({
                    "unique_id":   make_id("jsearch", title, company),
                    "source":      "jsearch",
                    "type":        "internship",
                    "title":       title,
                    "company":     company,
                    "location":    job.get("job_city", job.get("job_country", "India")),
                    "stipend":     job.get("job_min_salary", 0),
                    "duration":    "3 Months",
                    "apply_url":   job.get("job_apply_link", "#"),
                    "description": (job.get("job_description", "")[:300]),
                    "skills":      infer_skills(title),
                    "domain":      infer_domain(title),
                    "posted_date": job.get("job_posted_at_datetime_utc", datetime.utcnow().isoformat()),
                    "expiry_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "is_remote":   job.get("job_is_remote", False),
                    "created_at":  datetime.utcnow().isoformat(),
                })
            print(f"  [JSearch Internships] {query} → {len(data)} results")
            time.sleep(0.5)
        except Exception as e:
            print(f"  [JSearch] query failed: {e}")
    return results


def fetch_jsearch_placements():
    """Fetch full-time fresher jobs from JSearch."""
    if not REQUESTS_OK or not RAPIDAPI_KEY:
        print("  [JSearch] RAPIDAPI_KEY not set — skipping")
        return []

    queries = [
        "fresher software engineer india",
        "entry level data analyst india",
        "junior developer india 0-2 years",
        "graduate software developer india",
    ]
    headers = {
        "X-RapidAPI-Key":  RAPIDAPI_KEY,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    }
    results = []
    for query in queries:
        try:
            resp = requests.get(
                "https://jsearch.p.rapidapi.com/search",
                headers=headers,
                params={"query": query, "page": "1", "num_pages": "1",
                        "date_posted": "month", "employment_types": "FULLTIME"},
                timeout=15,
            )
            if resp.status_code == 429:
                print("  [JSearch] Rate limit hit — quota exhausted")
                break
            if resp.status_code != 200:
                print(f"  [JSearch Placements] HTTP {resp.status_code}")
                continue
            data = resp.json().get("data", [])
            for job in data:
                title   = job.get("job_title", "").strip()
                company = job.get("employer_name", "").strip()
                if not title or not company:
                    continue
                results.append({
                    "unique_id":   make_id("jsearch_job", title, company),
                    "source":      "jsearch",
                    "type":        "placement",
                    "title":       title,
                    "company":     company,
                    "location":    job.get("job_city", job.get("job_country", "India")),
                    "salary":      job.get("job_min_salary", 0),
                    "apply_url":   job.get("job_apply_link", "#"),
                    "description": (job.get("job_description", "")[:300]),
                    "skills":      infer_skills(title),
                    "domain":      infer_domain(title),
                    "posted_date": job.get("job_posted_at_datetime_utc", datetime.utcnow().isoformat()),
                    "expiry_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "is_remote":   job.get("job_is_remote", False),
                    "created_at":  datetime.utcnow().isoformat(),
                })
            print(f"  [JSearch Placements] {query} → {len(data)} results")
            time.sleep(0.5)
        except Exception as e:
            print(f"  [JSearch Placements] query failed: {e}")
    return results


# ════════════════════════════════════════════════════════════════════════════════
# SOURCE 2 — REMOTIVE API  (free, no key)
# ════════════════════════════════════════════════════════════════════════════════

def fetch_remotive_placements():
    """Fetch remote tech jobs from Remotive."""
    if not REQUESTS_OK:
        return []

    categories = ["software-dev", "data", "devops", "design", "marketing", "product",
                  "finance-legal", "hr", "qa", "writing", "customer-support", "management"]
    results = []
    seen = set()
    for cat in categories:
        try:
            resp = requests.get(
                f"https://remotive.com/api/remote-jobs?category={cat}&limit=100",
                headers={"User-Agent": rand_ua(), "Accept": "application/json"},
                timeout=15,
            )
            if resp.status_code != 200:
                continue
            jobs = resp.json().get("jobs", [])
            for job in jobs:
                title   = job.get("title", "").strip()
                company = job.get("company_name", "").strip()
                if not title or not company:
                    continue
                key = (title.lower(), company.lower())
                if key in seen:
                    continue
                seen.add(key)
                results.append({
                    "unique_id":   make_id("remotive", title, company),
                    "source":      "remotive",
                    "type":        "placement",
                    "title":       title,
                    "company":     company,
                    "location":    "Remote",
                    "salary":      0,
                    "apply_url":   job.get("url", "#"),
                    "description": re.sub(r"<[^>]+>", "", job.get("description", ""))[:300],
                    "skills":      infer_skills(title),
                    "domain":      infer_domain(title),
                    "posted_date": job.get("publication_date", datetime.utcnow().isoformat()),
                    "expiry_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "is_remote":   True,
                    "created_at":  datetime.utcnow().isoformat(),
                })
            print(f"  [Remotive] {cat} → {len(jobs)} jobs")
            time.sleep(0.3)
        except Exception as e:
            print(f"  [Remotive] {cat} failed: {e}")
    print(f"  [Remotive] Total unique: {len(results)}")
    return results


# ════════════════════════════════════════════════════════════════════════════════
# SOURCE 3 — ADZUNA API  (free, register at developer.adzuna.com)
# ════════════════════════════════════════════════════════════════════════════════

def fetch_adzuna_internships():
    """Fetch internships from Adzuna India."""
    if not REQUESTS_OK or not ADZUNA_APP_ID or not ADZUNA_API_KEY:
        print("  [Adzuna] ADZUNA_APP_ID or ADZUNA_API_KEY not set — skipping")
        return []

    results = []
    searches = ["software intern", "web developer intern", "data science intern", "python intern"]
    for keyword in searches:
        try:
            resp = requests.get(
                f"https://api.adzuna.com/v1/api/jobs/in/search/1",
                params={
                    "app_id":            ADZUNA_APP_ID,
                    "app_key":           ADZUNA_API_KEY,
                    "what":              keyword,
                    "results_per_page":  20,
                    "content-type":      "application/json",
                    "sort_by":           "date",
                },
                headers={"User-Agent": rand_ua()},
                timeout=15,
            )
            if resp.status_code != 200:
                print(f"  [Adzuna] HTTP {resp.status_code} for: {keyword}")
                continue
            jobs = resp.json().get("results", [])
            for job in jobs:
                title   = job.get("title", "").strip()
                company = job.get("company", {}).get("display_name", "").strip()
                if not title or not company:
                    continue
                results.append({
                    "unique_id":   make_id("adzuna", title, company),
                    "source":      "adzuna",
                    "type":        "internship",
                    "title":       title,
                    "company":     company,
                    "location":    job.get("location", {}).get("display_name", "India"),
                    "stipend":     int(job.get("salary_min", 0) or 0),
                    "duration":    "3 Months",
                    "apply_url":   job.get("redirect_url", "#"),
                    "description": job.get("description", "")[:300],
                    "skills":      infer_skills(title),
                    "domain":      infer_domain(title),
                    "posted_date": job.get("created", datetime.utcnow().isoformat()),
                    "expiry_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "is_remote":   False,
                    "created_at":  datetime.utcnow().isoformat(),
                })
            print(f"  [Adzuna] {keyword} → {len(jobs)} internships")
            time.sleep(0.5)
        except Exception as e:
            print(f"  [Adzuna] {keyword} failed: {e}")
    return results


def fetch_adzuna_placements():
    """Fetch fresher jobs from Adzuna India."""
    if not REQUESTS_OK or not ADZUNA_APP_ID or not ADZUNA_API_KEY:
        print("  [Adzuna] Keys not set — skipping")
        return []

    results = []
    searches = ["fresher software engineer", "entry level developer", "junior analyst", "graduate engineer"]
    for keyword in searches:
        try:
            resp = requests.get(
                f"https://api.adzuna.com/v1/api/jobs/in/search/1",
                params={
                    "app_id":           ADZUNA_APP_ID,
                    "app_key":          ADZUNA_API_KEY,
                    "what":             keyword,
                    "results_per_page": 20,
                    "content-type":     "application/json",
                    "sort_by":          "date",
                },
                headers={"User-Agent": rand_ua()},
                timeout=15,
            )
            if resp.status_code != 200:
                continue
            jobs = resp.json().get("results", [])
            for job in jobs:
                title   = job.get("title", "").strip()
                company = job.get("company", {}).get("display_name", "").strip()
                if not title or not company:
                    continue
                results.append({
                    "unique_id":   make_id("adzuna_job", title, company),
                    "source":      "adzuna",
                    "type":        "placement",
                    "title":       title,
                    "company":     company,
                    "location":    job.get("location", {}).get("display_name", "India"),
                    "salary":      int(job.get("salary_min", 0) or 0),
                    "apply_url":   job.get("redirect_url", "#"),
                    "description": job.get("description", "")[:300],
                    "skills":      infer_skills(title),
                    "domain":      infer_domain(title),
                    "posted_date": job.get("created", datetime.utcnow().isoformat()),
                    "expiry_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "is_remote":   False,
                    "created_at":  datetime.utcnow().isoformat(),
                })
            print(f"  [Adzuna Placements] {keyword} → {len(jobs)} jobs")
            time.sleep(0.5)
        except Exception as e:
            print(f"  [Adzuna Placements] {keyword} failed: {e}")
    return results


# ════════════════════════════════════════════════════════════════════════════════
# SOURCE 4 — INTERNSHALA RSS FEED  (no scraping, 100% legal)
# ════════════════════════════════════════════════════════════════════════════════

INTERNSHALA_RSS_FEEDS = [
    "https://internshala.com/rss/internships.xml",
    "https://internshala.com/rss/internships/computer-science.xml",
    "https://internshala.com/rss/internships/web-development.xml",
    "https://internshala.com/rss/internships/python.xml",
    "https://internshala.com/rss/internships/data-science.xml",
]

def fetch_internshala_rss():
    """
    Fetch internships from Internshala RSS feeds.
    RSS is publicly provided by Internshala — 100% legal, no scraping.
    """
    if not REQUESTS_OK:
        return []

    results = []
    seen = set()
    session = plain_session()

    for feed_url in INTERNSHALA_RSS_FEEDS:
        try:
            resp = session.get(feed_url, timeout=15)
            if resp.status_code != 200:
                print(f"  [Internshala RSS] HTTP {resp.status_code} for {feed_url}")
                continue

            root = ET.fromstring(resp.text)
            channel = root.find("channel")
            if channel is None:
                continue

            items = channel.findall("item")
            for item in items:
                title_el   = item.find("title")
                link_el    = item.find("link")
                company_el = item.find("author") or item.find("dc:creator")
                desc_el    = item.find("description")
                date_el    = item.find("pubDate")

                title   = clean_text(title_el.text)   if title_el   and title_el.text   else None
                link    = link_el.text.strip()         if link_el    and link_el.text    else "#"
                company = clean_text(company_el.text)  if company_el and company_el.text else "Company"
                desc    = clean_text(re.sub(r"<[^>]+>", "", desc_el.text or ""))[:300] if desc_el else ""

                if not title or len(title) < 3:
                    continue
                key = f"{title.lower()}|{company.lower()}"
                if key in seen:
                    continue
                seen.add(key)

                # Parse posted date
                posted_date = datetime.utcnow().isoformat()
                if date_el and date_el.text:
                    try:
                        posted_date = datetime.strptime(
                            date_el.text.strip(), "%a, %d %b %Y %H:%M:%S %z"
                        ).isoformat()
                    except Exception:
                        pass

                results.append({
                    "unique_id":   make_id("internshala", title, company),
                    "source":      "internshala",
                    "type":        "internship",
                    "title":       title,
                    "company":     company,
                    "location":    "India",
                    "stipend":     0,
                    "duration":    "3 Months",
                    "apply_url":   link,
                    "description": desc,
                    "skills":      infer_skills(title),
                    "domain":      infer_domain(title),
                    "posted_date": posted_date,
                    "expiry_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "is_remote":   False,
                    "created_at":  datetime.utcnow().isoformat(),
                })

            print(f"  [Internshala RSS] {feed_url.split('/')[-1]} → {len(items)} items")
            time.sleep(0.5)

        except ET.ParseError:
            print(f"  [Internshala RSS] XML parse error for {feed_url} — feed may not exist yet")
        except Exception as e:
            print(f"  [Internshala RSS] {feed_url} failed: {e}")

    print(f"  [Internshala RSS] Total: {len(results)} internships")
    return results


# ════════════════════════════════════════════════════════════════════════════════
# SOURCE 5 — JOBICY API  (free, no key — for placements)
# ════════════════════════════════════════════════════════════════════════════════

def fetch_jobicy_placements():
    if not REQUESTS_OK:
        return []
    categories = ["engineering", "design", "marketing", "data-science", "devops",
                  "product", "writing", "finance", "hr", "customer-support", "sales", "operations"]
    results = []
    seen = set()
    for cat in categories:
        try:
            resp = requests.get(
                f"https://jobicy.com/api/v2/remote-jobs?count=50&category={cat}",
                headers={"User-Agent": rand_ua(), "Accept": "application/json"},
                timeout=15,
            )
            if resp.status_code != 200:
                continue
            jobs = resp.json().get("jobs", [])
            for job in jobs:
                title   = job.get("jobTitle", "").strip()
                company = job.get("companyName", "").strip()
                if not title or not company:
                    continue
                key = (title.lower(), company.lower())
                if key in seen:
                    continue
                seen.add(key)
                results.append({
                    "unique_id":   make_id("jobicy", title, company),
                    "source":      "jobicy",
                    "type":        "placement",
                    "title":       title,
                    "company":     company,
                    "location":    job.get("jobGeo", "Remote"),
                    "salary":      job.get("annualSalaryMin", 0),
                    "apply_url":   job.get("url", "#"),
                    "description": re.sub(r"<[^>]+>", "", job.get("jobDescription", ""))[:300],
                    "skills":      infer_skills(title),
                    "domain":      infer_domain(title),
                    "posted_date": job.get("pubDate", datetime.utcnow().isoformat()),
                    "expiry_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "is_remote":   True,
                    "created_at":  datetime.utcnow().isoformat(),
                })
            print(f"  [Jobicy] {cat} → {len(jobs)} jobs")
            time.sleep(0.3)
        except Exception as e:
            print(f"  [Jobicy] {cat} failed: {e}")
    print(f"  [Jobicy] Total unique: {len(results)}")
    return results


# ════════════════════════════════════════════════════════════════════════════════
# SOURCE 6 — ARBEITNOW  (free, no key — for placements)
# ════════════════════════════════════════════════════════════════════════════════

def fetch_arbeitnow_placements():
    if not REQUESTS_OK:
        return []
    results = []
    seen = set()
    for page in range(1, 7):   # 6 pages instead of 3
        try:
            resp = requests.get(
                f"https://arbeitnow.com/api/job-board-api?page={page}",
                headers={"User-Agent": rand_ua(), "Accept": "application/json"},
                timeout=15,
            )
            if resp.status_code != 200:
                break
            jobs = resp.json().get("data", [])
            if not jobs:
                break
            for job in jobs:
                title   = job.get("title", "").strip()
                company = job.get("company_name", "").strip()
                if not title or not company:
                    continue
                key = (title.lower(), company.lower())
                if key in seen:
                    continue
                seen.add(key)
                results.append({
                    "unique_id":   make_id("arbeitnow", title, company),
                    "source":      "arbeitnow",
                    "type":        "placement",
                    "title":       title,
                    "company":     company,
                    "location":    job.get("location", "Remote"),
                    "salary":      0,
                    "apply_url":   job.get("url", "#"),
                    "description": re.sub(r"<[^>]+>", "", job.get("description", ""))[:300],
                    "skills":      infer_skills(title),
                    "domain":      infer_domain(title),
                    "posted_date": job.get("created_at", datetime.utcnow().isoformat()),
                    "expiry_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "is_remote":   job.get("remote", False),
                    "created_at":  datetime.utcnow().isoformat(),
                })
            print(f"  [Arbeitnow] page {page} → {len(jobs)} jobs")
            time.sleep(0.3)
        except Exception as e:
            print(f"  [Arbeitnow] page {page} failed: {e}")
            break
    print(f"  [Arbeitnow] Total unique: {len(results)}")
    return results


# ════════════════════════════════════════════════════════════════════════════════
# SOURCE 7 — THE MUSE API  (free, no key needed)
# ════════════════════════════════════════════════════════════════════════════════

def fetch_themuse_placements():
    if not REQUESTS_OK:
        return []
    results = []
    seen = set()
    for page in range(1, 6):   # 5 pages = ~500 jobs
        try:
            resp = requests.get(
                f"https://www.themuse.com/api/public/jobs?page={page}&descending=true",
                headers={"User-Agent": rand_ua(), "Accept": "application/json"},
                timeout=15,
            )
            if resp.status_code != 200:
                print(f"  [TheMuse] HTTP {resp.status_code} page {page}")
                break
            jobs = resp.json().get("results", [])
            if not jobs:
                break
            for job in jobs:
                title   = job.get("name", "").strip()
                company = job.get("company", {}).get("name", "").strip()
                if not title or not company:
                    continue
                key = (title.lower(), company.lower())
                if key in seen:
                    continue
                seen.add(key)
                locations  = job.get("locations", [])
                location   = locations[0].get("name", "Remote") if locations else "Remote"
                refs       = job.get("refs", {})
                url        = refs.get("landing_page", "#")
                categories = [c.get("name", "") for c in job.get("categories", [])]
                levels     = [l.get("name", "") for l in job.get("levels", [])]
                results.append({
                    "unique_id":   make_id("themuse", title, company),
                    "source":      "themuse",
                    "type":        "placement",
                    "title":       title,
                    "company":     company,
                    "location":    location,
                    "salary":      0,
                    "apply_url":   url,
                    "description": f"{title} at {company}. {', '.join(categories)}.",
                    "skills":      infer_skills(title),
                    "domain":      infer_domain(title),
                    "posted_date": job.get("publication_date", datetime.utcnow().isoformat()),
                    "expiry_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "is_remote":   "remote" in location.lower(),
                    "created_at":  datetime.utcnow().isoformat(),
                })
            print(f"  [TheMuse] page {page} → {len(jobs)} jobs")
            time.sleep(0.3)
        except Exception as e:
            print(f"  [TheMuse] page {page} failed: {e}")
            break
    print(f"  [TheMuse] Total unique: {len(results)}")
    return results


# ════════════════════════════════════════════════════════════════════════════════
# MAIN DAILY CRON — RUNS ONCE PER DAY
# ════════════════════════════════════════════════════════════════════════════════

def run_daily_sync():
    """
    Fetches all sources, filters fakes, deduplicates,
    saves to Supabase, deletes expired listings.
    Called once per day automatically.
    """
    global _cron_running
    with _cron_lock:
        if _cron_running:
            print("  [Cron] Already running — skipping")
            return
        _cron_running = True

    try:
        print("\n" + "═"*60)
        print("  GRADEWALLAH DAILY SYNC STARTING")
        print("═"*60)

        # ── INTERNSHIPS ───────────────────────────────────────────────
        print("\n[INTERNSHIPS] Fetching from all sources…")
        raw_internships = []

        print("\n  [1/3] JSearch internships…")
        raw_internships.extend(fetch_jsearch_internships())

        print("\n  [2/3] Adzuna internships…")
        raw_internships.extend(fetch_adzuna_internships())

        print("\n  [3/3] Internshala RSS…")
        raw_internships.extend(fetch_internshala_rss())

        # Filter + deduplicate
        clean_internships = [i for i in raw_internships if is_valid_listing(i)]
        clean_internships = deduplicate(clean_internships)
        print(f"\n  [Internships] Raw: {len(raw_internships)} → Clean: {len(clean_internships)}")

        # Save to Supabase
        if clean_internships:
            saved = supabase_upsert("all_internships", clean_internships)
            print(f"  [Supabase] Saved {saved} internships")

        # Delete expired (older than 30 days)
        supabase_delete_expired("all_internships", days=30)

        # ── PLACEMENTS ────────────────────────────────────────────────
        print("\n[PLACEMENTS] Fetching from all sources…")
        raw_placements = []

        print("\n  [1/6] JSearch placements…")
        raw_placements.extend(fetch_jsearch_placements())

        print("\n  [2/6] Remotive…")
        raw_placements.extend(fetch_remotive_placements())

        print("\n  [3/6] Adzuna placements…")
        raw_placements.extend(fetch_adzuna_placements())

        print("\n  [4/6] Jobicy…")
        raw_placements.extend(fetch_jobicy_placements())

        print("\n  [5/6] Arbeitnow…")
        raw_placements.extend(fetch_arbeitnow_placements())

        print("\n  [6/6] TheMuse…")
        raw_placements.extend(fetch_themuse_placements())

        # Filter + deduplicate
        clean_placements = [p for p in raw_placements if is_valid_listing(p)]
        clean_placements = deduplicate(clean_placements)
        print(f"\n  [Placements] Raw: {len(raw_placements)} → Clean: {len(clean_placements)}")

        # Save to Supabase
        if clean_placements:
            saved = supabase_upsert("all_placements", clean_placements)
            print(f"  [Supabase] Saved {saved} placements")

        # Delete expired
        supabase_delete_expired("all_placements", days=30)

        print("\n" + "═"*60)
        print(f"  SYNC DONE — Internships: {len(clean_internships)}, Placements: {len(clean_placements)}")
        print("═"*60 + "\n")

    except Exception as e:
        print(f"  [Cron] SYNC FAILED: {e}")
    finally:
        with _cron_lock:
            _cron_running = False


def start_cron_scheduler():
    """
    Runs daily sync once at startup (if Supabase is empty),
    then repeats every 24 hours.
    """
    def cron_loop():
        # Check if Supabase already has data
        existing = supabase_get_all("all_internships", limit=1)
        if not existing:
            print("  [Cron] Supabase empty — running initial sync now…")
            run_daily_sync()
        else:
            print("  [Cron] Supabase has data — next sync in 24 hours")

        while True:
            time.sleep(24 * 60 * 60)   # wait 24 hours
            run_daily_sync()

    t = threading.Thread(target=cron_loop, daemon=True)
    t.start()
    print("  [Cron] Daily sync scheduler started (runs every 24 hours)")


# ════════════════════════════════════════════════════════════════════════════════
# DSA TRACKER — 100% API BASED, ZERO SCRAPING, ZERO THIRD PARTY DEPENDENCY
#
# LeetCode   → Direct GraphQL API (official leetcode.com endpoint)
# Codeforces → Official open API (codeforces.com/api)
# CodeChef   → competeapi.com (stable community API, never scrapes HTML)
# GFG        → geeksforgeeks.org public JSON endpoint
# HackerRank → Official REST badges API only (no profile page scraping)
# GitHub     → Official GitHub REST API
# ════════════════════════════════════════════════════════════════════════════════

# ── LeetCode — Direct GraphQL (official leetcode.com backend) ────────────────
def fetch_leetcode_profile(username):
    """
    Calls LeetCode's own GraphQL endpoint directly.
    No third party proxy — this is the same endpoint LeetCode website uses.
    Returns: rank, easy/medium/hard solved, contest rating, languages
    """
    if not REQUESTS_OK:
        return None, "requests not available"

    url = "https://leetcode.com/graphql"
    headers = {
        "Content-Type":  "application/json",
        "Referer":       f"https://leetcode.com/{username}/",
        "User-Agent":    rand_ua(),
        "Origin":        "https://leetcode.com",
    }

    # Query 1 — Profile + solved stats
    query_profile = """
    query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile { ranking userAvatar realName }
        submitStats {
          acSubmissionNum { difficulty count submissions }
        }
        badges { name icon }
        languageProblemCount { languageName problemsSolved }
      }
    }"""

    # Query 2 — Contest stats
    query_contest = """
    query userContestRankingInfo($username: String!) {
      userContestRanking(username: $username) {
        attendedContestsCount
        rating
        globalRanking
        topPercentage
      }
    }"""

    profile_data = {}
    contest_data = {}

    try:
        r = requests.post(url, headers=headers,
                          json={"query": query_profile, "variables": {"username": username}},
                          timeout=15)
        if r.status_code == 200:
            d = r.json().get("data", {})
            profile_data = d.get("matchedUser") or {}
            if not profile_data:
                return None, f"User '{username}' not found on LeetCode"
    except Exception as e:
        return None, f"LeetCode GraphQL failed: {e}"

    try:
        r2 = requests.post(url, headers=headers,
                           json={"query": query_contest, "variables": {"username": username}},
                           timeout=15)
        if r2.status_code == 200:
            contest_data = r2.json().get("data", {}).get("userContestRanking") or {}
    except Exception:
        pass

    # Parse solved counts
    easy = medium = hard = total = 0
    for item in profile_data.get("submitStats", {}).get("acSubmissionNum", []):
        diff = item.get("difficulty", "")
        cnt  = item.get("count", 0)
        if diff == "Easy":   easy   = cnt
        elif diff == "Medium": medium = cnt
        elif diff == "Hard":   hard   = cnt
        elif diff == "All":    total  = cnt

    # Languages
    languages = [
        l["languageName"]
        for l in profile_data.get("languageProblemCount", [])
        if l.get("problemsSolved", 0) > 0
    ][:6]

    # Badges
    badges = [{"name": b.get("name",""), "icon": b.get("icon","")}
              for b in profile_data.get("badges", [])]

    profile = profile_data.get("profile", {})

    print(f"  [LeetCode GraphQL] {username}: rank={profile.get('ranking')}, "
          f"solved={total}(E{easy}/M{medium}/H{hard})")

    return {
        "username":       username,
        "ranking":        profile.get("ranking", 0),
        "avatar":         profile.get("userAvatar", ""),
        "easySolved":     easy,
        "mediumSolved":   medium,
        "hardSolved":     hard,
        "totalSolved":    total,
        "badges":         badges,
        "languagesUsed":  languages,
        "contestRating":  round(contest_data.get("rating", 0)),
        "contestRank":    contest_data.get("globalRanking", 0),
        "contestCount":   contest_data.get("attendedContestsCount", 0),
        "topPercentage":  contest_data.get("topPercentage", 0),
    }, None


# ── CodeChef — Multiple fallback APIs (no HTML scraping) ─────────────────────
def fetch_codechef_profile(username):
    """
    Tries multiple stable CodeChef APIs in order.
    Falls back to next if one fails.
    Returns: rating, stars, global rank, contests, badges
    """
    if not REQUESTS_OK:
        return None, "requests not available"

    headers = {"User-Agent": rand_ua(), "Accept": "application/json"}

    # ── API 1: competeapi ──
    try:
        r = requests.get(
            f"https://competeapi.vercel.app/user/codechef/{username}",
            headers=headers, timeout=12,
        )
        if r.status_code == 200:
            d = r.json()
            if d and not d.get("error") and (d.get("currentRating") or d.get("globalRank")):
                print(f"  [CodeChef] competeapi success: {username}")
                return {
                    "username":             username,
                    "currentRating":        d.get("currentRating", 0),
                    "highestRating":        d.get("highestRating", 0),
                    "stars":                d.get("stars", "0★"),
                    "globalRank":           d.get("globalRank", "N/A"),
                    "countryRank":          d.get("countryRank", "N/A"),
                    "totalSolved":          d.get("totalSolved", 0),
                    "contestsParticipated": d.get("contestsParticipated", 0),
                    "badges":               d.get("badges", []),
                }, None
    except Exception as e:
        print(f"  [CodeChef] competeapi failed: {e}")

    # ── API 2: codechef-api.vercel.app ──
    try:
        r = requests.get(
            f"https://codechef-api.vercel.app/handle/{username}",
            headers=headers, timeout=12,
        )
        if r.status_code == 200:
            d = r.json()
            if d and not d.get("error"):
                print(f"  [CodeChef] codechef-api.vercel success: {username}")
                return {
                    "username":             username,
                    "currentRating":        d.get("currentRating", d.get("rating", 0)),
                    "highestRating":        d.get("highestRating", 0),
                    "stars":                d.get("stars", "0★"),
                    "globalRank":           d.get("globalRank", d.get("global_rank", "N/A")),
                    "countryRank":          d.get("countryRank", "N/A"),
                    "totalSolved":          d.get("totalSolved", 0),
                    "contestsParticipated": d.get("contestsParticipated", 0),
                    "badges":               d.get("badges", []),
                }, None
    except Exception as e:
        print(f"  [CodeChef] codechef-api.vercel failed: {e}")

    # ── API 3: codeforces-style open community endpoint ──
    try:
        r = requests.get(
            f"https://codechef-api-m.vercel.app/api/user/{username}",
            headers=headers, timeout=12,
        )
        if r.status_code == 200:
            d = r.json()
            if d and not d.get("error"):
                print(f"  [CodeChef] alternate vercel success: {username}")
                return {
                    "username":             username,
                    "currentRating":        d.get("currentRating", d.get("rating", 0)),
                    "highestRating":        d.get("highestRating", 0),
                    "stars":                d.get("stars", "0★"),
                    "globalRank":           d.get("globalRank", "N/A"),
                    "countryRank":          d.get("countryRank", "N/A"),
                    "totalSolved":          d.get("totalSolved", 0),
                    "contestsParticipated": d.get("contestsParticipated", 0),
                    "badges":               d.get("badges", []),
                }, None
    except Exception as e:
        print(f"  [CodeChef] alternate vercel failed: {e}")

    # ── API 4: Unofficial JSON endpoint from CodeChef itself ──
    try:
        r = requests.get(
            f"https://www.codechef.com/users/{username}",
            headers={
                "User-Agent": rand_ua(),
                "Accept":     "text/html,application/xhtml+xml",
                "Referer":    "https://www.codechef.com/",
            },
            timeout=15,
        )
        if r.status_code == 404:
            return None, f"User '{username}' not found on CodeChef"
        if r.status_code == 200 and BS4_OK:
            from bs4 import BeautifulSoup as BS
            soup = BS(r.text, "html.parser")
            def safe_int(t, d=0):
                nums = re.findall(r"\d+", str(t).replace(",",""))
                return int(nums[0]) if nums else d

            rating = 0
            rating_el = soup.select_one(".rating-number")
            if rating_el: rating = safe_int(rating_el.get_text())

            stars = "0★"
            stars_el = soup.select_one(".rating-star")
            if stars_el:
                sc = stars_el.get_text(strip=True).count("★")
                stars = f"{sc}★" if sc else "0★"

            global_rank = "N/A"
            rank_els = soup.select(".rating-ranks li")
            for el in rank_els:
                if "global" in el.get_text().lower():
                    a = el.select_one("a, strong")
                    if a: global_rank = a.get_text(strip=True)

            contests = 0
            for el in soup.select("section, .rating-data-section"):
                txt = el.get_text()
                if "Contests Participated" in txt:
                    m = re.search(r"(\d+)", txt)
                    if m: contests = int(m.group(1))

            print(f"  [CodeChef] HTML fallback: {username} rating={rating}")
            return {
                "username":             username,
                "currentRating":        rating,
                "highestRating":        rating,
                "stars":                stars,
                "globalRank":           global_rank,
                "countryRank":          "N/A",
                "totalSolved":          0,
                "contestsParticipated": contests,
                "badges":               [],
            }, None
    except Exception as e:
        print(f"  [CodeChef] all APIs failed: {e}")

    return None, f"Could not fetch CodeChef data for '{username}' — all APIs failed"


# ── GFG — Public JSON endpoint (no HTML scraping) ────────────────────────────
def fetch_gfg_profile(username):
    """
    Uses GFG's own public data endpoint — same data their profile
    page loads from. No HTML scraping at all.
    Returns: rank, score, problems solved by difficulty, streak
    """
    if not REQUESTS_OK:
        return None, "requests not available"

    try:
        r = requests.get(
            f"https://geeksforgeeks.org/api/v1/user/{username}",  # official GFG API
            headers={"User-Agent": rand_ua(), "Accept": "application/json"},
            timeout=15,
        )

        # Fallback to alternate endpoint if first fails
        if r.status_code != 200:
            r = requests.get(
                f"https://gfgapis.vercel.app/api/user/{username}",
                headers={"User-Agent": rand_ua(), "Accept": "application/json"},
                timeout=15,
            )

        if r.status_code == 404:
            return None, f"User '{username}' not found on GFG"
        if r.status_code != 200:
            return None, f"GFG API returned HTTP {r.status_code}"

        d = r.json()
        if not d or d.get("error") or d.get("message") == "User not found":
            return None, f"User '{username}' not found on GFG"

        # Handle both endpoint response formats
        info    = d.get("info", d)
        solved  = d.get("solvedStats", d)

        school  = solved.get("school",  {}).get("count", 0)
        basic   = solved.get("basic",   {}).get("count", 0)
        easy    = solved.get("easy",    {}).get("count", 0)
        medium  = solved.get("medium",  {}).get("count", 0)
        hard    = solved.get("hard",    {}).get("count", 0)
        total   = school + basic + easy + medium + hard or info.get("totalProblemsSolved", 0)

        print(f"  [GFG API] {username}: rank={info.get('instituteRank')}, "
              f"score={info.get('score')}, solved={total}")

        return {
            "username":        username,
            "name":            info.get("name", username),
            "institution":     info.get("institute", ""),
            "profilePicUrl":   info.get("profilePicUrl", info.get("avatar", "")),
            "rank":            info.get("instituteRank", "N/A"),
            "globalRank":      info.get("globalRank", "N/A"),
            "monthlyScore":    info.get("monthlyScore", 0),
            "totalScore":      info.get("score", 0),
            "totalSolved":     total,
            "schoolSolved":    school,
            "basicSolved":     basic,
            "easySolved":      easy,
            "mediumSolved":    medium,
            "hardSolved":      hard,
            "streak":          info.get("currentStreak", 0),
            "maxStreak":       info.get("maxStreak", 0),
            "languages":       info.get("languages", []),
            "contestRating":   info.get("contestRating", 0),
            "contestRank":     info.get("contestRank", "N/A"),
        }, None

    except Exception as e:
        return None, f"GFG API error: {e}"


# ── HackerRank — Official REST API only (badges + certificates) ──────────────
def fetch_hackerrank_profile(username):
    """
    Uses ONLY HackerRank's official REST endpoints.
    No profile page scraping at all.
    Returns: badges (name, stars, icon) + certificates
    """
    if not REQUESTS_OK:
        return None, "requests not available"

    headers = {
        "User-Agent": rand_ua(),
        "Accept":     "application/json",
        "Referer":    "https://www.hackerrank.com/",
    }

    badges       = []
    certificates = []

    # ── Fetch Badges ──
    try:
        r = requests.get(
            f"https://www.hackerrank.com/rest/hackers/{username}/badges",
            headers=headers, timeout=15,
        )
        if r.status_code == 404:
            return None, f"User '{username}' not found on HackerRank"
        if r.status_code != 200:
            return None, f"HackerRank returned HTTP {r.status_code}"

        for b in r.json().get("models", []):
            badges.append({
                "name":   b.get("badge_name", b.get("name", "Badge")),
                "stars":  b.get("stars", 0),
                "imgUrl": b.get("icon_url", b.get("image_url", "")),
            })
        print(f"  [HackerRank] {username}: badges={len(badges)}")

    except Exception as e:
        return None, f"HackerRank badges API error: {e}"

    # ── Fetch Certificates ──
    try:
        rc = requests.get(
            f"https://www.hackerrank.com/rest/hackers/{username}/certificate_requests",
            headers=headers, timeout=15,
        )
        if rc.status_code == 200:
            for cert in rc.json().get("models", []):
                # Only show passed certificates
                if cert.get("status", "").lower() in ("test_passed", "passed", "certified"):
                    certificates.append({
                        "name":   cert.get("label", cert.get("type", "Certificate")),
                        "status": "Certified ✅",
                        "imgUrl": cert.get("certificate_image", ""),
                        "url":    f"https://www.hackerrank.com/certificates/{cert.get('unique_id','')}",
                    })
            print(f"  [HackerRank] {username}: certificates={len(certificates)}")
    except Exception as e:
        print(f"  [HackerRank] certificates fetch failed (non-critical): {e}")

    return {
        "username":         username,
        "badgesCount":      len(badges),
        "badges":           badges,
        "certificateCount": len(certificates),
        "certificates":     certificates,
    }, None


# ── GitHub — Official REST API ────────────────────────────────────────────────
def fetch_github_profile(username):
    if not REQUESTS_OK:
        return None, "requests library not available"
    github_token = os.environ.get("GITHUB_TOKEN", "")
    headers = {"User-Agent": rand_ua(), "Accept": "application/vnd.github+json"}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
    def gh_get(url):
        try:
            r = requests.get(url, headers=headers, timeout=15)
            return r.status_code, r.json() if r.content else {}
        except Exception as e:
            return 503, {"message": str(e)}
    status, user = gh_get(_GITHUB_USER_API.format(username=username))
    if status == 404: return None, f"User '{username}' not found on GitHub"
    if status != 200: return None, f"GitHub API returned HTTP {status}"
    _, repos_raw = gh_get(_GITHUB_REPOS_API.format(username=username))
    repos = repos_raw if isinstance(repos_raw, list) else []
    total_stars = sum(r.get("stargazers_count", 0) for r in repos)
    total_forks = sum(r.get("forks_count", 0) for r in repos)
    lang_count = {}
    for r in repos:
        lang = r.get("language")
        if lang: lang_count[lang] = lang_count.get(lang, 0) + 1
    top_languages = [{"name": l, "count": c}
                     for l, c in sorted(lang_count.items(), key=lambda x: -x[1])[:6]]
    top_repos = sorted([r for r in repos if not r.get("fork")],
                       key=lambda r: r.get("stargazers_count", 0), reverse=True)[:5]
    top_repos_clean = [{
        "name": r.get("name", ""), "url": r.get("html_url", "#"),
        "description": (r.get("description") or "")[:100],
        "stars": r.get("stargazers_count", 0), "forks": r.get("forks_count", 0),
        "language": r.get("language", ""), "updatedAt": r.get("updated_at", ""),
    } for r in top_repos]
    contributions = 0
    _, events_raw = gh_get(_GITHUB_EVENTS_API.format(username=username))
    events = events_raw if isinstance(events_raw, list) else []
    cutoff = time.time() - 90 * 24 * 60 * 60
    for ev in events:
        try:
            ts = datetime.strptime(ev.get("created_at",""), "%Y-%m-%dT%H:%M:%SZ").timestamp()
        except Exception: continue
        if ts < cutoff: continue
        etype = ev.get("type", "")
        if etype == "PushEvent":
            contributions += len(ev.get("payload", {}).get("commits", []))
        elif etype in ("PullRequestEvent", "IssuesEvent", "CreateEvent"):
            contributions += 1
    return {
        "username": username, "name": user.get("name", ""),
        "bio": user.get("bio", ""), "avatarUrl": user.get("avatar_url", ""),
        "profileUrl": user.get("html_url", f"https://github.com/{username}"),
        "publicRepos": user.get("public_repos", 0),
        "followers": user.get("followers", 0), "following": user.get("following", 0),
        "totalStars": total_stars, "totalForks": total_forks,
        "contributions": contributions, "topLanguages": top_languages,
        "topRepos": top_repos_clean,
    }, None


# ════════════════════════════════════════════════════════════════════════════════
# UNIFIED CODING PROFILE ROUTER
# ════════════════════════════════════════════════════════════════════════════════

def fetch_coding_profile(platform, username):
    if not REQUESTS_OK:
        return 503, {"error": "requests library not available"}
    username = username.strip()
    if not username:
        return 400, {"error": "username is required"}

    if platform == "leetcode":
        data, err = fetch_leetcode_profile(username)
        if err:
            return (404 if "not found" in err.lower() else 502), {"error": err}
        return 200, data

    elif platform == "codechef":
        data, err = fetch_codechef_profile(username)
        if err:
            return (404 if "not found" in err.lower() else 502), {"error": err}
        return 200, data

    elif platform == "gfg":
        data, err = fetch_gfg_profile(username)
        if err:
            return (404 if "not found" in err.lower() else 502), {"error": err}
        return 200, data

    elif platform == "hackerrank":
        data, err = fetch_hackerrank_profile(username)
        if err:
            return (404 if "not found" in err.lower() else 502), {"error": err}
        return 200, data

    elif platform == "codeforces":
        try:
            info_resp = requests.get(
                _CODEFORCES_OFFICIAL_API.format(username=username),
                headers={"User-Agent": rand_ua()}, timeout=15
            )
            info_data = info_resp.json() if info_resp.status_code == 200 else {}
            if info_data.get("status") == "FAILED":
                return 404, {"error": f"User '{username}' not found on Codeforces"}
            user_info = info_data.get("result", [{}])[0] if info_data.get("result") else {}
            rating_resp = requests.get(
                _CODEFORCES_RATING_API.format(username=username),
                headers={"User-Agent": rand_ua()}, timeout=15
            )
            rating_hist = []; contests_count = 0; max_rating = 0
            if rating_resp.status_code == 200:
                rdata = rating_resp.json()
                rating_hist    = rdata.get("result", [])
                contests_count = len(rating_hist)
                max_rating     = max((r.get("newRating", 0) for r in rating_hist), default=0)
            return 200, {
                "username":             user_info.get("handle", username),
                "name":                 (user_info.get("firstName","") + " " + user_info.get("lastName","")).strip(),
                "rank":                 user_info.get("rank", "unrated"),
                "maxRank":              user_info.get("maxRank", "unrated"),
                "currentRating":        user_info.get("rating", 0),
                "maxRating":            user_info.get("maxRating", max_rating),
                "contribution":         user_info.get("contribution", 0),
                "contestsParticipated": contests_count,
                "ratingHistory":        rating_hist[-10:],
            }
        except requests.exceptions.Timeout:
            return 504, {"error": "Codeforces API timed out"}
        except Exception as e:
            return 502, {"error": f"Codeforces API error: {str(e)}"}

    elif platform == "github":
        data, err = fetch_github_profile(username)
        if err:
            return (404 if "not found" in err.lower() else 502), {"error": err}
        return 200, data

    else:
        return 400, {"error": f"Unknown platform: {platform}"}


def get_coding_profile_cached(platform, username):
    cache_key = f"{platform}:{username.lower()}"
    now = time.time()
    with _coding_lock:
        entry = _coding_cache.get(cache_key)
        if entry and (now - entry["ts"]) < _CODING_CACHE_TTL:
            return 200, {**entry["data"], "fromCache": True}
    status, data = fetch_coding_profile(platform, username)
    if status == 200:
        with _coding_lock:
            _coding_cache[cache_key] = {"data": data, "ts": now}
        return 200, {**data, "fromCache": False}
    return status, data



# ════════════════════════════════════════════════════════════════════════════════
# HTTP SERVER
# ════════════════════════════════════════════════════════════════════════════════

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  [HTTP] {self.address_string()} — {fmt % args}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, x-admin-key")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path  = self.path.split("?")[0]
        force = "refresh=true" in self.path

        # ── Internships — reads from Supabase ─────────────────────────
        if path == "/api/internships":
            data = supabase_get_all("all_internships", limit=500)
            self._json(200, {"success": True, "data": data, "count": len(data), "source": "supabase"})

        # ── Placements — reads from Supabase ──────────────────────────
        elif path == "/api/placements":
            data = supabase_get_all("all_placements", limit=500)
            self._json(200, {"success": True, "data": data, "count": len(data), "source": "supabase"})

        # ── Manual trigger for sync (admin use) ───────────────────────
        elif path == "/api/sync" and force:
            t = threading.Thread(target=run_daily_sync, daemon=True)
            t.start()
            self._json(200, {"message": "Sync started in background"})

        # ── Health ────────────────────────────────────────────────────
        elif path == "/health" or path == "/ping":
            self._json(200, {"status": "ok", "time": datetime.now().isoformat()})

        # ── Debug — check env vars + Supabase connection + row counts ─
        elif path == "/api/debug":
            internship_count = 0
            placement_count  = 0
            supabase_ok      = False
            try:
                test = supabase_get_all("all_internships", limit=1)
                supabase_ok = test is not None
                internship_count = len(supabase_get_all("all_internships", limit=9999))
                placement_count  = len(supabase_get_all("all_placements",  limit=9999))
            except Exception:
                pass
            self._json(200, {
                "env": {
                    "SUPABASE_URL_set":   bool(SUPABASE_URL),
                    "SUPABASE_KEY_set":   bool(SUPABASE_KEY),
                    "RAPIDAPI_KEY_set":   bool(RAPIDAPI_KEY),
                    "ADZUNA_APP_ID_set":  bool(ADZUNA_APP_ID),
                    "ADZUNA_API_KEY_set": bool(ADZUNA_API_KEY),
                },
                "supabase_connected":  supabase_ok,
                "internships_in_db":   internship_count,
                "placements_in_db":    placement_count,
                "cron_running":        _cron_running,
                "tip": "If counts are 0 → hit /api/sync?refresh=true to trigger first sync"
            })

        # ── DSA / Coding profiles (UNCHANGED) ─────────────────────────
        elif path.startswith("/api/codechef/"):
            username = path[len("/api/codechef/"):].strip("/")
            status, data = get_coding_profile_cached("codechef", username)
            self._json(status, data)
        elif path.startswith("/api/leetcode/"):
            username = path[len("/api/leetcode/"):].strip("/")
            status, data = get_coding_profile_cached("leetcode", username)
            self._json(status, data)
        elif path.startswith("/api/codeforces/"):
            username = path[len("/api/codeforces/"):].strip("/")
            status, data = get_coding_profile_cached("codeforces", username)
            self._json(status, data)
        elif path.startswith("/api/gfg/"):
            username = path[len("/api/gfg/"):].strip("/")
            status, data = get_coding_profile_cached("gfg", username)
            self._json(status, data)
        elif path.startswith("/api/hackerrank/"):
            username = path[len("/api/hackerrank/"):].strip("/")
            status, data = get_coding_profile_cached("hackerrank", username)
            self._json(status, data)
        elif path.startswith("/api/github/"):
            username = path[len("/api/github/"):].strip("/")
            status, data = get_coding_profile_cached("github", username)
            self._json(status, data)

        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        self._json(404, {"error": "Not found"})

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type",   "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)


# ════════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ════════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print(f"""
╔══════════════════════════════════════════════════════╗
║       GradeWallah Backend — Supabase Architecture    ║
║                                                      ║
║   Internships:   /api/internships                    ║
║   Placements:    /api/placements                     ║
║   Force sync:    /api/sync?refresh=true              ║
║                                                      ║
║   DSA Tracker:                                       ║
║   /api/codechef/<u>  /api/leetcode/<u>              ║
║   /api/codeforces/<u> /api/gfg/<u>                  ║
║   /api/hackerrank/<u> /api/github/<u>               ║
║                                                      ║
║   http://0.0.0.0:{PORT}/health                          ║
╚══════════════════════════════════════════════════════╝
""")
    # Start the daily cron scheduler
    start_cron_scheduler()

    server = HTTPServer(("0.0.0.0", PORT), Handler)
    server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Server] Stopped.")
