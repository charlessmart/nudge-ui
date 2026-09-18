/**
 * Exercise the built development host and a separately launched stdio adapter.
 * The SDK sanitizes the child environment, matching real agent-host startup.
 * Run through pnpm test:agent-integration after installing workspace packages.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const { createStandaloneServer } = await importBuiltModule('packages/nudge-ui/dist/hosts/static/index.js');
const { Client } = await importBuiltModule('packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js');
const { StdioClientTransport } = await importBuiltModule('packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js');

await verifyAgentSession();

async function verifyAgentSession() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'nudge-full-smoke-')));
  let server;
  const client = new Client({ name: 'nudge-integration-smoke', version: '1.0.0' });
  try {
    await prepareProject(root);
    await connectAdapter(client, root);
    // The adapter must start successfully before the project is running.
    await callTool(client, 'nudge_list_sessions');

    server = createStandaloneServer({ rootDirectory: root, port: 0 });
    const address = await server.start();
    const browser = await readBrowserConnection(new URL(address.url).origin);
    const pairing = await browserRequest(browser, '/pair', {
      body: { origin: browser.origin, pageUrl: `${browser.origin}/index.html` },
    });
    const session = await findProjectSession(client, root);
    await verifyPromptHandoff(client, browser, session.sessionId, pairing.sessionToken);

    await client.close();
    await server.close();
    server = undefined;
    await assert.rejects(fetch(`${browser.baseUrl}/health`), 'bridge shuts down with the project');
    console.log('PASS: built static host → private registry → stdio MCP discovery/listen → browser prompt → completion → bridge shutdown');
  } finally {
    // Attempt every cleanup even if one resource fails to close.
    const closed = await Promise.allSettled([client.close(), server?.close()]);
    await rm(root, { recursive: true, force: true });
    for (const result of closed) {
      if (result.status === 'rejected') throw result.reason;
    }
  }
}

async function prepareProject(root) {
  const scopeDirectory = join(root, 'node_modules', '@nudge-ui');
  await mkdir(scopeDirectory, { recursive: true });
  await symlink(join(repositoryRoot, 'packages/mcp'), join(scopeDirectory, 'mcp'));
  await writeFile(join(root, 'package.json'), '{"name":"nudge-smoke","private":true}');
  await writeFile(join(root, 'index.html'), '<!doctype html><html><body><h1>Smoke fixture</h1></body></html>');
}

async function connectAdapter(client, root) {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(repositoryRoot, 'packages/mcp/dist/cli.mjs'), '--workspace-root', root],
    cwd: root,
    stderr: 'pipe',
  }));
}

async function readBrowserConnection(origin) {
  const response = await fetch(`${origin}/__nudge_ui__/manifest`);
  assert.equal(response.status, 200, 'dev host serves its manifest');
  const manifest = await response.json();
  assert.ok(manifest.agentBridge?.baseUrl, 'dev host publishes its bridge endpoint');
  assert.equal(manifest.agentBridge.autoConnect, true);
  return { origin, baseUrl: manifest.agentBridge.baseUrl, projectId: manifest.runtime.projectId };
}

async function findProjectSession(client, root) {
  const payload = await callTool(client, 'nudge_list_sessions');
  const sessions = Array.isArray(payload) ? payload : payload.sessions;
  const session = sessions.find((item) => item.appRoot === root);
  assert.ok(session?.matchesWorkspace, JSON.stringify(payload));
  assert.ok(!JSON.stringify(payload).includes('controlToken'), 'discovery does not expose control credentials');
  return session;
}

async function verifyPromptHandoff(client, browser, sessionId, sessionToken) {
  const listening = callTool(client, 'nudge_listen', { sessionId });
  // Observe rejection immediately while waiting for the listener's health signal.
  void listening.catch(() => undefined);
  await waitForListener(browser);
  await browserRequest(browser, '/prompt', {
    body: { sessionToken, prompt: 'Change the fixture heading spacing.' },
    expectedStatus: 202,
  });
  const request = await listening;
  assert.equal(request.prompt, 'Change the fixture heading spacing.');
  await callTool(client, 'nudge_report_status', {
    requestId: request.requestId,
    status: 'completed',
    summary: 'Fixture verified',
  });
}

async function waitForListener(browser) {
  const deadline = Date.now() + 5_000;
  let health;
  do {
    health = await browserRequest(browser, '/health');
    const status = health.status ?? health;
    if (status.listenerActive) return;
    await delay(20);
  } while (Date.now() < deadline);
  throw new Error(`Listener unavailable: ${JSON.stringify(health)}`);
}

async function browserRequest(browser, path, { body, expectedStatus = 200 } = {}) {
  const url = new URL(path, browser.baseUrl);
  url.searchParams.set('projectId', browser.projectId);
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: browser.origin, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify({ projectId: browser.projectId, ...body }),
  });
  assert.equal(response.status, expectedStatus, await response.clone().text());
  return await response.json();
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, `${name}: ${JSON.stringify(result)}`);
  assert.equal(result.content[0]?.type, 'text', `${name} returns a JSON text payload`);
  return JSON.parse(result.content[0].text);
}

async function importBuiltModule(path) {
  return await import(pathToFileURL(join(repositoryRoot, path)).href);
}
