import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return Response.json(
    {
      error: 'Notion OAuth callback disabled. Configure the integration secret from Settings instead.',
    },
    { status: 410 }
  );
}
