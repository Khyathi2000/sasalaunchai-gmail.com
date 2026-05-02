// Server-side SSE response helper. Used in route handlers (Node runtime).

export interface SSEController {
  send: (event: string, data: unknown) => void;
  close: () => void;
  isOpen: () => boolean;
}

/**
 * Build a `Response` whose body is a server-sent event stream.
 * The `produce` callback receives a controller. Call `send(event, data)` to
 * push events; call `close()` to end the stream.
 */
export function sseResponse(
  produce: (ctrl: SSEController, signal: AbortSignal) => Promise<void> | void,
): Response {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const ctrl: SSEController = {
        send(event, data) {
          if (closed) return;
          try {
            const payload =
              typeof data === "string" ? data : JSON.stringify(data);
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${payload}\n\n`),
            );
          } catch {
            closed = true;
          }
        },
        close() {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        },
        isOpen() {
          return !closed;
        },
      };

      const ac = new AbortController();
      Promise.resolve(produce(ctrl, ac.signal))
        .catch((err) => {
          ctrl.send("error", { message: err instanceof Error ? err.message : String(err) });
        })
        .finally(() => ctrl.close());
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
