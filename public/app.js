const btn = document.getElementById("download");
const status = document.getElementById("status");

const progress = document.getElementById("progress");
const bar = document.getElementById("bar");
const percentText = document.getElementById("percent");

const logsBox = document.getElementById("logs");
const fileInfo = document.getElementById("fileInfo");

const fileResolution = document.getElementById("fileResolution");
const fileSize = document.getElementById("fileSize");
const codecBadge = document.getElementById("codecBadge");

const urlInput = document.getElementById("url");
const qualitySelect = document.getElementById("quality");
const maxQualityToggle = document.getElementById("maxQuality");

const platformIcon = document.getElementById("platformIcon");
const platformText = document.getElementById("platformText");

let logSource = null;
let progressSource = null;

/* =====================================================
   PLATFORM AUTO-DETECT
===================================================== */
function detectPlatform(url) {
  const u = url.toLowerCase();

  if (u.includes("youtube.com") || u.includes("youtu.be")) {
    return { name: "YouTube", icon: "/icons/youtube.svg" };
  }

  if (u.includes("facebook.com") || u.includes("fb.watch")) {
    return { name: "Facebook", icon: "/icons/facebook.svg" };
  }

  return { name: "Paste a link", icon: "/icons/default.svg" };
}

urlInput.addEventListener("input", () => {
  const { name, icon } = detectPlatform(urlInput.value);
  platformIcon.src = icon;
  platformText.textContent = name;
  fileInfo.style.display = "none";
});

/* =====================================================
   PROBE VIDEO INFO
===================================================== */
async function fetchInfo(url, quality, allowAV1) {
  try {
    const res = await fetch("/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, quality, allowAV1 })
    });

    if (!res.ok) return;

    const data = await res.json();

    fileResolution.textContent = data.resolution || "—";
    fileSize.textContent = data.size || "—";

    codecBadge.textContent = data.codec || "—";
    codecBadge.className = "codec-badge";

    const c = (data.codec || "").toLowerCase();
    if (c.includes("264")) codecBadge.classList.add("h264");
    else if (c.includes("vp9")) codecBadge.classList.add("vp9");
    else if (c.includes("av1")) codecBadge.classList.add("av1");

    fileInfo.style.display = "block";
  } catch {
    fileInfo.style.display = "none";
  }
}

/* =====================================================
   LOG STREAM (SSE)
===================================================== */
function startLogs() {
  logsBox.style.display = "block";
  logsBox.textContent = "";

  logSource = new EventSource("/logs");
  logSource.onmessage = (e) => {
    logsBox.textContent += e.data.replace(/\\n/g, "\n") + "\n";
    logsBox.scrollTop = logsBox.scrollHeight;
  };
}

function stopLogs() {
  if (logSource) {
    logSource.close();
    logSource = null;
  }
  logsBox.style.display = "none";
}

/* =====================================================
   DOWNLOAD HANDLER
===================================================== */
btn.onclick = async () => {
  const url = urlInput.value.trim();
  const quality = qualitySelect.value;
  const allowAV1 = maxQualityToggle?.checked || false;

  if (!url) {
    status.textContent = "❌ Enter a valid URL";
    return;
  }

  // Pre-fetch info
  await fetchInfo(url, quality, allowAV1);

  // UI state
  btn.style.display = "none";
  progress.style.display = "block";
  bar.style.width = "0%";
  percentText.textContent = "0%";
  status.textContent = "⬇ Downloading…";

  // Progress SSE
  progressSource = new EventSource("/progress");
  progressSource.onmessage = (e) => {
    const p = Math.min(100, Number(e.data));
    bar.style.width = p + "%";
    percentText.textContent = p + "%";
  };

  startLogs();

  try {
    const res = await fetch("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, quality, allowAV1 })
    });

    if (!res.ok) throw new Error();

    const disposition = res.headers.get("Content-Disposition");
    let filename = "video.mp4";
    if (disposition?.includes("filename=")) {
      filename = disposition.split("filename=")[1].replace(/"/g, "");
    }

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    status.textContent = "✅ Download complete";
  } catch {
    status.textContent = "❌ Download failed";
  } finally {
    if (progressSource) {
      progressSource.close();
      progressSource = null;
    }
    stopLogs();
    btn.style.display = "block";
    progress.style.display = "none";
  }
};
