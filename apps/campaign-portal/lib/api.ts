import type { CampaignInput } from "./formSchema";

const INGEST_API_BASE_URL = process.env.NEXT_PUBLIC_INGEST_API_BASE_URL;

const DEFAULT_RENDER_OPTIONS = {
  templates: ["T1"],
  sizes: ["1080x1080"],
  count_per_template: 1,
  bg_mode: "generate" as const
};

class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface CreateCampaignResponse {
  campaign_id: string;
}

function sanitizeString(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function sanitizeStringArray(values: string[] | undefined): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const cleaned = values.map((item) => item.trim()).filter((item) => item.length > 0);
  return cleaned.length ? cleaned : undefined;
}

export function sanitizeCampaignInput(input: CampaignInput): CampaignInput {
  const next: Partial<CampaignInput> = { ...input };

  const optionalStringFields: Array<keyof CampaignInput> = [
    "lp_url",
    "logo_url",
    "stat_claim",
    "stat_evidence_url",
    "stat_note",
    "disclaimer_code",
    "tone"
  ];

  optionalStringFields.forEach((field) => {
    const value = typeof next[field] === "string" ? (next[field] as string) : undefined;
    const cleaned = sanitizeString(value);
    if (cleaned === undefined) {
      delete (next as Record<string, unknown>)[field];
    } else {
      (next as Record<string, unknown>)[field] = cleaned;
    }
  });

  const colorValue = typeof next.brand_color_hex === "string" ? next.brand_color_hex : undefined;
  const color = sanitizeString(colorValue);
  if (color) {
    next.brand_color_hex = color as CampaignInput["brand_color_hex"];
  } else {
    delete (next as Record<string, unknown>).brand_color_hex;
  }

  const optionalArrayFields: Array<keyof CampaignInput> = [
    "forbidden_phrases",
    "reference_banners",
    "bg_style_refs",
    "pain_points_secondary",
    "value_props_secondary"
  ];

  optionalArrayFields.forEach((field) => {
    const value = Array.isArray(next[field]) ? (next[field] as string[]) : undefined;
    const cleaned = sanitizeStringArray(value);
    if (!cleaned) {
      delete (next as Record<string, unknown>)[field];
    } else {
      (next as Record<string, unknown>)[field] = cleaned;
    }
  });

  const trimmedPainPoints = input.pain_points.map((item) => item.trim()).filter((item) => item.length > 0);
  next.pain_points = (trimmedPainPoints.length ? trimmedPainPoints : input.pain_points) as CampaignInput["pain_points"];

  const trimmedValueProps = input.value_props.map((item) => item.trim()).filter((item) => item.length > 0);
  next.value_props = (trimmedValueProps.length ? trimmedValueProps : input.value_props) as CampaignInput["value_props"];

  return next as CampaignInput;
}

export async function createCampaign(payload: CampaignInput): Promise<CreateCampaignResponse> {
  if (!INGEST_API_BASE_URL) {
    throw new ApiError("Ingest APIのエンドポイントが設定されていません。環境変数NEXT_PUBLIC_INGEST_API_BASE_URLを確認してください。");
  }

  const sanitized = sanitizeCampaignInput(payload);
  const res = await fetch(`${INGEST_API_BASE_URL}/v1/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sanitized)
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(body || "キャンペーンの作成に失敗しました", res.status);
  }

  const json = (await res.json()) as CreateCampaignResponse;
  return json;
}

export async function enqueueRenderRequest({
  campaignId,
  input,
  templates,
  sizes,
  countPerTemplate
}: {
  campaignId: string;
  input: CampaignInput;
  templates?: string[];
  sizes?: string[];
  countPerTemplate?: number;
}) {
  if (!INGEST_API_BASE_URL) {
    throw new ApiError("Ingest APIのエンドポイントが設定されていません。");
  }

  const sanitizedInput = sanitizeCampaignInput(input);
  const body = {
    inputs: [sanitizedInput],
    templates: templates && templates.length ? templates : DEFAULT_RENDER_OPTIONS.templates,
    sizes: sizes && sizes.length ? sizes : DEFAULT_RENDER_OPTIONS.sizes,
    count_per_template: countPerTemplate ?? DEFAULT_RENDER_OPTIONS.count_per_template,
    bg_mode: DEFAULT_RENDER_OPTIONS.bg_mode
  };

  const res = await fetch(`${INGEST_API_BASE_URL}/v1/campaigns/${campaignId}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const message = await res.text();
    throw new ApiError(message || "レンダーリクエストの送信に失敗しました", res.status);
  }

  return res.json().catch(() => undefined);
}

export async function fetchCampaignStatus(campaignId: string) {
  if (!INGEST_API_BASE_URL) {
    throw new ApiError("Ingest APIのエンドポイントが設定されていません。");
  }
  const res = await fetch(`${INGEST_API_BASE_URL}/v1/campaigns/${campaignId}`);
  if (!res.ok) {
    throw new ApiError(`キャンペーンの取得に失敗しました (${res.status})`, res.status);
  }
  return res.json();
}

export interface CampaignProgressResponse {
  campaign: Record<string, unknown>;
  variants: Array<{
    variant_id: string;
    template: string;
    tone: string;
    style_code: string;
    prompt?: string;
    prompt_hash?: string;
    seed?: string;
    refs: string[];
    brand: string;
    slug: string;
    copy: Record<string, unknown> | null;
    sizes: string[];
    renders: Array<{
      size: string;
      status: string;
      asset_path: string | null;
      asset_url: string | null;
      preview_path: string | null;
      preview_url: string | null;
      generation_meta_path: string | null;
      qc_passed: boolean;
      qc_report_path: string | null;
      qc_issues: Array<{ code: string; severity: string; message: string }>;
      queued_at: string | null;
      processing_started_at: string | null;
      composited_at: string | null;
      qc_completed_at: string | null;
      delivered_at: string | null;
      updated_at: string | null;
    }>;
  }>;
  summary: {
    total_variants: number;
    total_renders: number;
    delivered: number;
    qc_blocked: number;
  };
}

export async function fetchCampaignProgress(campaignId: string): Promise<CampaignProgressResponse> {
  if (!INGEST_API_BASE_URL) {
    throw new ApiError("Ingest APIのエンドポイントが設定されていません。");
  }
  const res = await fetch(`${INGEST_API_BASE_URL}/v1/campaigns/${campaignId}/progress`);
  if (!res.ok) {
    throw new ApiError(`進捗情報の取得に失敗しました (${res.status})`, res.status);
  }
  return res.json() as Promise<CampaignProgressResponse>;
}

export interface CampaignListItem {
  campaign_id: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  render_variant_count?: number;
  last_render_request_at?: string;
  input?: Record<string, unknown>;
}

export interface CampaignListResponse {
  campaigns: CampaignListItem[];
  next_cursor: string | null;
}

export async function fetchCampaignList(params?: { cursor?: string; limit?: number }): Promise<CampaignListResponse> {
  if (!INGEST_API_BASE_URL) {
    throw new ApiError("Ingest APIのエンドポイントが設定されていません。");
  }

  const searchParams = new URLSearchParams();
  if (params?.cursor) {
    searchParams.set("cursor", params.cursor);
  }
  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }

  const url = `${INGEST_API_BASE_URL}/v1/campaigns${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiError(`キャンペーン一覧の取得に失敗しました (${res.status})`, res.status);
  }
  return res.json() as Promise<CampaignListResponse>;
}

export async function logSubmission(event: { campaignId: string; payload: CampaignInput }) {
  try {
    await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
  } catch (err) {
    console.error("Failed to log submission", err);
  }
}
