// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Rollup } from "vite";

function isDependencyBuildNoise(log: Rollup.RollupLog | string): boolean {
  const message = typeof log === "string" ? log : (log.message ?? "");
  const id = typeof log === "string" ? "" : (log.id ?? "");
  const source = `${id}\n${message}`;

  return (
    (source.includes("node_modules") &&
      (message.includes("Module level directives cause errors when bundled") ||
        message.includes("was ignored"))) ||
    message.includes('Generated an empty chunk: "_libs/') ||
    ((message.includes("is imported from external module") ||
      message.includes("are imported from external module")) &&
      message.includes("@tanstack/router-core") &&
      message.includes("never used"))
  );
}

const filterDependencyWarnings: NonNullable<Rollup.RollupOptions["onwarn"]> = (warning, warn) => {
  if (isDependencyBuildNoise(warning)) return;
  warn(warning);
};

const filterDependencyLogs: NonNullable<Rollup.RollupOptions["onLog"]> = (level, log, handler) => {
  if (level === "warn" && isDependencyBuildNoise(log)) return;
  handler(level, log);
};

type LovableConfigWithNitro = NonNullable<Parameters<typeof defineConfig>[0]> & {
  nitro?: {
    hooks?: {
      "rollup:before"?: (_nitro: unknown, rollupConfig: Record<string, unknown>) => void;
    };
  };
};

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  // Lovable's nitro type does not declare `hooks`, but Nitro accepts it at runtime.
  nitro: {
    hooks: {
      "rollup:before"(_nitro: unknown, rollupConfig: Record<string, unknown>) {
        delete rollupConfig.platform;
        rollupConfig.onwarn = filterDependencyWarnings;
        rollupConfig.onLog = filterDependencyLogs;
      },
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        onLog: filterDependencyLogs,
      },
    },
    server: {
      allowedHosts: true,
    },
  },
} as LovableConfigWithNitro);
