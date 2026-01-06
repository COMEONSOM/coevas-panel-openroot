export function sendLog(app, message) {
  if (!app.locals.logRes) return;

  // Prevent SSE breaking
  const safe = message.replace(/\r?\n/g, "\\n");

  app.locals.logRes.write(`data: ${safe}\n\n`);
}
