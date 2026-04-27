'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';
import {
  submitAnswerAction,
  fetchMyAnswerForRevealAction,
  sendLobbyEmojiAction,
} from '../actions';
import { LOBBY_EMOJIS } from '@/lib/reactions';
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
  const lobbyPlayers = useMemo(() => [player, ...otherPlayers], [player, otherPlayers]);
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
      .order('joined_at')
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
    return (
      <LobbyView
        player={player}
        players={lobbyPlayers}
        roomCode={session.room_code}
        quizTitle={quizTitle}
        onSendEmoji={async (emoji) => {
          await sendLobbyEmojiAction({
            sessionId: session.id,
            playerId: player.id,
            emoji,
          });
        }}
      />
    );
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
  return (
    <LobbyView
      player={player}
      players={lobbyPlayers}
      roomCode={session.room_code}
      quizTitle={quizTitle}
      onSendEmoji={async (emoji) => {
        await sendLobbyEmojiAction({
          sessionId: session.id,
          playerId: player.id,
          emoji,
        });
      }}
    />
  );
}

// ─── Phase views ────────────────────────────────────────────

function LobbyView({
  player,
  players,
  roomCode,
  quizTitle,
  onSendEmoji,
}: {
  player: Player;
  players: Player[];
  roomCode: string;
  quizTitle: string;
  onSendEmoji: (emoji: (typeof LOBBY_EMOJIS)[number]) => Promise<void>;
}) {
  const [bursts, setBursts] = useState<Array<{ id: string; emoji: string; left: number }>>([]);
  const burstTimers = useRef<number[]>([]);

  useEffect(
    () => () => {
      burstTimers.current.forEach((timerId) => window.clearTimeout(timerId));
      burstTimers.current = [];
    },
    [],
  );

  function triggerBurst(emoji: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const left = 14 + Math.random() * 72;

    setBursts((prev) => [...prev, { id, emoji, left }]);

    const timerId = window.setTimeout(() => {
      setBursts((prev) => prev.filter((burst) => burst.id !== id));
      burstTimers.current = burstTimers.current.filter((existing) => existing !== timerId);
    }, 1800);
    burstTimers.current.push(timerId);
  }

  return (
    <div className="min-h-[100svh] flex flex-col px-4 py-4 sm:px-6 sm:py-5">
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.24em] uppercase text-emerald-400">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.55)]" />
          Connected · waiting for host
        </div>

        <div>
          <h1 className="font-display text-[clamp(2.4rem,8vw,4.4rem)] font-bold tracking-tight">
            Lobby
          </h1>
          <p className="text-dim text-sm sm:text-base">
            {players.length} player{players.length === 1 ? '' : 's'} in the room
          </p>
        </div>

        <section className="relative flex-1 overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(160,107,255,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] sm:p-6">
          <div className="relative flex h-full min-h-[520px] flex-col gap-5">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {bursts.map((burst) => (
                <div
                  key={burst.id}
                  className="absolute flex -translate-x-1/2 flex-col items-center animate-[playerReaction_1.8s_ease-out_forwards]"
                  style={{ left: `${burst.left}%`, bottom: '20%' }}
                >
                  <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-semibold text-white/90 shadow-[0_12px_28px_rgba(0,0,0,0.25)] backdrop-blur-sm">
                    {player.name}
                  </div>
                  <div className="mt-2 text-3xl drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
                    {burst.emoji}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-dim">
                  Waiting room
                </div>
                <div className="mt-1 font-display text-lg font-bold text-text">
                  {quizTitle}
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 font-mono text-[10px] font-bold tracking-[0.28em] text-dim">
                {roomCode}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {players.map((p) => {
                const isMe = p.id === player.id;
                return (
                  <div
                    key={p.id}
                    className={`rounded-[24px] border p-3 text-center shadow-[0_12px_30px_rgba(0,0,0,0.18)] ${
                      isMe
                        ? 'border-[#A06BFF]/60 bg-[rgba(160,107,255,0.16)]'
                        : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    <div className="relative mx-auto w-fit">
                      <Avatar id={p.avatar} size={58} />
                      {isMe && (
                        <span className="absolute -right-2 -top-2 rounded-full border border-white/15 bg-[#A06BFF] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_6px_18px_rgba(160,107,255,0.4)]">
                          You
                        </span>
                      )}
                    </div>
                    <div className="mt-3 truncate font-semibold text-text">{p.name}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-dim">
                      {isMe ? 'Ready' : 'Joined'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-auto rounded-[24px] border border-white/10 bg-black/20 p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-dim">
                    Tap an emoji
                  </div>
                  <p className="mt-1 text-sm text-dim">
                    Admins can see it float up live with your name.
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-dim">
                  {players.length} here
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {LOBBY_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      triggerBurst(emoji);
                      void onSendEmoji(emoji);
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-2xl transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08] active:translate-y-0 active:scale-[0.98]"
                    aria-label={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <p className="pb-1 text-center text-[11px] text-dim">
          Tap an emoji — admins can see them float up live
        </p>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes playerReaction {
          0% { transform: translate3d(-50%, 18px, 0) scale(0.85); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translate3d(-50%, -108px, 0) scale(1.05); opacity: 0; }
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
