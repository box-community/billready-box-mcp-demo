import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";

test("Vite blocks private runtime files, including custom storage and raw imports", async () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "billready-private-"),
  );
  const relative = path.join("verification", path.basename(temporary));
  const marker = "synthetic-private-content";
  const previous = {
    DATA_DIR: process.env.DATA_DIR,
    EMPLOYEE_DATA_DIR: process.env.EMPLOYEE_DATA_DIR,
    EMPLOYEE_AUTH_FILE: process.env.EMPLOYEE_AUTH_FILE,
  };
  const files = [
    path.join(relative, "private.txt"),
    path.join(temporary, "state", "private.txt"),
    path.join(temporary, "employees", "private.txt"),
    path.join(temporary, "custom-accounts.json"),
    path.join(temporary, "custom-accounts.json.tmp"),
  ];
  process.env.DATA_DIR = path.join(temporary, "state");
  process.env.EMPLOYEE_DATA_DIR = path.join(temporary, "employees");
  process.env.EMPLOYEE_AUTH_FILE = files[3];
  for (const file of files) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, marker);
  }
  const server = await createServer({
    envFile: false,
    // This test checks file access, not dependency prebundling. Avoid background
    // optimizer work racing server shutdown on a fresh dependency installation.
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      fs: { allow: [process.cwd(), temporary] },
    },
  });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (const file of files) {
      const url = "/@fs/" + path.resolve(file);
      for (const suffix of ["", "?raw", "?import"]) {
        const response = await fetch(base + url + suffix);
        // Asset imports may return a URL-only module; that URL must still be denied.
        if (suffix !== "?import")
          assert.equal(response.status, 403, `${file}${suffix}`);
        assert.ok(!(await response.text()).includes(marker));
      }
    }
    const direct = await fetch(base + "/" + files[0]);
    assert.equal(direct.status, 403);
    const source = await fetch(base + "/src/main.tsx");
    assert.equal(
      source.status,
      200,
      "Application source remains available to Vite",
    );
  } finally {
    await server.close();
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(relative, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
