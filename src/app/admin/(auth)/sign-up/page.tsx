'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { signUpAction } from '../actions';

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await signUpAction(form);
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
      <h1 className="font-display text-3xl font-bold mb-1">Create account</h1>
      <p className="text-dim mb-8 text-sm">
        Spin up your admin console in under a minute.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="qz-label">Full name</label>
          <input
            name="name"
            autoFocus
            required
            className="qz-input"
            placeholder="e.g. Rohit Agarwal"
          />
        </div>
        <div>
          <label className="qz-label">Designation</label>
          <input
            name="designation"
            className="qz-input"
            placeholder="e.g. People Ops Manager"
          />
        </div>
        <div>
          <label className="qz-label">Password</label>
          <input
            name="password"
            type="password"
            required
            className="qz-input"
            placeholder="At least 4 characters"
          />
        </div>
        {error && <div className="text-[#FF8E8E] text-sm">{error}</div>}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="text-dim text-sm mt-6 text-center">
        Already have one?{' '}
        <Link href="/admin/sign-in" className="text-[#5BD0FF] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
