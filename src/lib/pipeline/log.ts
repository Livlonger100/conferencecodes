// Lightweight structured logger for pipeline jobs.
// Every line is prefixed with the job name + run id and printed as JSON so it is
// easy to read in Vercel logs. The same entries are accumulated and returned in
// the worker's HTTP response so you can watch a run without opening logs.
// Credit-relevant actions (Firecrawl scrape, stealth escalation, Claude calls)
// are logged explicitly so spend is visible.

export interface LogEntry {
  t: string; // ISO timestamp
  level: "info" | "warn" | "error" | "spend";
  msg: string;
  data?: Record<string, unknown>;
}

export class JobLogger {
  readonly job: string;
  readonly runId: string;
  private entries: LogEntry[] = [];

  constructor(job: string) {
    this.job = job;
    // Not security-sensitive; just correlates lines from one run.
    this.runId = `${Date.now().toString(36)}`;
  }

  private write(level: LogEntry["level"], msg: string, data?: Record<string, unknown>) {
    const entry: LogEntry = { t: new Date().toISOString(), level, msg, data };
    this.entries.push(entry);
    const line = `[${this.job}:${this.runId}] ${level.toUpperCase()} ${msg}`;
    if (level === "error") console.error(line, data ?? "");
    else if (level === "warn") console.warn(line, data ?? "");
    else console.log(line, data ?? "");
  }

  info(msg: string, data?: Record<string, unknown>) { this.write("info", msg, data); }
  warn(msg: string, data?: Record<string, unknown>) { this.write("warn", msg, data); }
  error(msg: string, data?: Record<string, unknown>) { this.write("error", msg, data); }
  // Use for anything that costs credits/tokens so spend is auditable.
  spend(msg: string, data?: Record<string, unknown>) { this.write("spend", msg, data); }

  summary() {
    return { job: this.job, runId: this.runId, entries: this.entries };
  }
}
