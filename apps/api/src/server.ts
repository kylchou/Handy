import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const { app } = await buildApp({ config });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });
