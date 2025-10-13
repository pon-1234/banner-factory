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
const OPENAI_COPY_MODEL = process.env.OPENAI_COPY_MODEL ?? "gpt-4.1-mini";
const ENABLE_DYNAMIC_COPY = process.env.ENABLE_DYNAMIC_COPY?.toLowerCase() !== "false";

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
  copy_source?: "template" | "generated" | "cached";
  copy_model?: string;
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

function sanitizeString(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function sanitizeGeneratedCopy(raw: Partial<CopyPayload>, fallback: CopyPayload): CopyPayload {
  const headline = sanitizeString(raw.headline) ?? fallback.headline;
  const cta = sanitizeString(raw.cta) ?? fallback.cta;
  const sub = sanitizeString(raw.sub) ?? fallback.sub;
  const disclaimer = sanitizeString(raw.disclaimer) ?? fallback.disclaimer;
  const statNote = sanitizeString(raw.stat_note) ?? fallback.stat_note;
  const badges = Array.isArray(raw.badges)
    ? raw.badges
        .map((item) => sanitizeString(typeof item === "string" ? item : String(item)))
        .filter((item): item is string => Boolean(item))
    : fallback.badges ?? [];

  return {
    headline,
    sub,
    badges: badges.length ? badges : undefined,
    cta,
    disclaimer,
    stat_note: statNote
  };
}

async function loadStoredDynamicCopy(variantId: string): Promise<{ copy: CopyPayload; model?: string } | null> {
  const snapshot = await firestore.collection("variant").doc(variantId).get();
  if (!snapshot.exists) {
    return null;
  }
  const data = snapshot.data() as Record<string, unknown> | undefined;
  const stored = data?.dynamic_copy as Partial<CopyPayload> | undefined;
  if (!stored || typeof stored.headline !== "string" || typeof stored.cta !== "string") {
    return null;
  }
  const copy: CopyPayload = {
    headline: stored.headline,
    sub: typeof stored.sub === "string" ? stored.sub : undefined,
    badges: Array.isArray(stored.badges) ? (stored.badges as string[]) : undefined,
    cta: stored.cta,
    disclaimer: typeof stored.disclaimer === "string" ? stored.disclaimer : undefined,
    stat_note: typeof stored.stat_note === "string" ? stored.stat_note : undefined
  };
  const model = typeof data?.dynamic_copy_model === "string" ? (data.dynamic_copy_model as string) : undefined;
  return { copy, model };
}

async function generateDynamicCopy(
  payload: ComposeTaskPayload,
  log: FastifyBaseLogger
): Promise<{ copy: CopyPayload; model: string } | null> {
  if (!openaiClient || !ENABLE_DYNAMIC_COPY) {
    return null;
  }

  try {
    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_COPY_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたは日本語の広告コピーライターです。見出し・補足・CTA・バッジ・免責・注記を生成し、必ず JSON オブジェクトで返してください。バッジは最大3件、CTAは12文字以内を推奨します。"
        },
        {
          role: "user",
          content: `以下の情報を基に、デジタル広告のテキスト要素を生成してください。JSON で {"headline","sub","badges","cta","disclaimer","stat_note"} を返してください。未使用のキーは null 可。

ブランド: ${payload.brand}
トーン: ${payload.tone}
テンプレート: ${payload.template}
サイズ: ${payload.size}
キャンペーンの説明プロンプト: ${payload.prompt}
既存コピー案: ${JSON.stringify(payload.copy)}

制約:
- 文字は日本語で自然かつ読みやすく。
- 誇大広告や禁止語は避ける。
- 指定されたトーンに合わせ、かつブランドの信頼性を損なわない。
- CTAは行動を促す短い表現に。
- JSONのみを出力してください。`
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("empty completion content");
    }
    const parsed = JSON.parse(content) as Partial<CopyPayload>;
    const normalized = sanitizeGeneratedCopy(parsed, payload.copy);

    await firestore
      .collection("variant")
      .doc(payload.variant_id)
      .set(
        {
          dynamic_copy: normalized,
          dynamic_copy_model: OPENAI_COPY_MODEL,
          dynamic_copy_generated_at: isoUtcNow()
        },
        { merge: true }
      );

    return { copy: normalized, model: OPENAI_COPY_MODEL };
  } catch (error) {
    log.warn({ err: error, variant: payload.variant_id }, "failed to generate dynamic copy");
    return null;
  }
}

async function resolveCopy(
  payload: ComposeTaskPayload,
  log: FastifyBaseLogger
): Promise<{ copy: CopyPayload; source: "template" | "generated" | "cached"; model?: string }> {
  if (!openaiClient || !ENABLE_DYNAMIC_COPY) {
    return { copy: payload.copy, source: "template" };
  }

  try {
    const stored = await loadStoredDynamicCopy(payload.variant_id);
    if (stored) {
      return { copy: stored.copy, source: "cached", model: stored.model };
    }
    const generated = await generateDynamicCopy(payload, log);
    if (generated) {
      return { copy: generated.copy, source: "generated", model: generated.model };
    }
  } catch (error) {
    log.warn({ err: error, variant: payload.variant_id }, "dynamic copy lookup failed");
  }

  return { copy: payload.copy, source: "template" };
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

  const { copy, source: copySource, model: copyModel } = await resolveCopy(payload, log);
  payload.copy = copy;

  if (openaiClient) {
    try {
      const result = await generateOpenAiBanner(payload, size);
      result.metadata.copy_source = copySource;
      if (copyModel) {
        result.metadata.copy_model = copyModel;
      }
      return result;
    } catch (error) {
      log.error({ err: error, variant: payload.variant_id, size: payload.size }, "openai generation failed, using fallback");
      const reason = error instanceof Error ? error.message : "openai_generation_failed";
      const fallback = await composeFallbackBanner(payload, size, reason);
      fallback.metadata.copy_source = copySource;
      if (copyModel) {
        fallback.metadata.copy_model = copyModel;
      }
      return fallback;
    }
  }

  const reason = OPENAI_API_KEY ? "openai_client_unavailable" : "missing_openai_api_key";
  const fallback = await composeFallbackBanner(payload, size, reason);
  fallback.metadata.copy_source = copySource;
  if (copyModel) {
    fallback.metadata.copy_model = copyModel;
  }
  return fallback;
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

interface TaskResult {
  ok: boolean;
  error?: string;
}

async function handleTask(payload: ComposeTaskPayload, log: FastifyBaseLogger): Promise<TaskResult> {
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
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
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
  return { ok: true };
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
      const result = await handleTask(payload, request.log);
      if (result.ok) {
        return reply.status(200).send({ status: "processed" });
      }
      return reply.status(200).send({ status: "failed", error: result.error ?? "unknown" });
    } catch (err) {
      request.log.error({ err }, "failed to compose banner");
      return reply.status(200).send({ status: "failed", error: err instanceof Error ? err.message : String(err) });
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
