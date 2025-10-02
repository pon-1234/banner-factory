import Fastify from "fastify";
import cors from "@fastify/cors";
import { Firestore } from "@google-cloud/firestore";
import { PubSub } from "@google-cloud/pubsub";
import {
  AspectRatio,
  InputSchema,
  RenderRequestSchema,
  type RenderRequest,
  RenderJobSchema,
  type RenderJobRecord,
  RenderJobStatus,
  RenderJobStatusSchema,
  TemplateCode,
  type CampaignInput,
  type CopyBlock,
  buildPrompt,
  buildCopy,
  slugify,
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

type Tone = "救済" | "緊急" | "権威";

interface VariantBuildResult {
  variant_id: string;
  prompt: string;
  seed: string;
  template: TemplateCode;
  tone: Tone;
  refs: string[];
  sizes: AspectRatio[];
  brand: string;
  slug: string;
  copy: CopyBlock;
}

interface BgTaskPayload extends VariantBuildResult {
  campaign_id: string;
}

const DEFAULT_TONE: Record<TemplateCode, Tone> = {
  T1: "救済",
  T2: "緊急",
  T3: "権威"
};

function resolveTone(template: TemplateCode, input: CampaignInput): Tone {
  return (input.tone as Tone | undefined) ?? DEFAULT_TONE[template];
}

function selectInput(renderRequest: RenderRequest, variantIndex: number): CampaignInput {
  const index = variantIndex % renderRequest.inputs.length;
  return renderRequest.inputs[index];
}

function collectRefs(input: CampaignInput): string[] {
  const refs = new Set<string>();
  (input.reference_banners ?? []).forEach((ref) => refs.add(ref));
  (input.bg_style_refs ?? []).forEach((ref) => refs.add(ref));
  return Array.from(refs);
}

async function createVariantDocument(
  campaignId: string,
  template: TemplateCode,
  tone: Tone,
  input: CampaignInput,
  prompt: string,
  seed: string,
  refs: string[],
  copy: CopyBlock,
  sizes: AspectRatio[],
  slug: string
): Promise<string> {
  const styleCode = input.style_code ?? "AUTO";
  const variantId = createHashId("variant", `${campaignId}-${template}-${tone}-${styleCode}-${seed}`);
  const promptHash = createHashId("prompt", prompt, 24);
  const refsHash = refs.length ? createHashId("refs", refs.join(","), 16) : undefined;
  const variantRef = firestore.collection("variant").doc(variantId);
  const baseData: Record<string, unknown> = {
    variant_id: variantId,
    campaign_id: campaignId,
    template,
    tone,
    style_code: styleCode === "AUTO" ? template : styleCode,
    prompt,
    prompt_hash: promptHash,
    seed,
    refs,
    copy,
    sizes,
    brand: input.brand_name,
    slug,
    created_at: isoUtcNow()
  };
  if (refsHash) {
    baseData.refs_hash = refsHash;
  }
  await variantRef.set(baseData);
  await variantRef.collection("logs").add({
    event: "prompt_generated",
    created_at: isoUtcNow()
  });
  return variantId;
}

async function buildVariant(
  renderRequest: RenderRequest,
  template: TemplateCode,
  variantIndex: number
): Promise<VariantBuildResult> {
  const input = selectInput(renderRequest, variantIndex);
  const tone = resolveTone(template, input);
  const refs = collectRefs(input);
  const { prompt, seed } = buildPrompt(input, { template, tone, refs });
  const copy = buildCopy(input, template);
  const normalizedSizes = normalizeSizes(renderRequest.sizes);
  const sizes = normalizedSizes.length ? normalizedSizes : (["1080x1080"] as AspectRatio[]);
  const slug = slugify(input.brand_name);
  const variantId = await createVariantDocument(
    renderRequest.campaign_id,
    template,
    tone,
    input,
    prompt,
    seed,
    refs,
    copy,
    sizes,
    slug
  );

  return {
    variant_id: variantId,
    prompt,
    seed,
    template,
    tone,
    refs,
    sizes,
    brand: input.brand_name,
    slug,
    copy
  };
}

async function buildVariantsFromRequest(renderRequest: RenderRequest): Promise<VariantBuildResult[]> {
  const variants: VariantBuildResult[] = [];
  for (const template of renderRequest.templates) {
    for (let idx = 0; idx < renderRequest.count_per_template; idx += 1) {
      const variant = await buildVariant(renderRequest, template, idx);
      variants.push(variant);
    }
  }
  return variants;
}

async function enqueueBackgroundTasks(campaignId: string, variants: VariantBuildResult[]): Promise<string[]> {
  const publishPromises = variants.map((variant) => {
    const payload: BgTaskPayload = {
      campaign_id: campaignId,
      ...variant
    };
    return pubsub.topic(BG_TOPIC).publishMessage({ json: payload });
  });

  return Promise.all(publishPromises);
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

    if (!renderRequest.templates.length) {
      return reply.status(400).send({ error: "INVALID_PAYLOAD", message: "templates must contain at least one template" });
    }

    if (!renderRequest.inputs.length) {
      return reply.status(400).send({ error: "INVALID_PAYLOAD", message: "inputs must contain at least one campaign input" });
    }

    try {
      const variants = await buildVariantsFromRequest(renderRequest);
      const messageIds = await enqueueBackgroundTasks(renderRequest.campaign_id, variants);

      const campaignDoc = firestore.collection("campaign").doc(renderRequest.campaign_id);
      await campaignDoc.update({
        status: "rendering",
        render_variant_count: variants.length,
        render_variants: variants.map((variant) => ({
          variant_id: variant.variant_id,
          template: variant.template,
          tone: variant.tone,
          sizes: variant.sizes
        })),
        last_render_request_at: isoUtcNow(),
        updated_at: isoUtcNow()
      });

      return reply.status(202).send({
        job_enqueued: true,
        variants: variants.map((variant) => ({
          variant_id: variant.variant_id,
          template: variant.template,
          tone: variant.tone,
          sizes: variant.sizes
        })),
        message_ids: messageIds
      });
    } catch (error) {
      request.log.error({ err: error }, "failed to prepare render tasks");
      return reply.status(500).send({ error: "RENDER_PREP_FAILED", message: (error as Error).message });
    }
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
