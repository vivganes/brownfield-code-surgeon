/**
 * Coverage tests for session.ts lines 53-114 — the bootstrapFinishSession function
 * which calls the Anthropic SDK. All SDK calls are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bootstrapFinishSession } from "./session.js";
import type { SessionBootstrapArgs } from "./session.js";

// Mock the agent-cache so we control resolveAgentId without touching disk.
vi.mock("./agent-cache.js", () => ({
  resolveAgentId: vi.fn(async () => ({ agentId: "agent-123", cached: true })),
}));

// Mock core-prompts
vi.mock("@brownfield-surgeon/core-prompts", () => ({
  loadPrompt: vi.fn(() => ({ body: "system prompt body" })),
}));

function makeClient() {
  return {
    beta: {
      agents: {
        create: vi.fn(async () => ({ id: "new-agent-id" })),
      },
      sessions: {
        create: vi.fn(async () => ({ id: "session-abc" })),
        events: {
          send: vi.fn(async () => {}),
        },
      },
    },
  };
}

function baseArgs(client: ReturnType<typeof makeClient>): SessionBootstrapArgs {
  return {
    client: client as any,
    model: "claude-opus-4-5",
    agentName: "finish-agent",
    environmentId: "env-1",
    repoUrl: "https://github.com/org/repo",
    baseBranch: "main",
    scratchBranch: "surgery/r-1/finish",
    githubToken: "ghp_token",
    runId: "r-1",
  };
}

describe("bootstrapFinishSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns sessionId, agentId, and agentCached from resolveAgentId", async () => {
    const client = makeClient();
    const result = await bootstrapFinishSession(baseArgs(client));

    expect(result.sessionId).toBe("session-abc");
    expect(result.agentId).toBe("agent-123");
    expect(result.agentCached).toBe(true);
  });

  it("calls sessions.create with correct fields", async () => {
    const client = makeClient();
    await bootstrapFinishSession(baseArgs(client));

    expect(client.beta.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "agent-123",
        environment_id: "env-1",
        title: "surgery/r-1/finish",
        metadata: expect.objectContaining({ runId: "r-1", phase: "finish", engine: "managed" }),
      }),
    );
  });

  it("mounts github_repository resource with correct checkout branch", async () => {
    const client = makeClient();
    const args = baseArgs(client);
    args.checkoutBranch = "surgery/r-1/finish";
    await bootstrapFinishSession(args);

    const callArg = client.beta.sessions.create.mock.calls[0]?.[0] as any;
    const resource = callArg?.resources?.[0];
    expect(resource).toMatchObject({
      type: "github_repository",
      url: "https://github.com/org/repo",
      checkout: { type: "branch", name: "surgery/r-1/finish" },
      mount_path: "/workspace/repo",
    });
  });

  it("defaults checkoutBranch to baseBranch when not provided", async () => {
    const client = makeClient();
    await bootstrapFinishSession(baseArgs(client));

    const callArg = client.beta.sessions.create.mock.calls[0]?.[0] as any;
    const resource = callArg?.resources?.[0];
    expect(resource.checkout.name).toBe("main"); // baseBranch
  });

  it("sends a user.message kickoff event after session is created", async () => {
    const client = makeClient();
    await bootstrapFinishSession(baseArgs(client));

    expect(client.beta.sessions.events.send).toHaveBeenCalledWith(
      "session-abc",
      expect.objectContaining({
        events: expect.arrayContaining([
          expect.objectContaining({ type: "user.message" }),
        ]),
      }),
    );
  });

  it("uses systemPrompt override when provided, skipping loadPrompt", async () => {
    const { loadPrompt } = await import("@brownfield-surgeon/core-prompts");
    const client = makeClient();
    await bootstrapFinishSession({
      ...baseArgs(client),
      systemPrompt: "custom system",
    });
    // resolveAgentId is mocked so we can't check its `system` arg directly,
    // but loadPrompt should NOT have been called.
    expect(loadPrompt).not.toHaveBeenCalled();
  });

  it("passes through request in the kickoff prompt body", async () => {
    const client = makeClient();
    await bootstrapFinishSession({
      ...baseArgs(client),
      request: "add dark mode feature",
    });

    const sendCall = client.beta.sessions.events.send.mock.calls[0] as any[];
    const events = sendCall?.[1]?.events ?? [];
    const msg = events[0];
    const text = msg?.content?.[0]?.text ?? "";
    expect(text).toContain("add dark mode feature");
  });

  it("embeds attachedFiles in the kickoff prompt body", async () => {
    const client = makeClient();
    await bootstrapFinishSession({
      ...baseArgs(client),
      attachedFiles: [{ path: "plan/plan.md", content: "the plan" }],
    });

    const sendCall = client.beta.sessions.events.send.mock.calls[0] as any[];
    const events = sendCall?.[1]?.events ?? [];
    const text = events[0]?.content?.[0]?.text ?? "";
    expect(text).toContain("plan/plan.md");
    expect(text).toContain("the plan");
  });

  it("calls createAgent (via resolveAgentId) with the resolved system prompt", async () => {
    const { resolveAgentId } = await import("./agent-cache.js");
    const client = makeClient();
    await bootstrapFinishSession(baseArgs(client));

    expect(resolveAgentId).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-4-5",
        name: "finish-agent",
        system: "system prompt body",
      }),
    );
  });

  it("createAgent fn calls client.beta.agents.create with correct shape", async () => {
    // Arrange: override resolveAgentId to actually invoke createAgent so we
    // exercise lines 58-73 in session.ts.
    const { resolveAgentId } = await import("./agent-cache.js");
    (resolveAgentId as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (args: { createAgent: (a: any) => Promise<{ id: string }> }) => {
        const result = await args.createAgent({
          model: "claude-opus-4-5",
          name: "finish-agent",
          system: "system prompt body",
        });
        return { agentId: result.id, cached: false };
      },
    );

    const client = makeClient();
    const result = await bootstrapFinishSession(baseArgs(client));

    expect(client.beta.agents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-4-5",
        name: "finish-agent",
        tools: expect.arrayContaining([
          expect.objectContaining({ type: "agent_toolset_20260401" }),
        ]),
      }),
    );
    expect(result.agentId).toBe("new-agent-id");
    expect(result.agentCached).toBe(false);
  });
});
