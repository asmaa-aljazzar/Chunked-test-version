import { createHmac, timingSafeEqual } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export interface FocusMediaFile {
  getMetadata(): Promise<
    [{ size?: string | number; contentType?: string | null }, ...unknown[]]
  >;
  createReadStream(options?: { start?: number; end?: number }): NodeJS.ReadableStream;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
}

export interface FocusMediaStorage {
  getUploadUrl(path: string): Promise<string>;
  getFile(path: string): Promise<FocusMediaFile | null>;
  deleteFile(path: string): Promise<void>;
}

function objectTarget(path: string): { bucket: string; object: string } {
  if (
    !/^focus-media\/\d+\/[a-f0-9-]+\.(mp3|m4a|aac|wav|ogg|webm|mp4|mov)$/i.test(path)
  ) {
    throw new Error("Invalid focus media path");
  }

  const privateDir = process.env.PRIVATE_OBJECT_DIR?.replace(/\/+$/, "");
  if (!privateDir) {
    throw new Error("PRIVATE_OBJECT_DIR is not configured");
  }

  const parts = `${privateDir}/${path}`.split("/").filter(Boolean);
  const bucket = parts.shift();
  const object = parts.join("/");
  if (!bucket || !object) {
    throw new Error("Invalid private object directory");
  }
  return { bucket, object };
}

export class AppFocusMediaStorage implements FocusMediaStorage {
  async getUploadUrl(path: string): Promise<string> {
    const target = objectTarget(path);
    const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: target.bucket,
        object_name: target.object,
        method: "PUT",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Failed to sign focus media upload (${response.status})`);
    }
    const body = (await response.json()) as { signed_url?: string };
    if (!body.signed_url) {
      throw new Error("The storage service did not return an upload URL");
    }
    return body.signed_url;
  }

  async getFile(path: string): Promise<FocusMediaFile | null> {
    const target = objectTarget(path);
    const file = storage.bucket(target.bucket).file(target.object);
    const [exists] = await file.exists();
    return exists ? file : null;
  }

  async deleteFile(path: string): Promise<void> {
    const target = objectTarget(path);
    await storage.bucket(target.bucket).file(target.object).delete({ ignoreNotFound: true });
  }
}

export const focusMediaStorage = new AppFocusMediaStorage();

export function isValidFocusMediaPath(path: string, userId: string): boolean {
  return path.startsWith(`focus-media/${userId}/`)
    && /^focus-media\/\d+\/[a-f0-9-]+\.(mp3|m4a|aac|wav|ogg|webm|mp4|mov)$/i.test(path);
}

export type FocusMediaCapability = {
  action: "upload" | "read" | "delete" | "confirmed";
  userId: string;
  path: string;
  mimeType?: string;
  size?: number;
  exp: number;
};

export function verifyFocusMediaCapability(token: unknown): FocusMediaCapability | null {
  if (typeof token !== "string") return null;
  const [encoded, signature, ...rest] = token.split(".");
  const secret = process.env.SESSION_SECRET;
  if (!encoded || !signature || rest.length || !secret) return null;

  let payload: FocusMediaCapability;
  try {
    const expected = Buffer.from(
      createHmacSignature(encoded, secret),
      "base64url",
    );
    const received = Buffer.from(signature, "base64url");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return null;
    }
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as FocusMediaCapability;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    !["upload", "read", "delete", "confirmed"].includes(payload.action)
    || typeof payload.userId !== "string"
    || !/^\d+$/.test(payload.userId)
    || typeof payload.path !== "string"
    || !isValidFocusMediaPath(payload.path, payload.userId)
    || !Number.isInteger(payload.exp)
    || payload.exp <= now
    || payload.exp > now + 8 * 24 * 60 * 60
    || (payload.action !== "delete" && (
      typeof payload.mimeType !== "string"
      || !/^(audio\/(mpeg|mp4|aac|wav|x-wav|ogg|webm)|video\/(mp4|webm|quicktime))$/.test(payload.mimeType)
      || !Number.isSafeInteger(payload.size)
      || Number(payload.size) < 1
      || Number(payload.size) > 100 * 1024 * 1024
    ))
  ) {
    return null;
  }
  return payload;
}

export function signFocusMediaCapability(claims: FocusMediaCapability): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${encoded}.${createHmacSignature(encoded, secret)}`;
}

function createHmacSignature(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}
