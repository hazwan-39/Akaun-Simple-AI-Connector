# Security (MVP pilot)

| Requirement | Implementation |
|---|---|
| HTTPS | Nginx/RunCloud TLS. Node binds to `127.0.0.1` only. Manifests are https-only (build script refuses http). |
| Server-side API keys | Provider keys only in `/etc/akaun-simple-ai/api.env`. The add-in bundle is checked to contain no provider keys or endpoints. |
| Authentication | Per-user pilot access keys (`asai_` + 256-bit random). The server stores SHA-256 hashes only and compares in constant time. |
| Authorisation | Only `enabled` skills are routable. Coming-soon skills return 403. |
| No unlimited paid usage | Per-key daily quota (default 30 generations; refunded on failure), per-key rate limit (10/min), per-IP pre-auth limit (120/min). |
| Input validation | Strict Zod schemas (unknown fields rejected, bounded strings/arrays, 2-decimal money). Arithmetic re-verified server-side (422). |
| Output validation | Provider-side JSON schema plus strict Zod validation. Invalid output is never displayed (one retry, then 502). Validated again in the task pane. |
| Request size | `express.json` limit 64 kB, Nginx `client_max_body_size 64k`. Auth runs before body parsing. |
| Error handling | Generic Bahasa Melayu messages with request id. Internal details only in logs. |
| Minimal data transfer | Aggregates only: no descriptions, names, SSM number or individual transactions. Provider calls use `store: false` (OpenAI). |
| Logging | Request id, path, status, timing, key label. A redaction filter drops sensitive keys. Tested to exclude figures and keys. |
| Prompt injection | Fixed instructions. Workbook data is delimited in `<financial_data>`, declared as untrusted data, labels re-sanitised. Output limited to a fixed schema with no tools. |
| Hallucinated figures | RM amounts in AI text are checked against the summary. Mismatches are shown as warnings. |
| Formula injection | `sanitizeCellText()` on every text cell, and `guardPlan()` rejects unsanitised formula-like text and non-whitelisted formulas. |
| CORS | Explicit origin allowlist. Wildcard and http origins are refused at startup in production. |
| Code execution | AI output is never executed. Only fixed templates produce workbook writes. |

## Known MVP limitations

- Quota and rate-limit state is in memory: it resets on restart and assumes a single instance.
- Pilot keys are long-lived bearer tokens stored in the add-in's browser storage. Rotate by editing `PILOT_ACCESS_KEYS` and restarting.
- No per-user audit trail beyond journald access logs.
- CSP in the Nginx snippet must be checked in real Office hosts before enforcing (Office may need extra `frame-ancestors`).
