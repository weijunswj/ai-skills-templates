'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../..');
const schemaPath = path.join(repositoryRoot, 'repo/contracts/github-program-receipt/broker-ipc-v1.schema.json');
const policyPath = path.join(repositoryRoot, 'repo/contracts/github-program-receipt/github-program-receipt-policy.json');
const fixturePath = path.join(repositoryRoot, 'repo/scripts/github-program-broker/tests/fixtures/source-slice-1-vectors.json');
const { canonicalSerialize, digestValue } = require(path.join(repositoryRoot, 'repo/scripts/toolkit-execution-loop.cjs'));

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const OPERATIONS = [
  'READBACK_INSPECTION',
  'ALLOCATE_RUN',
  'START_RUN',
  'APPEND_RECEIPT',
  'INTERRUPT_RUN',
  'MUTATION_ADMIT',
  'MUTATION_DISPATCH',
  'MUTATION_OUTCOME',
  'MUTATION_RECONCILE',
  'ORPHAN_RECOVERY',
  'MIGRATE_V2_TO_V3'
];

test('broker schema and policy expose the exact closed Lock-007 Slice 1 contract', () => {
  assert.equal(schema.$id, 'toolkit.github-program.broker-ipc.v1');
  assert.deepEqual(schema.$defs.operationKind.enum, OPERATIONS);
  assert.deepEqual(policy.native_broker_ipc.operations, OPERATIONS);
  assert.equal(policy.native_broker_ipc.request_id.raw_lexical_scan, false);
  assert.equal(policy.native_broker_ipc.request_id.later_failure_echo, true);
  assert.equal(policy.native_broker_ipc.result_digest.input, 'canonical JSON {operation,value}');
  assert.deepEqual(policy.native_broker_ipc.result_digest.excludes, ['request_id', 'request.operation']);
  assert.equal(policy.native_broker_ipc.scope.provider_mutation, false);
  assert.equal(policy.native_broker_ipc.scope.protected_store, false);
  assert.equal(policy.native_broker_ipc.scope.durable_replay, false);
  assert.equal(policy.native_broker_ipc.scope.migration_runtime, false);
  assert.equal(policy.native_broker_ipc.scope.binary_upload, false);
});

test('Node canonical JSON agrees with independent lone-surrogate vectors', () => {
  const expected = new Map([
    ['U+D800', ['225c756438303022', '8c0c59dd0d275aadcd462a5fe12eb352cbdfeaf961eae4f85a4660521df7d2f5']],
    ['U+DC00', ['225c756463303022', '353c7370beca95e64c258c908edac60c2ab30d355ca1b5b7fc31c5bce4a4c65a']]
  ]);
  for (const vector of fixture.canonical_surrogates) {
    const value = JSON.parse(vector.name === 'U+D800' ? '"\\ud800"' : '"\\udc00"');
    const bytes = Buffer.from(canonicalSerialize(value), 'utf8');
    assert.deepEqual([bytes.toString('hex'), digestValue(value)], expected.get(vector.name));
    assert.deepEqual([bytes.toString('hex'), digestValue(value)], [vector.canonical_json_hex, vector.sha256]);
  }
});

test('object ordering is UTF-16 code-unit lexicographic ordering', () => {
  const value = { '\uE000': 1, '\u{10000}': 2 };
  assert.equal(canonicalSerialize(value), '{"𐀀":2,"":1}');
});

test('result digest is exactly over operation and value and excludes request context', () => {
  assert.equal(digestValue(fixture.result_digest_input), fixture.result_digest);
  const withRequestContext = {
    ...fixture.result_digest_input,
    request_id: fixture.request_id,
    request: { kind: fixture.result_digest_input.operation }
  };
  assert.notEqual(digestValue(withRequestContext), fixture.result_digest);
});
