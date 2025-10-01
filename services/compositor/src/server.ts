import Fastify, { type FastifyBaseLogger } from "fastify";
import { Firestore } from "@google-cloud/firestore";
import { Storage, type File, type SaveOptions } from "@google-cloud/storage";
import { PubSub } from "@google-cloud/pubsub";
import { createCanvas, loadImage, registerFont, type CanvasRenderingContext2D } from "canvas";
import OpenAI from "openai";
import { AspectRatio, TemplateCode, buildStoragePath, isoUtcNow } from "@banner/shared";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const fontDir = path.join(__dirname, "../fonts");
const boldFontPath = path.join(fontDir, "NotoSansJP-Bold.otf");
const regularFontPath = path.join(fontDir, "NotoSansJP-Regular.otf");

void (async () => {
  try {
    const [boldExists, regularExists] = await Promise.all([
      fs.stat(boldFontPath).then(() => true).catch(() => false),
      fs.stat(regularFontPath).then(() => true).catch(() => false)
    ]);
    if (boldExists) {
      registerFont(boldFontPath, { family: "NotoSansJP", weight: "bold" });
    }
    if (regularExists) {
      registerFont(regularFontPath, { family: "NotoSansJP", weight: "normal" });
    }
  } catch {
    // Fonts remain optional for local development.
  }
})();

const firestore = new Firestore();
const storage = new Storage();
const pubsub = new PubSub();

const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET ?? "banner-assets";
const QC_TOPIC = process.env.QC_TOPIC ?? "qc-tasks";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
const OPENAI_IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY ?? "high";

const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const SIZE_MAP: Record<AspectRatio, { width: number; height: number }> = {
  "1080x1080": { width: 1080, height: 1080 },
  "1080x1350": { width: 1080, height: 1350 },
  "1200x628": { width: 1200, height: 628 },
  "1080x1920": { width: 1080, height: 1920 }
};

const OPENAI_SIZE_HINT: Record<AspectRatio, string> = {
  "1080x1080": "1024x1024",
  "1080x1350": "1024x1536",
  "1200x628": "1536x1024",
  "1080x1920": "1024x1792"
};

interface CopyPayload {
  headline: string;
  sub?: string;
  badges?: string[];
  cta: string;
  disclaimer?: string;
  stat_note?: string;
}

interface ComposeTaskPayload {
  variant_id: string;
  campaign_id: string;
  template: TemplateCode;
  tone: "救済" | "緊急" | "権威";
  size: AspectRatio;
  prompt: string;
  seed: string;
  brand: string;
  slug: string;
  copy: CopyPayload;
}

interface GenerationMetadata {
  provider: string;
  model?: string;
  request_size?: string;
  original_prompt?: string;
  final_prompt?: string;
  copy_lines?: string[];
  guidance_lines?: string[];
  fallback_reason?: string;
}

interface ComposeResult {
  buffer: Buffer;
  metadata: GenerationMetadata;
}

function splitGcsPath(gcsPath: string): { bucket: string; object: string } {
  const match = gcsPath.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`invalid GCS path: ${gcsPath}`);
  }
  return { bucket: match[1], object: match[2] };
}

function collectCopyLines(copy: CopyPayload): string[] {
  const lines = [`Headline: ${copy.headline}`];
  if (copy.sub) {
    lines.push(`Subheadline: ${copy.sub}`);
  }
  if (copy.badges?.length) {
    lines.push(`Badge text: ${copy.badges.join(" | ")}`);
  }
  lines.push(`Call to action: ${copy.cta}`);
  if (copy.disclaimer) {
    lines.push(`Disclaimer: ${copy.disclaimer}`);
  }
  if (copy.stat_note) {
    lines.push(`Stat note: ${copy.stat_note}`);
  }
  return lines;
}

function buildOpenAiPrompt(payload: ComposeTaskPayload, copyLines: string[]): { finalPrompt: string; guidance: string[] } {
  const guidance = [
    `Campaign brand: ${payload.brand}.`,
    `Tone keyword: ${payload.tone}.`,
    `Target aspect ratio: ${payload.size}.`,
    "Render as a polished Japanese digital advertisement with crisp, non-handwritten typography.",
    "Ensure every provided line of text is fully legible without truncation or spelling errors.",
    "Place the CTA as a distinct button or bar; disclaimers/stat notes should appear as small but readable footer text.",
    "Avoid generating any additional slogans or text beyond what is provided."
  ];

  const finalPrompt = [
    payload.prompt,
    ...guidance,
    "Include the following Japanese text exactly as written:",
    ...copyLines
  ].join("\n");

  return { finalPrompt, guidance };
}

async function generateOpenAiBanner(payload: ComposeTaskPayload, size: { width: number; height: number }): Promise<ComposeResult> {
  if (!openaiClient) {
    throw new Error("OPENAI_API_KEY is required for OpenAI image generation");
  }

  const copyLines = collectCopyLines(payload.copy);
  const { finalPrompt, guidance } = buildOpenAiPrompt(payload, copyLines);
  const requestSize = OPENAI_SIZE_HINT[payload.size] ?? "1024x1024";

  const response = await openaiClient.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt: finalPrompt,
    size: requestSize as "1024x1024" | "1024x1536" | "1536x1024" | "1024x1792",
    quality: OPENAI_IMAGE_QUALITY as "low" | "medium" | "high" | "auto"
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error("openai image response missing url");
  }

  // Download the image from URL
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.statusText}`);
  }
  const rawBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const sourceImage = await loadImage(rawBuffer);
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");
  drawImageCover(ctx, sourceImage, size.width, size.height);
  const buffer = canvas.toBuffer("image/png");

  return {
    buffer,
    metadata: {
      provider: "openai-image-api",
      model: OPENAI_IMAGE_MODEL,
      request_size: requestSize,
      original_prompt: payload.prompt,
      final_prompt: finalPrompt,
      copy_lines: copyLines,
      guidance_lines: guidance
    }
  };
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: { width: number; height: number },
  targetWidth: number,
  targetHeight: number
) {
  const scale = Math.max(targetWidth / image.width, targetHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;
  ctx.drawImage(image as any, offsetX, offsetY, drawWidth, drawHeight);
}

function createFallbackGradient(size: { width: number; height: number }, seed: string): Buffer {
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");
  const hash = crypto.createHash("sha256").update(seed).digest();
  const colorA = `#${hash.subarray(0, 3).toString("hex")}`;
  const colorB = `#${hash.subarray(3, 6).toString("hex")}`;
  const gradient = ctx.createLinearGradient(0, 0, size.width, size.height);
  gradient.addColorStop(0, colorA);
  gradient.addColorStop(1, colorB);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size.width, size.height);
  return canvas.toBuffer("image/png");
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const chars = Array.from(text);
  let line = "";
  let offsetY = 0;
  chars.forEach((char) => {
    const testLine = line + char;
    const { width } = ctx.measureText(testLine);
    if (width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, y + offsetY);
      line = char;
      offsetY += lineHeight;
    } else {
      line = testLine;
    }
  });
  if (line) {
    ctx.fillText(line, x, y + offsetY);
  }
}

async function composeFallbackBanner(
  payload: ComposeTaskPayload,
  size: { width: number; height: number },
  reason: string
): Promise<ComposeResult> {
  const gradientBuffer = createFallbackGradient(size, `${payload.variant_id}-${payload.seed}`);
  const backgroundImage = await loadImage(gradientBuffer);
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");

  drawImageCover(ctx, backgroundImage, size.width, size.height);

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(size.width * 0.05, size.height * 0.05, size.width * 0.9, size.height * 0.6);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 64px NotoSansJP";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const textX = size.width * 0.08;
  const textY = size.height * 0.08;
  wrapText(ctx, payload.copy.headline, textX, textY, size.width * 0.84, 74);

  if (payload.copy.sub) {
    ctx.font = "normal 40px NotoSansJP";
    wrapText(ctx, payload.copy.sub, textX, textY + size.height * 0.25, size.width * 0.84, 50);
  }

  if (payload.copy.badges?.length) {
    ctx.font = "bold 36px NotoSansJP";
    const badgeY = size.height * 0.55;
    payload.copy.badges.forEach((badge, index) => {
      const badgeX = textX + index * (size.width * 0.28 + 20);
      ctx.fillStyle = "rgba(247, 147, 26, 0.9)";
      const paddingX = 24;
      const paddingY = 16;
      const textWidth = ctx.measureText(badge).width;
      ctx.fillRect(badgeX, badgeY, textWidth + paddingX, 48 + paddingY);
      ctx.fillStyle = "#111111";
      ctx.fillText(badge, badgeX + paddingX / 2, badgeY + paddingY / 2);
    });
  }

  ctx.fillStyle = "#F7931A";
  const ctaHeight = 96;
  ctx.fillRect(0, size.height - ctaHeight, size.width, ctaHeight);
  ctx.fillStyle = "#111111";
  ctx.font = "bold 44px NotoSansJP";
  ctx.textAlign = "center";
  ctx.fillText(payload.copy.cta, size.width / 2, size.height - ctaHeight + 24);

  if (payload.copy.disclaimer || payload.copy.stat_note) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    const noteY = size.height - ctaHeight - 80;
    ctx.fillRect(0, noteY, size.width, 80);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "normal 28px NotoSansJP";
    ctx.textAlign = "left";
    const disclaimerText = [payload.copy.disclaimer, payload.copy.stat_note].filter(Boolean).join(" / ");
    wrapText(ctx, disclaimerText, textX, noteY + 8, size.width * 0.84, 32);
  }

  const buffer = canvas.toBuffer("image/png");

  return {
    buffer,
    metadata: {
      provider: "canvas-fallback",
      fallback_reason: reason,
      copy_lines: collectCopyLines(payload.copy)
    }
  };
}

async function composeBanner(payload: ComposeTaskPayload, log: FastifyBaseLogger): Promise<ComposeResult> {
  const size = SIZE_MAP[payload.size];
  if (!size) {
    throw new Error(`Unsupported size ${payload.size}`);
  }

  if (openaiClient) {
    try {
      return await generateOpenAiBanner(payload, size);
    } catch (error) {
      log.error({ err: error, variant: payload.variant_id, size: payload.size }, "openai generation failed, using fallback");
      const reason = error instanceof Error ? error.message : "openai_generation_failed";
      return await composeFallbackBanner(payload, size, reason);
    }
  }

  return composeFallbackBanner(payload, size, OPENAI_API_KEY ? "openai_client_unavailable" : "missing_openai_api_key");
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

function toPublicUrl(gcsPath: string | null | undefined): string | null {
  if (!gcsPath) {
    return null;
  }
  const { bucket, object } = splitGcsPath(gcsPath);
  return `https://storage.googleapis.com/${bucket}/${object}`;
}

async function saveOutput(
  result: ComposeResult,
  payload: ComposeTaskPayload
): Promise<{ assetPath: string; assetUrl: string | null; previewPath: string; previewUrl: string | null; metadataPath: string }> {
  const dateIso = isoUtcNow().split("T")[0];
  const pathParts = {
    brand: payload.brand,
    campaignId: payload.campaign_id,
    dateIso,
    template: payload.template,
    tone: payload.tone,
    size: payload.size,
    variant: payload.variant_id,
    slug: payload.slug
  } as const;

  const objectPath = buildStoragePath(pathParts);
  const assetGcsPath = `gs://${OUTPUT_BUCKET}/${objectPath}`;
  const { bucket, object } = splitGcsPath(assetGcsPath);

  await saveBufferToGcs(storage.bucket(bucket).file(object), result.buffer, { contentType: "image/png" });

  const tmpFile = path.join(os.tmpdir(), `banner-${Date.now()}.png`);
  await fs.writeFile(tmpFile, result.buffer);
  const image = await loadImage(tmpFile);
  const ratio = image.height / image.width;
  const previewCanvas = createCanvas(512, Math.round(512 * ratio));
  const previewCtx = previewCanvas.getContext("2d");
  previewCtx.drawImage(image, 0, 0, 512, Math.round(512 * ratio));
  const previewBuffer = previewCanvas.toBuffer("image/jpeg", { quality: 0.85 });
  const previewPath = `previews/${objectPath.replace(/\.png$/, ".jpg")}`;
  await saveBufferToGcs(storage.bucket(bucket).file(previewPath), previewBuffer, { contentType: "image/jpeg" });
  await fs.unlink(tmpFile).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  });

  const metadataPath = `meta/${objectPath.replace(/\.png$/, "-generation.json")}`;
  const metadataBuffer = Buffer.from(
    JSON.stringify(
      {
        ...result.metadata,
        generated_at: isoUtcNow(),
        campaign_id: payload.campaign_id,
        variant_id: payload.variant_id,
        template: payload.template,
        tone: payload.tone,
        size: payload.size
      },
      null,
      2
    )
  );
  await saveBufferToGcs(storage.bucket(bucket).file(metadataPath), metadataBuffer, {
    contentType: "application/json"
  });

  const previewGcsPath = `gs://${bucket}/${previewPath}`;

  return {
    assetPath: assetGcsPath,
    assetUrl: toPublicUrl(assetGcsPath),
    previewPath: previewGcsPath,
    previewUrl: toPublicUrl(previewGcsPath),
    metadataPath: `gs://${bucket}/${metadataPath}`
  };
}

async function publishQcTask(
  payload: ComposeTaskPayload,
  assetPath: string,
  previewPath: string,
  metadataPath: string
) {
  await pubsub.topic(QC_TOPIC).publishMessage({
    json: {
      variant_id: payload.variant_id,
      campaign_id: payload.campaign_id,
      template: payload.template,
      tone: payload.tone,
      size: payload.size,
      asset_path: assetPath,
      preview_path: previewPath,
      generation_meta_path: metadataPath,
      copy: payload.copy
    }
  });
}

async function handleTask(payload: ComposeTaskPayload, log: FastifyBaseLogger) {
  const renderJobId = `${payload.variant_id}-${payload.size}`;
  await firestore.collection("render_job").doc(renderJobId).set(
    {
      render_job_id: renderJobId,
      campaign_id: payload.campaign_id,
      variant_id: payload.variant_id,
      size: payload.size,
      status: "processing",
      prompt: payload.prompt,
      seed: payload.seed,
      processing_started_at: isoUtcNow(),
      updated_at: isoUtcNow()
    },
    { merge: true }
  );

  let result: ComposeResult;
  try {
    result = await composeBanner(payload, log);
  } catch (error) {
    await firestore.collection("render_job").doc(renderJobId).set(
      {
        render_job_id: renderJobId,
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
        updated_at: isoUtcNow()
      },
      { merge: true }
    );
    throw error;
  }

  const { assetPath, assetUrl, previewPath, previewUrl, metadataPath } = await saveOutput(result, payload);
  await firestore.collection("render_job").doc(renderJobId).set(
    {
      render_job_id: renderJobId,
      campaign_id: payload.campaign_id,
      variant_id: payload.variant_id,
      size: payload.size,
      status: "composited",
      provider: result.metadata.provider,
      prompt: payload.prompt,
      seed: payload.seed,
      asset_path: assetPath,
      asset_url: assetUrl,
      preview_path: previewPath,
      preview_url: previewUrl,
      generation_meta_path: metadataPath,
      composited_at: isoUtcNow(),
      updated_at: isoUtcNow()
    },
    { merge: true }
  );

  await publishQcTask(payload, assetPath, previewPath, metadataPath);
}

function decodeMessage(body: any): ComposeTaskPayload {
  if (!body?.message?.data) {
    throw new Error("Missing Pub/Sub message data");
  }
  const decoded = Buffer.from(body.message.data, "base64").toString("utf8");
  return JSON.parse(decoded) as ComposeTaskPayload;
}

export function buildServer() {
  const app = Fastify({ logger: true });
  app.post("/tasks/compositor", async (request, reply) => {
    try {
      const payload = decodeMessage(request.body);
      await handleTask(payload, request.log);
      return reply.status(204).send();
    } catch (err) {
      request.log.error({ err }, "failed to compose banner");
      return reply.status(500).send({ error: "COMPOSITION_FAILED", message: (err as Error).message });
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
