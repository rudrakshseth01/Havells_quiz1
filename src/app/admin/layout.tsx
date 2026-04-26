import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { signOutAction } from './(auth)/actions';
import { Avatar } from '@/components/ui/Avatar';

export const dynamic = 'force-dynamic';

export default async function AdminGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Don't gate the (auth) routes — Next picks the right layout per route group.
  // This layout only wraps everything UNDER /admin that isn't in (auth).
  const me = await getSessionUser();
  if (!me) redirect('/admin/sign-in');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-[#0A0B12]/60 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1180px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/admin" className="inline-flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-[15px] text-[#0A0B12]"
              style={{ background: 'linear-gradient(135deg,#A06BFF,#5BD0FF)' }}
            >
              Q
            </div>
            <span className="font-display font-bold tracking-tight">
              Quiz<span className="text-[#A06BFF]">.</span>Live
            </span>
            <span className="text-[10px] font-bold tracking-[0.18em] text-dim border border-line px-1.5 py-0.5 rounded ml-1.5">
              ADMIN
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold leading-tight">{me.name}</div>
              {me.designation && (
                <div className="text-[11px] text-dim leading-tight">
                  {me.designation}
                </div>
              )}
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-sm text-[#0A0B12]"
              style={{ background: 'linear-gradient(135deg,#A06BFF,#5BD0FF)' }}
            >
              {me.name.slice(0, 1).toUpperCase()}
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-xs font-bold tracking-[0.14em] text-dim hover:text-text uppercase"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
