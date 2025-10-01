import Fastify from "fastify";
import { Firestore } from "@google-cloud/firestore";
import { PubSub } from "@google-cloud/pubsub";
import { Storage } from "@google-cloud/storage";
import { createHashId, isoUtcNow, TemplateCode, AspectRatio } from "@banner/shared";

const storage = new Storage();
const firestore = new Firestore();
const pubsub = new PubSub();

const NANO_ENDPOINT = process.env.NANO_BANANA_ENDPOINT ?? "https://api.nano-banana.invalid";
// Gemini 切り替え用: GOOGLE_API_KEY がある場合はそれを優先（無ければ NANO_BANANA_API_KEY を流用）
const BG_PROVIDER = (process.env.BG_PROVIDER ?? "").toLowerCase();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.NANO_BANANA_API_KEY || "";
const API_KEY = process.env.NANO_BANANA_API_KEY ?? "";
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET ?? "banner-assets";
const COMPOSE_TOPIC = process.env.COMPOSE_TOPIC ?? "compose-tasks";
const STOCK_BUCKET = process.env.STOCK_BUCKET ?? "banner-stock-backgrounds";

interface BgTaskPayload {
  variant_id: string;
  campaign_id: string;
  template: TemplateCode;
  tone: "救済" | "緊急" | "権威";
  prompt: string;
  seed: string;
  refs?: string[];
  sizes: AspectRatio[];
  brand: string;
  slug: string;
  copy: {
    headline: string;
    sub?: string;
    badges?: string[];
    cta: string;
    disclaimer?: string;
    stat_note?: string;
  };
}

interface NanoBananaResponse {
  image_url: string;
  metadata: Record<string, unknown> & { seed_like?: string; prompt: string };
}

async function fetchBackgroundNano(payload: BgTaskPayload, attempt: number): Promise<NanoBananaResponse> {
  const res = await fetch(`${NANO_ENDPOINT}/bg/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      prompt: payload.prompt,
      refs: payload.refs,
      style: "photo",
      size: "1024x1024",
      seed: payload.seed
    })
  });

  if (!res.ok) {
    throw new Error(`nano banana request failed (${res.status}) attempt=${attempt}`);
  }

  return (await res.json()) as NanoBananaResponse;
}

async function fetchBackgroundGemini(payload: BgTaskPayload, attempt: number): Promise<{ buffer: Buffer; metadata: Record<string, unknown> }> {
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY (or NANO_BANANA_API_KEY) is required for Gemini background generation");
  }
  // Google AI API (Generative Language) REST 呼び出し
  const model = "gemini-2.5-flash-image-preview";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GOOGLE_API_KEY)}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: payload.prompt }]
      }
    ]
  };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gemini generateContent failed (${res.status}): ${text} attempt=${attempt}`);
  }
  const json = (await res.json()) as any;
  const candidates = json.candidates || [];
  const parts = candidates[0]?.content?.parts || [];
  const inline = parts.find((p: any) => p.inlineData || p.inline_data)?.inlineData || parts.find((p: any) => p.inline_data)?.inline_data;
  if (!inline?.data) {
    throw new Error("gemini response missing inline image data");
  }
  const buffer = Buffer.from(inline.data, "base64");
  const metadata = {
    provider: "gemini",
    model,
    prompt: payload.prompt,
    seed_like: payload.seed,
    refs: payload.refs ?? []
  } as const;
  return { buffer, metadata };
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`failed to download generated background ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function saveBackground(buffer: Buffer, path: string) {
  const file = storage.bucket(OUTPUT_BUCKET).file(path);
  await file.save(buffer, { contentType: "image/png" });
  return `gs://${OUTPUT_BUCKET}/${path}`;
}

async function saveMetadata(path: string, metadata: Record<string, unknown>) {
  const metaPath = path.replace(/\.png$/, ".json");
  const file = storage.bucket(OUTPUT_BUCKET).file(metaPath);
  await file.save(Buffer.from(JSON.stringify(metadata, null, 2)), { contentType: "application/json" });
  return `gs://${OUTPUT_BUCKET}/${metaPath}`;
}

async function fallbackBackground(): Promise<{ path: string; metadata: Record<string, unknown> }> {
  const [files] = await storage.bucket(STOCK_BUCKET).getFiles({ prefix: "default" });
  if (!files.length) {
    throw new Error("no fallback backgrounds available");
  }
  const file = files[Math.floor(Math.random() * files.length)];
  return { path: `gs://${STOCK_BUCKET}/${file.name}`, metadata: { fallback: true, file: file.name } };
}

async function publishComposeTasks(payload: BgTaskPayload, assetPath: string, metadataPath: string) {
  for (const size of payload.sizes) {
    await pubsub.topic(COMPOSE_TOPIC).publishMessage({
      json: {
        variant_id: payload.variant_id,
        campaign_id: payload.campaign_id,
        template: payload.template,
        tone: payload.tone,
        size,
        background_path: assetPath,
        background_meta_path: metadataPath,
        brand: payload.brand,
        slug: payload.slug,
        copy: payload.copy
      }
    });
  }
}

async function handleTask(payload: BgTaskPayload) {
  let lastError: unknown;
  const useGemini = BG_PROVIDER === "gemini" || (!!GOOGLE_API_KEY && (!process.env.NANO_BANANA_ENDPOINT || process.env.NANO_BANANA_ENDPOINT.includes("invalid")));
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let buffer: Buffer;
      let meta: Record<string, unknown> = {};
      if (useGemini) {
        const result = await fetchBackgroundGemini(payload, attempt);
        buffer = result.buffer;
        meta = result.metadata;
      } else {
        const response = await fetchBackgroundNano(payload, attempt);
        buffer = await downloadImage(response.image_url);
        meta = response.metadata;
      }
      const dateFragment = isoUtcNow().split("T")[0];
      const storagePath = `backgrounds/${payload.campaign_id}/${dateFragment}/${payload.variant_id}-${createHashId("bg", payload.seed, 8)}.png`;
      const assetPath = await saveBackground(buffer, storagePath);
      const metadataPath = await saveMetadata(storagePath, meta);

      await firestore.collection("variant").doc(payload.variant_id).update({
        bg_asset_path: assetPath,
        bg_meta_path: metadataPath,
        bg_generated_at: isoUtcNow(),
        updated_at: isoUtcNow()
      });

      await publishComposeTasks(payload, assetPath, metadataPath);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  const fallback = await fallbackBackground();
  await firestore.collection("variant").doc(payload.variant_id).update({
    bg_asset_path: fallback.path,
    bg_meta_path: null,
    bg_generated_at: isoUtcNow(),
    fallback: true
  });

  await publishComposeTasks(payload, fallback.path, "");

  throw lastError ?? new Error("background generation failed");
}

function decodeMessage(body: any): BgTaskPayload {
  if (!body?.message?.data) {
    throw new Error("Missing Pub/Sub message data");
  }
  const decoded = Buffer.from(body.message.data, "base64").toString("utf8");
  return JSON.parse(decoded) as BgTaskPayload;
}

export function buildServer() {
  const app = Fastify({ logger: true });

  app.post("/tasks/bg-generator", async (request, reply) => {
    try {
      const payload = decodeMessage(request.body);
      await handleTask(payload);
      return reply.status(204).send();
    } catch (err) {
      request.log.error({ err }, "failed to generate background");
      return reply.status(500).send({ error: "BG_GENERATION_FAILED", message: (err as Error).message });
    }
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 8080);
  buildServer()
    .listen({ port, host: "0.0.0.0" })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
