import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const SENSITIVE_KEY_PATTERNS = [
  /authorization/i,
  /cookie/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /supabase/i,
  /password/i,
  /prompt/i,
  /message/i,
  /messages/i,
  /chat/i,
  /archive/i,
  /library/i,
  /rag/i,
  /context/i,
  /excerpt/i,
  /source/i,
  /content/i,
  /body/i,
  /text/i,
];

function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[Redacted: depth limit]";

  if (typeof value === "string") {
    if (value.length > 180) return "[Redacted: long string]";
    return value;
  }

  if (!value || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => redactObject(item, depth + 1));
  }

  const output: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      output[key] = "[Redacted]";
    } else {
      output[key] = redactObject(childValue, depth + 1);
    }
  }

  return output;
}

export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Never send request payloads, headers, cookies, or query/body data.
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url,
    };
  }

  // Remove user identity details. We can add a safe internal ID later if needed.
  delete event.user;

  // Strip breadcrumbs because console/network breadcrumbs may contain House content.
  delete event.breadcrumbs;

  // Scrub custom contexts, tags, and extras.
  if (event.contexts) {
    event.contexts = redactObject(event.contexts) as ErrorEvent["contexts"];
  }

  if (event.extra) {
    event.extra = redactObject(event.extra) as ErrorEvent["extra"];
  }

  if (event.tags) {
    event.tags = redactObject(event.tags) as ErrorEvent["tags"];
  }

  return event;
}
