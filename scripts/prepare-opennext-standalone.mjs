import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dotNext = path.join(root, ".next");
const standalone = path.join(dotNext, "standalone");
const standaloneNext = path.join(standalone, ".next");

if (!fs.existsSync(dotNext)) {
  throw new Error("Missing .next. Run `next build` before preparing OpenNext standalone files.");
}

fs.rmSync(standalone, { recursive: true, force: true });
fs.mkdirSync(standaloneNext, { recursive: true });

for (const entry of fs.readdirSync(dotNext)) {
  if (entry === "standalone") continue;
  const src = path.join(dotNext, entry);
  const dst = path.join(standaloneNext, entry);
  fs.cpSync(src, dst, { recursive: true, dereference: false });
}

for (const file of ["package.json", "package-lock.json", "next.config.js", "open-next.config.ts"]) {
  const src = path.join(root, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(standalone, file));
}

const nodeModulesSrc = path.join(root, "node_modules");
const nodeModulesDst = path.join(standalone, "node_modules");
if (fs.existsSync(nodeModulesSrc) && !fs.existsSync(nodeModulesDst)) {
  fs.symlinkSync(nodeModulesSrc, nodeModulesDst, "dir");
}

const serverJs = path.join(standalone, "server.js");
if (!fs.existsSync(serverJs)) {
  fs.writeFileSync(serverJs, "// Prepared for OpenNext Cloudflare build.\n");
}

console.log("Prepared .next/standalone for OpenNext.");
