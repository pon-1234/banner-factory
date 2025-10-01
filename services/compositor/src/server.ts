import Fastify from "fastify";
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { PubSub } from "@google-cloud/pubsub";
import { createCanvas, loadImage, registerFont, type CanvasRenderingContext2D } from "canvas";
import { AspectRatio, TemplateCode, buildStoragePath, isoUtcNow } from "@banner/shared";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

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
    // Fonts are optional during local development; default fonts will be used instead.
  }
})();

const firestore = new Firestore();
const storage = new Storage();
const pubsub = new PubSub();

const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET ?? "banner-assets";
const QC_TOPIC = process.env.QC_TOPIC ?? "qc-tasks";

const SIZE_MAP: Record<AspectRatio, { width: number; height: number }> = {
  "1080x1080": { width: 1080, height: 1080 },
  "1080x1350": { width: 1080, height: 1350 },
  "1200x628": { width: 1200, height: 628 },
  "1080x1920": { width: 1080, height: 1920 }
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
  background_path: string;
  background_meta_path?: string;
  brand: string;
  slug: string;
  copy: CopyPayload;
}

function splitGcsPath(gcsPath: string): { bucket: string; object: string } {
  const match = gcsPath.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`invalid GCS path: ${gcsPath}`);
  }
  return { bucket: match[1], object: match[2] };
}

async function downloadFromGcs(gcsPath: string): Promise<Buffer> {
  const { bucket, object } = splitGcsPath(gcsPath);
  const [file] = await storage.bucket(bucket).file(object).download();
  return file;
}

function parseGcs(gcsPath: string) {
  const { bucket, object } = splitGcsPath(gcsPath);
  return { bucket, name: object };
}

async function composeBanner(payload: ComposeTaskPayload): Promise<Buffer> {
  const size = SIZE_MAP[payload.size];
  if (!size) {
    throw new Error(`Unsupported size ${payload.size}`);
  }

  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");

  const bgBuffer = await downloadFromGcs(payload.background_path);
  const bgImage = await loadImage(bgBuffer);
  ctx.drawImage(bgImage, 0, 0, size.width, size.height);

  // Overlay for readability if needed
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(size.width * 0.05, size.height * 0.05, size.width * 0.9, size.height * 0.6);

  // Headline
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

  // CTA bar
  ctx.fillStyle = "#F7931A";
  const ctaHeight = 96;
  ctx.fillRect(0, size.height - ctaHeight, size.width, ctaHeight);
  ctx.fillStyle = "#111111";
  ctx.font = "bold 44px NotoSansJP";
  ctx.textAlign = "center";
  ctx.fillText(payload.copy.cta, size.width / 2, size.height - ctaHeight + 24);

  // Disclaimer/stat note
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

async function saveOutput(buffer: Buffer, payload: ComposeTaskPayload): Promise<{ assetPath: string; previewPath: string }> {
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
  const { bucket, name } = parseGcs(`gs://${OUTPUT_BUCKET}/${objectPath}`);
  await storage.bucket(bucket).file(name).save(buffer, { contentType: "image/png" });

  // Generate preview (512px width) by resizing via canvas re-render
  const tmpFile = path.join(os.tmpdir(), `banner-${Date.now()}.png`);
  await fs.writeFile(tmpFile, buffer);
  const image = await loadImage(tmpFile);
  const ratio = image.height / image.width;
  const previewCanvas = createCanvas(512, Math.round(512 * ratio));
  const previewCtx = previewCanvas.getContext("2d");
  previewCtx.drawImage(image, 0, 0, 512, Math.round(512 * ratio));
  const previewBuffer = previewCanvas.toBuffer("image/jpeg", { quality: 0.85 });
  const previewPath = `previews/${objectPath.replace(/\.png$/, ".jpg")}`;
  await storage.bucket(bucket).file(previewPath).save(previewBuffer, { contentType: "image/jpeg" });
  await fs.unlink(tmpFile);

  return {
    assetPath: `gs://${bucket}/${name}`,
    previewPath: `gs://${bucket}/${previewPath}`
  };
}

async function publishQcTask(payload: ComposeTaskPayload, assetPath: string, previewPath: string) {
  await pubsub.topic(QC_TOPIC).publishMessage({
    json: {
      variant_id: payload.variant_id,
      campaign_id: payload.campaign_id,
      template: payload.template,
      tone: payload.tone,
      size: payload.size,
      asset_path: assetPath,
      preview_path: previewPath,
      copy: payload.copy
    }
  });
}

async function handleTask(payload: ComposeTaskPayload) {
  const buffer = await composeBanner(payload);
  const { assetPath, previewPath } = await saveOutput(buffer, payload);
  const renderJobId = `${payload.variant_id}-${payload.size}`;
  await firestore.collection("render_job").doc(renderJobId).set({
    render_job_id: renderJobId,
    variant_id: payload.variant_id,
    size: payload.size,
    status: "composited",
    asset_path: assetPath,
    preview_path: previewPath,
    updated_at: isoUtcNow()
  }, { merge: true });

  await publishQcTask(payload, assetPath, previewPath);
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
      await handleTask(payload);
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
