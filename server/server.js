import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";
import { downloadYouTube } from "./youtube.js";
import { downloadFacebook } from "./facebook.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const COOKIES_PATH = path.join(__dirname, "cookies.txt");

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

/* ===========================
   DOWNLOAD ROUTE
=========================== */
app.post("/download", (req, res) => {
  const { url, quality, allowAV1 = false } = req.body;

  if (!url) return res.status(400).send("URL required");

  // Facebook
  if (url.includes("facebook.com") || url.includes("fb.watch")) {
    return downloadFacebook({ url }, res, app);
  }

  // YouTube
  return downloadYouTube(
    { url, quality, allowAV1 },
    res,
    app,
    COOKIES_PATH
  );
});

/* ===========================
   PROGRESS (SSE)
=========================== */
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  app.locals.progressRes = res;
  req.on("close", () => (app.locals.progressRes = null));
});

/* ===========================
   LOGS (SSE)
=========================== */
app.get("/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  app.locals.logRes = res;
  req.on("close", () => (app.locals.logRes = null));
});

/* ===========================
   INFO (PRE-DOWNLOAD PROBE)
=========================== */
app.post("/info", (req, res) => {
  const { url, quality, allowAV1 = false } = req.body;

  const format = allowAV1
    ? `bv*[height=${quality}]/bv*[height<=${quality}]`
    : `bv*[vcodec=h264][height=${quality}]/bv*[vcodec=h264][height<=${quality}]`;

  const args = ["-3", "-m", "yt_dlp", "-f", format, "-j", url];
  const out = spawnSync("py", args, { encoding: "utf8" });

  if (!out.stdout) return res.status(500).end();

  const info = JSON.parse(out.stdout);
  const size =
    info.filesize ||
    info.filesize_approx ||
    info.requested_formats?.reduce(
      (a, f) => a + (f.filesize || 0),
      0
    );

  res.json({
    resolution: `${info.height || "?"}p`,
    codec: info.vcodec?.toUpperCase() || "UNKNOWN",
    size: `${(size / 1024 / 1024).toFixed(2)} MB`
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
