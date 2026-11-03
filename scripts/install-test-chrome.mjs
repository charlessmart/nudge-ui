#!/usr/bin/env node
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';

const platform = `${process.platform}-${process.arch}`;
const platforms = { 'darwin-arm64': 'mac-arm64', 'darwin-x64': 'mac-x64', 'linux-arm64': 'linux-arm64', 'linux-x64': 'linux64' };
const target = platforms[platform];
if (!target) throw new Error(`Unsupported browser platform: ${platform}`);
const metadata = await fetch('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json');
if (!metadata.ok) throw new Error(`Chrome metadata request failed: ${metadata.status}`);
const stable = (await metadata.json()).channels.Stable;
const version = stable.version.split('.').map(Number);
const minimum = [156, 0, 8078, 73];
const comparison = version.reduce((result, part, i) => result || Math.sign(part - minimum[i]), 0);
if (comparison < 0) throw new Error(`Refusing unpatched Chrome ${stable.version}`);
const download = stable.downloads.chrome.find(item => item.platform === target);
if (!download || !download.url.startsWith('https://storage.googleapis.com/chrome-for-testing-public/')) throw new Error('Unexpected Chrome download source');
const cache = join(homedir(), '.cache/browser-security');
await mkdir(cache, { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'patched-chrome-'));
try {
  const response = await fetch(download.url);
  if (!response.ok) throw new Error(`Chrome download failed: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(join(work, 'chrome.zip')));
  execFileSync('unzip', ['-q', join(work, 'chrome.zip'), '-d', work]);
  const destination = join(cache, 'chrome');
  // Replace only this tool's disposable browser cache, never a browser profile.
  await rm(destination, { recursive: true, force: true });
  await rename(join(work, `chrome-${target}`), destination);
  const executable = process.platform === 'darwin'
    ? join(destination, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
    : join(destination, 'chrome');
  console.log(`Installed Chrome for Testing ${stable.version}: ${executable}`);
} finally {
  await rm(work, { recursive: true, force: true });
}
