'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';
import {
  submitAnswerAction,
  fetchMyAnswerForRevealAction,
} from '../actions';
import type {
  GameSession,
  Player,
  Question,
} from '@/lib/types';

interface AnswerRow {
  question_id: string;
  choice: number;
  is_correct: boolean;
  points: number;
  correct_index: number;
}

const CHOICE_COLORS = ['#FF6B6B', '#5BD0FF', '#FFD259', '#7CE2A9'];

export function GameClient({
  session: initialSession,
  player: initialPlayer,
  quizTitle,
  questions,
}: {
  session: GameSession;
  player: Player;
  quizTitle: string;
  questions: Question[];
}) {
  const [session, setSession] = useState(initialSession);
  const [player, setPlayer] = useState(initialPlayer);
  const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
  // Map of question_id -> { choice } (locked-in marker, no scoring info)
  const [lockedChoices, setLockedChoices] = useState<Map<string, number>>(new Map());
  // Map of question_id -> { is_correct, points } populated only when phase >= reveal
  const [revealedAnswers, setRevealedAnswers] = useState<Map<string, AnswerRow>>(new Map());

  // ── Subscriptions
  useEffect(() => {
    const supabase = getSupabaseBrowser();

    // Initial fetch of other players + my prior answers
    supabase
      .from('players')
      .select('*')
      .eq('session_id', session.id)
      .then(({ data }) => {
        setOtherPlayers(((data ?? []) as Player[]).filter((p) => p.id !== player.id));
      });
    // Only fetch our own choice (no scoring info) — used to detect "already locked in"
    supabase
      .from('answers')
      .select('question_id, choice')
      .eq('player_id', player.id)
      .then(({ data }) => {
        const map = new Map<string, number>();
        for (const a of (data ?? []) as Array<{ question_id: string; choice: number }>)
          map.set(a.question_id, a.choice);
        setLockedChoices(map);
      });

    const channel = supabase
      .channel(`play:${session.id}:${player.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => setSession(payload.new as GameSession),
      )
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
            const p = payload.new as Player;
            if (p.id === player.id) setPlayer(p);
            else setOtherPlayers((prev) => [...prev, p]);
          } else if (payload.eventType === 'UPDATE') {
            const p = payload.new as Player;
            if (p.id === player.id) setPlayer(p);
            else
              setOtherPlayers((prev) =>
                prev.map((x) => (x.id === p.id ? p : x)),
              );
          }
        },
      )
      // NOTE: no subscription to `answers` for this player — we don't want
      // is_correct/points reaching the browser before the host's reveal phase.
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id, player.id]);

  // ── Render by phase
  const current = questions[session.current_q_idx] ?? null;

  if (session.phase === 'lobby') {
    return <LobbyView player={player} quizTitle={quizTitle} otherCount={otherPlayers.length + 1} />;
  }
  if (session.phase === 'question' && current) {
    return (
      <QuestionView
        question={current}
        startedAt={session.question_started_at}
        lockedChoice={lockedChoices.get(current.id) ?? null}
        sessionId={session.id}
        playerId={player.id}
        onLocked={(choice) =>
          setLockedChoices((m) => {
            const next = new Map(m);
            next.set(current.id, choice);
            return next;
          })
        }
      />
    );
  }
  if (session.phase === 'reveal' && current) {
    return (
      <RevealView
        question={current}
        sessionId={session.id}
        playerId={player.id}
        revealed={revealedAnswers.get(current.id) ?? null}
        onRevealed={(a) =>
          setRevealedAnswers((m) => {
            const next = new Map(m);
            next.set(current.id, a);
            return next;
          })
        }
        currentScore={player.score}
      />
    );
  }
  if (session.phase === 'leaderboard') {
    const all = [...otherPlayers, player].sort((a, b) => b.score - a.score);
    const myRank = all.findIndex((p) => p.id === player.id) + 1;
    return (
      <LeaderboardView
        me={player}
        players={all}
        rank={myRank}
        total={all.length}
        eyebrow="Live standings"
        title="Leaderboard"
      />
    );
  }
  if (session.phase === 'final' || session.phase === 'closed') {
    const all = [...otherPlayers, player].sort((a, b) => b.score - a.score);
    const myRank = all.findIndex((p) => p.id === player.id) + 1;
    return (
      <LeaderboardView
        me={player}
        players={all}
        rank={myRank}
        total={all.length}
        eyebrow="Final standings"
        title="Leaderboard"
      />
    );
  }
  return <LobbyView player={player} quizTitle={quizTitle} otherCount={otherPlayers.length + 1} />;
}

// ─── Phase views ────────────────────────────────────────────

function LobbyView({
  player,
  quizTitle,
  otherCount,
}: {
  player: Player;
  quizTitle: string;
  otherCount: number;
}) {
  return (
    <div className="text-center">
      <Avatar id={player.avatar} size={92} />
      <h1 className="font-display text-2xl font-bold mt-4 tracking-tight">
        You're in, {player.name}!
      </h1>
      <p className="text-dim text-sm mt-2 mb-8">
        Quiz: <span className="text-text">{quizTitle}</span>
      </p>
      <div className="border border-line rounded-2xl p-6 bg-white/[0.025]">
        <div className="text-[11px] font-bold tracking-[0.18em] text-dim uppercase mb-2">
          Waiting for host
        </div>
        <div className="font-display font-bold text-xl">
          {otherCount} player{otherCount === 1 ? '' : 's'} ready
        </div>
        <div className="flex gap-1 mt-4 justify-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-[#A06BFF]"
              style={{
                animation: `bounce 1.4s ${i * 0.2}s infinite ease-in-out`,
              }}
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function QuestionView({
  question,
  startedAt,
  lockedChoice,
  sessionId,
  playerId,
  onLocked,
}: {
  question: Question;
  startedAt: string | null;
  lockedChoice: number | null;
  sessionId: string;
  playerId: string;
  onLocked: (choice: number) => void;
}) {
  const start = startedAt ? new Date(startedAt).getTime() : Date.now();
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [localChoice, setLocalChoice] = useState<number | null>(lockedChoice);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const elapsedMs = Math.max(0, now - start);
  const remaining = Math.max(0, question.duration - elapsedMs / 1000);
  const expired = remaining <= 0;
  const isLocked = lockedChoice !== null || localChoice !== null;

  async function pick(choice: number) {
    if (isLocked || submitting || expired) return;
    setLocalChoice(choice);
    setSubmitting(true);
    try {
      const res = await submitAnswerAction({
        sessionId,
        playerId,
        questionId: question.id,
        choice,
        ms: Math.round(elapsedMs),
      });
      if (res.ok) onLocked(choice);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLocked) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-4">✓</div>
        <h2 className="font-display text-2xl font-bold mb-2 tracking-tight">
          Answer locked
        </h2>
        <p className="text-dim">
          Hang tight — your result will be revealed when the round ends.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase">
          Tap to answer
        </span>
        <span className="font-mono text-xl font-bold text-[#5BD0FF]">
          {Math.ceil(remaining)}s
        </span>
      </div>
      <h2 className="font-display text-xl font-bold leading-tight tracking-tight mb-6">
        {question.text}
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {question.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => pick(i)}
            disabled={expired}
            className="text-left rounded-2xl px-4 py-4 font-medium text-[#0A0B12] disabled:opacity-50"
            style={{ background: CHOICE_COLORS[i] }}
          >
            <span className="text-[11px] font-bold tracking-[0.14em] mr-2 opacity-70">
              {String.fromCharCode(65 + i)}
            </span>
            {opt}
          </button>
        ))}
      </div>
      {expired && (
        <div className="text-dim text-sm text-center mt-4">
          Time's up. Wait for the reveal.
        </div>
      )}
    </div>
  );
}

function RevealView({
  question,
  sessionId,
  playerId,
  revealed,
  onRevealed,
  currentScore,
}: {
  question: Question;
  sessionId: string;
  playerId: string;
  revealed: AnswerRow | null;
  onRevealed: (a: AnswerRow) => void;
  currentScore: number;
}) {
  const [loading, setLoading] = useState(!revealed);

  useEffect(() => {
    if (revealed) return;
    let alive = true;
    fetchMyAnswerForRevealAction({
      sessionId,
      playerId,
      questionId: question.id,
    })
      .then((a) => {
        if (!alive) return;
        if (a) onRevealed(a as AnswerRow);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [sessionId, playerId, question.id, revealed, onRevealed]);

  const right = revealed?.correct_index ?? null;
  const isRight = revealed?.is_correct ?? false;
  const points = revealed?.points ?? 0;
  const didNotAnswer = !loading && !revealed;

  return (
    <div className="text-center py-6">
      <div className="text-6xl mb-3">
        {loading ? '⏳' : isRight ? '🎉' : didNotAnswer ? '⏱️' : '💔'}
      </div>
      <h2 className="font-display text-3xl font-bold mb-1 tracking-tight">
        {loading
          ? 'Revealing…'
          : isRight
            ? 'Correct!'
            : didNotAnswer
              ? 'Too slow'
              : 'Not quite'}
      </h2>
      {isRight && (
        <p className="text-[#5BD0FF] font-mono text-lg mb-4">+{points} pts</p>
      )}
      <div className="border border-line rounded-2xl p-4 bg-white/[0.025] text-left mt-6">
        <div className="text-[11px] font-bold tracking-[0.14em] text-dim uppercase mb-2">
          Correct answer
        </div>
        <div className="font-medium">
          {right === null ? 'Answer unavailable' : question.options[right]}
        </div>
      </div>
      <div className="text-dim text-sm mt-6">
        Total score ·{' '}
        <span className="text-text font-mono font-bold">{currentScore}</span>
      </div>
    </div>
  );
}

function LeaderboardView({
  me,
  players,
  rank,
  total,
  eyebrow,
  title,
}: {
  me: Player;
  players: Player[];
  rank: number;
  total: number;
  eyebrow: string;
  title: string;
}) {
  const podium = players.slice(0, 3);
  const orderedPodium = [podium[1], podium[0], podium[2]].filter(Boolean) as Player[];
  const rankById = new Map(players.map((p, i) => [p.id, i + 1]));
  const rest = players.slice(3);

  return (
    <div className="py-3">
      <div className="text-center mb-4">
        <div className="text-[11px] font-bold tracking-[0.18em] text-[#8D7DFF] uppercase">
          {eyebrow}
        </div>
        <h2 className="font-display text-4xl font-bold tracking-tight mt-1">{title}</h2>
      </div>

      {orderedPodium.length > 0 && (
        <div className="grid grid-cols-3 gap-2 items-end mb-4">
          {orderedPodium.map((p) => {
            const pRank = rankById.get(p.id) ?? 0;
            const isMe = p.id === me.id;
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
                    <Avatar id={p.avatar} size={54} />
                  </div>
                </div>
                <div className="mt-1.5 font-semibold text-sm leading-tight truncate">{p.name}</div>
                <div className="font-mono font-bold text-[#FFD259] leading-tight">{p.score}</div>
                <div className={`mt-2 rounded-t-xl ${pedestalHeight} ${pedestalBg} border border-white/10 flex items-center justify-center font-display text-3xl font-bold`}>
                  {pRank}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 ? (
        <div className="space-y-2 max-h-[36vh] overflow-y-auto pr-1">
          {rest.map((p) => {
            const pRank = rankById.get(p.id) ?? 0;
            const isMe = p.id === me.id;
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
                  <div className="text-sm font-semibold truncate">
                    {p.name}
                    {isMe && <span className="text-[#5BD0FF] text-xs ml-1.5">(You)</span>}
                  </div>
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

      <div className="mt-4 text-center text-dim text-sm">
        Your position · <span className="font-mono text-text font-bold">#{rank}</span> of{' '}
        <span className="font-mono text-text font-bold">{total}</span>
      </div>
    </div>
  );
}
