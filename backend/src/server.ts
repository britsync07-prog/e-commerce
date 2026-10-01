import http from "node:http";
import { buildApp } from "./app.js";
import { config } from "./shared/config.js";

const app = await buildApp();

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

const otherPort = config.port === 4001 ? 4000 : 4001;
try {
  const secondary = http.createServer((req, res) => {
    res.writeHead(307, { Location: `http://localhost:${config.port}${req.url || "/"}` });
    res.end();
  });
  secondary.on("error", () => {});
  secondary.listen(otherPort, "0.0.0.0");
} catch {}

