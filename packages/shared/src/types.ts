import { z } from "zod";

export const InputSchema = z.object({
  lp_url: z.string().url(),
  brand_name: z.string().min(1),
  objective: z.enum(["獲得", "相談", "診断", "資料請求"]),
  target_note: z.string().min(1),
  pain_points: z.array(z.string().min(1)).max(3).nonempty(),
  value_props: z.array(z.string().min(1)).max(3).nonempty(),
  cta_type: z.string().min(1),
  brand_color_hex: z.string().regex(/^#([0-9A-Fa-f]{6})$/),
  logo_url: z.string().url(),
  forbidden_phrases: z.array(z.string()).optional(),
  reference_banners: z.array(z.string().url()).optional(),
  bg_style_refs: z.array(z.string().url()).optional(),
  stat_claim: z.string().optional(),
  stat_evidence_url: z.string().url().optional(),
  stat_note: z.string().optional(),
  disclaimer_code: z.string().optional(),
  tone: z.enum(["救済", "緊急", "権威"]).optional(),
  style_code: z.enum(["T1", "T2", "T3", "AUTO"]).default("AUTO"),
  pain_points_secondary: z.array(z.string()).max(2).optional(),
  value_props_secondary: z.array(z.string()).max(2).optional()
}).refine((data) => {
  if (data.stat_claim) {
    return Boolean(data.stat_note) && Boolean(data.stat_evidence_url);
  }
  return true;
}, {
  message: "stat_claim requires both stat_note and stat_evidence_url",
  path: ["stat_claim"]
});

export type CampaignInput = z.infer<typeof InputSchema>;

export const TemplateCode = z.enum(["T1", "T2", "T3"]);
export type TemplateCode = z.infer<typeof TemplateCode>;

export const AspectRatioSchema = z.enum([
  "1080x1080",
  "1080x1350",
  "1200x628",
  "1080x1920"
]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const RenderRequestSchema = z.object({
  campaign_id: z.string(),
  inputs: z.array(InputSchema),
  templates: z.array(TemplateCode),
  sizes: z.array(AspectRatioSchema),
  count_per_template: z.number().int().min(1).max(6),
  bg_mode: z.enum(["generate", "edit"]).default("generate")
});

export type RenderRequest = z.infer<typeof RenderRequestSchema>;

export const TemplateConfigSchema = z.object({
  template: TemplateCode,
  headline: z.string(),
  sub: z.string().optional(),
  cta: z.string(),
  badges: z.array(z.string()).optional(),
  safe_zone: z.number().default(48),
  colors: z.object({
    bg: z.string(),
    text: z.string(),
    accent: z.string()
  }),
  overlay: z.object({
    type: z.enum(["black", "white", "brand"]),
    opacity: z.number().min(0).max(1)
  }).optional(),
  disclaimer: z.string().optional(),
  layout_ref: z.string().optional()
});

export type TemplateConfig = z.infer<typeof TemplateConfigSchema>;

export const VariantSchema = z.object({
  variant_id: z.string(),
  template: TemplateCode,
  tone: z.enum(["救済", "緊急", "権威"]),
  style_code: z.enum(["T1", "T2", "T3"]),
  prompt_hash: z.string(),
  refs_hash: z.string().optional(),
  bg_asset_path: z.string().optional(),
  created_at: z.string()
});

export type VariantRecord = z.infer<typeof VariantSchema>;

export const RenderJobSchema = z.object({
  render_job_id: z.string(),
  variant_id: z.string(),
  size: AspectRatioSchema,
  status: z.enum(["pending", "running", "succeeded", "failed", "manual_review"]),
  qc_findings: z.array(z.string()).optional(),
  retries: z.number().int().min(0).default(0),
  updated_at: z.string()
});

export type RenderJobRecord = z.infer<typeof RenderJobSchema>;

export const QCReportSchema = z.object({
  render_job_id: z.string(),
  issues: z.array(z.object({
    code: z.string(),
    severity: z.enum(["warning", "error"]),
    message: z.string()
  })),
  passed: z.boolean(),
  generated_at: z.string()
});

export type QCReport = z.infer<typeof QCReportSchema>;

export const DeliveryMessageSchema = z.object({
  variant_id: z.string(),
  asset_path: z.string(),
  preview_url: z.string().url(),
  qc_report_path: z.string(),
  campaign_id: z.string(),
  template: TemplateCode,
  tone: z.enum(["救済", "緊急", "権威"]),
  size: AspectRatioSchema
});

export type DeliveryMessage = z.infer<typeof DeliveryMessageSchema>;
