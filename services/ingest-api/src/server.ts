import Fastify from "fastify";
import cors from "@fastify/cors";
import { Firestore } from "@google-cloud/firestore";
import { PubSub } from "@google-cloud/pubsub";
import {
  AspectRatio,
  InputSchema,
  RenderRequestSchema,
  RenderJobSchema,
  type RenderJobRecord,
  RenderJobStatus,
  RenderJobStatusSchema,
  createHashId,
  isoUtcNow
} from "@banner/shared";

const firestore = new Firestore();
const pubsub = new PubSub();

const BG_TOPIC = process.env.BG_TOPIC ?? "bg-tasks";

function toPublicUrl(gcsPath?: string | null): string | null {
  if (!gcsPath) {
    return null;
  }
  const match = gcsPath.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    return null;
  }
  return `https://storage.googleapis.com/${match[1]}/${match[2]}`;
}

function normalizeSizes(sizes: unknown): AspectRatio[] {
  if (!Array.isArray(sizes)) {
    return [];
  }
  return sizes.filter((item): item is AspectRatio => typeof item === "string" && item.length > 0) as AspectRatio[];
}

function coerceStatus(status: unknown): RenderJobStatus {
  const parsed = RenderJobStatusSchema.safeParse(status);
  return parsed.success ? parsed.data : "queued";
}

export async function buildServer() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });

  app.get("/", async (request, reply) => {
    return reply.send({ status: "ok", service: "ingest-api" });
  });

  app.post("/v1/campaigns", async (request, reply) => {
    const parsed = InputSchema.safeParse(request.body);
    if (!parsed.success) {
      request.log.warn({ err: parsed.error }, "invalid campaign payload");
      return reply.status(400).send({ error: "INVALID_PAYLOAD", details: parsed.error.flatten() });
    }

    const payload = parsed.data;
    const campaignId = createHashId("campaign", `${payload.brand_name}-${payload.lp_url}-${Date.now()}`);
    const campaignDoc = firestore.collection("campaign").doc(campaignId);

    await campaignDoc.set({
      campaign_id: campaignId,
      input: payload,
      status: "pending",
      created_at: isoUtcNow(),
      updated_at: isoUtcNow()
    });

    return reply.status(201).send({ campaign_id: campaignId });
  });

  app.post("/v1/campaigns/:campaignId/render", async (request, reply) => {
    const parsed = RenderRequestSchema.safeParse({
      ...(request.body as object),
      campaign_id: request.params && typeof request.params === "object" ? (request.params as any).campaignId : undefined
    });

    if (!parsed.success) {
      request.log.warn({ err: parsed.error }, "invalid render request");
      return reply.status(400).send({ error: "INVALID_PAYLOAD", details: parsed.error.flatten() });
    }

    const renderRequest = parsed.data;

    const messageId = await pubsub.topic(BG_TOPIC).publishMessage({
      json: renderRequest
    });

    const campaignDoc = firestore.collection("campaign").doc(renderRequest.campaign_id);
    await campaignDoc.update({
      status: "rendering",
      render_topic_message_id: messageId,
      updated_at: isoUtcNow()
    });

    return reply.status(202).send({ job_enqueued: true, message_id: messageId });
  });

  app.get("/v1/campaigns/:campaignId", async (request, reply) => {
    const campaignId = (request.params as any).campaignId as string;
    const snapshot = await firestore.collection("campaign").doc(campaignId).get();
    if (!snapshot.exists) {
      return reply.status(404).send({ error: "NOT_FOUND" });
    }

    return reply.send(snapshot.data());
  });

  app.get("/v1/campaigns/:campaignId/progress", async (request, reply) => {
    const campaignId = (request.params as any).campaignId as string;
    if (!campaignId) {
      return reply.status(400).send({ error: "INVALID_CAMPAIGN_ID" });
    }

    const campaignRef = firestore.collection("campaign").doc(campaignId);
    const [campaignSnap, variantsSnap, renderJobsSnap] = await Promise.all([
      campaignRef.get(),
      firestore.collection("variant").where("campaign_id", "==", campaignId).get(),
      firestore.collection("render_job").where("campaign_id", "==", campaignId).get()
    ]);

    if (!campaignSnap.exists) {
      return reply.status(404).send({ error: "NOT_FOUND" });
    }

    const renderJobs = new Map<string, RenderJobRecord>();
    renderJobsSnap.forEach((doc) => {
      const raw = doc.data();
      const enriched = {
        render_job_id: doc.id,
        ...raw,
        campaign_id: raw.campaign_id ?? campaignId,
        preview_url: raw.preview_url ?? toPublicUrl(raw.preview_path),
        asset_url: raw.asset_url ?? toPublicUrl(raw.asset_path),
        status: coerceStatus(raw.status),
        updated_at: raw.updated_at ?? isoUtcNow()
      } as Record<string, unknown>;
      const parsed = RenderJobSchema.safeParse(enriched);
      if (parsed.success) {
        renderJobs.set(doc.id, parsed.data);
      } else {
        renderJobs.set(doc.id, {
          render_job_id: doc.id,
          campaign_id: campaignId,
          variant_id: (raw.variant_id as string) ?? doc.id.split("-")[0],
          size: (raw.size as AspectRatio) ?? "1080x1080",
          status: coerceStatus(raw.status),
          updated_at: enriched.updated_at as string
        } as RenderJobRecord);
      }
    });

    const variants = variantsSnap.docs.map((doc) => {
      const data = doc.data();
      const sizes = normalizeSizes(data.sizes ?? []);
      const jobs = sizes.map((size) => {
        const jobId = `${doc.id}-${size}`;
        const job = renderJobs.get(jobId);
        return {
          size,
          status: job?.status ?? "queued",
          asset_path: job?.asset_path ?? null,
          asset_url: job?.asset_url ?? null,
          preview_path: job?.preview_path ?? null,
          preview_url: job?.preview_url ?? null,
          generation_meta_path: job?.generation_meta_path ?? null,
          qc_passed: job?.qc_passed ?? false,
          qc_report_path: job?.qc_report_path ?? null,
          qc_issues: job?.qc_issues ?? [],
          queued_at: job?.queued_at ?? null,
          processing_started_at: job?.processing_started_at ?? null,
          composited_at: job?.composited_at ?? null,
          qc_completed_at: job?.qc_completed_at ?? null,
          delivered_at: job?.delivered_at ?? null,
          updated_at: job?.updated_at ?? null
        };
      });

      return {
        variant_id: doc.id,
        template: data.template,
        tone: data.tone,
        style_code: data.style_code,
        prompt: data.prompt,
        prompt_hash: data.prompt_hash,
        seed: data.seed,
        refs: data.refs ?? [],
        brand: data.brand ?? data.brand_name ?? "",
        slug: data.slug ?? "",
        copy: data.copy ?? null,
        sizes,
        renders: jobs
      };
    });

    const flatRenders = variants.flatMap((variant) => variant.renders);
    const summary = {
      total_variants: variants.length,
      total_renders: flatRenders.length,
      delivered: flatRenders.filter((item) => item.status === "delivered").length,
      qc_blocked: flatRenders.filter((item) => item.status === "manual_review").length
    };

    return reply.send({
      campaign: {
        campaign_id: campaignId,
        ...(campaignSnap.data() ?? {})
      },
      variants,
      summary
    });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 8080);
  buildServer()
    .then(app => app.listen({ port, host: "0.0.0.0" }))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
