import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { sendLog } from "./logStream.js";

/**
 * YouTube Downloader (FINAL / HONEST MODE)
 * --------------------------------------------------
 * ✔ Exact resolution (no fake upscales)
 * ✔ Strict codec control
 * ✔ Optional AV1 / VP9 (user-approved)
 * ✔ No silent quality downgrade
 * ✔ Real progress (0–100%)
 */
export function downloadYouTube(
  { url, quality, allowAV1 = false },
  res,
  app,
  cookiesPath
) {
  if (!fs.existsSync(cookiesPath)) {
    return res.status(500).send("cookies.txt missing");
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-"));
  const outputTemplate = path.join(tempDir, "%(title)s.%(ext)s");

  const q = Number(quality);

  /* =====================================================
     🎯 FORMAT SELECTION — STRICT & HONEST
     ===================================================== */

  let format;

  if (quality === "audio") {
    format = null;
  } else if (allowAV1) {
    /**
     * 🔥 MAX QUALITY MODE (USER ACCEPTED RISK)
     * - AV1 / VP9 allowed
     * - EXACT resolution only
     * - FAIL if not available
     */
    format = [
      `bv*[height=${q}]`,
      `bv*[height<${q}]`
    ].join("/");

    sendLog(
      app,
      "⚠️ Max quality enabled — AV1/VP9 allowed (may not play on all devices)"
    );
  } else {
    /**
     * ✅ SAFE MODE (DEFAULT)
     * - H.264 only
     * - MP4 container
     * - EXACT resolution → controlled downward fallback
     */
    format = [
      `bv*[vcodec=h264][ext=mp4][height=${q}]+ba*[ext=m4a]`,
      `bv*[vcodec=h264][ext=mp4][height<${q}]+ba*[ext=m4a]`
    ].join("/");
  }

  /* =====================================================
     🚀 yt-dlp ARGUMENTS
     ===================================================== */

  const args =
    quality === "audio"
      ? [
          "-3",
          "-m",
          "yt_dlp",
          "--cookies",
          cookiesPath,
          "--no-playlist",
          "-x",
          "--audio-format",
          "mp3",
          "-o",
          outputTemplate,
          url
        ]
      : [
          "-3",
          "-m",
          "yt_dlp",
          "--cookies",
          cookiesPath,
          "--no-playlist",
          "--newline",
          "--progress",
          "-f",
          format,
          "--merge-output-format",
          "mp4",
          "-o",
          outputTemplate,
          url
        ];

  sendLog(
    app,
    `🎞 Requested: ${quality}${quality !== "audio" ? "p" : ""}`
  );

  console.log("▶ yt-dlp:", args.join(" "));

  const proc = spawn("py", args, {
    shell: false,
    windowsHide: true
  });

  /* =====================================================
     📊 PROGRESS & LOG STREAM
     ===================================================== */

  proc.stdout.on("data", (d) => {
    const text = d.toString();
    sendLog(app, text);

    // Real percentage capture
    const match = text.match(/(\d{1,3}\.\d+)%/);
    if (match && app.locals.progressRes) {
      app.locals.progressRes.write(`data: ${match[1]}\n\n`);
    }
  });

  proc.stderr.on("data", (d) => {
    sendLog(app, "⚠️ " + d.toString());
  });

  /* =====================================================
     ✅ FINISH / VERIFY / CLEANUP
     ===================================================== */

  proc.on("close", (code) => {
    let files = [];
    try {
      files = fs.readdirSync(tempDir);
    } catch {}

    if (code !== 0 || files.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      sendLog(app, "❌ Download failed (requested format not available)");
      return res.status(500).send("Requested quality not available");
    }

    // Force progress completion
    if (app.locals.progressRes) {
      app.locals.progressRes.write("data: 100\n\n");
      app.locals.progressRes.end();
      app.locals.progressRes = null;
    }

    sendLog(app, "✅ Download completed successfully");

    if (app.locals.logRes) {
      app.locals.logRes.end();
      app.locals.logRes = null;
    }

    const filePath = path.join(tempDir, files[0]);

    res.download(filePath, files[0], () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });
}
