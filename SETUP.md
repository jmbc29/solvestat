# SolveStat — Accounts & Cloud Storage Setup

This adds **Firebase Auth** (Google + email/password) and **MongoDB Atlas** persistence.
If the env vars below are not set, the app keeps working exactly as before in
guest-only mode (in-memory sessions, no sign-in button).

---

## 1. Firebase project

1. Go to <https://console.firebase.google.com> → **Add project**.
2. In the project, open **Build → Authentication → Get started**.
   - Enable **Google** (pick a support email).
   - Enable **Email/Password**.
3. **Authorized domains** (Authentication → Settings → Authorized domains): add
   `localhost` and your Vercel domain
   `solvestat-jimbo-cais-projects.vercel.app`.
4. **Web app config** — Project settings (gear icon) → **General** → *Your apps* →
   add a **Web app** → copy the `firebaseConfig` values into
   `frontend/.env` (see `frontend/.env.example`):

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

5. **Service account** (for the backend to verify tokens) — Project settings →
   **Service accounts** → **Generate new private key**. This downloads a JSON file.
   - Local dev: save it as `backend/firebase-service-account.json` (git-ignored) and set
     `FIREBASE_SERVICE_ACCOUNT_FILE=./firebase-service-account.json` in `backend/.env`.
   - Railway: open the JSON, copy the whole thing onto one line, and set it as the
     `FIREBASE_SERVICE_ACCOUNT` env var.

---

## 2. MongoDB Atlas

1. Go to <https://cloud.mongodb.com> → create a **free (M0) cluster**.
2. **Database Access** → add a database user (username + password).
3. **Network Access** → add IP `0.0.0.0/0` (Railway has dynamic egress IPs).
4. **Connect → Drivers** → copy the connection string, insert the password, and set it in
   `backend/.env`:

   ```
   MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB=solvestat
   ```

   Collections (`users`, `sessions`) and indexes are created automatically on first use.

---

## 3. Install & run

Backend:
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # then fill in the values
uvicorn main:app --reload
```

Frontend:
```bash
cd frontend
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

Check `GET http://localhost:8000/config` → `{"auth": true, "db": true}` once configured.

---

## 4. Deploy env vars

- **Vercel** (frontend): add all `VITE_FIREBASE_*` vars and `VITE_API_URL`
  (your Railway URL) under Project → Settings → Environment Variables, then redeploy.
- **Railway** (backend): add `MONGODB_URI`, `MONGODB_DB`, and `FIREBASE_SERVICE_ACCOUNT`
  (one-line JSON).

---

## What was added

### Backend (`backend/`)
- `auth.py` — Firebase Admin init + `require_user` dependency (verifies `Authorization: Bearer <idToken>`).
- `db.py` — MongoDB client + helpers for users and sessions.
- `main.py` — new endpoints:
  - `GET /config` — reports whether auth/db are configured
  - `GET /me` — profile + `total_solves` + `session_count` + `handle`
  - `PUT /me/wca-id` — save WCA ID
  - `PUT /me/handle` — set/clear the public profile handle (+ optional display name)
  - `GET /sessions` — list the user's saved sessions (`isPublic` per session)
  - `POST /sessions` — save a session `{name, solves, stats}`
  - `PATCH /sessions/{id}` — rename and/or set `is_public`
  - `DELETE /sessions/{id}` — delete from the cloud
  - `POST /upload/cstimer/` — parse a full csTimer JSON export → many sessions at once
  - `GET /public/{handle}` — **no auth** — aggregate + chart data for sessions the user
    marked public (scrambles/comments stripped)

### Frontend (`frontend/src/`)
- `firebase.js` — Firebase app/auth init from env (`firebaseEnabled` flag).
- `auth/AuthContext.jsx` — `<AuthProvider>` + `useAuth()` (`user`, `loading`, `enabled`, `logout`).
- `api.js` — axios instance that attaches the Firebase ID token; cloud helper functions.
- `lib/aox.js` — the single shared WCA-average implementation (DNF-as-worst trimming).
- `components/AuthPage.jsx` — sign in / sign up modal (Google + email/password).
- `components/ProfilePage.jsx` — WCA ID, public handle + per-session public toggles, account info.
- `components/PublicProfile.jsx` — the standalone `/u/<handle>` page.
- `main.jsx` — routes `/u/<handle>` to `PublicProfile`, everything else to the app.
- `vercel.json` — SPA rewrite so `/u/<handle>` serves `index.html`.
- `App.jsx` — on login, cloud sessions load and merge with any guest sessions; uploads by
  signed-in users are saved automatically; a "Save to cloud" prompt appears for guest
  sessions; deletes/renames/visibility sync to the cloud. All existing dashboard behavior is unchanged.
- `WCAPanel.jsx` — the Profile tab's WCA ID input is pre-filled from the saved profile.
