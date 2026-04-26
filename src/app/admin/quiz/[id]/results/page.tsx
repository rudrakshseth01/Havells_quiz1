import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase/server';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import type {
  Answer,
  GameSession,
  Player,
  Question,
  Quiz,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

interface QStat {
  question: Question;
  total: number;
  correct: number;
  percentByChoice: number[];
}

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { session?: string };
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

  // Pick the requested session or the most recent finished one for this quiz
  let sessionQuery = supabase
    .from('game_sessions')
    .select('*')
    .eq('quiz_id', params.id)
    .eq('owner_id', me.id);
  if (searchParams.session) {
    sessionQuery = sessionQuery.eq('id', searchParams.session);
  } else {
    sessionQuery = sessionQuery.order('created_at', { ascending: false }).limit(1);
  }
  const { data: sessions } = await sessionQuery;
  const session = sessions?.[0] as GameSession | undefined;

  if (!session) {
    return (
      <main className="max-w-[900px] mx-auto px-6 py-10">
        <Link
          href="/admin"
          className="text-xs font-bold tracking-[0.14em] text-dim hover:text-text uppercase"
        >
          ← Library
        </Link>
        <h1 className="font-display text-3xl font-bold mt-4 mb-2 tracking-tight">
          {(quiz as Quiz).title}
        </h1>
        <div className="border border-dashed border-line rounded-2xl p-12 text-center bg-white/[0.015] mt-6">
          <h3 className="font-display text-xl font-bold mb-1">
            No game sessions yet
          </h3>
          <p className="text-dim text-sm">
            Launch this quiz live to start collecting results.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: questions }, { data: players }, { data: answers }] = await Promise.all([
    supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', params.id)
      .order('position'),
    supabase
      .from('players')
      .select('*')
      .eq('session_id', session.id)
      .order('score', { ascending: false }),
    supabase.from('answers').select('*').eq('session_id', session.id),
  ]);

  const Q = (questions ?? []) as Question[];
  const P = (players ?? []) as Player[];
  const A = (answers ?? []) as Answer[];

  const stats: QStat[] = Q.map((q) => {
    const all = A.filter((a) => a.question_id === q.id);
    const counts = [0, 0, 0, 0];
    for (const a of all) counts[a.choice]++;
    const total = all.length || 1;
    return {
      question: q,
      total: all.length,
      correct: all.filter((a) => a.is_correct).length,
      percentByChoice: counts.map((c) => Math.round((c / total) * 100)),
    };
  });

  const top3 = P.slice(0, 3);

  return (
    <main className="max-w-[1100px] mx-auto px-6 py-10">
      <Link
        href="/admin"
        className="text-xs font-bold tracking-[0.14em] text-dim hover:text-text uppercase"
      >
        ← Library
      </Link>
      <div className="flex items-end justify-between mt-4 mb-8 flex-wrap gap-4">
        <div>
          <Pill text="Finished" variant="neutral" />
          <h1 className="font-display text-3xl font-bold mt-2 tracking-tight">
            {(quiz as Quiz).title}
          </h1>
          <div className="text-dim text-sm">
            Played {new Date(session.created_at).toLocaleString()} ·{' '}
            {P.length} player{P.length === 1 ? '' : 's'} ·{' '}
            <span className="font-mono">{session.room_code}</span>
          </div>
        </div>
      </div>

      {/* Podium */}
      {top3.length > 0 && (
        <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto mb-12">
          {top3.map((p, i) => {
            const visualOrder = [2, 1, 3]; // 1st middle, 2nd left, 3rd right
            const heights = ['h-44', 'h-32', 'h-24'];
            const colors = [
              'linear-gradient(180deg,#FFD259,rgba(255,210,89,0.3))',
              'linear-gradient(180deg,#A4A8B8,rgba(164,168,184,0.3))',
              'linear-gradient(180deg,#C77B58,rgba(199,123,88,0.3))',
            ];
            return (
              <div
                key={p.id}
                className="flex flex-col items-center justify-end"
                style={{ order: visualOrder[i] }}
              >
                <Avatar id={p.avatar} size={56} />
                <div className="font-bold mt-2 text-center">{p.name}</div>
                <div className="font-mono text-[#5BD0FF] mb-2">{p.score}</div>
                <div
                  className={`w-full ${heights[i]} rounded-t-xl flex items-center justify-center font-display font-bold text-2xl text-[#0A0B12]`}
                  style={{ background: colors[i] }}
                >
                  {i + 1}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <section>
          <h2 className="font-display text-xl font-bold mb-4 tracking-tight">
            Per-question breakdown
          </h2>
          <div className="space-y-4">
            {stats.map((s, i) => (
              <div
                key={s.question.id}
                className="border border-line rounded-2xl p-5 bg-white/[0.025]"
              >
                <div className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase mb-2">
                  Q{i + 1} · {s.question.duration}s timer · {s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0}% correct
                </div>
                <h3 className="font-display text-lg font-bold mb-4 leading-tight">
                  {s.question.text}
                </h3>
                <div className="space-y-2">
                  {s.question.options.map((opt, j) => {
                    const isRight = j === s.question.correct;
                    return (
                      <div
                        key={j}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl ${
                          isRight ? 'bg-[rgba(46,194,126,0.12)]' : 'bg-white/[0.02]'
                        }`}
                      >
                        <span className="w-6 text-[11px] font-bold tracking-[0.14em] text-dim">
                          {String.fromCharCode(65 + j)}
                        </span>
                        <span className="flex-1 text-sm">{opt}</span>
                        <div className="w-32 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${s.percentByChoice[j]}%`,
                              background: isRight ? '#2EC27E' : '#A06BFF',
                            }}
                          />
                        </div>
                        <span className="text-xs text-dim w-10 text-right">
                          {s.percentByChoice[j]}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside>
          <h2 className="font-display text-xl font-bold mb-4 tracking-tight">
            Players
          </h2>
          <div className="border border-line rounded-2xl bg-white/[0.025] divide-y divide-line">
            {P.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-center text-xs font-bold text-dim">
                  {i + 1}
                </span>
                <Avatar id={p.avatar} size={32} />
                <span className="flex-1 truncate text-sm">{p.name}</span>
                <span className="font-mono font-bold text-sm">{p.score}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
