import { CampaignInput } from "./formSchema";

export type FieldKey = keyof CampaignInput;

type FieldType = "text" | "textarea" | "select" | "tag" | "url" | "color";

export interface FieldConfig {
  key: FieldKey;
  label: string;
  placeholder?: string;
  helperText?: string;
  tooltip?: string;
  optional?: boolean;
  type: FieldType;
  options?: Array<{ label: string; value: string; description?: string }>;
  maxItems?: number;
  isUrlPreview?: boolean;
}

export const FIELD_CONFIG: Record<FieldKey, FieldConfig> = {
  lp_url: {
    key: "lp_url",
    label: "LP URL",
    placeholder: "https://",
    helperText: "最終的な遷移先のURLを入力してください",
    type: "url"
  },
  brand_name: {
    key: "brand_name",
    label: "ブランド名",
    placeholder: "例: CoinAssist",
    type: "text"
  },
  objective: {
    key: "objective",
    label: "キャンペーンの目的",
    type: "select"
  },
  target_note: {
    key: "target_note",
    label: "ターゲットメモ",
    placeholder: "ターゲット像や課題、利用シーンなどを詳しく記載",
    type: "textarea"
  },
  pain_points: {
    key: "pain_points",
    label: "主要な課題",
    placeholder: "Enterで追加 (最大3件)",
    helperText: "ユーザーが抱える主要な課題を短く入力。Enterでタグ化されます。",
    type: "tag"
  },
  value_props: {
    key: "value_props",
    label: "価値提案",
    placeholder: "Enterで追加 (最大3件)",
    helperText: "訴求したい価値・メリットを入力してください",
    type: "tag"
  },
  cta_type: {
    key: "cta_type",
    label: "CTAテキスト",
    placeholder: "例: 無料で相談する",
    type: "text"
  },
  brand_color_hex: {
    key: "brand_color_hex",
    label: "ブランドカラー",
    helperText: "16進数カラーコード (#付き)",
    type: "color"
  },
  logo_url: {
    key: "logo_url",
    label: "ロゴ画像URL",
    placeholder: "https://",
    type: "url"
  },
  forbidden_phrases: {
    key: "forbidden_phrases",
    label: "NGワード",
    placeholder: "NGワードを入力しEnter",
    helperText: "レギュレーションで禁止されている表現を登録します",
    tooltip: "プリセットから選択もできます",
    type: "tag",
    optional: true
  },
  reference_banners: {
    key: "reference_banners",
    label: "参考バナーURL",
    placeholder: "https://",
    helperText: "イメージに近いバナーがあればURLを入力",
    optional: true,
    type: "tag"
  },
  bg_style_refs: {
    key: "bg_style_refs",
    label: "背景スタイル参考URL",
    placeholder: "https://",
    helperText: "背景の参考画像があればURLで指定",
    optional: true,
    type: "tag"
  },
  stat_claim: {
    key: "stat_claim",
    label: "実績・数値訴求",
    placeholder: "例: 復旧成功率97.8%",
    helperText: "数値実績を記載する場合は根拠と注記も必要です",
    optional: true,
    type: "text"
  },
  stat_evidence_url: {
    key: "stat_evidence_url",
    label: "実績の根拠URL",
    placeholder: "https://",
    helperText: "公開可能なエビデンスのURLを入力",
    optional: true,
    type: "url"
  },
  stat_note: {
    key: "stat_note",
    label: "注釈",
    placeholder: "例: ※2023年/実績n=345 ...",
    helperText: "数値訴求の前提条件を記載",
    optional: true,
    type: "textarea"
  },
  disclaimer_code: {
    key: "disclaimer_code",
    label: "ディスクレーマーコード",
    optional: true,
    placeholder: "例: NO_GUARANTEE_OWNER_CHECK",
    helperText: "社内で管理しているコードを入力",
    type: "text"
  },
  tone: {
    key: "tone",
    label: "推奨トーン",
    optional: true,
    helperText: "未指定の場合はテンプレートに応じて自動決定されます",
    type: "select"
  },
  style_code: {
    key: "style_code",
    label: "テンプレート指定",
    optional: true,
    helperText: "AUTOの場合は最適なテンプレートを自動選択します",
    type: "select"
  },
  pain_points_secondary: {
    key: "pain_points_secondary",
    label: "補足課題",
    optional: true,
    placeholder: "Enterで追加 (最大2件)",
    helperText: "サブ訴求に使用する課題を入力",
    type: "tag"
  },
  value_props_secondary: {
    key: "value_props_secondary",
    label: "補足価値提案",
    optional: true,
    placeholder: "Enterで追加 (最大2件)",
    helperText: "代替案や補足価値を入力",
    type: "tag"
  }
};
