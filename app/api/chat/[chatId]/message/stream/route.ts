import { NextRequest } from 'next/server';
import { resolveUserId } from '@/lib/auth-user';
import { streamToChat } from '@/lib/opencode/sessionManager';
import type { AgentStreamEvent } from '@/lib/opencode/gateway';

/**
 * POST /api/chat/{chatId}/message/stream   { text }
 *
 * Server-sent events version of the message endpoint. The blocking endpoint has
 * to wait for the entire agent run - every tool call and model turn - before the
 * browser sees anything, which is what made the assistant feel slow. This one
 * emits text as it is generated and names each tool step as it starts and ends.
 *
 * Event payloads (one JSON object per `data:` line):
 *   { type: 'text',  delta }                     incremental assistant text
 *   { type: 'step',  id, tool, title, status }   a tool call changing state
 *   { type: 'done',  reply, transcript }         run finished
 *   { type: 'error', message }                   run failed
 */
export async function POST(req: NextRequest, ctx: any) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const chatId = ctx.params?.chatId as string;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return new Response(JSON.stringify({ error: 'text is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Client went away mid-run; stop trying to write.
          closed = true;
        }
      };

      // Abandon the run if the browser disconnects, rather than streaming into a
      // closed socket for the rest of a long agent turn.
      req.signal?.addEventListener('abort', () => {
        closed = true;
      });

      try {
        const result = await streamToChat(
          userId,
          chatId,
          text,
          (event: AgentStreamEvent) => {
            // 'done' is re-sent below with the transcript attached.
            if (event.type !== 'done') send(event);
          },
          { createIfMissing: true }
        );

        send({
          type: 'done',
          reply: result.reply,
          sessionId: result.sessionId,
          transcript: result.transcript,
        });
      } catch (err: any) {
        console.error('Chat stream error:', err);
        send({
          type: 'error',
          message: err?.message || 'Failed to process chat message',
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx and similar proxies from buffering the stream into one blob.
      'X-Accel-Buffering': 'no',
    },
  });
}
