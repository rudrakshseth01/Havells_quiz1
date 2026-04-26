'use client';
import * as React from 'react';

interface Props {
  text: string;
  variant?: 'success' | 'warn' | 'info' | 'neutral';
}

const STYLES: Record<NonNullable<Props['variant']>, string> = {
  success:
    'bg-[rgba(46,194,126,0.12)] text-[#7CE2A9] border-[rgba(46,194,126,0.3)]',
  warn:
    'bg-[rgba(255,210,89,0.12)] text-[#FFD259] border-[rgba(255,210,89,0.3)]',
  info:
    'bg-[rgba(91,208,255,0.12)] text-[#5BD0FF] border-[rgba(91,208,255,0.3)]',
  neutral:
    'bg-white/[0.05] text-dim border-white/10',
};

export function Pill({ text, variant = 'neutral' }: Props) {
  return (
    <span
      className={`inline-flex items-center h-[22px] px-2 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase border ${STYLES[variant]}`}
    >
      {text}
    </span>
  );
}
