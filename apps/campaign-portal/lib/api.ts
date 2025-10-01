import type { CampaignInput } from "./formSchema";

const INGEST_API_BASE_URL = process.env.NEXT_PUBLIC_INGEST_API_BASE_URL;

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

export async function createCampaign(payload: CampaignInput): Promise<CreateCampaignResponse> {
  if (!INGEST_API_BASE_URL) {
    throw new ApiError("Ingest APIのエンドポイントが設定されていません。環境変数NEXT_PUBLIC_INGEST_API_BASE_URLを確認してください。");
  }

  const res = await fetch(`${INGEST_API_BASE_URL}/v1/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(body || "キャンペーンの作成に失敗しました", res.status);
  }

  const json = (await res.json()) as CreateCampaignResponse;
  return json;
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
