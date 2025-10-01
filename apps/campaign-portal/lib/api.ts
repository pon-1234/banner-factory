import type { CampaignInput } from "./formSchema";

const INGEST_API_BASE_URL = process.env.NEXT_PUBLIC_INGEST_API_BASE_URL;

class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ApiError";
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
