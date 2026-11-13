import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Storage } from "@google-cloud/storage";

const sidecarEndpoint = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${sidecarEndpoint}/token`,
    type: "external_account",
    credential_source: {
      url: `${sidecarEndpoint}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const searchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);
if (searchPaths.length === 0) {
  throw new Error("PUBLIC_OBJECT_SEARCH_PATHS is not configured");
}

function parseSearchPath(path) {
  const normalized = path.replace(/^\/+/, "");
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator === normalized.length - 1) {
    throw new Error("Invalid public object search path");
  }
  return {
    bucketName: normalized.slice(0, separator),
    prefix: normalized.slice(separator + 1).replace(/\/+$/, ""),
  };
}

const { bucketName, prefix } = parseSearchPath(searchPaths[0]);
const localMediaDir = resolve(
  import.meta.dirname,
  "../../chunked/laravel/storage/app/public/focus-media",
);
const assets = [
  {
    fileName: "magical-moments.mp3",
    contentType: "audio/mpeg",
  },
  {
    fileName: "teto-miku-halloween.mp4",
    contentType: "video/mp4",
  },
];

for (const asset of assets) {
  const bytes = await readFile(resolve(localMediaDir, asset.fileName));
  const objectName = `${prefix}/focus-media/${asset.fileName}`;
  await storage
    .bucket(bucketName)
    .file(objectName)
    .save(bytes, {
      resumable: false,
      metadata: {
        contentType: asset.contentType,
        cacheControl: "public, max-age=3600",
      },
    });
  console.log(`Uploaded focus-media/${asset.fileName} (${bytes.length} bytes)`);
}
