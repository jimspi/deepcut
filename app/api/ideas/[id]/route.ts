import { NextRequest } from 'next/server';
import { getIdeaById, deleteIdea } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const idea = await getIdeaById(params.id);
    if (!idea) {
      return Response.json({ error: 'Idea not found' }, { status: 404 });
    }
    return Response.json({ idea });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = await deleteIdea(params.id);
    if (!deleted) {
      return Response.json({ error: 'Idea not found' }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred';
    return Response.json({ error: message }, { status: 500 });
  }
}
