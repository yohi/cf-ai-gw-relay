import type { Hooks, ProviderHook } from "@opencode-ai/plugin";

export type ProviderModelsHook = NonNullable<ProviderHook["models"]>;
export type ChatHeadersHook = NonNullable<Hooks["chat.headers"]>;
