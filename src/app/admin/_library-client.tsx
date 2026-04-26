'use client';

import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import {
  createQuizAction,
  deleteQuizAction,
  duplicateQuizAction,
  launchQuizAction,
} from './actions';

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

export function QuizRowActions({
  quizId,
  status,
}: {
  quizId: string;
  status: 'draft' | 'scheduled' | 'live' | 'finished';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex gap-2 mt-4 flex-wrap">
      <Link href={`/admin/quiz/${quizId}`} className="flex-1 min-w-0">
        <Button variant="ghost" className="w-full">
          Edit
        </Button>
      </Link>

      {status !== 'live' && status !== 'finished' && (
        <Button
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
        </Button>
      )}

      {status === 'finished' && (
        <Link href={`/admin/quiz/${quizId}/results`} className="flex-1 min-w-0">
          <Button variant="ghost" className="w-full">
            Results
          </Button>
        </Link>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-10 w-10 rounded-xl border border-white/10 text-dim hover:text-text"
        aria-label="More"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-5 top-14 z-10 bg-[#13141d] border border-line rounded-xl p-1.5 shadow-2xl text-sm w-44">
          <button
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.05]"
            onClick={() =>
              startTransition(async () => {
                await duplicateQuizAction(quizId);
                setOpen(false);
                router.refresh();
              })
            }
          >
            Duplicate
          </button>
          <button
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.05] text-[#FF8E8E]"
            onClick={() => {
              if (
                confirm(
                  'Delete this quiz permanently? This cannot be undone.'
                )
              ) {
                startTransition(async () => {
                  await deleteQuizAction(quizId);
                  setOpen(false);
                  router.refresh();
                });
              }
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
