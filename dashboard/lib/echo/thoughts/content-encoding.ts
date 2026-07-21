const META_MARKER = "\n\n[[echo-meta]]";

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
  if (!meta.context && !meta.possibleFormat) {
    return content;
  }

  return `${content}${META_MARKER}${JSON.stringify(meta)}`;
}

export function decodeThoughtContent(raw: string): DecodedThoughtContent {
  const markerIndex = raw.indexOf(META_MARKER);
  if (markerIndex === -1) {
    return { content: raw };
  }

  const content = raw.slice(0, markerIndex);
  const metaRaw = raw.slice(markerIndex + META_MARKER.length);

  try {
    const meta = JSON.parse(metaRaw) as ThoughtMeta;
    return {
      content,
      context: meta.context,
      possibleFormat: meta.possibleFormat,
    };
  } catch {
    return { content: raw };
  }
}
