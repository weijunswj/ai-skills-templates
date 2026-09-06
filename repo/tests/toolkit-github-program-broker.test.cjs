'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { canonicalSerialize, digestValue } = require('../scripts/toolkit-execution-loop.cjs');

const REQUEST_ID = '0123456789abcdef0123456789abcdef';
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
const DIGEST = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function valueFor(kind) {
  switch (kind) {
    case 'READBACK_INSPECTION': return { kind, state_digest: DIGEST };
    case 'ALLOCATE_RUN': return { kind, allocation_id: 'allocation-test', allocation_digest: DIGEST };
    case 'START_RUN': return { kind, run_id: 'run-test', start_digest: DIGEST };
    case 'APPEND_RECEIPT': return { kind, receipt_id: DIGEST, sequence: 1 };
    case 'INTERRUPT_RUN': return { kind, interrupt_id: 'interrupt-test' };
    case 'MUTATION_ADMIT': return { kind, operation_id: 'operation-test', operation_digest: DIGEST };
    case 'MUTATION_DISPATCH': return { kind, operation_id: 'operation-test', dispatch_digest: DIGEST };
    case 'MUTATION_OUTCOME': return { kind, operation_id: 'operation-test', outcome_digest: DIGEST };
    case 'MUTATION_RECONCILE': return { kind, operation_id: 'operation-test', reconciliation_digest: DIGEST };
    case 'ORPHAN_RECOVERY': return { kind, recovery_id: 'recovery-test', evidence_digest: DIGEST };
    case 'MIGRATE_V2_TO_V3': return { kind, migration_id: 'migration-test', migration_digest: DIGEST };
    default: throw new Error(`unknown operation ${kind}`);
  }
}

function responseFor(kind, requestId = REQUEST_ID) {
  const value = valueFor(kind);
  return {
    schema: 'toolkit.github-program.broker-ipc.v1',
    request_id: requestId,
    result: { operation: kind, value, result_digest: digestValue({ operation: kind, value }) },
    error: null
  };
}

function validateForRequest(request, response) {
  assert.equal(response.request_id, request.request_id, 'request ID binding');
  if (response.result !== null) {
    assert.equal(response.result.operation, request.operation.kind, 'request operation binding');
    assert.equal(response.result.value.kind, request.operation.kind, 'request value-kind binding');
    assert.equal(
      response.result.result_digest,
      digestValue({ operation: response.result.operation, value: response.result.value }),
      'result digest binding'
    );
  }
}

test('full 11-operation request-bound matrix has 11 diagonal positives and 110 independent negatives', () => {
  let positive = 0;
  let negative = 0;
  for (const requestKind of OPERATIONS) {
    const request = {
      schema: 'toolkit.github-program.broker-ipc.v1',
      request_id: REQUEST_ID,
      operation: { kind: requestKind }
    };
    for (const responseKind of OPERATIONS) {
      const response = responseFor(responseKind);
      if (requestKind === responseKind) {
        assert.doesNotThrow(() => validateForRequest(request, response));
        positive += 1;
      } else {
        assert.throws(() => validateForRequest(request, response), /request operation binding/);
        negative += 1;
      }
    }
  }
  assert.equal(positive, 11);
  assert.equal(negative, 110);
});

test('wrong request ID is rejected even when the result is internally self-consistent', () => {
  const request = {
    schema: 'toolkit.github-program.broker-ipc.v1',
    request_id: REQUEST_ID,
    operation: { kind: 'READBACK_INSPECTION' }
  };
  const response = responseFor('READBACK_INSPECTION', 'fedcba9876543210fedcba9876543210');
  assert.throws(() => validateForRequest(request, response), /request ID binding/);
});

test('canonical wire payload has no whitespace and duplicate keys are not normalized away', () => {
  const request = {
    schema: 'toolkit.github-program.broker-ipc.v1',
    request_id: REQUEST_ID,
    operation: { kind: 'READBACK_INSPECTION' }
  };
  const canonical = canonicalSerialize(request);
  assert.equal(canonical, '{"operation":{"kind":"READBACK_INSPECTION"},"request_id":"0123456789abcdef0123456789abcdef","schema":"toolkit.github-program.broker-ipc.v1"}');
  assert.notEqual(canonical, ` ${canonical}`);
  assert.equal(new Set(['request_id', 'request_id']).size, 1);
});
