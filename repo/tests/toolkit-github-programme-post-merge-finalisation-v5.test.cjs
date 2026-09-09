'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const programme = require('../scripts/toolkit-github-program-state-v5.cjs');

const contractDir = path.join(__dirname, '..', 'contracts', 'github-program-reconciler');
const decisionSchema = JSON.parse(fs.readFileSync(path.join(contractDir, 'post-merge-finalisation-decision-v1.schema.json'), 'utf8'));
const evidenceSchema = JSON.parse(fs.readFileSync(path.join(contractDir, 'post-merge-finalisation-evidence-v1.schema.json'), 'utf8'));
const programmeStateSchema = JSON.parse(fs.readFileSync(path.join(contractDir, 'programme-state-v5.schema.json'), 'utf8'));
const decision = programme.createPostMergeEpochFinalisationDecision();
const sourceRendered = programme.renderProgrammeV5(programme.FINALISATION_SOURCE_STATE);
const stageARendered = programme.renderProgrammeV5(programme.FINALISATION_STAGE_A_TARGET_STATE);
const stageBRendered = programme.renderProgrammeV5(programme.FINALISATION_STAGE_B_TARGET_STATE);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (typeof left !== 'object') return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
}

const supportedKeywords = new Set([
  '$schema', '$id', '$ref', '$defs', 'title', 'type', 'const', 'enum', 'required',
  'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minimum',
  'minLength', 'maxLength', 'pattern',
]);
const allowedExternalSchema = 'repo/contracts/github-program-reconciler/programme-state-v5.schema.json';

function decodePointerToken(token) {
  if (/~(?![01])/.test(token)) throw new Error('MALFORMED_JSON_POINTER_TOKEN');
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveJsonPointer(root, ref, documents, stack = []) {
  if (typeof ref !== 'string' || ref.length === 0) throw new Error('MALFORMED_REF');
  const hash = ref.indexOf('#');
  if (hash < 0) throw new Error('PLAIN_NAME_REF_FORBIDDEN');
  const documentName = ref.slice(0, hash);
  let fragment;
  try { fragment = decodeURIComponent(ref.slice(hash + 1)); } catch (_error) { throw new Error('MALFORMED_REF_FRAGMENT'); }
  if (documentName && documentName !== allowedExternalSchema) throw new Error('UNSUPPORTED_EXTERNAL_REF');
  const document = documentName ? documents[documentName] : root;
  if (!document) throw new Error('UNRESOLVED_EXTERNAL_REF');
  if (fragment === '') return document;
  if (!fragment.startsWith('/')) throw new Error('MALFORMED_REF_FRAGMENT');
  let current = document;
  for (const rawToken of fragment.slice(1).split('/')) {
    const token = decodePointerToken(rawToken);
    if (Array.isArray(current) && token === '-') throw new Error('ARRAY_APPEND_POINTER_FORBIDDEN');
    if ((current === null || typeof current !== 'object') || !Object.prototype.hasOwnProperty.call(current, token)) {
      throw new Error('UNRESOLVED_JSON_POINTER');
    }
    current = current[token];
  }
  return current;
}

function assertSchemaSupported(schema, root = schema, documents = { [allowedExternalSchema]: programmeStateSchema }, stack = []) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('INVALID_SCHEMA_NODE');
  for (const keyword of Object.keys(schema)) {
    if (!supportedKeywords.has(keyword)) throw new Error('UNSUPPORTED_SCHEMA_KEYWORD:' + keyword);
  }
  if (Object.prototype.hasOwnProperty.call(schema, '$ref')) {
    if (Object.keys(schema).length !== 1) throw new Error('REF_SIBLINGS_FORBIDDEN');
    const ref = schema.$ref;
    const key = ref;
    if (stack.includes(key)) throw new Error('CYCLIC_REF');
    assertSchemaSupported(resolveJsonPointer(root, ref, documents), root, documents, [...stack, key]);
    return;
  }
  if (schema.properties) {
    for (const child of Object.values(schema.properties)) assertSchemaSupported(child, root, documents, stack);
  }
  if (schema.items) assertSchemaSupported(schema.items, root, documents, stack);
  if (schema.$defs) {
    for (const child of Object.values(schema.$defs)) assertSchemaSupported(child, root, documents, stack);
  }
}

function matchesType(value, type) {
  return type === 'null' ? value === null
    : type === 'boolean' ? typeof value === 'boolean'
      : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : type === 'array' ? Array.isArray(value)
          : type === 'integer' ? Number.isSafeInteger(value)
            : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
              : type === 'string' ? typeof value === 'string'
                : false;
}

function validateSchemaNode(value, schema, root = schema, documents = { [allowedExternalSchema]: programmeStateSchema }, stack = []) {
  if (schema.$ref) {
    if (Object.keys(schema).length !== 1) throw new Error('REF_SIBLINGS_FORBIDDEN');
    const key = schema.$ref;
    if (stack.includes(key)) throw new Error('CYCLIC_REF');
    return validateSchemaNode(value, resolveJsonPointer(root, key, documents), root, documents, [...stack, key]);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) return false;
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const') && !deepEqual(value, schema.const)) return false;
  if (schema.enum && !schema.enum.some((item) => deepEqual(value, item))) return false;
  if (schema.required && (value === null || typeof value !== 'object' || schema.required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)))) return false;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    if (schema.additionalProperties === false
      && Object.keys(value).some((key) => !schema.properties || !Object.prototype.hasOwnProperty.call(schema.properties, key))) return false;
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key) && !validateSchemaNode(value[key], childSchema, root, documents, stack)) return false;
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.items && value.some((item) => !validateSchemaNode(item, schema.items, root, documents, stack))) return false;
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) return false;
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) return false;
  }
  return true;
}

function validatePublishedSchema(value, schema) {
  assertSchemaSupported(schema);
  return validateSchemaNode(value, schema);
}

function makeEvidence(checkpoint, options = {}) {
  const bodies = {
    BEFORE_STAGE_A: { parent_body: sourceRendered.parent, child_body: sourceRendered.child },
    CHILD_STAGE_A_OBSERVED: { parent_body: sourceRendered.parent, child_body: stageARendered.child },
    PARENT_STAGE_A_OBSERVED: { parent_body: stageARendered.parent, child_body: stageARendered.child },
    PR379_CLOSED_STAGE_A: { parent_body: stageARendered.parent, child_body: stageARendered.child },
    CHILD_STAGE_B_OBSERVED: { parent_body: stageARendered.parent, child_body: stageBRendered.child },
    FINAL_TARGET_OBSERVED: { parent_body: stageBRendered.parent, child_body: stageBRendered.child },
  };
  assert.ok(bodies[checkpoint]);
  return programme.buildPostMergeEpochFinalisationEvidence({
    checkpoint,
    ...bodies[checkpoint],
    ...options,
  });
}

function markerPayload(body, kind) {
  const expression = kind === 'parent'
    ? /^<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-CANONICAL v5 ([A-Za-z0-9_-]+) -->$/m
    : /^<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PROJECTION v1 ([A-Za-z0-9_-]+) -->$/m;
  const match = body.match(expression);
  if (!match) throw new Error('MARKER_NOT_FOUND');
  return { expression, encoded: match[1], payload: JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) };
}

function replaceMarkerPayload(body, kind, transform) {
  const marker = markerPayload(body, kind);
  transform(marker.payload);
  const encoded = Buffer.from(JSON.stringify(marker.payload), 'utf8').toString('base64url');
  return body.replace(marker.expression, (whole) => whole.replace(marker.encoded, encoded));
}

function rebindObservation(evidence, parentBody, childBody) {
  const next = clone(evidence);
  const parentParsed = programme.parseParentV5Body(parentBody, { repository: programme.REPOSITORY, parent_issue: programme.PARENT_ISSUE });
  const childParsed = programme.parseChildV5Body(childBody, { repository: programme.REPOSITORY, parent_issue: programme.PARENT_ISSUE });
  if (parentParsed.ok) {
    next.parent = {
      ...next.parent,
      raw_body: parentBody,
      body_digest: parentParsed.body_digest,
      canonical_digest: parentParsed.envelope.canonical_digest,
      projection_digest: parentParsed.envelope.projection_digest,
      prefix_digest: parentParsed.prefix_digest,
      suffix_digest: parentParsed.suffix_digest,
    };
  } else {
    next.parent.raw_body = parentBody;
  }
  if (childParsed.ok) {
    next.child = {
      ...next.child,
      raw_body: childBody,
      body_digest: childParsed.body_digest,
      canonical_digest: childParsed.envelope.canonical_digest,
      projection_digest: childParsed.envelope.projection_digest,
      prefix_digest: childParsed.prefix_digest,
      suffix_digest: childParsed.suffix_digest,
      projection: childParsed.envelope,
    };
  } else {
    next.child.raw_body = childBody;
  }
  const binding = {
    parent_canonical_digest: next.parent.canonical_digest,
    child_canonical_digest: next.child.canonical_digest,
    parent_body_digest: next.parent.body_digest,
    child_body_digest: next.child.body_digest,
    parent_projection_digest: next.parent.projection_digest,
    child_projection_digest: next.child.projection_digest,
    parent_prefix_digest: next.parent.prefix_digest,
    parent_suffix_digest: next.parent.suffix_digest,
    child_prefix_digest: next.child.prefix_digest,
    child_suffix_digest: next.child.suffix_digest,
    pr_379_facts_digest: next.pr_379.facts_digest,
    pr_379_github_state: next.pr_379.github_state,
    pr_379_revision: next.pr_379.revision,
    pr_380_facts_digest: next.pr_380.facts_digest,
    canonical_main_digest: programme.digestValue(next.canonical_main),
    merge_ancestry_digest: programme.digestValue(next.merge_ancestry),
  };
  next.source_binding = { ...binding, snapshot_digest: programme.digestValue(binding) };
  delete next.evidence_digest;
  next.evidence_digest = programme.digestValue(next);
  return next;
}

test('fixed source, derived stages, digests, and immutable target table', () => {
  assert.equal(sourceRendered.ok, true);
  assert.equal(programme.FINALISATION_SOURCE_CANONICAL_DIGEST, '1d810f3d7df41012707672cd323c12ccfcff279c172165bbf732e1a49eae39aa');
  assert.equal(sourceRendered.canonical_digest, programme.FINALISATION_SOURCE_CANONICAL_DIGEST);
  assert.equal(programme.digestValue(programme.FINALISATION_STAGE_A_TARGET_STATE), programme.FINALISATION_STAGE_A_CANONICAL_DIGEST);
  assert.equal(programme.digestValue(programme.FINALISATION_STAGE_B_TARGET_STATE), programme.FINALISATION_STAGE_B_CANONICAL_DIGEST);
  assert.equal(programme.validateInterEpochStateV5(programme.FINALISATION_STAGE_A_TARGET_STATE).ok, true);
  assert.equal(programme.validateInterEpochStateV5(programme.FINALISATION_STAGE_B_TARGET_STATE).ok, true);
  const derived1 = programme.derivePostMergeEpochFinalisationTargets(decision);
  const derived2 = programme.derivePostMergeEpochFinalisationTargets(decision);
  assert.equal(derived1.ok, true);
  assert.deepEqual(derived1.targets, derived2.targets);
  assert.equal(Object.isFrozen(derived1.targets), true);
  assert.equal(Object.isFrozen(derived1.targets.source.children[1].pr_registry), true);
  assert.equal(Object.isFrozen(derived1.targets.rendered.stage_a.projections.child), true);
  assert.equal(Object.isFrozen(derived1.targets.checkpoints), true);
  assert.deepEqual(Object.keys(derived1.targets.checkpoints), programme.FINALISATION_CHECKPOINTS);
  assert.equal(programme.buildPostMergeEpochFinalisationStageATargetState({ attacker: true }), null);
  assert.equal(programme.buildPostMergeEpochFinalisationStageBTargetState({ attacker: true }), null);
  const diff = [];
  function walk(left, right, pointer = '') {
    if (programme.digestValue(left) === programme.digestValue(right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      left.forEach((item, index) => walk(item, right[index], pointer + '[' + index + ']'));
      return;
    }
    if (left && right && typeof left === 'object' && typeof right === 'object') {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) walk(left[key], right[key], pointer ? pointer + '.' + key : key);
      return;
    }
    diff.push(pointer);
  }
  walk(programme.FINALISATION_STAGE_A_TARGET_STATE, programme.FINALISATION_STAGE_B_TARGET_STATE);
  assert.deepEqual(diff, ['children[1].pr_registry[1].github_state']);
});

test('closed decision and observational evidence schemas reject state control', () => {
  assert.equal(programme.validatePostMergeEpochFinalisationDecision(decision).ok, true);
  assert.equal(validatePublishedSchema(decision, decisionSchema), true);
  assert.equal(Object.prototype.hasOwnProperty.call(evidenceSchema.properties, 'state'), false);
  const schemaText = JSON.stringify(evidenceSchema);
  assert.equal(schemaText.includes('programme-state-v5.schema.json'), false);
  const before = makeEvidence('BEFORE_STAGE_A');
  assert.equal(programme.validatePostMergeEpochFinalisationEvidence(before, decision).ok, true);
  assert.equal(validatePublishedSchema(before, evidenceSchema), true);
  const withState = { ...before, state: {} };
  assert.equal(programme.validatePostMergeEpochFinalisationEvidence(withState, decision).ok, false);
  const withTarget = { ...decision, target: {} };
  assert.equal(programme.validatePostMergeEpochFinalisationDecision(withTarget).ok, false);
  const sourceDrift = clone(decision);
  sourceDrift.source.canonical_digest = '0'.repeat(64);
  assert.equal(validatePublishedSchema(sourceDrift, decisionSchema), false);
  assert.equal(programme.validatePostMergeEpochFinalisationDecision(sourceDrift).ok, false);
});

test('all six checkpoints select exactly five operations and final zero delta', () => {
  const expected = [
    ['BEFORE_STAGE_A', 'CHILD_STAGE_A', 1],
    ['CHILD_STAGE_A_OBSERVED', 'PARENT_STAGE_A', 1],
    ['PARENT_STAGE_A_OBSERVED', 'PR379_CLOSE', 1],
    ['PR379_CLOSED_STAGE_A', 'CHILD_STAGE_B', 1],
    ['CHILD_STAGE_B_OBSERVED', 'PARENT_STAGE_B', 1],
    ['FINAL_TARGET_OBSERVED', null, 0],
  ];
  for (const [checkpoint, operation, count] of expected) {
    const evidence = makeEvidence(checkpoint);
    const valid = programme.validatePostMergeEpochFinalisationEvidence(evidence, decision);
    assert.equal(valid.ok, true, checkpoint + ':' + valid.code);
    const preview = programme.previewPostMergeEpochFinalisation({ decision, evidence });
    assert.equal(preview.ok, true, checkpoint + ':' + preview.code);
    assert.equal(preview.operation_count, count);
    assert.equal(preview.next_operation?.operation_id ?? null, operation);
    assert.equal(preview.provider_client_used, false);
    assert.equal(preview.provider_cas_claim, false);
    assert.equal(preview.programme_apply_performed, false);
    assert.equal(preview.e4_started, false);
  }
  assert.deepEqual(programme.FINALISATION_CHECKPOINTS, expected.map((item) => item[0]));
  assert.deepEqual(programme.FINALISATION_OPERATION_ORDER.map((item) => item.operation_id), [
    'CHILD_STAGE_A', 'PARENT_STAGE_A', 'PR379_CLOSE', 'CHILD_STAGE_B', 'PARENT_STAGE_B',
  ]);
});

test('acknowledgement loss rebinds to the same checkpoint without a blind repeat', () => {
  for (const checkpoint of programme.FINALISATION_CHECKPOINTS.slice(1)) {
    const evidence = makeEvidence(checkpoint, { acknowledgement: 'LOST' });
    const valid = programme.validatePostMergeEpochFinalisationEvidence(evidence, decision);
    assert.equal(valid.ok, true, checkpoint);
    const preview = programme.previewPostMergeEpochFinalisation({ decision, evidence });
    assert.equal(preview.ok, true);
    assert.equal(preview.checkpoint, checkpoint);
    assert.equal(preview.acknowledgement_loss_rebind, true);
  }
  assert.equal(programme.FINALISATION_CHECKPOINTS.length, 6);
  assert.equal(programme.FINALISATION_CHECKPOINTS.some((item) => item.includes('ACKNOWLEDGEMENT')), false);
  const invalidRebind = makeEvidence('CHILD_STAGE_A_OBSERVED', { acknowledgement: 'LOST' });
  invalidRebind.transaction.readback.fresh_complete_rebind = false;
  invalidRebind.evidence_digest = programme.digestValue(Object.fromEntries(Object.entries(invalidRebind).filter(([key]) => key !== 'evidence_digest')));
  assert.equal(programme.validatePostMergeEpochFinalisationEvidence(invalidRebind, decision).ok, false);
});

test('provider facts are observational and #380 is immutable', () => {
  const before = makeEvidence('BEFORE_STAGE_A');
  const moved380 = clone(before);
  moved380.pr_380.merge_commit = '0'.repeat(40);
  moved380.pr_380.facts.merge_commit = '0'.repeat(40);
  moved380.pr_380.facts_digest = programme.digestValue(moved380.pr_380.facts);
  moved380.source_binding.pr_380_facts_digest = moved380.pr_380.facts_digest;
  moved380.source_binding.snapshot_digest = programme.digestValue(Object.fromEntries(Object.entries(moved380.source_binding).filter(([key]) => key !== 'snapshot_digest')));
  moved380.evidence_digest = programme.digestValue(Object.fromEntries(Object.entries(moved380).filter(([key]) => key !== 'evidence_digest')));
  assert.equal(programme.validatePostMergeEpochFinalisationEvidence(moved380, decision).ok, false);
  const alteredTarget = clone(programme.FINALISATION_STAGE_A_TARGET_STATE);
  alteredTarget.children[1].pr_registry.find((entry) => entry.pr === 380).github_state = 'OPEN';
  assert.equal(programme.validateInterEpochStateV5(alteredTarget).ok, false);
  const stageA = programme.FINALISATION_STAGE_A_TARGET_STATE;
  const stageB = programme.FINALISATION_STAGE_B_TARGET_STATE;
  assert.equal(stageA.children[1].pr_registry.find((entry) => entry.pr === 379).github_state, 'OPEN');
  assert.equal(stageB.children[1].pr_registry.find((entry) => entry.pr === 379).github_state, 'CLOSED');
});

test('canonical-rebase attack matrix fails at every later checkpoint', () => {
  const later = ['PARENT_STAGE_A_OBSERVED', 'PR379_CLOSED_STAGE_A', 'CHILD_STAGE_B_OBSERVED', 'FINAL_TARGET_OBSERVED'];
  for (const checkpoint of later) {
    const validEvidence = makeEvidence(checkpoint);
    const parentRebased = replaceMarkerPayload(validEvidence.parent.raw_body, 'parent', (payload) => {
      payload.state.children[1].summary = 'caller-rebased-summary';
      payload.envelope.canonical_digest = programme.digestValue(payload.state);
      payload.envelope.projection_digest = programme.digestValue({ caller: 'rebased-parent-projection' });
    });
    const childRebased = replaceMarkerPayload(validEvidence.child.raw_body, 'child', (payload) => {
      payload.canonical_digest = programme.digestValue({ caller: 'rebased-child-state', checkpoint });
      payload.projection_digest = programme.digestValue({ caller: 'rebased-child-projection', checkpoint });
    });
    const attack = rebindObservation(validEvidence, parentRebased, childRebased);
    assert.equal(programme.validatePostMergeEpochFinalisationEvidence(attack, decision).ok, false, checkpoint);
    assert.equal(programme.previewPostMergeEpochFinalisation({ decision, evidence: attack }).ok, false, checkpoint);
  }
  const coherentAlternate = clone(programme.FINALISATION_STAGE_A_TARGET_STATE);
  coherentAlternate.children[1].summary = 'coherent caller-rebased summary';
  assert.equal(programme.validateInterEpochStateV5(coherentAlternate).code, 'V5_INTER_EPOCH_TARGET_NOT_EXACT');
  const coherentBase = makeEvidence('PARENT_STAGE_A_OBSERVED');
  const coherentParent = replaceMarkerPayload(coherentBase.parent.raw_body, 'parent', (payload) => {
    payload.state = coherentAlternate;
    payload.envelope.canonical_digest = programme.digestValue(coherentAlternate);
    payload.envelope.projection_digest = programme.digestValue({ coherent: true, canonical_digest: payload.envelope.canonical_digest });
  });
  const coherentChild = replaceMarkerPayload(coherentBase.child.raw_body, 'child', (payload) => {
    payload.canonical_digest = programme.digestValue(coherentAlternate);
    payload.projection_digest = programme.digestValue({ coherent: true, canonical_digest: payload.canonical_digest });
  });
  const coherentAttack = rebindObservation(coherentBase, coherentParent, coherentChild);
  assert.equal(programme.validatePostMergeEpochFinalisationEvidence(coherentAttack, decision).ok, false);
  const constructorAttempt = programme.buildPostMergeEpochFinalisationEvidence({
    checkpoint: 'PARENT_STAGE_A_OBSERVED',
    parent_body: sourceRendered.parent,
    child_body: sourceRendered.child,
  });
  assert.equal(programme.validatePostMergeEpochFinalisationEvidence(constructorAttempt, decision).ok, false);
});

test('unknown, mixed, and mutated final states fail closed', () => {
  const finalEvidence = makeEvidence('FINAL_TARGET_OBSERVED');
  const mixed = makeEvidence('CHILD_STAGE_B_OBSERVED');
  mixed.parent = clone(finalEvidence.parent);
  mixed.source_binding = clone(finalEvidence.source_binding);
  mixed.source_binding.parent_canonical_digest = mixed.parent.canonical_digest;
  mixed.source_binding.snapshot_digest = programme.digestValue(Object.fromEntries(Object.entries(mixed.source_binding).filter(([key]) => key !== 'snapshot_digest')));
  mixed.evidence_digest = programme.digestValue(Object.fromEntries(Object.entries(mixed).filter(([key]) => key !== 'evidence_digest')));
  assert.equal(programme.validatePostMergeEpochFinalisationEvidence(mixed, decision).ok, false);
  const mutatedFinal = clone(finalEvidence);
  mutatedFinal.pr_379.github_state = 'OPEN';
  mutatedFinal.pr_379.provider_state = 'OPEN';
  mutatedFinal.pr_379.facts.provider_state = 'OPEN';
  mutatedFinal.pr_379.facts.github_state = 'OPEN';
  mutatedFinal.pr_379.facts_digest = programme.digestValue(mutatedFinal.pr_379.facts);
  mutatedFinal.source_binding.pr_379_github_state = 'OPEN';
  mutatedFinal.source_binding.pr_379_facts_digest = mutatedFinal.pr_379.facts_digest;
  mutatedFinal.source_binding.snapshot_digest = programme.digestValue(Object.fromEntries(Object.entries(mutatedFinal.source_binding).filter(([key]) => key !== 'snapshot_digest')));
  mutatedFinal.evidence_digest = programme.digestValue(Object.fromEntries(Object.entries(mutatedFinal).filter(([key]) => key !== 'evidence_digest')));
  assert.equal(programme.validatePostMergeEpochFinalisationEvidence(mutatedFinal, decision).ok, false);
  assert.equal(programme.classifyPostMergeEpochFinalisationCheckpoint({
    parent_canonical_digest: '0'.repeat(64),
    child_canonical_digest: '1'.repeat(64),
    pr_379_github_state: 'CLOSED',
  }).ok, false);
  const prefixed = rebindObservation(finalEvidence, 'owner-prefix\n' + stageARendered.parent, '\nowner-suffix\n' + stageARendered.child);
  assert.equal(programme.validatePostMergeEpochFinalisationEvidence(prefixed, decision).ok, false);
});

test('recovery-held compatibility and clean inter-epoch narrowness remain separate', () => {
  const recoverySource = clone(programme.FINALISATION_SOURCE_STATE);
  assert.equal(programme.validateCanonicalStateV5(recoverySource).ok, true);
  assert.equal(programme.validateInterEpochStateV5(programme.FINALISATION_STAGE_A_TARGET_STATE).ok, true);
  const unknownZeroLane = clone(programme.FINALISATION_STAGE_A_TARGET_STATE);
  unknownZeroLane.design_lock = 'DL-UNKNOWN';
  assert.equal(programme.validateCanonicalStateV5(unknownZeroLane).ok, false);
  const noHold = clone(recoverySource);
  delete noHold.recovery;
  assert.equal(programme.validateCanonicalStateV5(noHold).ok, false);
  assert.equal(programme.FINALISATION_SOURCE_CANONICAL_DIGEST, programme.TARGET_CANONICAL_DIGEST);
});

test('RFC 6901 resolver preserves empty tokens and fails closed', () => {
  assert.deepEqual(resolveJsonPointer({ root: true }, '#', {}), { root: true });
  const pointerSchema = {
    properties: {
      source_binding: {
        properties: {
          pr_379: { properties: { facts: { const: 'ok' } } },
        },
      },
    },
  };
  assert.deepEqual(resolveJsonPointer(pointerSchema, '#/properties/source_binding/properties/pr_379/properties/facts', {}), { const: 'ok' });
  assert.throws(() => resolveJsonPointer(pointerSchema, '#/properties//source_binding/properties/pr_379/properties/facts', {}), /UNRESOLVED_JSON_POINTER/);
  const emptyTokenSchema = { properties: { '': { source_binding: { properties: { facts: { const: 'ok' } } } } } };
  assert.deepEqual(resolveJsonPointer(emptyTokenSchema, '#/properties//source_binding/properties/facts', {}), { const: 'ok' });
  assert.equal(resolveJsonPointer({ 'a/b': { '~key': true } }, '#/a~1b/~0key', {}), true);
  assert.equal(resolveJsonPointer({ 'percent%': true }, '#/percent%25', {}), true);
  assert.throws(() => resolveJsonPointer({}, '#/bad%2', {}), /MALFORMED_REF_FRAGMENT/);
  assert.throws(() => resolveJsonPointer({}, '#/a~2b', {}), /MALFORMED_JSON_POINTER_TOKEN/);
  assert.throws(() => resolveJsonPointer({}, '#/a~', {}), /MALFORMED_JSON_POINTER_TOKEN/);
  assert.throws(() => resolveJsonPointer({}, 'plain-name', {}), /PLAIN_NAME_REF_FORBIDDEN/);
  assert.throws(() => resolveJsonPointer({}, 'https://example.com/schema#', {}), /UNSUPPORTED_EXTERNAL_REF/);
  assert.throws(() => resolveJsonPointer([], '#/-', {}), /ARRAY_APPEND_POINTER_FORBIDDEN/);
  assert.throws(() => resolveJsonPointer({}, '#/missing', {}), /UNRESOLVED_JSON_POINTER/);
  assert.deepEqual(
    resolveJsonPointer({}, allowedExternalSchema + '#/properties/schema', { [allowedExternalSchema]: programmeStateSchema }),
    programmeStateSchema.properties.schema,
  );
  assert.equal(validatePublishedSchema('toolkit.github-program.state.v5', { $ref: allowedExternalSchema + '#/properties/schema' }), true);
  assert.throws(() => resolveJsonPointer({}, allowedExternalSchema + '#/properties/missing', { [allowedExternalSchema]: programmeStateSchema }), /UNRESOLVED_JSON_POINTER/);
  assert.throws(() => assertSchemaSupported({ $ref: '#/$defs/self', $defs: { self: { $ref: '#/$defs/self' } } }), /REF_SIBLINGS_FORBIDDEN/);
  assert.throws(() => assertSchemaSupported({ $defs: { self: { $ref: '#/$defs/self' } }, $ref: '#/$defs/self' }), /REF_SIBLINGS_FORBIDDEN/);
  assert.throws(() => assertSchemaSupported({ $defs: { self: { $ref: '#/$defs/self' } }, properties: { value: { $ref: '#/$defs/self' } } }), /CYCLIC_REF/);
});

test('published surface contract pins the narrow successor and no provider mutation', () => {
  const surface = JSON.parse(fs.readFileSync(path.join(contractDir, 'programme-surface-contract-v5.json'), 'utf8'));
  assert.equal(surface.design_lock, programme.FINALISATION_LOCK);
  assert.deepEqual(surface.canonical_state.zero_lane_classes, ['RECOVERY_HELD', 'CLEAN_INTER_EPOCH']);
  assert.equal(surface.post_merge_finalisation.root, programme.FINALISATION_ROOT);
  assert.deepEqual(surface.post_merge_finalisation.checkpoints, programme.FINALISATION_CHECKPOINTS);
  assert.deepEqual(surface.post_merge_finalisation.operations, programme.FINALISATION_OPERATION_ORDER.map((item) => item.operation_id));
  assert.equal(surface.post_merge_finalisation.provider_client, false);
  assert.equal(surface.post_merge_finalisation.provider_cas, false);
  assert.equal(surface.post_merge_finalisation.programme_apply, false);
  assert.equal(surface.post_merge_finalisation.e4_activation, false);
  assert.equal(surface.post_merge_finalisation.source_only_derivation.provider_evidence_is_observational_only, true);
  assert.equal(surface.post_merge_finalisation.targets.stage_a.pr_379_github_state, 'OPEN');
  assert.equal(surface.post_merge_finalisation.targets.stage_b.differs_from_stage_a_only, 'children[1].pr_registry[1].github_state');
  assert.equal(surface.post_merge_finalisation.operation_sequence.length, 5);
});
