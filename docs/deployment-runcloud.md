# Deployment: RunCloud server (prepared, NOT deployed)

> Nothing has been deployed. No server has been inspected or changed. The steps below need
> explicit approval and must be run by someone with access to the RunCloud server.

## 0. Server inspection (read-only, do first)

Run these and record the output before changing anything:

```bash
lsb_release -a; uname -r
nproc; free -h; df -h /home
node -v; which node        # need Node.js ≥ 20.11 (built and tested with v24.12.0)
sudo ss -ltnp              # confirm port 8787 is free; note existing services
ls /etc/nginx-rc/conf.d /etc/nginx-rc/extra.d   # RunCloud nginx layout
systemctl list-units --type=service --state=running
```

Do **not** upgrade shared PHP or Node versions, restart other services, or edit other apps' configs.
If the system Node is older than 20.11, install a separate Node for this app only (e.g. under
`/home/akaunai/.local/node`) and point `ExecStart` in the unit file at it.

## 1. DNS + web application

1. Point `ai.akaunsimple.my` (A/AAAA) to the server. **The hostname is provisional until DNS ownership is confirmed.**
2. RunCloud → create a **new** Web Application `akaun-simple-ai` (system user `akaunai`, Native NGINX, no PHP needed).
3. Public path: `/home/akaunai/apps/akaun-simple-ai/current/apps/excel-addin/dist`.
4. Issue an SSL certificate (Let's Encrypt) in RunCloud and force HTTPS.
5. RunCloud → NGINX Config → add `deploy/nginx/runcloud-location.main-before.conf` (type `location.main-before`).

## 2. Application directory

```bash
sudo -iu akaunai
mkdir -p ~/apps/akaun-simple-ai/releases
git clone <repo-url> ~/apps/akaun-simple-ai/repo
```

## 3. Secrets

```bash
sudo mkdir -p /etc/akaun-simple-ai
sudo cp .env.example /etc/akaun-simple-ai/api.env
sudo chown root:akaunai /etc/akaun-simple-ai/api.env && sudo chmod 640 /etc/akaun-simple-ai/api.env
sudo nano /etc/akaun-simple-ai/api.env   # set provider key(s), PILOT_ACCESS_KEYS, CORS origin
```

Generate pilot keys on a trusted machine with `npm run keygen -- <label>`. Only the `label:hash` goes on the server.

## 4. Service

```bash
sudo cp deploy/systemd/akaun-simple-ai-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable akaun-simple-ai-api
# allow the deploy user to restart ONLY this unit:
echo 'akaunai ALL=(root) NOPASSWD: /bin/systemctl restart akaun-simple-ai-api' | sudo tee /etc/sudoers.d/akaun-simple-ai
sudo visudo -cf /etc/sudoers.d/akaun-simple-ai
```

## 5. Release (git-based)

```bash
sudo -iu akaunai
bash ~/apps/akaun-simple-ai/repo/deploy/scripts/deploy.sh v1.0.0
```

`deploy.sh` checks out the tag into a new release directory, runs `npm ci`, the test suite and the build,
switches the `current` symlink, restarts the service, and **rolls back automatically** if
`/api/health` does not respond within 15 s. The last 5 releases are kept.

Build-time flags for the add-in (set in the environment before `deploy.sh` if needed):
`VITE_ENABLE_PRODUCTION_ADAPTER=true` only after the workbook mapping has been verified.

## 6. Verify

```bash
curl -fsS https://ai.akaunsimple.my/api/health
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://ai.akaunsimple.my/api/v1/skills/CASH_FLOW_001/insights   # expect 401
journalctl -u akaun-simple-ai-api -n 50 --no-pager
```

Then sideload `apps/excel-addin/manifest.prod.xml` (see `docs/sideloading.md`).

## Rollback

```bash
bash ~/apps/akaun-simple-ai/repo/deploy/scripts/rollback.sh            # previous release
bash ~/apps/akaun-simple-ai/repo/deploy/scripts/rollback.sh <dir-name> # specific release
```

Full removal (no impact on other apps): `systemctl disable --now akaun-simple-ai-api`, delete the RunCloud web app,
remove `/etc/akaun-simple-ai`, `/etc/sudoers.d/akaun-simple-ai`, and `~akaunai/apps/akaun-simple-ai`.
Users' workbooks are unaffected. At most they keep the `AI Cash Flow` / `_AI_CF_DATA` sheets, which they can delete.

## Logs

- journald, identifier `akaun-simple-ai-api`, structured JSON. No request bodies, figures, prompts, AI output or keys are logged (tested).
- Retention: optionally `deploy/journald/akaun-simple-ai.conf`. It is server-wide, so agree it with the server owner.
