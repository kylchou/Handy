import { describe, expect, it } from "vitest";
import { classifySafety } from "../src/safety.js";

describe("classifySafety", () => {
  it.each([
    ["My dad collapsed and isn't responding.", "MEDICAL", "911"],
    ["my mom fell and can't get up", "MEDICAL", "911"],
    ["I've fallen and I can't get up", "MEDICAL", "911"],
    ["She's having trouble breathing", "MEDICAL", "911"],
    ["I think he's having a stroke", "MEDICAL", "911"],
    ["My mother is having a medical emergency.", "MEDICAL", "911"],
    ["I smell gas in the kitchen", "FIRE_OR_GAS", "911"],
    ["the carbon monoxide alarm is going off", "FIRE_OR_GAS", "911"],
    ["someone is breaking in", "CRIME", "911"],
    ["I want to kill myself", "SELF_HARM", "988"],
    ["this is an emergency please hurry", "GENERAL", "911"],
  ])("flags %j as an emergency", (text, kind, callNumber) => {
    const result = classifySafety(text);
    expect(result.status).toBe("POTENTIAL_EMERGENCY");
    expect(result.emergency).toEqual({ kind, callNumber });
    expect(result.message).toMatch(new RegExp(callNumber));
  });

  it.each([
    "My porch light is out and I can't safely get on a ladder.",
    "I need someone to pick up my prescription from CVS",
    "Can someone drive me to get my flu shot?",
    "It's not an emergency but my sink is leaking",
    "Please add my daughter as my emergency contact",
    "My mom had a stroke last year and would love some company",
    "I need someone to help me move a couch tomorrow afternoon.",
    "My smoke alarm keeps chirping",
    "I fell behind on my yard work",
  ])("treats %j as a normal request", (text) => {
    expect(classifySafety(text).status).toBe("NORMAL_SERVICE");
  });

  it.each([
    ["Can someone come give me my insulin injection?", "MEDICAL_CARE"],
    ["I need wound care for my leg", "MEDICAL_CARE"],
    ["Can a helper log in with my bank password and pay bills?", "FINANCIAL_ACCESS"],
  ])("marks %j as unsupported", (text, kind) => {
    const result = classifySafety(text);
    expect(result.status).toBe("UNSUPPORTED_SERVICE");
    expect(result.unsupportedKind).toBe(kind);
  });

  it("handles curly apostrophes from voice/mobile keyboards", () => {
    expect(classifySafety("He isn’t breathing").status).toBe("POTENTIAL_EMERGENCY");
  });
});
