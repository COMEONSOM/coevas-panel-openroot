import express from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// path to cookies file
const COOKIES_PATH = path.join(__dirname, "cookies.txt");

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

/* ===========================
   DOWNLOAD ROUTE
=========================== */
app.post("/download", (req, res) => {
  const { url, quality } = req.body;

  if (!url) {
    return res.status(400).send("URL required");
  }

  if (!fs.existsSync(COOKIES_PATH)) {
    return res
      .status(500)
      .send("cookies.txt not found. Please export YouTube cookies.");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-"));
  const outputTemplate = path.join(tempDir, "%(title)s.%(ext)s");

  const args =
    quality === "audio"
      ? [
          "-3",
          "-m",
          "yt_dlp",
          "--cookies",
          COOKIES_PATH,
          "-x",
          "--audio-format",
          "mp3",
          "-o",
          outputTemplate,
          url,
        ]
      : [
          "-3",
          "-m",
          "yt_dlp",
          "--cookies",
          COOKIES_PATH,
          "-f",
          `bv*[vcodec=h264][height<=${quality}][ext=mp4]+ba*[ext=m4a]/b[ext=mp4]`,
          "--merge-output-format",
          "mp4",
          "-o",
          outputTemplate,
          url,
        ];

  console.log("▶ Running: py", args.join(" "));

  const proc = spawn("py", args, {
    shell: false,
    windowsHide: true,
  });

  /* 🔥 REAL PROGRESS PARSING */
  proc.stdout.on("data", (d) => {
    const text = d.toString();

    const match = text.match(/(\d{1,3}\.\d+)%/);
    if (match && app.locals.progressRes) {
      app.locals.progressRes.write(`data: ${match[1]}\n\n`);
    }

    console.log("[yt-dlp]", text);
  });

  proc.stderr.on("data", (d) =>
    console.error("[yt-dlp stderr]", d.toString())
  );

  proc.on("close", (code) => {
    console.log("yt-dlp exited with code:", code);

    let files = [];
    try {
      files = fs.readdirSync(tempDir);
    } catch {}

    console.log("Temp dir files:", files);

    if (code !== 0 || files.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(500).send("yt-dlp failed on server");
    }

    // force progress complete
    if (app.locals.progressRes) {
      app.locals.progressRes.write("data: 100\n\n");
      app.locals.progressRes.end();
      app.locals.progressRes = null;
    }

    const filePath = path.join(tempDir, files[0]);

    res.download(filePath, files[0], () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });
});

/* ===========================
   PROGRESS (SSE)
=========================== */
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders(); // 🔥 REQUIRED

  app.locals.progressRes = res;

  req.on("close", () => {
    app.locals.progressRes = null;
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
