import { TemplateCode, type CampaignInput } from "./types";
import crypto from "node:crypto";

type PromptContext = {
  template: TemplateCode;
  tone: "救済" | "緊急" | "権威";
  refs?: string[];
};

const TEMPLATE_PROMPTS: Record<TemplateCode, string> = {
  T1: `Elegant Japanese business professional in a bright modern office, confident smile, bitcoin motif accents, cinematic lighting, polished advertisement aesthetic`,
  T2: `Determined Japanese person in a neon-soaked city at night, dramatic rain streaks, sense of urgency, moody cinematic contrast, street photography realism`,
  T3: `Luxurious open steel vault with gold coins spilling, strong chiaroscuro lighting, premium financial brand atmosphere, high-contrast hero shot`
};

const LAYOUT_INSTRUCTION =
  "Design as a high-end Japanese digital advertisement. Integrate provided copy with crisp, legible typography, balanced hierarchy, and clean margins. Avoid inventing additional text beyond the supplied lines.";

const TONE_OVERLAYS: Record<PromptContext["tone"], string> = {
  救済: "soft rim light, hopeful mood, gentle color temperature, expressive yet optimistic",
  緊急: "high contrast lighting, urgent atmosphere, rain intensity emphasized, cinematic lighting",
  権威: "dramatic lighting, premium look, gold accents, cinematic depth"
};

export function buildPrompt(input: CampaignInput, context: PromptContext): { prompt: string; seed: string } {
  const base = TEMPLATE_PROMPTS[context.template];
  const overlays = [LAYOUT_INSTRUCTION, TONE_OVERLAYS[context.tone]];
  if (context.refs?.length) {
    overlays.push(`blend reference styles from: ${context.refs.join(", ")}`);
  }
  if (input.bg_style_refs?.length) {
    overlays.push(`inspired by reference backgrounds: ${input.bg_style_refs.join(", ")}`);
  }
  if (input.brand_color_hex) {
    overlays.push(`brand palette highlighting ${input.brand_color_hex}`);
  } else {
    overlays.push("use harmonious brand-safe color palette");
  }
  overlays.push(`speak to audience: ${input.target_note}`);
  const prompt = `${base}, ${overlays.join(", ")}`;
  const seedSource = `${input.lp_url ?? input.brand_name}:${context.template}:${context.tone}:${input.style_code}:${input.brand_name}`;
  return {
    prompt,
    seed: crypto.createHash("sha256").update(seedSource).digest("hex").slice(0, 16)
  };
}
