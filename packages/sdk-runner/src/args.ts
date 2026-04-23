import path from "node:path";
import { PhaseSchema, PHASES, type Phase } from "@brownfield-surgeon/shared";

export interface CliArgs {
  repoRoot: string;
  request: string;
  phases: Phase[];
  autoApprove: boolean;
  runId: string;
  help: boolean;
}

const HELP = `surgery-run — Brownfield Code Surgeon SDK runner

Usage:
  surgery-run --repo <path> --request "<feature description>" [options]

Options:
  --repo <path>         Repo to operate on (default: cwd)
  --request <text>      What the surgery should accomplish (required)
  --phases <list>       Comma-separated subset of phases to run
                        (default: plan,map,break,cover,implement,refactor,finish)
  --auto-approve        Do not wait for plan/.approvals/<phase>.ok between phases
  --run-id <id>         Override the generated run identifier
  -h, --help            Show this help
`;

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    repoRoot: path.resolve(process.cwd()),
    request: "",
    phases: [...PHASES],
    autoApprove: false,
    runId: `run-${Date.now().toString(36)}`,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--repo":
        args.repoRoot = path.resolve(argv[++i] ?? ".");
        break;
      case "--request":
        args.request = argv[++i] ?? "";
        break;
      case "--phases": {
        const list = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        args.phases = list.map((p) => PhaseSchema.parse(p));
        break;
      }
      case "--auto-approve":
        args.autoApprove = true;
        break;
      case "--run-id":
        args.runId = argv[++i] ?? args.runId;
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

export { HELP };
