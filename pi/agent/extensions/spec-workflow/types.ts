export type SpecPhase =
  | "idle"
  | "plan"
  | "approved"
  | "execute"
  | "verify_ready"
  | "verify"
  | "report"
  | "passed"
  | "passed_with_issues"
  | "blocked"
  | "failed"
  | "canceled";

export type TaskStatus = "pending" | "in_progress" | "blocked" | "complete";

export type ValidationSpec = {
  id: string;
  command: string;
  description?: string;
};

export type AcceptanceCriterion = {
  id: string;
  text: string;
  line: number;
};

export type Requirement = {
  id: string;
  text: string;
  line: number;
  acceptanceCriteria: AcceptanceCriterion[];
};

export type TaskRuntime = {
  id: string;
  title: string;
  line: number;
  depends: string[];
  owns: string[];
  ac: string[];
  validates: string[];
  status: TaskStatus;
  attempts: number;
  commits: string[];
  commitSkipped?: {
    reason: string;
    changedFiles: string[];
    validationEvidence: string[];
  } | null;
  amendments: string[];
};

export type SpecRuntime = {
  schemaVersion: 1;
  slug: string;
  phase: SpecPhase;
  status: string;
  requirements: Requirement[];
  validations: ValidationSpec[];
  tasks: TaskRuntime[];
  docsImpact: string;
  approval?: {
    approvedAt: string;
    artifactHashes: Record<string, string>;
  };
  challenge?: {
    status: "not_run" | "passed" | "accepted_risks" | "blocked";
    findings: string[];
  };
  fixRoundsUsed: number;
  knownIssues: string[];
  amendments: string[];
  updatedAt: string;
};

export type Diagnostic = {
  file?: string;
  section?: string;
  line?: number;
  message: string;
};

export type CompileResult =
  | { ok: true; runtime: SpecRuntime; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };
