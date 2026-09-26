import { describe, expect, it } from "vitest";
import { HandyAIService } from "../src/aiService.js";
import type { ExtractionModel, ModelInput, ModelRunResult } from "../src/model.js";
import type { ModelTurn } from "../src/schema.js";

// Friday 2026-09-25, 10:00 in New York.
const NOW = new Date("2026-09-25T14:00:00Z");

const emptyRequest: ModelTurn["request"] = {
  serviceCategory: null,
  description: null,
  location: null,
  date: null,
  startTime: null,
  endTime: null,
  urgency: null,
  specialRequirements: [],
};

function turn(reply: string, request: Partial<ModelTurn["request"]>, extra: Partial<ModelTurn> = {}): ModelTurn {
  return {
    reply,
    safetyStatus: "NORMAL_SERVICE",
    userConfirmed: false,
    request: { ...emptyRequest, ...request },
    ...extra,
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
  const ai = new HandyAIService({ model, now: () => NOW, timeZone: "America/New_York" });
  return { ai, model };
}

const couch = {
  serviceCategory: "MOVING_ASSISTANCE",
  description: "Move a couch from the garage to the living room",
  date: "2026-09-26",
} as const;

describe("HandyAIService", () => {
  it("short-circuits emergencies without calling the model", async () => {
    const { ai, model } = service([]);
    const res = await ai.processMessage("c1", "My dad collapsed and isn't responding.");
    expect(model.calls).toHaveLength(0);
    expect(res.safetyStatus).toBe("POTENTIAL_EMERGENCY");
    expect(res.emergency?.callNumber).toBe("911");
    expect(res.readyToSubmit).toBe(false);
  });

  it("reports missing fields while collecting information", async () => {
    const { ai } = service([{ kind: "ok", output: turn("What time tomorrow would work best?", couch) }]);
    const res = await ai.processMessage("c1", "I need someone to help me move a couch tomorrow afternoon.");
    expect(res.readyToSubmit).toBe(false);
    expect(res.missingInformation).toEqual(["startTime", "location"]);
    expect(res.extractedData.serviceCategoryId).toBe("MOVING_ASSISTANCE");
  });

  it("becomes ready to submit once every required field is known, defaulting a one-hour window", async () => {
    const { ai } = service([
      { kind: "ok", output: turn("What time?", couch) },
      {
        kind: "ok",
        output: turn("Would you like me to find someone?", {
          ...couch,
          startTime: "15:00",
          location: "123 Main Street, Atlanta, GA",
        }),
      },
    ]);
    await ai.processMessage("c1", "Move a couch tomorrow");
    const res = await ai.processMessage("c1", "Around 3, at my house", { savedAddress: "123 Main Street, Atlanta, GA" });
    expect(res.readyToSubmit).toBe(true);
    expect(res.userConfirmed).toBe(false);
    expect(res.extractedData).toMatchObject({ requestedStartTime: "15:00", requestedEndTime: "16:00", urgency: "normal" });
  });

  it("passes history and the current request state to the model", async () => {
    const { ai, model } = service([
      { kind: "ok", output: turn("What time?", couch) },
      { kind: "ok", output: turn("And where?", { ...couch, startTime: "15:00" }) },
    ]);
    await ai.processMessage("c1", "Move a couch tomorrow");
    await ai.processMessage("c1", "Around 3");

    const second = model.calls[1]!;
    expect(second.messages.slice(0, 2)).toEqual([
      { role: "user", content: "Move a couch tomorrow" },
      { role: "assistant", content: "What time?" },
    ]);
    const context = JSON.stringify(second.messages.at(-1));
    expect(context).toContain("Friday, 2026-09-25");
    expect(context).toContain("MOVING_ASSISTANCE");
  });

  it("drops past dates and malformed times so the AI asks again", async () => {
    const { ai } = service([
      {
        kind: "ok",
        output: turn("ok", { ...couch, date: "2026-09-20", startTime: "3pm", location: "123 Main St" }),
      },
    ]);
    const res = await ai.processMessage("c1", "last sunday at 3pm");
    expect(res.extractedData.requestedDate).toBeUndefined();
    expect(res.extractedData.requestedStartTime).toBeUndefined();
    expect(res.missingInformation).toEqual(["date", "startTime"]);
  });

  it("drops a start time earlier today that has already passed", async () => {
    const { ai } = service([
      { kind: "ok", output: turn("ok", { ...couch, date: "2026-09-25", startTime: "08:00", location: "123 Main St" }) },
    ]);
    const res = await ai.processMessage("c1", "today at 8am");
    expect(res.extractedData.requestedDate).toBe("2026-09-25");
    expect(res.extractedData.requestedStartTime).toBeUndefined();
  });

  it("only reports userConfirmed when the request is complete", async () => {
    const complete = { ...couch, startTime: "15:00", location: "123 Main St" };
    const { ai } = service([
      { kind: "ok", output: turn("Great, finding someone now.", complete, { userConfirmed: true }) },
      { kind: "ok", output: turn("Which day?", { ...complete, date: null }, { userConfirmed: true }) },
    ]);
    expect((await ai.processMessage("c1", "yes")).userConfirmed).toBe(true);
    expect((await ai.processMessage("c2", "yes")).userConfirmed).toBe(false);
  });

  it("adds the 911 instruction if the model flags an emergency without it", async () => {
    const { ai } = service([
      { kind: "ok", output: turn("Oh no, that sounds scary.", {}, { safetyStatus: "POTENTIAL_EMERGENCY" }) },
    ]);
    const res = await ai.processMessage("c1", "grandpa looks really grey and confused");
    expect(res.safetyStatus).toBe("POTENTIAL_EMERGENCY");
    expect(res.message).toContain("911");
    expect(res.readyToSubmit).toBe(false);
  });

  it("handles a model refusal gracefully", async () => {
    const { ai } = service([{ kind: "refused" }]);
    const res = await ai.processMessage("c1", "something odd");
    expect(res.safetyStatus).toBe("UNSUPPORTED_SERVICE");
    expect(res.readyToSubmit).toBe(false);
  });

  it("wraps model failures in AIServiceError", async () => {
    const model: ExtractionModel = { run: async () => { throw new Error("network down"); } };
    const ai = new HandyAIService({ model, now: () => NOW });
    await expect(ai.processMessage("c1", "mow my lawn")).rejects.toMatchObject({ name: "AIServiceError" });
  });
});
