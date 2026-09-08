'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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

function rfc3339DateTime(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > monthDays[month - 1]) return false;
  if (match[7] !== undefined && (Number(match[8]) > 23 || Number(match[9]) > 59)) return false;
  return true;
}

function schemaValueEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((entry, index) => schemaValueEqual(entry, right[index]));
  }
  if (left && typeof left === 'object' || right && typeof right === 'object') {
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return schemaValueEqual(leftKeys, rightKeys)
      && leftKeys.every((key) => schemaValueEqual(left[key], right[key]));
  }
  return false;
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
    const characterLength = Array.from(value).length;
    if (schema.minLength !== undefined && characterLength < schema.minLength) errors.push(`${location}: shorter than minLength`);
    if (schema.maxLength !== undefined && characterLength > schema.maxLength) errors.push(`${location}: longer than maxLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${location}: pattern mismatch`);
    if (schema.format === 'date-time' && !rfc3339DateTime(value)) errors.push(`${location}: date-time mismatch`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${location}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${location}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${location}: fewer than minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${location}: more than maxItems`);
    if (schema.uniqueItems === true) {
      for (let left = 0; left < value.length; left += 1) {
        for (let right = left + 1; right < value.length; right += 1) {
          if (schemaValueEqual(value[left], value[right])) errors.push(`${location}: duplicate uniqueItems`);
        }
      }
    }
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

const EXPECTED_MIGRATION_SCHEMA_KEYWORDS = [
  '$defs', '$id', '$ref', '$schema', 'additionalProperties', 'const', 'enum', 'format', 'items',
  'maxItems', 'maxLength', 'maximum', 'minItems', 'minLength', 'minimum', 'oneOf', 'pattern',
  'properties', 'required', 'title', 'type', 'uniqueItems',
];

function collectSchemaKeywords(schema) {
  const allowed = new Set(EXPECTED_MIGRATION_SCHEMA_KEYWORDS);
  const used = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    for (const [keyword, value] of Object.entries(node)) {
      if (!allowed.has(keyword)) throw new Error(`unsupported schema keyword: ${keyword}`);
      used.add(keyword);
      if (keyword === 'properties' || keyword === '$defs') Object.values(value || {}).forEach(visit);
      else if (keyword === 'items' || keyword === 'additionalProperties') visit(value);
      else if (['allOf', 'oneOf', 'anyOf'].includes(keyword)) visit(value);
    }
  }
  visit(schema);
  return [...used].sort();
}

test('self-contained migration schema harness audits keywords and enforces structural uniqueItems', () => {
  const migrationSchema = JSON.parse(fs.readFileSync(path.join(__dirname, '../contracts/github-program-reconciler/programme-migration-v2.schema.json'), 'utf8'));
  assert.deepEqual(collectSchemaKeywords(migrationSchema), EXPECTED_MIGRATION_SCHEMA_KEYWORDS.slice().sort());
  assert.equal(schemaValueEqual({ first: 1, nested: { second: 2 } }, { nested: { second: 2 }, first: 1 }), true);
  const duplicateIds = validateJsonSchema([DIGEST, DIGEST], migrationSchema.properties.ordered_operation_ids, migrationSchema);
  assert.equal(duplicateIds.some((error) => error.includes('uniqueItems')), true, JSON.stringify(duplicateIds));
  const duplicateRelationshipOperations = validateJsonSchema(
    ['PR_ASSOCIATION', 'PR_ASSOCIATION'], schemaRef(migrationSchema, migrationSchema.properties.required_relationship_operations.$ref), migrationSchema
  );
  assert.equal(duplicateRelationshipOperations.some((error) => error.includes('uniqueItems')), true, JSON.stringify(duplicateRelationshipOperations));
  const duplicateObjects = validateJsonSchema([{ first: 1, second: 2 }, { second: 2, first: 1 }], {
    type: 'array', uniqueItems: true, items: { type: 'object' },
  }, {});
  assert.equal(duplicateObjects.some((error) => error.includes('uniqueItems')), true, JSON.stringify(duplicateObjects));
  const lengthSchema = { type: 'string', maxLength: 512 };
  assert.deepEqual(validateJsonSchema('😀'.repeat(300), lengthSchema, {}), []);
  assert.deepEqual(validateJsonSchema('😀'.repeat(512), lengthSchema, {}), []);
  assert.equal(validateJsonSchema('😀'.repeat(513), lengthSchema, {}).some((error) => error.includes('maxLength')), true);
  assert.deepEqual(validateJsonSchema('界'.repeat(512), lengthSchema, {}), []);
  assert.equal(validateJsonSchema('a'.repeat(513), lengthSchema, {}).some((error) => error.includes('maxLength')), true);
  const dateSchema = { type: 'string', format: 'date-time' };
  for (const valid of ['2026-09-07T01:02:03Z', '2026-09-07t01:02:03+08:00', '2024-02-29T23:59:59.123-04:00']) {
    assert.deepEqual(validateJsonSchema(valid, dateSchema, {}), []);
  }
  for (const invalid of ['1', '2026-09-07', '2026-09-07T01:02:03', '2026-13-07T01:02:03Z', '2026-02-30T01:02:03Z', '2026-09-07T24:00:00Z', '2026-09-07T01:60:00Z', '2026-09-07T01:02:60Z']) {
    assert.equal(validateJsonSchema(invalid, dateSchema, {}).some((error) => error.includes('date-time')), true, invalid);
  }
});

function schemaValidator(schema) {
  const validate = (value) => {
    validate.errors = validateJsonSchema(value, schema, schema);
    return validate.errors.length === 0;
  };
  validate.errors = [];
  return validate;
}

function utf8Padding(byteLength) {
  assert.equal(Number.isSafeInteger(byteLength) && byteLength >= 0, true);
  const multibyte = '\u754c';
  const width = Buffer.byteLength(multibyte, 'utf8');
  return multibyte.repeat(Math.floor(byteLength / width)) + 'x'.repeat(byteLength % width);
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

function legacyV1Event(options = {}) {
  const event = {
    schema: 'toolkit.github-program.managed-event.v1',
    event_type: options.event_type || 'lifecycle_transition',
    repository: bootstrapFixture.repository,
    entity: options.entity || { kind: 'parent', number: 240 },
    exact_revision: options.exact_revision || SHA,
    resulting_state: options.resulting_state || 'CURRENT',
    authority_ref: options.authority_ref || 'github:issue:359:comment:5564753393',
  };
  if (options.prior_event !== undefined) event.prior_event = options.prior_event;
  if (options.child_issue !== undefined) event.child_issue = options.child_issue;
  if (options.pr_number !== undefined) event.pr_number = options.pr_number;
  if (options.epoch !== undefined) event.epoch = options.epoch;
  event.event_id = v4.digest(event);
  return event;
}

function memoryReceiptContext(state, scope, options = {}) {
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
    ref: { detached: false, name: 'codex/e3-memory-receipt-boundary' },
  };
  const lease = {
    lease_id: options.lease_id || 'lease-memory-1',
    fence_id: options.fence_id || 'fence-memory-1',
    fence_sequence: options.fence_sequence || 1,
    issued_at: options.issued_at || '2026-09-07T00:00:00.000Z',
    expires_at: options.expires_at || '2099-09-07T00:00:00.000Z',
  };
  const runId = options.run_id || 'run-memory-1';
  const allocationId = options.allocation_id || 'allocation-memory-1';
  const lock = options.lock || 'lock-memory-1';
  const started = v5.createRunReceipt({
    receipt_type: 'RUN_STARTED', sequence: 1, run_id: runId, allocation_id: allocationId,
    repository: state.repository, parent_issue: state.parent.issue, child_issue: state.children[0].issue,
    lock, authority, start, candidate: null, lease,
    payload: { classification: 'RUN_STARTED_VERIFIED' },
    created_at: options.created_at || '2026-09-07T00:00:00.000Z',
  });
  return {
    authority_ref: 'github:issue:359:comment:5564753393', authority, start, lease, run_id: runId,
    allocation_id: allocationId, child_issue: state.children[0].issue, lock,
    started_chain: [started], transition_created_at: '2026-09-07T00:00:00.001Z',
  };
}

function memoryPreviewFixture(options = {}) {
  const state = migrateState();
  const harness = trustHarness(state);
  const snapshot = currentSnapshot(state);
  const context = memoryReceiptContext(state, harness.scope.grant, options);
  const preview = v5.buildConvergencePreviewV5({
    desired: state, snapshot, scope_grant: harness.scope.grant, broker: harness.broker,
    resolved_contract: resolvedContract(snapshot.bootstrap.toolkit_contract.revision), receipt_context: context,
    authority_ref: context.authority_ref,
  });
  assert.equal(preview.ok, true, JSON.stringify(preview));
  const store = v5.createMemoryDurableStore({ previews: [preview], receipts: preview.required_receipt_delta.chain });
  return { state, harness, snapshot, context, preview, store };
}

function invalidatingReceipt(chain, receiptType = 'RUN_INTERRUPTED') {
  const prior = chain.at(-1);
  return v5.createRunReceipt({
    receipt_type: receiptType, sequence: prior.sequence + 1, prior_receipt_id: prior.receipt_id,
    run_id: prior.run_id, allocation_id: prior.allocation_id, repository: prior.repository,
    parent_issue: prior.parent_issue, child_issue: prior.child_issue, lock: prior.lock,
    authority: prior.authority, start: prior.start, candidate: prior.candidate, lease: prior.lease,
    payload: { classification: receiptType }, created_at: '2026-09-07T00:00:00.002Z',
  });
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

test('v5 requires an accepted merged completing PR for completed children and derives status-aware associations', () => {
  const retired = migrateState();
  const retiredChild = retired.children[0];
  retiredChild.pr_registry[0] = {
    ...retiredChild.pr_registry[0], status: 'RETIRED', role: 'TERMINAL', completes_child: true,
    accepted_evidence_ref: null, retirement_evidence_ref: 'web-359',
  };
  retired.active_lanes[0].candidate = null;
  const retiredValid = v5.validateCanonicalStateV5(retired);
  assert.equal(retiredValid.ok, true, JSON.stringify(retiredValid));
  assert.equal(v5.derivePrAssociationsV5(retired).associations['376'].kind, 'CROSS_REFERENCE');

  const incomplete = migrateState();
  const incompleteChild = incomplete.children[0];
  incompleteChild.lifecycle = 'COMPLETED';
  incompleteChild.epochs.forEach((epoch) => { epoch.terminal_disposition = 'RETIRED'; epoch.evidence_ref = 'web-359'; });
  incompleteChild.finality = { state: 'MERGED', authority_ref: 'web-359' };
  incompleteChild.pr_registry[0] = {
    ...incompleteChild.pr_registry[0], status: 'RETIRED', role: 'TERMINAL', completes_child: true,
    accepted_evidence_ref: null, retirement_evidence_ref: 'web-359',
  };
  incomplete.active_lanes = [];
  assert.equal(v5.validateCanonicalStateV5(incomplete).reason, 'completed-child-completing-pr-required');
  assert.equal(v5.derivePrAssociationsV5(incomplete).ok, false);

  const activeReadyOnly = migrateState();
  const activeReadyChild = activeReadyOnly.children[0];
  activeReadyChild.lifecycle = 'COMPLETED';
  activeReadyChild.epochs.forEach((epoch) => { epoch.terminal_disposition = 'ACCEPTED'; epoch.evidence_ref = 'web-359'; });
  activeReadyChild.finality = { state: 'MERGED', authority_ref: 'web-359' };
  activeReadyOnly.active_lanes = [];
  activeReadyChild.pr_registry[0] = {
    ...activeReadyChild.pr_registry[0], status: 'ACTIVE', role: 'TERMINAL', completes_child: true,
  };
  assert.equal(v5.validateCanonicalStateV5(activeReadyOnly).reason, 'completed-child-completing-pr-required');

  const readyOnly = migrateState();
  const readyOnlyChild = readyOnly.children[0];
  readyOnlyChild.lifecycle = 'COMPLETED';
  readyOnlyChild.epochs.forEach((epoch) => { epoch.terminal_disposition = 'ACCEPTED'; epoch.evidence_ref = 'web-359'; });
  readyOnlyChild.finality = { state: 'READY_AUTHORIZED', authority_ref: 'web-359' };
  readyOnlyChild.pr_registry[0] = {
    ...readyOnlyChild.pr_registry[0], status: 'ACTIVE', role: 'TERMINAL', completes_child: true,
  };
  readyOnly.active_lanes = [];
  assert.equal(v5.validateCanonicalStateV5(readyOnly).reason, 'completed-child-finality-incomplete');
  const closedUnmerged = trustHarness(incomplete, { lifecycle: 'CLOSED_UNMERGED' });
  assert.equal(v5.inspectTrustBindingsV5(incomplete, closedUnmerged.scope.grant, closedUnmerged.broker).ok, false);

  const completed = migrateState();
  const completedChild = completed.children[0];
  completedChild.lifecycle = 'COMPLETED';
  completedChild.epochs.forEach((epoch) => { epoch.terminal_disposition = 'ACCEPTED'; epoch.evidence_ref = 'web-359'; });
  completedChild.finality = { state: 'MERGED', authority_ref: 'web-359' };
  completedChild.pr_registry[0] = {
    ...completedChild.pr_registry[0], status: 'ACCEPTED', role: 'TERMINAL', completes_child: true,
    accepted_evidence_ref: 'web-359', retirement_evidence_ref: null,
  };
  completed.active_lanes = [];
  const completedValid = v5.validateCanonicalStateV5(completed);
  assert.equal(completedValid.ok, true, JSON.stringify(completedValid));
  assert.equal(v5.derivePrAssociationsV5(completed).associations['376'].kind, 'CLOSING');
  const completedTrust = trustHarness(completed, { lifecycle: 'MERGED' });
  assert.equal(v5.inspectTrustBindingsV5(completed, completedTrust.scope.grant, completedTrust.broker).ok, true);

  const ready = migrateState();
  ready.children[0].epochs[0].terminal_disposition = 'ACCEPTED';
  ready.children[0].epochs[0].evidence_ref = 'web-359';
  ready.children[0].pr_registry[0].role = 'TERMINAL';
  ready.children[0].pr_registry[0].completes_child = true;
  ready.children[0].finality = { state: 'READY_AUTHORIZED', authority_ref: 'web-359' };
  const readyAssociations = v5.derivePrAssociationsV5(ready);
  assert.equal(readyAssociations.ok, true, JSON.stringify(readyAssociations));
  assert.equal(readyAssociations.associations['376'].kind, 'CLOSING');
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

test('v5 validates v1 predecessor links while preserving legacy bytes and mixed history order', () => {
  const first = legacyV1Event({ resulting_state: 'INITIALISED' });
  const second = legacyV1Event({ resulting_state: 'CURRENT', prior_event: first.event_id });
  const valid = v5.validateManagedEventInventoryV5([first, second], bootstrapFixture.repository);
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.deepEqual(valid.events, [first, second]);

  const broken = legacyV1Event({ resulting_state: 'BROKEN', prior_event: 'f'.repeat(64) });
  assert.equal(v5.validateManagedEventInventoryV5([first, broken], bootstrapFixture.repository).reason, 'managed-event-history-link-invalid');
  assert.equal(v5.validateManagedEventInventoryV5([second, first], bootstrapFixture.repository).reason, 'managed-event-history-link-invalid');

  const v2 = {
    schema: 'toolkit.github-program.managed-event.v2', event_type: 'canonical_transition', repository: bootstrapFixture.repository,
    parent_issue: 240, entity: { kind: 'parent', number: 240 }, source_state_schema: v4.STATE_SCHEMA,
    from_state_digest: DIGEST, to_canonical_digest: 'e'.repeat(64), authority_ref: 'github:issue:359:comment:5564753393',
    candidate_binding_digest: null, prior_event_id: second.event_id, migration_binding_digest: null,
  };
  v2.event_id = v4.digest(v2);
  const brokenBoundary = { ...v2, prior_event_id: broken.event_id };
  brokenBoundary.event_id = v4.digest(Object.fromEntries(Object.entries(brokenBoundary).filter(([key]) => key !== 'event_id')));
  assert.equal(v5.validateManagedEventInventoryV5([first, broken, brokenBoundary], bootstrapFixture.repository).ok, false);
  const v3 = v5.createManagedEventV3({
    event_type: 'canonical_transition', repository: bootstrapFixture.repository, parent_issue: 240,
    entity: { kind: 'parent', number: 240 }, source_state_schema: v5.STATE_SCHEMA,
    from_state_digest: 'e'.repeat(64), to_state_digest: 'f'.repeat(64), authority_ref: 'github:issue:359:comment:5564753393',
    prior_event_id: v2.event_id,
  });
  const mixed = v5.validateManagedEventInventoryV5([first, second, v2, v3], bootstrapFixture.repository);
  assert.equal(mixed.ok, true, JSON.stringify(mixed));
  assert.deepEqual(mixed.events.slice(0, 3), [first, second, v2]);
  assert.equal(mixed.events[3].event_id, v3.event_id);
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

  const predecessorRendered = v4.renderProgrammeV4(source);
  assert.equal(predecessorRendered.ok, true, JSON.stringify(predecessorRendered));
  const migratedTarget = v5.migrateV4ToV5(source, { authority_ref: 'github:issue:359:comment:5564753393' });
  assert.equal(migratedTarget.ok, true, JSON.stringify(migratedTarget));
  const migratedRendered = v5.renderProgrammeV5(migratedTarget.state);
  assert.equal(migratedRendered.ok, true, JSON.stringify(migratedRendered));
  const B = v5.BODY_BUDGET_BYTES;
  const ownerPrefix = ownerFixture.parent_prefix;
  const ownerSuffix = ownerFixture.parent_suffix;
  const P = v5.bytes(ownerPrefix);
  const S = v5.bytes(ownerSuffix);
  const M4 = v5.bytes(predecessorRendered.bodies.parent);
  const M5 = v5.bytes(migratedRendered.bodies.parent);
  assert.equal(v5.bytes('\u754c'), 3);
  assert.equal(M5 > M4, true);
  const paddingBytes = B - (P + M4 + S);
  assert.equal(paddingBytes > 0, true);
  const padding = utf8Padding(paddingBytes);
  assert.equal(v5.bytes(padding), paddingBytes);
  const predecessorBody = ownerPrefix + padding + predecessorRendered.bodies.parent + ownerSuffix;
  assert.equal(v5.bytes(predecessorBody), B);
  const predecessorParsed = v4.parseProgrammeV4Body(predecessorBody, {
    kind: 'parent', repository: source.repository, parent_issue: source.parent.issue, number: source.parent.issue,
  });
  assert.equal(predecessorParsed.ok, true, JSON.stringify(predecessorParsed));
  assert.deepEqual(Buffer.from(predecessorParsed.prefix, 'utf8').subarray(0, P), Buffer.from(ownerPrefix, 'utf8'));
  assert.deepEqual(Buffer.from(predecessorParsed.suffix, 'utf8'), Buffer.from(ownerSuffix, 'utf8'));
  assert.deepEqual(Buffer.from(predecessorParsed.prefix, 'utf8').subarray(P), Buffer.from(padding, 'utf8'));
  const boundaryBudget = v5.validateMaterializedBodies({ parent: predecessorBody, children: {}, prs: {} });
  assert.equal(boundaryBudget.ok, true, JSON.stringify(boundaryBudget));
  assert.equal(boundaryBudget.total_materialized_body_bytes, B);
  const boundaryPlusOneBudget = v5.validateMaterializedBodies({ parent: predecessorBody + 'x', children: {}, prs: {} });
  assert.equal(boundaryPlusOneBudget.reason, 'materialized-body-byte-budget-exceeded');
  assert.equal(boundaryPlusOneBudget.actual, B + 1);
  const aggregatePerBody = Math.floor(v5.TOTAL_PROJECTION_BUDGET_BYTES / 10) + 1;
  assert.equal(aggregatePerBody <= B, true);
  const aggregateBudget = v5.validateMaterializedBodies({
    parent: 'x'.repeat(aggregatePerBody),
    children: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index + 1), 'x'.repeat(aggregatePerBody)])),
    prs: {},
  });
  assert.equal(aggregateBudget.reason, 'materialized-body-total-byte-budget-exceeded');
  assert.equal(aggregateBudget.limit, v5.TOTAL_PROJECTION_BUDGET_BYTES);
  assert.equal(aggregateBudget.actual, aggregatePerBody * 10);
  const expectedMaterializedBody = ownerPrefix + padding + migratedRendered.bodies.parent + ownerSuffix;
  const expectedMaterializedBytes = v5.bytes(expectedMaterializedBody);
  assert.equal(expectedMaterializedBytes, B + (M5 - M4));
  assert.equal(expectedMaterializedBytes > B, true);
  const materializedBudget = v5.validateMaterializedBodies({ parent: expectedMaterializedBody, children: {}, prs: {} });
  assert.equal(materializedBudget.reason, 'materialized-body-byte-budget-exceeded');
  assert.equal(materializedBudget.kind, 'parent');
  assert.equal(materializedBudget.limit, B);
  assert.equal(materializedBudget.actual, expectedMaterializedBytes);
  assert.deepEqual(Buffer.from(expectedMaterializedBody, 'utf8').subarray(0, P), Buffer.from(ownerPrefix, 'utf8'));
  assert.deepEqual(Buffer.from(expectedMaterializedBody, 'utf8').subarray(-S), Buffer.from(ownerSuffix, 'utf8'));

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
  assert.deepEqual(collectSchemaKeywords(migrationSchema), EXPECTED_MIGRATION_SCHEMA_KEYWORDS.slice().sort());
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
  const duplicateOperationIds = JSON.parse(JSON.stringify(preview));
  duplicateOperationIds.ordered_operation_ids.push(duplicateOperationIds.ordered_operation_ids[0]);
  assert.equal(validateMigration(duplicateOperationIds), false);
  const duplicateConsumedReceipts = JSON.parse(JSON.stringify(preview));
  const consumedReceiptIds = duplicateConsumedReceipts.expected_snapshot.managed_events.at(-1).consumed_receipt_ids;
  duplicateConsumedReceipts.expected_snapshot.managed_events.at(-1).consumed_receipt_ids = [consumedReceiptIds[0], consumedReceiptIds[0]];
  assert.equal(validateMigration(duplicateConsumedReceipts), false);
  const unexpectedNested = JSON.parse(JSON.stringify(preview));
  unexpectedNested.expected_snapshot.bootstrap.unexpected_property = true;
  assert.equal(validateMigration(unexpectedNested), false);
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
  oversizedOwner.bodies.parent = predecessorBody;
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
  assert.equal(oversizedPreview.reason, 'materialized-body-byte-budget-exceeded');
  assert.equal(oversizedPreview.kind, 'parent');
  assert.equal(oversizedPreview.limit, B);
  assert.equal(oversizedPreview.actual, expectedMaterializedBytes);
  assert.deepEqual(Buffer.from(expectedMaterializedBody, 'utf8').subarray(0, P), Buffer.from(ownerPrefix, 'utf8'));
  assert.deepEqual(Buffer.from(expectedMaterializedBody, 'utf8').subarray(-S), Buffer.from(ownerSuffix, 'utf8'));
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

test('v5 resolves the checked-in bootstrap contract by canonical JSON digest', () => {
  const bootstrapPath = path.join(repositoryRoot, '.github/ai-agent-toolkit-programme.json');
  const checkedInBootstrap = JSON.parse(fs.readFileSync(bootstrapPath, 'utf8'));
  const pin = checkedInBootstrap.toolkit_contract;
  assert.match(pin.revision, /^[0-9a-f]{40}$/);

  const objectCheck = spawnSync('git', ['cat-file', '-e', `${pin.revision}:${pin.path}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(objectCheck.status, 0, objectCheck.stderr);
  const contractResult = spawnSync('git', ['show', `${pin.revision}:${pin.path}`], {
    cwd: repositoryRoot,
    encoding: null,
  });
  assert.equal(contractResult.status, 0, contractResult.stderr?.toString());
  assert.ok(Buffer.isBuffer(contractResult.stdout));

  const contractBytes = contractResult.stdout;
  const contract = JSON.parse(contractBytes.toString('utf8'));
  const canonicalDigest = v5.digest(contract);
  const rawFileDigest = crypto.createHash('sha256').update(contractBytes).digest('hex');
  assert.equal(canonicalDigest, '50c1b3eb438ac22e3da52367ae08f76d5abc622e8c8da75312b4f36673f3c494');
  assert.notEqual(rawFileDigest, canonicalDigest);

  const resolved = v5.resolvePinnedContract(checkedInBootstrap, {
    repository: checkedInBootstrap.repository,
    parent_issue: checkedInBootstrap.parent_issue,
    resolved_contract: {
      repository: pin.repository,
      revision: pin.revision,
      path: pin.path,
      bytes: contractBytes,
    },
  });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  assert.equal(resolved.code, 'PINNED_CONTRACT_RESOLVED');
  assert.equal(resolved.contract_digest, canonicalDigest);
  assert.equal(pin.sha256, canonicalDigest);

  const rawHashBootstrap = {
    ...checkedInBootstrap,
    toolkit_contract: { ...pin, sha256: rawFileDigest },
  };
  const rejected = v5.resolvePinnedContract(rawHashBootstrap, {
    repository: checkedInBootstrap.repository,
    parent_issue: checkedInBootstrap.parent_issue,
    resolved_contract: {
      repository: pin.repository,
      revision: pin.revision,
      path: pin.path,
      bytes: contractBytes,
    },
  });
  assert.equal(rejected.ok, false, JSON.stringify(rejected));
  assert.equal(rejected.reason, 'toolkit-contract-digest-mismatch');
  assert.equal(rejected.expected, rawFileDigest);
  assert.equal(rejected.actual, canonicalDigest);
});

test('v5 keeps the independently expected bootstrap revision through current, migration, and apply paths', () => {
  const expectedRevision = '7cbdb78aac022386b17696f6930fe4f06d274fd1';
  const staleRevision = '460a2460e5e8eaebebd7d2dc4c9f8e4bec0dd125';
  const state = migrateState();
  const harness = trustHarness(state);
  const staleSnapshot = currentSnapshot(state, bootstrap(staleRevision));
  const staleCurrent = v5.buildConvergencePreviewV5({
    desired: state, snapshot: staleSnapshot, scope_grant: harness.scope.grant, broker: harness.broker,
    bootstrap_revision: expectedRevision, resolved_contract: resolvedContract(staleRevision),
  });
  assert.equal(staleCurrent.ok, false, JSON.stringify(staleCurrent));
  assert.equal(staleCurrent.reason, 'v5-bootstrap-invalid-or-missing');
  assert.equal(staleCurrent.detail, 'bootstrap-revision-mismatch');

  const exactSnapshot = currentSnapshot(state, bootstrap(expectedRevision));
  const exactContext = memoryReceiptContext(state, harness.scope.grant, {
    run_id: 'run-memory-bootstrap-exact', allocation_id: 'allocation-memory-bootstrap-exact',
  });
  const exactCurrent = v5.buildConvergencePreviewV5({
    desired: state, snapshot: exactSnapshot, scope_grant: harness.scope.grant, broker: harness.broker,
    bootstrap_revision: expectedRevision, resolved_contract: resolvedContract(expectedRevision),
    receipt_context: exactContext, authority_ref: exactContext.authority_ref,
  });
  assert.equal(exactCurrent.ok, true, JSON.stringify(exactCurrent));
  const exactStore = v5.createMemoryDurableStore({ previews: [exactCurrent], receipts: exactCurrent.required_receipt_delta.chain });
  const staleApply = v5.createProgrammeRuntimeV5({
    store: exactStore, inspect_snapshot: () => exactSnapshot, scope_grant: harness.scope.grant, broker: harness.broker,
    resolved_contract: resolvedContract(expectedRevision),
  }).apply({ preview: exactCurrent, bootstrap_revision: staleRevision, resolved_contract: resolvedContract(expectedRevision) });
  assert.equal(staleApply.ok, false, JSON.stringify(staleApply));
  assert.equal(staleApply.reason, 'bootstrap-revision-mismatch');

  const staleMigration = v5.buildMigrationPreviewV5({
    legacy_snapshot: legacySnapshot(sourceState()), authority_ref: 'github:issue:359:comment:5564753393',
    scope_grant: harness.scope.grant, broker: harness.broker, bootstrap_after: bootstrap(staleRevision),
    bootstrap_revision: expectedRevision, resolved_contract: resolvedContract(staleRevision),
  });
  assert.equal(staleMigration.ok, false, JSON.stringify(staleMigration));
  assert.equal(staleMigration.reason, 'bootstrap-revision-mismatch');
});

test('v5 runtime propagates configured bootstrap expectations through preview, migration preview, and apply', () => {
  const expectedRevision = '7cbdb78aac022386b17696f6930fe4f06d274fd1';
  const staleRevision = '460a2460e5e8eaebebd7d2dc4c9f8e4bec0dd125';
  const state = migrateState();
  const harness = trustHarness(state);
  const staleSnapshot = currentSnapshot(state, bootstrap(staleRevision));
  const staleRuntime = v5.createProgrammeRuntimeV5({
    store: v5.createMemoryDurableStore(), inspect_snapshot: () => staleSnapshot,
    scope_grant: harness.scope.grant, broker: harness.broker,
    expected_bootstrap_revision: expectedRevision, resolved_contract: resolvedContract(staleRevision),
  });
  const staleRuntimePreview = staleRuntime.preview({ desired: state, scope_grant: harness.scope.grant, broker: harness.broker });
  assert.equal(staleRuntimePreview.reason, 'v5-bootstrap-invalid-or-missing');
  assert.equal(staleRuntimePreview.detail, 'bootstrap-revision-mismatch');

  const exactSnapshot = currentSnapshot(state, bootstrap(expectedRevision));
  const exactContext = memoryReceiptContext(state, harness.scope.grant, {
    run_id: 'run-memory-runtime-expectation', allocation_id: 'allocation-memory-runtime-expectation',
  });
  const exactStore = v5.createMemoryDurableStore();
  const exactRuntime = v5.createProgrammeRuntimeV5({
    store: exactStore, inspect_snapshot: () => exactSnapshot,
    scope_grant: harness.scope.grant, broker: harness.broker,
    expected_bootstrap_revision: expectedRevision, resolved_contract: resolvedContract(expectedRevision),
  });
  const exactPreview = exactRuntime.preview({
    desired: state, scope_grant: harness.scope.grant, broker: harness.broker,
    resolved_contract: resolvedContract(expectedRevision), receipt_context: exactContext,
  });
  assert.equal(exactPreview.ok, true, JSON.stringify(exactPreview));
  const zeroSnapshot = { ...exactPreview.expected_snapshot, receipts: exactPreview.required_receipt_delta.chain };
  const zeroRuntime = v5.createProgrammeRuntimeV5({
    store: v5.createMemoryDurableStore({ receipts: exactPreview.required_receipt_delta.chain }),
    inspect_snapshot: () => zeroSnapshot, scope_grant: harness.scope.grant, broker: harness.broker,
    expected_bootstrap_revision: expectedRevision, resolved_contract: resolvedContract(expectedRevision),
  });
  const zeroPreview = zeroRuntime.preview({ desired: state, scope_grant: harness.scope.grant, broker: harness.broker, resolved_contract: resolvedContract(expectedRevision) });
  assert.equal(zeroPreview.code, 'PROGRAMME_ZERO_DELTA');
  assert.equal(zeroRuntime.preview({ desired: state, scope_grant: harness.scope.grant, broker: harness.broker, resolved_contract: resolvedContract(expectedRevision), expected_bootstrap_revision: expectedRevision }).ok, true);
  assert.equal(zeroRuntime.preview({ desired: state, scope_grant: harness.scope.grant, broker: harness.broker, resolved_contract: resolvedContract(expectedRevision), expected_bootstrap_revision: staleRevision }).reason, 'bootstrap-revision-conflict');
  const exactApply = zeroRuntime.apply({ preview: zeroPreview });
  assert.equal(exactApply.ok, true, JSON.stringify(exactApply));

  const migrationRuntime = v5.createProgrammeRuntimeV5({
    store: v5.createMemoryDurableStore(), inspect_snapshot: () => legacySnapshot(sourceState()),
    scope_grant: harness.scope.grant, broker: harness.broker,
    expected_bootstrap_revision: expectedRevision, resolved_contract: resolvedContract(staleRevision),
  });
  const staleMigration = migrationRuntime.migrationPreview({
    bootstrap_after: bootstrap(staleRevision), scope_grant: harness.scope.grant, broker: harness.broker,
  });
  assert.equal(staleMigration.ok, false, JSON.stringify(staleMigration));
  assert.equal(staleMigration.reason, 'bootstrap-revision-mismatch');
});

test('v5 derives terminal authority and recovery state from the durable chain', () => {
  const fixtureForTest = memoryPreviewFixture();
  const baseChain = fixtureForTest.preview.required_receipt_delta.chain;
  const executorTerminal = invalidatingReceipt(baseChain, 'EXECUTOR_TERMINAL');
  const durableTerminalChain = [...baseChain, executorTerminal];
  const terminalArgs = {
    receipts: durableTerminalChain, repository: fixtureForTest.state.repository, parent_issue: fixtureForTest.state.parent.issue,
    run_id: executorTerminal.run_id, allocation_id: executorTerminal.allocation_id,
    terminal: executorTerminal, terminal_persisted: true, now: '2026-09-07T01:00:00.000Z',
  };
  assert.equal(v5.canAdvanceFromTerminal(terminalArgs).ok, true);

  const fabricated = v5.createRunReceipt({
    ...executorTerminal, receipt_id: undefined, created_at: '2026-09-07T00:00:00.004Z',
  });
  assert.equal(v5.canAdvanceFromTerminal({ ...terminalArgs, terminal: fabricated }).reason, 'terminal-chain-mismatch');
  const postTerminal = v5.createRunReceipt({
    ...executorTerminal, receipt_type: 'TRANSITION_PREVIEW', receipt_id: undefined,
    sequence: executorTerminal.sequence + 1, prior_receipt_id: executorTerminal.receipt_id,
    payload: { classification: 'TRANSITION_PREVIEW' }, created_at: '2026-09-07T00:00:00.003Z',
  });
  assert.equal(v5.canAdvanceFromTerminal({ ...terminalArgs, receipts: [...durableTerminalChain, postTerminal], terminal: executorTerminal }).ok, false);
  assert.equal(v5.canAdvanceFromTerminal({ ...terminalArgs, repository: 'wrong/repository' }).ok, false);
  assert.equal(v5.canAdvanceFromTerminal({ ...terminalArgs, parent_issue: 241 }).ok, false);

  for (const receiptType of ['EXECUTOR_TERMINAL', 'RUN_INTERRUPTED']) {
    const terminal = invalidatingReceipt(baseChain, receiptType);
    const recovery = v5.recoverRun({
      receipts: [...baseChain, terminal], repository: fixtureForTest.state.repository,
      parent_issue: fixtureForTest.state.parent.issue, run_id: terminal.run_id,
      allocation_id: terminal.allocation_id, now: '2026-09-07T01:00:00.000Z',
    });
    assert.equal(recovery.ok, true, JSON.stringify(recovery));
    assert.notEqual(recovery.status, 'LOST');
    assert.equal(recovery.replay_allowed, false);
  }
  const g4Terminal = invalidatingReceipt(baseChain, 'G4_TERMINAL');
  const g4Recovery = v5.recoverRun({
    receipts: [...baseChain, g4Terminal], repository: fixtureForTest.state.repository,
    parent_issue: fixtureForTest.state.parent.issue, run_id: g4Terminal.run_id,
    allocation_id: g4Terminal.allocation_id, now: '2026-09-07T01:00:00.000Z',
  });
  assert.equal(g4Recovery.status, 'G4_UNADJUDICATED');
  assert.equal(g4Recovery.replay_allowed, false);
  const running = v5.recoverRun({
    receipts: baseChain, repository: fixtureForTest.state.repository,
    parent_issue: fixtureForTest.state.parent.issue, run_id: baseChain[0].run_id,
    allocation_id: baseChain[0].allocation_id, terminal: fabricated, now: '2026-09-07T01:00:00.000Z',
  });
  assert.equal(running.status, 'RUNNING');
  assert.equal(running.replay_allowed, false);
  const corrupt = JSON.parse(JSON.stringify(baseChain));
  corrupt[0].lock = 'corrupt-chain';
  assert.equal(v5.recoverRun({ receipts: corrupt }).ok, false);
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

test('v5 rejects well-formed receipt lookups bound to the wrong repository or parent', () => {
  const fixtureForTest = memoryPreviewFixture();
  const receipt = fixtureForTest.preview.required_receipt_delta.chain[0];
  const wrongRepository = v5.createRunReceipt({ ...receipt, repository: 'other-owner/other-repo' });
  const wrongParent = v5.createRunReceipt({ ...receipt, parent_issue: 241 });
  assert.equal(v5.validateReceiptObject(wrongRepository, {
    repository: fixtureForTest.state.repository, parent_issue: fixtureForTest.state.parent.issue,
  }).reason, 'receipt-repository-binding-mismatch');
  assert.equal(v5.validateReceiptObject(wrongParent, {
    repository: fixtureForTest.state.repository, parent_issue: fixtureForTest.state.parent.issue,
  }).reason, 'receipt-parent-binding-mismatch');
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

test('v5 enforces the active receipt fence before, at, and after the mutation boundary', () => {
  const now = '2026-09-07T01:00:00.000Z';
  const fixtureForTest = memoryPreviewFixture();
  let currentSnapshotValue = fixtureForTest.snapshot;
  let writerRequest;
  const runtime = v5.createProgrammeRuntimeV5({
    store: fixtureForTest.store,
    inspect_snapshot: () => currentSnapshotValue,
    scope_grant: fixtureForTest.harness.scope.grant,
    broker: fixtureForTest.harness.broker,
    now,
    resolved_contract: resolvedContract(fixtureForTest.snapshot.bootstrap.toolkit_contract.revision),
    verify_authority: () => ({ ok: true }),
    apply_operations: (request) => {
      writerRequest = request;
      currentSnapshotValue = fixtureForTest.preview.expected_snapshot;
      return {
        ok: true, preconditions_verified: true, precondition_digest: request.expected.precondition_digest,
        operation_binding_digest: request.operation_binding_digest, applied_count: request.operations.length,
      };
    },
  });
  const applied = runtime.apply({ preview: fixtureForTest.preview, now });
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(writerRequest.expected.active_receipt_fence.tip_receipt_id, fixtureForTest.preview.required_receipt_delta.receipt_id);
  assert.equal(writerRequest.expected.active_receipt_fence_digest, v5.digest(writerRequest.expected.active_receipt_fence));

  const boundary = memoryPreviewFixture();
  let boundaryWriterCalls = 0;
  let boundaryRejected = false;
  const boundaryResult = v5.createProgrammeRuntimeV5({
    store: boundary.store,
    inspect_snapshot: () => boundary.snapshot,
    scope_grant: boundary.harness.scope.grant,
    broker: boundary.harness.broker,
    now,
    resolved_contract: resolvedContract(boundary.snapshot.bootstrap.toolkit_contract.revision),
    verify_authority: () => ({ ok: true }),
    apply_operations: (request) => {
      boundaryWriterCalls += 1;
      boundary.store.appendReceipt(invalidatingReceipt(boundary.preview.required_receipt_delta.chain));
      const actual = boundary.store.readReceiptChain(boundary.preview.required_receipt_delta.receipt.run_id);
      boundaryRejected = v5.digest(actual) !== request.expected.active_receipt_fence.chain_digest;
      return boundaryRejected ? { ok: false, reason: 'writer-active-fence-mismatch' } : { ok: true };
    },
  }).apply({ preview: boundary.preview, now });
  assert.equal(boundaryRejected, true);
  assert.equal(boundaryResult.ok, false, JSON.stringify(boundaryResult));
  assert.equal(boundaryResult.reason, 'apply-failed');
  assert.equal(boundaryResult.writer_boundary_crossed, true);
  assert.equal(boundaryResult.mutation_outcome, 'UNKNOWN');
  assert.equal(boundaryResult.replay_allowed, false);
  assert.equal(boundaryResult.recovery_required, true);
  assert.equal(boundaryWriterCalls, 1);

  for (const receiptType of ['RUN_INTERRUPTED', 'EXECUTOR_TERMINAL', 'G4_TERMINAL']) {
    const invalidated = memoryPreviewFixture();
    invalidated.store.appendReceipt(invalidatingReceipt(invalidated.preview.required_receipt_delta.chain, receiptType));
    let calls = 0;
    const blocked = v5.createProgrammeRuntimeV5({
      store: invalidated.store,
      inspect_snapshot: () => invalidated.snapshot,
      scope_grant: invalidated.harness.scope.grant,
      broker: invalidated.harness.broker,
      now,
      resolved_contract: resolvedContract(invalidated.snapshot.bootstrap.toolkit_contract.revision),
      verify_authority: () => ({ ok: true }),
      apply_operations: () => { calls += 1; return { ok: true }; },
    }).apply({ preview: invalidated.preview, now });
    assert.equal(blocked.ok, false, JSON.stringify(blocked));
    assert.equal(blocked.reason, 'active-receipt-invalidated');
    assert.equal(calls, 0);
  }

  const expired = memoryPreviewFixture({ expires_at: '2026-09-07T00:30:00.000Z' });
  let expiredCalls = 0;
  const expiredResult = v5.createProgrammeRuntimeV5({
    store: expired.store,
    inspect_snapshot: () => expired.snapshot,
    scope_grant: expired.harness.scope.grant,
    broker: expired.harness.broker,
    now,
    resolved_contract: resolvedContract(expired.snapshot.bootstrap.toolkit_contract.revision),
    verify_authority: () => ({ ok: true }),
    apply_operations: () => { expiredCalls += 1; return { ok: true }; },
  }).apply({ preview: expired.preview, now });
  assert.equal(expiredResult.ok, false, JSON.stringify(expiredResult));
  assert.equal(expiredResult.reason, 'expired-fence');
  assert.equal(expiredCalls, 0);

  const movedDuringWriter = memoryPreviewFixture();
  let movedSnapshot = movedDuringWriter.snapshot;
  let movedWriterCalls = 0;
  const movedResult = v5.createProgrammeRuntimeV5({
    store: movedDuringWriter.store,
    inspect_snapshot: () => movedSnapshot,
    scope_grant: movedDuringWriter.harness.scope.grant,
    broker: movedDuringWriter.harness.broker,
    now,
    resolved_contract: resolvedContract(movedDuringWriter.snapshot.bootstrap.toolkit_contract.revision),
    verify_authority: () => ({ ok: true }),
    apply_operations: (request) => {
      movedWriterCalls += 1;
      movedDuringWriter.store.appendReceipt(invalidatingReceipt(movedDuringWriter.preview.required_receipt_delta.chain));
      movedSnapshot = movedDuringWriter.preview.expected_snapshot;
      return {
        ok: true, preconditions_verified: true, precondition_digest: request.expected.precondition_digest,
        operation_binding_digest: request.operation_binding_digest, applied_count: request.operations.length,
      };
    },
  }).apply({ preview: movedDuringWriter.preview, now });
  assert.equal(movedResult.ok, false, JSON.stringify(movedResult));
  assert.equal(movedResult.reason, 'active-receipt-invalidated');
  assert.equal(movedWriterCalls, 1);
  assert.equal(movedResult.writer_boundary_crossed, true);
  assert.equal(movedResult.mutation_outcome, 'UNKNOWN');
  assert.equal(movedResult.replay_allowed, false);
  assert.equal(movedResult.recovery_required, true);

  const movedAfterReadback = memoryPreviewFixture();
  let readbackSnapshot = movedAfterReadback.snapshot;
  let inspectCount = 0;
  let readbackWriterCalls = 0;
  const readbackResult = v5.createProgrammeRuntimeV5({
    store: movedAfterReadback.store,
    inspect_snapshot: () => {
      inspectCount += 1;
      if (inspectCount === 3) movedAfterReadback.store.appendReceipt(invalidatingReceipt(movedAfterReadback.preview.required_receipt_delta.chain));
      return readbackSnapshot;
    },
    scope_grant: movedAfterReadback.harness.scope.grant,
    broker: movedAfterReadback.harness.broker,
    now,
    resolved_contract: resolvedContract(movedAfterReadback.snapshot.bootstrap.toolkit_contract.revision),
    verify_authority: () => ({ ok: true }),
    apply_operations: (request) => {
      readbackWriterCalls += 1;
      readbackSnapshot = movedAfterReadback.preview.expected_snapshot;
      return {
        ok: true, preconditions_verified: true, precondition_digest: request.expected.precondition_digest,
        operation_binding_digest: request.operation_binding_digest, applied_count: request.operations.length,
      };
    },
  }).apply({ preview: movedAfterReadback.preview, now });
  assert.equal(readbackResult.ok, false, JSON.stringify(readbackResult));
  assert.equal(readbackResult.reason, 'active-receipt-invalidated');
  assert.equal(readbackWriterCalls, 1);
  assert.equal(readbackResult.writer_boundary_crossed, true);
  assert.equal(readbackResult.mutation_outcome, 'UNKNOWN');
  assert.equal(readbackResult.replay_allowed, false);
  assert.equal(readbackResult.recovery_required, true);
});

test('v5 validates referenced historical receipt runs independently from the active run chain', () => {
  const now = '2026-09-07T01:00:00.000Z';
  const runA = memoryPreviewFixture({ run_id: 'run-memory-a', allocation_id: 'allocation-memory-a' });
  let runASnapshot = runA.snapshot;
  const runAApply = v5.createProgrammeRuntimeV5({
    store: runA.store,
    inspect_snapshot: () => runASnapshot,
    scope_grant: runA.harness.scope.grant,
    broker: runA.harness.broker,
    now,
    resolved_contract: resolvedContract(runA.snapshot.bootstrap.toolkit_contract.revision),
    verify_authority: () => ({ ok: true }),
    apply_operations: (request) => {
      runASnapshot = runA.preview.expected_snapshot;
      return {
        ok: true, preconditions_verified: true, precondition_digest: request.expected.precondition_digest,
        operation_binding_digest: request.operation_binding_digest, applied_count: request.operations.length,
      };
    },
  }).apply({ preview: runA.preview, now });
  assert.equal(runAApply.ok, true, JSON.stringify(runAApply));
  const stateB = JSON.parse(JSON.stringify(runA.state));
  stateB.children[0].summary += ' Follow-up.';
  const harnessB = trustHarness(stateB);
  const snapshotA = { ...runASnapshot, receipts: runA.preview.required_receipt_delta.chain };
  const contextB = memoryReceiptContext(stateB, harnessB.scope.grant, {
    run_id: 'run-memory-b', allocation_id: 'allocation-memory-b', lease_id: 'lease-memory-b', fence_id: 'fence-memory-b',
  });
  const previewB = v5.buildConvergencePreviewV5({
    desired: stateB, snapshot: snapshotA, scope_grant: harnessB.scope.grant, broker: harnessB.broker,
    resolved_contract: resolvedContract(snapshotA.bootstrap.toolkit_contract.revision), receipt_context: contextB,
    authority_ref: contextB.authority_ref,
  });
  assert.equal(previewB.ok, true, JSON.stringify(previewB));
  const chainA = runA.preview.required_receipt_delta.chain;
  const chainB = previewB.required_receipt_delta.chain;

  function applyB(receipts, snapshotReceipts, adapter = {}) {
    const baseStore = v5.createMemoryDurableStore({ previews: [previewB], receipts });
    const readRuns = [];
    const readIds = [];
    const store = Object.freeze({
      ...baseStore,
      readReceiptById(receiptId) {
        readIds.push(receiptId);
        return typeof adapter.readReceiptById === 'function'
          ? adapter.readReceiptById(receiptId, baseStore)
          : baseStore.readReceiptById(receiptId);
      },
      readReceiptChain(runId) {
        readRuns.push(runId);
        return typeof adapter.readReceiptChain === 'function'
          ? adapter.readReceiptChain(runId, baseStore)
          : baseStore.readReceiptChain(runId);
      },
    });
    const locatorlessSnapshot = { ...snapshotA };
    if (snapshotReceipts === undefined) delete locatorlessSnapshot.receipts;
    else locatorlessSnapshot.receipts = snapshotReceipts;
    let current = locatorlessSnapshot;
    let writerCalls = 0;
    const result = v5.createProgrammeRuntimeV5({
      store,
      inspect_snapshot: () => current,
      scope_grant: harnessB.scope.grant,
      broker: harnessB.broker,
      now,
      resolved_contract: resolvedContract(snapshotA.bootstrap.toolkit_contract.revision),
      verify_authority: () => ({ ok: true }),
      apply_operations: (request) => {
        writerCalls += 1;
        current = previewB.expected_snapshot;
        return {
          ok: true, preconditions_verified: true, precondition_digest: request.expected.precondition_digest,
          operation_binding_digest: request.operation_binding_digest, applied_count: request.operations.length,
        };
      },
    }).apply({ preview: previewB, now });
    return { result, writerCalls, readRuns, readIds, locatorlessSnapshot };
  }

  const valid = applyB([...chainA, ...chainB]);
  assert.equal(valid.result.ok, true, JSON.stringify(valid.result));
  assert.equal(valid.writerCalls, 1);
  assert.equal(valid.readRuns.includes('run-memory-a'), true, JSON.stringify(valid.readRuns));
  const historicalIds = new Set(chainA.map((receipt) => receipt.receipt_id));
  const lookedUpHistoricalIds = new Set(valid.readIds);
  assert.deepEqual(lookedUpHistoricalIds, historicalIds);
  assert.equal(valid.readIds.filter((receiptId) => receiptId === chainA[0].receipt_id).length,
    valid.readIds.filter((receiptId) => receiptId === chainA[1].receipt_id).length);
  assert.equal(valid.readIds.filter((receiptId) => receiptId === chainA[0].receipt_id).length,
    valid.readRuns.filter((runId) => runId === 'run-memory-a').length);
  assert.equal('receipts' in valid.locatorlessSnapshot, false);

  const fakeSnapshotLocator = applyB([...chainA, ...chainB], chainB);
  assert.equal(fakeSnapshotLocator.result.ok, true, JSON.stringify(fakeSnapshotLocator.result));
  assert.equal(fakeSnapshotLocator.writerCalls, 1);
  assert.deepEqual(new Set(fakeSnapshotLocator.readIds), historicalIds);

  const absentFromDerivedChain = applyB([...chainA, ...chainB], undefined, {
    readReceiptChain(runId, baseStore) {
      const chain = baseStore.readReceiptChain(runId);
      return runId === 'run-memory-a' ? chain.slice(0, 1) : chain;
    },
  });
  assert.equal(absentFromDerivedChain.result.ok, false, JSON.stringify(absentFromDerivedChain.result));
  assert.equal(absentFromDerivedChain.result.reason, 'receipt-not-persisted');
  assert.equal(absentFromDerivedChain.writerCalls, 0);

  const missingHistorical = applyB(chainB);
  assert.equal(missingHistorical.result.ok, false, JSON.stringify(missingHistorical.result));
  assert.equal(missingHistorical.result.reason, 'GPR_RECEIPT_NOT_FOUND');
  assert.equal(missingHistorical.writerCalls, 0);

  const corruptHistorical = JSON.parse(JSON.stringify(chainA));
  corruptHistorical[0].lock = 'corrupt-history';
  const corrupted = applyB([...corruptHistorical, ...chainB]);
  assert.equal(corrupted.result.ok, false, JSON.stringify(corrupted.result));
  assert.equal(corrupted.writerCalls, 0);

  const missingActive = applyB(chainA);
  assert.equal(missingActive.result.ok, false, JSON.stringify(missingActive.result));
  assert.equal(missingActive.result.reason, 'active-receipt-chain-invalid');
  assert.equal(missingActive.writerCalls, 0);

  const unrelatedC = memoryReceiptContext(stateB, harnessB.scope.grant, {
    run_id: 'run-memory-c', allocation_id: 'allocation-memory-c', lease_id: 'lease-memory-c', fence_id: 'fence-memory-c',
  });
  const unrelated = applyB([...chainA, ...chainB, ...unrelatedC.started_chain]);
  assert.equal(unrelated.result.ok, true, JSON.stringify(unrelated.result));
  assert.equal(unrelated.writerCalls, 1);

});

test('v5 resolves a retained v3 event without snapshot locators through the real canonical SQLite store', async (t) => {
  const stateA = migrateState();
  const stateB = JSON.parse(JSON.stringify(stateA));
  stateB.children[0].summary += ' Historical transition.';
  const stateC = JSON.parse(JSON.stringify(stateB));
  stateC.children[0].summary += ' Active transition.';
  const harnessA = trustHarness(stateA);
  const harnessC = trustHarness(stateC);
  const root = stateRoot();
  const storeOptions = {
    repository: stateA.repository,
    parent_issue: stateA.parent.issue,
    child_issue: stateA.children[0].issue,
    stateRoot: root,
    repositoryRoot,
  };
  const authority = {
    child_comment_id: 5564753393,
    parent_comment_id: 5564754827,
    node_id: 'MDU6SXNzdWVDb21tZW50OjU1NjQ3NTMzOTM',
    author_login: 'weijunswj',
    author_association: 'OWNER',
    body_digest: '1'.repeat(64),
    updated_at: '2026-09-07T00:00:00.000Z',
    update_identity_digest: '2'.repeat(64),
    scope_digest: harnessA.scope.grant.scope_digest,
  };
  const start = {
    base_sha: BASE,
    head_sha: SHA,
    tree_sha: TREE,
    status_digest: DIGEST,
    clean_worktree: true,
    ref: { detached: false, name: 'codex/e3-canonical-historical-receipt-resolution-003' },
  };
  let store;
  try {
    store = receiptRuntime.createProgrammeReceiptStore(storeOptions);
    const sessionA = await store.startRun({
      lock: 'g3-real-history-lock', authority, start, candidate: null, lease_ms: 60000,
    }, {
      readAuthority: async () => ({ authority: structuredClone(authority), later_controlling_comments: [] }),
      readStart: async () => structuredClone(start),
    });
    const contextA = {
      authority_ref: 'github:issue:359:comment:5564753393',
      authority,
      start,
      lease: store.readReceiptChain(sessionA.run_id)[0].lease,
      run_id: sessionA.run_id,
      allocation_id: sessionA.allocation_id,
      child_issue: stateA.children[0].issue,
      started_chain: store.readReceiptChain(sessionA.run_id),
      transition_created_at: new Date().toISOString(),
    };
    const snapshotA = currentSnapshot(stateA, bootstrap());
    const previewA = v5.buildConvergencePreviewV5({
      desired: stateB,
      snapshot: snapshotA,
      scope_grant: harnessA.scope.grant,
      broker: harnessA.broker,
      resolved_contract: resolvedContract(snapshotA.bootstrap.toolkit_contract.revision),
      receipt_context: contextA,
      authority_ref: contextA.authority_ref,
    });
    assert.equal(previewA.ok, true, JSON.stringify(previewA));
    const transitionA = previewA.required_receipt_delta.receipt;
    const persistedA = store.appendReceipt(sessionA, {
      receipt_type: transitionA.receipt_type,
      candidate: transitionA.candidate,
      payload: transitionA.payload,
      created_at: transitionA.created_at,
    });
    assert.deepEqual(persistedA.receipt, transitionA);
    const persistedTerminal = store.appendReceipt(sessionA, {
      receipt_type: 'EXECUTOR_TERMINAL',
      payload: { classification: 'EXECUTOR_TERMINAL' },
      created_at: new Date().toISOString(),
    });
    const historicalChain = store.readReceiptChain(sessionA.run_id);
    const durableTerminal = historicalChain.at(-1);
    assert.equal(persistedTerminal.receipt.receipt_type, 'EXECUTOR_TERMINAL');
    assert.equal(persistedTerminal.receipt.receipt_id, durableTerminal.receipt_id);
    assert.equal(durableTerminal.receipt_type, 'EXECUTOR_TERMINAL');

    const sessionB = await store.startRun({
      lock: 'g3-real-active-lock', authority, start, candidate: null, lease_ms: 60000,
    }, {
      readAuthority: async () => ({ authority: structuredClone(authority), later_controlling_comments: [] }),
      readStart: async () => structuredClone(start),
    });
    const activeStartedChain = store.readReceiptChain(sessionB.run_id);
    const contextB = {
      authority_ref: contextA.authority_ref,
      authority: activeStartedChain[0].authority,
      start: activeStartedChain[0].start,
      lease: activeStartedChain[0].lease,
      run_id: sessionB.run_id,
      allocation_id: sessionB.allocation_id,
      child_issue: stateC.children[0].issue,
      started_chain: activeStartedChain,
      transition_created_at: new Date().toISOString(),
    };
    const snapshotB = { ...previewA.expected_snapshot, receipts: historicalChain };
    const previewB = v5.buildConvergencePreviewV5({
      desired: stateC,
      snapshot: snapshotB,
      scope_grant: harnessC.scope.grant,
      broker: harnessC.broker,
      resolved_contract: resolvedContract(snapshotB.bootstrap.toolkit_contract.revision),
      receipt_context: contextB,
      authority_ref: contextB.authority_ref,
    });
    assert.equal(previewB.ok, true, JSON.stringify(previewB));
    const transitionB = previewB.required_receipt_delta.receipt;
    const persistedB = store.appendReceipt(sessionB, {
      receipt_type: transitionB.receipt_type,
      candidate: transitionB.candidate,
      payload: transitionB.payload,
      created_at: transitionB.created_at,
    });
    assert.deepEqual(persistedB.receipt, transitionB);

    const lookupIds = [];
    const chainReads = [];
    const previewStore = v5.createMemoryDurableStore({ previews: [previewB] });
    const programmeStore = Object.freeze({
      ...previewStore,
      readReceiptById(receiptId) {
        lookupIds.push(receiptId);
        return store.readReceiptById(receiptId);
      },
      readReceiptChain(runId) {
        chainReads.push(runId);
        return store.readReceiptChain(runId);
      },
    });
    const locatorlessSnapshot = { ...snapshotB };
    delete locatorlessSnapshot.receipts;
    let current = locatorlessSnapshot;
    let writerCalls = 0;
    const result = v5.createProgrammeRuntimeV5({
      store: programmeStore,
      inspect_snapshot: () => current,
      scope_grant: harnessC.scope.grant,
      broker: harnessC.broker,
      now: new Date().toISOString(),
      resolved_contract: resolvedContract(snapshotB.bootstrap.toolkit_contract.revision),
      verify_authority: () => ({ ok: true }),
      apply_operations: (request) => {
        writerCalls += 1;
        current = previewB.expected_snapshot;
        return {
          ok: true,
          preconditions_verified: true,
          precondition_digest: request.expected.precondition_digest,
          operation_binding_digest: request.operation_binding_digest,
          applied_count: request.operations.length,
        };
      },
    }).apply({ preview: previewB });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(writerCalls, 1);
    assert.equal('receipts' in locatorlessSnapshot, false);
    const historicalIds = historicalChain
      .filter((receipt) => previewA.required_receipt_delta.chain.some((entry) => entry.receipt_id === receipt.receipt_id))
      .map((receipt) => receipt.receipt_id);
    assert.deepEqual(new Set(lookupIds), new Set(historicalIds));
    assert.equal(chainReads.includes(sessionA.run_id), true, JSON.stringify(chainReads));
    const managedEventsBeforeRecovery = JSON.stringify(current.managed_events);
    const recovery = v5.createProgrammeRuntimeV5({ store: programmeStore }).recover({ run_id: sessionA.run_id });
    assert.equal(recovery.ok, true, JSON.stringify(recovery));
    assert.equal(recovery.status, 'TERMINAL_UNCONSUMED');
    assert.equal(recovery.code, 'RECOVERY_TERMINAL_UNCONSUMED');
    assert.equal(recovery.terminal_persisted, true);
    assert.equal(recovery.durable_receipt_id, durableTerminal.receipt_id);
    assert.equal(recovery.durable_receipt_type, 'EXECUTOR_TERMINAL');
    assert.equal(recovery.replay_allowed, false);
    assert.equal(recovery.advances_state, false);
    assert.equal(writerCalls, 1);
    assert.equal(JSON.stringify(current.managed_events), managedEventsBeforeRecovery);
    assert.equal(JSON.stringify(current.managed_events[0]), JSON.stringify(previewA.expected_snapshot.managed_events[0]));
  } catch (error) {
    if (skipReceiptGuard(t, error)) return;
    throw error;
  }
});

test('v5 permits append-only A-to-B-to-A transitions while keeping immediate reruns zero-delta', () => {
  const stateA = migrateState();
  const harnessA = trustHarness(stateA);
  const snapshotA = currentSnapshot(stateA);
  const contextA = memoryReceiptContext(stateA, harnessA.scope.grant, {
    run_id: 'run-memory-transition-a', allocation_id: 'allocation-memory-transition-a',
  });
  const stateB = JSON.parse(JSON.stringify(stateA));
  stateB.children[0].summary += ' B';
  const harnessB = trustHarness(stateB);
  const previewAB = v5.buildConvergencePreviewV5({
    desired: stateB, snapshot: snapshotA, scope_grant: harnessB.scope.grant, broker: harnessB.broker,
    resolved_contract: resolvedContract(snapshotA.bootstrap.toolkit_contract.revision), receipt_context: contextA,
    authority_ref: contextA.authority_ref,
  });
  assert.equal(previewAB.ok, true, JSON.stringify(previewAB));
  const eventAB = previewAB.managed_event_delta.new_events[0];
  const chainA = previewAB.required_receipt_delta.chain;
  const contextB = memoryReceiptContext(stateB, harnessB.scope.grant, {
    run_id: 'run-memory-transition-b', allocation_id: 'allocation-memory-transition-b',
  });
  const snapshotB = { ...previewAB.expected_snapshot, receipts: chainA };
  const previewBA = v5.buildConvergencePreviewV5({
    desired: stateA, snapshot: snapshotB, scope_grant: harnessA.scope.grant, broker: harnessA.broker,
    resolved_contract: resolvedContract(snapshotB.bootstrap.toolkit_contract.revision), receipt_context: contextB,
    authority_ref: contextB.authority_ref,
  });
  assert.equal(previewBA.ok, true, JSON.stringify(previewBA));
  assert.equal(previewBA.managed_event_delta.new_events.length, 1);
  const eventBA = previewBA.managed_event_delta.new_events[0];
  assert.equal(eventBA.from_state_digest, v5.digest(stateB));
  assert.equal(eventBA.to_state_digest, v5.digest(stateA));
  assert.equal(eventBA.prior_event_id, eventAB.event_id);
  assert.notDeepEqual(eventBA, eventAB);
  assert.equal(previewBA.required_receipt_delta.receipt.run_id, 'run-memory-transition-b');

  const chainB = previewBA.required_receipt_delta.chain;
  const snapshotAtA = { ...previewBA.expected_snapshot, receipts: [...chainA, ...chainB] };
  const rerun = v5.buildConvergencePreviewV5({
    desired: stateA, snapshot: snapshotAtA, scope_grant: harnessA.scope.grant, broker: harnessA.broker,
    resolved_contract: resolvedContract(snapshotAtA.bootstrap.toolkit_contract.revision),
  });
  assert.equal(rerun.ok, true, JSON.stringify(rerun));
  assert.equal(rerun.code, 'PROGRAMME_ZERO_DELTA');
  assert.equal(rerun.operations.length, 0);
  assert.equal(rerun.managed_event_delta.new_events.length, 0);

  const contextC = memoryReceiptContext(stateB, harnessB.scope.grant, {
    run_id: 'run-memory-transition-c', allocation_id: 'allocation-memory-transition-c',
  });
  const previewABAgain = v5.buildConvergencePreviewV5({
    desired: stateB, snapshot: snapshotAtA, scope_grant: harnessB.scope.grant, broker: harnessB.broker,
    resolved_contract: resolvedContract(snapshotAtA.bootstrap.toolkit_contract.revision), receipt_context: contextC,
    authority_ref: contextC.authority_ref,
  });
  assert.equal(previewABAgain.ok, true, JSON.stringify(previewABAgain));
  const eventABAgain = previewABAgain.managed_event_delta.new_events[0];
  assert.equal(eventABAgain.from_state_digest, v5.digest(stateA));
  assert.equal(eventABAgain.to_state_digest, v5.digest(stateB));
  assert.equal(eventABAgain.prior_event_id, eventBA.event_id);
  assert.equal(previewABAgain.required_receipt_delta.receipt.run_id, 'run-memory-transition-c');
  const chainC = previewABAgain.required_receipt_delta.chain;
  assert.equal(new Set([...chainA, ...chainB, ...chainC].map((receipt) => receipt.receipt_id)).size,
    chainA.length + chainB.length + chainC.length);
  assert.deepEqual(previewABAgain.expected_snapshot.managed_events.slice(0, 2), previewBA.expected_snapshot.managed_events);
  assert.equal(v5.validateManagedEventInventoryV5(previewABAgain.expected_snapshot.managed_events, stateA.repository, {
    parent_issue: stateA.parent.issue, receipts: [...chainA, ...chainB, ...chainC],
  }).ok, true);
  const multiBaseStore = v5.createMemoryDurableStore({
    previews: [previewABAgain], receipts: [...chainA, ...chainB, ...chainC],
  });
  const multiReadIds = [];
  const multiReadRuns = [];
  const multiStore = Object.freeze({
    ...multiBaseStore,
    readReceiptById(receiptId) {
      multiReadIds.push(receiptId);
      return multiBaseStore.readReceiptById(receiptId);
    },
    readReceiptChain(runId) {
      multiReadRuns.push(runId);
      return multiBaseStore.readReceiptChain(runId);
    },
  });
  const locatorlessAtA = { ...snapshotAtA };
  delete locatorlessAtA.receipts;
  let multiCurrent = locatorlessAtA;
  let multiWriterCalls = 0;
  const multiApplied = v5.createProgrammeRuntimeV5({
    store: multiStore,
    inspect_snapshot: () => multiCurrent,
    scope_grant: harnessB.scope.grant,
    broker: harnessB.broker,
    resolved_contract: resolvedContract(snapshotAtA.bootstrap.toolkit_contract.revision),
    verify_authority: () => ({ ok: true }),
    apply_operations: (request) => {
      multiWriterCalls += 1;
      multiCurrent = previewABAgain.expected_snapshot;
      return {
        ok: true, preconditions_verified: true,
        precondition_digest: request.expected.precondition_digest,
        operation_binding_digest: request.operation_binding_digest,
        applied_count: request.operations.length,
      };
    },
  }).apply({ preview: previewABAgain });
  assert.equal(multiApplied.ok, true, JSON.stringify(multiApplied));
  assert.equal(multiWriterCalls, 1);
  assert.equal(multiReadRuns.includes('run-memory-transition-a'), true, JSON.stringify(multiReadRuns));
  assert.equal(multiReadRuns.includes('run-memory-transition-b'), true, JSON.stringify(multiReadRuns));
  assert.deepEqual(new Set(multiReadIds), new Set([...chainA, ...chainB].map((receipt) => receipt.receipt_id)));
  const snapshotAtB = { ...previewABAgain.expected_snapshot, receipts: [...chainA, ...chainB, ...chainC] };
  const immediateRerunAtB = v5.buildConvergencePreviewV5({
    desired: stateB, snapshot: snapshotAtB, scope_grant: harnessB.scope.grant, broker: harnessB.broker,
    resolved_contract: resolvedContract(snapshotAtB.bootstrap.toolkit_contract.revision),
  });
  assert.equal(immediateRerunAtB.ok, true, JSON.stringify(immediateRerunAtB));
  assert.equal(immediateRerunAtB.code, 'PROGRAMME_ZERO_DELTA');
  assert.equal(immediateRerunAtB.operations.length, 0);
});
