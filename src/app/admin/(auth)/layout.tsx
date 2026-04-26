import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="px-6 py-5 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-[15px] text-[#0A0B12]"
            style={{ background: 'linear-gradient(135deg,#A06BFF,#5BD0FF)' }}
          >
            Q
          </div>
          <span className="font-display font-bold tracking-tight">
            Quiz<span className="text-[#A06BFF]">.</span>Live
          </span>
        </Link>
        <Link
          href="/play"
          className="text-xs font-bold tracking-[0.14em] text-dim hover:text-text uppercase"
        >
          Join a game →
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}
