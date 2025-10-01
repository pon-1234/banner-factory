import Fastify from "fastify";
import { Firestore } from "@google-cloud/firestore";
import fetch, { Headers } from "node-fetch";
import { DeliveryMessageSchema, isoUtcNow } from "@banner/shared";

const firestore = new Firestore();

const SLACK_WEBHOOK_URL = (process.env.SLACK_WEBHOOK_URL ?? "").trim();
const NOTION_API_KEY = (process.env.NOTION_API_KEY ?? "").trim();
const NOTION_DATABASE_ID = (process.env.NOTION_DATABASE_ID ?? "").trim();

async function postToSlack(payload: ReturnType<typeof DeliveryMessageSchema.parse>) {
  if (!SLACK_WEBHOOK_URL) {
    return;
  }
  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `✅ QC passed banner ready\nCampaign: ${payload.campaign_id}\nTemplate: ${payload.template}\nTone: ${payload.tone}\nSize: ${payload.size}\nPreview: ${payload.preview_url}`
    })
  });
}

async function postToNotion(payload: ReturnType<typeof DeliveryMessageSchema.parse>) {
  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    return;
  }
  const headers = new Headers({
    Authorization: `Bearer ${NOTION_API_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
  });
  const body = {
    parent: { database_id: NOTION_DATABASE_ID },
    properties: {
      Campaign: {
        title: [{ text: { content: payload.campaign_id } }]
      },
      Template: {
        select: { name: payload.template }
      },
      Tone: {
        select: { name: payload.tone }
      },
      Size: {
        rich_text: [{ text: { content: payload.size } }]
      },
      "Preview URL": {
        url: payload.preview_url
      }
    }
  };
  await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

async function markDelivered(payload: ReturnType<typeof DeliveryMessageSchema.parse>) {
  const renderJobId = `${payload.variant_id}-${payload.size}`;
  await firestore.collection("render_job").doc(renderJobId).set({
    render_job_id: renderJobId,
    campaign_id: payload.campaign_id,
    variant_id: payload.variant_id,
    size: payload.size,
    delivered_at: isoUtcNow(),
    status: "delivered",
    preview_url: payload.preview_url,
    updated_at: isoUtcNow()
  }, { merge: true });
  await firestore.collection("delivery_log").doc(renderJobId).set({
    ...payload,
    delivered_at: isoUtcNow()
  });
}

function decodeMessage(body: any) {
  if (!body?.message?.data) {
    throw new Error("Missing Pub/Sub message data");
  }
  const decoded = Buffer.from(body.message.data, "base64").toString("utf8");
  return DeliveryMessageSchema.parse(JSON.parse(decoded));
}

export function buildServer() {
  const app = Fastify({ logger: true });

  app.post("/tasks/delivery", async (request, reply) => {
    try {
      const payload = decodeMessage(request.body);
      await Promise.all([
        postToSlack(payload),
        postToNotion(payload),
        markDelivered(payload)
      ]);
      return reply.status(204).send();
    } catch (err) {
      request.log.error({ err }, "failed to deliver asset");
      return reply.status(500).send({ error: "DELIVERY_FAILED", message: (err as Error).message });
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
