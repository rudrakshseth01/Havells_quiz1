/**
 * Browser-side Supabase client. Uses the anon key. RLS applies.
 * Used for: realtime subscriptions, player-side reads/writes.
 */
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as any;
}
