-- ============================================================
-- RLS hardening patch (incremental)
-- Keeps a small grace window by allowing answer inserts in
-- both question and reveal phases.
-- ============================================================

-- Restrict public session reads to active-ish phases.
drop policy if exists session_read_anon on public.game_sessions;
create policy session_read_anon on public.game_sessions
  for select using (phase in ('lobby','question','reveal','leaderboard','final'));

-- Restrict question reads to quizzes with active-ish sessions.
drop policy if exists question_read_anon on public.questions;
create policy question_read_anon on public.questions
  for select using (
    exists (
      select 1
      from public.game_sessions gs
      where gs.quiz_id = questions.quiz_id
        and gs.phase in ('lobby','question','reveal','leaderboard','final')
    )
  );

-- Allow player joins only while a session is in lobby.
drop policy if exists player_join_anon on public.players;
create policy player_join_anon on public.players
  for insert with check (
    exists (
      select 1
      from public.game_sessions gs
      where gs.id = players.session_id
        and gs.phase = 'lobby'
    )
  );

-- Grace-friendly answer insert policy for direct anon API usage.
drop policy if exists answer_insert_anon on public.answers;
create policy answer_insert_anon on public.answers
  for insert with check (
    exists (
      select 1
      from public.players p
      where p.id = answers.player_id
        and p.session_id = answers.session_id
    )
    and exists (
      select 1
      from public.game_sessions gs
      where gs.id = answers.session_id
        and gs.phase in ('question','reveal')
    )
  );
