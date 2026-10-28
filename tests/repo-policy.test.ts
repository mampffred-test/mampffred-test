import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8').replace(/\r\n/g, '\n');
const dependabot = readFileSync('.github/dependabot.yml', 'utf8').replace(/\r\n/g, '\n');
const deployOnly = "github.event_name == 'push' && github.ref == 'refs/heads/main'";

// Text eines Blocks, der mit `header` beginnt und vor der nächsten Zeile mit gleicher oder kleinerer Einrückung endet.
function block(text: string, header: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line === header);
  assert.notEqual(start, -1, `Block fehlt: ${header.trim()}`);
  const indent = header.length - header.trimStart().length;
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() !== '' && line.length - line.trimStart().length <= indent,
  );
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

function step(job: string, name: string): string {
  return block(job, `      - name: ${name}`);
}

test('Workflow vergibt global keine Rechte und pro Job nur das Nötige', () => {
  assert.match(workflow, /^permissions: \{\}$/m);
  const build = block(workflow, '  build:');
  const deploy = block(workflow, '  deploy:');
  assert.match(build, /^ {4}permissions:\n {6}contents: read\n(?! {6})/m);
  assert.match(deploy, /^ {4}permissions:\n {6}pages: write\n {6}id-token: write\n(?! {6})/m);
});

test('Workflow begrenzt die Laufzeit jedes Jobs', () => {
  assert.match(block(workflow, '  build:'), /^ {4}timeout-minutes: 15$/m);
  assert.match(block(workflow, '  deploy:'), /^ {4}timeout-minutes: 10$/m);
});

test('Workflow prüft Paketsignaturen und hohe Lücken direkt nach der Installation', () => {
  const build = block(workflow, '  build:');
  const runs = [...build.matchAll(/^ {8}run: (.+)$/gm)].map((match) => match[1]);
  const install = runs.indexOf('npm ci --ignore-scripts');
  assert.notEqual(install, -1);
  assert.deepEqual(runs.slice(install, install + 4), [
    'npm ci --ignore-scripts',
    'npm audit signatures',
    'npm audit --audit-level=high',
    'npm run check && npm test',
  ]);
});

test('Workflow läuft wöchentlich, veröffentlicht aber nur bei Push auf main', () => {
  assert.match(block(workflow, 'on:'), /^ {2}schedule:\n {4}- cron: '41 6 \* \* 1'$/m);
  assert.match(block(workflow, '  deploy:'), new RegExp(`^ {4}if: ${deployOnly.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  const upload = step(block(workflow, '  build:'), 'GitHub-Pages-Artefakt hochladen');
  assert.ok(upload.includes(`        if: ${deployOnly}\n`), 'Upload nur bei Push auf main');
  assert.match(upload, /^ {10}path: dist\/client$/m);
  assert.match(upload, /^ {10}retention-days: 1$/m);
});

test('Workflow behält Checkout ohne Zugangsdaten und Abbruch nur bei Pull Requests', () => {
  assert.match(workflow, /^ {10}persist-credentials: false$/m);
  assert.match(workflow, /^ {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
});

test('Dependabot wartet 7 Tage und begrenzt offene Pull Requests', () => {
  for (const ecosystem of ['github-actions', 'npm']) {
    const entry = block(dependabot, `  - package-ecosystem: ${ecosystem}`);
    assert.match(entry, /^ {4}cooldown:\n {6}default-days: 7$/m, ecosystem);
    assert.match(entry, /^ {4}open-pull-requests-limit: 5$/m, ecosystem);
  }
});

test('Dependabot bündelt npm-Sicherheitsupdates und behält die @types/node-Regel', () => {
  const npm = block(dependabot, '  - package-ecosystem: npm');
  const security = block(npm, '      security:');
  assert.match(security, /^ {8}applies-to: security-updates$/m);
  assert.match(security, /^ {8}patterns:\n {10}- "\*"$/m);
  assert.match(npm, /^ {6}- dependency-name: "@types\/node"$/m);
});
