import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { LiveConsole } from './live-console';
import type { GameSession, Question, Quiz } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function LivePage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireUser();
  const supabase = getSupabaseServer();

  const { data: session } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', params.id)
    .eq('owner_id', me.id)
    .maybeSingle();
  if (!session) notFound();

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', (session as GameSession).quiz_id)
    .maybeSingle();
  if (!quiz) notFound();

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', (session as GameSession).quiz_id)
    .order('position');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  return (
    <LiveConsole
      session={session as GameSession}
      quiz={quiz as Quiz}
      questions={(questions ?? []) as Question[]}
      joinUrl={`${appUrl}/play?code=${(session as GameSession).room_code}`}
    />
  );
}
