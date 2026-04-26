/**
 * Custom JWT-backed auth for admins.
 * Player UX uses a different model (name+room code, no password).
 */
import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { User } from '@/lib/types';

const COOKIE = 'quizlive_session';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

function secret() {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s) throw new Error('AUTH_JWT_SECRET is not set');
  return new TextEncoder().encode(s);
}

export async function signSession(user: { id: string; name: string }) {
  return await new SignJWT({ name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export async function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SEVEN_DAYS,
  });
}

export async function clearSessionCookie() {
  cookies().delete(COOKIE);
}

/**
 * Read the JWT from the cookie and re-fetch the user from the DB.
 * Returns null if no session, expired, or user no longer exists.
 */
export async function getSessionUser(): Promise<User | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  let payload;
  try {
    const v = await jwtVerify(token, secret());
    payload = v.payload;
  } catch {
    return null;
  }
  const id = payload.sub as string | undefined;
  if (!id) return null;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, designation, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as User;
}

export async function requireUser(): Promise<User> {
  const u = await getSessionUser();
  if (!u) throw new Error('UNAUTHENTICATED');
  return u;
}
