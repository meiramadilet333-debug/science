import app from "./app";
import { logger } from "./lib/logger";
import { abortActiveOperations, integerSetting } from "./lib/operation-context";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exitCode = 1;
});

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "Draining server connections");
  const deadline = setTimeout(() => {
    abortActiveOperations();
    server.closeAllConnections();
  }, integerSetting("SHUTDOWN_GRACE_MS", 15_000, 120_000));
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
    logger.info("Server stopped");
  });
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
