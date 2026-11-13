import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";
import express from "express";
import {
  createStorageRouter,
  type PublicObjectFile,
  type PublicObjectLookup,
} from "./storage";
import { createFocusMediaRouter } from "./focusMedia";
import {
  verifyFocusMediaCapability,
  type FocusMediaStorage,
} from "../lib/focusMediaStorage";

const audioBytes = Buffer.from("calm audio sample");
const videoBytes = Buffer.from("video frame data");

function makeFile(bytes: Buffer, contentType: string): PublicObjectFile {
  return {
    async getMetadata() {
      return [{ size: bytes.length, contentType }];
    },
    createReadStream(options) {
      const start = options?.start ?? 0;
      const end = (options?.end ?? bytes.length - 1) + 1;
      return Readable.from([bytes.subarray(start, end)]);
    },
  };
}

const files = new Map<string, PublicObjectFile>([
  ["focus-media/room.mp3", makeFile(audioBytes, "audio/mpeg")],
  ["focus-media/room.mp4", makeFile(videoBytes, "video/mp4")],
]);
const lookupPublicObject: PublicObjectLookup = async (path) =>
  files.get(path) ?? null;
const privateFiles = new Map<string, Buffer>();
const privateMediaStorage: FocusMediaStorage = {
  async getUploadUrl(path) {
    return `https://upload.example.test/${path}`;
  },
  async getFile(path) {
    const bytes = privateFiles.get(path);
    if (!bytes) return null;
    return {
      async getMetadata() {
        return [{ size: bytes.length, contentType: "video/mp4" }];
      },
      createReadStream(options) {
        const start = options?.start ?? 0;
        const end = (options?.end ?? bytes.length - 1) + 1;
        return Readable.from([bytes.subarray(start, end)]);
      },
      async delete() {
        privateFiles.delete(path);
      },
    };
  },
  async deleteFile(path) {
    privateFiles.delete(path);
  },
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, { log: { error() {} } });
  next();
});
app.use("/api", createStorageRouter(lookupPublicObject));
app.use("/api", createFocusMediaRouter(privateMediaStorage));

let server: Server;
let baseUrl: string;

before(async () => {
  process.env.SESSION_SECRET = "unit-test-focus-secret";
  server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not bind to a TCP port");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    server.close();
    await once(server, "close");
  }
});

function signedCapability(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

test("private focus media URLs require a valid, matching owner capability", async () => {
  const path = "focus-media/42/85b6f5c2-75df-4a68-8ae7-a3d166199f44.mp4";
  const now = Math.floor(Date.now() / 1000);
  privateFiles.set(path, videoBytes);

  const validToken = signedCapability({
    action: "read", userId: "42", path, mimeType: "video/mp4", size: videoBytes.length, exp: now + 600,
  });
  const response = await fetch(`${baseUrl}/api/storage/focus-media/${path}?token=${validToken}`, {
    headers: { Range: "bytes=2-7" },
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), videoBytes.subarray(2, 8));

  const wrongOwner = signedCapability({
    action: "read", userId: "43", path, mimeType: "video/mp4", size: videoBytes.length, exp: now + 600,
  });
  const forbidden = await fetch(`${baseUrl}/api/storage/focus-media/${path}?token=${wrongOwner}`);
  assert.equal(forbidden.status, 403);

  const expired = signedCapability({
    action: "read", userId: "42", path, mimeType: "video/mp4", size: videoBytes.length, exp: now - 1,
  });
  const expiredResponse = await fetch(`${baseUrl}/api/storage/focus-media/${path}?token=${expired}`);
  assert.equal(expiredResponse.status, 403);
});

test("upload and delete endpoints require signed capabilities", async () => {
  const path = "focus-media/42/85b6f5c2-75df-4a68-8ae7-a3d166199f44.mp4";
  const exp = Math.floor(Date.now() / 1000) + 600;
  const token = signedCapability({
    action: "upload", userId: "42", path, mimeType: "video/mp4", size: videoBytes.length, exp,
  });
  const upload = await fetch(`${baseUrl}/api/storage/focus-media/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(upload.status, 200);
  assert.deepEqual(await upload.json(), {
    uploadURL: `https://upload.example.test/${path}`,
    objectPath: `/objects/${path}`,
  });

  privateFiles.set(path, videoBytes);
  const confirmed = await fetch(`${baseUrl}/api/storage/focus-media/confirm-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(confirmed.status, 200);
  const confirmedData = await confirmed.json() as { confirmation?: string };
  assert.equal(verifyFocusMediaCapability(confirmedData.confirmation)?.action, "confirmed");

  const deleteToken = signedCapability({ action: "delete", userId: "42", path, exp });
  const deleted = await fetch(`${baseUrl}/api/storage/focus-media/${path}?token=${deleteToken}`, {
    method: "DELETE",
  });
  assert.equal(deleted.status, 204);
  assert.equal(privateFiles.has(path), false);

  const readToken = signedCapability({
    action: "read", userId: "42", path, mimeType: "video/mp4", size: videoBytes.length, exp,
  });
  const wrongAction = await fetch(`${baseUrl}/api/storage/focus-media/${path}?token=${readToken}`, {
    method: "DELETE",
  });
  assert.equal(wrongAction.status, 403);
});

for (const scenario of [
  {
    name: "audio",
    path: "room.mp3",
    contentType: "audio/mpeg",
    bytes: audioBytes,
  },
  {
    name: "video",
    path: "room.mp4",
    contentType: "video/mp4",
    bytes: videoBytes,
  },
]) {
  test(`serves ${scenario.name} content with its type and byte ranges`, async () => {
    const url = `${baseUrl}/api/storage/public-objects/focus-media/${scenario.path}`;
    const fullResponse = await fetch(url);

    assert.equal(fullResponse.status, 200);
    assert.equal(fullResponse.headers.get("content-type"), scenario.contentType);
    assert.equal(fullResponse.headers.get("accept-ranges"), "bytes");
    assert.deepEqual(
      Buffer.from(await fullResponse.arrayBuffer()),
      scenario.bytes,
    );

    const rangeStart = 2;
    const rangeEnd = 7;
    const rangeResponse = await fetch(url, {
      headers: { Range: `bytes=${rangeStart}-${rangeEnd}` },
    });
    const expectedRange = scenario.bytes.subarray(rangeStart, rangeEnd + 1);

    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get("content-type"), scenario.contentType);
    assert.equal(
      rangeResponse.headers.get("content-range"),
      `bytes ${rangeStart}-${rangeEnd}/${scenario.bytes.length}`,
    );
    assert.equal(
      rangeResponse.headers.get("content-length"),
      String(expectedRange.length),
    );
    assert.deepEqual(
      Buffer.from(await rangeResponse.arrayBuffer()),
      expectedRange,
    );
  });
}

test("returns 404 when the requested object is missing", async () => {
  const response = await fetch(
    `${baseUrl}/api/storage/public-objects/focus-media/missing.mp3`,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "File not found" });
});

for (const range of ["bytes=99-100", "not-a-byte-range"]) {
  test(`returns 416 for invalid range ${range}`, async () => {
    const response = await fetch(
      `${baseUrl}/api/storage/public-objects/focus-media/room.mp3`,
      { headers: { Range: range } },
    );

    assert.equal(response.status, 416);
    assert.equal(
      response.headers.get("content-range"),
      `bytes */${audioBytes.length}`,
    );
  });
}
