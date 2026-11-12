# Microsoft Marketplace (AppSource) readiness checklist (future, do NOT submit yet)

| Item | Status |
|---|---|
| Partner Center publisher account / verified publisher | ☐ Not started |
| Final add-in name, unique Id, versioning policy | ☐ Id fixed in `manifest.template.xml`. Name to confirm |
| Manifest validation (`npm run validate:manifest`) | ☐ Run against `manifest.prod.xml` |
| Production HTTPS domain, valid certificate, stable URLs | ☐ `ai.akaunsimple.my` provisional |
| Designed icons (16/32/64/80/128 + store icon 300×300) | ☐ Placeholders only (`npm run icons`) |
| Privacy Policy URL (what aggregates are sent, to which AI providers, retention) | ☐ |
| Terms of Use / EULA URL | ☐ |
| Support URL (`SupportUrl` in manifest) | ☐ `/support` placeholder |
| Store listing text (Bahasa Melayu + English), screenshots, optional video | ☐ |
| Demo workbook for certification (synthetic data only) | ☐ Can be generated from the demo adapter data |
| Demo / test account (certification needs a working access key, or a sign-in flow) | ☐ Pilot keys are not suitable. Needs a reviewer path |
| Accessibility review of task pane | ☐ |
| Security review (`docs/security.md`), dependency audit | ☐ |
| Compatibility testing on supported Excel platforms (Windows, web, Mac if claimed) | ☐ Only Windows targeted |
| Licensing/monetisation model (free, or paid outside Marketplace) | ☐ Out of scope for Phase 1 |
| Commercial-marketplace policies: AI-generated content disclosure | ☐ Disclaimers exist in UI and worksheet |
