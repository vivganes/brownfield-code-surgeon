import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "@brownfield-surgeon/core-prompts";
import { resolveAgentId, type CreateAgentFn } from "./agent-cache.js";

export interface SessionBootstrapArgs {
  client: Anthropic;
  model: string;
  agentName: string;
  environmentId: string;
  repoUrl: string;
  baseBranch: string;
  scratchBranch: string;
  githubToken: string;
  runId: string;
  request?: string;
  /**
   * Optional override for the system prompt. Defaults to the contents of
   * 7-finish.agent.md from @brownfield-surgeon/core-prompts.
   */
  systemPrompt?: string;
}

export interface SessionBootstrapResult {
  sessionId: string;
  agentId: string;
  agentCached: boolean;
}

/**
 * Resolves (or creates) the cached Finish agent, opens a session with the
 * github_repository resource mounted at /workspace/repo, and sends the
 * kick-off user.message that tells the agent to run the Finish phase, commit,
 * and push to the scratch branch.
 */
export async function bootstrapFinishSession(
  args: SessionBootstrapArgs,
): Promise<SessionBootstrapResult> {
  const system = args.systemPrompt ?? loadPrompt("finish").body;

  const createAgent: CreateAgentFn = async ({ model, name, system }) => {
    const agent = await args.client.beta.agents.create({
      model,
      name,
      system,
      tools: [
        {
          type: "agent_toolset_20260401",
          default_config: {
            enabled: true,
            permission_policy: { type: "always_allow" },
          },
        },
      ],
    });
    return { id: agent.id };
  };

  const { agentId, cached } = await resolveAgentId({
    model: args.model,
    system,
    name: args.agentName,
    createAgent,
  });

  const session = await args.client.beta.sessions.create({
    agent: agentId,
    environment_id: args.environmentId,
    title: `surgery/${args.runId}/finish`,
    metadata: {
      runId: args.runId,
      phase: "finish",
      engine: "managed",
    },
    resources: [
      {
        type: "github_repository",
        url: args.repoUrl,
        authorization_token: args.githubToken,
        checkout: { type: "branch", name: args.baseBranch },
        mount_path: "/workspace/repo",
      },
    ],
  });

  await args.client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: buildKickoffPrompt(args) }],
      },
    ],
  });

  return { sessionId: session.id, agentId, agentCached: cached };
}

export function buildKickoffPrompt(args: {
  scratchBranch: string;
  baseBranch: string;
  runId: string;
  request?: string;
}): string {
  const lines: string[] = [];
  lines.push(
    "You are the Finish phase of a brownfield code-surgery run. Follow the system prompt — your operating instructions are the Finish phase agent prompt.",
  );
  lines.push("");
  lines.push(`Run ID: ${args.runId}`);
  if (args.request) lines.push(`Original surgery request: ${args.request}`);
  lines.push(`Working tree: /workspace/repo`);
  lines.push(`Base branch: ${args.baseBranch}`);
  lines.push(`Scratch branch (your work goes here): ${args.scratchBranch}`);
  lines.push("");
  lines.push("Before you start coding:");
  lines.push(
    `  1. \`cd /workspace/repo && git checkout -B ${args.scratchBranch}\`. The base branch is already checked out for you.`,
  );
  lines.push(
    "  2. Configure git identity: `git config user.email \"surgeon@brownfield.local\" && git config user.name \"Brownfield Surgeon\"`.",
  );
  lines.push("");
  lines.push("When the Finish phase is done:");
  lines.push(
    "  - Stage and commit any remaining changes with a clear summary message.",
  );
  lines.push(
    `  - Push the scratch branch: \`git push -u origin ${args.scratchBranch}\`.`,
  );
  lines.push(
    "  - End your turn. The local runner will pull your work and surface the diff.",
  );
  return lines.join("\n");
}
