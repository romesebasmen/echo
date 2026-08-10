const META_MARKER = "\n\n[[echo-meta]]";
const V2_PREFIX = "[[echo-thought:v2]]";

interface ThoughtMeta {
  context?: string;
  possibleFormat?: string;
}

interface DecodedThoughtContent {
  content: string;
  context?: string;
  possibleFormat?: string;
}

// The `thoughts` table only has a single `content` text column — there are
// no dedicated columns for context or possible format. Both are encoded into
// `content` behind a marker so the existing three-field Thought Inbox form
// can keep working without a schema migration.
export function encodeThoughtContent(content: string, meta: ThoughtMeta): string {
  return `${V2_PREFIX}${JSON.stringify({
    content,
    ...(meta.context ? { context: meta.context } : {}),
    ...(meta.possibleFormat ? { possibleFormat: meta.possibleFormat } : {}),
  })}`;
}

export function decodeThoughtContent(raw: string): DecodedThoughtContent {
  if (raw.startsWith(V2_PREFIX)) {
    const decoded = parseV2Envelope(raw.slice(V2_PREFIX.length));
    return decoded ?? { content: raw };
  }

  const markerIndex = raw.lastIndexOf(META_MARKER);
  if (markerIndex === -1) {
    return { content: raw };
  }

  const content = raw.slice(0, markerIndex);
  const metaRaw = raw.slice(markerIndex + META_MARKER.length);

  try {
    const meta = parseMeta(JSON.parse(metaRaw));
    if (!meta) {
      return { content: raw };
    }
    return {
      content,
      context: meta.context,
      possibleFormat: meta.possibleFormat,
    };
  } catch {
    return { content: raw };
  }
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseMeta(value: unknown): ThoughtMeta | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, ["context", "possibleFormat"])) {
    return null;
  }
  if (
    record.context !== undefined &&
    typeof record.context !== "string"
  ) {
    return null;
  }
  if (
    record.possibleFormat !== undefined &&
    typeof record.possibleFormat !== "string"
  ) {
    return null;
  }
  if (record.context === undefined && record.possibleFormat === undefined) {
    return null;
  }

  return {
    context: record.context as string | undefined,
    possibleFormat: record.possibleFormat as string | undefined,
  };
}

function parseV2Envelope(value: string): DecodedThoughtContent | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      !hasExactKeys(record, ["content", "context", "possibleFormat"]) ||
      typeof record.content !== "string" ||
      (record.context !== undefined && typeof record.context !== "string") ||
      (record.possibleFormat !== undefined &&
        typeof record.possibleFormat !== "string")
    ) {
      return null;
    }

    return {
      content: record.content,
      ...(record.context !== undefined
        ? { context: record.context as string }
        : {}),
      ...(record.possibleFormat !== undefined
        ? { possibleFormat: record.possibleFormat as string }
        : {}),
    };
  } catch {
    return null;
  }
}
