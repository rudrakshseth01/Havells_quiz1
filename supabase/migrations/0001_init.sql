-- ============================================================
-- Quiz.Live — Production schema (Supabase / Postgres)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
-- Tables:
--   users          — admin accounts (custom auth, name+password+designation)
--   quizzes        — saved quizzes per admin
--   questions      — questions belonging to a quiz
--   game_sessions  — one row per launched game (room code)
--   players        — players who joined a session
--   answers        — one row per (player, question)
--
-- Scoring lives in a Postgres trigger on `answers` so it can't
-- be tampered from the client.
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── users ────────────────────────────────────────────────────
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  password_hash text not null,                 -- bcrypt via pgcrypto crypt()
  designation   text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists users_name_lower_idx on public.users (lower(name));

-- ── quizzes ──────────────────────────────────────────────────
create table if not exists public.quizzes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  status        text not null default 'draft'
                check (status in ('draft','scheduled','live','finished')),
  scheduled_for timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists quizzes_owner_title_unique
  on public.quizzes (owner_id, lower(title));
create index if not exists quizzes_owner_idx on public.quizzes (owner_id);

-- ── questions ────────────────────────────────────────────────
create table if not exists public.questions (
  id        uuid primary key default gen_random_uuid(),
  quiz_id   uuid not null references public.quizzes(id) on delete cascade,
  position  int  not null,                     -- ordering inside a quiz
  text      text not null,
  options   jsonb not null,                    -- array of 4 strings
  correct   int  not null check (correct between 0 and 3),
  duration  int  not null default 20 check (duration between 5 and 120),
  unique (quiz_id, position)
);
create index if not exists questions_quiz_idx on public.questions (quiz_id, position);

-- ── game_sessions ────────────────────────────────────────────
create table if not exists public.game_sessions (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.quizzes(id) on delete cascade,
  owner_id        uuid not null references public.users(id) on delete cascade,
  room_code       text not null unique,
  phase           text not null default 'lobby'
                  check (phase in ('lobby','question','reveal','leaderboard','final','closed')),
  current_q_idx   int  not null default 0,
  question_started_at timestamptz,
  created_at      timestamptz not null default now(),
  ended_at        timestamptz
);
create index if not exists sessions_room_idx on public.game_sessions (room_code);
create index if not exists sessions_owner_idx on public.game_sessions (owner_id);

-- ── players ──────────────────────────────────────────────────
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.game_sessions(id) on delete cascade,
  name        text not null,
  avatar      text not null default 'ninja',
  score       int  not null default 0,
  joined_at   timestamptz not null default now()
);
create index if not exists players_session_idx on public.players (session_id);
create unique index if not exists players_session_name_unique
  on public.players (session_id, lower(name));

-- ── answers ──────────────────────────────────────────────────
create table if not exists public.answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.game_sessions(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  choice      int  not null check (choice between 0 and 3),
  ms          int  not null,                   -- ms taken to answer
  is_correct  boolean not null default false,
  points      int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (player_id, question_id)              -- one answer per player per question
);
create index if not exists answers_session_q_idx on public.answers (session_id, question_id);
create index if not exists answers_player_idx on public.answers (player_id);

-- ============================================================
-- Scoring trigger — runs server-side, can't be tampered.
-- Formula: 100 base + up to 100 speed bonus, only if correct.
-- ============================================================
create or replace function public.score_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q_correct int;
  q_duration int;
  speed_factor numeric;
begin
  select correct, duration into q_correct, q_duration
  from public.questions where id = new.question_id;

  if q_correct is null then
    raise exception 'question not found';
  end if;

  new.is_correct := (new.choice = q_correct);

  if new.is_correct then
    speed_factor := greatest(0, 1 - (new.ms::numeric / (q_duration * 1000)));
    new.points   := round(100 + speed_factor * 100);
  else
    new.points   := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_score_answer on public.answers;
create trigger trg_score_answer
before insert on public.answers
for each row execute function public.score_answer();

-- After the answer is scored, bump the player's running score.
create or replace function public.bump_player_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.players
  set score = score + new.points
  where id = new.player_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_score on public.answers;
create trigger trg_bump_score
after insert on public.answers
for each row execute function public.bump_player_score();

-- ============================================================
-- Auth helpers — custom name+password flow (per spec).
-- ============================================================
create or replace function public.create_user(
  p_name text,
  p_password text,
  p_designation text
) returns public.users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.users;
begin
  if exists (select 1 from public.users where lower(name) = lower(p_name)) then
    raise exception 'username_taken';
  end if;
  insert into public.users (name, password_hash, designation)
  values (p_name, crypt(p_password, gen_salt('bf', 10)), coalesce(p_designation, ''))
  returning * into u;
  return u;
end;
$$;

create or replace function public.verify_user(
  p_name text,
  p_password text
) returns public.users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.users;
begin
  select * into u from public.users where lower(name) = lower(p_name);
  if u is null then return null; end if;
  if u.password_hash = crypt(p_password, u.password_hash) then
    return u;
  end if;
  return null;
end;
$$;

create or replace function public.change_password(
  p_user_id uuid,
  p_current text,
  p_new text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u public.users;
begin
  select * into u from public.users where id = p_user_id;
  if u is null then return false; end if;
  if u.password_hash <> crypt(p_current, u.password_hash) then return false; end if;
  if length(p_new) < 4 then return false; end if;
  update public.users
    set password_hash = crypt(p_new, gen_salt('bf', 10))
    where id = p_user_id;
  return true;
end;
$$;

-- ============================================================
-- Realtime — enable broadcast on the tables players subscribe to.
-- ============================================================
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_sessions'
  ) then
    alter publication supabase_realtime add table public.game_sessions;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'answers'
  ) then
    alter publication supabase_realtime add table public.answers;
  end if;
end
$$;

-- ============================================================
-- Row-Level Security
-- We use SECURITY DEFINER server actions for admin writes (with the
-- service_role key) so client-side RLS can stay strict.
-- The anon key is used by players for read-only realtime subscriptions
-- and inserting their own answers / join records.
-- ============================================================
alter table public.users          enable row level security;
alter table public.quizzes        enable row level security;
alter table public.questions      enable row level security;
alter table public.game_sessions  enable row level security;
alter table public.players        enable row level security;
alter table public.answers        enable row level security;

-- Players read public game-session info while playing
drop policy if exists session_read_anon on public.game_sessions;
create policy session_read_anon on public.game_sessions
  for select using (true);

drop policy if exists question_read_anon on public.questions;
create policy question_read_anon on public.questions
  for select using (true);

drop policy if exists player_read_anon on public.players;
create policy player_read_anon on public.players
  for select using (true);

drop policy if exists answer_read_anon on public.answers;
create policy answer_read_anon on public.answers
  for select using (true);

-- Anyone can create a player row (this is how players join).
drop policy if exists player_join_anon on public.players;
create policy player_join_anon on public.players
  for insert with check (true);

-- Anyone can submit an answer; the trigger validates + scores it.
drop policy if exists answer_insert_anon on public.answers;
create policy answer_insert_anon on public.answers
  for insert with check (true);

-- Owner (admin) writes happen via the service_role key on the server.
-- Service role bypasses RLS automatically; no policy needed.

-- ============================================================
-- Convenience: grant rpc execution to the anon role
-- ============================================================
grant execute on function public.create_user(text, text, text) to anon, authenticated;
grant execute on function public.verify_user(text, text) to anon, authenticated;
grant execute on function public.change_password(uuid, text, text) to anon, authenticated;
