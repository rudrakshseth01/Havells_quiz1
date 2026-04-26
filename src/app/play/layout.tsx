import Link from 'next/link';

export default function PlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="px-5 py-4 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center font-display font-bold text-[13px] text-[#0A0B12]"
            style={{ background: 'linear-gradient(135deg,#A06BFF,#5BD0FF)' }}
          >
            Q
          </div>
          <span className="font-display font-bold text-sm tracking-tight">
            Quiz<span className="text-[#A06BFF]">.</span>Live
          </span>
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center px-5 py-6">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}
