import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentHash, resolveAgentId, readCache } from "./agent-cache.js";

describe("agentHash", () => {
  it("is deterministic for the same (model, system)", () => {
    const a = agentHash({ model: "claude-opus-4-7", system: "do the thing" });
    const b = agentHash({ model: "claude-opus-4-7", system: "do the thing" });
    expect(a).toBe(b);
  });

  it("changes when model changes", () => {
    expect(agentHash({ model: "claude-opus-4-7", system: "x" })).not.toBe(
      agentHash({ model: "claude-sonnet-4-6", system: "x" }),
    );
  });

  it("changes when system prompt changes", () => {
    expect(agentHash({ model: "claude-opus-4-7", system: "x" })).not.toBe(
      agentHash({ model: "claude-opus-4-7", system: "y" }),
    );
  });
});

describe("resolveAgentId", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cache-test-"));
    vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("calls createAgent on cache miss and caches the result", async () => {
    const createAgent = vi.fn().mockResolvedValue({ id: "agent_001" });
    const r = await resolveAgentId({
      model: "claude-opus-4-7",
      system: "S",
      name: "Test",
      createAgent,
    });
    expect(r).toEqual({ agentId: "agent_001", cached: false });
    expect(createAgent).toHaveBeenCalledTimes(1);

    const cache = readCache();
    expect(Object.values(cache.agents)).toHaveLength(1);
  });

  it("skips createAgent on cache hit", async () => {
    const createAgent = vi.fn().mockResolvedValue({ id: "agent_001" });
    await resolveAgentId({
      model: "claude-opus-4-7",
      system: "S",
      name: "Test",
      createAgent,
    });
    const r = await resolveAgentId({
      model: "claude-opus-4-7",
      system: "S",
      name: "Test",
      createAgent,
    });
    expect(r).toEqual({ agentId: "agent_001", cached: true });
    expect(createAgent).toHaveBeenCalledTimes(1);
  });

  it("creates a separate cache entry for a different prompt", async () => {
    const createAgent = vi
      .fn()
      .mockResolvedValueOnce({ id: "agent_001" })
      .mockResolvedValueOnce({ id: "agent_002" });
    await resolveAgentId({
      model: "claude-opus-4-7",
      system: "S1",
      name: "Test",
      createAgent,
    });
    await resolveAgentId({
      model: "claude-opus-4-7",
      system: "S2",
      name: "Test",
      createAgent,
    });
    expect(createAgent).toHaveBeenCalledTimes(2);
    expect(Object.values(readCache().agents)).toHaveLength(2);
  });
});
