import Fastify from "fastify";
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import { PubSub } from "@google-cloud/pubsub";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { DeliveryMessageSchema, type DeliveryMessage, isoUtcNow } from "@banner/shared";

const firestore = new Firestore();
const storage = new Storage();
const pubsub = new PubSub();
const vision = new ImageAnnotatorClient();

const DELIVERY_TOPIC = process.env.DELIVERY_TOPIC ?? "delivery-tasks";

interface QCTaskPayload extends Omit<DeliveryMessage, "preview_url"> {
  preview_path: string;
  generation_meta_path?: string;
  copy: {
    headline: string;
    sub?: string;
    badges?: string[];
    cta: string;
    disclaimer?: string;
    stat_note?: string;
  };
}

function decodeMessage(body: any): QCTaskPayload {
  if (!body?.message?.data) {
    throw new Error("Missing Pub/Sub message data");
  }
  const decoded = Buffer.from(body.message.data, "base64").toString("utf8");
  return JSON.parse(decoded) as QCTaskPayload;
}

function splitGcsPath(gcsPath: string): { bucket: string; object: string } {
  const match = gcsPath.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`invalid GCS path: ${gcsPath}`);
  }
  return { bucket: match[1], object: match[2] };
}

function parseGcsPath(gcsPath: string) {
  const { bucket, object } = splitGcsPath(gcsPath);
  return { bucket, name: object };
}

async function downloadImage(gcsPath: string): Promise<Buffer> {
  const { bucket, object } = splitGcsPath(gcsPath);
  const [data] = await storage.bucket(bucket).file(object).download();
  return data;
}

const FORBIDDEN = ["必ず", "100%", "完全"];

async function runChecks(payload: QCTaskPayload): Promise<{ passed: boolean; issues: Array<{ code: string; message: string; severity: "warning" | "error" }>; textDetected: string }>
{
  const issues: Array<{ code: string; message: string; severity: "warning" | "error" }> = [];

  if (payload.copy.headline.length > 34) {
    issues.push({ code: "HEADLINE_TOO_LONG", message: "Headline exceeds recommended length", severity: "warning" });
  }

  FORBIDDEN.forEach((forbidden) => {
    if (payload.copy.headline.includes(forbidden) || payload.copy.sub?.includes(forbidden)) {
      issues.push({ code: "FORBIDDEN_PHRASE", message: `Contains forbidden phrase: ${forbidden}`, severity: "error" });
    }
  });

  if (payload.copy.stat_note === undefined && /\d+%/.test(payload.copy.headline)) {
    issues.push({ code: "MISSING_STAT_NOTE", message: "Stat claim requires a stat note", severity: "error" });
  }

  const buffer = await downloadImage(payload.asset_path);
  const [result] = await vision.textDetection(buffer);
  const detectedText = result.textAnnotations?.[0]?.description ?? "";
  if (detectedText.trim().length) {
    issues.push({ code: "BACKGROUND_TEXT_DETECTED", message: "OCR detected background text, add blur overlay", severity: "warning" });
  }

  const passed = issues.every((issue) => issue.severity === "warning");
  return { passed, issues, textDetected: detectedText };
}

async function saveQcReport(payload: QCTaskPayload, result: Awaited<ReturnType<typeof runChecks>>) {
  const { bucket } = parseGcsPath(payload.asset_path);
  const timestamp = isoUtcNow().replace(/[:.]/g, "-");
  const reportPath = `meta/${payload.variant_id}-${payload.size}-${timestamp}-qc.json`;
  const content = Buffer.from(JSON.stringify({
    render_job_id: `${payload.variant_id}-${payload.size}`,
    issues: result.issues,
    passed: result.passed,
    ocr_text: result.textDetected,
    generated_at: isoUtcNow()
  }, null, 2));
  await storage.bucket(bucket).file(reportPath).save(content, { contentType: "application/json", resumable: false });
  return `gs://${bucket}/${reportPath}`;
}

async function recordResult(payload: QCTaskPayload, reportPath: string, result: Awaited<ReturnType<typeof runChecks>>) {
  const renderJobId = `${payload.variant_id}-${payload.size}`;
  await firestore.collection("render_job").doc(renderJobId).set({
    render_job_id: renderJobId,
    campaign_id: payload.campaign_id,
    variant_id: payload.variant_id,
    size: payload.size,
    qc_passed: result.passed,
    qc_issues: result.issues,
    qc_report_path: reportPath,
    status: result.passed ? "qc_passed" : "manual_review",
    qc_completed_at: isoUtcNow(),
    updated_at: isoUtcNow()
  }, { merge: true });
}

async function publishDelivery(payload: QCTaskPayload, reportPath: string) {
  const { bucket, name } = parseGcsPath(payload.preview_path);
  const previewUrl = `https://storage.googleapis.com/${bucket}/${name}`;
  const message = {
    variant_id: payload.variant_id,
    asset_path: payload.asset_path,
    preview_url: previewUrl,
    qc_report_path: reportPath,
    campaign_id: payload.campaign_id,
    template: payload.template,
    tone: payload.tone,
    size: payload.size
  } satisfies DeliveryMessage;

  const parsed = DeliveryMessageSchema.parse(message);
  await pubsub.topic(DELIVERY_TOPIC).publishMessage({ json: parsed });
}

async function handleTask(payload: QCTaskPayload) {
  const result = await runChecks(payload);
  const reportPath = await saveQcReport(payload, result);
  await recordResult(payload, reportPath, result);
  if (result.passed) {
    await publishDelivery(payload, reportPath);
  }
}

export function buildServer() {
  const app = Fastify({ logger: true });
  app.post("/tasks/qc", async (request, reply) => {
    try {
      const payload = decodeMessage(request.body);
      await handleTask(payload);
      return reply.status(204).send();
    } catch (err) {
      request.log.error({ err }, "failed to run QC");
      return reply.status(500).send({ error: "QC_FAILED", message: (err as Error).message });
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
