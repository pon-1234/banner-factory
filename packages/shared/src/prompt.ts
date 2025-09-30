import { TemplateCode, type CampaignInput } from "./types";
import crypto from "node:crypto";

type PromptContext = {
  template: TemplateCode;
  tone: "救済" | "緊急" | "権威";
  refs?: string[];
};

const TEMPLATE_PROMPTS: Record<TemplateCode, string> = {
  T1: `A smiling 50-60s Japanese business person in a bright modern office, floating bitcoin coins, shallow depth of field, photoreal, leave clean negative space at bottom-right for large Japanese text, square 1024x1024, no embedded text, editorial-safe`,
  T2: `Middle-aged Japanese person in a rainy neon city at night, worried expression, dynamic rain streaks and motion lines, dramatic rim light, keep large empty area at top for headline, square 1024x1024, no text`,
  T3: `Open steel vault with gold coins spilling, cinematic contrast on black, wide central negative space for big numbers, square 1024x1024, no text`
};

const TONE_OVERLAYS: Record<PromptContext["tone"], string> = {
  救済: "soft rim light, hopeful mood, gentle color temperature, expressive yet optimistic",
  緊急: "high contrast lighting, urgent atmosphere, rain intensity emphasized, cinematic lighting",
  権威: "dramatic lighting, premium look, gold accents, cinematic depth"
};

export function buildPrompt(input: CampaignInput, context: PromptContext): { prompt: string; seed: string } {
  const base = TEMPLATE_PROMPTS[context.template];
  const overlays = [TONE_OVERLAYS[context.tone]];
  if (context.refs?.length) {
    overlays.push(`blend reference styles from: ${context.refs.join(", ")}`);
  }
  if (input.bg_style_refs?.length) {
    overlays.push(`inspired by reference backgrounds: ${input.bg_style_refs.join(", ")}`);
  }
  const prompt = `${base}, ${overlays.join(", ")}`;
  const seedSource = `${input.lp_url}:${context.template}:${context.tone}:${input.style_code}:${input.brand_name}`;
  return {
    prompt,
    seed: crypto.createHash("sha256").update(seedSource).digest("hex").slice(0, 16)
  };
}
