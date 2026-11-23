// Local personal launcher: bind only to loopback, never expose the workspace to the network.
process.env.APP_ENV = "local";
process.env.NODE_ENV = "development";
process.env.AI_STUDIO_RUNTIME = "0";
process.env.HOST = "127.0.0.1";
process.env.PORT = process.env.PORT || "3000";
await import("../server/index.js");
