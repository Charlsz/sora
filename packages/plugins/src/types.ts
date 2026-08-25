import type { Tool } from "@sora/tools";

export type PluginKind = "connector" | "computer" | "mcp";

export type PluginStatus = {
  id: string;
  name: string;
  description: string;
  kind: PluginKind;
  /** True when credentials exist (env or secrets). Never includes the secret. */
  configured: boolean;
  /** Short hint e.g. "from env" or masked key. */
  hint: string | null;
  /** Apps / capabilities this connector can link. */
  apps: string[];
  /** Privacy note shown in UI. */
  privacy: string;
};

export type ConnectResult = {
  ok: boolean;
  /** Browser URL for OAuth when the connector starts a link flow. */
  redirectUrl?: string;
  message: string;
  /** Opaque connection id for polling (Composio). */
  connectionId?: string;
};

export type PluginSecrets = {
  providers: Record<
    string,
    { apiKey?: string; baseUrl?: string; username?: string }
  >;
};

/**
 * Plugin SPI: builtins/ register tools; runner stays untouched.
 */
export interface SoraPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: PluginKind;
  readonly apps: string[];
  readonly privacy: string;

  status(secrets: PluginSecrets): PluginStatus;

  /** Tools contributed when the plugin is configured (may be empty). */
  tools(secrets: PluginSecrets): Tool[];

  /** Optional async discover (MCP). Called before tools() on reload. */
  refresh?(secrets: PluginSecrets): Promise<void>;

  /** Start linking an external account (OAuth / device flow). */
  connect?(
    app: string,
    secrets: PluginSecrets,
  ): Promise<ConnectResult>;
}
