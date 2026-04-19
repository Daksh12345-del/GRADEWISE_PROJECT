# AKTU Result Backend 🎓

A Node.js backend server that fetches AKTU student results by roll number and returns clean JSON — so your GradeWise HTML file can display results automatically.

---

## ⚡ Quick Start (Run in 3 steps)

### Step 1 — Install Node.js
Download from: https://nodejs.org  
(Choose the **LTS** version — 18.x or 20.x)

### Step 2 — Install dependencies
Open a terminal/command prompt in this folder and run:
```
npm install
```

### Step 3 — Start the server
```
npm start
```

You should see:
```
  ╔══════════════════════════════════════╗
  ║   AKTU Result Backend  🎓            ║
  ║   Running on: http://localhost:3001  ║
  ╚══════════════════════════════════════╝
```

---

## 🔌 API Usage

### Check the server is running
```
GET http://localhost:3001/
```
Response:
```json
{ "status": "ok", "message": "AKTU Result Backend is running 🎓" }
```

### Fetch a student result
```
GET http://localhost:3001/result?roll=YOUR_ROLL_NUMBER
```

**Example:**
```
http://localhost:3001/result?roll=2100140540031
```

**Success Response:**
```json
{
  "success": true,
  "roll": "2100140540031",
  "student": {
    "name": "RAHUL SHARMA",
    "rollNo": "2100140540031",
    "college": "XYZ ENGINEERING COLLEGE",
    "course": "B.TECH",
    "branch": "CSE"
  },
  "semesters": [
    {
      "label": "Semester I",
      "sgpa": "8.20",
      "result": "PASS",
      "subjects": [
        {
          "code": "BAS101",
          "name": "Engineering Mathematics-I",
          "externalMax": "70",
          "externalObt": "55",
          "internalMax": "30",
          "internalObt": "25",
          "total": "80",
          "grade": "A"
        }
      ]
    }
  ],
  "cgpa": "7.85"
}
```

**Error Response (roll not found):**
```json
{
  "error": "No result found for this roll number.",
  "roll": "XXXXXXXXX"
}
```

---

## 🔗 Connecting to GradeWise HTML

Your GradeWise HTML file is already updated to talk to this backend.  
**Both must be running at the same time:**

1. Start this backend: `npm start`  
2. Open your `GradeWise_v7_result.html` in a browser

The "AKTU Result Checker" panel in the right sidebar will automatically call `http://localhost:3001/result?roll=...` when you click **View**.

---

## ⚠️ Important Notes

1. **AKTU's server must be up** — Results are only available after AKTU declares them.

2. **CAPTCHA**: AKTU's OneView page has a CAPTCHA that *sometimes* appears. If it does, this backend may fail to get the result. This is outside our control.

3. **Run locally only** — This server is meant to run on your own PC. Do NOT expose it publicly without adding authentication.

4. **AKTU page structure** — If AKTU redesigns their website, the parser may need updating.

---

## 🛠 Troubleshooting

| Problem | Solution |
|---|---|
| `npm: command not found` | Install Node.js from nodejs.org |
| `Cannot find module 'express'` | Run `npm install` again |
| `ECONNREFUSED` | Backend not running — run `npm start` first |
| `No result found` | Results may not be declared yet, or roll number is wrong |
| AKTU returns error | AKTU server may be down — try again later |

---

## 📁 File Structure

```
aktu-backend/
├── server.js      ← Main server (all logic here)
├── package.json   ← Dependencies
└── README.md      ← This file
```
