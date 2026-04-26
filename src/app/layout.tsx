import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quiz.Live — Run live trivia for your team',
  description: 'Multiplayer quiz platform with real-time leaderboards.',
};

export const viewport: Viewport = {
  themeColor: '#0A0B12',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
