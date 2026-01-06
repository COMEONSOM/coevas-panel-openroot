import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { sendLog } from "./logStream.js";

/**
 * YouTube Downloader
 * - Exact resolution selection
 * - Smart fallback
 * - Optional AV1 (max quality)
 * - Codec awareness
 */
export function downloadYouTube(
  { url, quality, allowAV1 },
  res,
  app,
  cookiesPath
) {
  if (!fs.existsSync(cookiesPath)) {
    return res.status(500).send("cookies.txt missing");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-"));
  const output = path.join(tempDir, "%(title)s.%(ext)s");

  const q = Number(quality);

  let format;

  if (quality === "audio") {
    format = null;
  } else if (allowAV1) {
    // 🔥 MAX QUALITY MODE (AV1 allowed)
    format = [
      `bv*[height=${q}]`,
      `bv*[height<=${q}]`,
      `bestvideo+bestaudio/best`
    ].join("/");
    sendLog(app, "⚠️ AV1 allowed (may not play on all devices)");
  } else {
    // ✅ SAFE MODE (H.264 fallback)
    format = [
      `bv*[vcodec=h264][height=${q}][ext=mp4]+ba*[ext=m4a]`,
      `bv*[vcodec=h264][height<=${q}][ext=mp4]+ba*[ext=m4a]`,
      `best[ext=mp4]`
    ].join("/");
  }

  const args =
    quality === "audio"
      ? [
          "-3",
          "-m",
          "yt_dlp",
          "--cookies",
          cookiesPath,
          "-x",
          "--audio-format",
          "mp3",
          "-o",
          output,
          url
        ]
      : [
          "-3",
          "-m",
          "yt_dlp",
          "--cookies",
          cookiesPath,
          "-f",
          format,
          "--merge-output-format",
          "mp4",
          "-o",
          output,
          url
        ];

  sendLog(app, `🎞 Requested: ${quality}p`);
  console.log("▶ YT yt-dlp:", args.join(" "));

  const proc = spawn("py", args, { shell: false, windowsHide: true });

  proc.stdout.on("data", (d) => {
    const text = d.toString();
    sendLog(app, text);

    const m = text.match(/(\d{1,3}\.\d+)%/);
    if (m && app.locals.progressRes) {
      app.locals.progressRes.write(`data: ${m[1]}\n\n`);
    }
  });

  proc.stderr.on("data", (d) => sendLog(app, "⚠️ " + d.toString()));

  proc.on("close", (code) => {
    let files = [];
    try {
      files = fs.readdirSync(tempDir);
    } catch {}

    if (code !== 0 || !files.length) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      sendLog(app, "❌ Download failed");
      return res.status(500).send("yt-dlp failed");
    }

    if (app.locals.progressRes) {
      app.locals.progressRes.write("data: 100\n\n");
      app.locals.progressRes.end();
      app.locals.progressRes = null;
    }

    sendLog(app, "✅ Download complete");

    if (app.locals.logRes) {
      app.locals.logRes.end();
      app.locals.logRes = null;
    }

    const filePath = path.join(tempDir, files[0]);
    res.download(filePath, files[0], () =>
      fs.rmSync(tempDir, { recursive: true, force: true })
    );
  });
}
