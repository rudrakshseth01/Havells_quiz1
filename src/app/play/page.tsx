import { JoinClient } from './join-client';

export const dynamic = 'force-dynamic';

export default function PlayJoin({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  return <JoinClient prefilledCode={searchParams.code ?? ''} />;
}
