-- ============================================================
-- Player lobby reactions
-- Adds a lightweight reaction marker to player rows so the host can
-- display floating emojis during the lobby without a separate event table.
-- ============================================================

alter table if exists public.players
  add column if not exists reaction_emoji text;

alter table if exists public.players
  add column if not exists reaction_at timestamptz;
