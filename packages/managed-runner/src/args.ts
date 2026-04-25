import path from "node:path";

export interface CliArgs {
  repoRoot: string;
  runId: string;
  repoUrl?: string;
  baseBranch?: string;
  scratchBranch?: string;
  /**
   * Branch the cloud container should `git checkout` after cloning. Defaults
   * to `--base-branch`. The chained dispatch from run-manager passes the
   * scratch branch here so the cloud session resumes on top of phases 1–6.
   */
  checkoutBranch?: string;
  request?: string;
  agentEnvId?: string;
  model?: string;
  help: boolean;
  dryRun: boolean;
}

export const HELP = `surgery-managed — Brownfield Code Surgeon Managed Agents runner

Usage:
  surgery-managed --repo <path> [--request "<text>"] [options]

Required (or auto-derived from --repo):
  --repo <path>           Local repo to sync into (default: cwd)
  --repo-url <url>        Git URL the cloud container will clone
                          (default: \`git remote get-url origin\` in --repo)
  --base-branch <name>    Branch to start from
                          (default: \`origin/HEAD\` in --repo)

Options:
  --run-id <id>           Run identifier (must match the local run; default: generated)
  --scratch-branch <name> Override scratch branch name
                          (default: surgery/<runId>/finish)
  --checkout-branch <name>
                          Branch the cloud container clones into. Defaults to
                          --base-branch. Pass the scratch branch when phases
                          1–6 already pushed there (chained mode).
  --request <text>        Surgery request, only used to label the session
  --agent-env-id <id>     Managed-Agents environment ID
                          (default: read from secrets file or ANTHROPIC_AGENT_ENV_ID)
  --model <id>            Claude model ID (default: claude-opus-4-7)
  --dry-run               Print the plan and exit; do not call the API
  -h, --help              Show this help
`;

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    repoRoot: path.resolve(process.cwd()),
    runId: `run-${Date.now().toString(36)}`,
    help: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--repo":
        args.repoRoot = path.resolve(argv[++i] ?? ".");
        break;
      case "--repo-url":
        args.repoUrl = argv[++i];
        break;
      case "--base-branch":
        args.baseBranch = argv[++i];
        break;
      case "--scratch-branch":
        args.scratchBranch = argv[++i];
        break;
      case "--checkout-branch":
        args.checkoutBranch = argv[++i];
        break;
      case "--run-id":
        args.runId = argv[++i] ?? args.runId;
        break;
      case "--request":
        args.request = argv[++i];
        break;
      case "--agent-env-id":
        args.agentEnvId = argv[++i];
        break;
      case "--model":
        args.model = argv[++i];
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (a && a.startsWith("--")) {
          throw new Error(`unknown flag: ${a}`);
        }
    }
  }
  return args;
}

export function defaultScratchBranch(runId: string): string {
  return `surgery/${runId}/finish`;
}
