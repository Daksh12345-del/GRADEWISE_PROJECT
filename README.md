# 🎓 GradeWallah

A full-stack SaaS platform for SGPA/CGPA calculation and semester-wise academic tracking — built for engineering students to track grades, explore placement resources, and follow a structured DSA roadmap, all in one dashboard.

🔗 **Live Demo:** [gradewallah.com](https://gradewallah.com)

---

## ✨ Features

- 🔐 **Authentication** — Secure sign-up/sign-in with Clerk, including Google/GitHub OAuth
- 🧮 **CGPA/SGPA Calculator** — Semester-wise marks entry with an automatic calculation engine (back-paper logic included)
- 📊 **Dashboard** — At-a-glance stats: current CGPA, current SGPA, semesters completed, credits earned
- 📈 **Semester Progress Tracker** — Visual progress strip across all 8 semesters
- 💼 **Placement Resources** — Live placement drives pulled in real time from Supabase
- 🧭 **Internship Listings** — Curated internship matches for students
- 🗺️ **DSA Roadmap** — Structured problem-solving roadmap with progress tracking
- 🌗 **Theme Toggle** — Dark/light mode across the entire app
- 🎨 **Smooth UI Animations** — Powered by Framer Motion
- 🛡️ **Bot Protection** — Google reCAPTCHA on auth forms

## 🛠️ Tech Stack

**Frontend**
![React](https://img.shields.io/badge/-React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![Vite](https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![React Router](https://img.shields.io/badge/-React_Router-CA4245?style=flat-square&logo=reactrouter&logoColor=white) ![Framer Motion](https://img.shields.io/badge/-Framer_Motion-0055FF?style=flat-square&logo=framer&logoColor=white)

**Backend & Auth**
![Supabase](https://img.shields.io/badge/-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white) ![Clerk](https://img.shields.io/badge/-Clerk-6C47FF?style=flat-square&logo=clerk&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)

**Deployment**
![Vercel](https://img.shields.io/badge/-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

## 📦 Installation

Clone the repo and get it running locally:

```bash
# 1. Clone the repository
git clone https://github.com/Daksh12345-del/GRADEWISE_PROJECT.git
cd GRADEWISE_PROJECT

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# then add your Supabase and Clerk keys inside .env

# 4. Run the dev server
npm run dev
```

The app will be running at **http://localhost:5173**

### Other useful commands

```bash
npm run build     # production build
npm run preview   # preview the production build locally
npm run lint       # run oxlint
```

## 📸 Screenshots

| Sign Up | Dashboard |
|---|---|
| ![Sign Up](./screenshots/signup.png) | ![Dashboard](./screenshots/dashboard.png) |

| Grades (SGPA/CGPA Calculator) | Study Resources |
|---|---|
| ![Grades](./screenshots/grades.png) | ![Study Resources](./screenshots/study-resources.png) |

| Internships | Placements |
|---|---|
| ![Internships](./screenshots/internships.png) | ![Placements](./screenshots/placements.png) |

| DSA Tracker | Stats Overview |
|---|---|
| ![DSA Tracker](./screenshots/dsa-tracker.png) | ![Stats](./screenshots/stats-modal.png) |

## 🚀 Live Demo

👉 [https://gradewallah.com](https://gradewallah.com)

## 🧑‍💻 Author

**Daksh Singhal**
[LinkedIn](https://www.linkedin.com/in/daksh-singhal-178b56282/) · [GitHub](https://github.com/Daksh12345-del)
