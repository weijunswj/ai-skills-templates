'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const v4 = require('../scripts/toolkit-github-program-state-v4.cjs');
const v5 = require('../scripts/toolkit-github-program-state-v5.cjs');
const receiptRuntime = require('../scripts/toolkit-github-program-receipt.cjs');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/github-program-reconciler/v4-to-v5.fixture.json'), 'utf8'));
const bootstrapFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/github-program-reconciler/e3-bootstrap-divergence-2026-09-07.fixture.json'), 'utf8'));
const ownerFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/github-program-reconciler/owner-byte-preservation.fixture.json'), 'utf8'));
const SHA = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const DIGEST = 'd'.repeat(64);
const repositoryRoot = path.resolve(__dirname, '../..');
const cleanupRoots = new Set();

function schemaRef(root, reference) {
  if (reference === '#') return root;
  return reference.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((value, part) => value?.[part], root);
}

function schemaValueEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateJsonSchema(value, schema, root, location = '$', errors = []) {
  if (!schema || typeof schema !== 'object') return errors;
  if (schema.$ref) return validateJsonSchema(value, schemaRef(root, schema.$ref), root, location, errors);
  if (schema.allOf) for (const branch of schema.allOf) validateJsonSchema(value, branch, root, location, errors);
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((branch) => validateJsonSchema(value, branch, root, location, []).length === 0);
    if (matches.length !== 1) errors.push(`${location}: oneOf matched ${matches.length} branches`);
    return errors;
  }
  if (schema.anyOf) {
    const matches = schema.anyOf.some((branch) => validateJsonSchema(value, branch, root, location, []).length === 0);
    if (!matches) errors.push(`${location}: anyOf matched no branches`);
    return errors;
  }
  if (schema.const !== undefined && !schemaValueEqual(value, schema.const)) errors.push(`${location}: const mismatch`);
  if (schema.enum && !schema.enum.some((entry) => schemaValueEqual(value, entry))) errors.push(`${location}: enum mismatch`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = types.some((type) => type === 'null' ? value === null
      : type === 'array' ? Array.isArray(value)
        : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
          : type === 'integer' ? Number.isInteger(value)
            : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
              : type === 'boolean' ? typeof value === 'boolean'
                : type === 'string' ? typeof value === 'string' : true);
    if (!matches) {
      errors.push(`${location}: type mismatch`);
      return errors;
    }
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${location}: shorter than minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${location}: longer than maxLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${location}: pattern mismatch`);
    if (schema.format === 'date-time' && !Number.isFinite(Date.parse(value))) errors.push(`${location}: date-time mismatch`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location}: fewer than minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${location}: more than maxItems`);
    if (schema.items) value.forEach((entry, index) => validateJsonSchema(entry, schema.items, root, `${location}[${index}]`, errors));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of schema.required || []) if (!Object.prototype.hasOwnProperty.call(value, required)) errors.push(`${location}: missing ${required}`);
    const properties = schema.properties || {};
    for (const [key, entry] of Object.entries(value)) {
      if (properties[key]) validateJsonSchema(entry, properties[key], root, `${location}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${location}: unexpected ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateJsonSchema(entry, schema.additionalProperties, root, `${location}.${key}`, errors);
      }
    }
  }
  return errors;
}

function schemaValidator(schema) {
  const validate = (value) => {
    validate.errors = validateJsonSchema(value, schema, schema);
    return validate.errors.length === 0;
  };
  validate.errors = [];
  return validate;
}

function secureWindowsDirectory(root) {
  if (process.platform !== 'win32') return;
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = [
    '$ErrorActionPreference="Stop"',
    '$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
    '$icacls=Join-Path $env:SystemRoot "System32\\icacls.exe"',
    '& $icacls $env:GPR_TEST_ROOT "/inheritance:r" "/grant:r" ("*${sid}:(OI)(CI)F") "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null',
    'if ($LASTEXITCODE -ne 0) { throw "icacls-failed" }',
  ].join(';');
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, GPR_TEST_ROOT: root },
  });
  if (result.status !== 0) throw new Error(`Unable to secure test state root: ${result.stderr}`);
}

function stateRoot() {
  const parent = path.join(os.homedir(), '.ai-agent-toolkit', 'user-state', 'github-program-receipt', 'tests');
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(parent, 0o700);
  const root = fs.mkdtempSync(path.join(parent, 'v5-recovery-'));
  if (process.platform !== 'win32') fs.chmodSync(root, 0o700);
  secureWindowsDirectory(root);
  cleanupRoots.add(root);
  return root;
}

test.afterEach(() => {
  for (const root of cleanupRoots) fs.rmSync(root, { recursive: true, force: true });
  cleanupRoots.clear();
});

function sourceState() {
  return JSON.parse(JSON.stringify(fixture.source));
}

function scopeFor(state) {
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
    source_digests: [DIGEST],
    allowed_relationship_operations: [...v4.RELATIONSHIP_OPERATION_CLASSES],
    relationship_capability_provenance: {
      adapter_identity: 'github-programme-adapter-v1',
      authority_source: 'github-native-relationships',
      revision: fixture.trust.capability_revision,
      digest: DIGEST,
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

function trustHarness(state, options = {}) {
  const broker = v4.createProgrammeTrustBroker({
    inspect_scope() { return scopeFor(state); },
    inspect_relationships(input) {
      const inspection = {
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
      return typeof options.relationship === 'function' ? options.relationship(inspection) : { ...inspection, ...(options.relationship || {}) };
    },
    inspect_prs(input) {
      const facts = state.prs.map((pr) => {
        const lane = state.active_lanes?.find((entry) => entry.candidate?.pr === pr.number);
        const candidate = lane?.candidate || {
          branch: 'retained/pr-' + pr.number,
          base_ref: 'main',
          base_sha: BASE,
          head: SHA,
          tree: TREE,
          version: '2.11.0',
        };
        const fact = {
          number: pr.number,
          parent_issue: state.parent.issue,
          child_issue: pr.child_issue,
          branch: candidate.branch,
          base_ref: candidate.base_ref,
          base_sha: candidate.base_sha,
          head: candidate.head,
          tree: candidate.tree,
          version: candidate.version,
          lifecycle: options.lifecycle || 'OPEN_DRAFT',
          version_source_digests: [DIGEST],
        };
        return typeof options.pr === 'function' ? options.pr(fact) : { ...fact, ...(options.pr || {}) };
      });
      return {
        schema: v4.PR_INSPECTION_SCHEMA,
        repository: input.repository,
        scope_digest: input.scope_digest,
        resolver_identity: input.version_resolver.identity,
        complete: true,
        facts,
      };
    },
  });
  return { broker, scope: broker.issueScope() };
}

function migrateState(options = {}) {
  const result = v5.migrateV4ToV5(sourceState(), {
    authority_ref: 'github:issue:359:comment:5564753393',
    ...options,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.state;
}

async function receiptContext(state, scope, overrides = {}) {
  const authority = {
    child_comment_id: 5564753393,
    parent_comment_id: 5564754827,
    node_id: 'MDU6SXNzdWVDb21tZW50OjU1NjQ3NTMzOTM',
    author_login: 'weijunswj',
    author_association: 'OWNER',
    body_digest: '1'.repeat(64),
    updated_at: '2026-09-07T00:00:00.000Z',
    update_identity_digest: '2'.repeat(64),
    scope_digest: scope.scope_digest,
  };
  const start = {
    base_sha: BASE,
    head_sha: SHA,
    tree_sha: TREE,
    status_digest: DIGEST,
    clean_worktree: true,
    ref: { detached: false, name: 'codex/e3-canonical-programme-bootstrap-recovery-g3' },
  };
  const root = stateRoot();
  const store = receiptRuntime.createProgrammeReceiptStore({
    repository: state.repository,
    parent_issue: state.parent.issue,
    child_issue: state.active_lanes[0]?.child_issue || state.children[0].issue,
    stateRoot: root,
    repositoryRoot,
  });
  const session = await store.startRun({
    lock: overrides.lock || 'g3-recovery-lock-001', authority, start, candidate: null, lease_ms: 60000,
  }, {
    readAuthority: async () => ({ authority: JSON.parse(JSON.stringify(authority)), later_controlling_comments: [] }),
    readStart: async () => JSON.parse(JSON.stringify(start)),
  });
  const startedChain = store.readReceiptChain(session.run_id);
  return {
    authority_ref: 'github:issue:359:comment:5564753393',
    authority,
    start,
    lease: startedChain[0].lease,
    run_id: session.run_id,
    allocation_id: session.allocation_id,
    child_issue: state.active_lanes[0]?.child_issue || state.children[0].issue,
    started_chain: startedChain,
    transition_created_at: new Date(Date.parse(startedChain.at(-1).created_at) + 1).toISOString(),
    ...overrides,
  };
}

function resolvedContract(revision) {
  return {
    repository: v5.TOOLKIT_CONTRACT_REPOSITORY,
    revision,
    path: v5.TOOLKIT_CONTRACT_PATH,
    bytes: JSON.stringify(v5.SURFACE_CONTRACT),
  };
}

function skipReceiptGuard(t, error) {
  if (error?.code === 'GPR_UNSAFE_STATE_ROOT') {
    t.skip(`canonical receipt durable-store guard: ${error.code} (${error.details?.reason || 'unknown'})`);
    return true;
  }
  return false;
}

function legacySnapshot(state) {
  const rendered = v4.renderProgrammeV4(state);
  assert.equal(rendered.ok, true, JSON.stringify(rendered));
  return {
    repository: state.repository,
    revision: fixture.snapshot.revision,
    complete: true,
    canonical_state: state,
    bodies: {
      parent: ownerFixture.parent_prefix + rendered.bodies.parent + ownerFixture.parent_suffix,
      children: {
        '359': ownerFixture.child_prefix + rendered.bodies.children['359'] + ownerFixture.child_suffix,
        '366': rendered.bodies.children['366'],
      },
      prs: {
        '376': ownerFixture.pr_prefix + rendered.bodies.prs['376'] + ownerFixture.pr_suffix,
      },
    },
    labels: { '359': ['current'], '366': ['queued'] },
    managed_events: [],
    native: {
      children: [359, 366],
      dependencies: { '359': [], '366': [359] },
      associated_prs: [376],
      pr_associations: { '376': { parent_issue: 240, child_issue: 359, kind: 'CROSS_REFERENCE' } },
      api_version: fixture.trust.api_version,
    },
  };
}

function bootstrap(revision = 'f'.repeat(40)) {
  return v5.buildBootstrap({
    repository: bootstrapFixture.repository,
    parent_issue: bootstrapFixture.parent_issue,
    version: bootstrapFixture.version,
    revision,
  });
}

function currentSnapshot(state, currentBootstrap = bootstrap()) {
  const rendered = v5.renderProgrammeV5(state);
  assert.equal(rendered.ok, true, JSON.stringify(rendered));
  const native = v5.expectedNativeRelationshipsV5(state, {
    children: state.children.map((child) => child.issue),
    dependencies: Object.fromEntries(state.children.map((child) => [String(child.issue), child.dependencies])),
    associated_prs: state.prs.map((pr) => pr.number),
    pr_associations: v5.derivePrAssociationsV5(state).associations,
    api_version: fixture.trust.api_version,
  });
  assert.equal(native.ok, true, JSON.stringify(native));
  return {
    repository: state.repository,
    revision: 'v5-revision-001',
    complete: true,
    canonical_state: JSON.parse(JSON.stringify(state)),
    bodies: rendered.bodies,
    labels: v5.expectedLabelsV5(state, {}),
    managed_events: [],
    native: native.native,
    bootstrap: currentBootstrap,
  };
}

test('v5 migrates v4 and recovers already-v5 state without changing identity', () => {
  const state = migrateState();
  const valid = v5.validateCanonicalStateV5(state);
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(state.repository, fixture.trust ? fixture.source.repository : 'weijunswj/ai-agent-toolkit');
  assert.equal(state.parent.issue, 240);
  assert.equal(state.children[0].summary.length > 0, true);
  assert.equal(state.children[0].deliverables.length > 0, true);
  const managed = v5.detectManagedRepository({ bootstrap: bootstrap(), canonical_state: state, repository: state.repository, parent_issue: state.parent.issue });
  assert.equal(managed.classification, 'CURRENT_MANAGED');
  assert.equal(v5.buildPreviewV5({ desired: state, snapshot: currentSnapshot(state) }).ok, false);
});

test('v5 keeps candidate and PR bindings exact and rejects independent trusted scope drift', () => {
  const state = migrateState();
  const good = trustHarness(state);
  assert.equal(good.scope.ok, true, JSON.stringify(good.scope));
  assert.equal(v5.inspectTrustBindingsV5(state, good.scope.grant, good.broker).ok, true);
  const badCandidate = trustHarness(state, { pr: (fact) => ({ ...fact, head: 'e'.repeat(40) }) });
  assert.equal(v5.inspectTrustBindingsV5(state, badCandidate.scope.grant, badCandidate.broker).reason, 'trusted-candidate-binding-mismatch');
  const badRelationship = trustHarness(state, { relationship: (inspection) => ({ ...inspection, children: [366, 359] }) });
  assert.equal(v5.inspectTrustBindingsV5(state, badRelationship.scope.grant, badRelationship.broker).ok, false);
  assert.equal(v5.inspectTrustBindingsV5(state, null, good.broker).reason, 'trusted-scope-grant-required');
});

test('v5 rejects lifecycle contradictions and active merged or ready states without finality authority', () => {
  const state = migrateState();
  state.children[0].finality = { state: 'MERGED', authority_ref: 'web-359' };
  assert.equal(v5.validateCanonicalStateV5(state).reason, 'lifecycle-contradiction');
  const draftState = migrateState();
  const draft = trustHarness(draftState, { lifecycle: 'MERGED' });
  assert.equal(v5.inspectTrustBindingsV5(draftState, draft.scope.grant, draft.broker).ok, false);
  const readyState = migrateState();
  readyState.children[0].epochs[0].terminal_disposition = 'ACCEPTED';
  readyState.children[0].epochs[0].evidence_ref = 'web-359';
  readyState.children[0].pr_registry[0].role = 'TERMINAL';
  readyState.children[0].pr_registry[0].completes_child = true;
  readyState.children[0].finality = { state: 'READY_AUTHORIZED', authority_ref: 'web-359' };
  const ready = trustHarness(readyState, { lifecycle: 'OPEN_READY' });
  assert.equal(v5.inspectTrustBindingsV5(readyState, ready.scope.grant, ready.broker).ok, true);
});

test('v5 does not project completion from an unresolved epoch or held finality', () => {
  const state = migrateState();
  state.children[0].lifecycle = 'COMPLETED';
  state.children[0].finality = { state: 'HELD', authority_ref: null };
  state.active_lanes = [];
  state.children[0].pr_registry[0].status = 'ACCEPTED';
  state.children[0].pr_registry[0].accepted_evidence_ref = 'web-359';
  const valid = v5.validateCanonicalStateV5(state);
  assert.equal(valid.ok, false, JSON.stringify(valid));
  assert.equal(valid.reason, 'completed-child-finality-incomplete');
  assert.notEqual(v5.deriveProjectionV5(state).ok, true);
});

test('v5 separates an intermediate OPEN_READY presentation from Programme Ready authority', () => {
  const state = migrateState();
  const intermediate = trustHarness(state, { lifecycle: 'OPEN_READY' });
  assert.equal(v5.inspectTrustBindingsV5(state, intermediate.scope.grant, intermediate.broker).ok, true);
  const falselyFinal = migrateState();
  falselyFinal.children[0].finality = { state: 'READY_AUTHORIZED', authority_ref: 'web-359' };
  const falseHarness = trustHarness(falselyFinal, { lifecycle: 'OPEN_READY' });
  const rejected = v5.inspectTrustBindingsV5(falselyFinal, falseHarness.scope.grant, falseHarness.broker);
  assert.equal(rejected.ok, false, JSON.stringify(rejected));
  assert.equal(rejected.reason, 'intermediate-ready-finality-forbidden');
});

test('v5 validates retained v2 history as one ordered prefix before appending v3', () => {
  const repository = bootstrapFixture.repository;
  const first = {
    schema: 'toolkit.github-program.managed-event.v2', event_type: 'canonical_initialisation', repository,
    parent_issue: 240, entity: { kind: 'parent', number: 240 }, source_state_schema: null,
    from_state_digest: DIGEST, to_canonical_digest: DIGEST, authority_ref: 'github:issue:359:comment:5564753393',
    candidate_binding_digest: null, prior_event_id: null, migration_binding_digest: null,
  };
  first.event_id = v4.digest(first);
  const second = {
    schema: 'toolkit.github-program.managed-event.v2', event_type: 'canonical_transition', repository,
    parent_issue: 240, entity: { kind: 'parent', number: 240 }, source_state_schema: v4.STATE_SCHEMA,
    from_state_digest: DIGEST, to_canonical_digest: 'e'.repeat(64), authority_ref: 'github:issue:359:comment:5564753393',
    candidate_binding_digest: null, prior_event_id: first.event_id, migration_binding_digest: null,
  };
  second.event_id = v4.digest(second);
  const valid = v5.validateManagedEventInventoryV5([first, second], repository);
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.deepEqual(valid.events, [first, second]);
  const broken = { ...second, prior_event_id: 'f'.repeat(64) };
  broken.event_id = v4.digest(Object.fromEntries(Object.entries(broken).filter(([key]) => key !== 'event_id')));
  assert.equal(v5.validateManagedEventInventoryV5([first, broken], repository).ok, false);
  assert.equal(v5.validateManagedEventInventoryV5([second, first], repository).ok, false);
  const third = v5.createManagedEventV3({
    event_type: 'canonical_transition', repository, parent_issue: 240,
    entity: { kind: 'parent', number: 240 }, source_state_schema: v5.STATE_SCHEMA,
    from_state_digest: DIGEST, to_state_digest: 'f'.repeat(64), authority_ref: 'github:issue:359:comment:5564753393',
    prior_event_id: second.event_id,
  });
  const appended = v5.validateManagedEventInventoryV5([first, second, third], repository);
  assert.equal(appended.ok, true, JSON.stringify(appended));
  assert.deepEqual(appended.events.slice(0, 2), [first, second]);
});

test('v5 preserves additive extensions and owner or unmanaged body bytes', async (t) => {
  const source = sourceState();
  source.extensions.push({
    schema: v4.EXTENSIONS_SCHEMA,
    namespace: 'security',
    target: { kind: 'parent', number: 240 },
    class: 'INFORMATION',
    title: 'Security note',
    payload: { text: 'Additional context remains additive and does not control lifecycle.' },
  });
  const migrated = v5.migrateV4ToV5(source, { authority_ref: 'github:issue:359:comment:5564753393' });
  assert.equal(migrated.ok, true, JSON.stringify(migrated));
  assert.equal(migrated.state.extensions.length, 1);
  const harness = trustHarness(migrated.state);
  const scope = harness.scope;
  let context;
  try { context = await receiptContext(migrated.state, scope.grant); } catch (error) { if (skipReceiptGuard(t, error)) return; throw error; }
  const preview = v5.buildMigrationPreviewV5({
    legacy_snapshot: legacySnapshot(source),
    authority_ref: 'github:issue:359:comment:5564753393',
    scope_grant: scope.grant,
    broker: harness.broker,
    bootstrap_after: bootstrap(),
    resolved_contract: resolvedContract(bootstrap().toolkit_contract.revision),
    receipt_context: context,
  });
  assert.equal(preview.ok, true, JSON.stringify(preview));
  const migrationSchema = JSON.parse(fs.readFileSync(path.join(__dirname, '../contracts/github-program-reconciler/programme-migration-v2.schema.json'), 'utf8'));
  const validateMigration = schemaValidator(migrationSchema);
  assert.deepEqual(migrationSchema.properties.operation_binding_digest, { $ref: '#/$defs/digest' });
  assert.equal(migrationSchema.properties.labels.$ref, '#/$defs/labels');
  assert.equal(migrationSchema.$defs.expectedSnapshot.properties.labels.$ref, '#/$defs/labelMap');
  assert.equal(migrationSchema.$defs.labels.additionalProperties, false);
  const labelMap = { '359': ['current'], '366': ['queued'] };
  const labelDelta = { before: labelMap, after: { '359': ['current'], '366': ['queued', 'blocked'] }, changed: true };
  assert.deepEqual(validateJsonSchema(labelMap, migrationSchema.$defs.labelMap, migrationSchema), []);
  assert.deepEqual(validateJsonSchema(labelDelta, migrationSchema.$defs.labels, migrationSchema), []);
  assert.notDeepEqual(validateJsonSchema({ ...labelDelta, unexpected: true }, migrationSchema.$defs.labels, migrationSchema), []);
  assert.notDeepEqual(validateJsonSchema({ before: labelMap, after: labelDelta.after }, migrationSchema.$defs.labels, migrationSchema), []);
  assert.equal(validateMigration(preview), true, JSON.stringify(validateMigration.errors));
  const unexpected = { ...preview, unexpected_property: true };
  assert.equal(validateMigration(unexpected), false);
  const missingOperationBinding = { ...preview };
  delete missingOperationBinding.operation_binding_digest;
  assert.equal(validateMigration(missingOperationBinding), false);
  assert.equal(preview.expected_snapshot.bodies.parent.startsWith(ownerFixture.parent_prefix), true);
  assert.equal(preview.expected_snapshot.bodies.parent.endsWith(ownerFixture.parent_suffix), true);
  assert.equal(preview.expected_snapshot.bodies.children['359'].startsWith(ownerFixture.child_prefix), true);
  assert.equal(preview.expected_snapshot.bodies.prs['376'].endsWith(ownerFixture.pr_suffix), true);
  assert.match(preview.expected_snapshot.bodies.parent, /Security note/);
  const oversizedOwner = legacySnapshot(source);
  oversizedOwner.bodies.parent = 'owner-prefix-' + 'x'.repeat(v5.BODY_BUDGET_BYTES) + oversizedOwner.bodies.parent;
  const oversizedPreview = v5.buildMigrationPreviewV5({
    legacy_snapshot: oversizedOwner,
    authority_ref: 'github:issue:359:comment:5564753393',
    scope_grant: scope.grant,
    broker: harness.broker,
    bootstrap_after: bootstrap(),
    resolved_contract: resolvedContract(bootstrap().toolkit_contract.revision),
    receipt_context: context,
  });
  assert.equal(oversizedPreview.ok, false, JSON.stringify(oversizedPreview));
  assert.match(oversizedPreview.reason, /materialized-body/);
});

test('v5 fails closed on body budgets, incomplete inspection, and revision movement', () => {
  const state = migrateState();
  const oversized = JSON.parse(JSON.stringify(state));
  oversized.extensions = Array.from({ length: 50 }, (_, index) => ({
    schema: v4.EXTENSIONS_SCHEMA,
    namespace: 'n' + index,
    target: { kind: 'parent', number: 240 },
    class: 'INFORMATION',
    title: 'Context ' + index,
    payload: { text: 'x'.repeat(3000) },
  }));
  assert.equal(v5.validateCanonicalStateV5(oversized).reason, 'canonical-state-byte-budget-exceeded');
  const harness = trustHarness(state);
  const scope = harness.scope;
  const snapshot = currentSnapshot(state);
  delete snapshot.bodies.children['359'];
  const missing = v5.buildConvergencePreviewV5({
    desired: state, snapshot, scope_grant: scope.grant, broker: harness.broker,
    resolved_contract: resolvedContract(snapshot.bootstrap.toolkit_contract.revision),
  });
  assert.equal(missing.reason, 'required-body-inspection-missing');
  const readback = v5.verifyConvergenceReadbackV5({ ...currentSnapshot(state), revision: 'moved-revision' }, {
    repository: state.repository,
    expected_revision: 'v5-revision-001',
    expected_snapshot_digest: v5.snapshotDigest(currentSnapshot(state)),
  });
  assert.equal(readback.reason, 'readback-snapshot-binding-invalid');
});

test('v5 bootstrap validation rejects missing, malformed, stale, unknown-major, and hash-mismatched pins', () => {
  const good = bootstrap();
  assert.equal(v5.validateControllerBootstrap(good, { repository: bootstrapFixture.repository, parent_issue: 240, version: '2.11.0' }).ok, true);
  assert.equal(v5.detectManagedRepository({ canonical_state: migrateState(), repository: bootstrapFixture.repository, parent_issue: 240 }).reason, 'v5-bootstrap-missing');
  assert.equal(v5.validateControllerBootstrap(null).ok, false);
  const unknown = { ...good, toolkit_package_version: bootstrapFixture.unknown_major };
  assert.equal(v5.validateControllerBootstrap(unknown).reason, 'bootstrap-unknown-major');
  const stale = { ...good, toolkit_contract: { ...good.toolkit_contract, revision: bootstrapFixture.stale_revision } };
  assert.equal(v5.validateControllerBootstrap(stale, { revision: 'f'.repeat(40) }).reason, 'bootstrap-revision-mismatch');
  const wrongHash = { ...good, toolkit_contract: { ...good.toolkit_contract, sha256: bootstrapFixture.wrong_digest } };
  assert.equal(v5.validateControllerBootstrap(wrongHash, { contract_bytes: v5.SURFACE_CONTRACT }).reason, 'toolkit-contract-digest-mismatch');
  const zeroRevision = { ...good, toolkit_contract: { ...good.toolkit_contract, revision: '0'.repeat(40) } };
  assert.equal(v5.resolvePinnedContract(zeroRevision, { resolved_contract: resolvedContract('0'.repeat(40)) }).ok, false);
  assert.equal(v5.resolvePinnedContract(good, {
    resolved_contract: { ...resolvedContract(good.toolkit_contract.revision), path: 'repo/wrong.json' },
  }).ok, false);
  assert.equal(v5.validateControllerBootstrap({ ...good, repository: bootstrapFixture.wrong_repository }, { repository: bootstrapFixture.repository }).reason, 'bootstrap-repository-mismatch');
  assert.equal(v5.validateControllerBootstrap({ ...good, parent_issue: bootstrapFixture.wrong_parent_issue }, { parent_issue: 240 }).reason, 'bootstrap-parent-mismatch');
});

test('v5 migration preview separates receipts from Programme Apply and binds event and operation digests', async (t) => {
  const source = sourceState();
  const target = migrateState();
  const harness = trustHarness(target);
  let context;
  try { context = await receiptContext(target, harness.scope.grant); } catch (error) { if (skipReceiptGuard(t, error)) return; throw error; }
  const preview = v5.buildMigrationPreviewV5({
    legacy_snapshot: legacySnapshot(source),
    authority_ref: 'github:issue:359:comment:5564753393',
    scope_grant: harness.scope.grant,
    broker: harness.broker,
    bootstrap_after: bootstrap(),
    resolved_contract: resolvedContract(bootstrap().toolkit_contract.revision),
    receipt_context: context,
  });
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal(preview.mutation_authority, 'NOT_GRANTED');
  assert.equal(preview.finality_authority, 'NOT_GRANTED');
  assert.equal(preview.required_receipt_delta.durable_required, true);
  assert.equal(preview.required_receipt_delta.persisted_in_preview, false);
  assert.equal(preview.operations.some((operation) => /receipt/i.test(operation.kind)), false);
  assert.equal(preview.managed_event_delta.new_events[0].consumed_receipt_ids.length, 2);
  assert.equal(preview.managed_event_delta.new_events[0].receipt_id, preview.required_receipt_delta.receipt_id);
  const event = preview.managed_event_delta.new_events[0];
  const receipts = preview.required_receipt_delta.chain;
  assert.equal(receipts[0].sequence, 1);
  assert.equal(receipts[0].payload.classification, 'RUN_STARTED_VERIFIED');
  assert.equal(receipts[1].sequence, receipts[0].sequence + 1);
  assert.equal(receipts[1].prior_receipt_id, receipts[0].receipt_id);
  assert.equal(preview.required_receipt_delta.started_receipt_id, receipts[0].receipt_id);
  assert.equal(receipts[1].payload.operation_digest, preview.operation_binding_digest);
  assert.equal(v5.validateReceiptConsumption(event, receipts, {
    repository: target.repository,
    parent_issue: target.parent.issue,
    operation_digest: preview.required_receipt_delta.receipt.payload.operation_digest,
  }).ok, true);
  const tamperedEvent = { ...event, to_state_digest: 'f'.repeat(64) };
  assert.equal(v5.validateReceiptConsumption(tamperedEvent, receipts).ok, false);
  const tamperedReceipt = {
    ...receipts[1],
    payload: { ...receipts[1].payload, operation_digest: 'f'.repeat(64) },
  };
  tamperedReceipt.receipt_id = v5.digest(Object.fromEntries(Object.entries(tamperedReceipt).filter(([key]) => key !== 'receipt_id')));
  assert.equal(v5.validateReceiptConsumption(event, [receipts[0], tamperedReceipt]).ok, false);
});

test('v5 requires canonical receipt evidence for a mutation-bearing recovery preview', () => {
  const state = migrateState();
  const harness = trustHarness(state);
  const snapshot = currentSnapshot(state);
  const result = v5.buildConvergencePreviewV5({
    desired: state,
    snapshot,
    scope_grant: harness.scope.grant,
    broker: harness.broker,
    resolved_contract: resolvedContract(snapshot.bootstrap.toolkit_contract.revision),
  });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.reason, 'canonical-started-chain-required');
});

test('v5 managed event inventory binds IDs, prior events, and receipt inventory deterministically', () => {
  const event = v5.createManagedEventV3({
    event_type: 'canonical_initialisation',
    repository: bootstrapFixture.repository,
    parent_issue: 240,
    entity: { kind: 'parent', number: 240 },
    source_state_schema: null,
    from_state_digest: DIGEST,
    to_state_digest: DIGEST,
    authority_ref: 'github:issue:359:comment:5564753393',
    consumed_receipt_ids: [],
  });
  assert.equal(v5.validateManagedEventV3(event, { repository: bootstrapFixture.repository, parent_issue: 240 }).ok, true);
  const inventory = v5.validateManagedEventInventoryV5([event], bootstrapFixture.repository);
  assert.equal(inventory.ok, true, JSON.stringify(inventory));
  assert.equal(inventory.inventory_digest, v5.digest([event]));
  assert.equal(v5.validateManagedEventV3({ ...event, event_id: 'f'.repeat(64) }).ok, false);
  const second = v5.createManagedEventV3({
    event_type: 'canonical_transition',
    repository: bootstrapFixture.repository,
    parent_issue: 240,
    entity: { kind: 'parent', number: 240 },
    source_state_schema: v5.STATE_SCHEMA,
    from_state_digest: DIGEST,
    to_state_digest: 'e'.repeat(64),
    authority_ref: 'github:issue:359:comment:5564753393',
    prior_event_id: event.event_id,
  });
  assert.equal(v5.validateManagedEventInventoryV5([event, second], bootstrapFixture.repository).ok, true);
  assert.equal(v5.validateManagedEventInventoryV5([second, event], bootstrapFixture.repository).ok, false);
  const claimed = v5.createManagedEventV3({
    event_type: 'canonical_transition', repository: bootstrapFixture.repository, parent_issue: 240,
    entity: { kind: 'parent', number: 240 }, source_state_schema: v5.STATE_SCHEMA,
    from_state_digest: DIGEST, to_state_digest: 'f'.repeat(64), authority_ref: 'github:issue:359:comment:5564753393',
    prior_event_id: null, receipt_id: DIGEST, consumed_receipt_ids: [DIGEST],
  });
  assert.equal(v5.validateManagedEventInventoryV5([claimed], bootstrapFixture.repository).reason, 'receipt-inventory-not-durable');
});

test('v5 produces deterministic PROGRAMME_ZERO_DELTA and does not apply it', async (t) => {
  const state = migrateState();
  const currentBootstrap = bootstrap();
  const initial = currentSnapshot(state, currentBootstrap);
  const harness = trustHarness(state);
  let context;
  try { context = await receiptContext(state, harness.scope.grant); } catch (error) { if (skipReceiptGuard(t, error)) return; throw error; }
  const first = v5.buildConvergencePreviewV5({
    desired: state,
    snapshot: initial,
    scope_grant: harness.scope.grant,
    broker: harness.broker,
    resolved_contract: resolvedContract(currentBootstrap.toolkit_contract.revision),
    receipt_context: context,
    authority_ref: 'github:issue:359:comment:5564753393',
  });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.managed_event_delta.new_events.length, 1);
  assert.equal(first.managed_event_delta.new_events[0].event_type, 'canonical_transition');
  assert.equal(first.operations.length, 1);
  assert.equal(first.operations[0].kind, 'managed-event');
  const tamperedPreview = JSON.parse(JSON.stringify(first));
  const originalAfterDigest = tamperedPreview.operations[0].after_digest;
  tamperedPreview.operations[0].after_digest = `${originalAfterDigest[0] === '0' ? '1' : '0'}${originalAfterDigest.slice(1)}`;
  assert.notEqual(tamperedPreview.operations[0].after_digest, originalAfterDigest);
  assert.match(tamperedPreview.operations[0].after_digest, /^[a-f0-9]{64}$/);
  let tamperedWriterCalls = 0;
  const tamperedStore = v5.createMemoryDurableStore({ previews: [tamperedPreview], receipts: first.required_receipt_delta.chain });
  const tamperedRuntime = v5.createProgrammeRuntimeV5({
    store: tamperedStore,
    inspect_snapshot: () => initial,
    scope_grant: harness.scope.grant,
    broker: harness.broker,
    resolved_contract: resolvedContract(currentBootstrap.toolkit_contract.revision),
    verify_authority: () => ({ ok: true }),
    apply_operations: () => { tamperedWriterCalls += 1; return { ok: true }; },
  });
  const tampered = tamperedRuntime.apply({ preview: tamperedPreview });
  assert.equal(tampered.ok, false, JSON.stringify(tampered));
  assert.equal(tamperedWriterCalls, 0);
  let movingSnapshot = initial;
  let writerCalls = 0;
  const movingStore = v5.createMemoryDurableStore({ previews: [first], receipts: first.required_receipt_delta.chain });
  const movingRuntime = v5.createProgrammeRuntimeV5({
    store: movingStore,
    inspect_snapshot: () => movingSnapshot,
    scope_grant: harness.scope.grant,
    broker: harness.broker,
    resolved_contract: resolvedContract(currentBootstrap.toolkit_contract.revision),
    verify_authority: () => {
      movingSnapshot = { ...initial, revision: 'moved-before-writer' };
      return { ok: true };
    },
    apply_operations: () => { writerCalls += 1; return { ok: true }; },
  });
  const moved = movingRuntime.apply({ preview: first });
  assert.equal(moved.ok, false, JSON.stringify(moved));
  assert.equal(writerCalls, 0);
  let writerObserved;
  let writerSnapshot = initial;
  const writerStore = v5.createMemoryDurableStore({ previews: [first], receipts: first.required_receipt_delta.chain });
  const writerRuntime = v5.createProgrammeRuntimeV5({
    store: writerStore,
    inspect_snapshot: () => writerSnapshot,
    scope_grant: harness.scope.grant,
    broker: harness.broker,
    resolved_contract: resolvedContract(currentBootstrap.toolkit_contract.revision),
    verify_authority: () => ({ ok: true }),
    apply_operations: (request) => {
      writerObserved = request;
      writerSnapshot = { ...initial, revision: 'moved-inside-writer' };
      return request.expected.expected_revision === writerSnapshot.revision
        ? { ok: true, preconditions_verified: true, precondition_digest: request.expected.precondition_digest, operation_binding_digest: request.operation_binding_digest }
        : { ok: false, reason: 'provider-cas-mismatch' };
    },
  });
  const writerRejected = writerRuntime.apply({ preview: first });
  assert.equal(writerRejected.ok, false, JSON.stringify(writerRejected));
  assert.equal(writerObserved.preconditions_verified, undefined);
  assert.equal(writerObserved.expected.operation_binding_digest, first.operation_binding_digest);
  const second = v5.buildConvergencePreviewV5({
    desired: state,
    snapshot: first.expected_snapshot,
    scope_grant: harness.scope.grant,
    broker: harness.broker,
    receipts: first.required_receipt_delta.chain,
    resolved_contract: resolvedContract(currentBootstrap.toolkit_contract.revision),
  });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.code, 'PROGRAMME_ZERO_DELTA');
  assert.equal(second.operations.length, 0);
  assert.equal(v5.verifyConvergenceReadbackV5(first.expected_snapshot, first).ok, true);
  const store = v5.createMemoryDurableStore({ previews: [second], receipts: first.required_receipt_delta.chain });
  const runtime = v5.createProgrammeRuntimeV5({
    store,
    inspect_snapshot: () => first.expected_snapshot,
    scope_grant: harness.scope.grant,
    broker: harness.broker,
    resolved_contract: resolvedContract(currentBootstrap.toolkit_contract.revision),
  });
  const applied = runtime.apply({ preview: second });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(applied.code, 'PROGRAMME_ZERO_DELTA');
  assert.equal(applied.mutation_count, 0);
});
