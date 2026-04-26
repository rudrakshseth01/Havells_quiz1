'use client';
import * as React from 'react';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  const base =
    'inline-flex items-center justify-center font-display font-bold tracking-wider rounded-xl transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed';
  const sz = size === 'lg' ? 'h-12 px-6 text-sm' : 'h-10 px-4 text-xs';
  let look = '';
  if (variant === 'primary') {
    look =
      'text-[#0A0B12] shadow-[0_10px_24px_rgba(160,107,255,0.35)] [background:linear-gradient(135deg,#A06BFF,#5BD0FF)]';
  } else if (variant === 'ghost') {
    look =
      'text-text border border-white/10 bg-white/[0.03] hover:border-white/30';
  } else {
    look = 'text-[#FF8E8E] border border-[#FF8E8E]/30 hover:bg-[#FF8E8E]/10';
  }
  return (
    <button className={`${base} ${sz} ${look} ${className}`} {...rest}>
      {children}
    </button>
  );
}
