import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { Editor } from './editor';
import type { Question, Quiz } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function QuizEditPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireUser();
  const supabase = getSupabaseServer();

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', params.id)
    .eq('owner_id', me.id)
    .maybeSingle();
  if (!quiz) notFound();

  if ((quiz as Quiz).status === 'live') {
    // If a session is already open, send the admin to the live console.
    const { data: session } = await supabase
      .from('game_sessions')
      .select('id, phase')
      .eq('quiz_id', params.id)
      .neq('phase', 'closed')
      .order('created_at', { ascending: false })
      .maybeSingle();
    if (session) redirect(`/admin/live/${session.id}`);
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', params.id)
    .order('position');

  return (
    <Editor
      quiz={quiz as Quiz}
      questions={(questions ?? []) as Question[]}
    />
  );
}
