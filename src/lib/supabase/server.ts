/**
 * Server-side Supabase clients.
 *
 * - getSupabaseServer()  → uses the SERVICE_ROLE key. Bypasses RLS.
 *                          Use ONLY in server actions / route handlers.
 *                          Never import into a client component.
 * - getSupabaseAnonServer() → uses the anon key from the server (when you
 *                              want RLS to apply but need server fetch).
 */
import 'server-only';
import { createClient } from '@supabase/supabase-js';

let _service: any = null;
export function getSupabaseServer() {
  if (_service) return _service;
  _service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return _service;
}

let _anon: any = null;
export function getSupabaseAnonServer() {
  if (_anon) return _anon;
  _anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return _anon;
}
