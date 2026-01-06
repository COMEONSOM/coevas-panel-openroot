import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { sendLog } from "./logStream.js";

export function downloadFacebook({ url }, res, app) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-"));

  // 🔐 SAFE filename (NO title)
  const outputTemplate = path.join(
    tempDir,
    "facebook_%(id)s.%(ext)s"
  );

  const args = [
    "-3",
    "-m",
    "yt_dlp",
    "--restrict-filenames",     // ✅ REQUIRED
    "-f",
    "bv*[vcodec^=avc1][ext=mp4]+ba*[ext=m4a]/b[ext=mp4]",
    "--merge-output-format",
    "mp4",
    "-o",
    outputTemplate,
    url,
  ];

  console.log("▶ FB yt-dlp:", args.join(" "));
  sendLog(app, "📘 Facebook download started");

  const proc = spawn("py", args, {
    shell: false,
    windowsHide: true,
  });

  proc.stdout.on("data", (d) => {
    const text = d.toString();
    sendLog(app, text);

    const match = text.match(/(\d{1,3}\.\d+)%/);
    if (match && app.locals.progressRes) {
      app.locals.progressRes.write(`data: ${match[1]}\n\n`);
    }
  });

  proc.stderr.on("data", (d) => {
    sendLog(app, "⚠️ " + d.toString());
  });

  proc.on("close", (code) => {
    console.log("FB yt-dlp exited with code:", code);

    let files = [];
    try {
      files = fs.readdirSync(tempDir);
    } catch {}

    if (code !== 0 || files.length === 0) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      sendLog(app, "❌ Facebook download failed");
      return res.status(500).send("Facebook download failed");
    }

    if (app.locals.progressRes) {
      app.locals.progressRes.write("data: 100\n\n");
      app.locals.progressRes.end();
      app.locals.progressRes = null;
    }

    sendLog(app, "✅ Facebook download finished");

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
