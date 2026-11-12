// Renders manifest.dev.xml and manifest.prod.xml from manifest.template.xml.
// PROD_BASE_URL may be overridden while the ai.akaunsimple.my hostname is provisional.
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../apps/excel-addin/", import.meta.url);
const template = readFileSync(new URL("manifest.template.xml", dir), "utf8");
const version = "1.0.0.0";

const targets = [
  { file: "manifest.dev.xml", base: "https://localhost:3000", support: "https://localhost:3000/taskpane.html", suffix: " (Dev)" },
  {
    file: "manifest.prod.xml",
    base: process.env.PROD_BASE_URL ?? "https://ai.akaunsimple.my",
    support: process.env.SUPPORT_URL ?? "https://ai.akaunsimple.my/support",
    suffix: "",
  },
];

for (const t of targets) {
  if (!t.base.startsWith("https://")) throw new Error(`${t.file}: base URL must be https`);
  const xml = template
    .replace(/<!--[\s\S]*?-->\n/, "")
    .replaceAll("{{BASE_URL}}", t.base)
    .replaceAll("{{SUPPORT_URL}}", t.support)
    .replaceAll("{{VERSION}}", version)
    .replaceAll("{{NAME_SUFFIX}}", t.suffix);
  writeFileSync(new URL(t.file, dir), xml);
  console.log(`wrote apps/excel-addin/${t.file} (${t.base})`);
}
