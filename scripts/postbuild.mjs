// Marks the CLI as executable after tsc (npm bin links need it on POSIX).
import { chmodSync, existsSync } from "node:fs";

const cli = new URL("../dist/cli.js", import.meta.url);
if (existsSync(cli)) chmodSync(cli, 0o755);
