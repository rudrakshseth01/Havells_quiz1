'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import {
  clearSessionCookie,
  setSessionCookie,
  signSession,
  requireUser,
} from '@/lib/auth';

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export async function signUpAction(form: FormData): Promise<AuthResult> {
  const name = String(form.get('name') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const designation = String(form.get('designation') ?? '').trim();

  if (name.length < 2) return { ok: false, error: 'Please enter your name.' };
  if (password.length < 4)
    return { ok: false, error: 'Password must be at least 4 characters.' };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc('create_user', {
    p_name: name,
    p_password: password,
    p_designation: designation,
  });

  if (error) {
    if (String(error.message).includes('username_taken')) {
      return { ok: false, error: 'That name is already taken. Try signing in.' };
    }
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }

  const user = data as { id: string; name: string };
  const token = await signSession(user);
  await setSessionCookie(token);
  return { ok: true };
}

export async function signInAction(form: FormData): Promise<AuthResult> {
  const name = String(form.get('name') ?? '').trim();
  const password = String(form.get('password') ?? '');

  if (!name || !password)
    return { ok: false, error: 'Enter your name and password.' };

  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc('verify_user', {
    p_name: name,
    p_password: password,
  });
  if (error) return { ok: false, error: 'Something went wrong. Try again.' };
  if (!data) return { ok: false, error: 'Wrong name or password.' };

  const user = data as { id: string; name: string };
  const token = await signSession(user);
  await setSessionCookie(token);
  return { ok: true };
}

export async function signOutAction() {
  await clearSessionCookie();
  redirect('/admin/sign-in');
}

export async function changePasswordAction(form: FormData): Promise<AuthResult> {
  const current = String(form.get('current') ?? '');
  const next = String(form.get('next') ?? '');
  if (next.length < 4)
    return { ok: false, error: 'New password must be at least 4 characters.' };

  const me = await requireUser();
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc('change_password', {
    p_user_id: me.id,
    p_current: current,
    p_new: next,
  });
  if (error) return { ok: false, error: 'Something went wrong.' };
  if (!data) return { ok: false, error: 'Current password is incorrect.' };
  return { ok: true };
}
