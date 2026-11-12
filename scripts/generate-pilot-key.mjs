// Generates a pilot access key and the matching PILOT_ACCESS_KEYS entry.
// Usage: npm run keygen -- <label>
// Give the KEY to the pilot user privately. Put only the HASH entry on the server.
import { createHash, randomBytes } from "node:crypto";

const label = (process.argv[2] ?? "pilot").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40) || "pilot";
const key = `asai_${randomBytes(32).toString("base64url")}`;
const hash = createHash("sha256").update(key, "utf8").digest("hex");

console.log("Access key (give to the user, shown once):");
console.log(`  ${key}`);
console.log("");
console.log("Server entry (append to PILOT_ACCESS_KEYS, comma-separated):");
console.log(`  ${label}:${hash}`);
