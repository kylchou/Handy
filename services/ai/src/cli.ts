/**
 * Terminal chat, no frontend/backend needed.
 *   pnpm --filter @handy/ai chat
 * "/state" = collected request, "/quit" = exit.
 */
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { createAIServiceFromEnv } from "./index.js";

const ai = createAIServiceFromEnv();
const conversationId = `cli-${Date.now()}`;
const customer = { firstName: "Dorothy", savedAddress: "123 Main Street, Atlanta, GA" };
const rl = createInterface({ input, output });

console.log("What can we help you with?\n");
for (;;) {
  const line = await rl.question("> ");
  if (line.trim() === "/quit") break;
  if (line.trim() === "/state") {
    console.log(JSON.stringify(await ai.getState(conversationId), null, 2));
    continue;
  }
  try {
    const res = await ai.processMessage(conversationId, line, customer);
    console.log(`\n${res.message}\n`);
    console.log(
      `  [${res.safetyStatus}] ready=${res.readyToSubmit} confirmed=${res.userConfirmed} missing=${res.missingInformation.join(",") || "none"}`,
    );
    console.log(`  ${JSON.stringify(res.extractedData)}\n`);
  } catch (err) {
    console.error("Error:", err);
  }
}
rl.close();
