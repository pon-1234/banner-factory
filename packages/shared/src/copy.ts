import type { CampaignInput, TemplateCode } from "./types";

const DISCLAIMER_MAP: Record<string, string> = {
  NO_GUARANTEE_OWNER_CHECK: "※復旧を保証するものではありません。対応可否は状況により異なります。正当な所有者確認が必要です。",
  RESULTS_VARY: "※成果には個人差があります。詳細はLPをご確認ください。"
};

export type CopyBlock = {
  headline: string;
  sub?: string;
  badges?: string[];
  cta: string;
  disclaimer?: string;
  stat_note?: string;
};

export function buildCopy(input: CampaignInput, template: TemplateCode): CopyBlock {
  const primaryPain = input.pain_points[0];
  const secondaryPain = input.pain_points[1];
  const primaryValue = input.value_props[0];
  const secondaryValue = input.value_props[1];

  const badges: string[] = [];
  if (primaryPain) badges.push(primaryPain);
  if (primaryValue) badges.push(primaryValue);
  if (secondaryPain) badges.push(secondaryPain);

  const cta = input.cta_type;

  const disclaimer = input.disclaimer_code ? DISCLAIMER_MAP[input.disclaimer_code] : undefined;
  const statNote = input.stat_note ?? undefined;

  switch (template) {
    case "T1":
      return {
        headline: `${primaryPain}の${input.brand_name}、諦めないで`,
        sub: `正当所有者確認の上で可否を最短判定。まずは${input.objective}から。`,
        badges,
        cta,
        disclaimer,
        stat_note: statNote
      };
    case "T2":
      return {
        headline: `「${primaryPain}」9割が知らない${primaryValue ?? "解決策"}`,
        sub: `${input.target_note}に向けた即日対応。${secondaryValue ?? "無料相談"}で伴走。`,
        badges,
        cta,
        disclaimer,
        stat_note: statNote
      };
    case "T3":
    default:
      return {
        headline: input.stat_claim ?? `${primaryValue ?? "専門家"}が伴走`,
        sub: `${primaryPain}を専門チームが支援。実例多数。`,
        badges,
        cta,
        disclaimer,
        stat_note: statNote
      };
  }
}
