import Fastify from "fastify";
import { Firestore } from "@google-cloud/firestore";
import { PubSub } from "@google-cloud/pubsub";
import { InputSchema, RenderRequestSchema, createHashId, isoUtcNow } from "@banner/shared";

const firestore = new Firestore();
const pubsub = new PubSub();

const RENDER_TOPIC = process.env.RENDER_TOPIC ?? "render-requests";

export function buildServer() {
  const app = Fastify({
    logger: true
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

    const messageId = await pubsub.topic(RENDER_TOPIC).publishMessage({
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
