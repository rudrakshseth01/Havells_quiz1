import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <div className="inline-flex items-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-[22px] text-[#0A0B12]"
            style={{
              background: 'linear-gradient(135deg, #A06BFF, #5BD0FF)',
              boxShadow: '0 10px 30px rgba(160,107,255,0.45)',
            }}
          >
            Q
          </div>
          <span className="font-display font-bold text-2xl">
            Quiz<span className="text-[#A06BFF]">.</span>Live
          </span>
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-5">
          Live trivia for your team — built for the office, not the classroom.
        </h1>
        <p className="text-dim text-lg mb-10 max-w-lg mx-auto">
          Build quizzes, share a room code, and watch the scoreboard update in real time
          as everyone plays from their phone.
        </p>

        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/admin"
            className="h-12 px-6 rounded-xl font-display font-bold tracking-wider text-sm flex items-center justify-center text-[#0A0B12]"
            style={{
              background: 'linear-gradient(135deg, #A06BFF, #5BD0FF)',
              boxShadow: '0 10px 24px rgba(160,107,255,0.35)',
            }}
          >
            ADMIN CONSOLE →
          </Link>
          <Link
            href="/play"
            className="h-12 px-6 rounded-xl border border-white/10 text-text font-semibold text-sm flex items-center justify-center hover:border-white/30 transition"
          >
            JOIN A GAME
          </Link>
        </div>

        <p className="text-dim text-xs mt-8">
          Two surfaces · One platform · Realtime via Supabase
        </p>
      </div>
    </main>
  );
}
