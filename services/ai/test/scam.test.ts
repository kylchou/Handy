import { describe, expect, it } from "vitest";
import { screenJobMessage } from "../src/scam.js";

describe("screenJobMessage from a worker", () => {
  it.each([
    ["Can you buy some gift cards and send me the codes?", "GIFT_CARDS"],
    ["You can just pay me on Venmo", "OFF_PLATFORM_PAYMENT"],
    ["What's your routing number?", "FINANCIAL_REQUEST"],
    ["What's the code on your phone? I need it to finish setup", "PASSWORD_REQUEST"],
  ])("blocks %j and flags admin", (text, flag) => {
    const res = screenJobMessage(text, "worker");
    expect(res.action).toBe("block");
    expect(res.flags).toContain(flag);
    expect(res.noticeFor).toBe("sender");
    expect(res.flagForAdmin).toBe(true);
  });

  it("warns the customer and flags admin when a worker shares contact info", () => {
    const res = screenJobMessage("Text me at 404-555-1234", "worker");
    expect(res).toMatchObject({ action: "warn", noticeFor: "customer", flagForAdmin: true });
    expect(res.flags).toContain("CONTACT_INFO");
  });

  it.each([
    "Sounds good. I'll be there in about 10 minutes.",
    "What's the wifi password?",
    "What's the gate code?",
    "I'll pick up the gift card for your grandson on the way",
    "The store only takes credit card, is that ok?",
  ])("allows normal job talk: %j", (text) => {
    expect(screenJobMessage(text, "worker")).toEqual({ action: "allow", flags: [], flagForAdmin: false });
  });
});

describe("screenJobMessage from a customer", () => {
  it.each(["My card number is 4111 1111 1111 1111", "my password is sunshine1", "my social is 123-45-6789"])(
    "blocks oversharing: %j",
    (text) => {
      const res = screenJobMessage(text, "customer");
      expect(res).toMatchObject({ action: "block", noticeFor: "sender", flagForAdmin: false });
    },
  );

  it("gives a payment tip and flags admin for off-app payment", () => {
    expect(screenJobMessage("Can I pay you cash instead?", "customer")).toMatchObject({
      action: "warn",
      noticeFor: "sender",
      flagForAdmin: true,
    });
  });

  it("gives a gentle tip for sharing a phone number", () => {
    expect(screenJobMessage("Call me at (404) 555-1234", "customer")).toMatchObject({
      action: "warn",
      flagForAdmin: false,
    });
  });

  it.each([
    "The front door is unlocked. Please come around to the back.",
    "Please pick up a gift card for my grandson",
    "The wifi password is peachtree22",
  ])("allows %j", (text) => {
    expect(screenJobMessage(text, "customer").action).toBe("allow");
  });
});
