'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useTransition, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import {
  createQuizAction,
  deleteQuizAction,
  duplicateQuizAction,
  launchQuizAction,
} from './actions';

interface LibraryQuiz {
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

const FILTERS = ['all', 'draft', 'live', 'finished'] as const;
type FilterType = (typeof FILTERS)[number];

function statusPill(status: LibraryQuiz['status']) {
  if (status === 'live') return <Pill text="Live" variant="success" />;
  if (status === 'scheduled') return <Pill text="Scheduled" variant="info" />;
  if (status === 'finished') return <Pill text="Finished" variant="neutral" />;
  return <Pill text="Draft" variant="warn" />;
}

function estimateMinutes(questionCount: number) {
  const totalSeconds = questionCount * 20;
  return Math.max(1, Math.round(totalSeconds / 60));
}

function formatDateStable(input: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(input));
}

function filterLabel(v: FilterType) {
  if (v === 'all') return 'All';
  if (v === 'draft') return 'Draft';
  if (v === 'live') return 'Live';
  return 'Finished';
}

export function CreateQuizButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await createQuizAction();
          router.push(`/admin/quiz/${r.id}`);
        })
      }
    >
      {pending ? 'Creating…' : '+ New Quiz'}
    </Button>
  );
}

export function QuizLibraryBoard({
  quizzes,
  stats,
}: {
  quizzes: LibraryQuiz[];
  stats: LibraryStats;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = useMemo(() => {
    return quizzes.filter((q) => {
      const statusMatch = filter === 'all' || q.status === filter;
      const needle = query.trim().toLowerCase();
      const text = `${q.title} ${q.description}`.toLowerCase();
      const queryMatch = !needle || text.includes(needle);
      return statusMatch && queryMatch;
    });
  }, [filter, query, quizzes]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Total quizzes" value={stats.totalQuizzes} />
        <StatCard label="Drafts" value={stats.draftCount} />
        <StatCard label="Total questions" value={stats.totalQuestions} />
      </div>

      <div className="border border-line rounded-2xl bg-white/[0.02] px-3 py-2.5 flex flex-wrap gap-2 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search quizzes..."
          className="flex-1 min-w-[220px] h-10 px-3 rounded-xl border border-white/10 bg-[#0A0B12]/70 text-sm outline-none focus:border-[rgba(160,107,255,0.5)]"
        />
        <div className="flex items-center gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`h-9 px-3 rounded-lg text-xs font-bold tracking-[0.08em] uppercase border transition ${
                filter === f
                  ? 'bg-[rgba(160,107,255,0.2)] border-[rgba(160,107,255,0.5)] text-text'
                  : 'border-transparent text-dim hover:text-text hover:bg-white/[0.04]'
              }`}
            >
              {filterLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {filtered.length === 0 && (
          <div className="border border-dashed border-line rounded-2xl p-10 text-center text-dim text-sm">
            No quizzes match this search/filter.
          </div>
        )}

        {filtered.map((q) => (
          <div
            key={q.id}
            className="border border-line rounded-2xl px-4 py-3 bg-white/[0.018] hover:bg-white/[0.03] transition"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[260px] flex-1">
                <h3 className="font-display text-[28px] md:text-[30px] leading-none font-bold tracking-tight line-clamp-1">
                  {q.title}
                </h3>
                <p className="text-dim text-sm mt-1 line-clamp-1">{q.description || '—'}</p>
              </div>

              <div>{statusPill(q.status)}</div>

              <div className="text-sm min-w-[140px]">
                <div className="text-dim text-[11px] font-bold tracking-[0.14em] uppercase">Questions</div>
                <div className="font-mono text-base">
                  {q.question_count} · ~{estimateMinutes(q.question_count)} min
                </div>
              </div>

              <div className="text-left lg:text-right min-w-[130px]">
                <div className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase">Updated</div>
                <div className="font-mono text-sm">{formatDateStable(q.updated_at)}</div>
              </div>

              <QuizRowActions quizId={q.id} status={q.status} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line rounded-2xl bg-white/[0.02] p-4">
      <div className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase">{label}</div>
      <div className="font-mono text-4xl leading-none mt-2">{value}</div>
    </div>
  );
}

export function QuizRowActions({
  quizId,
  status,
  compact = false,
}: {
  quizId: string;
  status: 'draft' | 'scheduled' | 'live' | 'finished';
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isFinished = status === 'finished';
  const isLive = status === 'live';
  const actionClass = compact
    ? 'h-8 px-2.5 rounded-lg border border-white/10 bg-white/[0.03] hover:border-white/25 text-xs font-bold tracking-[0.08em] uppercase'
    : 'h-10 px-3 rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/25 text-xs font-bold tracking-[0.08em] uppercase';

  return (
    <div className="flex gap-2 flex-wrap ml-auto">
      {!isFinished && (
        <Link href={`/admin/quiz/${quizId}`}>
          <button type="button" className={actionClass}>
            {isLive ? 'Open live quiz' : 'Edit'}
          </button>
        </Link>
      )}

      {isFinished && (
        <Link href={`/admin/quiz/${quizId}/results`}>
          <button type="button" className={actionClass}>
            Details
          </button>
        </Link>
      )}

      {status !== 'live' && !isFinished && (
        <button
          type="button"
          className={actionClass}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const { sessionId } = await launchQuizAction(quizId);
                router.push(`/admin/live/${sessionId}`);
              } catch (e: any) {
                alert(
                  e?.message === 'no_questions'
                    ? 'Add at least one question before launching.'
                    : 'Could not launch.'
                );
              }
            })
          }
        >
          Launch
        </button>
      )}

      <button
        type="button"
        className={actionClass}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await duplicateQuizAction(quizId);
            router.refresh();
          })
        }
      >
        Duplicate
      </button>

      <button
        type="button"
        className={`${actionClass} text-[#FF8E8E] border-[#FF8E8E]/30 hover:bg-[#FF8E8E]/10`}
        disabled={pending}
        onClick={() => {
          if (confirm('Delete this quiz permanently? This cannot be undone.')) {
            startTransition(async () => {
              await deleteQuizAction(quizId);
              router.refresh();
            });
          }
        }}
      >
        Delete
      </button>
    </div>
  );
}
