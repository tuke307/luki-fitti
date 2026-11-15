import { docsLlms } from '@/lib/docs/source';

export const dynamic = 'force-static';

export async function GET() {
  return new Response(await docsLlms.index(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
