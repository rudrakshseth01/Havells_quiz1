/**
 * Shared TypeScript types — mirror of the Postgres schema.
 */

export type QuizStatus = 'draft' | 'scheduled' | 'live' | 'finished';
export type GamePhase =
  | 'lobby'
  | 'question'
  | 'reveal'
  | 'leaderboard'
  | 'final'
  | 'closed';

export interface User {
  id: string;
  name: string;
  designation: string;
  created_at: string;
}

export interface Quiz {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  status: QuizStatus;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  quiz_id: string;
  position: number;
  text: string;
  options: string[];
  correct: number;
  duration: number;
}

export interface GameSession {
  id: string;
  quiz_id: string;
  owner_id: string;
  room_code: string;
  phase: GamePhase;
  current_q_idx: number;
  question_started_at: string | null;
  created_at: string;
  ended_at: string | null;
}

export interface Player {
  id: string;
  session_id: string;
  name: string;
  avatar: string;
  score: number;
  reaction_emoji: string | null;
  reaction_at: string | null;
  joined_at: string;
}

export interface Answer {
  id: string;
  session_id: string;
  player_id: string;
  question_id: string;
  choice: number;
  ms: number;
  is_correct: boolean;
  points: number;
  created_at: string;
}
