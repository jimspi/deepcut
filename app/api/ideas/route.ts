import { NextRequest } from 'next/server';
import { getAllIdeas } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const ideas = await getAllIdeas(search);
    return Response.json({ ideas });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return Response.json({ error: message }, { status: 500 });
  }
}
