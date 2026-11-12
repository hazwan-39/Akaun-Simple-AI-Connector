# Excel compatibility

| Capability | API used | Requirement set | Behaviour if unsupported |
|---|---|---|---|
| Load add-in at all | manifest `<Set Name="ExcelApi" MinVersion="1.7"/>` | ExcelApi 1.7 | Add-in not offered |
| Read ranges, list sheets | `Range.values`, `worksheets` | 1.1 | n/a (covered by 1.7) |
| Detect sheet + workbook protection | `worksheet.protection`, `workbook.protection` | 1.2 / 1.7 | n/a |
| Ownership tag on AI sheets | `worksheet.customProperties` | **1.12** | Worksheet creation disabled. Results shown in the task pane only |
| Chart data from hidden sheet | `chart.plotVisibleOnly` | 1.8 | Covered by the 1.12 check |
| Create/update charts | `charts.add`, `chart.setData` | 1.1 / 1.4 | n/a |

The add-in checks `Office.context.requirements.isSetSupported()` at runtime (`src/office/host.ts`).

**Which Excel builds support which sets:** use Microsoft's "Excel JavaScript API requirement sets"
page as the source of truth. In general, Microsoft 365 (subscription) Excel on Windows is current, while
perpetual Office versions (2016/2019/2021/2024) stop at a fixed requirement set. Confirm the exact
set for any perpetual version a pilot user runs **before** promising worksheet creation.
This has not been checked against real installed Excel builds in this environment.

Initial target: **Microsoft 365 Excel Desktop for Windows.** Excel on the web and Mac are untested.
