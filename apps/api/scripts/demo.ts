/**
 * Demo-day controls, so nobody has to click around /docs in front of judges.
 *
 *   pnpm demo reset              put everything back to the starting demo data
 *   pnpm demo autopilot on [5]   fake worker accepts new requests, then waits at "accepted"
 *   pnpm demo go                 the waiting job moves along: on the way, arrived, working, done (5 seconds per step)
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
    // Ready for the next run: the next job waits at "accepted" again.
    if ((await api.admin.autopilot()).enabled) await api.admin.setAutopilot({ enabled: true, hold: true });
    console.log("Demo data reset. Refresh the customer app to start fresh.");
  } else if (command === "autopilot" && (arg === "on" || arg === "off")) {
    const on = arg === "on";
    const status = await api.admin.setAutopilot({ enabled: on, ...(on && { hold: true }), ...(seconds && { stepSeconds: Number(seconds) }) });
    console.log(
      status.enabled
        ? `Autopilot on. New requests get accepted, then wait until you run "pnpm demo go" (${status.stepSeconds} seconds per step after that).`
        : "Autopilot off.",
    );
  } else if (command === "go") {
    const status = await api.admin.setAutopilot({ enabled: true, hold: false });
    console.log(`Going. The job moves along every ${status.stepSeconds} seconds until it's done.`);
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
    const state = status.enabled ? `on (${status.hold ? "waiting for pnpm demo go" : `${status.stepSeconds}s per step`})` : "off";
    console.log(`API is up at ${baseUrl}. Autopilot is ${state}.`);
  } else {
    console.log("Usage: pnpm demo reset | autopilot on [seconds] | go | scam | autopilot off | status");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  if (err instanceof ApiRequestError && err.code === "NETWORK_ERROR") console.error(`Can't reach the API at ${baseUrl}. Is it running?`);
  else console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
