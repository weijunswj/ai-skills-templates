'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const v4 = require('../scripts/toolkit-github-program-state-v4.cjs');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/github-program-reconciler/v4-to-v5.fixture.json'), 'utf8'));
const stateFixture = () => JSON.parse(JSON.stringify(fixture.source));

function scopeFixture(state) {
  const payload = {
    schema: v4.SCOPE_SCHEMA,
    repository: state.repository,
    parent_issue: state.parent.issue,
    children: state.children.slice().sort((a, b) => a.order - b.order).map((child) => child.issue),
    dependencies: Object.fromEntries(state.children.map((child) => [String(child.issue), child.dependencies])),
    associated_prs: state.prs.map((pr) => pr.number),
    api_version: fixture.trust.api_version,
    complete: true,
    pagination: { complete: true },
    revision: fixture.trust.scope_revision,
    source_digests: ['dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'],
    allowed_relationship_operations: [...v4.RELATIONSHIP_OPERATION_CLASSES],
    relationship_capability_provenance: {
      adapter_identity: 'github-programme-adapter-v1',
      authority_source: 'github-native-relationships',
      revision: fixture.trust.capability_revision,
      digest: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      api_version: fixture.trust.api_version,
    },
    version_resolver: {
      identity: fixture.trust.version_resolver,
      kind: 'json-pointer-agreement',
      agreement: 'all',
      sources: [{ path: 'package.json', pointer: '/version' }],
    },
  };
  return { ...payload, scope_digest: v4.digest(payload) };
}

function trustHarness(state) {
  const broker = v4.createProgrammeTrustBroker({
    inspect_scope() { return scopeFixture(state); },
    inspect_relationships(input) {
      return {
        schema: v4.RELATIONSHIP_INSPECTION_SCHEMA,
        repository: input.repository,
        parent_issue: input.parent_issue,
        children: input.children,
        dependencies: input.dependencies,
        api_version: input.api_version,
        scope_digest: input.scope_digest,
        allowed_relationship_operations: input.allowed_relationship_operations,
        relationship_capability_provenance: input.relationship_capability_provenance,
        relationship_capability_digest: input.relationship_capability_digest,
        complete: true,
      };
    },
    inspect_prs(input) {
      return {
        schema: v4.PR_INSPECTION_SCHEMA,
        repository: input.repository,
        scope_digest: input.scope_digest,
        resolver_identity: input.version_resolver.identity,
        complete: true,
        facts: state.prs.map((pr) => ({
          number: pr.number,
          parent_issue: state.parent.issue,
          child_issue: pr.child_issue,
          branch: state.candidate.branch,
          base_ref: state.candidate.base_ref,
          base_sha: state.candidate.base_sha,
          head: state.candidate.head,
          tree: state.candidate.tree,
          version: state.candidate.version,
          lifecycle: 'OPEN_DRAFT',
          version_source_digests: ['d'.repeat(64)],
        })),
      };
    },
  });
  return { broker, scope: broker.issueScope() };
}

test('v4 predecessor fixture remains valid and keeps candidate outside derived projection', () => {
  const state = stateFixture();
  const valid = v4.validateCanonicalStateV4(state);
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(v4.deriveProjectionV1(state).ok, true);
  assert.equal(Object.hasOwn(state.children[0], 'outcome'), false);
  assert.equal(Object.hasOwn(state.prs[0], 'role'), false);
});

test('v4 render and parse preserve owner bytes and canonical state', () => {
  const state = stateFixture();
  const rendered = v4.renderProgrammeV4(state);
  assert.equal(rendered.ok, true, JSON.stringify(rendered));
  const body = 'owner-before\n' + rendered.bodies.parent + '\nowner-after';
  const parsed = v4.parseProgrammeV4Body(body, {
    kind: 'parent',
    repository: state.repository,
    parent_issue: state.parent.issue,
    number: state.parent.issue,
  });
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.prefix, 'owner-before\n');
  assert.equal(parsed.suffix, '\nowner-after');
  assert.equal(v4.verifyRenderedProgrammeIntegrity(state, rendered).ok, true);
});

test('v4 trust broker issues scope and independently verifies PR and relationship facts', () => {
  const state = stateFixture();
  const harness = trustHarness(state);
  assert.equal(harness.scope.ok, true, JSON.stringify(harness.scope));
  const relationships = harness.broker.inspectRelationships(state, harness.scope.grant);
  const prs = harness.broker.inspectPrs(state, harness.scope.grant);
  assert.equal(relationships.ok, true, JSON.stringify(relationships));
  assert.equal(prs.ok, true, JSON.stringify(prs));
  assert.equal(v4.validatePrBindings(state, harness.scope.grant, prs.inspection).ok, true);
  assert.equal(v4.assertScopeEquality(state, harness.scope.grant).ok, true);
});

test('v4 trust broker rejects an unissued or tampered scope grant', () => {
  const state = stateFixture();
  const harness = trustHarness(state);
  const tampered = { ...harness.scope.grant, children: [366, 359] };
  assert.equal(v4.assertScopeEquality(state, tampered).ok, false);
  assert.equal(v4.assertScopeEquality(state, { ...harness.scope.grant }).ok, false);
});
