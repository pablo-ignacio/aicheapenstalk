# AI Cheapens Talk — Claude Code Instructions

## Project overview
React/Vite signaling game for a research experiment studying whether AI writing assistance cheapens expert signals. Players take one of two roles — Applicant (sender) or Evaluator (receiver) — and the game logs outcomes to Supabase for analysis.

## Research design
2×2: AI-assisted vs. human-written pitches × human vs. AI evaluator.

The key research question: does knowing (or not knowing) that AI helped write a pitch affect how evaluators assess expertise?

## Payoff structure
| Outcome | Applicant | Evaluator |
|---|---|---|
| Expert hired | +4 | +4 |
| Expert not hired | 0 | 0 |
| Non-expert hired | +2 | −2 |
| Non-expert not hired | 0 | +4 |

Expertise is determined by answering both domain questions correctly.

## Stack
- **Frontend:** React + Vite, Tailwind CSS
- **Backend:** Supabase (anon insert + select RLS)
- **AI:** OpenAI API (pitch improvement, grammar fix, AI evaluator decisions)
- **Hosting:** Vercel (auto-deploys on push to `master`)

## Supabase
- Project: AICheapensTalk
- URL: `https://qaujlwypqvizamzyrhri.supabase.co`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### receiver_decisions columns
`session_id`, `username`, `round`, `field`, `applicant_id`, `applicant_writing_help`, `applicant_is_expert`, `human_decision`, `correct`, `receiver_payoff`, `applicant_payoff`, `created_at`

### sender_rounds columns
`session_id`, `username`, `round`, `field`, `writing_help`, `question_ids`, `is_expert`, `pitch`, `ai_decision`, `correct`, `sender_payoff`, `ai_payoff`, `created_at`

## Key source files
- `src/App.jsx` — all game logic and UI screens
- `src/Dashboard.jsx` — research dashboard (password-gated at `/#dashboard`)
- `src/questions.js` — 320 questions across 8 fields (40 per field)
- `src/simulated-applicants.json` — 480 pre-generated AI applicant pitches
- `benchmark-receivers.json` — 480 AI evaluator decisions used as benchmark (46.7% overall accuracy)

## Domain fields
strategy, human resources, finance, accounting, operations, marketing, sales, ai and information systems

## Game flow
**Evaluator path:** role select → field select → rounds select → `round_start` → `evaluate` → `reveal` → repeat or gameover

**Applicant path:** role select → field select → rounds select → `ai_options` → `sender_answering` → `sender_pitching` → `ai_evaluating` → `reveal` → repeat or gameover

## Applicant pool
Receivers draw from a merged pool of simulated applicants (`simulated-applicants.json`) and human applicants fetched from `sender_rounds` at login. The current user's own submissions are excluded.

## Coding conventions
- No comments unless the WHY is non-obvious
- No trailing summaries at end of responses
- Always push to GitHub after making changes (Vercel deploys automatically)
- Default number of rounds is 2; user chooses 1–10 at game start
- `sessionId` regenerates on every `handleRestart` (i.e. each new game)

## Environment variables
- `VITE_OPENAI_API_KEY` — OpenAI key (required for sender pitching and AI evaluation)
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key
- `VITE_GAME_PASSWORD` — player login password (default: `play2026`)
- `VITE_DASHBOARD_PASSWORD` — research dashboard password (default: `research2026`)
