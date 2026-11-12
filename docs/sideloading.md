# Development and sideloading (Excel Desktop, Windows)

## One-time setup

```bash
npm install
npm run certs        # installs a trusted localhost HTTPS certificate (office-addin-dev-certs; asks for admin consent)
npm run manifests    # renders manifest.dev.xml / manifest.prod.xml
cp .env.example .env # then set NODE_ENV=development, AI_PROVIDER=mock (or a real provider + key)
npm run keygen -- dev   # put the label:hash into PILOT_ACCESS_KEYS in .env; keep the key for the task pane
```

## Run

Terminal 1, API on http://127.0.0.1:8787:

```bash
npm run dev:api
```

Terminal 2, task pane on https://localhost:3000 (proxies `/api` to the API):

```bash
npm run dev:addin
```

## Sideload into Excel Desktop

Option A (automatic):

```bash
npm run sideload -w @akaun/excel-addin
```

Option B (manual, shared-folder catalog):

1. Share a folder (e.g. `C:\AddinManifests`) and copy `apps/excel-addin/manifest.dev.xml` into it.
2. Excel → File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs → add `\\<computer>\AddinManifests`, tick **Show in Menu**.
3. Restart Excel → Home → Add-ins → Advanced → SHARED FOLDER → *Akaun Simple AI (Dev)*.
4. The **Akaun Simple AI** button appears on the Home tab.

Use a **copy** of an Akaun Simple workbook for testing, never a customer's only copy.

`manifest.dev.xml` and `manifest.prod.xml` share the same add-in Id. Do not sideload both at once.

## Validate the manifest

```bash
npm run validate:manifest -w @akaun/excel-addin
```

(This calls Microsoft's validation service over the network.)
