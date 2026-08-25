export {
  createDefaultPluginRegistry,
  PluginRegistry,
} from "./registry.ts";
export { hasCredential, redactSecret, resolveApiKey } from "./security.ts";
export { githubPlugin } from "./builtins/github.ts";
export { composioPlugin } from "./builtins/composio.ts";
export { pipedreamPlugin } from "./builtins/pipedream.ts";
export { openapiPlugin } from "./builtins/openapi.ts";
export { botdirectoryPlugin } from "./builtins/botdirectory.ts";
export { mcpPlugin } from "./builtins/mcp.ts";
export {
  BOTDIRECTORY_CATEGORIES,
  BOTDIRECTORY_SITE,
  listBots,
  publishBot,
  signup,
  subscribeNewsletter,
  whoAmI,
  type BotdirectoryBot,
} from "./builtins/botdirectory-client.ts";
export {
  loadCatalog,
  mirrorFullFeed,
  searchLocal,
  syncCatalog,
} from "./builtins/botdirectory-cache.ts";
export type {
  ConnectResult,
  PluginKind,
  PluginSecrets,
  PluginStatus,
  SoraPlugin,
} from "./types.ts";
