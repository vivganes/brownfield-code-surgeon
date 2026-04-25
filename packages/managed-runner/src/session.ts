import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt } from "@brownfield-surgeon/core-prompts";
import { resolveAgentId, type CreateAgentFn } from "./agent-cache.js";

export interface AttachedFile {
  /** Repo-relative path the cloud agent will see in its prompt. */
  path: string;
  content: string;
}

export interface SessionBootstrapArgs {
  client: Anthropic;
  model: string;
  agentName: string;
  environmentId: string;
  repoUrl: string;
  baseBranch: string;
  scratchBranch: string;
  /**
   * Branch the cloud container should clone+checkout. Defaults to baseBranch.
   * Pass scratchBranch when phases 1–6 already pushed there.
   */
  checkoutBranch?: string;
  githubToken: string;
  runId: string;
  request?: string;
  /**
   * Files to embed in the kickoff prompt as fenced code blocks. Used to give
   * the cloud Finish agent visibility into local-only methodology files
   * (plan/plan.md, plan/seams-and-dependencies.md) that don't reach the
   * cloud via git because they're gitignored.
   */
  attachedFiles?: AttachedFile[];
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

  const checkoutBranch = args.checkoutBranch ?? args.baseBranch;
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
        checkout: { type: "branch", name: checkoutBranch },
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
  checkoutBranch?: string;
  runId: string;
  request?: string;
  attachedFiles?: AttachedFile[];
}): string {
  const checkoutBranch = args.checkoutBranch ?? args.baseBranch;
  const resuming = checkoutBranch === args.scratchBranch;

  const lines: string[] = [];
  lines.push(
    "You are the Finish phase of a brownfield code-surgery run. Follow the system prompt — your operating instructions are the Finish phase agent prompt.",
  );
  lines.push("");
  lines.push(`Run ID: ${args.runId}`);
  if (args.request) lines.push(`Original surgery request: ${args.request}`);
  lines.push(`Working tree: /workspace/repo`);
  lines.push(`Base branch: ${args.baseBranch}`);
  lines.push(`Working branch (your commits land here): ${args.scratchBranch}`);
  lines.push(`Checked out branch on entry: ${checkoutBranch}`);
  lines.push("");

  if (resuming) {
    lines.push(
      `Phases 1–6 (plan, map, break, cover, implement, refactor) have already been completed locally and pushed to \`${args.scratchBranch}\` on origin. You're checked out on that branch — its tip is the result of phase 6. Your job is the Finish phase only: verify the implementation, finalize, and push your commits back to the same branch.`,
    );
  } else {
    lines.push(
      "This is a fresh run on the base branch. You will own all phases of the surgery, ending with the Finish phase.",
    );
  }
  lines.push("");

  if (args.attachedFiles && args.attachedFiles.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push(
      "Local-only methodology files from earlier phases (these are gitignored, so they aren't on the scratch branch — read them here):",
    );
    lines.push("");
    for (const f of args.attachedFiles) {
      lines.push(`### ${f.path}`);
      lines.push("");
      lines.push("```");
      lines.push(f.content.replace(/```/g, "``​`")); // defang inner fences
      lines.push("```");
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  lines.push("Before you start coding:");
  if (resuming) {
    lines.push(
      `  1. You are already on \`${args.scratchBranch}\`. Confirm with \`git status\`.`,
    );
  } else {
    lines.push(
      `  1. \`cd /workspace/repo && git checkout -B ${args.scratchBranch}\`. The base branch is already checked out for you.`,
    );
  }
  lines.push(
    "  2. Configure git identity: `git config user.email \"surgeon@brownfield.local\" && git config user.name \"Brownfield Surgeon\"`.",
  );
  lines.push("");
  lines.push("When the Finish phase is done:");
  lines.push(
    "  - Stage and commit any remaining changes with a clear summary message.",
  );
  lines.push(
    `  - Push your work back: \`git push -u origin ${args.scratchBranch}\`.`,
  );
  lines.push(
    "  - End your turn. The local runner will pull your work and surface the diff.",
  );
  return lines.join("\n");
}
