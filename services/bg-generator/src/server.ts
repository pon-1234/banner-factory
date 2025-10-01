import Fastify from "fastify";
import { Firestore } from "@google-cloud/firestore";
import { PubSub } from "@google-cloud/pubsub";
import { isoUtcNow, TemplateCode, AspectRatio } from "@banner/shared";

const firestore = new Firestore();
const pubsub = new PubSub();

const COMPOSE_TOPIC = process.env.COMPOSE_TOPIC ?? "compose-tasks";

interface BgTaskPayload {
  variant_id: string;
  campaign_id: string;
  template: TemplateCode;
  tone: "救済" | "緊急" | "権威";
  prompt: string;
  seed: string;
  refs?: string[];
  sizes?: AspectRatio[];
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

function normalizeSizes(sizes: AspectRatio[] | undefined): AspectRatio[] {
  const fallback: AspectRatio[] = ["1080x1080"];
  if (!Array.isArray(sizes) || sizes.length === 0) {
    return fallback;
  }
  const filtered = sizes.filter((value): value is AspectRatio => typeof value === "string" && value.length > 0);
  return filtered.length ? filtered : fallback;
}

async function publishComposeTasks(payload: BgTaskPayload) {
  const sizes = normalizeSizes(payload.sizes);
  for (const size of sizes) {
    const renderJobId = `${payload.variant_id}-${size}`;
    await firestore
      .collection("render_job")
      .doc(renderJobId)
      .set(
        {
          render_job_id: renderJobId,
          campaign_id: payload.campaign_id,
          variant_id: payload.variant_id,
          size,
          status: "queued",
          provider: "openai-image-api",
          prompt: payload.prompt,
          seed: payload.seed,
          queued_at: isoUtcNow(),
          updated_at: isoUtcNow()
        },
        { merge: true }
      );

    await pubsub.topic(COMPOSE_TOPIC).publishMessage({
      json: {
        variant_id: payload.variant_id,
        campaign_id: payload.campaign_id,
        template: payload.template,
        tone: payload.tone,
        size,
        prompt: payload.prompt,
        seed: payload.seed,
        brand: payload.brand,
        slug: payload.slug,
        copy: payload.copy
      }
    });
  }
}

async function handleTask(payload: BgTaskPayload) {
  await firestore.collection("variant").doc(payload.variant_id).set(
    {
      bg_generated_at: isoUtcNow(),
      bg_asset_path: null,
      bg_meta_path: null,
      background_provider: "openai-image-api",
      updated_at: isoUtcNow()
    },
    { merge: true }
  );

  await publishComposeTasks(payload);
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
      request.log.error({ err }, "failed to enqueue compose tasks");
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
