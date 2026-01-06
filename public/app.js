const btn = document.getElementById("download");
const status = document.getElementById("status");
const bar = document.getElementById("bar");
const progress = document.getElementById("progress");
const logsBox = document.getElementById("logs");
const fileInfo = document.getElementById("fileInfo");

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
    return {
      name: "YouTube",
      icon: "/icons/youtube.svg"
    };
  }

  if (u.includes("facebook.com") || u.includes("fb.watch")) {
    return {
      name: "Facebook",
      icon: "/icons/facebook.svg"
    };
  }

  return {
    name: "Paste a link",
    icon: "/icons/default.svg"
  };
}

urlInput.addEventListener("input", () => {
  const { name, icon } = detectPlatform(urlInput.value);
  platformIcon.src = icon;
  platformText.textContent = name;

  fileInfo.style.display = "none";
});

/* =====================================================
   PROBE VIDEO INFO (SIZE / CODEC / RESOLUTION)
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

    fileInfo.style.display = "block";
    fileInfo.innerHTML = `
      📐 <strong>Resolution:</strong> ${data.resolution}<br/>
      🎞 <strong>Codec:</strong> <span class="badge">${data.codec}</span><br/>
      📦 <strong>Size:</strong> ${data.size}
    `;
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

  // Preview info
  await fetchInfo(url, quality, allowAV1);

  // UI state
  btn.style.display = "none";
  progress.style.display = "block";
  bar.style.width = "0%";
  status.textContent = "⬇ Downloading…";

  // Progress SSE
  progressSource = new EventSource("/progress");
  progressSource.onmessage = (e) => {
    const p = Math.min(100, Number(e.data));
    bar.style.width = p + "%";
    bar.textContent = p + "%";
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
