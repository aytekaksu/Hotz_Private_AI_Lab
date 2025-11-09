import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyAgentChatPage({ params }: { params: { agent: string; id: string } }) {
  redirect(`/agents/${params.agent}/${params.id}`);
}
