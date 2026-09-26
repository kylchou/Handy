import type { AIConversationContext, ServiceRequestDraft } from "@handy/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HandyAIService } from "../src/aiService.js";
import { AIServiceError } from "../src/errors.js";
import { createAIService } from "../src/index.js";
import type { ExtractionModel, ModelInput, ModelRunResult } from "../src/model.js";
import type { ModelTurn } from "../src/schema.js";

// Friday 2026-09-25, 10:00 in New York.
function ctx(overrides: Partial<AIConversationContext> = {}): AIConversationContext {
  return {
    history: [],
    currentDraft: {},
    customer: { firstName: "Dorothy", homeAddress: "123 Main Street, Atlanta, GA" },
    now: "2026-09-25T14:00:00Z",
    today: "2026-09-25",
    timezone: "America/New_York",
    serviceCategories: [],
    pastWorkers: [
      { workerId: "w-james", firstName: "James", displayName: "James R.", lastServiceCategoryId: "HOME_MAINTENANCE", yourLastRating: 5 },
    ],
    ...overrides,
  };
}

const emptyRequest: ModelTurn["request"] = {
  serviceCategory: null,
  description: null,
  location: null,
  date: null,
  startTime: null,
  endTime: null,
  urgency: null,
  specialRequirements: [],
  preferredWorkerId: null,
  repeat: null,
};

function turn(reply: string, request: Partial<ModelTurn["request"]>, extra: Partial<ModelTurn> = {}): ModelRunResult {
  return {
    kind: "ok",
    output: { reply, safetyStatus: "NORMAL_SERVICE", customerConfirmed: false, request: { ...emptyRequest, ...request }, ...extra },
  };
}

class StubModel implements ExtractionModel {
  calls: ModelInput[] = [];
  constructor(private readonly results: ModelRunResult[]) {}
  async run(input: ModelInput): Promise<ModelRunResult> {
    this.calls.push(structuredClone(input));
    const next = this.results.shift();
    if (!next) throw new Error("StubModel ran out of scripted results");
    return next;
  }
}

function service(results: ModelRunResult[]) {
  const model = new StubModel(results);
  return { ai: new HandyAIService({ model }), model };
}

const couch = {
  serviceCategory: "MOVING_ASSISTANCE",
  description: "Move a couch from the garage to the living room",
  date: "2026-09-26",
} as const;

describe("HandyAIService", () => {
  it("short-circuits emergencies without calling the model", async () => {
    const { ai, model } = service([]);
    const res = await ai.processMessage("c1", "My dad collapsed and isn't responding.", ctx());
    expect(model.calls).toHaveLength(0);
    expect(res.safetyStatus).toBe("POTENTIAL_EMERGENCY");
    expect(res.message).toContain("911");
    expect(res.extractedData).toEqual({});
    expect(res.readyToSubmit).toBe(false);
  });

  it("returns only changed fields and reports missing ones by contract name", async () => {
    const { ai } = service([turn("What time tomorrow would work best?", couch)]);
    const res = await ai.processMessage("c1", "I need someone to help me move a couch tomorrow afternoon.", ctx());
    expect(res.extractedData).toEqual({
      serviceCategoryId: "MOVING_ASSISTANCE",
      description: "Move a couch from the garage to the living room",
      requestedDate: "2026-09-26",
      urgency: "NORMAL",
    });
    expect(res.missingInformation).toEqual(["location", "requestedStartTime"]);
    expect(res.readyToSubmit).toBe(false);
  });

  const complete: ServiceRequestDraft = {
    serviceCategoryId: "MOVING_ASSISTANCE",
    description: couch.description,
    location: "123 Main Street, Atlanta, GA",
    requestedDate: "2026-09-26",
    requestedStartTime: "15:00",
    requestedEndTime: "16:00",
    urgency: "NORMAL",
  };
  const completeRequest = { ...couch, startTime: "15:00", endTime: "16:00", location: "123 Main Street, Atlanta, GA" };

  it("fills the last fields and summarizes, but isn't ready until they say yes", async () => {
    const current: ServiceRequestDraft = { ...complete, location: undefined, requestedStartTime: undefined, requestedEndTime: undefined };
    const { ai } = service([turn("Tomorrow at 3 at your home. Shall I find someone?", { ...couch, startTime: "15:00", location: "123 Main Street, Atlanta, GA" })]);
    const res = await ai.processMessage("c1", "Around 3, at my house", ctx({ currentDraft: current }));
    expect(res.extractedData).toEqual({
      location: "123 Main Street, Atlanta, GA",
      requestedStartTime: "15:00",
      requestedEndTime: "16:00",
    });
    expect(res.missingInformation).toEqual([]);
    expect(res.readyToSubmit).toBe(false);
  });

  it("is ready after a yes to a complete summary", async () => {
    const { ai } = service([turn("Wonderful, tap Confirm Request.", completeRequest, { customerConfirmed: true })]);
    const res = await ai.processMessage("c1", "yes please", ctx({ currentDraft: complete }));
    expect(res.extractedData).toEqual({});
    expect(res.readyToSubmit).toBe(true);
  });

  it("is not ready when the yes comes with a change", async () => {
    const { ai } = service([turn("Friday instead, got it. Shall I find someone?", { ...completeRequest, date: "2026-10-02" }, { customerConfirmed: true })]);
    const res = await ai.processMessage("c1", "yes but make it Friday", ctx({ currentDraft: complete }));
    expect(res.extractedData).toEqual({ requestedDate: "2026-10-02" });
    expect(res.readyToSubmit).toBe(false);
  });

  it("is not ready when the model claims a yes before the request was complete", async () => {
    const current: ServiceRequestDraft = { ...complete, location: undefined };
    const { ai } = service([turn("Great!", completeRequest, { customerConfirmed: true })]);
    const res = await ai.processMessage("c1", "yes, at my house", ctx({ currentDraft: current }));
    expect(res.readyToSubmit).toBe(false);
  });

  it("only accepts categories the backend offers", async () => {
    const { ai } = service([turn("ok", { serviceCategory: "PET_ASSISTANCE" })]);
    const categories = [{ id: "LAWN_CARE" as const, name: "Lawn care", description: "", requiresQualification: false, basePriceCents: 4000 }];
    const res = await ai.processMessage("c1", "walk my dog", ctx({ serviceCategories: categories }));
    expect(res.extractedData.serviceCategoryId).toBeUndefined();
    expect(res.missingInformation).toContain("serviceCategoryId");
  });

  it("keeps fields the model forgot instead of clearing them", async () => {
    const current: ServiceRequestDraft = { serviceCategoryId: "LAWN_CARE", description: "Mow the lawn", urgency: "HIGH", repeat: "WEEKLY" };
    const { ai } = service([turn("What day?", { serviceCategory: "LAWN_CARE" })]);
    const res = await ai.processMessage("c1", "the back yard too", ctx({ currentDraft: current }));
    expect(res.extractedData).toEqual({});
  });

  it("clears a value that fails validation so the AI asks again", async () => {
    const current: ServiceRequestDraft = { requestedDate: "2026-09-26" };
    const { ai } = service([turn("ok", { ...couch, date: "2026-09-20", startTime: "3pm", location: "123 Main St" })]);
    const res = await ai.processMessage("c1", "last sunday at 3pm", ctx({ currentDraft: current }));
    expect(res.extractedData.requestedDate).toBeNull(); // had a value → cleared
    expect(res.extractedData.requestedStartTime).toBeUndefined(); // was empty → nothing to change
    expect(res.missingInformation).toEqual(["requestedDate", "requestedStartTime"]);
  });

  it("drops a start time earlier today that has already passed", async () => {
    const { ai } = service([turn("ok", { ...couch, date: "2026-09-25", startTime: "08:00", location: "123 Main St" })]);
    const res = await ai.processMessage("c1", "today at 8am", ctx({ currentDraft: { requestedStartTime: "09:00" } }));
    expect(res.extractedData.requestedDate).toBe("2026-09-25");
    expect(res.extractedData.requestedStartTime).toBeNull();
    expect(res.missingInformation).toContain("requestedStartTime");
  });

  it("sets preferredWorkerId only for a known past worker", async () => {
    const { ai } = service([
      turn("I'll ask James first.", { preferredWorkerId: "w-james" }),
      turn("I'll find someone good.", { preferredWorkerId: "w-made-up" }),
    ]);
    expect((await ai.processMessage("c1", "Can James come back?", ctx())).extractedData.preferredWorkerId).toBe("w-james");
    expect((await ai.processMessage("c2", "Can Tom come back?", ctx())).extractedData.preferredWorkerId).toBeUndefined();
  });

  it("sets repeat for recurring requests", async () => {
    const { ai } = service([turn("Every Saturday, got it.", { ...couch, repeat: "WEEKLY" })]);
    expect((await ai.processMessage("c1", "every saturday", ctx())).extractedData.repeat).toBe("WEEKLY");
  });

  it("sends history to the model starting at the first customer turn", async () => {
    const { ai, model } = service([turn("And where?", { ...couch, startTime: "15:00" })]);
    await ai.processMessage(
      "c1",
      "Around 3",
      ctx({
        history: [
          { role: "assistant", content: "Hi Dorothy! What can we help you with?" },
          { role: "customer", content: "Move a couch tomorrow" },
          { role: "assistant", content: "What time?" },
        ],
        currentDraft: { serviceCategoryId: "MOVING_ASSISTANCE" },
      }),
    );
    const messages = model.calls[0]!.messages;
    expect(messages.slice(0, 2)).toEqual([
      { role: "user", content: "Move a couch tomorrow" },
      { role: "assistant", content: "What time?" },
    ]);
    const context = JSON.stringify(messages.at(-1));
    expect(context).toContain("Friday, 2026-09-25");
    expect(context).toContain("w-james");
    expect(context).toContain("MOVING_ASSISTANCE");
  });

  it("adds the 911 instruction if the model flags an emergency without it", async () => {
    const { ai } = service([turn("Oh no, that sounds scary.", {}, { safetyStatus: "POTENTIAL_EMERGENCY" })]);
    const res = await ai.processMessage("c1", "grandpa looks really grey and confused", ctx());
    expect(res.safetyStatus).toBe("POTENTIAL_EMERGENCY");
    expect(res.message).toContain("911");
  });

  it("handles a model refusal gracefully", async () => {
    const { ai } = service([{ kind: "refused" }]);
    const res = await ai.processMessage("c1", "something odd", ctx());
    expect(res.safetyStatus).toBe("UNSUPPORTED_SERVICE");
    expect(res.readyToSubmit).toBe(false);
  });

  it("throws when the model call fails (network, auth, credits), no retry", async () => {
    let calls = 0;
    const model: ExtractionModel = {
      run: async () => {
        calls++;
        throw new Error("401 invalid x-api-key");
      },
    };
    await expect(new HandyAIService({ model }).processMessage("c1", "mow my lawn", ctx())).rejects.toThrow("401 invalid x-api-key");
    expect(calls).toBe(1);
  });

  it("retries bad JSON once, then succeeds", async () => {
    const model = new StubModel([turn("What day?", { serviceCategory: "LAWN_CARE", description: "Mow the lawn" })]);
    let failed = false;
    const flaky: ExtractionModel = {
      run: async (input) => {
        if (!failed) {
          failed = true;
          throw new AIServiceError("Model returned invalid JSON");
        }
        return model.run(input);
      },
    };
    const res = await new HandyAIService({ model: flaky }).processMessage("c1", "mow my lawn", ctx());
    expect(res.extractedData.serviceCategoryId).toBe("LAWN_CARE");
  });

  it("throws if bad JSON happens twice", async () => {
    let calls = 0;
    const model: ExtractionModel = {
      run: async () => {
        calls++;
        throw new AIServiceError("Model returned invalid JSON");
      },
    };
    await expect(new HandyAIService({ model }).processMessage("c1", "mow my lawn", ctx())).rejects.toMatchObject({ name: "AIServiceError" });
    expect(calls).toBe(2);
  });

  it("passes through the model's own clarifying reply when it worked but couldn't understand", async () => {
    const { ai } = service([turn("Sorry, could you tell me that another way?", {}, { safetyStatus: "NEEDS_CLARIFICATION" })]);
    const res = await ai.processMessage("c1", "the thing with the stuff", ctx());
    expect(res).toMatchObject({ message: "Sorry, could you tell me that another way?", safetyStatus: "NEEDS_CLARIFICATION" });
  });
});

describe("createAIService", () => {
  const keys = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const;
  let saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("throws without a key so the backend falls back at startup", () => {
    expect(() => createAIService()).toThrow("ANTHROPIC_API_KEY is not set");
    process.env.ANTHROPIC_API_KEY = "   ";
    expect(() => createAIService()).toThrow("ANTHROPIC_API_KEY is not set");
  });

  it("works with a key, or with an injected model", () => {
    expect(() => createAIService({ model: new StubModel([]) })).not.toThrow();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(createAIService()).toBeInstanceOf(HandyAIService);
  });
});
