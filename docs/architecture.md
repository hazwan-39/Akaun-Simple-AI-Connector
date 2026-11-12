# Architecture

```
┌──────────────────────── Excel Desktop (Windows) ────────────────────────┐
│  Akaun Simple .xlsm (READ-ONLY for the add-in)    AI Cash Flow / _AI_CF_DATA │
│        ▲ readValues only                                ▲ guarded writes     │
│  ┌─────┴──────────── Task pane (React + Office.js) ─────┴───────────────┐   │
│  │ Workbook adapters ─► Calculation engine ─► Results UI ─► Renderer    │   │
│  │ (demo | AS v2.26.02)  (deterministic, sen)              (plan+guard) │   │
│  └──────────────────────────────┬─────────────────────────────────────┘   │
└─────────────────────────────────┼─────────────────────────────────────────┘
                                  │ HTTPS, Bearer pilot key, aggregates only
                     ┌────────────▼────────────┐
                     │ Nginx (RunCloud) /api/  │ static task pane at /
                     └────────────┬────────────┘
                     ┌────────────▼────────────┐   OpenAI Responses API
                     │ Node API 127.0.0.1:8787 ├──►  or Anthropic Messages API
                     │ auth · quota · validate │   (structured JSON output)
                     └─────────────────────────┘
```

## Components (independent modules)

| Component | Location | Notes |
|---|---|---|
| Shared contract | `packages/shared` | Zod schemas (summary, AI output, API), constants, skill registry, sanitiser |
| Calculation engine | `packages/shared/src/calculations` | Pure TS, integer sen, no AI. Used by the add-in; the API re-verifies arithmetic |
| Workbook port | `apps/excel-addin/src/office/workbook-port.ts` | Single gateway to Excel. `OfficeWorkbookPort` (Office.js) / `InMemoryWorkbookPort` (tests) |
| Workbook adapters | `apps/excel-addin/src/office/adapters` | `demo/` (sample data, always labelled) and `akaun-simple-v2/` (disabled until verified) |
| Dashboard renderer | `apps/excel-addin/src/office/dashboard` | `template.ts` builds a declarative plan; `guard.ts` enforces the write allowlist; `renderer.ts` checks ownership/protection |
| React UI | `apps/excel-addin/src/{components,pages}` | Bahasa Melayu, narrow task pane |
| API | `apps/api/src` | Express, helmet, CORS allowlist, pilot-key auth, per-key rate limit and daily quota |
| AI providers | `apps/api/src/ai/providers` | Common `AIProvider.generateFinancialInsights()` interface; OpenAI, Anthropic, mock |
| AI Skill | `apps/api/src/skills/cashflow` | Prompt, pipeline, output validation, hallucinated-amount guard |

## Data flow for one analysis

1. **Read:** the adapter reads only the approved ranges (`docs/workbook-mapping.md`).
2. **Validate + calculate:** `calculateCashFlow()` normalises dates and amounts, removes duplicate source rows, excludes transfers and non-cash entries, aggregates by month and category, rolls the opening balance forward, and reconciles against the workbook's own totals.
3. **Send aggregates only:** `CashFlowSummary` (totals, monthly figures, category totals, issue counts). No descriptions, business name, SSM number or individual transactions.
4. **API:** schema-validates, re-verifies arithmetic (422 if inconsistent), calls the provider with fixed instructions plus the data inside `<financial_data>` tags, validates the JSON output (one retry on invalid output), and flags any RM amount not present in the data.
5. **Display:** the task pane re-validates the response and shows figures, chart, insights and warnings.
6. **Optional worksheet:** after explicit confirmation, the renderer creates `AI Cash Flow` + hidden `_AI_CF_DATA`, tags both with a worksheet custom property, and writes a guarded plan. Charts are native Excel charts sourced from `_AI_CF_DATA`. KPI cells are formulas into `_AI_CF_DATA`.

## Workbook write safety (layered)

1. Adapters receive the port but only call read methods (tested: `writeLog` stays empty).
2. `inspectDashboard()` treats any existing `AI Cash Flow` / `_AI_CF_DATA` sheet (case-insensitive) without our ownership tag as a **conflict**. It is never overwritten.
3. Creating sheets requires explicit user confirmation and an unprotected workbook structure. Sheet protection is never changed.
4. Ownership is re-verified immediately before writing.
5. `guardPlan()` rejects the whole plan if any op targets a non-owned sheet, writes outside fixed bounds, writes formula-like text, uses formulas that reference other sheets or external workbooks, uses a function outside a small whitelist, or sources a chart from a non-owned sheet.
6. `OfficeWorkbookPort.applyPlan()` refuses to resolve any sheet that is not in the guarded allowlist (defence in depth).
7. All untrusted text (AI output, workbook labels) passes `sanitizeCellText()` (formula-injection prefix, control-char stripping, length cap).

## Extensibility (designed for, not built)

- **New skills:** add to `SKILLS` in `packages/shared/src/skills/registry.ts`, add a schema, prompt and pipeline under `apps/api/src/skills/<skill>`, and a page in the add-in. The controller already routes by `:skillId`.
- **New workbook versions:** add a layout plus adapter and register it in `adapters/registry.ts`.
- **New providers:** implement `AIProvider`.
- **Billing/credits/multi-tenant:** the `pilotKeyLabel` on each request and the `DailyQuota` seam are where a persistent account/credit store would plug in.
