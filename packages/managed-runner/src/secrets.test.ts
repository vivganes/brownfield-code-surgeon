import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  readSecrets,
  writeSecrets,
  resolveGithubToken,
  resolveAgentEnvId,
} from "./secrets.js";

describe("secrets file", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-test-"));
    vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("readSecrets returns empty object when file is missing", () => {
    expect(readSecrets()).toEqual({});
  });

  it("writeSecrets persists fields readable by readSecrets", () => {
    writeSecrets({ githubToken: "ghp_x", agentEnvId: "env_y" });
    expect(readSecrets()).toEqual({ githubToken: "ghp_x", agentEnvId: "env_y" });
  });

  it("writeSecrets merges with existing fields", () => {
    writeSecrets({ githubToken: "ghp_x" });
    writeSecrets({ agentEnvId: "env_y" });
    expect(readSecrets()).toEqual({ githubToken: "ghp_x", agentEnvId: "env_y" });
  });

  it("readSecrets returns empty object on malformed JSON", () => {
    const dir = path.join(tmpHome, ".config", "brownfield-surgeon");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "secrets.json"), "not-json");
    expect(readSecrets()).toEqual({});
  });
});

describe("resolveGithubToken", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-test-"));
    vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("prefers explicit override over file and env", () => {
    writeSecrets({ githubToken: "from-file" });
    expect(
      resolveGithubToken("from-arg", { GITHUB_TOKEN: "from-env" }),
    ).toBe("from-arg");
  });

  it("falls back to file when no override", () => {
    writeSecrets({ githubToken: "from-file" });
    expect(resolveGithubToken(undefined, { GITHUB_TOKEN: "from-env" })).toBe(
      "from-file",
    );
  });

  it("prefers SURGERY_GIT_TOKEN over GITHUB_TOKEN", () => {
    expect(
      resolveGithubToken(undefined, {
        SURGERY_GIT_TOKEN: "from-surgery",
        GITHUB_TOKEN: "from-github",
      }),
    ).toBe("from-surgery");
  });

  it("falls back to GITHUB_TOKEN when nothing else set", () => {
    expect(resolveGithubToken(undefined, { GITHUB_TOKEN: "from-github" })).toBe(
      "from-github",
    );
  });

  it("returns undefined when no source has a value", () => {
    expect(resolveGithubToken(undefined, {})).toBeUndefined();
  });
});

describe("resolveAgentEnvId", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-test-"));
    vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("prefers override > file > env", () => {
    writeSecrets({ agentEnvId: "env_file" });
    expect(
      resolveAgentEnvId("env_arg", { ANTHROPIC_AGENT_ENV_ID: "env_env" }),
    ).toBe("env_arg");
    expect(
      resolveAgentEnvId(undefined, { ANTHROPIC_AGENT_ENV_ID: "env_env" }),
    ).toBe("env_file");
  });
});
