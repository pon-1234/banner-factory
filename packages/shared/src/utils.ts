import crypto from "node:crypto";

export function createHashId(namespace: string, payload: string, length = 12): string {
  return crypto.createHash("sha256").update(`${namespace}:${payload}`).digest("hex").slice(0, length);
}

export function isoUtcNow(): string {
  return new Date().toISOString();
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();
}
