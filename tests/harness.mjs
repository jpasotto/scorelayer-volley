// Tier-1 test harness: extract the export-pipeline region of index.html
// (between the `// EXPORTERS_BEGIN` / `// EXPORTERS_END` sentinels) and
// evaluate it in a sandboxed `vm` context. The exporters are pure functions,
// so stub globals are sufficient — no DOM, no network, no Firebase.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");

const BEGIN = "// EXPORTERS_BEGIN";
const END = "// EXPORTERS_END";
const begin = html.indexOf(BEGIN);
const end = html.indexOf(END);
if (begin < 0 || end < 0 || end < begin) {
  throw new Error(
    "Sentinel comments missing in index.html — expected " +
      BEGIN +
      " / " +
      END
  );
}
const src = html.slice(begin, end);

const sandbox = {
  console,
  window: {},
  document: {},
  navigator: {},
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  firebase: new Proxy(
    {},
    {
      get() {
        throw new Error("Tests must not touch firebase.");
      },
    }
  ),
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "index-v3.html-exporters" });

export const helpers = sandbox;
