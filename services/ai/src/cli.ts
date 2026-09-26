/**
 * Terminal chat, no frontend/backend needed. Keeps history + draft locally, like the backend does.
 *   pnpm --filter @handy/ai chat
 * "/state" = current draft, "/quit" = exit.
 */
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { AIConversationContext, ServiceRequestDraft } from "@handy/contracts";
import { createAIService } from "./index.js";

const ai = createAIService();
const timezone = "America/New_York";
const history: AIConversationContext["history"] = [];
let draft: ServiceRequestDraft = {};
const rl = createInterface({ input, output });

console.log("What can we help you with?\n");
for (;;) {
  const line = await rl.question("> ");
  if (line.trim() === "/quit") break;
  if (line.trim() === "/state") {
    console.log(JSON.stringify(draft, null, 2));
    continue;
  }
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
    console.error("Error:", err);
  }
}
rl.close();
