import path from "node:path";
import { defineConfig, normalizePath } from "vite";

export default defineConfig(() => ({
  server: {
    host: "127.0.0.1",
    fs: {
      // Git ignores do not protect HTTP requests. Keep runtime credentials,
      // cached employee content and rehearsal recordings outside Vite's file server.
      deny: [
        "**/.env",
        "**/.env.*",
        "**/*.{crt,pem,key,p12,log,sqlite,sqlite-shm,sqlite-wal}",
        "**/.git/**",
        "**/.codex/**",
        "**/.agents/**",
        "**/data/**",
        "**/verification/**",
        "**/output/**",
        ...[process.env.DATA_DIR, process.env.EMPLOYEE_DATA_DIR]
          .filter((value): value is string => !!value)
          .map((value) => normalizePath(path.resolve(value)) + "/**"),
        ...["", ".tmp"].map((suffix) =>
          normalizePath(
            path.resolve(
              (process.env.EMPLOYEE_AUTH_FILE ||
                "data/employee-auth/accounts.json") + suffix,
            ),
          ),
        ),
      ],
    },
  },
  build: { outDir: "dist" },
}));
