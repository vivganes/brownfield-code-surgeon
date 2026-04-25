import { describe, it, expect } from "vitest";
import * as pkg from "./index.js";

describe("public API", () => {
  it("exports runPipeline", () => {
    expect(pkg.runPipeline).toBeTypeOf("function");
  });

  it("exports parseArgs", () => {
    expect(pkg.parseArgs).toBeTypeOf("function");
  });

  it("exports HELP text", () => {
    expect(pkg.HELP).toBeTypeOf("string");
    expect(pkg.HELP).toContain("surgery-run");
  });

  it("parseArgs is callable through public surface", () => {
    const args = pkg.parseArgs(["--repo", ".", "--request", "demo"]);
    expect(args.request).toBe("demo");
  });

  it("runPipeline accepts RunOptions shape", () => {
    // Call signature check: runPipeline must take a single options object
    // and return a Promise. We don't actually invoke the network here.
    expect(pkg.runPipeline.length).toBe(1);
  });
});
