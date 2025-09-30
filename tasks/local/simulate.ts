import { buildPrompt, InputSchema } from "@banner/shared";

const sample = {
  lp_url: "https://example.com/coin-recovery",
  brand_name: "CoinAssist",
  objective: "相談",
  target_note: "40-60代の暗号資産保有者。誤送金/ウォレット凍結に困っている層。",
  pain_points: ["誤送金", "アクセス不能", "開けないウォレット"],
  value_props: ["無料相談", "成功報酬", "最短提案"],
  cta_type: "無料で相談する",
  brand_color_hex: "#F7931A",
  logo_url: "https://assets.example.com/logo.png",
  stat_claim: "復旧成功率97.8%",
  stat_evidence_url: "https://assets.example.com/evidence.pdf",
  stat_note: "※2023-2024年/実案件n=345/自社定義の成功を復旧可否で算出",
  disclaimer_code: "NO_GUARANTEE_OWNER_CHECK",
  tone: "緊急",
  style_code: "AUTO"
};

const parsed = InputSchema.parse(sample);

const prompt = buildPrompt(parsed, {
  template: "T1",
  tone: "緊急"
});

console.log(prompt);
