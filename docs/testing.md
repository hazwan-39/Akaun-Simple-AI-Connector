# Testing

```bash
npm test          # vitest: unit + integration
npm run typecheck # shared, api, excel-addin
npm run build
```

## Automated coverage (147 tests, all passing as of 2026-11-12)

| Area | File |
|---|---|
| Cash flow arithmetic, monthly aggregation, ratio, closing balance, opening roll-forward | `tests/unit/cashflow-engine.test.ts` |
| Duplicate source rows, look-alike duplicates, internal transfers, non-cash, missing/invalid amounts, invalid/missing dates, negatives, period cap, insufficient data, reconciliation, demo status | `tests/unit/cashflow-engine.test.ts` |
| Amount/date parsing | `tests/unit/money-dates.test.ts` |
| Summary schema, arithmetic tampering, AI output schema (invalid responses), formula-injection sanitiser, hallucinated-amount guard | `tests/unit/schemas-and-guards.test.ts` |
| Write allowlist enforcement, template plans, hostile text sanitisation, update mode preserves layout | `tests/unit/write-guard.test.ts` |
| AS v2.26.02 adapter: detection, disabled-by-default, version and header drift, reading, reconciliation, dynamic Total row, read-only | `tests/integration/akaun-simple-adapter.test.ts` |
| Renderer: create with confirmation, ownership tags, native charts, formulas, name collisions (incl. case-insensitive and forged tag), structure protection, unsupported API, update without duplication, stale-row clearing, failure keeps last dashboard, protected AI sheet, **source worksheet preservation** | `tests/integration/dashboard-renderer.test.ts` |
| API: health, auth failures, production config guards, CORS, validation (400/413/422), quota, rate limit, log privacy, provider timeouts, invalid AI output and retry, error mapping | `tests/integration/api.test.ts` |
| OpenAI/Anthropic adapters against fake SDK clients: request shape, refusal, truncation, invalid JSON, SDK errors | `tests/integration/providers.test.ts` |
| Pipeline phases, AI failure fallback, no-key mode, aggregates-only payload | `tests/integration/pipeline.test.ts` |

The workbook tests use `InMemoryWorkbookPort` and a fixture that reproduces the real v2.26.02 layout
(`tests/fixtures/akaun-simple-v2.ts`). They do **not** run inside Excel.

## NOT yet verified (manual, required before pilot)

| Item | Status |
|---|---|
| Task pane loading inside Excel Desktop for Windows | **Unverified**: not sideloaded in this environment |
| Ribbon button | **Unverified** |
| `OfficeWorkbookPort` against the real Office.js runtime (custom properties, charts on hidden sheet, apostrophe text prefix, number formats, merges) | **Unverified** |
| Real OpenAI / Anthropic calls with structured output | **Unverified**: no API keys used. Adapters tested against fake clients only |
| Production adapter against a workbook with real transactions | **Pending**: only a blank template was available |
| VBA behaviour after adding AI sheets | **Pending manual check** (below) |

## Manual workbook integrity checklist (use a COPY)

Before: save a copy, note sheet names, protection on each sheet, and named ranges (Formulas → Name Manager);
export a few formulas (e.g. `Cash Flow!G37:G39`, `Deposits!C366`) and values.

1. Open the copy, open the add-in, run **Jana Analisis** in workbook mode.
2. **Cipta Worksheet AI** → confirm → check that only `AI Cash Flow` and hidden `_AI_CF_DATA` were added.
3. **Kemas Kini Analisis** twice → still exactly 2 AI sheets and 2 charts.
4. Compare with *before*: sheet names and order of original sheets, values, formulas, named ranges, sheet protection, workbook protection.
5. Run every Akaun Simple macro button (Deposit, Payments, navigation) → they must still work.
6. Save as `.xlsm`, close, reopen → macros enabled, file type unchanged, AI sheets still recognised (ownership tag persisted).
7. Rename a user sheet to `AI Cash Flow` in another copy → add-in must refuse to write.
8. Close the add-in / remove it → workbook still fully usable.
