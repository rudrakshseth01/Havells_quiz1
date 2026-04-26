'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { CHARACTERS, Avatar } from '@/components/ui/Avatar';
import { joinAction } from './actions';

export function JoinClient({ prefilledCode }: { prefilledCode: string }) {
  const [step, setStep] = useState<'code' | 'name' | 'avatar'>(prefilledCode ? 'name' : 'code');
  const [code, setCode] = useState(prefilledCode.toUpperCase());
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState(CHARACTERS[0].id);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitJoin() {
    setError(null);
    const fd = new FormData();
    fd.set('code', code);
    fd.set('name', name);
    fd.set('avatar', avatarId);
    startTransition(async () => {
      const res = await joinAction(fd);
      if (!res.ok) setError(res.error ?? 'Could not join.');
      // success → server-side redirect
    });
  }

  if (step === 'code') {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold mb-1 tracking-tight">
          Got a room code?
        </h1>
        <p className="text-dim mb-8 text-sm">
          Your host shared a 6-letter code on the screen.
        </p>
        <input
          autoFocus
          inputMode="text"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="ENTER CODE"
          className="qz-input text-center font-display font-bold text-2xl tracking-[0.4em] mb-5"
          style={{ height: 64 }}
        />
        <Button
          size="lg"
          className="w-full"
          disabled={code.length < 4}
          onClick={() => setStep('name')}
        >
          Next →
        </Button>
      </div>
    );
  }

  if (step === 'name') {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold mb-1 tracking-tight">
          What's your name?
        </h1>
        <p className="text-dim mb-8 text-sm">
          This is what'll appear on the leaderboard.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 24))}
          placeholder="Your name"
          className="qz-input mb-5"
          style={{ height: 56, fontSize: 18 }}
        />
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setStep('code')}
          >
            ←
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={!name.trim()}
            onClick={() => setStep('avatar')}
          >
            Pick avatar →
          </Button>
        </div>
      </div>
    );
  }

  // avatar
  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-1 tracking-tight">
        Pick your avatar
      </h1>
      <p className="text-dim mb-6 text-sm">
        Tap one to choose. You'll be playing as <strong>{name}</strong> in room{' '}
        <span className="font-mono">{code}</span>.
      </p>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            onClick={() => setAvatarId(c.id)}
            className={`p-2 rounded-xl border-2 transition ${
              avatarId === c.id
                ? 'border-[#A06BFF] bg-[rgba(160,107,255,0.12)]'
                : 'border-transparent hover:bg-white/[0.04]'
            }`}
          >
            <Avatar id={c.id} size={56} />
            <div className="text-[10px] mt-1 text-dim">{c.name}</div>
          </button>
        ))}
      </div>
      {error && <div className="text-[#FF8E8E] text-sm mb-3">{error}</div>}
      <div className="flex gap-2">
        <Button variant="ghost" size="lg" onClick={() => setStep('name')}>
          ←
        </Button>
        <Button
          size="lg"
          className="flex-1"
          disabled={pending}
          onClick={submitJoin}
        >
          {pending ? 'Joining…' : 'Join game →'}
        </Button>
      </div>
    </div>
  );
}
