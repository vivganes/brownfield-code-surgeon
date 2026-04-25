/**
 * Launcher: sets SURGERY_REPO_ROOT to the toy repo and starts the UI server.
 * Avoids needing cross-env on Windows.
 */
import path from "node:path";

process.env.SURGERY_REPO_ROOT = path.resolve(
  process.env.TOY_REPO_ROOT ?? path.join(process.cwd(), ".toy-repo"),
);

await import("./index.js");
