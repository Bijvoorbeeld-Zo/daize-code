import {
  INLINE_TERMINAL_CONTEXT_PLACEHOLDER,
  type TerminalContextDraft,
} from "./lib/terminalContext";
import type { InstalledSkill } from "@daize/contracts";

export type ComposerPromptSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "mention";
      path: string;
    }
  | {
      type: "skill";
      slug: string;
      skill: InstalledSkill | null;
    }
  | {
      type: "terminal-context";
      context: TerminalContextDraft | null;
    };

const MENTION_TOKEN_REGEX = /(^|\s)@([^\s@]+)(?=\s)/g;
const SKILL_TOKEN_REGEX = /(^|\s)\$((?=[a-z0-9-]*[a-z])[a-z0-9][a-z0-9-]*)(?=\s)/gi;

function pushTextSegment(segments: ComposerPromptSegment[], text: string): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.type === "text") {
    last.text += text;
    return;
  }
  segments.push({ type: "text", text });
}

function splitPromptTextIntoComposerSegments(text: string): ComposerPromptSegment[] {
  const segments: ComposerPromptSegment[] = [];
  if (!text) {
    return segments;
  }

  let cursor = 0;
  for (const match of text.matchAll(MENTION_TOKEN_REGEX)) {
    const fullMatch = match[0];
    const prefix = match[1] ?? "";
    const path = match[2] ?? "";
    const matchIndex = match.index ?? 0;
    const mentionStart = matchIndex + prefix.length;
    const mentionEnd = mentionStart + fullMatch.length - prefix.length;

    if (mentionStart > cursor) {
      pushTextSegment(segments, text.slice(cursor, mentionStart));
    }

    if (path.length > 0) {
      segments.push({ type: "mention", path });
    } else {
      pushTextSegment(segments, text.slice(mentionStart, mentionEnd));
    }

    cursor = mentionEnd;
  }

  if (cursor < text.length) {
    pushTextSegment(segments, text.slice(cursor));
  }

  return segments;
}

function splitPromptTextIntoComposerSegmentsWithSkills(
  text: string,
  skillsBySlug: ReadonlyMap<string, InstalledSkill>,
): ComposerPromptSegment[] {
  const textSegments = splitPromptTextIntoComposerSegments(text);
  if (textSegments.length === 0) {
    return textSegments;
  }

  const segments: ComposerPromptSegment[] = [];
  for (const segment of textSegments) {
    if (segment.type !== "text") {
      segments.push(segment);
      continue;
    }

    let cursor = 0;
    for (const match of segment.text.matchAll(SKILL_TOKEN_REGEX)) {
      const fullMatch = match[0];
      const prefix = match[1] ?? "";
      const slug = (match[2] ?? "").toLowerCase();
      const skill = skillsBySlug.get(slug) ?? null;
      const matchIndex = match.index ?? 0;
      const skillStart = matchIndex + prefix.length;
      const skillEnd = skillStart + fullMatch.length - prefix.length;

      if (skillStart > cursor) {
        pushTextSegment(segments, segment.text.slice(cursor, skillStart));
      }

      segments.push({ type: "skill", slug, skill });

      cursor = skillEnd;
    }

    if (cursor < segment.text.length) {
      pushTextSegment(segments, segment.text.slice(cursor));
    }
  }

  return segments;
}

export function splitPromptIntoComposerSegments(
  prompt: string,
  terminalContexts: ReadonlyArray<TerminalContextDraft> = [],
  installedSkills: ReadonlyArray<InstalledSkill> = [],
): ComposerPromptSegment[] {
  if (!prompt) {
    return [];
  }

  const segments: ComposerPromptSegment[] = [];
  let textCursor = 0;
  let terminalContextIndex = 0;
  const skillsBySlug = new Map(
    installedSkills.map((skill) => [skill.slug.trim().toLowerCase(), skill] as const),
  );

  for (let index = 0; index < prompt.length; index += 1) {
    if (prompt[index] !== INLINE_TERMINAL_CONTEXT_PLACEHOLDER) {
      continue;
    }

    if (index > textCursor) {
      segments.push(
        ...splitPromptTextIntoComposerSegmentsWithSkills(
          prompt.slice(textCursor, index),
          skillsBySlug,
        ),
      );
    }
    segments.push({
      type: "terminal-context",
      context: terminalContexts[terminalContextIndex] ?? null,
    });
    terminalContextIndex += 1;
    textCursor = index + 1;
  }

  if (textCursor < prompt.length) {
    segments.push(
      ...splitPromptTextIntoComposerSegmentsWithSkills(prompt.slice(textCursor), skillsBySlug),
    );
  }

  return segments;
}
