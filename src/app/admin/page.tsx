import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { Pill } from '@/components/ui/Pill';
import { CreateQuizButton, QuizRowActions } from './_library-client';

export const dynamic = 'force-dynamic';

interface QuizRow {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'scheduled' | 'live' | 'finished';
  scheduled_for: string | null;
  updated_at: string;
  question_count: number;
}

async function fetchQuizzes(ownerId: string): Promise<QuizRow[]> {
  const supabase = getSupabaseServer();
  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('id, title, description, status, scheduled_for, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  if (!quizzes?.length) return [];

  const ids = quizzes.map((q) => q.id);
  const { data: counts } = await supabase
    .from('questions')
    .select('quiz_id')
    .in('quiz_id', ids);
  const countMap = new Map<string, number>();
  for (const c of counts ?? []) {
    countMap.set(c.quiz_id as string, (countMap.get(c.quiz_id as string) ?? 0) + 1);
  }
  return quizzes.map((q) => ({
    ...q,
    question_count: countMap.get(q.id) ?? 0,
  })) as QuizRow[];
}

function statusPill(status: QuizRow['status']) {
  if (status === 'live') return <Pill text="Live" variant="success" />;
  if (status === 'scheduled') return <Pill text="Scheduled" variant="info" />;
  if (status === 'finished') return <Pill text="Finished" variant="neutral" />;
  return <Pill text="Draft" variant="warn" />;
}

export default async function AdminHomePage() {
  const me = await requireUser();
  const quizzes = await fetchQuizzes(me.id);

  return (
    <main className="max-w-[1180px] mx-auto px-6 py-10">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Welcome back, {me.name.split(' ')[0]}
          </h1>
          <p className="text-dim mt-1.5 text-sm">
            {quizzes.length === 0
              ? 'You haven\u2019t created any quizzes yet. Spin one up to get started.'
              : `You have ${quizzes.length} quiz${
                  quizzes.length === 1 ? '' : 'zes'
                } in your library.`}
          </p>
        </div>
        <CreateQuizButton />
      </div>

      {quizzes.length === 0 ? (
        <div className="border border-dashed border-line rounded-2xl p-12 text-center bg-white/[0.015]">
          <div className="text-5xl mb-3">✨</div>
          <h3 className="font-display text-xl font-bold mb-1">
            Create your first quiz
          </h3>
          <p className="text-dim text-sm mb-6 max-w-xs mx-auto">
            Add a few questions, pick a date, and share the room code with your team.
          </p>
          <CreateQuizButton />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="border border-line rounded-2xl p-5 bg-white/[0.025] hover:bg-white/[0.04] transition relative"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <Link
                  href={`/admin/quiz/${q.id}`}
                  className="font-display text-lg font-bold leading-tight hover:underline"
                >
                  {q.title}
                </Link>
                {statusPill(q.status)}
              </div>
              {q.description && (
                <p className="text-dim text-sm mb-4 line-clamp-2">
                  {q.description}
                </p>
              )}
              <div className="flex items-center justify-between text-[12px] text-dim">
                <span>
                  {q.question_count} question
                  {q.question_count === 1 ? '' : 's'}
                </span>
                <span>
                  {q.scheduled_for
                    ? `Scheduled · ${new Date(q.scheduled_for).toLocaleDateString()}`
                    : `Updated ${new Date(q.updated_at).toLocaleDateString()}`}
                </span>
              </div>
              <QuizRowActions quizId={q.id} status={q.status} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
