import assert from "node:assert/strict";
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

const app = express();
app.use((req, _res, next) => {
  Object.assign(req, { log: { error() {} } });
  next();
});
app.use("/api", createStorageRouter(lookupPublicObject));

let server: Server;
let baseUrl: string;

before(async () => {
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
