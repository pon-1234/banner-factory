import type { NextApiRequest, NextApiResponse } from "next";
import { fetchPageMetadata } from "@/lib/metadata";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end();
  }
  const { url } = req.query;
  if (typeof url !== "string" || !url.startsWith("http")) {
    return res.status(400).json({ error: "url query parameter is required" });
  }
  try {
    const metadata = await fetchPageMetadata(url);
    return res.status(200).json(metadata);
  } catch (err) {
    console.error("metadata fetch failed", err);
    return res.status(500).json({ error: "metadata fetch failed" });
  }
}
