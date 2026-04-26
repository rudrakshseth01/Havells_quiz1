/**
 * Avatar character set — used by player join flow.
 * Visuals are simple SVG-friendly emoji shapes; we render them via CSS gradients
 * + an emoji glyph so we don't need image assets.
 */

export interface Character {
  id: string;
  name: string;
  emoji: string;
  bg: string; // gradient
}

export const CHARACTERS: Character[] = [
  { id: 'ninja',   name: 'Ninja',    emoji: '🥷', bg: 'linear-gradient(135deg,#1e1e2e,#3a3a5a)' },
  { id: 'wizard',  name: 'Wizard',   emoji: '🧙', bg: 'linear-gradient(135deg,#5b3aa3,#a06bff)' },
  { id: 'robot',   name: 'Robot',    emoji: '🤖', bg: 'linear-gradient(135deg,#2a4858,#5bd0ff)' },
  { id: 'cat',     name: 'Cat',      emoji: '🐱', bg: 'linear-gradient(135deg,#ff8a00,#ffd166)' },
  { id: 'panda',   name: 'Panda',    emoji: '🐼', bg: 'linear-gradient(135deg,#3a3a3a,#8d99ae)' },
  { id: 'fox',     name: 'Fox',      emoji: '🦊', bg: 'linear-gradient(135deg,#ff5e3a,#ff8a00)' },
  { id: 'penguin', name: 'Penguin',  emoji: '🐧', bg: 'linear-gradient(135deg,#1d3557,#5bd0ff)' },
  { id: 'unicorn', name: 'Unicorn',  emoji: '🦄', bg: 'linear-gradient(135deg,#ff6ec7,#a06bff)' },
  { id: 'dragon',  name: 'Dragon',   emoji: '🐉', bg: 'linear-gradient(135deg,#1a3c2e,#2ec27e)' },
  { id: 'alien',   name: 'Alien',    emoji: '👽', bg: 'linear-gradient(135deg,#0d3b66,#2ec27e)' },
  { id: 'ghost',   name: 'Ghost',    emoji: '👻', bg: 'linear-gradient(135deg,#23253a,#7d83ad)' },
  { id: 'pirate',  name: 'Pirate',   emoji: '🏴‍☠️', bg: 'linear-gradient(135deg,#5e1f1f,#c44536)' },
];

export const characterById = (id: string) =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
