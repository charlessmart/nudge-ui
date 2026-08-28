import { resolve } from "node:path";
import { createStandaloneServer, type StandaloneServer } from "./server.ts";

/** Parsed arguments for `nudge-ui serve`. */
export interface ServeCommandOptions {
  readonly rootDirectory: string;
  readonly host: "127.0.0.1" | "::1" | "localhost";
  readonly port: number;
}

/** Parses the standalone CLI's intentionally small command surface. */
export function parseServeArguments(
  args: readonly string[],
  currentDirectory = process.cwd(),
): ServeCommandOptions {
  if (args[0] !== "serve") {
    throw new Error("Usage: nudge-ui serve [directory] [--port <port>] [--host <loopback>]");
  }

  let directory = ".";
  let host: ServeCommandOptions["host"] = "127.0.0.1";
  let port = 4173;
  let directoryProvided = false;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--port") {
      port = parsePort(args[++index]);
    } else if (argument.startsWith("--port=")) {
      port = parsePort(argument.slice("--port=".length));
    } else if (argument === "--host") {
      host = parseHost(args[++index]);
    } else if (argument.startsWith("--host=")) {
      host = parseHost(argument.slice("--host=".length));
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (!directoryProvided) {
      directory = argument;
      directoryProvided = true;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }

  return { rootDirectory: resolve(currentDirectory, directory), host, port };
}

/** Starts the CLI server and waits until the process receives a termination signal. */
export async function runServeCommand(options: ServeCommandOptions): Promise<void> {
  const server = createStandaloneServer(options);
  const address = await server.start();
  console.log(`Nudge UI serving ${server.rootDirectory} at ${address.url}`);
  await waitForTermination(server);
}

/** Runs the command when the bundled CLI is invoked by Node. */
export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseServeArguments(args);
  await runServeCommand(options);
}

async function waitForTermination(server: StandaloneServer): Promise<void> {
  await new Promise<void>((resolveWait) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      void server.close().finally(resolveWait);
    };
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
  });
}

function parsePort(value: string | undefined): number {
  if (!value) throw new Error("--port requires a value.");
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Port must be an integer from 0 to 65535; received ${value}.`);
  }
  return port;
}

function parseHost(value: string | undefined): ServeCommandOptions["host"] {
  if (value === "127.0.0.1" || value === "::1" || value === "localhost") return value;
  throw new Error(`Host must be loopback (127.0.0.1, ::1, or localhost); received ${value ?? ""}.`);
}

if (process.argv[1]?.endsWith("nudge-ui.mjs")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
