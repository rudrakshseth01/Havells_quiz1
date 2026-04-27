'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { LOBBY_EMOJIS, type LobbyEmoji } from '@/lib/reactions';

export interface JoinResult {
  ok: boolean;
  error?: string;
}

export async function joinAction(form: FormData): Promise<JoinResult> {
  const code = String(form.get('code') ?? '').trim().toUpperCase();
  const name = String(form.get('name') ?? '').trim();
  const avatar = String(form.get('avatar') ?? 'ninja');

  if (!/^[A-Z0-9]{4,8}$/.test(code))
    return { ok: false, error: 'Enter the 6-character room code.' };
  if (name.length < 1 || name.length > 24)
    return { ok: false, error: 'Pick a name (1–24 characters).' };

  const supabase = getSupabaseServer();

  const { data: session } = await supabase
    .from('game_sessions')
    .select('id, phase')
    .eq('room_code', code)
    .maybeSingle();
  if (!session)
    return { ok: false, error: 'No game found with that code.' };
  if (session.phase === 'closed' || session.phase === 'final')
    return { ok: false, error: 'That game has already finished.' };

  // Insert player. Unique constraint on (session_id, lower(name)) handles dupes.
  const { data: player, error } = await supabase
    .from('players')
    .insert({
      session_id: session.id,
      name,
      avatar,
    })
    .select('id')
    .single();
  if (error) {
    if (String(error.message).toLowerCase().includes('duplicate'))
      return {
        ok: false,
        error: 'Someone is already using that name in this room.',
      };
    return { ok: false, error: 'Could not join. Try again.' };
  }

  redirect(`/play/game?session=${session.id}&player=${player.id}`);
}

// Submit an answer. Server-side so we never echo is_correct/points back to the
// browser during the question phase — that would let the player see whether
// they were right before the host reveals.
export async function submitAnswerAction(input: {
  sessionId: string;
  playerId: string;
  questionId: string;
  choice: number;
  ms: number;
}): Promise<{ ok: boolean }> {
  const supabase = getSupabaseServer();
  const { error } = await supabase.from('answers').insert({
    session_id: input.sessionId,
    player_id: input.playerId,
    question_id: input.questionId,
    choice: input.choice,
    ms: input.ms,
  });
  if (error && !String(error.message).toLowerCase().includes('duplicate')) {
    return { ok: false };
  }
  return { ok: true };
}

export async function sendLobbyEmojiAction(input: {
  sessionId: string;
  playerId: string;
  emoji: LobbyEmoji;
}): Promise<{ ok: boolean }> {
  if (!LOBBY_EMOJIS.includes(input.emoji)) return { ok: false };

  const supabase = getSupabaseServer();

  const { data: session } = await supabase
    .from('game_sessions')
    .select('id, phase')
    .eq('id', input.sessionId)
    .maybeSingle();
  if (!session || session.phase !== 'lobby') return { ok: false };

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', input.playerId)
    .eq('session_id', input.sessionId)
    .maybeSingle();
  if (!player) return { ok: false };

  const { error } = await supabase
    .from('players')
    .update({
      reaction_emoji: input.emoji,
      reaction_at: new Date().toISOString(),
    })
    .eq('id', input.playerId)
    .eq('session_id', input.sessionId);

  return { ok: !error };
}

// Returns is_correct/points only when the session has revealed the question.
export async function fetchMyAnswerForRevealAction(input: {
  sessionId: string;
  playerId: string;
  questionId: string;
}): Promise<{
  choice: number;
  is_correct: boolean;
  points: number;
  correct_index: number;
} | null> {
  const supabase = getSupabaseServer();
  const { data: sess } = await supabase
    .from('game_sessions')
    .select('phase, quiz_id')
    .eq('id', input.sessionId)
    .maybeSingle();
  if (!sess) return null;
  // Only return scoring info once the host has moved past the question phase.
  if (sess.phase === 'lobby' || sess.phase === 'question') return null;

  const { data: answer } = await supabase
    .from('answers')
    .select('choice, is_correct, points')
    .eq('player_id', input.playerId)
    .eq('question_id', input.questionId)
    .maybeSingle();
  if (!answer) return null;

  const { data: question } = await supabase
    .from('questions')
    .select('correct')
    .eq('id', input.questionId)
    .eq('quiz_id', sess.quiz_id)
    .maybeSingle();
  if (!question) return null;

  return {
    ...(answer as { choice: number; is_correct: boolean; points: number }),
    correct_index: Number((question as { correct: number }).correct),
  };
}
