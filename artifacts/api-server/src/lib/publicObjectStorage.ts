import { Storage, type File } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
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

export function publicObjectSearchPaths(): string[] {
  const paths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);

  if (paths.length === 0) {
    throw new Error("PUBLIC_OBJECT_SEARCH_PATHS is not configured");
  }

  return paths;
}

export function publicObjectTarget(
  path: string,
): { bucketName: string; objectName: string } {
  const normalized = path.replace(/^\/+/, "");
  const separator = normalized.indexOf("/");
  if (separator <= 0 || separator === normalized.length - 1) {
    throw new Error("Invalid public object search path");
  }

  return {
    bucketName: normalized.slice(0, separator),
    objectName: normalized.slice(separator + 1),
  };
}

export async function findPublicObject(path: string): Promise<File | null> {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }

  for (const searchPath of publicObjectSearchPaths()) {
    const target = publicObjectTarget(`${searchPath}/${path}`);
    const file = objectStorageClient
      .bucket(target.bucketName)
      .file(target.objectName);
    const [exists] = await file.exists();
    if (exists) {
      return file;
    }
  }

  return null;
}
