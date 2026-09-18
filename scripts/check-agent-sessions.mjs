/**
 * Exercise the built development host and a separately launched stdio adapter.
 * The SDK sanitizes the child environment, matching real agent-host startup.
 * Run through pnpm test:agent-integration after installing workspace packages.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const load = (path) => import(pathToFileURL(join(repo, path)).href);
const { createStandaloneServer } = await load('packages/nudge-ui/dist/hosts/static/index.js');
const { Client } = await load('packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js');
const { StdioClientTransport } = await load('packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js');
const root = await realpath(await mkdtemp(join(tmpdir(), 'nudge-full-smoke-')));
let server;
let client;
try {
  await mkdir(join(root, 'node_modules', '@nudge-ui'), { recursive: true });
  await symlink(join(repo, 'packages/mcp'), join(root, 'node_modules', '@nudge-ui', 'mcp'));
  await writeFile(join(root, 'package.json'), '{"name":"nudge-smoke","private":true}');
  await writeFile(join(root, 'index.html'), '<!doctype html><html><body><h1>Smoke fixture</h1></body></html>');
  client = new Client({ name: 'nudge-integration-smoke', version: '1.0.0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(repo, 'packages/mcp/dist/cli.mjs'), '--workspace-root', root],
    cwd: root,
    stderr: 'pipe',
  }));
  const initialSessions = await client.callTool({ name: 'nudge_list_sessions', arguments: {} });
  assert.ok(!initialSessions.isError, 'adapter starts before the development server');
  server = createStandaloneServer({ rootDirectory: root, port: 0 });
  const address = await server.start();
  address.url = new URL(address.url).origin;
  const manifest = await (await fetch(`${address.url}/__nudge_ui__/manifest`)).json();
  assert.ok(manifest.agentBridge?.baseUrl, 'dev host publishes its bridge endpoint');
  assert.equal(manifest.agentBridge.autoConnect, true);
  const bridge = manifest.agentBridge.baseUrl;
  const projectId = manifest.runtime.projectId;
  const pairingResponse = await fetch(`${bridge}/pair`, {
    method: 'POST', headers: { Origin: address.url, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, origin: address.url, pageUrl: `${address.url}/index.html` }),
  });
  assert.equal(pairingResponse.status, 200, await pairingResponse.clone().text());
  const pairing = await pairingResponse.json();
  const sessionsResult = await client.callTool({ name: 'nudge_list_sessions', arguments: {} });
  assert.ok(!sessionsResult.isError, JSON.stringify(sessionsResult));
  const sessionsPayload = JSON.parse(sessionsResult.content[0].text);
  const sessions = Array.isArray(sessionsPayload) ? sessionsPayload : sessionsPayload.sessions;
  const session = sessions.find((item) => item.appRoot === root);
  assert.ok(session?.matchesWorkspace, JSON.stringify(sessionsPayload));
  assert.ok(!JSON.stringify(sessionsPayload).includes('controlToken'));
  const listening = client.callTool({ name: 'nudge_listen', arguments: { sessionId: session.sessionId } });
  void listening.catch(() => undefined);
  const deadline = Date.now() + 5000;
  while (true) {
    const health = await (await fetch(`${bridge}/health?projectId=${encodeURIComponent(projectId)}`, { headers: { Origin: address.url } })).json();
    const status = health.status ?? health;
    if (status.listenerActive) break;
    if (Date.now() > deadline) throw new Error(`Listener unavailable: ${JSON.stringify(health)}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const sent = await fetch(`${bridge}/prompt`, {
    method: 'POST', headers: { Origin: address.url, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, sessionToken: pairing.sessionToken, prompt: 'Change the fixture heading spacing.' }),
  });
  assert.equal(sent.status, 202, await sent.clone().text());
  const received = await listening;
  assert.ok(!received.isError, JSON.stringify(received));
  const request = JSON.parse(received.content[0].text);
  assert.equal(request.prompt, 'Change the fixture heading spacing.');
  const complete = await client.callTool({ name: 'nudge_report_status', arguments: { requestId: request.requestId, status: 'completed', summary: 'Fixture verified' } });
  assert.ok(!complete.isError, JSON.stringify(complete));
  await client.close();
  client = undefined;
  await server.close();
  server = undefined;
  await assert.rejects(fetch(`${bridge}/health`), 'bridge shuts down with the project');
  console.log('PASS: built static host → private registry → stdio MCP discovery/listen → browser prompt → completion → bridge shutdown');
} finally {
  await client?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
