import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { GameClient } from './game-client';
import type {
  GameSession,
  Player,
  Question,
  Quiz,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PlayGamePage({
  searchParams,
}: {
  searchParams: { session?: string; player?: string };
}) {
  if (!searchParams.session || !searchParams.player) notFound();

  const supabase = getSupabaseServer();
  const { data: session } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', searchParams.session)
    .maybeSingle();
  if (!session) notFound();

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', searchParams.player)
    .eq('session_id', searchParams.session)
    .maybeSingle();
  if (!player) notFound();

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('id, title')
    .eq('id', (session as GameSession).quiz_id)
    .maybeSingle();

  // Player gets question text + options + duration, but NOT the `correct` index.
  // We only reveal the correct answer post-submit (or in the reveal phase from session).
  const { data: questions } = await supabase
    .from('questions')
    .select('id, quiz_id, position, text, options, duration')
    .eq('quiz_id', (session as GameSession).quiz_id)
    .order('position');

  return (
    <GameClient
      session={session as GameSession}
      player={player as Player}
      quizTitle={(quiz as Pick<Quiz, 'id' | 'title'> | null)?.title ?? 'Quiz'}
      questions={(questions ?? []) as Question[]}
    />
  );
}
