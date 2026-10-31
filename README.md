# PashuMitra AI

**An animal voice and movement interpreter for livestock keepers.** From a short sound or video, PashuMitra recognises the animal group, identifies the type of call, and writes the likely meaning and next steps in the keeper's own language. When the sound or movement points to distress, it continues into an explainable health screening, veterinarian review and anonymous outbreak alerts.

> **Important:** PashuMitra gives an *estimate* of what a call may mean. It is **not** an exact translation of an animal's thoughts, and it is **not** a diagnosis. It never gives medicine doses. Always call a veterinarian if an animal looks unwell.

Project of the School of Computer Science and Engineering, RV University, Bengaluru (course CS3250, Natural Language Processing).

## What it does

- **Animal voice interpreter (main feature).** A short recording is analysed on the phone. A small learned model names the animal group (cattle or buffalo, goat or sheep, dog, cat, poultry), transparent rules identify the call type, and the app writes the likely meaning, urgency and suggested actions. It says **"unclear"** instead of guessing when the evidence is weak.
- **Six languages.** English, Hindi, Tamil, Telugu, Kannada and Malayalam, from a fixed, reviewable dictionary of 216 strings, with read-aloud using the browser's speech synthesis.
- **Video movement analysis.** Frame-difference movement per second gives coarse behaviour (resting, restless, uneven movement). The sound in the video is analysed too.
- **Health screening.** Reported signs, movement, sound and shed conditions (temperature-humidity index and ammonia) are fused into a green, yellow or red alert with reasons, using 12 priority rules including emergencies and FMD, LSD and Newcastle suspicions.
- **Veterinarian review and outbreak clusters.** Farmers can share a scan with a verified vet, who confirms or corrects it. Anonymous district counts flag suspected outbreaks.
- **Ask AI.** A retrieval assistant over a curated library of 12 conditions that refuses medicine doses and escalates emergencies.
- **Privacy by design.** Raw audio and video never leave the phone. Only derived numbers are sent to the server.

## Results (honest summary)

Evaluated on **239 real public recordings** (ESC-50 clips of cow, sheep, dog, cat, hen and rooster), with leave-one-fold-out cross-validation:

| Method | Accuracy |
|---|---|
| Majority class | 33.5% |
| Hand-written rules (frozen) | 24.3% |
| Logistic regression, 12 call features | 59.0% |
| Random forest, 60 features | 72.4% |
| **Logistic regression, 60 features (shipped)** | **75.3%** |
| SVM (RBF), 60 features | 78.7% |

With an abstention threshold of 0.7 the shipped model answered 62.8% of clips and was right on 86.7% of those, with 8.4% confident errors.

**Limits you should know about**
- The clips are public recordings, **not farm recordings**. Field accuracy has not been measured. A farm validation protocol with pre-set targets is described in the project report.
- Goat is not in the dataset (sheep stand in for goats), and hen and rooster are merged as poultry.
- The call-to-meaning pairs are hypotheses from commonly described contexts, not a validated lexicon.
- Translations are working drafts and need review by native speakers and veterinarians.
- Health thresholds and weights are not clinically validated.

## Tech stack

- **Server:** Node.js 22 using only built-in modules (`node:sqlite`, `crypto`, `http`). **Zero third-party packages.** 49 endpoints, 8 SQLite tables.
- **Client:** plain ES modules single-page app, no build step.
- **Research scripts:** JavaScript and Python (numpy, scikit-learn) in `research/`.

## Security

Aligned with the OWASP ASVS themes (no formal certification is claimed):

- scrypt password hashing, lockout after 5 failed logins, per-IP and per-account rate limits
- HttpOnly, SameSite=Strict, `__Host-` session cookie with only an HMAC of the token stored
- CSRF token plus Origin allowlist on every write, CORS allowlist
- Content Security Policy with no inline scripts or styles, no `innerHTML`, parameterised SQL only
- Role guards on every route, ownership checks that return "not found", audit log
- Secrets only in environment or a git-ignored `.env`, secret scanner for files and git history, static files served only from `public/`

## Getting started

Requires **Node.js 22.13 or newer**.

```bash
git clone https://github.com/Armsabubakarkhan/pashumitra.git
cd pashumitra
npm start
```

On first run, `npm start` creates a `.env` with fresh random secrets and generates the first administrator password into it. Open `http://localhost:3000`. Microphone and camera work on `localhost` or over HTTPS only.

To configure manually, copy `.env.example` to `.env` and set the values. Key settings:

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | At least 32 random characters |
| `COOKIE_SECURE` | Set `true` when served over HTTPS |
| `CORS_ORIGINS` | Comma-separated extra origins allowed to call the API (empty means same origin) |
| `TRUST_PROXY` | Number of reverse proxies in front of the app |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin, created once. Remove the password from `.env` afterwards |

Never commit `.env` or the `data/` folder.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Set up and run the server |
| `npm test` | Run the unit and API tests (54 tests) |
| `npm run security-test` | Black-box security probe against a running server (25 checks) |
| `npm run scan-secrets` | Scan files and git history for leaked secrets |
| `npm run audit` | Check dependencies |

## Deployment

A `render.yaml` is included for deployment on Render. GitHub Pages cannot host this project because it needs a running Node.js server. Serve it over HTTPS and set `COOKIE_SECURE=true`. SQLite suits a single instance, so on free hosts that reset their disk, data may not persist.

## Project structure

```
server.js            Server entry point
src/                 Config, HTTP helpers, database, auth, engine, knowledge base,
                     weather proxy, voice interpreter, species model, routes
public/              Single-page client (HTML, CSS, JS modules, six-language dictionary)
tests/               Engine, API, analysis and interpreter tests, browser end-to-end script
scripts/             Setup, secret scanner, dependency audit, security probe
research/            Experiments, ESC-50 feature extraction, baselines, species model training
render.yaml          Render deployment description
.env.example         Example environment file
```

## Reproducing the research

See [`research/README.md`](research/README.md) for the full steps: build the ESC-50 animal subset, extract features, run baselines and retrain the species model. All experiments use fixed seeds.

## Data and licence notes

- The species model was trained on 239 ESC-50 clips (K. J. Piczak, "ESC: Dataset for Environmental Sound Classification", ACM Multimedia 2015), licensed CC BY-NC 3.0. The model is therefore for **research and non-commercial use**.
- Weather lookups use [Open-Meteo](https://open-meteo.com) and send only a typed place name.
- No licence has been chosen for the source code yet (`UNLICENSED`). Add one before accepting contributions.

## Team

| Name | USN |
|---|---|
| Abubakar Khan | 1RUA24CSE0010 |


Guide: Dr Merin Thomas, Assistant Professor, School of Computer Science and Engineering, RV University, Bengaluru.

## Disclaimer

PashuMitra provides interpretation and screening only. It does not replace a veterinarian, and its outputs must not be used as a diagnosis or to decide treatment.
