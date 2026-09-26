import { describe, expect, it } from "vitest";
import { JobMessageDrafter, type DraftModel, type DraftRunResult, type JobContext } from "../src/draft.js";
import type { ModelInput } from "../src/model.js";

const job: JobContext = {
  workerFirstName: "James",
  customerFirstName: "Dorothy",
  serviceDescription: "Look at a washing machine that won't turn on",
  scheduledDate: "2026-09-26",
  scheduledStartTime: "14:00",
};

class StubDraftModel implements DraftModel {
  calls: ModelInput[] = [];
  constructor(private readonly results: DraftRunResult[]) {}
  async run(input: ModelInput): Promise<DraftRunResult> {
    this.calls.push(structuredClone(input));
    const next = this.results.shift();
    if (!next) throw new Error("StubDraftModel ran out of scripted results");
    return next;
  }
}

describe("JobMessageDrafter", () => {
  it("returns a draft for the customer to approve", async () => {
    const model = new StubDraftModel([
      { kind: "ok", output: { draft: "The washing machine is in the basement, on the left.", clarifyingQuestion: null } },
    ]);
    const res = await new JobMessageDrafter({ model }).draft(job, "tell James it's in the basement on the left");
    expect(res).toEqual({ kind: "draft", message: "The washing machine is in the basement, on the left." });
    expect(JSON.stringify(model.calls[0]!.messages.at(-1))).toContain("James");
  });

  it("asks a question when a needed fact is missing, then drafts with history", async () => {
    const model = new StubDraftModel([
      { kind: "ok", output: { draft: null, clarifyingQuestion: "Where is the washing machine?" } },
      { kind: "ok", output: { draft: "The washing machine is in the garage.", clarifyingQuestion: null } },
    ]);
    const drafter = new JobMessageDrafter({ model });

    const first = await drafter.draft(job, "Can you tell James where the washing machine is?");
    expect(first).toEqual({ kind: "clarify", question: "Where is the washing machine?" });

    const second = await drafter.draft(job, "the garage", [
      { role: "user", content: "Can you tell James where the washing machine is?" },
      { role: "assistant", content: "Where is the washing machine?" },
    ]);
    expect(second).toEqual({ kind: "draft", message: "The washing machine is in the garage." });
    expect(model.calls[1]!.messages).toHaveLength(3);
  });

  it("routes emergencies to 911 without calling the model", async () => {
    const model = new StubDraftModel([]);
    const res = await new JobMessageDrafter({ model }).draft(job, "tell James I fell and can't get up");
    expect(res.kind).toBe("emergency");
    expect(model.calls).toHaveLength(0);
  });

  it("refuses unsupported requests without calling the model", async () => {
    const model = new StubDraftModel([]);
    const res = await new JobMessageDrafter({ model }).draft(job, "ask James to give me my insulin shot");
    expect(res.kind).toBe("unsupported");
    expect(model.calls).toHaveLength(0);
  });

  it("falls back to a default question when the model returns neither field", async () => {
    const model = new StubDraftModel([{ kind: "ok", output: { draft: null, clarifyingQuestion: null } }]);
    const res = await new JobMessageDrafter({ model }).draft(job, "hmm");
    expect(res).toEqual({ kind: "clarify", question: "What would you like to tell James?" });
  });

  it("handles a model refusal", async () => {
    const model = new StubDraftModel([{ kind: "refused" }]);
    expect((await new JobMessageDrafter({ model }).draft(job, "something")).kind).toBe("unsupported");
  });
});
