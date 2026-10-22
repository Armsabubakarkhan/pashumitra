# PashuMitra AI

Voice-first livestock health screening. A farmer ticks the signs they see, adds a short video, a sound recording and shed conditions, and gets one explainable risk alert (green, yellow, red) with reasons and next steps in six languages. Veterinarians confirm or correct results, and anonymous district clusters warn neighbours about FMD, LSD and Newcastle disease.

## Run it

Requires Node.js 22.13 or newer. There is nothing to install: the app uses only built-in Node modules.

    npm start

On the first run a `.env` file with fresh random secrets is created and the administrator password is printed once in the terminal. Open http://127.0.0.1:3000.

Other commands:

    npm test              # unit and API tests (41)
    npm run security-test # black-box probe, needs a running server: node scripts/security-test.js http://127.0.0.1:3000
    npm run scan-secrets  # secret scan of files and git history
    npm run audit         # dependency audit (zero third-party packages)

## What is inside

- `server.js`, `src/` : HTTP server, security headers, CORS allowlist, rate limiting, sessions, CSRF, SQLite (node:sqlite), routes
- `src/engine.js` : fusion engine (signs, movement, sound, THI, ammonia) with explainable reasons
- `src/kb.js` : disease library and the Ask AI answerer. It never gives drug doses
- `public/` : the web app (plain ES modules, no build step), on-device video and audio analysis in `public/js/analysis.js`
- `tests/` : engine, API, analysis tests and a Playwright browser test (`tests/e2e.py`)

## Accounts and roles

- farmer: animals, scans, shed readings, vaccines, share a scan with a vet
- vet: registers, waits for administrator verification, then reviews shared cases
- admin: created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` on first start. Verifies vets, disables users, manages the clinic list, exports labelled data

## One-click deploy (Render)

Push this folder to a GitHub repo, then in Render choose New > Blueprint and select the repo. `render.yaml` sets everything. Enter your email for `ADMIN_EMAIL` when asked. The generated admin password is shown under the service's Environment tab. The free plan wipes the database on restart; add a persistent disk and set `DB_PATH` for real use.

## Production notes

- Put it behind HTTPS, then set `COOKIE_SECURE=true` and `TRUST_PROXY=1` (or the number of proxies) in `.env`.
- Remove `ADMIN_PASSWORD` from `.env` after the first start and change the password in the app.
- Back up `data/pashumitra.db`. The `data/` folder and `.env` are git-ignored.
- Nearby Help ships with clearly marked sample clinics. Replace them from the admin screen.

## Honest limits

The screening rules are written from standard livestock health guidance and have not been validated on a large field dataset. Sound labels describe the shape of a recording. Translations are working drafts that need review by native speakers. Not a substitute for a veterinarian.
