import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const contractDir = dirname(fileURLToPath(import.meta.url));
const inventory = JSON.parse(
  readFileSync(join(contractDir, 'contract-inventory.json'), 'utf8'),
);
let human = readFileSync(join(contractDir, 'contract-inventory.md'), 'utf8');
const runbook = readFileSync(join(contractDir, 'test-gates-runbook.md'), 'utf8');

if (process.argv.includes('--simulate-gate-divergence')) {
  human = human.replace(
    '| `G-COMPAT-CANDIDATE` |',
    '| `G-WIRE-FORMAT` |',
  );
}

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

const unquote = (value) => value.replaceAll('`', '').trim();
const normalizeLayer = (value) =>
  value
    .toLowerCase()
    .replace('static analysis', 'static-analysis')
    .replace('e2e', 'e2e');
const normalizeLayers = (value) => {
  if (value === 'none') return [];
  return value.split(',').map((item) => normalizeLayer(item.trim())).sort();
};

const matrix = human
  .split('## Contract Matrix')[1]
  .split('## Current Consumer Matrix')[0]
  .split('\n')
  .filter((line) => line.startsWith('| `junify.'))
  .map((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    return {
      id: unquote(cells[0]),
      status: unquote(cells[3]),
      recommendedLayers: normalizeLayers(unquote(cells[4])),
      gateId: unquote(cells[5]),
      risk: cells[6],
    };
  });
const humanById = new Map(matrix.map((contract) => [contract.id, contract]));
const gateHeadings = [...runbook.matchAll(/^### `(G-[A-Z0-9-]+)`$/gm)].map(
  (match) => match[1],
);

const errors = [];
const ids = inventory.contracts.map((contract) => contract.id);
if (new Set(ids).size !== ids.length) errors.push('duplicate JSON contract ID');
if (ids.join('\n') !== [...ids].sort().join('\n')) {
  errors.push('JSON contracts are not sorted by ID');
}
if (humanById.size !== matrix.length) errors.push('duplicate Markdown contract ID');

for (const contract of inventory.contracts) {
  for (const field of requiredFields) {
    if (!(field in contract)) errors.push(`${contract.id}: missing ${field}`);
  }
  if ('exact_gate' in contract) {
    errors.push(`${contract.id}: exact_gate duplicates the runbook; use gate_id`);
  }
  if (!allowedStatuses.has(contract.status)) {
    errors.push(`${contract.id}: invalid status ${contract.status}`);
  }
  const row = humanById.get(contract.id);
  if (!row) {
    errors.push(`${contract.id}: missing Markdown row`);
    continue;
  }
  if (row.status !== contract.status) {
    errors.push(`${contract.id}: status mismatch (${row.status} != ${contract.status})`);
  }
  const jsonLayers = [...contract.recommended_layers].sort();
  if (row.recommendedLayers.join(',') !== jsonLayers.join(',')) {
    errors.push(
      `${contract.id}: layer mismatch (${row.recommendedLayers} != ${jsonLayers})`,
    );
  }
  if (row.gateId !== contract.gate_id) {
    errors.push(
      `${contract.id}: gate mismatch (${row.gateId} != ${contract.gate_id})`,
    );
  }
  if (!row.risk) errors.push(`${contract.id}: empty Markdown risk`);
  const gateCount = gateHeadings.filter((gate) => gate === contract.gate_id).length;
  if (gateCount !== 1) {
    errors.push(`${contract.id}: runbook has ${gateCount} ${contract.gate_id} headings`);
  }
}

for (const row of matrix) {
  if (!ids.includes(row.id)) errors.push(`${row.id}: Markdown-only contract`);
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
    `contract inventory reconciliation passed: ${ids.length} contracts, ${new Set(gateHeadings).size} gates`,
  );
}
