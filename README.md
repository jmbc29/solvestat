# SolveStat

**A full-stack speedcubing analytics platform** — upload your solve history, explore your performance with statistical analysis, and simulate how you'd place at real WCA competitions.

🔗 **Live demo:** https://solvestat-jimbo-cais-projects.vercel.app  
🐙 **GitHub:** https://github.com/jmbc29

---

## Overview

SolveStat turns a raw CSV export from a speedcubing timer into an interactive analytics dashboard. It goes beyond basic stats — implementing bootstrap resampling, Monte Carlo simulation, changepoint detection, and distribution fitting to give cubers genuinely useful insight into their performance.

Built as a portfolio project by [Jimbo Cai](https://github.com/jmbc29), a data science student.

---

## Features

### 📊 Interactive Charts
- **Line chart** — solve times over session with best/worst markers, +2 and DNF colour coding, overlay sessions for comparison, and pan/zoom
- **Distribution fit** — histogram with fitted normal and lognormal curves (MLE), adjustable bin width
- **Time of Day** — average solve time grouped by time-of-day interval (15m / 30m / 1h / 2h), revealing when you perform best
- **Overlay support** — compare multiple sessions on the same chart
- **Statistical overlays** — mean, median, ±1 SD band, and sub-X target line on any chart

### 📐 Data Modes
- Single times, Ao5, Ao12, or custom AoX (WCA trimmed mean — drops top and bottom 5%)
- All chart types and analysis tools respect the selected data mode independently

### 🔬 Statistical Analysis
Each test runs on raw singles or computed averages, selectable per analysis:

| Test | Method |
|------|--------|
| **Sub-X Probability** | Bootstrap resampling (10,000 trials) with 95% CI — supports singles and average modes |
| **Outlier Test** | Permutation test (10,000 draws) with two-tailed p-value |
| **Phase Detection** | PELT changepoint detection (L2 model, BIC-style penalty) |
| **A/B Test** | Welch's t-test + Mann-Whitney U + Cohen's d + bootstrap CI on mean difference |

### 🏆 WCA Competition Comparison
- Search real past WCA competitions (live WCA API integration)
- Select event and round; see all competitor results
- **Monte Carlo placement simulation** (10,000 trials) — samples averages from your solve distribution and ranks you against the real field
- **Advancement probability** — calculates how likely you are to advance to the next round based on competitor counts
- **PB break probability** — simulates how often your training times would beat your official WCA personal best
- **Head-to-head simulation** — enter any competitor's WCA ID and simulate win probability based on their competition history vs your training data

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS v4 |
| Charts | Chart.js, react-chartjs-2, chartjs-plugin-annotation |
| Backend | Python, FastAPI, Uvicorn |
| Statistics | NumPy, SciPy, scikit-learn, ruptures |
| External API | WCA REST API v0 |
| Deployment | Vercel (frontend), Railway (backend) |

---

## Statistical Methods

### Bootstrap Resampling
Used for sub-X probability estimation. Resamples the solve history 10,000 times with replacement, measuring empirical rate and constructing a 95% confidence interval. In average mode, simulates full Ao5/Ao12/AoX from raw singles using WCA trimming rules, answering "how often would I get a sub-X average at a competition?"

### Monte Carlo Simulation
Used for WCA placement and head-to-head. Each trial samples `solve_count` times from the user's distribution, applies WCA trimming, computes an average, then ranks it against the real field. 10,000 trials produce a placement distribution, median, 95% CI, and advancement probability.

### PELT Changepoint Detection
Detects performance phase shifts using the Pruned Exact Linear Time algorithm with an L2 cost model. The penalty is set to `3 × log(n) × variance`, which avoids over-segmentation and only flags genuine shifts in performance level.

### Distribution Fitting
Fits both normal and lognormal distributions via maximum likelihood estimation. Compares log-likelihoods to determine best fit. Solve times are typically lognormal (right-skewed), which the tool confirms or contradicts per session.

### Permutation Test (Outlier)
Tests whether a specific solve time is statistically unusual. Draws 10,000 samples from the session history and computes a two-tailed p-value. A result below 0.05 indicates the time is a genuine statistical outlier.

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Create a `.env` file in `frontend/`:

VITE_API_URL=http://localhost:8000

### CSV Format
Export your solves from [csTimer](https://cstimer.net) as a CSV. The app expects semicolon-delimited columns including `Time`, `Date`, `Scramble`, and `Comment`.

---

## Architecture

solvestat/
├── frontend/          # React + Vite
│   └── src/
│       ├── App.jsx                  # State management, session handling
│       └── components/
│           ├── SolveChart.jsx       # Line, distribution, time-of-day charts
│           ├── HypothesisPanel.jsx  # Statistical analysis tests
│           ├── WCAPanel.jsx         # WCA competition + profile features
│           └── UploadFile.jsx       # CSV drag-and-drop upload
└── backend/
└── main.py        # FastAPI — CSV parsing, stats, WCA proxy, simulations

---

## Key Design Decisions

**Why FastAPI for stats instead of client-side JS?** NumPy/SciPy provide robust, battle-tested implementations of statistical tests that would be fragile to reimplement in JavaScript. The backend acts as a statistics engine while the frontend handles all interactivity.

**Why Monte Carlo instead of closed-form solutions?** The user's solve distribution is empirical and non-parametric — it doesn't follow a known distribution cleanly. Sampling directly from the observed data gives more accurate placement estimates than assuming normality.

**Why PELT for changepoints?** PELT is exact (not approximate) and runs in O(n) expected time, making it practical for sessions with thousands of solves. The L2 model is appropriate for detecting mean shifts in solve times.

---

## Author

**Jimbo Cai** — Data Science Student  
GitHub: [@jmbc29](https://github.com/jmbc29)
