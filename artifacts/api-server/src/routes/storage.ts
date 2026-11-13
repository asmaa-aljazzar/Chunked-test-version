import { Router, type IRouter, type Request, type Response } from "express";
import { findPublicObject } from "../lib/publicObjectStorage";

const router: IRouter = Router();

router.get("/storage/public-objects/*path", async (req: Request, res: Response) => {
  try {
    const rawPath = req.params.path;
    const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const file = await findPublicObject(path);

    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
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
        const suffixLength = Number(match[2]);
        start = Math.max(size - suffixLength, 0);
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

    res.setHeader(
      "Content-Type",
      String(metadata.contentType ?? "application/octet-stream"),
    );
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const stream = file.createReadStream(
      start === undefined ? undefined : { start, end },
    );
    stream.on("error", (error) => {
      req.log.error({ err: error }, "Error streaming public object");
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res.status(status));
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;
