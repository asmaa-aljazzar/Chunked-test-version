import { Router, type IRouter, type Request, type Response } from "express";
import {
  focusMediaStorage,
  isValidFocusMediaPath,
  signFocusMediaCapability,
  type FocusMediaStorage,
  verifyFocusMediaCapability,
} from "../lib/focusMediaStorage";

export function createFocusMediaRouter(
  mediaStorage: FocusMediaStorage = focusMediaStorage,
): IRouter {
  const router: IRouter = Router();

  router.post("/storage/focus-media/upload-url", async (req: Request, res: Response) => {
    const capability = verifyFocusMediaCapability(req.body?.token);
    if (!capability || capability.action !== "upload") {
      res.status(403).json({ error: "Upload authorization is invalid or expired" });
      return;
    }

    try {
      const uploadURL = await mediaStorage.getUploadUrl(capability.path);
      res.json({ uploadURL, objectPath: `/objects/${capability.path}` });
    } catch (error) {
      req.log.error({ err: error }, "Error creating private focus media upload URL");
      res.status(503).json({ error: "Focus media storage is unavailable" });
    }
  });

  router.post("/storage/focus-media/confirm-upload", async (req: Request, res: Response) => {
    const capability = verifyFocusMediaCapability(req.body?.token);
    if (!capability || capability.action !== "upload") {
      res.status(403).json({ error: "Upload authorization is invalid or expired" });
      return;
    }

    try {
      const file = await mediaStorage.getFile(capability.path);
      if (!file) {
        res.status(404).json({ error: "Uploaded media was not found" });
        return;
      }
      const [metadata] = await file.getMetadata();
      if (
        Number(metadata.size) !== capability.size
        || String(metadata.contentType ?? "") !== capability.mimeType
      ) {
        await mediaStorage.deleteFile(capability.path);
        res.status(422).json({ error: "Uploaded file does not match the authorized media type and size" });
        return;
      }
      const confirmation = signFocusMediaCapability({
        ...capability,
        action: "confirmed",
      });
      res.json({ confirmation });
    } catch (error) {
      req.log.error({ err: error }, "Error confirming private focus media upload");
      res.status(503).json({ error: "Focus media storage is unavailable" });
    }
  });

  router.get("/storage/focus-media/*path", async (req: Request, res: Response) => {
    const rawPath = req.params.path;
    const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const capability = verifyFocusMediaCapability(req.query.token);
    if (
      !capability
      || capability.action !== "read"
      || capability.path !== path
      || !isValidFocusMediaPath(path, capability.userId)
    ) {
      res.status(403).json({ error: "Media access is invalid or expired" });
      return;
    }

    try {
      const file = await mediaStorage.getFile(path);
      if (!file) {
        res.status(404).json({ error: "Media not found" });
        return;
      }

      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size ?? 0);
      if (
        size !== capability.size
        || String(metadata.contentType ?? "") !== capability.mimeType
      ) {
        await mediaStorage.deleteFile(path);
        res.status(404).json({ error: "Media not found" });
        return;
      }
      const range = req.headers.range;
      let start: number | undefined;
      let end: number | undefined;
      let status = 200;

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || size <= 0 || (!match[1] && !match[2])) {
          res.setHeader("Content-Range", `bytes */${size}`);
          res.status(416).end();
          return;
        }
        if (!match[1]) {
          start = Math.max(size - Number(match[2]), 0);
          end = size - 1;
        } else {
          start = Number(match[1]);
          end = match[2] ? Number(match[2]) : size - 1;
        }
        if (start < 0 || end < start || start >= size) {
          res.setHeader("Content-Range", `bytes */${size}`);
          res.status(416).end();
          return;
        }
        end = Math.min(end, size - 1);
        status = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
        res.setHeader("Content-Length", String(end - start + 1));
      } else if (size > 0) {
        res.setHeader("Content-Length", String(size));
      }

      res.setHeader("Content-Type", String(metadata.contentType ?? "application/octet-stream"));
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "inline");
      if (req.method === "HEAD") {
        res.status(status).end();
        return;
      }

      const stream = file.createReadStream(start === undefined ? undefined : { start, end });
      stream.on("error", (error) => {
        req.log.error({ err: error }, "Error streaming private focus media");
        if (!res.headersSent) res.status(500).end();
        else res.destroy(error);
      });
      stream.pipe(res.status(status));
    } catch (error) {
      req.log.error({ err: error }, "Error serving private focus media");
      res.status(503).json({ error: "Focus media storage is unavailable" });
    }
  });

  router.delete("/storage/focus-media/*path", async (req: Request, res: Response) => {
    const rawPath = req.params.path;
    const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const capability = verifyFocusMediaCapability(req.query.token);
    if (
      !capability
      || capability.action !== "delete"
      || capability.path !== path
      || !isValidFocusMediaPath(path, capability.userId)
    ) {
      res.status(403).json({ error: "Delete authorization is invalid or expired" });
      return;
    }

    try {
      await mediaStorage.deleteFile(path);
      res.status(204).end();
    } catch (error) {
      req.log.error({ err: error }, "Error deleting private focus media");
      res.status(503).json({ error: "Focus media storage is unavailable" });
    }
  });

  return router;
}

export default createFocusMediaRouter();
