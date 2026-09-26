import type { AIConversationContext } from "@handy/contracts";
import type OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HandyAIService } from "../src/aiService.js";
import { AIServiceError } from "../src/errors.js";
import { createAIService, requireApiKey } from "../src/index.js";
import { DEFAULT_MUSE_MODEL, MuseExtractionModel, MuseJsonClient } from "../src/muse.js";
import { MODEL_TURN_JSON_SCHEMA } from "../src/schema.js";

type CreateArgs = { model: string; messages: Array<{ role: string; content: string }>; response_format: any };

/** Fake openai client: records each create() call, answers from a script. */
function fakeOpenAI(script: Array<(args: CreateArgs) => unknown>) {
  const calls: CreateArgs[] = [];
  const client = {
    chat: {
      completions: {
        create: async (args: CreateArgs) => {
          calls.push(structuredClone(args));
          const next = script.shift();
          if (!next) throw new Error("fake ran out of scripted answers");
          return next(args);
        },
      },
    },
  };
  return { client: client as unknown as OpenAI, calls };
}

const answer = (content: string | null, extra: { refusal?: string; finish_reason?: string } = {}) => () => ({
  choices: [{ message: { content, refusal: extra.refusal ?? null }, finish_reason: extra.finish_reason ?? "stop" }],
});

const goodTurn = JSON.stringify({
  reply: "What day works for you?",
  safetyStatus: "NORMAL_SERVICE",
  customerConfirmed: false,
  request: {
    serviceCategory: "LAWN_CARE",
    description: "Mow the lawn",
    location: null,
    date: null,
    startTime: null,
    endTime: null,
    urgency: null,
    specialRequirements: [],
    preferredWorkerId: null,
    repeat: null,
  },
});

const input = {
  system: "SYSTEM PROMPT",
  messages: [
    { role: "user" as const, content: "earlier" },
    { role: "assistant" as const, content: "What time?" },
    { role: "user" as const, content: [{ type: "text" as const, text: "mow my lawn" }, { type: "text" as const, text: "<context>x</context>" }] },
  ],
};

const ctx: AIConversationContext = {
  history: [],
  currentDraft: {},
  customer: { firstName: "Dorothy", homeAddress: null },
  now: "2026-09-25T14:00:00Z",
  today: "2026-09-25",
  timezone: "America/New_York",
  serviceCategories: [],
};

describe("MuseJsonClient request shape", () => {
  it("sends system first, flattened strings, strict json_schema, default model, nothing extra", async () => {
    const { client, calls } = fakeOpenAI([answer(goodTurn)]);
    await new MuseExtractionModel({ client }).run(input);

    const sent = calls[0]!;
    expect(sent.model).toBe(DEFAULT_MUSE_MODEL);
    expect(sent.messages).toEqual([
      { role: "system", content: "SYSTEM PROMPT" },
      { role: "user", content: "earlier" },
      { role: "assistant", content: "What time?" },
      { role: "user", content: "mow my lawn\n\n<context>x</context>" },
    ]);
    expect(sent.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "service_request_turn", schema: MODEL_TURN_JSON_SCHEMA, strict: true },
    });
    expect(Object.keys(sent).sort()).toEqual(["messages", "model", "response_format"]);
  });

  it("uses a custom model id", async () => {
    const { client, calls } = fakeOpenAI([answer(goodTurn)]);
    await new MuseExtractionModel({ client, model: "muse-spark-1.2-contributor" }).run(input);
    expect(calls[0]!.model).toBe("muse-spark-1.2-contributor");
  });

  it("parses a good reply", async () => {
    const { client } = fakeOpenAI([answer(goodTurn)]);
    const result = await new MuseExtractionModel({ client }).run(input);
    expect(result).toMatchObject({ kind: "ok", output: { request: { serviceCategory: "LAWN_CARE" } } });
  });
});

describe("MuseJsonClient results and errors", () => {
  it("refusal → refused", async () => {
    const { client } = fakeOpenAI([answer(null, { refusal: "I can't help with that." })]);
    expect(await new MuseExtractionModel({ client }).run(input)).toEqual({ kind: "refused" });
  });

  it("finish_reason length → AIServiceError", async () => {
    const { client } = fakeOpenAI([answer('{"reply": "cut', { finish_reason: "length" })]);
    await expect(new MuseExtractionModel({ client }).run(input)).rejects.toBeInstanceOf(AIServiceError);
  });

  it("invalid JSON or wrong shape → AIServiceError", async () => {
    const bad = fakeOpenAI([answer("not json")]);
    await expect(new MuseExtractionModel({ client: bad.client }).run(input)).rejects.toBeInstanceOf(AIServiceError);
    const wrong = fakeOpenAI([answer('{"reply": 5}')]);
    await expect(new MuseExtractionModel({ client: wrong.client }).run(input)).rejects.toBeInstanceOf(AIServiceError);
  });

  it("auth error throws as-is, no retry, not an AIServiceError", async () => {
    const authError = Object.assign(new Error("401 Incorrect API key provided"), { status: 401 });
    const { client, calls } = fakeOpenAI([
      () => {
        throw authError;
      },
    ]);
    const ai = new HandyAIService({ model: new MuseExtractionModel({ client }) });
    await expect(ai.processMessage("c1", "mow my lawn", ctx)).rejects.toBe(authError);
    expect(calls).toHaveLength(1);
  });

  it("bad JSON is retried once by HandyAIService, then succeeds", async () => {
    const { client, calls } = fakeOpenAI([answer("{oops"), answer(goodTurn)]);
    const res = await new HandyAIService({ model: new MuseExtractionModel({ client }) }).processMessage("c1", "mow my lawn", ctx);
    expect(calls).toHaveLength(2);
    expect(res.extractedData.serviceCategoryId).toBe("LAWN_CARE");
  });

  it("schema rejected in strict mode → retries with strict false, and stays non-strict", async () => {
    const rejection = Object.assign(new Error("400 Invalid schema for response_format"), { status: 400 });
    const { client, calls } = fakeOpenAI([
      () => {
        throw rejection;
      },
      answer(goodTurn),
      answer(goodTurn),
    ]);
    const muse = new MuseJsonClient({ client });
    const req = { ...input, schema: MODEL_TURN_JSON_SCHEMA, schemaName: "t" };
    await muse.request(req);
    await muse.request(req);
    expect(calls.map((c) => c.response_format.json_schema.strict)).toEqual([true, false, false]);
  });

  it("other 400s are not treated as schema problems", async () => {
    const other = Object.assign(new Error("400 Unknown model"), { status: 400 });
    const { client, calls } = fakeOpenAI([
      () => {
        throw other;
      },
    ]);
    await expect(new MuseJsonClient({ client }).request({ ...input, schema: {}, schemaName: "t" })).rejects.toBe(other);
    expect(calls).toHaveLength(1);
  });
});

describe("createAIService", () => {
  const keys = ["MODEL_API_KEY", "AI_MODEL"] as const;
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

  it("no key → throws so the backend falls back at startup", () => {
    expect(() => createAIService()).toThrow("MODEL_API_KEY is not set");
    process.env.MODEL_API_KEY = "   ";
    expect(() => requireApiKey()).toThrow("MODEL_API_KEY is not set");
  });

  it("builds a Muse model when the key is set, and an injected model skips the check", () => {
    process.env.MODEL_API_KEY = "muse-test";
    expect((createAIService() as unknown as { model: unknown }).model).toBeInstanceOf(MuseExtractionModel);

    delete process.env.MODEL_API_KEY;
    expect(() => createAIService({ model: new MuseExtractionModel({ client: fakeOpenAI([]).client }) })).not.toThrow();
  });
});
