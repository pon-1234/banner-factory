import Fastify from "fastify";
import { Firestore } from "@google-cloud/firestore";
import { PubSub } from "@google-cloud/pubsub";
import { Storage, type File, type SaveOptions } from "@google-cloud/storage";
import { createHashId, isoUtcNow, TemplateCode, AspectRatio } from "@banner/shared";
import crypto from "node:crypto";
import { PNG } from "pngjs";
import { GoogleGenAI } from "@google/genai";

const storage = new Storage();
const firestore = new Firestore();
const pubsub = new PubSub();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? "";
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET ?? "banner-assets";
const COMPOSE_TOPIC = process.env.COMPOSE_TOPIC ?? "compose-tasks";
const BG_MODEL = process.env.BG_MODEL ?? "gemini-2.5-flash-image-preview";

const genAiClient = new GoogleGenAI({ apiKey: GOOGLE_API_KEY || undefined });

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

async function generateGeminiBackground(
  payload: BgTaskPayload,
  attempt: number
): Promise<{ buffer: Buffer; metadata: Record<string, unknown> }> {
  const response = await genAiClient.models.generateContent({
    model: BG_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: payload.prompt }]
      }
    ]
  });

  const candidate = response.candidates?.[0];
  const parts = (candidate?.content?.parts ?? []) as Array<Record<string, unknown>>;
  const inline = parts.find((part) => Boolean((part as { inlineData?: unknown }).inlineData)) as
    | { inlineData: { data: string } }
    | undefined;

  if (!inline?.inlineData?.data) {
    throw new Error(`gemini response missing inline image data attempt=${attempt}`);
  }

  const buffer = Buffer.from(inline.inlineData.data, "base64");
  const metadata = {
    provider: "gemini",
    model: BG_MODEL,
    prompt: payload.prompt,
    seed_like: payload.seed,
    refs: payload.refs ?? []
  } as const;

  return { buffer, metadata };
}

async function saveBufferToGcs(
  file: File,
  buffer: Buffer,
  options: SaveOptions = {},
  attempt = 1
): Promise<void> {
  try {
    await file.save(buffer, { resumable: false, ...options });
  } catch (err) {
    const error = err as { code?: number } & Error;
    const code = error.code;
    const message = error.message ?? "";
    if (attempt < 6 && (code === 429 || code === 503 || message.includes("rateLimitExceeded"))) {
      const waitMs = attempt * 200;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      await saveBufferToGcs(file, buffer, options, attempt + 1);
      return;
    }
    throw err;
  }
}

async function saveBackground(buffer: Buffer, path: string) {
  const file = storage.bucket(OUTPUT_BUCKET).file(path);
  await saveBufferToGcs(file, buffer, { contentType: "image/png" });
  return `gs://${OUTPUT_BUCKET}/${path}`;
}

async function saveMetadata(path: string, metadata: Record<string, unknown>) {
  const metaPath = path.replace(/\.png$/, ".json");
  const file = storage.bucket(OUTPUT_BUCKET).file(metaPath);
  const payload = Buffer.from(JSON.stringify(metadata, null, 2));
  await saveBufferToGcs(file, payload, { contentType: "application/json" });
  return `gs://${OUTPUT_BUCKET}/${metaPath}`;
}

function createFallbackBuffer(seed: string): Buffer {
  const size = 1024;
  const png = new PNG({ width: size, height: size });
  const hash = crypto.createHash("sha256").update(seed).digest();
  const [rBase, gBase, bBase] = [hash[0], hash[1], hash[2]];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (size * y + x) << 2;
      const t = x / (size - 1 || 1);
      const r = Math.round(rBase * (1 - t) + gBase * t);
      const g = Math.round(gBase * (1 - t) + bBase * t);
      const b = Math.round(bBase * (1 - t) + rBase * t);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

async function fallbackBackground(payload: BgTaskPayload, lastError: unknown): Promise<{
  assetPath: string;
  metadataPath: string;
  metadata: Record<string, unknown>;
}> {
  const buffer = createFallbackBuffer(`${payload.variant_id}-${payload.seed}`);
  const dateFragment = isoUtcNow().split("T")[0];
  const storagePath = `backgrounds/${payload.campaign_id}/${dateFragment}/${payload.variant_id}-${createHashId(
    "fallback",
    payload.seed,
    8
  )}.png`;
  const metadata = {
    provider: "fallback",
    reason: lastError instanceof Error ? lastError.message : String(lastError ?? "unavailable"),
    seed: payload.seed
  } as const;
  const assetPath = await saveBackground(buffer, storagePath);
  const metadataPath = await saveMetadata(storagePath, metadata);
  return { assetPath, metadataPath, metadata };
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
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is required for Gemini background generation");
  }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { buffer, metadata: meta } = await generateGeminiBackground(payload, attempt);
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

  const fallback = await fallbackBackground(payload, lastError);
  await firestore.collection("variant").doc(payload.variant_id).update({
    bg_asset_path: fallback.assetPath,
    bg_meta_path: fallback.metadataPath,
    bg_generated_at: isoUtcNow(),
    updated_at: isoUtcNow(),
    fallback: true,
    fallback_reason: fallback.metadata.reason
  });

  await publishComposeTasks(payload, fallback.assetPath, fallback.metadataPath);

  return;
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
