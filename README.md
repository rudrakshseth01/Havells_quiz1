# Quiz.Live — Production

A production-ready Next.js 14 + Supabase app for running live multiplayer quizzes.

## Architecture overview

```
production/
├── src/
│   ├── app/
│   │   ├── page.tsx                       # public landing
│   │   ├── admin/
│   │   │   ├── (auth)/                    # sign-in, sign-up, server actions
│   │   │   ├── layout.tsx                 # gated shell (redirects unauth → /admin/sign-in)
│   │   │   ├── page.tsx                   # quiz library
│   │   │   ├── actions.ts                 # CRUD + launch + session phase
│   │   │   ├── quiz/[id]/                 # editor + results
│   │   │   └── live/[id]/                 # admin live console (realtime)
│   │   └── play/                          # player-facing flow (mobile)
│   │       ├── page.tsx                   # join (code → name → avatar)
│   │       ├── actions.ts                 # join action (server-side validation)
│   │       └── game/                      # in-game realtime client
│   ├── lib/
│   │   ├── auth.ts                        # JWT cookie session, custom login
│   │   ├── supabase/{client,server}.ts    # browser & server clients
│   │   ├── characters.ts                  # avatar set
│   │   ├── room-code.ts                   # code generator
│   │   └── types.ts                       # shared DB types
│   └── components/ui/                     # Button, Pill, Avatar primitives
├── supabase/migrations/0001_init.sql      # full schema, triggers, RLS, RPCs
├── .env.example                           # env template
├── package.json
├── next.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

### Why this stack
- **Next.js App Router** — server components for auth-gated reads; server actions for mutations; one deployable.
- **Supabase Postgres + Realtime** — single source of truth. Score is computed in a Postgres trigger so it can't be tampered.
- **Custom JWT auth** — keeps the name+password+designation flow you wanted, backed by `pgcrypto` and `verify_user` / `create_user` RPC functions with bcrypt-hashed passwords.
- **Single app, two top-level routes** — `/admin` (gated) and `/play` (public, mobile). Easier to deploy and share env than two projects; can be split later if needed.

## Local setup

```bash
cd production
cp .env.example .env.local
# Fill in:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   AUTH_JWT_SECRET   (openssl rand -base64 48)
#   NEXT_PUBLIC_APP_URL=http://localhost:3000

npm install
npm run dev
```

Open http://localhost:3000.

### Apply the schema
1. Go to your Supabase project → **SQL Editor** → **New query**.
2. Paste **all** of `supabase/migrations/0001_init.sql` and run.
3. Confirm under **Database → Tables** you see: users, quizzes, questions, game_sessions, players, answers.
4. Under **Database → Replication** verify `game_sessions`, `players`, and `answers` are in the realtime publication.

## Deploying to Vercel

1. Push the **`production/`** folder as a repository (or as a sub-path with `Root Directory` set).
2. Go to https://vercel.com/new → import the repo.
3. Framework: **Next.js** (auto-detected). No build overrides needed.
4. Add the same five environment variables from `.env.local` to the project's **Settings → Environment Variables**.
5. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://quizlive.vercel.app`) — this is what the QR code on the live console encodes.
6. Deploy.

That's it. The app is now hitting your real Supabase database with realtime enabled.

## How the data flows

```
Admin                                          Player phone
─────                                          ────────────
sign-up / sign-in
  ↓ create_user RPC (bcrypt via pgcrypto)
  ↓ JWT cookie set
                                               
create quiz → questions table
launch  → game_sessions row + room_code
  ↓
[Admin live console]                           [Player join]
  subscribes to:                               POST /play/actions joinAction
    game_sessions (UPDATE)                       ↓ insert into players
    players       (* INSERT/UPDATE)
    answers       (INSERT)                     [Player game client]
                                                 subscribes to:
press "Start"  → setSessionPhaseAction(            game_sessions (UPDATE)
   phase: 'question')                              players       (UPDATE — for own score)
                                                   answers       (INSERT — for own answer)
phase = question  ────────────────────────────►  shows question + timer
                                                 tap option → INSERT into answers
                                                   ↓ trigger trg_score_answer
                                                     computes is_correct + points
                                                   ↓ trigger trg_bump_score
                                                     updates players.score
phase = reveal/leaderboard/final ─────────────►  shows result / standings / podium
```

Scoring formula (server-side, in `score_answer()`):
```
points = correct ? round(100 + max(0, 1 - ms / (duration*1000)) * 100) : 0
```
Range: **100–200 per correct answer**, scaled by speed.

## What changed from the prototype

| Prototype | Production |
|---|---|
| Babel-in-browser JSX | Compiled Next.js 14 (App Router, TS) |
| `localStorage` users + quizzes | Postgres tables + RLS |
| Plain-text passwords | bcrypt via `pgcrypto.crypt()` |
| Bot players + `setTimeout` | Real players + Supabase Realtime `postgres_changes` |
| Client-side scoring | Postgres trigger (untamperable) |
| Split-screen admin/player demo | Two distinct routes (`/admin` + `/play`) |
| Browser-window/iOS-frame chrome | Removed — these were prototype mocks |
| One HTML file | App Router with server components |

## Auth & security notes

- The **service role key** is used only inside server actions (never exposed). It bypasses RLS for admin-owned writes (creating quizzes, launching sessions).
- The **anon key** is what the browser uses. RLS policies allow players to read public game data and insert their own player/answer rows. The Postgres trigger validates `is_correct` server-side regardless of what the client sends.
- Player flow is intentionally login-less — they identify via `(session_id, name)` only. Names are unique per session.
- Admin sessions are JWT-signed with `AUTH_JWT_SECRET` and stored in an httpOnly cookie. Rotate this if you ever leak it.

## Free-tier capacity

- Vercel Hobby: 100 GB bandwidth/mo, server actions OK
- Supabase Free: 500 MB Postgres, 2 GB egress, **unmetered Realtime**
- Plenty of headroom for office-scale quizzes (50–200 concurrent).

## Troubleshooting

- **"AUTH_JWT_SECRET is not set"** — you forgot to set the env var in Vercel.
- **Players join but admin doesn't see them** — Realtime publication missing the table. Re-run the bottom of `0001_init.sql` (the `alter publication` lines).
- **Score is always 0** — trigger missing. `select * from pg_trigger where tgname = 'trg_score_answer';` should return one row.
- **"username_taken" on sign-up** — a row with that name already exists; pick a different name or delete the row in Supabase.

## License

MIT.
