import { AspectRatio, TemplateCode } from "./types";

interface PathParts {
  brand: string;
  campaignId: string;
  dateIso: string;
  template: TemplateCode;
  tone: "救済" | "緊急" | "権威";
  size: AspectRatio;
  variant: string;
  slug: string;
}

export function buildStoragePath(parts: PathParts): string {
  return `${parts.brand}/${parts.campaignId}/${parts.dateIso}/${parts.template}-${parts.tone}-${parts.size}-${parts.variant}_${parts.slug}.png`;
}
