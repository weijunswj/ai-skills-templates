'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const facade = require('../scripts/toolkit-github-governance-review-reconciler.cjs');
const v4 = require('../scripts/toolkit-github-program-state-v4.cjs');
const v5 = require('../scripts/toolkit-github-program-state-v5.cjs');

const root = path.resolve(__dirname, '..');
const v5ContractPath = path.join(root, 'contracts/github-program-reconciler/programme-surface-contract-v5.json');
const predecessorPath = path.join(root, 'contracts/github-program-predecessor-coverage.json');

test('predecessor coverage retains v4 as migration input and exposes v5 through the shared facade', () => {
  const coverage = JSON.parse(fs.readFileSync(predecessorPath, 'utf8'));
  const contract = JSON.parse(fs.readFileSync(v5ContractPath, 'utf8'));
  assert.equal(v4.STATE_SCHEMA, 'toolkit.github-program.state.v4');
  assert.equal(v5.STATE_SCHEMA, 'toolkit.github-program.state.v5');
  assert.equal(facade.programmeV4, v4);
  assert.equal(facade.programmeV5, v5);
  assert.equal(typeof facade.buildPreviewV5, 'function');
  assert.equal(coverage.$schema, 'toolkit.github-program.predecessor-coverage.v1');
  assert.equal(coverage.repository, 'weijunswj/ai-agent-toolkit');
  assert.equal(coverage.programme_parent_issue, 240);
  assert.equal(Array.isArray(coverage.predecessors), true);
  assert.equal(contract.$schema, 'toolkit.github-program.surface.v5');
  assert.equal(contract.run_receipts.sole_durable_source, 'existing-github-program-receipt');
  assert.equal(contract.run_receipts.schema_path, 'repo/contracts/github-program-receipt/run-receipt-v1.schema.json');
  assert.equal(contract.run_receipts.historical_resolution.api, 'readReceiptById(receiptId)');
  assert.equal(contract.run_receipts.historical_resolution.run_locator_source, 'returned_durable_receipt.run_id');
  assert.equal(contract.run_receipts.historical_resolution.snapshot_locator_fallback, false);
});

test('forbidden historical duplicate runtime and receipt schema are not resurrected', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts/toolkit-github-program-reconciler.cjs')), false);
  assert.equal(fs.existsSync(path.join(root, 'contracts/github-program-reconciler/run-receipt-v1.schema.json')), false);
  const contractText = fs.readFileSync(v5ContractPath, 'utf8');
  assert.equal(contractText.includes('github-program-reconciler/run-receipt-v1.schema.json'), false);
  assert.equal(contractText.includes('github-program-receipt/run-receipt-v1.schema.json'), true);
});
