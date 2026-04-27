// @ts-nocheck
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import {
  endSessionAction,
  setSessionPhaseAction,
} from '../../actions';
import type {
  Answer,
  GameSession,
  Player,
  Question,
  Quiz,
} from '@/lib/types';
import QRCode from 'qrcode';

export function LiveConsole({
  session,
  quiz,
  questions,
  joinUrl,
}: {
  session: GameSession;
  quiz: Quiz;
  questions: Question[];
  joinUrl: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState(session.phase);
  const [qIdx, setQIdx] = useState(session.current_q_idx);
  const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(
    session.question_started_at
      ? new Date(session.question_started_at).getTime()
      : null,
  );
  const [players, setPlayers] = useState<Player[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [reactionBursts, setReactionBursts] = useState<
    Array<{ id: string; emoji: string; playerName: string; left: number; bottom: number }>
  >([]);
  const reactionTimers = useRef<number[]>([]);

  const current = questions[qIdx] ?? null;

  // ── QR
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 240, margin: 1 }).then(setQrSrc).catch(() => {});
  }, [joinUrl]);

  useEffect(
    () => () => {
      reactionTimers.current.forEach((id) => window.clearTimeout(id));
      reactionTimers.current = [];
    },
    [],
  );

  useEffect(() => {
    if (phase !== 'lobby') setReactionBursts([]);
  }, [phase]);

  function pushReaction(player: Player) {
    if (!player.reaction_emoji) return;

    const id = `${player.id}:${player.reaction_at ?? Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const left = 10 + Math.random() * 78;
    const bottom = 12 + Math.random() * 18;

    setReactionBursts((prev) => [
      ...prev,
      { id, emoji: player.reaction_emoji, playerName: player.name, left, bottom },
    ]);

    const timerId = window.setTimeout(() => {
      setReactionBursts((prev) => prev.filter((burst) => burst.id !== id));
      reactionTimers.current = reactionTimers.current.filter((existing) => existing !== timerId);
    }, 2000);
    reactionTimers.current.push(timerId);
  }

  // ── Realtime: players + answers + session
  useEffect(() => {
    const supabase = getSupabaseBrowser();

    // Initial fetch
    supabase
      .from('players')
      .select('*')
      .eq('session_id', session.id)
      .order('joined_at')
      .then(({ data }) => setPlayers((data ?? []) as Player[]));
    supabase
      .from('answers')
      .select('*')
      .eq('session_id', session.id)
      .then(({ data }) => setAnswers((data ?? []) as Answer[]));

    const channel = supabase
      .channel(`session:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPlayers((p) => [...p, payload.new as Player]);
          } else if (payload.eventType === 'UPDATE') {
            const next = payload.new as Player;
            const prev = payload.old as Player;
            if (next.reaction_emoji && next.reaction_at !== prev?.reaction_at && phase === 'lobby') {
              pushReaction(next);
            }
            setPlayers((p) => p.map((x) => (x.id === next.id ? next : x)));
          } else if (payload.eventType === 'DELETE') {
            setPlayers((p) => p.filter((x) => x.id !== (payload.old as Player).id));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'answers',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => setAnswers((a) => [...a, payload.new as Answer]),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const s = payload.new as GameSession;
          setPhase(s.phase);
          setQIdx(s.current_q_idx);
          setQuestionStartedAt(
            s.question_started_at ? new Date(s.question_started_at).getTime() : null,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id]);

  // ── Per-question countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== 'question') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  const elapsed = questionStartedAt ? Math.max(0, (now - questionStartedAt) / 1000) : 0;
  const remaining = current ? Math.max(0, current.duration - elapsed) : 0;
  const currentAnswers = current ? answers.filter((a) => a.question_id === current.id) : [];

  // Auto-advance to reveal when timer expires OR everyone has answered
  useEffect(() => {
    if (phase !== 'question' || !current) return;
    const allAnswered =
      players.length > 0 && currentAnswers.length >= players.length;
    if (remaining > 0 && !allAnswered) return;
    setSessionPhaseAction(session.id, 'reveal').catch(() => {});
  }, [phase, current, remaining, players.length, currentAnswers.length, session.id]);

  // Phase actions
  // Auto-advance from reveal → leaderboard after a 2s window so all players
  // see the correct answer + their points simultaneously.
  useEffect(() => {
    if (phase !== 'reveal') return;
    const t = setTimeout(() => {
      setSessionPhaseAction(session.id, 'leaderboard').catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [phase, session.id]);

  // Auto-advance the leaderboard after a short viewing window.
  useEffect(() => {
    if (phase !== 'leaderboard') return;
    const t = setTimeout(() => {
      nextQuestion().catch(() => {});
    }, 6000);
    return () => clearTimeout(t);
  }, [phase, qIdx, questions.length, session.id]);

  async function startQuestion(idx: number) {
    setQuestionStartedAt(Date.now());
    await setSessionPhaseAction(session.id, 'question', idx);
  }

  async function showLeaderboard() {
    await setSessionPhaseAction(session.id, 'leaderboard');
  }
  async function nextQuestion() {
    if (qIdx + 1 >= questions.length) {
      await setSessionPhaseAction(session.id, 'final');
    } else {
      await startQuestion(qIdx + 1);
    }
  }
  async function endGame() {
    await endSessionAction(session.id);
    router.push(`/admin/quiz/${quiz.id}/results?session=${session.id}`);
  }

  // Sorted scoreboard
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players],
  );

  return (
    <main className="max-w-[1180px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <Pill text={`Phase · ${phase}`} variant="info" />
          <h1 className="font-display text-3xl font-bold mt-2 tracking-tight">
            {quiz.title}
          </h1>
          <div className="text-dim text-sm">
            Room code{' '}
            <span className="font-mono font-bold text-text tracking-widest text-lg">
              {session.room_code}
            </span>
            <span className="mx-2">·</span>
            {players.length} player{players.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="danger" onClick={endGame}>
            End game
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <section className="border border-line rounded-2xl p-6 bg-white/[0.025] min-h-[420px]">
          {phase === 'lobby' && (
            <div className="relative">
              <LobbyView qrSrc={qrSrc} joinUrl={joinUrl} code={session.room_code}>
                <Button
                  size="lg"
                  disabled={players.length === 0}
                  onClick={() => startQuestion(0)}
                >
                  Start with {players.length} player
                  {players.length === 1 ? '' : 's'} →
                </Button>
              </LobbyView>

              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {reactionBursts.map((burst) => (
                  <div
                    key={burst.id}
                    className="absolute flex -translate-x-1/2 flex-col items-center animate-[floatReaction_2s_ease-out_forwards]"
                    style={{ left: `${burst.left}%`, bottom: `${burst.bottom}%` }}
                  >
                    <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white/90 shadow-[0_12px_28px_rgba(0,0,0,0.25)] backdrop-blur-sm">
                      {burst.playerName}
                    </div>
                    <div className="mt-2 text-3xl drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
                      {burst.emoji}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {phase === 'question' && current && (
            <QuestionView
              question={current}
              remaining={remaining}
              answeredCount={currentAnswers.length}
              totalCount={players.length}
              qIdx={qIdx}
              total={questions.length}
              onSkip={() => setSessionPhaseAction(session.id, 'reveal')}
            />
          )}
          {phase === 'reveal' && current && (
            <RevealView
              question={current}
              answers={currentAnswers}
              totalPlayers={players.length}
              onNext={showLeaderboard}
            />
          )}
          {phase === 'leaderboard' && (
            <LeaderboardView
              players={sorted}
              isLast={qIdx + 1 >= questions.length}
              onNext={nextQuestion}
            />
          )}
          {phase === 'final' && (
            <FinalView players={sorted} onClose={endGame} />
          )}
        </section>

        <aside className="border border-line rounded-2xl p-4 bg-white/[0.025]">
          <div className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase mb-3 px-1">
            Live scoreboard
          </div>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {sorted.length === 0 ? (
              <div className="text-dim text-sm px-1">Waiting for players…</div>
            ) : (
              sorted.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-2 py-2 rounded-xl bg-white/[0.03]"
                >
                  <span className="w-5 text-center text-xs font-bold text-dim">
                    {i + 1}
                  </span>
                  <Avatar id={p.avatar} size={28} />
                  <span className="text-sm font-medium flex-1 truncate">
                    {p.name}
                  </span>
                  <span className="font-mono text-sm font-bold">{p.score}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes floatReaction {
          0% { transform: translate3d(-50%, 16px, 0) scale(0.85); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translate3d(-50%, -110px, 0) scale(1.05); opacity: 0; }
        }
      `}</style>
    </main>
  );
}

// ────────────────────────────────────────────
function LobbyView({
  qrSrc,
  joinUrl,
  code,
  children,
}: {
  qrSrc: string | null;
  joinUrl: string;
  code: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center py-8">
      <div className="text-[11px] font-bold tracking-[0.18em] text-dim uppercase mb-3">
        Players · join now
      </div>
      <div className="font-display font-bold text-7xl tracking-[0.12em] mb-3">
        {code}
      </div>
      <div className="text-dim text-sm mb-6">
        On phone:{' '}
        <span className="font-mono text-text">{joinUrl.replace(/^https?:\/\//, '')}</span>
      </div>
      {qrSrc && (
        <img
          src={qrSrc}
          alt="QR"
          className="mx-auto mb-6 rounded-xl bg-white p-2"
          width={200}
          height={200}
        />
      )}
      <div>{children}</div>
    </div>
  );
}

function QuestionView({
  question,
  remaining,
  answeredCount,
  totalCount,
  qIdx,
  total,
  onSkip,
}: {
  question: Question;
  remaining: number;
  answeredCount: number;
  totalCount: number;
  qIdx: number;
  total: number;
  onSkip: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase">
          Question {qIdx + 1} of {total}
        </div>
        <div className="font-mono text-2xl font-bold text-[#5BD0FF]">
          {Math.ceil(remaining)}s
        </div>
      </div>
      <h2 className="font-display text-3xl font-bold leading-tight tracking-tight mb-6">
        {question.text}
      </h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {question.options.map((opt, i) => (
          <div
            key={i}
            className="border border-line rounded-xl p-4 bg-white/[0.03]"
          >
            <span className="text-[11px] font-bold tracking-[0.14em] text-dim mr-2">
              {String.fromCharCode(65 + i)}
            </span>
            {opt}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="text-dim text-sm">
          {answeredCount} of {totalCount} answered
        </div>
        <Button variant="ghost" onClick={onSkip}>
          Skip → reveal
        </Button>
      </div>
    </div>
  );
}

function RevealView({
  question,
  answers,
  totalPlayers,
  onNext,
}: {
  question: Question;
  answers: Answer[];
  totalPlayers: number;
  onNext: () => void;
}) {
  const counts = [0, 0, 0, 0];
  for (const a of answers) counts[a.choice]++;
  const max = Math.max(1, ...counts);

  return (
    <div>
      <div className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase mb-2">
        Answer reveal
      </div>
      <h2 className="font-display text-3xl font-bold mb-6 tracking-tight">
        {question.text}
      </h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {question.options.map((opt, i) => {
          const isRight = i === question.correct;
          return (
            <div
              key={i}
              className={`border rounded-xl p-4 ${
                isRight
                  ? 'border-[#2EC27E]/60 bg-[rgba(46,194,126,0.12)]'
                  : 'border-line bg-white/[0.02] opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="text-[11px] font-bold tracking-[0.14em] text-dim mr-2">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                </div>
                {isRight && (
                  <span className="text-[#2EC27E] font-bold text-xs">CORRECT</span>
                )}
              </div>
              <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${(counts[i] / max) * 100}%`,
                    background: isRight ? '#2EC27E' : '#A06BFF',
                  }}
                />
              </div>
              <div className="text-xs text-dim mt-1">
                {counts[i]} of {totalPlayers}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button onClick={onNext}>Show leaderboard →</Button>
      </div>
    </div>
  );
}

function LeaderboardView({
  players,
  isLast,
  onNext,
}: {
  players: Player[];
  isLast: boolean;
  onNext: () => void;
}) {
  return (
    <ResultsBoard
      players={players}
      eyebrow="Round results"
      title="Leaderboard"
      actionLabel={isLast ? 'Show final results →' : 'Next question →'}
      onAction={onNext}
    />
  );
}

function FinalView({
  players,
  onClose,
}: {
  players: Player[];
  onClose: () => void;
}) {
  return (
    <ResultsBoard
      players={players}
      eyebrow="Final results"
      title="🎉 That's a wrap!"
      actionLabel="Save & view full report"
      onAction={onClose}
      final
    />
  );
}

function ResultsBoard({
  players,
  eyebrow,
  title,
  actionLabel,
  onAction,
  final = false,
}: {
  players: Player[];
  eyebrow: string;
  title: string;
  actionLabel: string;
  onAction: () => void;
  final?: boolean;
}) {
  const top3 = players.slice(0, 3);
  const podium = [top3[1], top3[0], top3[2]].filter(Boolean) as Player[];
  const rankById = new Map(players.map((p, i) => [p.id, i + 1]));
  const rest = players.slice(3);

  return (
    <div className={final ? 'text-center py-3' : 'py-3'}>
      <div className="text-center mb-4">
        <div className="text-[11px] font-bold tracking-[0.18em] text-[#8D7DFF] uppercase">
          {eyebrow}
        </div>
        <h2 className="font-display text-4xl font-bold tracking-tight mt-1">{title}</h2>
      </div>

      {podium.length > 0 && (
        <div className="grid grid-cols-3 gap-2 items-end mb-4">
          {podium.map((p) => {
            const pRank = rankById.get(p.id) ?? 0;
            const isMe = false;
            const pedestalHeight = pRank === 1 ? 'h-24' : pRank === 2 ? 'h-20' : 'h-16';
            const glow =
              pRank === 1
                ? 'shadow-[0_0_24px_rgba(255,180,90,0.35)] border-[#FFAE4D]/60'
                : pRank === 2
                  ? 'shadow-[0_0_20px_rgba(140,120,255,0.35)] border-[#8B7BFF]/50'
                  : 'shadow-[0_0_20px_rgba(255,95,150,0.35)] border-[#FF5C9A]/50';
            const pedestalBg =
              pRank === 1
                ? 'bg-[linear-gradient(180deg,rgba(255,215,90,0.55),rgba(255,163,0,0.08))]'
                : pRank === 2
                  ? 'bg-[linear-gradient(180deg,rgba(214,218,238,0.45),rgba(112,121,160,0.08))]'
                  : 'bg-[linear-gradient(180deg,rgba(201,137,84,0.45),rgba(109,68,38,0.08))]';

            return (
              <div key={p.id} className="text-center">
                <div className="relative inline-flex">
                  {isMe && (
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-[0.14em] text-[#7CE2A9] uppercase">
                      You
                    </span>
                  )}
                  <div className={`rounded-2xl border ${glow} p-1 bg-[#121521]`}>
                    <Avatar id={p.avatar} size={56} />
                  </div>
                </div>
                <div className="mt-2 font-bold truncate px-1">{p.name}</div>
                <div className="font-mono text-[#5BD0FF] mb-2">{p.score}</div>
                <div className={`w-full ${pedestalHeight} rounded-t-xl flex items-center justify-center font-display font-bold text-2xl border border-white/10 ${pedestalBg}`}>
                  {pRank}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 ? (
        <div className="space-y-2 max-h-[36vh] overflow-y-auto pr-1 text-left">
          {rest.map((p) => {
            const pRank = rankById.get(p.id) ?? 0;
            const isMe = false;
            return (
              <div
                key={p.id}
                className={`rounded-2xl border px-3 py-2.5 flex items-center gap-3 ${
                  isMe
                    ? 'border-[#5BD0FF]/60 bg-[rgba(91,208,255,0.10)] shadow-[0_0_0_1px_rgba(91,208,255,0.2)]'
                    : 'border-line bg-white/[0.02]'
                }`}
              >
                <div className="w-5 text-center font-mono text-sm text-dim">{pRank}</div>
                <Avatar id={p.avatar} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                </div>
                <div className="font-mono font-bold text-sm">{p.score}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-white/[0.02] p-4 text-center text-dim text-sm">
          Waiting for more players on the board.
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button onClick={onAction} size={final ? 'lg' : 'md'}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
