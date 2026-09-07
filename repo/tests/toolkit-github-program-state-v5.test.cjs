'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const v5 = require('../scripts/toolkit-github-program-state-v5.cjs');

const fixturePath = path.join(__dirname, 'fixtures/github-program-reconciler/v4-to-v5.fixture.json');
const contractPath = path.join(__dirname, '../contracts/github-program-reconciler/programme-surface-contract-v5.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

test('v5 state module migrates, validates, projects, and renders canonical state', () => {
  const migrated = v5.migrateV4ToV5(fixture.source, { authority_ref: 'github:issue:359:comment:5564753393' });
  assert.equal(migrated.ok, true, JSON.stringify(migrated));
  assert.equal(v5.validateCanonicalStateV5(migrated.state).ok, true);
  const firstProjection = v5.deriveProjectionV5(migrated.state);
  const secondProjection = v5.deriveProjectionV5(JSON.parse(JSON.stringify(migrated.state)));
  assert.equal(firstProjection.ok, true, JSON.stringify(firstProjection));
  assert.deepEqual(firstProjection.projection, secondProjection.projection);
  const rendered = v5.renderProgrammeV5(migrated.state);
  assert.equal(rendered.ok, true, JSON.stringify(rendered));
  assert.equal(v5.parseProgrammeV5Body(rendered.bodies.parent, {
    kind: 'parent', repository: migrated.state.repository, parent_issue: migrated.state.parent.issue,
  }).ok, true);
});

test('v5 bootstrap pins the canonical contract by revision and canonical digest', () => {
  const contractBytes = fs.readFileSync(contractPath, 'utf8');
  const revision = 'f'.repeat(40);
  const bootstrap = v5.buildBootstrap({
    repository: fixture.source.repository,
    parent_issue: fixture.source.parent.issue,
    version: '2.11.0',
    revision,
  });
  assert.equal(bootstrap.toolkit_contract.sha256, v5.digest(JSON.parse(contractBytes)));
  const valid = v5.validateControllerBootstrap(bootstrap, {
    repository: fixture.source.repository,
    parent_issue: fixture.source.parent.issue,
    version: '2.11.0',
    revision,
    contract_bytes: contractBytes,
  });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(v5.resolvePinnedContract(bootstrap, { contract_bytes: contractBytes }).ok, true);
  assert.equal(v5.validateControllerBootstrap({
    ...bootstrap,
    toolkit_contract: { ...bootstrap.toolkit_contract, repository: 'other-owner/other-repo' },
  }).reason, 'bootstrap-invalid');
  assert.equal(v5.validateControllerBootstrap(bootstrap, {
    contract_bytes: Buffer.from([0x7b, 0xff, 0x7d]),
  }).reason, 'toolkit-contract-content-invalid');
});

test('v5 bootstrap discovery fails closed when a v5 repository has no bootstrap', () => {
  const result = v5.detectManagedRepository({
    repository: fixture.source.repository,
    parent_issue: fixture.source.parent.issue,
    state_schema: v5.STATE_SCHEMA,
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'DRIFTED_MANAGED');
  assert.equal(result.fail_closed, true);
  assert.equal(result.reason, 'v5-bootstrap-missing');
});
