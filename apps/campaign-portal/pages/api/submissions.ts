import type { NextApiRequest, NextApiResponse } from "next";

const WEBHOOK_URL = process.env.SUBMISSION_LOG_WEBHOOK;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const body = req.body;
  if (!WEBHOOK_URL) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[submission-log]", JSON.stringify(body, null, 2));
    }
    return res.status(204).end();
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Webhook failed", response.status, text);
      return res.status(502).json({ error: "failed to dispatch webhook" });
    }

    return res.status(204).end();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "log dispatch failed" });
  }
}
