import type { InstalledSkill } from "@daize/contracts";
import { BlocksIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import {
  ClaudeAI,
  Gemini,
  GitHubIcon,
  MicrosoftIcon,
  OpenAI,
  VercelIcon,
} from "./components/Icons";

export function skillOriginIcon(
  originLabel: string | undefined,
): ComponentType<SVGProps<SVGSVGElement>> {
  const normalized = originLabel?.trim().toLowerCase();
  if (!normalized) {
    return BlocksIcon;
  }
  if (normalized.includes("anthropic") || normalized.includes("claude")) {
    return ClaudeAI;
  }
  if (normalized.includes("openai") || normalized.includes("codex")) {
    return OpenAI;
  }
  if (normalized.includes("vercel")) {
    return VercelIcon;
  }
  if (normalized.includes("microsoft") || normalized.includes("azure")) {
    return MicrosoftIcon;
  }
  if (normalized.includes("github")) {
    return GitHubIcon;
  }
  if (normalized.includes("google") || normalized.includes("gemini")) {
    return Gemini;
  }

  return BlocksIcon;
}

export function installedSkillsBySlug(
  skills: ReadonlyArray<InstalledSkill>,
): Map<string, InstalledSkill> {
  return new Map(skills.map((skill) => [skill.slug.trim().toLowerCase(), skill] as const));
}
