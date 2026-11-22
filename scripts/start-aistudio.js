// Google AI Studio Build runtime entrypoint.
// The platform exposes only port 3000 and routes public traffic to 0.0.0.0.
process.env.AI_STUDIO_RUNTIME = "1";
process.env.APP_ENV = "production";
process.env.HOST = "0.0.0.0";
process.env.PORT = process.env.PORT || "3000";
if (!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length < 16) {
  console.error("[AI Studio] Falta el secreto APP_PASSWORD (mínimo 16 caracteres). Configuralo en Settings > Secrets antes de iniciar la aplicación.");
  process.exit(1);
}
await import("../server/index.js");
