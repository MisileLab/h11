import { describe, expect, it } from "vitest";
import { parseCountInput, validateCountValue } from "./validation";

describe("validation", () => {
  it("treats blank count as omitted", () => {
    expect(parseCountInput("   ")).toEqual({});
  });

  it("treats zero count as all reviews", () => {
    expect(parseCountInput("0")).toEqual({ count: 0 });
  });

  it("rejects negative count", () => {
    expect(parseCountInput("-1")).toEqual({
      error: "Review count cannot be negative. Leave it blank or use 0 to fetch all reviews.",
    });
  });

  it("accepts missing backend count as all reviews", () => {
    expect(validateCountValue(undefined)).toEqual({ count: 0 });
  });
});
