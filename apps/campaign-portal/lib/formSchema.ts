import { InputSchema } from "@banner/shared/src/types";
import { z } from "zod";

export const CampaignInputSchema = InputSchema;

export type CampaignInput = z.infer<typeof CampaignInputSchema>;

export const MAX_ITEMS: Record<keyof Pick<CampaignInput, "pain_points" | "value_props" | "pain_points_secondary" | "value_props_secondary" | "forbidden_phrases" | "reference_banners" | "bg_style_refs">, number> = {
  pain_points: 3,
  value_props: 3,
  pain_points_secondary: 2,
  value_props_secondary: 2,
  forbidden_phrases: 6,
  reference_banners: 5,
  bg_style_refs: 5
};

export const OBJECTIVE_OPTIONS: CampaignInput["objective"][] = ["獲得", "相談", "診断", "資料請求"];

export const TONE_OPTIONS: CampaignInput["tone"][] = ["救済", "緊急", "権威"];

export const STYLE_CODE_OPTIONS: Array<{ value: CampaignInput["style_code"], label: string; description: string }> = [
  { value: "AUTO", label: "自動 (推奨)", description: "ブランド情報と目標に基づき最適なテンプレートを自動選択します" },
  { value: "T1", label: "T1", description: "救済系テンプレート" },
  { value: "T2", label: "緊急訴求テンプレート", description: "強い危機感を訴求し即時のアクションを促します" },
  { value: "T3", label: "権威訴求テンプレート", description: "実績や専門性を前面に出して安心感を与えます" }
];

export const FORBIDDEN_PRESETS = ["特定商法違反", "返金保証", "必ず", "100%", "完全" ];
