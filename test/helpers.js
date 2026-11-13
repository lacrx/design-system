import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const cliPath = join(repoRoot, 'bin', 'cli.js');

export function makeProject(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'design-system-test-'));
  for (const [relPath, contents] of Object.entries(files)) {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2));
  }
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** Run the CLI in `cwd`, never throwing. Returns {status, stdout, stderr}. */
export function runCli(cwd, args) {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

export const PRIMITIVES = {
  color: {
    $type: 'color',
    blue: { 500: { $value: '#3366CC' }, 700: { $value: '#1A3D7C' } },
  },
  space: { $type: 'dimension', md: { $value: '16px' } },
};

export const SEMANTIC = {
  bg: { $type: 'color', primary: { $value: '{color.blue.500}' } },
  text: { $type: 'color', accent: { $value: '{color.blue.700}' } },
};
