const btn = document.getElementById("download");
const status = document.getElementById("status");
const bar = document.getElementById("bar");
const progress = document.getElementById("progress");

btn.onclick = async () => {
  const url = document.getElementById("url").value.trim();
  const quality = document.getElementById("quality").value;

  if (!url) {
    status.textContent = "❌ Enter a valid URL";
    return;
  }

  // UI switch
  btn.style.display = "none";
  progress.style.display = "block";
  bar.style.width = "0%";
  status.textContent = "⬇ Downloading...";

  // 🔥 Listen for progress
  const evtSource = new EventSource("/progress");

  evtSource.onmessage = (e) => {
    const percent = Number(e.data);
    bar.style.width = percent + "%";
  };

  try {
    const res = await fetch("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, quality }),
    });

    if (!res.ok) throw new Error("Download failed");

    const disposition = res.headers.get("Content-Disposition");
    let filename = "video.mp4";

    if (disposition && disposition.includes("filename=")) {
      filename = disposition.split("filename=")[1].replace(/"/g, "");
    }

    const blob = await res.blob();
    if (blob.size === 0) throw new Error("Empty file");

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    status.textContent = "✅ Download complete";
  } catch (err) {
    console.error(err);
    status.textContent = "❌ Download failed";
  } finally {
    evtSource.close();
    btn.style.display = "block";
    progress.style.display = "none";
  }
};
