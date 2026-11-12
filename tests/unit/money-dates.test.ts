import { describe, expect, it } from "vitest";
import { addMonths, fromSen, monthRange, parseAmount, parseDate, toSen } from "@akaun/shared";

describe("parseAmount", () => {
  it.each([
    [1234.5, 1234.5],
    ["1,234.50", 1234.5],
    ["RM 2,000", 2000],
    ["(150.25)", -150.25],
    ["-75", -75],
  ])("parses %s", (input, expected) => expect(parseAmount(input)).toBe(expected));

  it.each([[""], ["  "], [null], [undefined], ["abc"], ["12a"], [Number.NaN], [Infinity], [{}]])("rejects %s", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe("parseDate", () => {
  it("parses Excel serial dates (1900 system)", () => {
    expect(parseDate(46023)).toBe("2026-01-01");
    expect(parseDate(46023.75)).toBe("2026-01-01"); // time portion ignored
  });
  it("parses ISO and Malaysian dd/mm/yyyy strings", () => {
    expect(parseDate("2026-03-05")).toBe("2026-03-05");
    expect(parseDate("05/03/2026")).toBe("2026-03-05");
    expect(parseDate("5-3-2026")).toBe("2026-03-05");
  });
  it.each([["2026-02-30"], ["31/04/2026"], ["2026-13-01"], ["hello"], [0], [-5], ["1850-01-01"], [true]])("rejects invalid %s", (v) => {
    expect(parseDate(v)).toBeNull();
  });
});

describe("months + sen", () => {
  it("builds inclusive month ranges across years", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthRange("2026-03", "2026-01")).toEqual([]);
  });
  it("adds months", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });
  it("avoids floating point drift", () => {
    expect(fromSen(toSen(0.1) + toSen(0.2))).toBe(0.3);
  });
});
