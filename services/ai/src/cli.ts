/**
 * Terminal chat, no frontend/backend needed. Keeps history + draft locally, like the backend does.
 *   pnpm --filter @handy/ai chat
 * "/state" = current draft, "/quit" = exit.
 */
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline";
import type { AIConversationContext, ServiceRequestDraft } from "@handy/contracts";
import { createAIService, selectProvider } from "./index.js";

// Same root .env the backend reads (MODEL_API_KEY / ANTHROPIC_API_KEY). Shell env wins.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  // No .env → shell env only.
}

const ai = createAIService();
console.log(`Using ${selectProvider()} (${process.env.AI_MODEL || "default model"})`);
const timezone = "America/New_York";
const history: AIConversationContext["history"] = [];
let draft: ServiceRequestDraft = {};
const rl = createInterface({ input, output, terminal: false });

console.log("What can we help you with?\n");
output.write("> ");
// Line by line, so piped input works too (ends cleanly when input runs out).
for await (const raw of rl) {
  const line = raw.replace(/^﻿/, ""); // PowerShell adds a BOM to piped text
  if (line.trim() === "/quit") break;
  if (line.trim() === "/state") {
    console.log(JSON.stringify(draft, null, 2));
    output.write("> ");
    continue;
  }
  console.log(line); // echo, so piped runs read like a transcript
  const now = new Date();
  try {
    const res = await ai.processMessage("cli", line, {
      history,
      currentDraft: draft,
      customer: { firstName: "Dorothy", homeAddress: "123 Main Street, Atlanta, GA" },
      now: now.toISOString(),
      today: new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now),
      timezone,
      serviceCategories: [],
      pastWorkers: [
        { workerId: "w-james", firstName: "James", displayName: "James R.", lastServiceCategoryId: "HOME_MAINTENANCE", yourLastRating: 5 },
      ],
    });
    // Same merge as the backend: undefined = keep, null = clear.
    draft = { ...draft, ...res.extractedData };
    history.push({ role: "customer", content: line }, { role: "assistant", content: res.message });
    console.log(`\n${res.message}\n`);
    console.log(`  [${res.safetyStatus}] ready=${res.readyToSubmit} missing=${res.missingInformation.join(",") || "none"}`);
    console.log(`  changed: ${JSON.stringify(res.extractedData)}\n`);
  } catch (err) {
    // Short line, not a stack trace. Backend would answer this message with its built-in assistant.
    const e = err as { status?: number; message?: string };
    console.error(`Error${e.status ? ` ${e.status}` : ""}: ${e.message ?? String(err)}\n`);
  }
  output.write("> ");
}
rl.close();
