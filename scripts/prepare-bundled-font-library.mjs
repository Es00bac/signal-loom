#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const sourceRoot = resolve(process.env.SLOOM_FONT_PACK_DIR || resolve(projectRoot, '..', 'fonts'));
const targetRoot = resolve(projectRoot, 'build', 'font-library');
const markerPath = join(targetRoot, '.source-inventory.sha256');
const requiredCopies = [
  'README.md',
  'DISTRIBUTION.md',
  'catalog/families.tsv',
  'inventory/README.md',
  'inventory/SHA256SUMS',
  'inventory/font-inventory.json',
  'collection',
];

async function fileBytes(path) {
  const value = await readFile(path);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function safeRelativePath(value) {
  const normalized = value.replace(/\\/g, '/');
  if (!normalized || isAbsolute(normalized) || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Font integrity manifest contains an unsafe path: ${value}`);
  }
  return normalized;
}

async function verifySourceCollection() {
  const inventoryPath = join(sourceRoot, 'inventory', 'font-inventory.json');
  const sumsPath = join(sourceRoot, 'inventory', 'SHA256SUMS');
  if (!(await exists(inventoryPath)) || !(await exists(sumsPath))) {
    throw new Error(`No audited Sloom font collection was found at ${sourceRoot}. Set SLOOM_FONT_PACK_DIR to the verified collection root.`);
  }
  const inventoryBytes = await fileBytes(inventoryPath);
  const sumsBytes = await fileBytes(sumsPath);
  const inventory = JSON.parse(new TextDecoder().decode(inventoryBytes));
  if (inventory.criticalErrorCount !== 0
    || inventory.catalogFamilyCount !== 116
    || inventory.faceCount !== 430
    || !Array.isArray(inventory.families)
    || inventory.families.length !== 116) {
    throw new Error('The Sloom font inventory does not match the approved 116-family/430-face zero-critical-error collection.');
  }
  const lines = new TextDecoder().decode(sumsBytes).trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/i.exec(line);
    if (!match) throw new Error(`Invalid font integrity line: ${line}`);
    const relativePath = safeRelativePath(match[2]);
    const actual = sha256(await fileBytes(join(sourceRoot, relativePath)));
    if (actual !== match[1].toLowerCase()) throw new Error(`Font integrity check failed for ${relativePath}.`);
  }
  return sha256(new Uint8Array([...inventoryBytes, ...sumsBytes]));
}

async function targetIsCurrent(signature) {
  try {
    const marker = (await readFile(markerPath, 'utf8')).trim();
    return marker === signature
      && await exists(join(targetRoot, 'inventory', 'font-inventory.json'))
      && await exists(join(targetRoot, 'collection', 'base'))
      && await exists(join(targetRoot, 'collection', 'optional-chinese'))
      && await exists(join(targetRoot, 'collection', 'optional-korean'));
  } catch {
    return false;
  }
}

async function main() {
  const signature = await verifySourceCollection();
  if (await targetIsCurrent(signature)) {
    process.stdout.write(`Bundled font library is current: ${targetRoot}\n`);
    return;
  }
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });
  for (const relativePath of requiredCopies) {
    await cp(join(sourceRoot, relativePath), join(targetRoot, relativePath), {
      recursive: true,
      force: true,
      preserveTimestamps: true,
    });
  }
  await writeFile(markerPath, `${signature}\n`, 'utf8');
  process.stdout.write(`Prepared 116 families / 430 faces at ${targetRoot}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
