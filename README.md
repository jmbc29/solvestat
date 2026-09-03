# SolveStat

**A full-stack speedcubing analytics platform** — upload your solve history, explore your performance with statistical analysis, simulate how you'd place at real WCA competitions, and share a public profile.

🔗 **Live demo:** https://solvestat-topaz.vercel.app  
🐙 **GitHub:** https://github.com/jmbc29

---

## Overview

SolveStat turns a raw CSV export from a speedcubing timer into an interactive analytics dashboard. Besides just basic stats and charts, the website contains features such as bootstrap resampling, Monte Carlo simulation, changepoint detection, and distribution fitting to give cubers genuinely useful insight into their performance.

Built as a portfolio project by [Jimbo Cai](https://github.com/jmbc29), a data science student.

I have attached an example dataset from one of my cubing sessions named *exampledataset.csv*. Feel free to download it and take a look!

<img width="1512" height="826" alt="Screenshot 2026-08-04 at 11 48 36 PM" src="https://github.com/user-attachments/assets/54bf58c2-812e-4769-86a8-410393609a6c" />

---

## Features

### 📊 Interactive Charts
- **Line chart** — solve times over session with best/worst markers, +2 and DNF colour coding, overlay sessions for comparison, and pan/zoom
- **Distribution fit** — histogram with fitted normal and lognormal curves (MLE), adjustable bin width
- **Time of Day** — average solve time grouped by time-of-day interval (15m / 30m / 1h / 2h), revealing when you perform best
- **Overlay support** — compare multiple sessions on the same chart
- **Statistical overlays** — mean, median, ±1 SD band, and sub-X target line on any chart

<img width="1512" height="821" alt="Screenshot 2026-08-04 at 11 49 21 PM" src="https://github.com/user-attachments/assets/9d87960a-8f90-421d-8a9a-9d9b84aa0324" />

### 📐 Data Modes
- Single times, Ao5, Ao12, or custom AoX (WCA trimmed mean — drops top and bottom 5%, DNFs always count as the worst result)
- All chart types and analysis tools respect the selected data mode independently

### 🔬 Statistical Analysis
Each test runs on raw singles or computed averages, selectable per analysis:

| Test | Method |
|------|--------|
| **Sub-X Probability** | Wilson score interval for singles; Monte Carlo simulated averages (10,000 trials) for Ao5/Ao12/AoX |
| **Outlier Test** | Exact empirical two-tailed test against your solve history |
| **Phase Detection** | PELT changepoint detection (L2 model, difference-based noise penalty) |
| **A/B Test** | Welch's t-test + Mann-Whitney U + Cohen's d + bootstrap CI on mean difference |

<img width="1508" height="737" alt="Screenshot 2026-08-04 at 11 52 32 PM" src="https://github.com/user-attachments/assets/0e37c4ea-03a5-4112-b5dd-1478ba7c8b49" />


### 🏆 WCA Competition Comparison
- Search real **past** WCA competitions (live WCA API integration) — select event and round, see all competitor results, and run a **Monte Carlo placement simulation** (10,000 trials) that samples averages from your solve distribution and ranks you against the real field
- Simulate an **upcoming** competition you're registered for — placement against the psych sheet built from the public WCIF (accepted registrants ranked by PB average), with per-trial opponent variance so the placement interval isn't overconfident, plus advancement probability read from the round's real advancement condition
- **PB break probability** — simulates how often your training times would beat your official WCA personal best
- **Head-to-head simulation** — enter any competitor's WCA ID and simulate win probability based on their competition history vs your training data

<img width="1512" height="827" alt="Screenshot 2026-09-03 at 11 50 11 AM" src="https://github.com/user-attachments/assets/d11d17d6-400f-4238-9785-86668ec51a38" />

<img width="1211" height="682" alt="Screenshot 2026-08-04 at 11 51 14 PM" src="https://github.com/user-attachments/assets/c41bb60a-4bc1-4192-b6f2-2e951e78b731" />

<img width="1208" height="822" alt="Screenshot 2026-08-04 at 11 51 44 PM" src="https://github.com/user-attachments/assets/b51c893b-8c60-45d3-bdd5-91084d0b9184" />

### 👤 Accounts & Sharing *(optional)*
- **Sign in** with Google or email/password (Firebase Auth). Without Firebase env vars the app runs exactly as before in guest mode — nothing is stored.
- **Cloud sessions** — uploads by signed-in users save to MongoDB Atlas and load automatically on any device
- **Full csTimer import** — drop the entire csTimer JSON export and every session becomes its own tab at once
- **Public profiles** — claim a handle, mark individual sessions public, and share `/(u)/<handle>`. Only aggregate stats and charts are shown; scrambles and comments stay private.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS v4 |
| Charts | Chart.js, react-chartjs-2, chartjs-plugin-annotation |
| Auth | Firebase Auth (client) + Firebase Admin (server token verification) |
| Backend | Python, FastAPI, Uvicorn |
| Statistics | NumPy, SciPy, ruptures |
| Database | MongoDB Atlas (users + saved sessions; nothing stored for guests) |
| External API | WCA REST API v0 + public WCIF |
| Deployment | Vercel (frontend), Render (backend) |

---

## Statistical Methods

### Bootstrap & Wilson Intervals
Sub-X probability on **singles** uses the Wilson score interval, which stays well-behaved at the boundary (0 sub-X solves still yields a real upper bound rather than collapsing to `[0%, 0%]`). In **average** mode it simulates full Ao5/Ao12/AoX from raw singles 10,000 times using WCA trimming rules, answering "how often would I get a sub-X average at a competition?"

### Monte Carlo Simulation
Used for WCA placement and head-to-head. Each trial samples `solve_count` times from the user's distribution, applies WCA trimming, computes an average, then ranks it against the field. For upcoming-competition psych sheets each opponent's average is also perturbed per trial (lognormal, ~6% CV) so the placement interval reflects day-to-day form rather than treating PBs as fixed. 10,000 trials produce a placement distribution, median, 95% CI, and advancement probability.

### PELT Changepoint Detection
Detects performance phase shifts using the Pruned Exact Linear Time algorithm with an L2 cost model. The penalty scales with `log(n)` and a noise-variance estimate taken from successive differences (which isn't inflated by the level shifts being detected), so it flags genuine phase changes rather than random fluctuation.

### Distribution Fitting
Fits both normal and lognormal distributions via maximum likelihood estimation. Compares log-likelihoods to determine best fit. Solve times are typically lognormal (right-skewed), which the tool confirms or contradicts per session.

### Outlier Test
Tests whether a specific solve time is statistically unusual by computing, exactly from the session history, what fraction of solves are at least that extreme, then doubling for a two-tailed p-value. Below 0.05 indicates a genuine statistical outlier.

### A/B Test
Welch's t-test (unequal variance/size), Mann-Whitney U (non-parametric), and Cohen's d with a degrees-of-freedom-weighted pooled standard deviation (correct even when the two sessions differ greatly in size), plus a 10,000-resample bootstrap CI on the mean difference.

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # optional — the app runs in guest mode without it
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env        # set VITE_API_URL; add VITE_FIREBASE_* for accounts
npm run dev
```

`GET http://localhost:8000/config` reports whether auth and the database are configured.

### Enabling accounts
Accounts and public profiles need a Firebase project and a MongoDB Atlas cluster.
Full walkthrough: **[SETUP.md](SETUP.md)**.

### Deployment
- **Frontend** → Vercel. Framework preset *Vite*, root directory `frontend`. Set
  `VITE_API_URL` (the backend URL) and the six `VITE_FIREBASE_*` values as environment
  variables, then redeploy. `frontend/vercel.json` adds the SPA rewrite so `/u/<handle>`
  deep links resolve.
- **Backend** → Render (free web service). Root directory `backend`, build
  `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
  Set `MONGODB_URI`, `MONGODB_DB`, and `FIREBASE_SERVICE_ACCOUNT` (the service-account
  JSON on one line). The free instance sleeps after ~15 min idle, so the first request
  after a nap takes ~50 s to wake.
- Add the deployed frontend domain to Firebase → Authentication → Settings → Authorized
  domains, or Google sign-in returns `auth/unauthorized-domain`.

### CSV Format
Export your solves from [csTimer](https://cstimer.net) as a CSV (semicolon-delimited columns including `Time`, `Date`, `Scramble`, `Comment`). Plain, `+2`, `DNF(...)`, and `MM:SS.xx` time formats are handled. The full csTimer JSON export (**Export → to file**) is also accepted and imports every session at once.

---

## Architecture

```
solvestat/
├── frontend/          # React + Vite
│   └── src/
│       ├── main.jsx                 # entry — routes /u/<handle> to the public page, else the app
│       ├── App.jsx                  # state management, session handling, cloud sync
│       ├── api.js                   # axios instance (attaches Firebase ID token) + cloud helpers
│       ├── firebase.js              # Firebase app/auth init from env
│       ├── auth/AuthContext.jsx     # <AuthProvider> + useAuth()
│       ├── lib/aox.js               # the single shared WCA-average implementation
│       └── components/
│           ├── SolveChart.jsx       # line, distribution, time-of-day charts
│           ├── HypothesisPanel.jsx  # statistical analysis tests
│           ├── WCAPanel.jsx         # WCA competition + profile features
│           ├── UploadFile.jsx       # CSV / csTimer drag-and-drop upload
│           ├── AuthPage.jsx         # sign in / sign up modal
│           ├── ProfilePage.jsx      # WCA ID, public handle, per-session visibility
│           └── PublicProfile.jsx    # standalone /u/<handle> page
└── backend/
    ├── main.py        # FastAPI — CSV/csTimer parsing, stats, WCA proxy, simulations, accounts
    ├── auth.py        # Firebase Admin + require_user dependency
    └── db.py          # MongoDB client + helpers
```

---

## Key Design Decisions

**Why FastAPI for stats instead of client-side JS?** NumPy/SciPy provide robust, battle-tested implementations of statistical tests that would be fragile to reimplement in JavaScript. The backend acts as a statistics engine while the frontend handles all interactivity.

**Why Monte Carlo instead of closed-form solutions?** The user's solve distribution is empirical and non-parametric — it doesn't follow a known distribution cleanly. Sampling directly from the observed data gives more accurate placement estimates than assuming normality.

**Why PELT for changepoints?** PELT is exact (not approximate) and runs in O(n) expected time, making it practical for sessions with thousands of solves. The L2 model is appropriate for detecting mean shifts in solve times.

**Why is auth optional?** The dashboard has real value with zero friction — no account, no data leaves the browser. Accounts add cross-device persistence and sharing on top without changing any of the existing behaviour.

---

## Author

**Jimbo Cai** — Data Science Student  
GitHub: [@jmbc29](https://github.com/jmbc29)
