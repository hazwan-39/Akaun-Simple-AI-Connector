# Workbook Mapping: Akaun Simple 2026 v2.26.02

**Status: derived from the real template, NOT yet verified with real transaction data.**
The production adapter (`apps/excel-addin/src/office/adapters/akaun-simple-v2/`) is **disabled by default**
(`VITE_ENABLE_PRODUCTION_ADAPTER` must be `true` at build time).

## Source inspected

| Item | Value |
|---|---|
| File | `Akaun Simple 2026 v2.26.02.xlsm` (local copy, inspected read-only on 2026-11-12) |
| Contents | Blank template: all transaction rows empty, all totals 0 |
| Method | Unzipped a **copy** and read the sheet XML. The original file was not opened in Excel or modified. |
| Version cell | `Utama!AF25` = `v2.26.02` |
| VBA | `xl/vbaProject.bin` present (not inspected or modified) |
| Workbook structure protection | **Not set** (no `<workbookProtection>`), so adding sheets is possible |
| Sheet protection | All main sheets protected with SHA-512 passwords (`Balance Sheet`, `P&L`, `Cash Flow`, `Assets`, `Notes`, `Trial Balance`, `Cukai & Zakat`, `Deposits`, `Payments`, `Utama`). `SOCI` and `Partners' Capital` protected without password and hidden. `Mapping` hidden, unprotected. |
| Defined names | `Headers` = `Deposits!$D$5:$G$5`, `_FilterDatabase` on Deposits, print areas. None are read or changed by the add-in. |

Sheet order: `Balance Sheet`, `P&L`, `SOCI` (hidden), `Cash Flow`, `Partners' Capital` (hidden), `Assets`, `Notes`,
`Trial Balance`, `Cukai & Zakat`, `Deposits`, `Payments`, `Mapping` (hidden), `Utama`.

## Ranges the adapter reads (read-only)

| Purpose | Range | Verification before reading |
|---|---|---|
| Version | `Utama!AF25` | Must equal `v2.26.02` |
| Business name (local only, never sent to API) | `Utama!F5` | |
| Opening cash balance ("Baki Mula") | `Utama!F10` | `Utama!D10` must read `Baki Mula` |
| Deposit headers | `Deposits!A5:G5` | Exact labels (see below) |
| Deposit rows | `Deposits!A6:G{Total-1}` | `Total` row found by scanning `Deposits!B6:B5000` |
| Deposit workbook total | `Deposits!C{Total}` (template: `C366` = `SUM(C6:C365)`) | used for reconciliation |
| Payment group headers | `Payments!A4:AO4` (merged; forward-filled) | |
| Payment headers | `Payments!A5:AO5` | Exact labels (see below) |
| Payment rows | `Payments!A6:AO{Total-1}` | `Total` row found by scanning `Payments!C6:C5000` |
| Payment workbook total | `Payments!D{Total}` (template: `D365` = `SUM(D6:D364)`) | used for reconciliation |

The `Total` row is located dynamically because the workbook's FAQ #11 explains how users add rows.

### Deposits (cash and bank receipts), header row 5

| Col | Label | Cash-flow group used |
|---|---|---|
| A | Tarikh | date |
| B | Butiran | description (local only) |
| C | Jumlah Deposit (RM) | formula `SUM(D:G)`, not read per row |
| D | Pendapatan / Revenue | Operasi |
| E | Modal Pemilik & Rakan Kongsi | Pembiayaan |
| F | Refunds | Operasi |
| G | Pinjaman | Pembiayaan |

### Payments (cash and bank payments), header row 5, group row 4

`A` No., `B` Tarikh, `C` Butiran, `D` Jumlah (RM) = `SUM(E:AO)`. Category columns `E`–`AO`:

| Group (row 4) | Columns |
|---|---|
| PERBELANJAAN PENTADBIRAN | E Gaji / EPF / SOCSO … P Insuran |
| PERBELANJAAN PROFESIONAL | Q Consultancy Fee … U Audit |
| PERBELANJAAN PERJALANAN | V Petrol, Parking & Tol, W Hotel |
| PEMBAIKAN & PENYELENGGARAAN | X … AB (includes AA Pemasaran, AB Sewa as laid out in the template) |
| CAJ KEWANGAN | AC Caj Bank, AD Caj Faedah |
| KOS JUALAN | AE Bayaran Kepada Pembekal, AF Clearing & Forwarding, AG Ambilan |
| ASET BUKAN SEMASA | AH Hartanah … AM Security Deposits |
| LIABILITI SEMASA | AN Hire Purchase, AO Term Loan |

The full exact label list is in `layout.ts`. Labels are compared case-insensitively with whitespace collapsed
(the template has `"Bil Telefon & Internet "` and `" Audit "` with stray spaces).

## Interpretation decisions (please confirm)

1. **Every Deposits row is a cash inflow; every Payments row is a cash outflow.** This includes capital, loans, drawings (`Ambilan`), assets and loan repayments, because they all move cash.
2. **Opening balance = `Utama!F10` "Baki Mula".** The workbook's own `Cash Flow!G38` uses this cell as "Cash and cash equivalents at the beginning of the period". An empty cell is treated as *unknown*, not zero.
3. **Internal bank↔cash transfers:** the template has no transfer column, so transfers cannot be detected. If users record transfers as both a deposit and a payment, inflow and outflow will both be overstated (net is unaffected). Needs confirmation of how users record transfers.
4. **Reconciliation** compares the sum of every numeric category cell read against the workbook's own `Total` cells. The workbook's `Cash Flow` statement (indirect method) is **not** used for reconciliation because it is built from P&L and balance sheet movements, a different basis.
5. Dates are expected as real Excel dates. Text dates in `dd/mm/yyyy` are accepted; anything else is reported as an invalid date.

## Still required before enabling in production

- [ ] Test with a **copy** of a workbook containing real transactions (several months, both sheets).
- [ ] Confirm totals reconcile to the sen with `Deposits` / `Payments` Total rows.
- [ ] Confirm decisions 1–3 above with the Akaun Simple product owner.
- [ ] Run the before/after integrity checklist in `docs/testing.md` in real Excel Desktop.
- [ ] Decide the policy for other versions (2025 workbooks, future v2.26.x). Each needs its own verified layout entry.
