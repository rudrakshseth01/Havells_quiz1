'use client';
import { CHARACTERS, characterById } from '@/lib/characters';

interface Props {
  id: string;
  size?: number;
}

export function Avatar({ id, size = 40 }: Props) {
  const c = characterById(id);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: c.bg,
        fontSize: size * 0.55,
      }}
      className="rounded-full flex items-center justify-center shrink-0"
      aria-label={c.name}
    >
      <span style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }}>
        {c.emoji}
      </span>
    </div>
  );
}

export { CHARACTERS };
