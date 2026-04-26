'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { generateRoomCode } from '@/lib/room-code';
import type { Question } from '@/lib/types';

// ────────────────────────────────────────────────
// Quizzes
// ────────────────────────────────────────────────
export async function createQuizAction(): Promise<{ id: string }> {
  const me = await requireUser();
  const supabase = getSupabaseServer();

  // Pick a unique default title
  let title = 'Untitled Quiz';
  let n = 2;
  while (true) {
    const { data: existing } = await supabase
      .from('quizzes')
      .select('id')
      .eq('owner_id', me.id)
      .ilike('title', title)
      .maybeSingle();
    if (!existing) break;
    title = `Untitled Quiz ${n++}`;
  }

  const { data, error } = await supabase
    .from('quizzes')
    .insert({
      owner_id: me.id,
      title,
      description: '',
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'create_quiz_failed');

  // Seed with one starter question
  await supabase.from('questions').insert({
    quiz_id: data.id,
    position: 1,
    text: '',
    options: ['', '', '', ''],
    correct: 0,
    duration: 20,
  });

  revalidatePath('/admin');
  return { id: data.id };
}

export async function deleteQuizAction(id: string) {
  const me = await requireUser();
  const supabase = getSupabaseServer();
  await supabase.from('quizzes').delete().eq('id', id).eq('owner_id', me.id);
  revalidatePath('/admin');
}

export async function duplicateQuizAction(id: string) {
  const me = await requireUser();
  const supabase = getSupabaseServer();

  const { data: src } = await supabase
    .from('quizzes')
    .select('title, description')
    .eq('id', id)
    .eq('owner_id', me.id)
    .maybeSingle();
  if (!src) return;

  // pick a unique title
  let baseTitle = `${src.title} (copy)`;
  let title = baseTitle;
  let n = 2;
  while (true) {
    const { data: existing } = await supabase
      .from('quizzes')
      .select('id')
      .eq('owner_id', me.id)
      .ilike('title', title)
      .maybeSingle();
    if (!existing) break;
    title = `${baseTitle} ${n++}`;
  }

  const { data: dup } = await supabase
    .from('quizzes')
    .insert({
      owner_id: me.id,
      title,
      description: src.description,
      status: 'draft',
    })
    .select('id')
    .single();
  if (!dup) return;

  const { data: questions } = await supabase
    .from('questions')
    .select('position, text, options, correct, duration')
    .eq('quiz_id', id)
    .order('position');

  if (questions?.length) {
    await supabase
      .from('questions')
      .insert(questions.map((q: any) => ({ ...q, quiz_id: dup.id })));
  }

  revalidatePath('/admin');
}

// ────────────────────────────────────────────────
// Editor
// ────────────────────────────────────────────────
export interface QuizPatch {
  title?: string;
  description?: string;
  status?: 'draft' | 'scheduled' | 'finished';
  scheduled_for?: string | null;
}

export async function updateQuizAction(id: string, patch: QuizPatch) {
  const me = await requireUser();
  const supabase = getSupabaseServer();

  const { data: current } = await supabase
    .from('quizzes')
    .select('id, status')
    .eq('id', id)
    .eq('owner_id', me.id)
    .maybeSingle();
  if (!current) throw new Error('not_found');
  if (current.status === 'finished') throw new Error('quiz_finished_readonly');

  const nextTitle = patch.title?.trim();
  if (typeof nextTitle === 'string' && nextTitle.length > 0) {
    const { data: duplicate } = await supabase
      .from('quizzes')
      .select('id')
      .eq('owner_id', me.id)
      .neq('id', id)
      .ilike('title', nextTitle)
      .maybeSingle();
    if (duplicate) throw new Error('duplicate_title');
  }

  const { error } = await supabase
    .from('quizzes')
    .update({
      ...patch,
      ...(typeof nextTitle === 'string' ? { title: nextTitle } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('owner_id', me.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/quiz/${id}`);
  revalidatePath('/admin');
}

export async function saveQuestionsAction(
  quizId: string,
  questions: Array<Pick<Question, 'text' | 'options' | 'correct' | 'duration'>>,
) {
  const me = await requireUser();
  const supabase = getSupabaseServer();

  // Verify ownership
  const { data: own } = await supabase
    .from('quizzes')
    .select('id, status')
    .eq('id', quizId)
    .eq('owner_id', me.id)
    .maybeSingle();
  if (!own) throw new Error('not_owner');
  if (own.status === 'finished') throw new Error('quiz_finished_readonly');

  // Replace strategy: delete all + reinsert. Simple, transactional enough for our scale.
  await supabase.from('questions').delete().eq('quiz_id', quizId);
  if (questions.length) {
    const rows = questions.map((q, i) => ({
      quiz_id: quizId,
      position: i + 1,
      text: q.text,
      options: q.options,
      correct: q.correct,
      duration: q.duration,
    }));
    const { error } = await supabase.from('questions').insert(rows);
    if (error) throw new Error(error.message);
  }

  await supabase
    .from('quizzes')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', quizId);

  revalidatePath(`/admin/quiz/${quizId}`);
  revalidatePath('/admin');
}

// ────────────────────────────────────────────────
// Launch a session
// ────────────────────────────────────────────────
export async function launchQuizAction(quizId: string): Promise<{ sessionId: string; code: string }> {
  const me = await requireUser();
  const supabase = getSupabaseServer();

  // verify ownership + has questions
  const { data: quiz } = await supabase
    .from('quizzes')
    .select('id, owner_id')
    .eq('id', quizId)
    .eq('owner_id', me.id)
    .maybeSingle();
  if (!quiz) throw new Error('not_owner');

  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', quizId);
  if (!count) throw new Error('no_questions');

  // Mint a unique room code
  let code = '';
  for (let i = 0; i < 8; i++) {
    code = generateRoomCode(6);
    const { data: existing } = await supabase
      .from('game_sessions')
      .select('id')
      .eq('room_code', code)
      .maybeSingle();
    if (!existing) break;
  }

  const { data: session, error } = await supabase
    .from('game_sessions')
    .insert({
      quiz_id: quizId,
      owner_id: me.id,
      room_code: code,
      phase: 'lobby',
    })
    .select('id, room_code')
    .single();
  if (error || !session) throw new Error(error?.message ?? 'launch_failed');

  await supabase
    .from('quizzes')
    .update({ status: 'live', updated_at: new Date().toISOString() })
    .eq('id', quizId);

  revalidatePath('/admin');
  return { sessionId: session.id, code: session.room_code };
}

export async function setSessionPhaseAction(sessionId: string, phase: string, currentIdx?: number) {
  const me = await requireUser();
  const supabase = getSupabaseServer();
  const patch: Record<string, unknown> = { phase };
  if (typeof currentIdx === 'number') patch.current_q_idx = currentIdx;
  if (phase === 'question') patch.question_started_at = new Date().toISOString();
  if (phase === 'final' || phase === 'closed') patch.ended_at = new Date().toISOString();

  await supabase
    .from('game_sessions')
    .update(patch)
    .eq('id', sessionId)
    .eq('owner_id', me.id);
}

export async function endSessionAction(sessionId: string) {
  const me = await requireUser();
  const supabase = getSupabaseServer();
  const { data: s } = await supabase
    .from('game_sessions')
    .select('quiz_id, owner_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!s || s.owner_id !== me.id) return;

  await supabase
    .from('game_sessions')
    .update({ phase: 'closed', ended_at: new Date().toISOString() })
    .eq('id', sessionId);

  await supabase
    .from('quizzes')
    .update({ status: 'finished', updated_at: new Date().toISOString() })
    .eq('id', s.quiz_id);

  revalidatePath('/admin');
  redirect(`/admin/quiz/${s.quiz_id}/results?session=${sessionId}`);
}
