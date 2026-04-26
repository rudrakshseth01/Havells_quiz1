'use client';

import { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import {
  launchQuizAction,
  saveQuestionsAction,
  updateQuizAction,
} from '../../actions';
import type { Question, Quiz } from '@/lib/types';

interface DraftQuestion {
  text: string;
  options: string[];
  correct: number;
  duration: number;
}

const blankQuestion = (): DraftQuestion => ({
  text: '',
  options: ['', '', '', ''],
  correct: 0,
  duration: 20,
});

export function Editor({ quiz, questions }: { quiz: Quiz; questions: Question[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(quiz.title);
  const [description, setDescription] = useState(quiz.description);
  const [scheduledFor, setScheduledFor] = useState(
    quiz.scheduled_for ? quiz.scheduled_for.slice(0, 16) : '',
  );
  const [list, setList] = useState<DraftQuestion[]>(
    questions.length
      ? questions.map((q) => ({
          text: q.text,
          options: [...q.options],
          correct: q.correct,
          duration: q.duration,
        }))
      : [blankQuestion()],
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Validation
  const errors = list.map((q) => {
    if (!q.text.trim()) return 'Question text is required';
    if (q.options.some((o) => !o.trim())) return 'All four options must be filled';
    return null;
  });
  const valid = errors.every((e) => e === null) && title.trim().length > 0;

  function updateActive(patch: Partial<DraftQuestion>) {
    setList((prev) => prev.map((q, i) => (i === activeIdx ? { ...q, ...patch } : q)));
  }

  function updateOption(optionIdx: number, value: string) {
    setList((prev) =>
      prev.map((q, i) =>
        i === activeIdx
          ? { ...q, options: q.options.map((o, j) => (j === optionIdx ? value : o)) }
          : q,
      ),
    );
  }

  function addQuestion() {
    setList((prev) => [...prev, blankQuestion()]);
    setActiveIdx(list.length);
  }

  function removeQuestion(i: number) {
    if (list.length === 1) return;
    setList((prev) => prev.filter((_, idx) => idx !== i));
    setActiveIdx(Math.max(0, Math.min(activeIdx, list.length - 2)));
  }

  function moveQuestion(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    setList((prev) => {
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setActiveIdx(j);
  }

  async function save({ status }: { status?: 'draft' | 'scheduled' } = {}) {
    if (!valid) return;
    startTransition(async () => {
      await updateQuizAction(quiz.id, {
        title: title.trim(),
        description: description.trim(),
        status: status ?? quiz.status,
        scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      });
      await saveQuestionsAction(quiz.id, list);
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  async function launch() {
    if (!valid) return;
    startTransition(async () => {
      await updateQuizAction(quiz.id, {
        title: title.trim(),
        description: description.trim(),
        scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      });
      await saveQuestionsAction(quiz.id, list);
      try {
        const { sessionId } = await launchQuizAction(quiz.id);
        router.push(`/admin/live/${sessionId}`);
      } catch (e: any) {
        alert('Could not launch.');
      }
    });
  }

  // Auto-saved indicator
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const active = list[activeIdx];

  return (
    <main className="max-w-[1180px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Sidebar — questions list */}
      <aside className="space-y-4">
        <Link
          href="/admin"
          className="text-xs font-bold tracking-[0.14em] text-dim hover:text-text uppercase inline-flex items-center gap-1.5"
        >
          ← Library
        </Link>
        <div className="border border-line rounded-2xl bg-white/[0.025] p-3">
          <div className="flex items-center justify-between mb-2 px-1.5">
            <span className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase">
              Questions ({list.length})
            </span>
          </div>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {list.map((q, i) => {
              const has = errors[i];
              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition ${
                    activeIdx === i
                      ? 'bg-[rgba(160,107,255,0.15)] border-[rgba(160,107,255,0.5)]'
                      : 'border-transparent hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="text-[10px] font-bold tracking-[0.14em] text-dim mb-0.5">
                    Q{i + 1} · {q.duration}s {has && <span className="text-[#FF8E8E]">· needs work</span>}
                  </div>
                  <div className="text-sm font-medium leading-snug line-clamp-2">
                    {q.text || <span className="text-dim italic">Untitled question</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            onClick={addQuestion}
            className="w-full mt-2 h-9 rounded-xl border border-dashed border-line text-dim text-xs font-bold tracking-[0.14em] uppercase hover:text-text hover:border-white/30"
          >
            + Add question
          </button>
        </div>
      </aside>

      {/* Main editor */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Pill
            text={quiz.status}
            variant={
              quiz.status === 'live'
                ? 'success'
                : quiz.status === 'scheduled'
                  ? 'info'
                  : quiz.status === 'finished'
                    ? 'neutral'
                    : 'warn'
            }
          />
          {savedAt && <span className="text-xs text-dim">Saved.</span>}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled Quiz"
          className="w-full bg-transparent border-0 outline-none text-3xl font-display font-bold tracking-tight mb-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a short description (optional)"
          rows={2}
          className="w-full bg-transparent border-0 outline-none text-dim resize-none mb-4"
        />
        <div className="flex flex-wrap gap-3 mb-8">
          <div>
            <label className="qz-label">Schedule for (optional)</label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="qz-input w-[230px]"
            />
          </div>
        </div>

        {/* Question editor */}
        <div className="border border-line rounded-2xl bg-white/[0.025] p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase">
              Question {activeIdx + 1} of {list.length}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => moveQuestion(activeIdx, -1)}
                disabled={activeIdx === 0}
                className="h-8 w-8 rounded-lg border border-white/10 text-dim hover:text-text disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                onClick={() => moveQuestion(activeIdx, 1)}
                disabled={activeIdx === list.length - 1}
                className="h-8 w-8 rounded-lg border border-white/10 text-dim hover:text-text disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                onClick={() => removeQuestion(activeIdx)}
                disabled={list.length === 1}
                className="h-8 px-3 rounded-lg border border-[#FF8E8E]/30 text-[#FF8E8E] text-xs font-bold tracking-[0.14em] uppercase hover:bg-[#FF8E8E]/10 disabled:opacity-30"
              >
                Delete
              </button>
            </div>
          </div>

          <label className="qz-label">Question</label>
          <textarea
            value={active.text}
            onChange={(e) => updateActive({ text: e.target.value })}
            placeholder="What's the question?"
            rows={2}
            className="qz-input mb-5"
            style={{ height: 'auto', padding: 12 }}
          />

          <label className="qz-label">Options · tap the radio to mark the correct answer</label>
          <div className="space-y-2 mb-5">
            {active.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateActive({ correct: i })}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    active.correct === i
                      ? 'border-[#2EC27E] bg-[#2EC27E]/20'
                      : 'border-white/20'
                  }`}
                  aria-label={`Mark option ${i + 1} correct`}
                >
                  {active.correct === i && (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2EC27E]" />
                  )}
                </button>
                <input
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="qz-input"
                />
              </div>
            ))}
          </div>

          <label className="qz-label">Time limit · {active.duration}s</label>
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={active.duration}
            onChange={(e) => updateActive({ duration: Number(e.target.value) })}
            className="w-full"
          />
        </div>

        {errors[activeIdx] && (
          <div className="text-[#FF8E8E] text-sm mt-3">{errors[activeIdx]}</div>
        )}

        <div className="flex flex-wrap gap-3 mt-8 sticky bottom-4 bg-[#0A0B12]/80 backdrop-blur-sm p-2 -mx-2 rounded-xl border border-line">
          <Button
            variant="ghost"
            size="lg"
            disabled={pending || !valid}
            onClick={() => save({ status: 'draft' })}
          >
            {pending ? 'Saving…' : 'Save as draft'}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            disabled={pending || !valid || !scheduledFor}
            onClick={() => save({ status: 'scheduled' })}
          >
            Save & schedule
          </Button>
          <div className="flex-1" />
          <Button size="lg" disabled={pending || !valid} onClick={launch}>
            🚀 Launch live now
          </Button>
        </div>
      </section>
    </main>
  );
}
