import { cp } from "node:fs/promises";

await cp(
  new URL("../src/migrations/", import.meta.url),
  new URL("../dist/migrations/", import.meta.url),
  { recursive: true, filter: (source) => !source.endsWith(".gitkeep") },
);

await cp(
  new URL("../config/prices/catalogs/", import.meta.url),
  new URL("../dist/catalogs/", import.meta.url),
  { recursive: true },
);
