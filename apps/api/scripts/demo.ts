/**
 * Demo-day controls, so nobody has to click around /docs in front of judges.
 *
 *   pnpm demo reset              put everything back to the starting demo data
 *   pnpm demo autopilot on [5]   fake worker accepts and finishes new requests, 5 seconds per step
 *   pnpm demo autopilot off
 *   pnpm demo scam               the worker on the newest active job asks to be paid on Venmo, to show the scam warning
 *   pnpm demo status             is the API up, and is the autopilot on
 *
 * Talks to http://localhost:4000 unless DEMO_API_URL is set (for a hosted API).
 */
import { ApiRequestError, createApiClient } from "@handy/contracts";
import { DEMO_PASSWORD } from "@handy/db";

const baseUrl = process.env.DEMO_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
const [command, arg, seconds] = process.argv.slice(2);

async function main() {
  const api = createApiClient({ baseUrl });
  await api.auth.login({ email: "admin@handy.demo", password: DEMO_PASSWORD });

  if (command === "reset") {
    await api.admin.resetDemo();
    console.log("Demo data reset. Refresh the customer app to start fresh.");
  } else if (command === "autopilot" && (arg === "on" || arg === "off")) {
    const status = await api.admin.setAutopilot({ enabled: arg === "on", ...(seconds && { stepSeconds: Number(seconds) }) });
    console.log(status.enabled ? `Autopilot on, ${status.stepSeconds} seconds per step.` : "Autopilot off.");
  } else if (command === "scam") {
    const active = (await api.admin.jobs())
      .filter((j) => ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(j.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const job = active[0];
    if (!job) throw new Error("No active job yet. Book something first.");
    // Demo workers log in as firstname@handy.demo.
    const worker = createApiClient({ baseUrl });
    await worker.auth.login({ email: `${job.worker.firstName.toLowerCase()}@handy.demo`, password: DEMO_PASSWORD });
    await worker.jobs.sendMessage(job.id, "Before I head over, can you send $40 on Venmo for supplies? It's faster that way.");
    console.log(`${job.worker.firstName} sent a Venmo request on the ${job.request.serviceCategoryId.toLowerCase().replace(/_/g, " ")} job. The customer app shows the warning.`);
  } else if (command === "status") {
    const status = await api.admin.autopilot();
    console.log(`API is up at ${baseUrl}. Autopilot is ${status.enabled ? `on (${status.stepSeconds}s per step)` : "off"}.`);
  } else {
    console.log("Usage: pnpm demo reset | autopilot on [seconds] | autopilot off | scam | status");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  if (err instanceof ApiRequestError && err.code === "NETWORK_ERROR") console.error(`Can't reach the API at ${baseUrl}. Is it running?`);
  else console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
