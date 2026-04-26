import { requireUser } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { CreateQuizButton, QuizLibraryBoard } from './_library-client';

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

interface LibraryStats {
  totalQuizzes: number;
  draftCount: number;
  totalQuestions: number;
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

export default async function AdminHomePage() {
  const me = await requireUser();
  const quizzes = await fetchQuizzes(me.id);
  const stats: LibraryStats = {
    totalQuizzes: quizzes.length,
    draftCount: quizzes.filter((q) => q.status === 'draft').length,
    totalQuestions: quizzes.reduce((sum, q) => sum + q.question_count, 0),
  };

  return (
    <main className="max-w-[1180px] mx-auto px-6 py-10">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="font-display text-5xl font-bold tracking-tight">My quizzes</h1>
          <p className="text-dim mt-1.5 text-sm">
            Build a quiz, Draft it and launch a live room when you're ready.
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
        <QuizLibraryBoard quizzes={quizzes} stats={stats} />
      )}
    </main>
  );
}
