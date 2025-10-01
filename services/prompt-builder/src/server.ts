import Fastify from "fastify";
import { Firestore } from "@google-cloud/firestore";
import {
  buildPrompt,
  buildCopy,
  createHashId,
  isoUtcNow,
  slugify,
  TemplateCode,
  type CampaignInput,
  type AspectRatio,
  RenderRequestSchema,
  type CopyBlock
} from "@banner/shared";

const firestore = new Firestore();

const DEFAULT_TONE: Record<TemplateCode, "救済" | "緊急" | "権威"> = {
  T1: "救済",
  T2: "緊急",
  T3: "権威"
};

interface VariantContext {
  campaignId: string;
  template: TemplateCode;
  tone: "救済" | "緊急" | "権威";
  styleCode: "T1" | "T2" | "T3" | "AUTO";
  input: CampaignInput;
  refs?: string[];
  sizes: AspectRatio[];
}

interface VariantResult {
  variant_id: string;
  prompt: string;
  seed: string;
  template: TemplateCode;
  tone: "救済" | "緊急" | "権威";
  refs: string[];
  sizes: AspectRatio[];
  brand: string;
  slug: string;
  copy: CopyBlock;
}

function computeTone(template: TemplateCode, input: CampaignInput): "救済" | "緊急" | "権威" {
  return input.tone ?? DEFAULT_TONE[template];
}

async function upsertVariant(context: VariantContext): Promise<VariantResult> {
  const tone = context.tone;
  const { prompt, seed } = buildPrompt(context.input, {
    template: context.template,
    tone,
    refs: context.refs
  });
  const copy = buildCopy(context.input, context.template);
  const variantId = createHashId(
    "variant",
    `${context.campaignId}-${context.template}-${tone}-${context.styleCode}-${seed}`
  );
  const refsHash = context.refs?.length ? createHashId("refs", context.refs.join(","), 16) : undefined;
  const promptHash = createHashId("prompt", prompt, 24);
  const brandSlug = slugify(context.input.brand_name);

  const variantRef = firestore.collection("variant").doc(variantId);
  const baseData: any = {
    variant_id: variantId,
    campaign_id: context.campaignId,
    template: context.template,
    tone,
    style_code: context.styleCode === "AUTO" ? context.template : context.styleCode,
    prompt,
    prompt_hash: promptHash,
    seed,
    refs: context.refs ?? [],
    copy,
    sizes: context.sizes,
    brand: context.input.brand_name,
    slug: brandSlug,
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

  return {
    variant_id: variantId,
    prompt,
    seed,
    template: context.template,
    tone,
    refs: context.refs ?? [],
    sizes: context.sizes,
    brand: context.input.brand_name,
    slug: brandSlug,
    copy
  };
}

interface PromptTaskPayload {
  campaign_id: string;
  template: TemplateCode;
  tone?: "救済" | "緊急" | "権威";
  style_code: "T1" | "T2" | "T3" | "AUTO";
  refs?: string[];
  input: CampaignInput;
  sizes: AspectRatio[];
}

function decodeMessage(body: any): PromptTaskPayload {
  if (!body?.message?.data) {
    throw new Error("Missing Pub/Sub message data");
  }
  const decoded = Buffer.from(body.message.data, "base64").toString("utf8");
  return JSON.parse(decoded) as PromptTaskPayload;
}

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  app.post("/tasks/prompt-builder", async (request, reply) => {
    try {
      const payload = decodeMessage(request.body);
      await upsertVariant({
        campaignId: payload.campaign_id,
        template: payload.template,
        tone: payload.tone ?? computeTone(payload.template, payload.input),
        styleCode: payload.style_code,
        input: payload.input,
        refs: payload.refs,
        sizes: payload.sizes
      });
      return reply.status(204).send();
    } catch (err) {
      request.log.error({ err }, "failed to process prompt task");
      return reply.status(400).send({ error: "INVALID_TASK", message: (err as Error).message });
    }
  });

  app.post("/workflows/variants", async (request, reply) => {
    try {
      const body = request.body as {
        campaign_id: string;
        template: TemplateCode;
        variant_index: number;
        request: unknown;
      };
      const renderRequest = RenderRequestSchema.parse(body.request);
      const inputIndex = body.variant_index % renderRequest.inputs.length;
      const selectedInput = renderRequest.inputs[inputIndex];
      const refs = [
        ...(selectedInput.reference_banners ?? []),
        ...(selectedInput.bg_style_refs ?? [])
      ];
      const result = await upsertVariant({
        campaignId: body.campaign_id,
        template: body.template,
        tone: computeTone(body.template, selectedInput),
        styleCode: selectedInput.style_code ?? "AUTO",
        input: selectedInput,
        refs,
        sizes: renderRequest.sizes
      });

      return reply.status(200).send(result);
    } catch (err) {
      request.log.error({ err }, "failed to build variant");
      return reply.status(400).send({ error: "VARIANT_BUILD_FAILED", message: (err as Error).message });
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
