import { describe, expect, it } from "vitest";
import { formatWhen, toWorkerJobCard, type WorkerCardInput } from "../src/workerCard.js";

const job: WorkerCardInput = {
  serviceCategoryId: "MOVING_ASSISTANCE",
  description: "Move a couch from the garage at 123 Main Street to the living room",
  location: "123 Main Street, Atlanta, GA 30303",
  requestedDate: "2026-09-26",
  requestedStartTime: "15:00",
  requestedEndTime: "16:00",
  specialRequirements: ["Customer cannot use a ladder", "Customer has dementia", "Gate code 4821"],
  customerFirstName: "Dorothy",
  distanceMiles: 2.43,
  estimatedPay: 35,
};

describe("toWorkerJobCard", () => {
  it("before accept: area only, no name, no health details", () => {
    expect(toWorkerJobCard(job)).toEqual({
      title: "Moving help",
      summary: "Move a couch from the garage at [address hidden] to the living room",
      when: "Sat, Sep 26 · 3–4 PM",
      location: "Atlanta, GA 30303",
      distance: "2.4 miles away",
      pay: "$35",
      notes: ["Customer cannot use a ladder", "Gate code [hidden]", "A few personal details are shared after you accept"],
    });
  });

  it("after accept: full address, first name, all notes, codes still hidden", () => {
    const card = toWorkerJobCard(job, { accepted: true });
    expect(card.location).toBe("123 Main Street, Atlanta, GA 30303");
    expect(card.summary).toContain("123 Main Street");
    expect(card.customerFirstName).toBe("Dorothy");
    expect(card.notes).toEqual(["Customer cannot use a ladder", "Customer has dementia", "Gate code [hidden]"]);
  });

  it("never shows phone numbers or emails", () => {
    const card = toWorkerJobCard(
      { ...job, description: "Pick up groceries. Call 404-555-1234 or email dot@example.com" },
      { accepted: true },
    );
    expect(card.summary).toBe("Pick up groceries. Call [phone hidden] or email [email hidden]");
  });

  it("falls back when the address has no city part or the category is unknown", () => {
    const card = toWorkerJobCard({ ...job, location: "123 Main Street", serviceCategoryId: "some-db-id" });
    expect(card.location).toBe("Address shared after you accept");
    expect(card.title).toBe("Service request");
  });

  it("keeps job-relevant needs like a wheelchair visible", () => {
    const card = toWorkerJobCard({ ...job, specialRequirements: ["Uses a wheelchair"] });
    expect(card.notes).toEqual(["Uses a wheelchair"]);
  });
});

describe("formatWhen", () => {
  it("formats ranges across noon and single times", () => {
    expect(formatWhen("2026-09-26", "11:30", "13:00")).toBe("Sat, Sep 26 · 11:30 AM–1 PM");
    expect(formatWhen("2026-09-26", "12:00")).toBe("Sat, Sep 26 · 12 PM");
  });
});
