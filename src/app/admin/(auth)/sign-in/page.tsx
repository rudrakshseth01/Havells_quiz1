'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { signInAction } from '../actions';

export default function SignInPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await signInAction(form);
      if (!res.ok) {
        setError(res.error ?? 'Something went wrong.');
        return;
      }
      router.push('/admin');
      router.refresh();
    });
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-1">Welcome back</h1>
      <p className="text-dim mb-8 text-sm">
        Sign in to your admin console to manage your quizzes.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="qz-label">Name</label>
          <input
            name="name"
            autoFocus
            autoComplete="username"
            required
            className="qz-input"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="qz-label">Password</label>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="qz-input"
            placeholder="••••••••"
          />
        </div>
        {error && (
          <div className="text-[#FF8E8E] text-sm">{error}</div>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="text-dim text-sm mt-6 text-center">
        New here?{' '}
        <Link href="/admin/sign-up" className="text-[#5BD0FF] hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
