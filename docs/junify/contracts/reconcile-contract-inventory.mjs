import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const contractDir = dirname(fileURLToPath(import.meta.url));
const inventoryPath = join(contractDir, 'contract-inventory.json');
const humanPath = join(contractDir, 'contract-inventory.md');
const runbookPath = join(contractDir, 'test-gates-runbook.md');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
let human = readFileSync(humanPath, 'utf8');
const runbook = readFileSync(runbookPath, 'utf8');

const allowedStatuses = new Set([
  'covered',
  'must-cover',
  'accepted-current-behavior',
  'red-known-risk',
  'not-testable-yet',
  'out-of-scope',
]);
const requiredFields = [
  'id',
  'title',
  'source',
  'status',
  'recommended_layers',
  'entrypoints',
  'observable_effects',
  'expected_current_behavior',
  'risk_if_broken',
  'gate_id',
  'test_notes',
];
const arrayFields = [
  'source',
  'recommended_layers',
  'entrypoints',
  'observable_effects',
];
const generatedStart = '<!-- BEGIN GENERATED CONTRACT MATRIX -->';
const generatedEnd = '<!-- END GENERATED CONTRACT MATRIX -->';

const escapeCell = (value) => String(value).replace(/\|/g, '\\|');
const arrayCell = (values) =>
  values.length === 0 ? 'none' : values.map(escapeCell).join('; ');
const codeCell = (value) => `\`${escapeCell(value)}\``;
const renderContractRow = (contract) =>
  [
    codeCell(contract.id),
    escapeCell(contract.title),
    arrayCell(contract.source),
    codeCell(contract.status),
    arrayCell(contract.recommended_layers),
    arrayCell(contract.entrypoints),
    arrayCell(contract.observable_effects),
    escapeCell(contract.expected_current_behavior),
    codeCell(contract.gate_id),
    escapeCell(contract.risk_if_broken),
    escapeCell(contract.test_notes),
  ].join(' | ');
const renderGeneratedMatrix = (contracts) =>
  [
    generatedStart,
    '| ID | Title | Source | Status | Recommended layers | Entrypoints | Observable effects | Expected/current behavior | Exact gate | Risk if broken | Test notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...contracts.map((contract) => `| ${renderContractRow(contract)} |`),
    generatedEnd,
  ].join('\n');

const generatedMatrix = renderGeneratedMatrix(inventory.contracts);

if (process.argv.includes('--write')) {
  const sectionStart = human.indexOf('## Contract Matrix');
  const sectionEnd = human.indexOf('## Current Consumer Matrix');
  if (sectionStart < 0 || sectionEnd < 0 || sectionEnd <= sectionStart) {
    throw new Error('cannot locate Contract Matrix section');
  }
  const replacement = [
    '## Contract Matrix',
    '',
    'This matrix is generated from `contract-inventory.json`. Do not edit its',
    'rows by hand; update JSON and run',
    '`node docs/junify/contracts/reconcile-contract-inventory.mjs --write`.',
    '',
    generatedMatrix,
    '',
    '',
  ].join('\n');
  human = human.slice(0, sectionStart) + replacement + human.slice(sectionEnd);
  writeFileSync(humanPath, human);
  console.log('updated generated Markdown contract matrix');
}

if (process.argv.includes('--simulate-gate-divergence')) {
  human = human.replace(
    '| `G-COMPAT-CANDIDATE` |',
    '| `G-WIRE-FORMAT` |',
  );
}

if (process.argv.includes('--simulate-description-divergence')) {
  human = human.replace(
    inventory.contracts[0].title,
    `${inventory.contracts[0].title} [simulated divergence]`,
  );
}

const gateHeadings = [...runbook.matchAll(/^### `(G-[A-Z0-9-]+)`$/gm)].map(
  (match) => match[1],
);
const errors = [];
const ids = inventory.contracts.map((contract) => contract.id);

if (new Set(ids).size !== ids.length) errors.push('duplicate JSON contract ID');
if (ids.join('\n') !== [...ids].sort().join('\n')) {
  errors.push('JSON contracts are not sorted by ID');
}

for (const contract of inventory.contracts) {
  for (const field of requiredFields) {
    if (!(field in contract)) errors.push(`${contract.id}: missing ${field}`);
  }
  for (const field of arrayFields) {
    if (!Array.isArray(contract[field])) {
      errors.push(`${contract.id}: ${field} must be an array`);
    }
  }
  if ('exact_gate' in contract) {
    errors.push(`${contract.id}: exact_gate duplicates the runbook; use gate_id`);
  }
  if (!allowedStatuses.has(contract.status)) {
    errors.push(`${contract.id}: invalid status ${contract.status}`);
  }
  const gateCount = gateHeadings.filter((gate) => gate === contract.gate_id).length;
  if (gateCount !== 1) {
    errors.push(`${contract.id}: runbook has ${gateCount} ${contract.gate_id} headings`);
  }
}

const actualStart = human.indexOf(generatedStart);
const actualEnd = human.indexOf(generatedEnd);
if (actualStart < 0 || actualEnd < 0 || actualEnd < actualStart) {
  errors.push('Markdown generated contract matrix is missing');
} else {
  const actualMatrix = human.slice(actualStart, actualEnd + generatedEnd.length);
  if (actualMatrix !== generatedMatrix) {
    errors.push(
      'generated Markdown contract matrix differs from required JSON fields',
    );
  }
}

const statusCounts = Object.fromEntries(
  [...allowedStatuses].map((status) => [
    status,
    inventory.contracts.filter((contract) => contract.status === status).length,
  ]),
);
for (const [status, count] of Object.entries(statusCounts)) {
  const match = human.match(
    new RegExp('\\| `' + status + '` \\| (\\d+) \\|'),
  );
  if (!match || Number(match[1]) !== count) {
    errors.push(`${status}: Markdown/JSON count mismatch`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `contract inventory reconciliation passed: ${ids.length} contracts, ${requiredFields.length} fields, ${new Set(gateHeadings).size} gates`,
  );
}
