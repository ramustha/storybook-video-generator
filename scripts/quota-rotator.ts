import fs from "fs/promises";
import { existsSync, createReadStream } from "fs";
import path from "path";
import { google } from "googleapis";

export interface ProjectConfig {
  id: string;
  name: string;
  dirPath: string;
  credentialsPath: string;
  tokenPath: string;
  isConfigured: boolean;
}

export interface RotationState {
  activeProjectId: string;
  exhaustedProjects: Record<string, string>; // projectId -> ISO timestamp
  lastResetDatePT: string; // YYYY-MM-DD
}

export interface RotatorClient {
  youtube: any;
  oauth2Client: any;
  projectId: string;
}

const CONFIG_DIR = path.resolve("./config");
const PROJECTS_DIR = path.join(CONFIG_DIR, "projects");
const STATE_FILE = path.join(CONFIG_DIR, "project-rotation-state.json");

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/**
 * Returns current date in Pacific Time (America/Los_Angeles) as YYYY-MM-DD.
 */
export function getCurrentDatePT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Calculates remaining hours and minutes until midnight Pacific Time (Quota Reset).
 */
export function getTimeUntilResetPT(): { hours: number; minutes: number; formatted: string } {
  const now = new Date();
  const ptDateStr = getCurrentDatePT();
  const [year, month, day] = ptDateStr.split("-").map(Number);
  // Estimate UTC for midnight PT (08:00 UTC during PST, 07:00 UTC during PDT)
  const isDST = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  })
    .format(now)
    .includes("PDT");

  const resetHourUTC = isDST ? 7 : 8;
  const nextResetUTC = new Date(Date.UTC(year, month - 1, day + 1, resetHourUTC, 0, 0));
  const diffMs = Math.max(0, nextResetUTC.getTime() - now.getTime());

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    hours,
    minutes,
    formatted: `${hours}h ${minutes}m (approx 15:00 WIB)`,
  };
}

/**
 * Checks if a thrown error represents YouTube Data API quota exhaustion.
 */
export function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  const code = err.code || err.status;
  if (code === 403) {
    const msg = (err.message || "").toLowerCase();
    if (msg.includes("quotaexceeded") || msg.includes("exceeded your quota")) {
      return true;
    }
    if (Array.isArray(err.errors)) {
      return err.errors.some(
        (e: any) => e.reason === "quotaExceeded" || e.domain === "youtube.quota"
      );
    }
  }
  return false;
}

export class QuotaRotator {
  private projects: Map<string, ProjectConfig> = new Map();
  private state: RotationState = {
    activeProjectId: "default",
    exhaustedProjects: {},
    lastResetDatePT: getCurrentDatePT(),
  };

  constructor() {}

  /**
   * Initializes project pool and loads rotation state.
   */
  async init(): Promise<void> {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });

    // 1. Auto-bridge legacy credentials to 'default' project if present
    const legacyCreds = path.join(CONFIG_DIR, "youtube-credentials.json");
    const legacyToken = path.join(CONFIG_DIR, "youtube-token.json");
    const defaultProjDir = path.join(PROJECTS_DIR, "default");

    if (existsSync(legacyCreds) && !existsSync(defaultProjDir)) {
      await fs.mkdir(defaultProjDir, { recursive: true });
      await fs.copyFile(legacyCreds, path.join(defaultProjDir, "credentials.json"));
      if (existsSync(legacyToken)) {
        await fs.copyFile(legacyToken, path.join(defaultProjDir, "token.json"));
      }
    }

    // 2. Scan all project directories
    await this.scanProjects();

    // 3. Load or initialize rotation state
    await this.loadState();

    // 4. Check if daily midnight PT reset has occurred
    this.checkAndApplyDailyReset();
  }

  /**
   * Scans config/projects directory for available projects.
   */
  private async scanProjects(): Promise<void> {
    this.projects.clear();
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projId = entry.name;
        const dirPath = path.join(PROJECTS_DIR, projId);
        const credsPath = path.join(dirPath, "credentials.json");
        const tokenPath = path.join(dirPath, "token.json");

        const hasCreds = existsSync(credsPath);
        const hasToken = existsSync(tokenPath);

        this.projects.set(projId, {
          id: projId,
          name: projId.toUpperCase(),
          dirPath,
          credentialsPath: credsPath,
          tokenPath,
          isConfigured: hasCreds && hasToken,
        });
      }
    }
  }

  /**
   * Loads state from project-rotation-state.json.
   */
  private async loadState(): Promise<void> {
    if (existsSync(STATE_FILE)) {
      try {
        const raw = await fs.readFile(STATE_FILE, "utf-8");
        this.state = JSON.parse(raw);
      } catch {
        // Fallback to default state
      }
    }

    // Validate active project exists, otherwise set to first available
    const configured = this.getConfiguredProjects();
    if (configured.length > 0 && !this.projects.has(this.state.activeProjectId)) {
      this.state.activeProjectId = configured[0].id;
    }
  }

  /**
   * Saves current rotation state to disk.
   */
  private async saveState(): Promise<void> {
    await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  /**
   * Checks if Pacific Time date has rolled over and clears exhausted list.
   */
  private checkAndApplyDailyReset(): void {
    const todayPT = getCurrentDatePT();
    if (this.state.lastResetDatePT !== todayPT) {
      console.log(`\n🔄 New Pacific Time Day detected (${todayPT}).`);
      console.log("   Resetting all exhausted project quotas to FRESH status!");
      this.state.exhaustedProjects = {};
      this.state.lastResetDatePT = todayPT;
      this.saveState().catch(() => {});
    }
  }

  /**
   * Returns all projects that have both credentials.json and token.json.
   */
  getConfiguredProjects(): ProjectConfig[] {
    return Array.from(this.projects.values()).filter((p) => p.isConfigured);
  }

  /**
   * Returns list of configured projects that are NOT exhausted today.
   */
  getAvailableProjects(): ProjectConfig[] {
    this.checkAndApplyDailyReset();
    return this.getConfiguredProjects().filter((p) => !this.state.exhaustedProjects[p.id]);
  }

  /**
   * Builds authenticated OAuth2 and YouTube client for a given project.
   */
  async buildClientForProject(projectId: string): Promise<RotatorClient> {
    const proj = this.projects.get(projectId);
    if (!proj || !proj.isConfigured) {
      throw new Error(`Project '${projectId}' is not configured (missing credentials or token).`);
    }

    const credsRaw = JSON.parse(await fs.readFile(proj.credentialsPath, "utf-8"));
    const creds = credsRaw.installed || credsRaw.web;
    if (!creds || !creds.client_id || !creds.client_secret) {
      throw new Error(`Invalid credentials format in ${proj.credentialsPath}`);
    }

    const hasSpecificCallback = creds.redirect_uris?.some((u: string) => u.includes("3000/oauth2callback"));
    const redirectUri = hasSpecificCallback
      ? "http://localhost:3000/oauth2callback"
      : (creds.redirect_uris?.[0] || "http://localhost:3000");

    const oauth2Client = new google.auth.OAuth2(
      creds.client_id,
      creds.client_secret,
      redirectUri
    );

    const tokenRaw = JSON.parse(await fs.readFile(proj.tokenPath, "utf-8"));
    oauth2Client.setCredentials(tokenRaw);

    // Save refreshed token automatically
    oauth2Client.on("tokens", async (newTokens: any) => {
      const merged = { ...tokenRaw, ...newTokens };
      try {
        await fs.writeFile(proj.tokenPath, JSON.stringify(merged, null, 2));
      } catch {
        // Ignore write failure in read-only environment
      }
    });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    return {
      youtube,
      oauth2Client,
      projectId,
    };
  }

  /**
   * Returns the currently active project client, automatically rotating if current is exhausted.
   */
  async getActiveClient(): Promise<RotatorClient> {
    this.checkAndApplyDailyReset();
    const available = this.getAvailableProjects();

    if (available.length === 0) {
      const resetTime = getTimeUntilResetPT();
      throw new Error(
        `🚨 ALL Google Cloud Projects in the rotation pool have EXHAUSTED their 10,000 unit daily quota!\n` +
        `   Pool size: ${this.getConfiguredProjects().length} projects.\n` +
        `   Next daily quota reset in: ${resetTime.formatted}.\n` +
        `   💡 Tip: Add another project via 'npm run project:add' for an additional +10,000 units/day.`
      );
    }

    // If current active is still available, use it
    if (!this.state.exhaustedProjects[this.state.activeProjectId]) {
      return this.buildClientForProject(this.state.activeProjectId);
    }

    // Otherwise select the first available project
    const nextProj = available[0];
    console.log(`\n🔄 Switching active project to: \x1b[32m${nextProj.name}\x1b[0m`);
    this.state.activeProjectId = nextProj.id;
    await this.saveState();

    return this.buildClientForProject(nextProj.id);
  }

  /**
   * Marks a project as exhausted and immediately switches to the next available project.
   */
  async markProjectExhausted(projectId: string): Promise<RotatorClient> {
    console.warn(`\n⚠️  [QUOTA EXHAUSTED] Project '${projectId.toUpperCase()}' hit daily limit (10,000 units)!`);
    this.state.exhaustedProjects[projectId] = new Date().toISOString();

    const available = this.getAvailableProjects();
    if (available.length === 0) {
      await this.saveState();
      const resetTime = getTimeUntilResetPT();
      throw new Error(
        `🚨 All configured Google Cloud Projects (${this.getConfiguredProjects().length}) are now exhausted for today.\n` +
        `   Daily reset countdown: ${resetTime.formatted}.\n` +
        `   💡 Tip: Add another project via 'npm run project:add' to continue uploading immediately.`
      );
    }

    const nextProj = available[0];
    this.state.activeProjectId = nextProj.id;
    await this.saveState();

    console.log(`🔀 [AUTO-FAILOVER] Seamlessly rotated to: \x1b[32m${nextProj.name}\x1b[0m (+10,000 fresh units)!\n`);
    return this.buildClientForProject(nextProj.id);
  }

  /**
   * Transparently executes an asynchronous operation with automatic project rotation on quota exhaustion.
   */
  async executeWithAutoRotation<T>(
    operationName: string,
    operation: (client: RotatorClient) => Promise<T>
  ): Promise<T> {
    let client = await this.getActiveClient();
    const maxRetries = Math.max(1, this.getConfiguredProjects().length);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation(client);
      } catch (err: any) {
        if (isQuotaExceededError(err)) {
          console.warn(`🛑 Quota exceeded during operation: "${operationName}" on project [${client.projectId}]`);
          client = await this.markProjectExhausted(client.projectId);
          console.log(`🔁 Retrying operation "${operationName}" using [${client.projectId}]...`);
        } else {
          // Re-throw non-quota errors immediately
          throw err;
        }
      }
    }

    throw new Error(`Failed to execute "${operationName}" after rotating through all available projects.`);
  }

  /**
   * Returns a status report of all projects.
   */
  getStatusReport(): {
    configuredCount: number;
    availableCount: number;
    activeProjectId: string;
    resetTime: string;
    projects: Array<{
      id: string;
      status: "ACTIVE" | "EXHAUSTED" | "UNCONFIGURED";
      exhaustedAt?: string;
    }>;
  } {
    this.checkAndApplyDailyReset();
    const resetTime = getTimeUntilResetPT();
    const configured = this.getConfiguredProjects();
    const available = this.getAvailableProjects();

    const list = Array.from(this.projects.values()).map((p) => {
      let status: "ACTIVE" | "EXHAUSTED" | "UNCONFIGURED" = "ACTIVE";
      if (!p.isConfigured) {
        status = "UNCONFIGURED";
      } else if (this.state.exhaustedProjects[p.id]) {
        status = "EXHAUSTED";
      }

      return {
        id: p.id,
        status,
        exhaustedAt: this.state.exhaustedProjects[p.id],
      };
    });

    return {
      configuredCount: configured.length,
      availableCount: available.length,
      activeProjectId: this.state.activeProjectId,
      resetTime: resetTime.formatted,
      projects: list,
    };
  }

  /**
   * Resets all quota states manually (useful for testing or after adding quota).
   */
  async resetAllQuotas(): Promise<void> {
    this.state.exhaustedProjects = {};
    await this.saveState();
    console.log("✔ All project quotas have been manually reset to FRESH status.");
  }
}
