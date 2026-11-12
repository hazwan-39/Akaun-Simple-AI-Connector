import { describe, expect, it } from "vitest";
import { AI_DASHBOARD_SHEET, AI_DATA_SHEET, calculateCashFlow, OWNERSHIP_PROPERTY_KEY } from "@akaun/shared";
import { AkaunSimpleV2Adapter } from "../../apps/excel-addin/src/office/adapters/akaun-simple-v2/adapter";
import { inspectDashboard, RenderBlockedError, renderDashboard } from "../../apps/excel-addin/src/office/dashboard/renderer";
import type { DashboardModel } from "../../apps/excel-addin/src/office/dashboard/template";
import { buildAkaunSimpleV2, ORIGINAL_SHEETS, serial } from "../fixtures/akaun-simple-v2";
import { validInsights } from "../fixtures/insights";

const WRITE = { writeApiSupported: true, userConfirmedCreate: true };

async function setup(extraSheets: string[] = []) {
  const port = buildAkaunSimpleV2({
    deposits: [
      { date: serial("2026-01-10"), revenue: 5000 },
      { date: serial("2026-02-10"), revenue: 4000 },
    ],
    payments: [
      { date: serial("2026-01-12"), amounts: { AB: 1500 } },
      { date: serial("2026-02-12"), amounts: { AE: 4500 } },
    ],
    extraSheets,
  });
  const read = await new AkaunSimpleV2Adapter(true).read(port);
  const calc = calculateCashFlow(read);
  const model: DashboardModel = {
    businessName: read.businessName,
    period: calc.period,
    updatedAt: new Date(2026, 10, 12),
    status: calc.status,
    sourceLabel: read.sourceLabel,
    monthly: calc.monthly,
    openingBalance: calc.summary.balances.opening,
    insights: validInsights(),
    meta: null,
    issues: calc.issues,
    reconciliation: calc.reconciliation,
  };
  return { port, model };
}

const snapshotOriginals = (port: Awaited<ReturnType<typeof setup>>["port"]) => ORIGINAL_SHEETS.map((s) => port.snapshot(s));

describe("dashboard renderer – creation", () => {
  it("creates both AI sheets with ownership tags, native charts and formulas, without touching originals", async () => {
    const { port, model } = await setup();
    const before = snapshotOriginals(port);

    expect(await renderDashboard(port, model, WRITE)).toBe("created");

    const dash = port.sheet(AI_DASHBOARD_SHEET)!;
    const data = port.sheet(AI_DATA_SHEET)!;
    expect(dash.props.get(OWNERSHIP_PROPERTY_KEY)).toBe("akaun-simple-ai-connector:CASH_FLOW_001:dashboard");
    expect(data.props.get(OWNERSHIP_PROPERTY_KEY)).toBe("akaun-simple-ai-connector:CASH_FLOW_001:data");
    expect(data.visibility).toBe("Hidden");
    expect([...dash.charts.keys()].sort()).toEqual(["AS_AI_CF_InOut", "AS_AI_CF_Net"]);
    expect(dash.charts.get("AS_AI_CF_InOut")).toMatchObject({ sourceSheet: AI_DATA_SHEET, sourceAddress: "A4:C6" });
    expect(dash.cells.get("B8")).toBe("='_AI_CF_DATA'!G6");
    expect(data.cells.get("B5")).toBe(5000);
    expect(data.cells.get("D6")).toBe("=B6-C6");

    // Source worksheet preservation
    expect(snapshotOriginals(port)).toEqual(before);
    expect(new Set(port.writeLog)).toEqual(new Set([AI_DASHBOARD_SHEET, AI_DATA_SHEET]));
    expect(port.sheets.map((s) => s.name)).toEqual([...ORIGINAL_SHEETS, AI_DASHBOARD_SHEET, AI_DATA_SHEET]);
  });

  it("requires explicit user confirmation before adding sheets", async () => {
    const { port, model } = await setup();
    await expect(renderDashboard(port, model, { ...WRITE, userConfirmedCreate: false })).rejects.toThrow(/confirmation/);
    expect(port.sheet(AI_DASHBOARD_SHEET)).toBeUndefined();
  });

  it("is blocked when the Excel version lacks the write API", async () => {
    const { port, model } = await setup();
    await expect(renderDashboard(port, model, { ...WRITE, writeApiSupported: false })).rejects.toMatchObject({ reason: "UNSUPPORTED_API" });
    expect(port.writeLog).toEqual([]);
  });

  it("is blocked when the workbook structure is protected", async () => {
    const { port, model } = await setup();
    port.structureProtected = true;
    await expect(renderDashboard(port, model, WRITE)).rejects.toMatchObject({ reason: "STRUCTURE_PROTECTED" });
    expect(port.sheets.length).toBe(ORIGINAL_SHEETS.length);
  });
});

describe("dashboard renderer – name collisions", () => {
  it.each(["AI Cash Flow", "ai cash flow", "_AI_CF_DATA"])("never overwrites a user's sheet named %s", async (name) => {
    const { port, model } = await setup([name]);
    const before = port.snapshot(name);
    await expect(renderDashboard(port, model, WRITE)).rejects.toBeInstanceOf(RenderBlockedError);
    await expect(renderDashboard(port, model, WRITE)).rejects.toMatchObject({ reason: "SHEET_NAME_TAKEN" });
    expect(port.snapshot(name)).toBe(before);
    expect(port.writeLog).toEqual([]);
  });

  it("treats a sheet with a forged/foreign ownership tag as not owned", async () => {
    const { port, model } = await setup();
    port.addSheet(AI_DASHBOARD_SHEET, { props: { [OWNERSHIP_PROPERTY_KEY]: "someone-else" } });
    const insp = await inspectDashboard(port, true);
    expect(insp).toMatchObject({ dashboard: "conflict", action: "blocked" });
  });
});

describe("dashboard renderer – updates", () => {
  it("updates the existing dashboard in place without duplicate sheets or charts", async () => {
    const { port, model } = await setup();
    await renderDashboard(port, model, WRITE);
    const sheetCount = port.sheets.length;
    const before = snapshotOriginals(port);

    const updated: DashboardModel = {
      ...model,
      monthly: [...model.monthly, { month: "2026-03", inflow: 100, outflow: 50, net: 50 }],
      period: { start: model.period.start, end: "2026-03" },
      insights: { ...validInsights(), executiveSummary: "Ringkasan baharu." },
    };
    expect(await renderDashboard(port, updated, { writeApiSupported: true, userConfirmedCreate: false })).toBe("updated");

    expect(port.sheets.length).toBe(sheetCount);
    const dash = port.sheet(AI_DASHBOARD_SHEET)!;
    expect(dash.charts.size).toBe(2);
    expect(dash.charts.get("AS_AI_CF_InOut")!.sourceAddress).toBe("A4:C7");
    expect(dash.cells.get("B28")).toBe("Ringkasan baharu.");
    expect(port.sheet(AI_DATA_SHEET)!.cells.get("A7")).toBe("Mac 2026");
    expect(snapshotOriginals(port)).toEqual(before);
  });

  it("clears stale rows when the period becomes shorter", async () => {
    const { port, model } = await setup();
    await renderDashboard(port, model, WRITE);
    await renderDashboard(port, { ...model, monthly: model.monthly.slice(0, 1) }, { writeApiSupported: true, userConfirmedCreate: false });
    const data = port.sheet(AI_DATA_SHEET)!;
    expect(data.cells.get("A5")).toBeDefined();
    expect(data.cells.get("A6")).toBeUndefined();
    expect(data.cells.get("D6")).toBeUndefined();
  });

  it("keeps the last valid dashboard if Excel fails during an update", async () => {
    const { port, model } = await setup();
    await renderDashboard(port, model, WRITE);
    const lastGood = port.snapshot(AI_DASHBOARD_SHEET);
    port.failNextApply = true;
    await expect(renderDashboard(port, { ...model, insights: null }, WRITE)).rejects.toThrow(/simulated/);
    expect(port.snapshot(AI_DASHBOARD_SHEET)).toBe(lastGood);
  });

  it("refuses to update when the owned sheet has been protected by the user", async () => {
    const { port, model } = await setup();
    await renderDashboard(port, model, WRITE);
    port.sheet(AI_DASHBOARD_SHEET)!.protected = true;
    await expect(renderDashboard(port, model, WRITE)).rejects.toMatchObject({ reason: "OWNED_SHEET_PROTECTED" });
  });
});
