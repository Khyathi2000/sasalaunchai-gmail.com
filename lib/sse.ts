"use client";

// Client-side SSE helpers — typed React hook + POST streaming reader.

import { useEffect, useRef } from "react";

export type SSEHandler = Record<string, (data: unknown) => void>;

/**
 * Subscribe to an SSE endpoint via EventSource. Re-runs when `url` changes.
 * Pass `null` for `url` to disable.
 */
export function useEventStream(
  url: string | null,
  handlers: SSEHandler,
  deps: unknown[] = [],
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);

    const wrappers: { name: string; fn: (e: MessageEvent) => void }[] = [];
    for (const eventName of Object.keys(handlersRef.current)) {
      const fn = (e: MessageEvent) => {
        let parsed: unknown = e.data;
        try { parsed = JSON.parse(e.data); } catch { /* leave as string */ }
        handlersRef.current[eventName]?.(parsed);
      };
      es.addEventListener(eventName, fn as EventListener);
      wrappers.push({ name: eventName, fn });
    }

    es.onerror = () => {
      handlersRef.current["error"]?.({ message: "stream error" });
    };

    return () => {
      for (const { name, fn } of wrappers) {
        es.removeEventListener(name, fn as EventListener);
      }
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
}

/**
 * Error thrown when a POST stream call gets a non-streaming HTTP error
 * response. `body` holds the parsed JSON body when present, so callers can
 * branch on `body.error` codes (e.g. `github_not_connected`).
 */
export class StreamHttpError extends Error {
  constructor(
    public status: number,
    public body: { error?: string; message?: string; [k: string]: unknown } | null,
    url: string,
  ) {
    super(`POST ${url} failed: ${status}${body?.error ? ` (${body.error})` : ""}`);
    this.name = "StreamHttpError";
  }
}

/**
 * One-shot POST that returns a streamed response (for endpoints that take a
 * body and stream back). Browsers cannot use EventSource for POST, so we
 * decode the SSE wire format manually.
 */
export async function postEventStream(
  url: string,
  body: unknown,
  handlers: SSEHandler,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let parsed: { error?: string; message?: string } | null = null;
    try { parsed = await res.json(); } catch { /* non-JSON body */ }
    throw new StreamHttpError(res.status, parsed, url);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;

      let parsed: unknown = data;
      try { parsed = JSON.parse(data); } catch { /* leave string */ }
      handlers[event]?.(parsed);
    }
  }
}
