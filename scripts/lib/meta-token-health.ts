export const INSIGHTS_REQUIRED_SCOPES = [
  "instagram_manage_insights",
  "read_insights",
] as const;

export const REQUIRED_META_SCOPES = [
  "pages_show_list",
  "business_management",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  ...INSIGHTS_REQUIRED_SCOPES,
] as const;

export interface ScopeAuditResult {
  ok: boolean;
  insightsReady: boolean;
  grantedScopes: string[];
  missingScopes: string[];
  missingInsightsScopes: string[];
}

export interface MetaTokenHealthReport {
  tokenValid: boolean;
  tokenType?: string;
  expiresAt?: number;
  profileId?: string;
  scopeAudit: ScopeAuditResult;
  igInsightsOk: boolean;
  igInsightsError?: string;
  debugTokenError?: string;
}

/**
 * Identifies genuine OAuth / insights scope errors vs deleted-object errors (code 100 / subcode 33).
 */
export function isMetaInsightsPermissionError(error: any): boolean {
  if (!error) return false;
  const code = Number(error.code);
  const subcode = Number(error.error_subcode);
  if (code === 100 && subcode === 33) return false;
  return code === 10 || code === 200 || code === 190;
}

/**
 * Compares granted OAuth scopes from Graph API debug_token against required scopes.
 */
export function auditMetaScopes(grantedScopes: readonly string[]): ScopeAuditResult {
  const normalized = Array.from(new Set(grantedScopes.map((s) => s.trim()).filter(Boolean)));
  const grantedSet = new Set(normalized);
  const missingScopes = REQUIRED_META_SCOPES.filter((scope) => !grantedSet.has(scope));
  const missingInsightsScopes = INSIGHTS_REQUIRED_SCOPES.filter((scope) => !grantedSet.has(scope));
  return {
    ok: missingScopes.length === 0,
    insightsReady: missingInsightsScopes.length === 0,
    grantedScopes: normalized,
    missingScopes,
    missingInsightsScopes,
  };
}

/**
 * Generates step-by-step Meta OAuth re-authorization and token exchange instructions.
 */
export function buildMetaReauthInstructions(
  appId: string,
  missingScopes: readonly string[] = REQUIRED_META_SCOPES
): string[] {
  const safeAppId = (appId || "1099494459651856").trim();
  const explorerUrl = `https://developers.facebook.com/tools/explorer/?app_id=${encodeURIComponent(safeAppId)}&method=GET&path=me%2Faccounts&version=v21.0`;
  const scopesCsv = REQUIRED_META_SCOPES.join(",");

  return [
    `Missing Meta token scopes: ${missingScopes.join(", ") || "none"}`,
    `1. Open Graph API Explorer (as the Facebook Page Admin): ${explorerUrl}`,
    `2. Under "Permissions", add ALL required scopes: ${scopesCsv}`,
    `3. Click "Generate Access Token" -> approve ALL Pages & Instagram Business accounts -> copy User Token.`,
    `4. Mint a permanent Page Token & update config/meta-config.json:`,
    `   npx tsx scripts/refresh-meta-token.ts --user-token <USER_TOKEN> --secret <APP_SECRET>`,
    `5. Update GitHub Actions Secret PERSONAL_META_ACCESS_TOKEN with the new pageAccessToken.`,
  ];
}

/**
 * Inspects a Meta Page/User access token via debug_token and probes Instagram /insights.
 */
export async function inspectMetaTokenHealth(
  config: {
    appId?: string;
    facebookPageId: string;
    instagramUserId: string;
    pageAccessToken: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<MetaTokenHealthReport> {
  const token = config.pageAccessToken.trim();
  let tokenValid = false;
  let tokenType: string | undefined;
  let expiresAt: number | undefined;
  let profileId: string | undefined;
  let grantedScopes: string[] = [];
  let debugTokenError: string | undefined;

  try {
    const debugRes = await fetchImpl(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
    );
    const debugJson: any = await debugRes.json();
    if (debugJson?.error) {
      debugTokenError = `${debugJson.error.message || "debug_token error"} (code ${debugJson.error.code ?? "?"})`;
    } else if (debugJson?.data) {
      tokenValid = Boolean(debugJson.data.is_valid);
      tokenType = debugJson.data.type;
      expiresAt = typeof debugJson.data.expires_at === "number" ? debugJson.data.expires_at : undefined;
      profileId = debugJson.data.profile_id ? String(debugJson.data.profile_id) : undefined;
      grantedScopes = Array.isArray(debugJson.data.scopes) ? debugJson.data.scopes : [];
    }
  } catch (err: any) {
    debugTokenError = err?.message || "Failed to reach Graph debug_token";
  }

  let igInsightsOk = false;
  let igInsightsError: string | undefined;
  try {
    const insightsRes = await fetchImpl(
      `https://graph.facebook.com/v21.0/${config.instagramUserId}/insights?metric=reach&period=day&access_token=${encodeURIComponent(token)}`
    );
    const insightsJson: any = await insightsRes.json();
    if (insightsJson?.error) {
      igInsightsError = `${insightsJson.error.message || "Instagram insights failed"} (code ${insightsJson.error.code ?? "?"})`;
    } else {
      igInsightsOk = true;
    }
  } catch (err: any) {
    igInsightsError = err?.message || "Failed to reach Instagram /insights";
  }

  return {
    tokenValid,
    tokenType,
    expiresAt,
    profileId,
    scopeAudit: auditMetaScopes(grantedScopes),
    igInsightsOk,
    igInsightsError,
    debugTokenError,
  };
}
