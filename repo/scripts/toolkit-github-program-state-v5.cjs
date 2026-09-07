'use strict';

// G3 Design A: v5 is the canonical programme controller surface.  v4 is
// imported only as the frozen predecessor/migration input.  Durable receipt
// storage remains owned by toolkit-github-program-receipt.cjs.
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const v4 = require('./toolkit-github-program-state-v4.cjs');
const receipts = require('./toolkit-github-program-receipt.cjs');
const SURFACE_CONTRACT = require('../contracts/github-program-reconciler/programme-surface-contract-v5.json');

const STATE_SCHEMA = 'toolkit.github-program.state.v5';
const PROJECTION_SCHEMA = 'toolkit.github-program.projection.v1';
const EXTENSIONS_SCHEMA = 'toolkit.github-program.extensions.v1';
const MANAGED_EVENT_SCHEMA = 'toolkit.github-program.managed-event.v3';
const RUN_RECEIPT_SCHEMA = 'toolkit.github-program.run-receipt.v1';
const BOOTSTRAP_SCHEMA = 'toolkit.github-program.controller-bootstrap.v1';
const MIGRATION_SCHEMA = 'toolkit.github-program.migration.v2';
const PREVIEW_SCHEMA = 'toolkit.github-program.preview.v5';
const DESIGN_LOCK = 'DL-S2-GITHUB-PROGRAM-SURFACE-RECOVERY-003';
const BOOTSTRAP_REVISION = '0'.repeat(40);
const TOOLKIT_CONTRACT_REPOSITORY = 'weijunswj/ai-agent-toolkit';
const TOOLKIT_CONTRACT_PATH = 'repo/contracts/github-program-reconciler/programme-surface-contract-v5.json';
const BOOTSTRAP_CONTRACTS = Object.freeze({
  state: 'repo/contracts/github-program-reconciler/programme-state-v5.schema.json',
  event: 'repo/contracts/github-program-reconciler/managed-event-v3.schema.json',
  receipt: 'repo/contracts/github-program-receipt/run-receipt-v1.schema.json',
  surface: TOOLKIT_CONTRACT_PATH,
  entrypoint: 'repo/contracts/github-program-reconciler/web-controller-entry.md',
});
const BODY_BUDGET_BYTES = 56 * 1024;
const CANONICAL_STATE_BUDGET_BYTES = 32 * 1024;
const TOTAL_PROJECTION_BUDGET_BYTES = 512 * 1024;
const RECEIPT_BUDGET_BYTES = 16 * 1024;
const LIFECYCLES = Object.freeze(['QUEUED', 'CURRENT', 'COMPLETED', 'RETIRED']);
const REGISTRY_STATUSES = Object.freeze(['ACTIVE', 'ACCEPTED', 'RETIRED']);
const LIVE_PR_LIFECYCLES = Object.freeze(['OPEN_DRAFT', 'OPEN_READY', 'MERGED', 'CLOSED_UNMERGED']);
const AUTHORITY_MODES = Object.freeze(['SINGLE_DEFAULT', 'EXPLICIT_BOUNDED']);
const GATE_STATES = Object.freeze(['ACTIVE', 'RESULT_RECORDED', 'WEB_DECISION_REQUIRED', 'AWAITING_FINALITY']);
const GATE_RESULTS = Object.freeze([null, 'AMEND', 'PASS']);
const PROGRAMME_STATES = Object.freeze(['HELD', 'WEB_DECISION_REQUIRED', 'ACTIVE', 'COMPLETE', 'IDLE']);
const TERMINAL_RECEIPT_TYPES = Object.freeze(['EXECUTOR_TERMINAL', 'G4_TERMINAL']);
const ACTIVE_RECEIPT_INVALIDATORS = Object.freeze([...TERMINAL_RECEIPT_TYPES, 'RUN_INTERRUPTED']);
const RECOVERY_STATUSES = Object.freeze([
  'RUNNING', 'LOST', 'TERMINAL_UNCONSUMED', 'PREVIEWED_NOT_APPLIED',
  'APPLIED_ACK_LOST', 'ALREADY_APPLIED', 'STALE_CANDIDATE',
  'CONFLICTING_TRANSITION', 'EXPIRED_FENCE', 'G4_UNADJUDICATED',
  'WEB_DECISION_REQUIRED',
]);
const RECEIPT_TYPES = Object.freeze(['RUN_STARTED', 'TRANSITION_PREVIEW', 'EXECUTOR_TERMINAL', 'G4_TERMINAL', 'RUN_INTERRUPTED']);
const MARKERS = Object.freeze({
  parent: Object.freeze({ begin: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PARENT:BEGIN v5 -->', end: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PARENT:END -->' }),
  child: Object.freeze({ begin: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-CHILD:BEGIN v5 -->', end: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-CHILD:END -->' }),
  pr: Object.freeze({ begin: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PR:BEGIN v5 -->', end: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PR:END -->' }),
});
const CANONICAL_OPERATION_CLASSES = Object.freeze([
  'migrate-parent-body', 'migrate-child-body', 'migrate-pr-body',
  'parent-body', 'child-body', 'pr-body', 'managed-event', 'labels', 'native-relationships',
]);
const STATE_LINE_PREFIX = '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-CANONICAL v5 ';
const PROJECTION_LINE_PREFIX = '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PROJECTION v1 ';
const LINE_SUFFIX = ' -->';
const SAFE_REPOSITORY = /^[^\r\n]{1,200}$/;

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hasOwn(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function canonicalJson(value) {
  const result = JSON.stringify(sortValue(value));
  return result === undefined ? 'undefined' : result;
}
function digest(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value), 'utf8').digest('hex');
}
function bytes(value) { return Buffer.byteLength(typeof value === 'string' ? value : canonicalJson(value), 'utf8'); }
function same(left, right) { return canonicalJson(left) === canonicalJson(right); }
function exactKeys(value, required, optional = []) {
  if (!isRecord(value) || required.some((key) => !hasOwn(value, key))) return false;
  const allowed = new Set(required.concat(optional));
  return Object.keys(value).every((key) => allowed.has(key));
}
function ok(code, extra = {}) { return { ok: true, code, ...extra }; }
function fail(reason, extra = {}) { return { ok: false, code: 'PARENT_RECONCILIATION_INCOMPLETE', reason, ...extra }; }
function issue(value) { return Number.isSafeInteger(value) && value > 0; }
function safeId(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
function safeLine(value, limit = 512) { return typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\r\n]/.test(value); }
function safeText(value, limit = 4096) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit
    && value.indexOf(String.fromCharCode(96).repeat(3)) === -1
    && !/(?:^|[\\/])(?:Users|home|private|secrets?)(?:[\\/]|$)|(?:token|password|secret|api[_-]?key)\s*[:=]/i.test(value);
}
function sha(value) { return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value); }
function sha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function arrayOf(value, predicate, max = 100) { return Array.isArray(value) && value.length <= max && value.every(predicate); }
function textArray(value, max = 50) { return arrayOf(value, (entry) => safeText(entry), max); }
function encode(value) { return Buffer.from(canonicalJson(value), 'utf8').toString('base64url'); }
function decode(value) { try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch (_) { return null; } }
function list(values) { return values.length ? values.map((value) => '- ' + value).join('\n') : 'None'; }
function markdownCell(value) { return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' '); }
function table(headers, rows) {
  if (!rows.length) return 'None';
  return ['| ' + headers.map(markdownCell).join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ')].concat(rows.map((row) => '| ' + row.map(markdownCell).join(' | ') + ' |')).join('\n');
}
function isoTimestamp(value) { return safeLine(value, 64) && Number.isFinite(Date.parse(value)); }
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
function evidenceMap(state) { return new Map((state.evidence_refs || []).map((entry) => [entry.id, entry])); }
function evidenceIsWeb(state, ref) { return ref === null || evidenceMap(state).get(ref)?.kind === 'WEB'; }
function blockingHolds(child) { return child.holds.filter((hold) => hold.kind === 'BLOCKING' && hold.active); }
function effectiveLifecycle(child) { return child.lifecycle === 'CURRENT' && blockingHolds(child).length ? 'BLOCKED' : child.lifecycle; }
function registryFor(state, prNumber) {
  for (const child of state.children) {
    const entry = child.pr_registry.find((item) => item.pr === prNumber);
    if (entry) return { child, registry: entry, epoch: child.epochs.find((epoch) => epoch.id === entry.epoch_id) };
  }
  return null;
}
function laneForChild(state, issueNumber) { return state.active_lanes.find((lane) => lane.child_issue === issueNumber) || null; }
function laneForPr(state, prNumber) { return state.active_lanes.find((lane) => lane.candidate?.pr === prNumber) || null; }
function activeRegistry(child) { return child.pr_registry.filter((entry) => entry.status === 'ACTIVE'); }

function validateEvidenceRefs(refs) {
  return Array.isArray(refs) && refs.length <= 200
    && refs.every((entry) => exactKeys(entry, ['id', 'kind', 'reference', 'summary'])
      && safeId(entry.id) && ['WEB', 'COMMIT', 'PR', 'CHECK', 'REVIEW', 'ISSUE', 'MIGRATION'].includes(entry.kind)
      && safeLine(entry.reference, 256) && safeLine(entry.summary, 512))
    && new Set(refs.map((entry) => entry.id)).size === refs.length;
}
function validateEpochs(child, state) {
  const evidenceIds = new Set(state.evidence_refs.map((entry) => entry.id));
  if (!Array.isArray(child.epochs) || child.epochs.length < 1 || child.epochs.length > 30) return false;
  const ids = new Set();
  for (const epoch of child.epochs) {
    if (!exactKeys(epoch, ['id', 'name', 'lock', 'purpose', 'gates', 'terminal_disposition', 'evidence_ref'])
      || !safeId(epoch.id) || ids.has(epoch.id) || !safeLine(epoch.name, 160) || !safeId(epoch.lock)
      || !safeText(epoch.purpose) || !arrayOf(epoch.gates, safeId, 30) || !epoch.gates.length
      || new Set(epoch.gates).size !== epoch.gates.length || ![null, 'ACCEPTED', 'RETIRED'].includes(epoch.terminal_disposition)
      || epoch.evidence_ref !== null && !evidenceIds.has(epoch.evidence_ref)) return false;
    if (epoch.terminal_disposition !== null && (!epoch.evidence_ref || !evidenceIsWeb(state, epoch.evidence_ref))) return false;
    ids.add(epoch.id);
  }
  return true;
}
function validateChildHolds(child, evidenceIds) {
  if (!Array.isArray(child.holds) || child.holds.length > 30) return false;
  const ids = new Set();
  for (const hold of child.holds) {
    if (!exactKeys(hold, ['id', 'kind', 'summary', 'evidence_ref', 'active'])
      || !safeId(hold.id) || ids.has(hold.id) || !['BLOCKING', 'INFORMATIONAL'].includes(hold.kind)
      || !safeText(hold.summary) || !evidenceIds.has(hold.evidence_ref) || typeof hold.active !== 'boolean') return false;
    ids.add(hold.id);
  }
  return true;
}
function validateRegistry(child, evidenceIds, epochIds, refs) {
  if (!Array.isArray(child.pr_registry) || child.pr_registry.length > 50) return false;
  const prs = new Set();
  for (const entry of child.pr_registry) {
    if (!exactKeys(entry, ['pr', 'status', 'role', 'completes_child', 'epoch_id', 'accepted_evidence_ref', 'retirement_evidence_ref'])
      || !issue(entry.pr) || prs.has(entry.pr) || !REGISTRY_STATUSES.includes(entry.status)
      || !['INTERMEDIATE', 'TERMINAL'].includes(entry.role) || typeof entry.completes_child !== 'boolean'
      || !epochIds.has(entry.epoch_id) || entry.role === 'INTERMEDIATE' && entry.completes_child
      || entry.accepted_evidence_ref !== null && !evidenceIds.has(entry.accepted_evidence_ref)
      || entry.retirement_evidence_ref !== null && !evidenceIds.has(entry.retirement_evidence_ref)) return false;
    if (entry.status === 'ACTIVE') refs.push(entry.pr);
    if (entry.status === 'ACCEPTED' && !entry.accepted_evidence_ref) return false;
    if (entry.status === 'RETIRED' && !entry.retirement_evidence_ref) return false;
    prs.add(entry.pr);
  }
  return true;
}
function candidateValid(candidate) {
  return exactKeys(candidate, ['pr', 'branch', 'base_ref', 'base_sha', 'head', 'tree', 'version', 'epoch_id'])
    && issue(candidate.pr) && safeLine(candidate.branch, 256) && safeLine(candidate.base_ref, 256)
    && sha(candidate.base_sha) && sha(candidate.head) && sha(candidate.tree) && safeLine(candidate.version, 80)
    && safeId(candidate.epoch_id);
}
function authorityDigest(authority) {
  return digest({ mode: authority.mode, max_active_lanes: authority.max_active_lanes, authority_ref: authority.authority_ref, permitted_child_issues: authority.permitted_child_issues });
}
function validateConcurrencyAuthority(authority, currentIssues = [], options = {}) {
  if (!exactKeys(authority, ['mode', 'max_active_lanes', 'authority_ref', 'authority_digest', 'permitted_child_issues'])
    || !AUTHORITY_MODES.includes(authority.mode) || !Number.isSafeInteger(authority.max_active_lanes)
    || authority.max_active_lanes < 1 || authority.max_active_lanes > 50
    || authority.authority_ref !== null && !safeLine(authority.authority_ref, 512)
    || authority.authority_digest !== null && !sha256(authority.authority_digest)
    || !arrayOf(authority.permitted_child_issues, issue, 50)
    || new Set(authority.permitted_child_issues).size !== authority.permitted_child_issues.length
    || authority.permitted_child_issues.some((entry, index, listValue) => index && listValue[index - 1] >= entry)) return fail('concurrency-authority-shape');
  if (authority.mode === 'SINGLE_DEFAULT') {
    if (authority.max_active_lanes !== 1 || authority.authority_ref !== null || authority.authority_digest !== null || authority.permitted_child_issues.length) return fail('single-default-authority-invalid');
  } else {
    if (authority.max_active_lanes < 2 || !authority.authority_ref || !authority.authority_digest || authority.authority_digest !== authorityDigest(authority)) return fail('explicit-bounded-authority-invalid');
    const known = new Set(options.childIssues || []);
    if (authority.permitted_child_issues.some((entry) => known.size && !known.has(entry))) return fail('explicit-bounded-child-not-in-programme');
    if (currentIssues.some((entry) => !authority.permitted_child_issues.includes(entry))) return fail('current-child-not-authorised');
  }
  if (currentIssues.length > authority.max_active_lanes) return fail('active-lane-bound-exceeded');
  if (currentIssues.length > 1 && authority.mode !== 'EXPLICIT_BOUNDED') return fail('unauthorized-multiple-current-children');
  return ok('CONCURRENCY_AUTHORITY_VALID', { authority_digest: authority.authority_digest || null });
}
function normalizeResource(resource) { return String(resource).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, ''); }
function resourcesOverlap(left, right) {
  const a = normalizeResource(left);
  const b = normalizeResource(right);
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}
function validateWorkClaims(input) {
  const lanes = Array.isArray(input) ? input : input?.lanes || input?.active_lanes || [];
  if (!Array.isArray(lanes)) return fail('work-claims-shape');
  const claims = [];
  for (const lane of lanes) {
    const laneId = lane?.lane_id || 'lane';
    const values = Array.isArray(lane) ? lane : lane.work_claims;
    if (!Array.isArray(values) || !values.length) return fail('work-claims-required', { lane_id: laneId });
    const seen = new Set();
    for (const claim of values) {
      if (!exactKeys(claim, ['mode', 'resource'], ['operation', 'scope']) || !['READ', 'WRITE'].includes(claim.mode)
        || !safeLine(claim.resource, 512) || claim.operation !== undefined && !safeId(claim.operation)
        || claim.scope !== undefined && !safeLine(claim.scope, 512)) return fail('work-claim-invalid', { lane_id: laneId });
      const resource = normalizeResource(claim.resource);
      const key = claim.mode + ':' + resource + ':' + (claim.operation || '') + ':' + (claim.scope || '');
      if (seen.has(key)) return fail('duplicate-work-claim', { lane_id: laneId, resource });
      seen.add(key);
      claims.push({ lane_id: laneId, mode: claim.mode, resource, operation: claim.operation, scope: claim.scope });
    }
  }
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex += 1) {
      const left = claims[leftIndex];
      const right = claims[rightIndex];
      if (left.lane_id === right.lane_id || !resourcesOverlap(left.resource, right.resource)) continue;
      if (left.mode === 'READ' && right.mode === 'READ') continue;
      return fail('work-claim-overlap', { left, right });
    }
  }
  return ok('WORK_CLAIMS_VALID', { claims });
}
function dependencyCycle(children) {
  const byIssue = new Map(children.map((child) => [child.issue, child]));
  const visiting = new Set();
  const visited = new Set();
  function visit(number) {
    if (visiting.has(number)) return true;
    if (visited.has(number)) return false;
    visiting.add(number);
    for (const dependency of byIssue.get(number).dependencies) if (visit(dependency)) return true;
    visiting.delete(number);
    visited.add(number);
    return false;
  }
  return children.some((child) => visit(child.issue));
}

function validateCanonicalStateV5(state) {
  const required = ['schema', 'design_lock', 'repository', 'parent', 'children', 'prs', 'concurrency_authority', 'active_lanes', 'predecessor_contract_digest', 'evidence_refs', 'historical_transitions', 'extensions'];
  if (!exactKeys(state, required) || state.schema !== STATE_SCHEMA || state.design_lock !== DESIGN_LOCK || !SAFE_REPOSITORY.test(state.repository)
    || !exactKeys(state.parent, ['issue', 'title', 'goal']) || !issue(state.parent.issue) || !safeLine(state.parent.title, 256)
    || !safeText(state.parent.goal) || !Array.isArray(state.children) || !state.children.length || state.children.length > 50
    || !Array.isArray(state.prs) || state.prs.length > 100 || !sha256(state.predecessor_contract_digest)
    || !validateEvidenceRefs(state.evidence_refs) || !Array.isArray(state.historical_transitions) || state.historical_transitions.length > 200
    || !Array.isArray(state.active_lanes) || state.active_lanes.length > 50) return fail('canonical-state-shape');
  const canonicalBytes = bytes(state);
  if (canonicalBytes > CANONICAL_STATE_BUDGET_BYTES) return fail('canonical-state-byte-budget-exceeded', { limit: CANONICAL_STATE_BUDGET_BYTES, actual: canonicalBytes });
  const evidenceIds = new Set(state.evidence_refs.map((entry) => entry.id));
  const childIssues = new Set();
  const registryRefs = new Map();
  const activeRegistryPrs = [];
  for (const child of state.children) {
    const childRequired = ['issue', 'order', 'title', 'summary', 'objective', 'deliverables', 'done_when', 'lifecycle', 'dependencies', 'scope', 'out_of_scope', 'boundaries', 'eli5', 'epochs', 'holds', 'pr_registry', 'finality'];
    if (!exactKeys(child, childRequired) || !issue(child.issue) || childIssues.has(child.issue)
      || !Number.isSafeInteger(child.order) || child.order < 1 || !safeLine(child.title, 256)
      || !safeText(child.summary) || !safeText(child.objective) || !textArray(child.deliverables) || !child.deliverables.length
      || !textArray(child.done_when) || !child.done_when.length || !LIFECYCLES.includes(child.lifecycle)
      || !arrayOf(child.dependencies, issue, 50) || new Set(child.dependencies).size !== child.dependencies.length
      || !textArray(child.scope) || !textArray(child.out_of_scope) || !textArray(child.boundaries) || !safeText(child.eli5)
      || !exactKeys(child.finality, ['state', 'authority_ref']) || !['HELD', 'READY_AUTHORIZED', 'MERGED', 'RETIRED'].includes(child.finality.state)
      || child.finality.authority_ref !== null && !evidenceIds.has(child.finality.authority_ref)
      || !validateEpochs(child, state) || !validateChildHolds(child, evidenceIds)) return fail('canonical-child-shape', { child: child?.issue });
    if (child.finality.authority_ref !== null && !evidenceIsWeb(state, child.finality.authority_ref)) return fail('finality-web-authority-required', { child: child.issue });
    const epochsTerminal = child.epochs.every((epoch) => ['ACCEPTED', 'RETIRED'].includes(epoch.terminal_disposition));
    if (child.lifecycle === 'COMPLETED' && (!epochsTerminal || blockingHolds(child).length
      || child.finality.state !== 'MERGED' || child.finality.authority_ref === null)) {
      return fail('completed-child-finality-incomplete', { child: child.issue });
    }
    const epochIds = new Set(child.epochs.map((epoch) => epoch.id));
    if (!validateRegistry(child, evidenceIds, epochIds, activeRegistryPrs)) return fail('canonical-registry-shape', { child: child.issue });
    if (child.lifecycle === 'COMPLETED' && !child.pr_registry.some((entry) => entry.role === 'TERMINAL'
      && entry.completes_child === true && entry.status === 'ACCEPTED'
      && entry.accepted_evidence_ref !== null && evidenceIds.has(entry.accepted_evidence_ref))) {
      return fail('completed-child-completing-pr-required', { child: child.issue });
    }
    childIssues.add(child.issue);
    for (const entry of child.pr_registry) {
      if (!registryRefs.has(entry.pr)) registryRefs.set(entry.pr, []);
      registryRefs.get(entry.pr).push({ child, entry });
    }
  }
  if (new Set(state.children.map((child) => child.order)).size !== state.children.length) return fail('duplicate-child-order');
  for (const child of state.children) {
    if (child.dependencies.some((dependency) => !childIssues.has(dependency) || dependency === child.issue)) return fail('dependency-outside-scope', { child: child.issue });
    if (child.lifecycle === 'CURRENT' && child.dependencies.some((dependency) => !['COMPLETED', 'RETIRED'].includes(state.children.find((entry) => entry.issue === dependency)?.lifecycle))) return fail('dependency-conflict', { child: child.issue });
    if (child.lifecycle === 'CURRENT' && ['MERGED', 'RETIRED'].includes(child.finality.state)) return fail('lifecycle-contradiction', { child: child.issue });
  }
  if (dependencyCycle(state.children)) return fail('dependency-cycle');
  const prNumbers = new Set();
  for (const pr of state.prs) {
    const prRequired = ['number', 'child_issue', 'summary', 'purpose', 'scope', 'out_of_scope', 'design_constraints', 'changed_surfaces', 'validation_requirements', 'evidence_refs', 'eli5'];
    if (!exactKeys(pr, prRequired) || !issue(pr.number) || prNumbers.has(pr.number) || !childIssues.has(pr.child_issue)
      || !safeText(pr.summary) || !safeText(pr.purpose) || !textArray(pr.scope) || !textArray(pr.out_of_scope)
      || !textArray(pr.design_constraints) || !arrayOf(pr.changed_surfaces, (entry) => safeLine(entry, 512), 100)
      || !textArray(pr.validation_requirements) || !pr.validation_requirements.length || !arrayOf(pr.evidence_refs, safeId, 50)
      || new Set(pr.evidence_refs).size !== pr.evidence_refs.length || pr.evidence_refs.some((ref) => !evidenceIds.has(ref))
      || !safeText(pr.eli5)) return fail('canonical-pr-shape', { pr: pr?.number });
    if (!registryRefs.has(pr.number) || registryRefs.get(pr.number).length !== 1) return fail('pr-registry-binding-invalid', { pr: pr.number });
    if (registryRefs.get(pr.number)[0].child.issue !== pr.child_issue) return fail('pr-child-binding-invalid', { pr: pr.number });
    prNumbers.add(pr.number);
  }
  for (const [pr, bindings] of registryRefs) if (!prNumbers.has(pr) || bindings.length !== 1) return fail('registry-pr-outside-scope', { pr });
  const current = state.children.filter((child) => child.lifecycle === 'CURRENT');
  const authority = validateConcurrencyAuthority(state.concurrency_authority, current.map((child) => child.issue), { childIssues: [...childIssues] });
  if (!authority.ok) return authority;
  const lanesSorted = state.active_lanes.slice().sort((left, right) => left.lane_id.localeCompare(right.lane_id));
  if (!same(state.active_lanes.map((lane) => lane.lane_id), lanesSorted.map((lane) => lane.lane_id))) return fail('active-lane-order-invalid');
  const laneIds = new Set();
  const laneChildren = new Set();
  const candidateKeys = new Set();
  for (const lane of state.active_lanes) {
    if (!exactKeys(lane, ['lane_id', 'child_issue', 'epoch_id', 'gate', 'gate_state', 'gate_result', 'candidate', 'work_claims'])
      || !safeId(lane.lane_id) || laneIds.has(lane.lane_id) || !issue(lane.child_issue) || !childIssues.has(lane.child_issue)
      || laneChildren.has(lane.child_issue) || !safeId(lane.epoch_id) || !safeId(lane.gate) || !GATE_STATES.includes(lane.gate_state)
      || !GATE_RESULTS.includes(lane.gate_result) || lane.gate_state === 'ACTIVE' && lane.gate_result !== null
      || ['RESULT_RECORDED', 'WEB_DECISION_REQUIRED', 'AWAITING_FINALITY'].includes(lane.gate_state) && lane.gate_result === null
      || lane.candidate !== null && !candidateValid(lane.candidate) || !Array.isArray(lane.work_claims) || !lane.work_claims.length) return fail('canonical-lane-shape', { lane: lane?.lane_id });
    const child = state.children.find((entry) => entry.issue === lane.child_issue);
    const epoch = child.epochs.find((entry) => entry.id === lane.epoch_id);
    if (!epoch || !epoch.gates.includes(lane.gate) || child.lifecycle !== 'CURRENT') return fail('lane-child-epoch-gate-binding-invalid', { lane: lane.lane_id });
    const active = activeRegistry(child);
    if (active.length > 0 && (!lane.candidate || active.length !== 1 || lane.candidate.pr !== active[0].pr || lane.candidate.epoch_id !== lane.epoch_id)) return fail('lane-candidate-binding-invalid', { lane: lane.lane_id });
    if (lane.candidate) {
      const binding = registryRefs.get(lane.candidate.pr);
      if (!binding || binding.length !== 1 || binding[0].child.issue !== lane.child_issue || binding[0].entry.status !== 'ACTIVE' || binding[0].entry.epoch_id !== lane.epoch_id) return fail('lane-candidate-registry-mismatch', { lane: lane.lane_id });
      const key = digest(lane.candidate);
      if (candidateKeys.has(key) || candidateKeys.has(String(lane.candidate.pr)) || candidateKeys.has(lane.candidate.head) || candidateKeys.has(lane.candidate.tree)) return fail('duplicate-lane-candidate', { lane: lane.lane_id });
      candidateKeys.add(key);
      candidateKeys.add(String(lane.candidate.pr));
      candidateKeys.add(lane.candidate.head);
      candidateKeys.add(lane.candidate.tree);
    }
    laneIds.add(lane.lane_id);
    laneChildren.add(lane.child_issue);
  }
  if (!same([...laneChildren].sort((a, b) => a - b), current.map((child) => child.issue).sort((a, b) => a - b))) return fail('current-child-lane-set-mismatch');
  const claims = validateWorkClaims(state.active_lanes);
  if (!claims.ok) return claims;
  for (const transition of state.historical_transitions) {
    if (!exactKeys(transition, ['id', 'child_issue', 'epoch_id', 'gate', 'disposition', 'evidence_ref'])
      || !safeId(transition.id) || !childIssues.has(transition.child_issue) || !safeId(transition.epoch_id)
      || !safeId(transition.gate) || !['ACCEPTED', 'AMEND', 'PASS', 'RETIRED'].includes(transition.disposition)
      || !evidenceIds.has(transition.evidence_ref) || !evidenceIsWeb(state, transition.evidence_ref)) return fail('historical-transition-invalid');
  }
  if (new Set(state.historical_transitions.map((entry) => entry.id)).size !== state.historical_transitions.length) return fail('duplicate-historical-transition');
  const extensions = v4.validateExtensionsV1(state.extensions, state);
  if (!extensions.ok) return extensions;
  return ok('PROGRAMME_STATE_V5_VALID', { canonical_digest: digest(state), canonical_bytes: canonicalBytes, active_lane_count: state.active_lanes.length });
}

function extensionDigest(state) { return digest(state.extensions || []); }
function childProgress(state, child) {
  const lane = laneForChild(state, child.issue);
  const values = child.epochs.map((epoch) => {
    if (epoch.terminal_disposition) return epoch.id + ': ' + epoch.terminal_disposition;
    if (lane?.epoch_id === epoch.id) return epoch.id + ': ' + lane.gate + ' ' + lane.gate_state + (lane.gate_result ? ' (' + lane.gate_result + ')' : '');
    return epoch.id + ': PENDING';
  });
  if (blockingHolds(child).length) values.push('Blocking holds: ' + blockingHolds(child).length);
  return values;
}
function childAchieved(state, child) {
  return child.epochs.filter((epoch) => epoch.terminal_disposition !== null).map((epoch) => epoch.id + ' ' + epoch.terminal_disposition)
    .concat(state.historical_transitions.filter((entry) => entry.child_issue === child.issue).map((entry) => entry.epoch_id + ' ' + entry.gate + ' ' + entry.disposition));
}
function childRemaining(state, child) {
  if (['COMPLETED', 'RETIRED'].includes(child.lifecycle)) return [];
  const lane = laneForChild(state, child.issue);
  const values = [];
  for (const epoch of child.epochs.filter((entry) => entry.terminal_disposition === null)) {
    const index = lane?.epoch_id === epoch.id ? epoch.gates.indexOf(lane.gate) : -1;
    values.push(...(index >= 0 ? epoch.gates.slice(index) : epoch.gates).map((gate) => epoch.id + ' ' + gate));
  }
  values.push(child.finality.state === 'READY_AUTHORIZED' ? 'Separately authorised finality action' : 'Web finality disposition');
  return values;
}
function currentOutcome(state, child) {
  const lane = laneForChild(state, child.issue);
  if (blockingHolds(child).length) return child.title + ' is blocked by ' + blockingHolds(child).length + ' authoritative hold(s).';
  if (child.lifecycle === 'QUEUED') return child.title + ' is queued behind its declared dependencies.';
  if (child.lifecycle === 'COMPLETED') return child.title + ' is completed with retained evidence.';
  if (child.lifecycle === 'RETIRED') return child.title + ' is retired with retained evidence.';
  if (lane?.gate_state === 'WEB_DECISION_REQUIRED') return child.title + ' has a recorded result awaiting Web decision.';
  if (lane?.gate_state === 'AWAITING_FINALITY') return child.title + ' is awaiting separately authorised finality.';
  if (lane) return child.title + ' is current in ' + lane.epoch_id + ' at ' + lane.gate + (lane.gate_state === 'RESULT_RECORDED' ? ' with ' + lane.gate_result + ' recorded' : '') + '.';
  return child.title + ' is current but has no active lane.';
}
function nextAction(state, child) {
  if (blockingHolds(child).length) return 'Resolve authoritative hold ' + blockingHolds(child)[0].id + '.';
  if (child.lifecycle === 'QUEUED') return 'Wait until dependencies are completed or retired.';
  if (child.lifecycle === 'COMPLETED' || child.lifecycle === 'RETIRED') return 'No delivery action remains.';
  const lane = laneForChild(state, child.issue);
  if (lane) {
    if (['RESULT_RECORDED', 'WEB_DECISION_REQUIRED'].includes(lane.gate_state)) return 'Obtain Web disposition for ' + lane.epoch_id + ' ' + lane.gate + '.';
    if (lane.gate_state === 'AWAITING_FINALITY') return 'Await separately authorised finality for ' + lane.epoch_id + '.';
    return 'Complete ' + lane.epoch_id + ' ' + lane.gate + ' without advancing finality.';
  }
  return child.finality.state === 'READY_AUTHORIZED' ? 'Await the separately authorised finality action.' : 'Obtain explicit Web finality authority.';
}
function materialHoldSummary(child) {
  const holds = blockingHolds(child);
  return holds.length ? holds.map((hold) => hold.id + ': ' + hold.summary).join('; ') : 'None';
}
function programmeFinalityState(state) {
  const relevant = state.active_lanes.length
    ? state.active_lanes.map((lane) => state.children.find((child) => child.issue === lane.child_issue)).filter(Boolean)
    : state.children.filter((child) => ['COMPLETED', 'RETIRED'].includes(child.lifecycle));
  if (!relevant.length) return 'HELD';
  if (relevant.some((child) => child.finality.state === 'HELD')) return 'HELD';
  if (relevant.some((child) => child.finality.state === 'READY_AUTHORIZED')) return 'READY_AUTHORIZED';
  if (relevant.every((child) => child.finality.state === 'MERGED')) return 'MERGED';
  if (relevant.every((child) => child.finality.state === 'RETIRED')) return 'RETIRED';
  return 'HELD';
}
function progressMetrics(state) {
  const totalEpochs = state.children.reduce((total, child) => total + child.epochs.length, 0);
  const accepted = state.children.reduce((total, child) => total + child.epochs.filter((epoch) => ['ACCEPTED', 'RETIRED'].includes(epoch.terminal_disposition)).length, 0);
  return {
    completed_children: { completed: state.children.filter((child) => child.lifecycle === 'COMPLETED').length, total: state.children.length },
    retired_children: state.children.filter((child) => child.lifecycle === 'RETIRED').length,
    accepted_or_retired_epochs: { accepted_or_retired: accepted, total: totalEpochs },
    active_lanes: state.active_lanes.length,
    web_decision_required_lanes: state.active_lanes.filter((lane) => lane.gate_state === 'WEB_DECISION_REQUIRED').length,
  };
}
function aggregateProgrammeState(state, activeWork, holds) {
  if (holds.length || activeWork.some((lane) => lane.finality_state === 'HELD')) return 'HELD';
  if (activeWork.some((lane) => lane.gate_state === 'WEB_DECISION_REQUIRED')) return 'WEB_DECISION_REQUIRED';
  if (activeWork.length) return 'ACTIVE';
  if (state.children.length && state.children.every((child) => ['COMPLETED', 'RETIRED'].includes(child.lifecycle))) return 'COMPLETE';
  return 'IDLE';
}
function renderExtensions(extensions, target) {
  const selected = (extensions || []).filter((entry) => same(entry.target, target));
  if (!selected.length) return 'None';
  return selected.map((entry) => {
    if (entry.class === 'TABLE') return '### ' + entry.title + '\n' + table(entry.payload.columns, entry.payload.rows);
    const value = entry.payload.text || entry.payload.summary || entry.payload.domain + ': ' + entry.payload.status + ' - ' + entry.payload.summary;
    return '### ' + entry.title + '\n' + value + (entry.payload.references?.length ? '\n' + list(entry.payload.references) : '');
  }).join('\n\n');
}
function deriveProjectionV5(state) {
  const valid = validateCanonicalStateV5(state);
  if (!valid.ok) return valid;
  const children = state.children.slice().sort((left, right) => left.order - right.order).map((child) => {
    const lane = laneForChild(state, child.issue);
    const epoch = lane ? child.epochs.find((entry) => entry.id === lane.epoch_id) : null;
    return {
      issue: child.issue, parent_issue: state.parent.issue, title: child.title, lifecycle: effectiveLifecycle(child), summary: child.summary,
      operating_contract: { parent_issue: state.parent.issue, lane_id: lane?.lane_id || null, epoch_id: lane?.epoch_id || null, gate: lane?.gate || null, gate_state: lane?.gate_state || null, gate_result: lane?.gate_result || null, lock: epoch?.lock || null },
      objective: child.objective, deliverables: clone(child.deliverables), done_when: clone(child.done_when), scope: clone(child.scope), out_of_scope: clone(child.out_of_scope), boundaries: clone(child.boundaries), dependencies: clone(child.dependencies),
      current_epoch: lane?.epoch_id || null, current_gate: lane?.gate || null, gate_status: lane?.gate_state || null, progress: childProgress(state, child), achieved: childAchieved(state, child), remaining: childRemaining(state, child),
      epochs: child.epochs.map((entry) => ({ id: entry.id, name: entry.name, lock: entry.lock, purpose: entry.purpose, state: entry.terminal_disposition || (lane?.epoch_id === entry.id ? lane.gate_state : 'PENDING') })),
      holds: clone(child.holds), pr_registry: clone(child.pr_registry), finality: clone(child.finality), outcome: currentOutcome(state, child), next_action: nextAction(state, child), eli5: child.eli5,
    };
  });
  const prs = state.prs.slice().sort((left, right) => left.number - right.number).map((pr) => {
    const binding = registryFor(state, pr.number);
    const lane = laneForPr(state, pr.number);
    const epoch = binding?.child.epochs.find((entry) => entry.id === binding.registry.epoch_id);
    return {
      number: pr.number, parent_issue: state.parent.issue, child_issue: pr.child_issue, summary: pr.summary, purpose: pr.purpose, scope: clone(pr.scope), out_of_scope: clone(pr.out_of_scope),
      design_constraints: clone(pr.design_constraints), changed_surfaces: clone(pr.changed_surfaces), validation_requirements: clone(pr.validation_requirements), evidence_refs: clone(pr.evidence_refs), eli5: pr.eli5,
      registry_status: binding.registry.status, role: binding.registry.role, completes_child: binding.registry.completes_child, epoch: epoch.id, lock: epoch.lock, candidate: lane?.candidate ? clone(lane.candidate) : null,
      progress: childProgress(state, binding.child), achieved: childAchieved(state, binding.child), remaining: childRemaining(state, binding.child),
      outcome: binding.registry.status === 'ACTIVE' ? (binding.registry.role === 'INTERMEDIATE' ? 'Intermediate' : 'Terminal') + ' candidate #' + pr.number + ' is active for ' + epoch.id + '; ' + currentOutcome(state, binding.child) : 'PR #' + pr.number + ' is ' + binding.registry.status.toLowerCase() + ' with retained evidence.',
      finality: binding.child.finality.state, next_action: nextAction(state, binding.child),
    };
  });
  const majorHolds = children.flatMap((child) => child.holds.filter((hold) => hold.kind === 'BLOCKING' && hold.active).map((hold) => '#' + child.issue + ' ' + hold.id + ': ' + hold.summary));
  const activeWork = state.active_lanes.map((lane) => {
    const child = state.children.find((entry) => entry.issue === lane.child_issue);
    const activePr = activeRegistry(child)[0]?.pr || null;
    return {
      lane_id: lane.lane_id, child_issue: lane.child_issue, child_title: child.title, epoch_id: lane.epoch_id, gate: lane.gate,
      epoch_gate: lane.epoch_id + ' / ' + lane.gate, gate_state: lane.gate_state, state: lane.gate_state, gate_result: lane.gate_result,
      candidate: lane.candidate ? clone(lane.candidate) : null,
      candidate_pr: lane.candidate ? 'PR #' + lane.candidate.pr + ' @ ' + lane.candidate.head : activePr ? 'PR #' + activePr + ' (exact candidate unavailable)' : 'None',
      material_hold: materialHoldSummary(child), finality_state: child.finality.state, work_claims: clone(lane.work_claims), outcome: currentOutcome(state, child),
    };
  });
  const aggregateState = aggregateProgrammeState(state, activeWork, majorHolds);
  const parent = {
    issue: state.parent.issue, title: state.parent.title, goal: state.parent.goal, status: aggregateState, aggregate_state: aggregateState,
    concurrency_mode: state.concurrency_authority.mode, active_lane_count: activeWork.length, max_active_lanes: state.concurrency_authority.max_active_lanes,
    current_child_ids: activeWork.map((entry) => entry.child_issue), programme_finality_state: programmeFinalityState(state),
    outcome: activeWork.length ? activeWork.map((entry) => entry.outcome).join(' ') : aggregateState === 'COMPLETE' ? 'All programme children are complete or retired.' : 'No child is currently executing.',
    active_work: activeWork, child_graph: children.map((child) => ({ issue: child.issue, title: child.title, lifecycle: child.lifecycle, dependencies: clone(child.dependencies), outcome: child.outcome })),
    progress: progressMetrics(state), progress_lines: children.map((child) => '#' + child.issue + ': ' + child.outcome), major_holds: majorHolds,
  };
  return ok('PROGRAMME_PROJECTION_V5_DERIVED', { projection: { schema: PROJECTION_SCHEMA, repository: state.repository, canonical_digest: valid.canonical_digest, extension_digest: extensionDigest(state), parent, children, prs, extensions: clone(state.extensions || []) } });
}
function projectionEnvelope(state, projection, kind, number, data) {
  return { schema: PROJECTION_SCHEMA, repository: state.repository, parent_issue: state.parent.issue, kind, number, canonical_digest: projection.canonical_digest, projection_digest: digest(data), extension_digest: projection.extension_digest };
}
function wrap(kind, lines, envelope, state) {
  const hidden = state ? STATE_LINE_PREFIX + encode({ state, envelope }) + LINE_SUFFIX : PROJECTION_LINE_PREFIX + encode(envelope) + LINE_SUFFIX;
  return [MARKERS[kind].begin].concat(lines, ['', hidden, MARKERS[kind].end]).join('\n');
}
function renderProgrammeV5(state) {
  const derived = deriveProjectionV5(state);
  if (!derived.ok) return derived;
  const projection = derived.projection;
  const parent = projection.parent;
  const bodies = { parent: wrap('parent', [
    '# Programme dashboard', '', '## Goal', parent.goal, '', '## Programme status',
    table(['Field', 'Value'], [['Aggregate programme state', parent.aggregate_state], ['Concurrency mode', parent.concurrency_mode], ['Active lanes', parent.active_lane_count], ['Max lanes', parent.max_active_lanes], ['Current child IDs', parent.current_child_ids.length ? parent.current_child_ids.map((number) => '#' + number).join(', ') : 'None'], ['Programme finality state', parent.programme_finality_state]]),
    '', '## Active work', table(['Child', 'State', 'Epoch / Gate', 'Candidate / PR', 'Material hold'], parent.active_work.map((lane) => ['#' + lane.child_issue + ' - ' + lane.child_title, lane.state, lane.epoch_gate, lane.candidate_pr, lane.material_hold])),
    '', '## Children', table(['Child', 'Lifecycle', 'Dependencies', 'Outcome'], parent.child_graph.map((entry) => ['#' + entry.issue + ' - ' + entry.title, entry.lifecycle, entry.dependencies.length ? entry.dependencies.map((number) => '#' + number).join(', ') : 'None', entry.outcome])),
    '', '## Progress', table(['Metric', 'Value'], [['Completed children / total', parent.progress.completed_children.completed + ' / ' + parent.progress.completed_children.total], ['Retired children', parent.progress.retired_children], ['Accepted or retired epochs / total', parent.progress.accepted_or_retired_epochs.accepted_or_retired + ' / ' + parent.progress.accepted_or_retired_epochs.total], ['Active lanes', parent.progress.active_lanes], ['Web-decision-required lanes', parent.progress.web_decision_required_lanes]]),
    '', '## Major holds', list(parent.major_holds), '', '## Additional context', renderExtensions(projection.extensions, { kind: 'parent', number: state.parent.issue }),
  ], projectionEnvelope(state, projection, 'parent', state.parent.issue, parent), state), children: {}, prs: {} };
  for (const child of projection.children) {
    const envelope = projectionEnvelope(state, projection, 'child', child.issue, child);
    bodies.children[String(child.issue)] = wrap('child', [
      '# ' + child.title, '', '## Summary', child.summary, '', '## Operating contract',
      table(['Field', 'Value'], [['Parent', '#' + child.operating_contract.parent_issue], ['Lane', child.operating_contract.lane_id || 'None'], ['Lifecycle', child.lifecycle], ['Epoch', child.operating_contract.epoch_id || 'None'], ['Gate', child.operating_contract.gate || 'None'], ['Gate state', child.operating_contract.gate_state || 'None'], ['Lock', child.operating_contract.lock || 'None'], ['Finality', child.finality.state]]),
      '', '## Objective', child.objective, '', '## Deliverables', list(child.deliverables), '', '## Done when', list(child.done_when), '', '## Scope', list(child.scope), '', '## Out of scope', list(child.out_of_scope), '', '## Progress', list(child.progress), '', '## Achieved', list(child.achieved), '', '## Remaining', list(child.remaining),
      '', '## Epochs / Locks', table(['Epoch', 'Lock', 'State', 'Purpose'], child.epochs.map((epoch) => [epoch.id, epoch.lock, epoch.state, epoch.purpose])), '', '## PR registry', table(['PR', 'Status', 'Role', 'Completes Child'], child.pr_registry.map((entry) => ['#' + entry.pr, entry.status, entry.role, entry.completes_child ? 'Yes' : 'No'])), '', '## Holds', list(child.holds.filter((hold) => hold.active).map((hold) => hold.kind + ' ' + hold.id + ': ' + hold.summary)), '', '## Boundaries', list(child.boundaries), '', '## Next action', child.next_action, '', '## ELI5', child.eli5, '', '## Additional context', renderExtensions(projection.extensions, { kind: 'child', number: child.issue }),
    ], envelope);
  }
  for (const pr of projection.prs) {
    const envelope = projectionEnvelope(state, projection, 'pr', pr.number, pr);
    bodies.prs[String(pr.number)] = wrap('pr', [
      '# Programme lane for PR #' + pr.number, '', '## Summary', pr.summary, '', '## Binding',
      table(['Field', 'Value'], [['Parent', '#' + pr.parent_issue], ['Child', '#' + pr.child_issue], ['Registry', pr.registry_status], ['Role', pr.role], ['Completes Child', pr.completes_child ? 'Yes' : 'No'], ['Epoch / Lock', pr.epoch + ' / ' + pr.lock], ['Finality', pr.finality]]), '', '## Exact candidate',
      pr.candidate ? table(['PR', 'Branch', 'Base ref', 'Base SHA', 'Head', 'Tree', 'Version', 'Epoch'], [['#' + pr.candidate.pr, pr.candidate.branch, pr.candidate.base_ref, pr.candidate.base_sha, pr.candidate.head, pr.candidate.tree, pr.candidate.version, pr.candidate.epoch_id]]) : 'None',
      '', '## Purpose', pr.purpose, '', '## Scope', list(pr.scope), '', '## Out of scope', list(pr.out_of_scope), '', '## Progress', list(pr.progress), '', '## Achieved', list(pr.achieved), '', '## Remaining', list(pr.remaining), '', '## Changed surfaces', list(pr.changed_surfaces), '', '## Validation / evidence', list(pr.validation_requirements.concat(pr.evidence_refs.map((ref) => 'Evidence: ' + ref))), '', '## Design constraints', list(pr.design_constraints), '', '## Finality', pr.finality, '', '## ELI5', pr.eli5, '', '## Additional context', renderExtensions(projection.extensions, { kind: 'pr', number: pr.number }),
    ], envelope);
  }
  let total = 0;
  for (const group of [['parent', { [state.parent.issue]: bodies.parent }], ['child', bodies.children], ['pr', bodies.prs]]) {
    for (const [number, body] of Object.entries(group[1])) {
      const actual = bytes(body);
      total += actual;
      if (actual > BODY_BUDGET_BYTES) return fail('projection-body-byte-budget-exceeded', { kind: group[0], number: Number(number), limit: BODY_BUDGET_BYTES, actual });
    }
  }
  if (total > TOTAL_PROJECTION_BUDGET_BYTES) return fail('projection-total-byte-budget-exceeded', { limit: TOTAL_PROJECTION_BUDGET_BYTES, actual: total });
  return ok('PROGRAMME_V5_RENDERED', { projection, bodies, body_digests: { parent: digest(bodies.parent), children: Object.fromEntries(Object.entries(bodies.children).map(([key, value]) => [key, digest(value)])), prs: Object.fromEntries(Object.entries(bodies.prs).map(([key, value]) => [key, digest(value)])) }, total_projection_bytes: total });
}

function validateOutsideFreshness(text) {
  let historical = false;
  for (const line of String(text).split(/[\r\n]+/)) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      historical = /\b(?:history|historical|chronology|archive|archived|prior|previous)\b/i.test(heading[1]);
      if (!historical && /\b(?:current status|current gate|current candidate|next action|programme status|finality|remaining work)\b/i.test(heading[1])) return fail('competing-unmanaged-projection');
      continue;
    }
    if (historical || !line.trim()) continue;
    if (/^(?:\s*(?:[-+*>]|\d+\.)\s*)?(?:\*\*)?(?:current status|current gate|current candidate|next action|programme status|finality|remaining work)(?:\*\*)?\s*[:|]/i.test(line)) return fail('competing-unmanaged-projection');
  }
  return ok('OUTSIDE_BODY_FRESH');
}
function extractManaged(body, kind) {
  if (typeof body !== 'string' || !MARKERS[kind] || bytes(body) > BODY_BUDGET_BYTES) return fail('managed-body-invalid');
  const markers = MARKERS[kind];
  if (body.split(markers.begin).length !== 2 || body.split(markers.end).length !== 2) return fail('managed-marker-count-invalid');
  const start = body.indexOf(markers.begin);
  const finish = body.indexOf(markers.end, start + markers.begin.length);
  if (finish < start) return fail('managed-marker-order-invalid');
  const prefix = body.slice(0, start);
  const suffix = body.slice(finish + markers.end.length);
  const outside = validateOutsideFreshness(prefix + suffix);
  if (!outside.ok) return outside;
  return ok('MANAGED_BODY_EXTRACTED', { prefix, managed: body.slice(start, finish + markers.end.length), suffix });
}
function parseProgrammeV5Body(body, expected = {}) {
  const extracted = extractManaged(body, expected.kind);
  if (!extracted.ok) return extracted;
  const linePrefix = expected.kind === 'parent' ? STATE_LINE_PREFIX : PROJECTION_LINE_PREFIX;
  const escapedPrefix = linePrefix.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const escapedSuffix = LINE_SUFFIX.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const matches = [...extracted.managed.matchAll(new RegExp(escapedPrefix + '([A-Za-z0-9_-]+)' + escapedSuffix, 'g'))];
  if (matches.length !== 1) return fail('projection-envelope-count-invalid');
  const decoded = decode(matches[0][1]);
  const envelope = expected.kind === 'parent' ? decoded?.envelope : decoded;
  const state = expected.kind === 'parent' ? decoded?.state : null;
  if (!isRecord(envelope) || envelope.schema !== PROJECTION_SCHEMA || envelope.kind !== expected.kind
    || expected.repository !== undefined && envelope.repository !== expected.repository
    || expected.parent_issue !== undefined && envelope.parent_issue !== expected.parent_issue
    || expected.number !== undefined && envelope.number !== expected.number
    || !sha256(envelope.canonical_digest) || !sha256(envelope.projection_digest) || !sha256(envelope.extension_digest)) return fail('projection-envelope-invalid');
  if (state) {
    const valid = validateCanonicalStateV5(state);
    if (!valid.ok || valid.canonical_digest !== envelope.canonical_digest) return fail('canonical-envelope-binding-invalid');
  }
  return ok('PROGRAMME_V5_BODY_PARSED', { envelope, state, prefix: extracted.prefix, suffix: extracted.suffix, body_digest: digest(body) });
}
function countOccurrences(value, needle) { return String(value).split(needle).length - 1; }
function verifyRenderedProgrammeIntegrityV5(state, rendered) {
  if (!isRecord(rendered) || !isRecord(rendered.bodies) || !isRecord(rendered.bodies.children) || !isRecord(rendered.bodies.prs)) return fail('render-integrity-invalid');
  const deterministic = renderProgrammeV5(state);
  if (!deterministic.ok || !same(deterministic.bodies, rendered.bodies)) return fail('render-integrity-not-deterministic');
  const groups = [['parent', { [state.parent.issue]: rendered.bodies.parent }], ['child', rendered.bodies.children], ['pr', rendered.bodies.prs]];
  for (const group of groups) {
    const kind = group[0];
    for (const [number, body] of Object.entries(group[1])) {
      for (const [markerKind, markers] of Object.entries(MARKERS)) {
        const expectedCount = markerKind === kind ? 1 : 0;
        if (countOccurrences(body, markers.begin) !== expectedCount || countOccurrences(body, markers.end) !== expectedCount) return fail('render-integrity-marker-count-invalid', { kind, number: Number(number) });
      }
      if (countOccurrences(body, STATE_LINE_PREFIX) !== (kind === 'parent' ? 1 : 0) || countOccurrences(body, PROJECTION_LINE_PREFIX) !== (kind === 'parent' ? 0 : 1)) return fail('render-integrity-envelope-count-invalid', { kind, number: Number(number) });
      const parsed = parseProgrammeV5Body(body, { kind, repository: state.repository, parent_issue: state.parent.issue, number: Number(number) });
      if (!parsed.ok || parsed.envelope.canonical_digest !== rendered.projection.canonical_digest || kind === 'parent' && !same(parsed.state, state) || parsed.prefix !== '' || parsed.suffix !== '') return fail('render-integrity-parse-invalid', { kind, number: Number(number) });
    }
  }
  return ok('PROGRAMME_V5_RENDER_INTEGRITY_VERIFIED', { canonical_digest: rendered.projection.canonical_digest });
}

function candidateBinding(state, lane = null) {
  const selected = lane || state.active_lanes.find((entry) => entry.candidate);
  if (!selected?.candidate) return null;
  const binding = registryFor(state, selected.candidate.pr);
  if (!binding) return null;
  return {
    repository: state.repository, parent_issue: state.parent.issue, child_issue: binding.child.issue, lane_id: selected.lane_id,
    pr: selected.candidate.pr, branch: selected.candidate.branch, base_ref: selected.candidate.base_ref, base_sha: selected.candidate.base_sha,
    head: selected.candidate.head, tree: selected.candidate.tree, version: selected.candidate.version, epoch_id: selected.candidate.epoch_id,
    lock: binding.epoch.lock, role: binding.registry.role, completes_child: binding.registry.completes_child, registry_status: binding.registry.status,
  };
}
function candidateBindingDigest(state) {
  const bindings = state.active_lanes.filter((lane) => lane.candidate).map((lane) => candidateBinding(state, lane));
  return bindings.length ? digest(bindings) : null;
}
function derivePrAssociationsV5(state) {
  const valid = validateCanonicalStateV5(state);
  if (!valid.ok) return valid;
  const associations = {};
  for (const pr of state.prs) {
    const binding = registryFor(state, pr.number);
    const lifecycleAllowsClosing = binding.registry.status === 'ACTIVE' && binding.child.finality.state === 'READY_AUTHORIZED'
      || binding.registry.status === 'ACCEPTED' && binding.child.finality.state === 'MERGED';
    const closing = binding.registry.role === 'TERMINAL' && binding.registry.completes_child
      && lifecycleAllowsClosing
      && binding.child.finality.authority_ref !== null;
    associations[String(pr.number)] = { parent_issue: state.parent.issue, child_issue: binding.child.issue, kind: closing ? 'CLOSING' : 'CROSS_REFERENCE' };
  }
  return ok('PROGRAMME_V5_PR_ASSOCIATIONS_DERIVED', { associations });
}
function expectedLabelsV5(state, currentLabels = {}) {
  const managed = new Set(['completed', 'current', 'queued', 'blocked', 'retired']);
  const result = clone(currentLabels || {});
  for (const child of state.children) {
    const unrelated = (currentLabels[String(child.issue)] || []).filter((label) => !managed.has(label));
    const lifecycle = effectiveLifecycle(child);
    const label = lifecycle === 'RETIRED' ? 'completed' : lifecycle.toLowerCase();
    result[String(child.issue)] = [...new Set(unrelated.concat(label))].sort();
  }
  return result;
}
function snapshotDigest(snapshot) {
  return digest({ repository: snapshot.repository, revision: snapshot.revision, complete: snapshot.complete, canonical_state: snapshot.canonical_state, bodies: snapshot.bodies, labels: snapshot.labels, managed_events: snapshot.managed_events, native: snapshot.native, bootstrap: snapshot.bootstrap || null });
}
function addOperation(operations, kind, target, before, after, binding = {}) {
  if (same(before, after)) return;
  const operation = { kind, target, before_digest: digest(before), after: clone(after), after_digest: digest(after), ...clone(binding) };
  operation.operation_id = digest(operation);
  operations.push(operation);
}

function parseV4CanonicalSnapshot(snapshot, expectedRepository, expectedParent) {
  if (isRecord(snapshot.canonical_state)) {
    const valid = v4.validateCanonicalStateV4(snapshot.canonical_state);
    if (!valid.ok) return fail('v4-canonical-state-invalid', { detail: valid.reason });
    if (snapshot.canonical_state.repository !== expectedRepository || snapshot.canonical_state.parent.issue !== expectedParent) return fail('v4-canonical-identity-mismatch');
    return ok('V4_CANONICAL_SNAPSHOT_PARSED', { state: clone(snapshot.canonical_state), canonical_digest: valid.canonical_digest });
  }
  const parent = v4.parseProgrammeV4Body(snapshot.bodies?.parent, { kind: 'parent', repository: expectedRepository, parent_issue: expectedParent, number: expectedParent });
  if (!parent.ok || !parent.state) return fail('v4-parent-canonical-state-missing');
  return ok('V4_CANONICAL_SNAPSHOT_PARSED', { state: parent.state, canonical_digest: digest(parent.state) });
}

function parseV4Bodies(snapshot, state) {
  const parent = v4.parseProgrammeV4Body(snapshot.bodies?.parent, { kind: 'parent', repository: state.repository, parent_issue: state.parent.issue, number: state.parent.issue });
  if (!parent.ok) return parent;
  for (const child of state.children) {
    const parsed = v4.parseProgrammeV4Body(snapshot.bodies?.children?.[String(child.issue)], { kind: 'child', repository: state.repository, parent_issue: state.parent.issue, number: child.issue });
    if (!parsed.ok) return parsed;
  }
  for (const pr of state.prs) {
    const parsed = v4.parseProgrammeV4Body(snapshot.bodies?.prs?.[String(pr.number)], { kind: 'pr', repository: state.repository, parent_issue: state.parent.issue, number: pr.number });
    if (!parsed.ok) return parsed;
  }
  return ok('V4_BODIES_PARSED');
}

function ensureWebAuthority(state, authorityRef, authorityId = null) {
  if (!authorityRef || !safeLine(authorityRef, 512)) return fail('migration-authority-required');
  const found = state.evidence_refs.find((entry) => entry.kind === 'WEB' && (entry.reference === authorityRef || entry.id === authorityRef));
  if (found) return ok('MIGRATION_AUTHORITY_RETAINED', { state });
  const id = authorityId || 'web_' + digest(authorityRef).slice(0, 20);
  if (!safeId(id) || state.evidence_refs.some((entry) => entry.id === id)) return fail('migration-authority-id-invalid');
  state.evidence_refs.push({ id, kind: 'WEB', reference: authorityRef, summary: 'Web-controlled E3 architecture and exact-candidate admission authority.' });
  return ok('MIGRATION_AUTHORITY_ADDED', { state, evidence_id: id });
}

function migrateV4ToV5(source, options = {}) {
  const valid = v4.validateCanonicalStateV4(source);
  if (!valid.ok) return fail('v4-migration-input-invalid', { detail: valid.reason });
  const target = {
    schema: STATE_SCHEMA,
    design_lock: DESIGN_LOCK,
    repository: source.repository,
    parent: clone(source.parent),
    children: source.children.map((child) => {
      const deliverables = Array.isArray(child.deliverables) && child.deliverables.length
        ? clone(child.deliverables)
        : child.scope.length ? clone(child.scope) : [child.objective];
      return {
        issue: child.issue, order: child.order, title: child.title, summary: child.objective,
        objective: child.objective, deliverables,
        done_when: ['Every declared deliverable is complete and Web records finality.'],
        lifecycle: child.lifecycle, dependencies: clone(child.dependencies), scope: clone(child.scope),
        out_of_scope: clone(child.out_of_scope), boundaries: clone(child.boundaries), eli5: child.eli5,
        epochs: clone(child.epochs), holds: clone(child.holds), pr_registry: clone(child.pr_registry), finality: clone(child.finality),
      };
    }),
    prs: source.prs.map((pr) => ({
      number: pr.number, child_issue: pr.child_issue, summary: pr.purpose, purpose: pr.purpose,
      scope: clone(pr.scope), out_of_scope: clone(pr.out_of_scope), design_constraints: clone(pr.design_constraints),
      changed_surfaces: clone(pr.changed_surfaces),
      validation_requirements: ['Focused tests, complete relevant reconciler suite, and required Toolkit audits.'],
      evidence_refs: clone(pr.evidence_refs || []), eli5: pr.eli5,
    })),
    concurrency_authority: { mode: 'SINGLE_DEFAULT', max_active_lanes: 1, authority_ref: null, authority_digest: null, permitted_child_issues: [] },
    active_lanes: [],
    predecessor_contract_digest: source.predecessor_contract_digest,
    evidence_refs: clone(source.evidence_refs),
    historical_transitions: clone(source.historical_transitions),
    extensions: clone(source.extensions || []),
  };
  const authority = ensureWebAuthority(
    target,
    options.authority_ref || target.evidence_refs.find((entry) => entry.kind === 'WEB')?.reference,
    options.authority_evidence_id
  );
  if (!authority.ok) return authority;
  const current = target.children.filter((child) => child.lifecycle === 'CURRENT');
  if (current.length > 1 && !options.concurrency_authority) return fail('unauthorized-multiple-current-children');
  if (options.concurrency_authority) target.concurrency_authority = clone(options.concurrency_authority);
  for (const child of current) {
    const cursor = source.cursor && source.cursor.child_issue === child.issue ? source.cursor : null;
    const active = activeRegistry(child);
    const candidate = cursor && source.candidate && source.candidate.pr === active[0]?.pr ? clone(source.candidate) : null;
    target.active_lanes.push({
      lane_id: 'child-' + child.issue,
      child_issue: child.issue,
      epoch_id: cursor?.epoch_id || active[0]?.epoch_id || child.epochs[0].id,
      gate: cursor?.gate || child.epochs[0].gates[0],
      gate_state: cursor?.status === 'RESULT_RECORDED' ? 'RESULT_RECORDED' : 'ACTIVE',
      gate_result: cursor?.result || null,
      candidate,
      work_claims: [{ mode: 'WRITE', resource: 'programme/child/' + child.issue, operation: 'canonical-transition' }],
    });
  }
  target.active_lanes.sort((left, right) => left.lane_id.localeCompare(right.lane_id));
  if (options.live_candidate) {
    const live = clone(options.live_candidate);
    const lane = target.active_lanes.find((entry) => entry.candidate?.pr === live.pr)
      || target.active_lanes.find((entry) => target.children.find((child) => child.issue === entry.child_issue)?.pr_registry.some((entry) => entry.pr === live.pr));
    if (!lane) return fail('migration-live-candidate-unbound', { pr: live.pr });
    lane.candidate = live;
  }
  const final = validateCanonicalStateV5(target);
  return final.ok
    ? ok('V4_TO_V5_MIGRATED', { state: target, source_canonical_digest: valid.canonical_digest, canonical_digest: final.canonical_digest })
    : final;
}

function eventWithoutId(event) {
  const value = clone(event);
  delete value.event_id;
  return value;
}

function createManagedEventV3(input = {}) {
  const consumedReceiptIds = input.consumed_receipt_ids === undefined ? [] : clone(input.consumed_receipt_ids);
  const event = {
    schema: MANAGED_EVENT_SCHEMA,
    event_type: input.event_type || 'canonical_transition',
    repository: input.repository || input.state?.repository,
    parent_issue: input.parent_issue || input.state?.parent?.issue,
    entity: clone(input.entity || { kind: 'parent', number: input.parent_issue || input.state?.parent?.issue }),
    source_state_schema: input.source_state_schema === undefined ? null : input.source_state_schema,
    from_state_digest: input.from_state_digest || digest(input.from_state === undefined ? null : input.from_state),
    to_state_digest: input.to_state_digest || input.to_canonical_digest || digest(input.to_state === undefined ? input.state : input.to_state),
    authority_ref: input.authority_ref || 'system:v5',
    authority_digest: input.authority_digest === undefined ? null : input.authority_digest,
    candidate_binding_digest: input.candidate_binding_digest === undefined ? candidateBindingDigest(input.state || { active_lanes: [] }) : input.candidate_binding_digest,
    lane_id: input.lane_id === undefined ? null : input.lane_id,
    epoch_id: input.epoch_id === undefined ? null : input.epoch_id,
    gate: input.gate === undefined ? null : input.gate,
    lock: input.lock === undefined ? null : input.lock,
    fence_id: input.fence_id === undefined ? null : input.fence_id,
    prior_event_id: input.prior_event_id === undefined ? null : input.prior_event_id,
    receipt_id: input.receipt_id === undefined ? null : input.receipt_id,
    consumed_receipt_ids: consumedReceiptIds,
    receipt_inventory_digest: input.receipt_inventory_digest === undefined
      ? consumedReceiptIds.length ? receiptInventoryDigest(consumedReceiptIds) : null
      : input.receipt_inventory_digest,
  };
  event.event_id = digest(event);
  return event;
}

function validateManagedEventV3(event, expected = {}) {
  if (!exactKeys(event, ['schema', 'event_type', 'repository', 'parent_issue', 'entity', 'source_state_schema', 'from_state_digest', 'to_state_digest', 'authority_ref', 'authority_digest', 'candidate_binding_digest', 'lane_id', 'epoch_id', 'gate', 'lock', 'fence_id', 'prior_event_id', 'receipt_id', 'consumed_receipt_ids', 'receipt_inventory_digest', 'event_id'])
    || event.schema !== MANAGED_EVENT_SCHEMA
    || !['canonical_initialisation', 'canonical_transition', 'migration', 'recovery_transition'].includes(event.event_type)
    || !safeLine(event.repository, 200) || expected.repository !== undefined && event.repository !== expected.repository
    || !issue(event.parent_issue) || expected.parent_issue !== undefined && event.parent_issue !== expected.parent_issue
    || !exactKeys(event.entity, ['kind', 'number']) || !['parent', 'child', 'pr'].includes(event.entity.kind) || !issue(event.entity.number)
    || ![null, 'toolkit.github-program.state.v4', STATE_SCHEMA, 'toolkit.github-program.legacy-state.v1'].includes(event.source_state_schema)
    || !sha256(event.from_state_digest) || !sha256(event.to_state_digest) || !safeLine(event.authority_ref, 512)
    || event.authority_digest !== null && !sha256(event.authority_digest)
    || event.candidate_binding_digest !== null && !sha256(event.candidate_binding_digest)
    || event.lane_id !== null && !safeId(event.lane_id) || event.epoch_id !== null && !safeId(event.epoch_id)
    || event.gate !== null && !safeId(event.gate) || event.lock !== null && !safeId(event.lock)
    || event.fence_id !== null && !safeId(event.fence_id) || event.prior_event_id !== null && !sha256(event.prior_event_id)
    || event.receipt_id !== null && !sha256(event.receipt_id) || !arrayOf(event.consumed_receipt_ids, sha256, 500)
    || new Set(event.consumed_receipt_ids).size !== event.consumed_receipt_ids.length
    || event.receipt_inventory_digest !== null && !sha256(event.receipt_inventory_digest) || !sha256(event.event_id)) return fail('managed-event-v3-invalid');
  if (event.consumed_receipt_ids.length === 0 && event.receipt_inventory_digest !== null) return fail('receipt-inventory-binding-invalid');
  if (event.consumed_receipt_ids.length > 0 && event.receipt_inventory_digest !== receiptInventoryDigest(event.consumed_receipt_ids)) return fail('receipt-inventory-digest-mismatch');
  if (event.receipt_id !== null && !event.consumed_receipt_ids.includes(event.receipt_id)) return fail('receipt-inventory-binding-invalid');
  if (event.event_type === 'canonical_initialisation' && event.source_state_schema !== null
    || event.event_type === 'canonical_transition' && ![STATE_SCHEMA, 'toolkit.github-program.state.v4'].includes(event.source_state_schema)
    || event.event_type === 'migration' && event.source_state_schema !== 'toolkit.github-program.state.v4'
    || event.event_type === 'recovery_transition' && event.source_state_schema !== STATE_SCHEMA) return fail('managed-event-v3-transition-binding-invalid');
  if (event.event_id !== digest(eventWithoutId(event))) return fail('managed-event-v3-tampered');
  return ok('MANAGED_EVENT_V3_VALID', { event });
}

function relationshipCapabilityDigestV5(grant) {
  return digest({
    allowed_relationship_operations: grant.allowed_relationship_operations,
    relationship_capability_provenance: grant.relationship_capability_provenance,
  });
}

function validateTrustedRelationshipInspectionV5(state, grant, inspection) {
  const matched = v4.assertScopeEquality(state, grant);
  if (!matched.ok) return matched;
  if (!isRecord(inspection) || inspection.schema !== v4.RELATIONSHIP_INSPECTION_SCHEMA
    || inspection.complete !== true || inspection.scope_digest !== grant.scope_digest
    || inspection.repository !== grant.repository || inspection.parent_issue !== grant.parent_issue
    || !same(inspection.children, grant.children) || !same(inspection.dependencies, grant.dependencies)
    || inspection.api_version !== grant.api_version
    || !same(inspection.allowed_relationship_operations, grant.allowed_relationship_operations)
    || !same(inspection.relationship_capability_provenance, grant.relationship_capability_provenance)
    || inspection.relationship_capability_digest !== relationshipCapabilityDigestV5(grant)) return fail('trusted-relationship-inspection-invalid');
  return ok('TRUSTED_RELATIONSHIP_INSPECTION_VALID', {
    inspection: clone(inspection),
    trusted_relationship_inspection_digest: digest(inspection),
    relationship_capability_digest: relationshipCapabilityDigestV5(grant),
  });
}

function validateTrustedPrInspectionV5(state, grant, inspection) {
  const matched = v4.assertScopeEquality(state, grant);
  if (!matched.ok) return matched;
  if (!isRecord(inspection) || inspection.schema !== v4.PR_INSPECTION_SCHEMA
    || inspection.complete !== true || inspection.scope_digest !== grant.scope_digest
    || inspection.repository !== grant.repository
    || inspection.resolver_identity !== grant.version_resolver.identity
    || !Array.isArray(inspection.facts)
    || !same(inspection.facts.map((fact) => fact.number).sort((a, b) => a - b), grant.associated_prs.slice().sort((a, b) => a - b))) return fail('trusted-pr-inspection-invalid');
  const seen = new Set();
  for (const fact of inspection.facts) {
    if (seen.has(fact.number)) return fail('trusted-pr-inspection-invalid');
    seen.add(fact.number);
    const binding = registryFor(state, fact.number);
    if (!binding || fact.parent_issue !== state.parent.issue || fact.child_issue !== binding.child.issue) return fail('trusted-pr-association-mismatch', { pr: fact.number });
    const entry = binding.registry;
    if (entry.status === 'ACTIVE') {
      const lane = laneForPr(state, fact.number);
      const candidate = lane?.candidate;
      if (!candidate || candidate.pr !== fact.number || candidate.epoch_id !== entry.epoch_id
        || candidate.branch !== fact.branch || candidate.base_ref !== fact.base_ref
        || candidate.base_sha !== fact.base_sha || candidate.head !== fact.head
        || candidate.tree !== fact.tree || candidate.version !== fact.version) return fail('trusted-candidate-binding-mismatch', { pr: fact.number });
      if (fact.lifecycle === 'OPEN_DRAFT') {
        if (entry.role !== 'INTERMEDIATE' && !(entry.role === 'TERMINAL' && !entry.completes_child)) return fail('active-draft-role-invalid', { pr: fact.number });
      } else if (fact.lifecycle === 'OPEN_READY') {
        const intermediatePresentation = entry.role === 'INTERMEDIATE' && entry.completes_child === false;
        if (intermediatePresentation) {
          if (binding.child.finality.state !== 'HELD' || binding.child.finality.authority_ref !== null) return fail('intermediate-ready-finality-forbidden', { pr: fact.number });
          continue;
        }
        const allEpochsAccepted = binding.child.epochs.every((epoch) => epoch.terminal_disposition === 'ACCEPTED');
        if (entry.role !== 'TERMINAL' || !entry.completes_child || !allEpochsAccepted
          || blockingHolds(binding.child).length || binding.child.finality.state !== 'READY_AUTHORIZED'
          || binding.child.finality.authority_ref === null) return fail('ready-finality-authority-required', { pr: fact.number });
      } else return fail('active-pr-live-lifecycle-invalid', { pr: fact.number, lifecycle: fact.lifecycle });
    } else if (entry.status === 'ACCEPTED') {
      if (fact.lifecycle !== 'MERGED' || entry.accepted_evidence_ref === null) return fail('accepted-pr-live-lifecycle-invalid', { pr: fact.number });
    } else if (entry.status === 'RETIRED') {
      if (fact.lifecycle !== 'CLOSED_UNMERGED' || entry.retirement_evidence_ref === null) return fail('retired-pr-live-lifecycle-invalid', { pr: fact.number });
    }
  }
  return ok('TRUSTED_PR_INSPECTION_VALID', { inspection: clone(inspection), trusted_pr_inspection_digest: digest(inspection) });
}

function inspectTrustBindingsV5(state, grant, broker) {
  if (!broker || typeof broker.inspectRelationships !== 'function' || typeof broker.inspectPrs !== 'function') return fail('programme-trust-broker-required');
  const validState = validateCanonicalStateV5(state);
  if (!validState.ok) return validState;
  const scopeMatch = v4.assertScopeEquality(state, grant);
  if (!scopeMatch.ok) return scopeMatch;
  let relationships;
  let prs;
  try {
    relationships = broker.inspectRelationships(state, grant);
    prs = broker.inspectPrs(state, grant);
  } catch (_error) {
    return fail('trusted-programme-inspection-failed');
  }
  if (!relationships?.ok) return relationships || fail('trusted-relationship-inspection-failed');
  if (!prs?.ok) return prs || fail('trusted-pr-inspection-failed');
  const relationshipCheck = validateTrustedRelationshipInspectionV5(state, grant, relationships.inspection);
  if (!relationshipCheck.ok) return relationshipCheck;
  const prCheck = validateTrustedPrInspectionV5(state, grant, prs.inspection);
  if (!prCheck.ok) return prCheck;
  return ok('TRUSTED_PROGRAMME_FACTS_INSPECTED', {
    relationships: relationshipCheck.inspection,
    prs: prCheck.inspection,
    trusted_pr_inspection_digest: prCheck.trusted_pr_inspection_digest,
    trusted_relationship_inspection_digest: relationshipCheck.trusted_relationship_inspection_digest,
    relationship_capability_digest: relationshipCapabilityDigestV5(grant),
  });
}

function requireRelationshipCapabilitiesV5(grant, required) {
  if (!Array.isArray(required) || required.some((entry) => !safeId(entry))) return fail('relationship-capability-request-invalid');
  const allowed = Array.isArray(grant?.allowed_relationship_operations) ? grant.allowed_relationship_operations : [];
  if (!required.every((entry) => allowed.includes(entry))) return fail('relationship-capability-missing');
  return ok('RELATIONSHIP_CAPABILITY_BOUND', { required_relationship_operations: clone(required), relationship_capability_digest: relationshipCapabilityDigestV5(grant) });
}

function classifyRelationshipDeltaV5(before, after) {
  if (!isRecord(before) || !isRecord(after)) return fail('native-relationship-snapshot-invalid');
  const fields = ['children', 'dependencies', 'associated_prs', 'pr_associations', 'api_version'];
  if (!exactKeys(after, fields) || Object.keys(before).length !== 0 && !exactKeys(before, fields)) return fail('native-relationship-delta-unclassified');
  const required = [];
  if (!same(before.children ?? [], after.children)) required.push('CHILD_MEMBERSHIP');
  if (!same(before.dependencies ?? {}, after.dependencies)) required.push('DEPENDENCY_EDGES');
  if (!same(before.associated_prs ?? [], after.associated_prs) || !same(before.pr_associations ?? {}, after.pr_associations)) required.push('PR_ASSOCIATION');
  const changed = !same(before, after);
  if (changed && required.length === 0) return fail('native-relationship-delta-unclassified');
  return ok('RELATIONSHIP_DELTA_CLASSIFIED', { changed, required_relationship_operations: required });
}

function safeJsonValue(value, maxProperties = 40, maxBytes = 8192) {
  if (!isRecord(value) && !Array.isArray(value)) return false;
  if (Object.keys(value).length > maxProperties) return false;
  try {
    return bytes(value) <= maxBytes && !/(?:token|password|secret|api[_-]?key)/i.test(canonicalJson(value));
  } catch (_error) {
    return false;
  }
}

function evidenceDigest(refs) { return digest(refs || []); }
function receiptInventoryDigest(ids) { return digest(Array.isArray(ids) ? ids.slice() : []); }
function receiptRole(type) {
  return type === 'G4_TERMINAL' ? 'G4' : type === 'RUN_STARTED' || type === 'TRANSITION_PREVIEW' ? 'LOOP_MANAGER' : 'EXECUTOR';
}
function receiptWithoutId(receipt) {
  const value = clone(receipt);
  delete value.receipt_id;
  return value;
}
function transitionBindingDigest(event) {
  return digest({
    schema: event.schema,
    event_type: event.event_type,
    repository: event.repository,
    parent_issue: event.parent_issue,
    entity: event.entity,
    source_state_schema: event.source_state_schema,
    from_state_digest: event.from_state_digest,
    to_state_digest: event.to_state_digest,
    authority_ref: event.authority_ref,
    authority_digest: event.authority_digest,
    candidate_binding_digest: event.candidate_binding_digest,
    lane_id: event.lane_id,
    epoch_id: event.epoch_id,
    gate: event.gate,
    lock: event.lock,
    fence_id: event.fence_id,
    prior_event_id: event.prior_event_id,
  });
}
function operationBindingDigest(operations) {
  const stable = (operations || []).filter((operation) => operation.kind !== 'managed-event').map((operation) => {
    const value = clone(operation);
    if (isRecord(value.after)) {
      delete value.after.receipt_id;
      delete value.after.event_id;
    }
    return value;
  });
  return digest(stable);
}
function toReceiptCandidate(candidate) {
  if (candidate === null || candidate === undefined) return null;
  if (exactKeys(candidate, ['pr_number', 'branch', 'base_ref', 'base_sha', 'head_sha', 'tree_sha'])) return clone(candidate);
  if (exactKeys(candidate, ['pr', 'branch', 'base_ref', 'base_sha', 'head', 'tree', 'version', 'epoch_id'])) {
    return {
      pr_number: candidate.pr,
      branch: candidate.branch,
      base_ref: candidate.base_ref,
      base_sha: candidate.base_sha,
      head_sha: candidate.head,
      tree_sha: candidate.tree,
    };
  }
  return clone(candidate);
}
function fromReceiptCandidate(candidate, template = null) {
  if (!candidate) return null;
  if (template && candidate.pr_number === template.pr) {
    return { ...clone(template), pr: candidate.pr_number, head: candidate.head_sha, tree: candidate.tree_sha };
  }
  return {
    pr: candidate.pr_number,
    branch: candidate.branch,
    base_ref: candidate.base_ref,
    base_sha: candidate.base_sha,
    head: candidate.head_sha,
    tree: candidate.tree_sha,
    version: 'unknown',
    epoch_id: 'receipt',
  };
}

function createRunReceipt(input = {}) {
  const payload = clone(input.payload || {});
  payload.classification = payload.classification || input.classification || input.receipt_type;
  for (const key of ['reason_code', 'outcome_digest', 'evidence_digest', 'operation_digest', 'detail_digest', 'mutation_outcome', 'evidence_refs']) {
    if (input[key] !== undefined) payload[key] = clone(input[key]);
  }
  const receipt = {
    schema: RUN_RECEIPT_SCHEMA,
    receipt_type: input.receipt_type,
    receipt_id: null,
    sequence: input.sequence === undefined ? 1 : input.sequence,
    prior_receipt_id: input.prior_receipt_id === undefined ? null : input.prior_receipt_id,
    run_id: input.run_id,
    allocation_id: input.allocation_id,
    repository: input.repository,
    parent_issue: input.parent_issue,
    child_issue: input.child_issue,
    lock: input.lock,
    authority: clone(input.authority),
    start: clone(input.start),
    candidate: toReceiptCandidate(input.candidate),
    lease: clone(input.lease),
    payload,
    created_at: input.created_at || new Date().toISOString(),
  };
  receipt.receipt_id = receipts.digestValue(receiptWithoutId(receipt));
  return receipt;
}

function receiptFailure(error, reason = 'run-receipt-invalid') {
  return fail(reason, { receipt_error: error?.code || 'receipt-validation-failed' });
}

function validateReceiptObject(receipt, expected = {}) {
  let checked;
  try {
    checked = receipts.validateReceiptObject(receipt);
  } catch (error) {
    return receiptFailure(error);
  }
  if (receipt.receipt_type === 'RUN_STARTED' && receipt.payload.classification !== 'RUN_STARTED_VERIFIED') return fail('canonical-started-receipt-required');
  const mismatches = [
    ['repository', expected.repository, receipt.repository, 'receipt-repository-binding-mismatch'],
    ['parent_issue', expected.parent_issue, receipt.parent_issue, 'receipt-parent-binding-mismatch'],
    ['child_issue', expected.child_issue, receipt.child_issue, 'receipt-child-binding-mismatch'],
    ['run_id', expected.run_id, receipt.run_id, 'receipt-run-binding-mismatch'],
    ['allocation_id', expected.allocation_id, receipt.allocation_id, 'receipt-allocation-binding-mismatch'],
    ['lock', expected.lock, receipt.lock, 'receipt-lock-binding-mismatch'],
    ['receipt_type', expected.receipt_type, receipt.receipt_type, 'receipt-type-binding-mismatch'],
    ['sequence', expected.sequence, receipt.sequence, 'receipt-sequence-binding-mismatch'],
  ];
  for (const [, wanted, actual, reason] of mismatches) if (wanted !== undefined && wanted !== actual) return fail(reason);
  if (expected.candidate !== undefined && !same(receipt.candidate, toReceiptCandidate(expected.candidate))) return fail('receipt-candidate-binding-mismatch');
  if (expected.pr_number !== undefined && receipt.candidate?.pr_number !== expected.pr_number) return fail('receipt-pr-binding-mismatch');
  if (expected.detail_digest !== undefined && receipt.payload.detail_digest !== expected.detail_digest) return fail('receipt-detail-binding-mismatch');
  if (expected.operation_digest !== undefined && receipt.payload.operation_digest !== expected.operation_digest) return fail('receipt-operation-binding-mismatch');
  if (expected.mutation_outcome !== undefined && receipt.payload.mutation_outcome !== expected.mutation_outcome) return fail('receipt-mutation-outcome-mismatch');
  if (expected.prior_receipt_id !== undefined && receipt.prior_receipt_id !== expected.prior_receipt_id) return fail('receipt-chain-binding-mismatch');
  return ok('RUN_RECEIPT_VALID', { receipt: checked });
}

function validateRunReceipt(receipt, expected = {}) { return validateReceiptObject(receipt, expected); }

function validateRunReceiptChain(receiptList, expected = {}) {
  if (!Array.isArray(receiptList) || receiptList.length < 1) return fail('run-receipt-chain-invalid');
  for (const receipt of receiptList) {
    const valid = validateReceiptObject(receipt, expected);
    if (!valid.ok) return valid;
  }
  const started = receiptList[0];
  if (started.receipt_type !== 'RUN_STARTED' || started.sequence !== 1 || started.prior_receipt_id !== null
    || started.candidate !== null || started.payload.classification !== 'RUN_STARTED_VERIFIED') return fail('canonical-started-receipt-required');
  for (let index = 1; index < receiptList.length; index += 1) {
    if (receiptList[index].run_id !== started.run_id || receiptList[index].allocation_id !== started.allocation_id
      || receiptList[index].sequence !== receiptList[index - 1].sequence + 1
      || receiptList[index].prior_receipt_id !== receiptList[index - 1].receipt_id) return fail('run-receipt-chain-invalid');
  }
  try {
    const chain = receipts.validateReceiptChain(receiptList);
    return ok('RUN_RECEIPT_CHAIN_VALID', {
      receipts: clone(chain),
      ids: new Set(chain.map((entry) => entry.receipt_id)),
      terminal: chain.find((entry) => TERMINAL_RECEIPT_TYPES.includes(entry.receipt_type)) || null,
    });
  } catch (error) {
    return receiptFailure(error, 'run-receipt-chain-invalid');
  }
}

function validateReceiptConsumption(event, receiptList, expected = {}) {
  const validEvent = validateManagedEventV3(event, expected);
  if (!validEvent.ok) return validEvent;
  if (!Array.isArray(receiptList)) return fail('receipt-inventory-not-durable');
  const chain = validateRunReceiptChain(receiptList, { repository: expected.repository, parent_issue: expected.parent_issue });
  if (!chain.ok) return chain;
  const byId = new Map(chain.receipts.map((receipt) => [receipt.receipt_id, receipt]));
  for (const receiptId of event.consumed_receipt_ids) {
    const receipt = byId.get(receiptId);
    if (!receipt) return fail('receipt-not-persisted', { receipt_id: receiptId });
    if (receipt.repository !== event.repository || receipt.parent_issue !== event.parent_issue) return fail('receipt-event-binding-mismatch', { receipt_id: receiptId });
  }
  const transition = byId.get(event.receipt_id);
  if (!transition) return fail('receipt-not-persisted', { receipt_id: event.receipt_id });
  if (transition.payload.detail_digest !== transitionBindingDigest(event)) return fail('transition-receipt-detail-binding-mismatch');
  if (expected.operation_digest !== undefined && transition.payload.operation_digest !== expected.operation_digest) return fail('preview-operation-binding-mismatch');
  if (expected.require_readback === true && transition.payload.mutation_outcome !== 'KNOWN') return fail('receipt-readback-required');
  return ok('RECEIPT_INVENTORY_CONSUMABLE', {
    consumed_receipt_ids: clone(event.consumed_receipt_ids),
    receipt_inventory_digest: event.receipt_inventory_digest,
    operation_digest: transition.payload.operation_digest || null,
  });
}

function validateRetainedReceiptBindings(events, receiptList, expected = {}) {
  const claimed = (events || []).filter((event) => event?.schema === MANAGED_EVENT_SCHEMA
    && Array.isArray(event.consumed_receipt_ids) && event.consumed_receipt_ids.length);
  if (!claimed.length) return ok('RETAINED_RECEIPT_BINDINGS_NOT_CLAIMED');
  if (!Array.isArray(receiptList)) return fail('receipt-inventory-not-durable');
  for (const event of claimed) {
    const receipt = receiptList.find((entry) => entry.receipt_id === event.receipt_id);
    if (!receipt) return fail('receipt-not-persisted', { receipt_id: event.receipt_id });
    const runChain = receiptList.filter((entry) => entry.run_id === receipt.run_id);
    const chain = validateRunReceiptChain(runChain, { repository: expected.repository, parent_issue: expected.parent_issue });
    if (!chain.ok) return chain;
    const consumption = validateReceiptConsumption(event, chain.receipts, {
      repository: expected.repository, parent_issue: expected.parent_issue,
    });
    if (!consumption.ok) return consumption;
  }
  return ok('RETAINED_RECEIPT_BINDINGS_VALID', { receipt_inventory_digest: receiptInventoryDigest(receiptList.map((receipt) => receipt.receipt_id)) });
}

function validateManagedEventInventoryV5(events, repository, options = {}) {
  if (!Array.isArray(events) || events.length > 500) return fail('managed-event-inventory-invalid');
  const normalized = [];
  const legacyPrefix = [];
  const ids = new Set();
  let v3Started = false;
  for (const supplied of events) {
    let result;
    if (supplied?.schema === MANAGED_EVENT_SCHEMA) {
      result = validateManagedEventV3(supplied, { repository });
      v3Started = true;
    } else if (supplied?.schema === 'toolkit.github-program.managed-event.v2' || supplied?.schema === 'toolkit.github-program.managed-event.v1') {
      if (v3Started) return fail('managed-event-order-invalid');
      legacyPrefix.push(clone(supplied));
      const legacy = v4.validateManagedEventInventoryV4(legacyPrefix, repository);
      result = legacy.ok ? ok('LEGACY_MANAGED_EVENT_RETAINED', { event: clone(supplied) }) : legacy;
      if (result.ok && supplied.schema === 'toolkit.github-program.managed-event.v1' && hasOwn(supplied, 'prior_event')
        && supplied.prior_event !== (legacyPrefix.at(-2)?.event_id || null)) {
        return fail('managed-event-history-link-invalid', { event_id: supplied.event_id });
      }
    } else {
      return fail('managed-event-inventory-invalid');
    }
    if (!result.ok || result.event.repository !== repository || ids.has(result.event.event_id)) return fail('managed-event-inventory-invalid');
    const retained = supplied?.schema === MANAGED_EVENT_SCHEMA ? clone(result.event) : clone(supplied);
    const prior = normalized.at(-1)?.event_id || null;
    if (retained.schema === MANAGED_EVENT_SCHEMA) {
      if (retained.prior_event_id !== prior) return fail('managed-event-chain-invalid');
    }
    ids.add(retained.event_id);
    normalized.push(retained);
  }
  if (legacyPrefix.length) {
    const legacy = v4.validateManagedEventInventoryV4(legacyPrefix, repository);
    if (!legacy.ok) return legacy;
    if (!legacyPrefix.every((event, index) => event.event_id === legacy.events[index].event_id)) return fail('managed-event-history-rewrite');
  }
  const receiptsCheck = options.skip_receipt_bindings === true ? ok('RETAINED_RECEIPT_BINDINGS_SKIPPED')
    : validateRetainedReceiptBindings(normalized, options.receipts, { repository, parent_issue: options.parent_issue });
  if (!receiptsCheck.ok) return receiptsCheck;
  return ok('MANAGED_EVENT_INVENTORY_V5_VALID', {
    events: normalized,
    ids,
    inventory_digest: digest(normalized),
    v3_count: normalized.filter((event) => event.schema === MANAGED_EVENT_SCHEMA).length,
  });
}

function receiptFenceExpired(receipt, now = new Date()) {
  return !receipt?.lease?.expires_at || Date.parse(receipt.lease.expires_at) <= new Date(now).getTime();
}

function validateActiveReceiptFence(required, activeChain, now = new Date()) {
  if (!isRecord(required) || !isRecord(required.receipt) || !Array.isArray(required.chain)) return fail('active-receipt-fence-invalid');
  const expectedReceipt = required.receipt;
  const expectedChain = required.chain;
  const binding = {
    repository: expectedReceipt.repository,
    parent_issue: expectedReceipt.parent_issue,
    run_id: expectedReceipt.run_id,
    allocation_id: expectedReceipt.allocation_id,
  };
  const expectedCheck = validateRunReceiptChain(expectedChain, binding);
  if (!expectedCheck.ok) return fail('active-receipt-fence-invalid', { detail: expectedCheck.reason });
  if (!Array.isArray(activeChain)) return fail('run-receipt-readback-invalid');
  const activeCheck = validateRunReceiptChain(activeChain, binding);
  if (!activeCheck.ok) return fail('active-receipt-chain-invalid', { detail: activeCheck.reason });
  const invalidated = activeChain.find((receipt) => ACTIVE_RECEIPT_INVALIDATORS.includes(receipt.receipt_type));
  if (invalidated) return fail('active-receipt-invalidated', {
    receipt_id: invalidated.receipt_id, receipt_type: invalidated.receipt_type,
  });
  if (expectedChain[0]?.receipt_id !== required.started_receipt_id
    || expectedChain[0]?.sequence !== required.started_sequence
    || activeChain[0]?.receipt_id !== expectedChain[0]?.receipt_id
    || activeChain.at(-1)?.receipt_id !== required.receipt_id
    || !same(activeChain.at(-1), expectedReceipt)
    || !same(activeChain, expectedChain)) return fail('active-receipt-chain-changed');
  const tip = activeChain.at(-1);
  if (receiptFenceExpired(tip, now)) return fail('expired-fence', { active: true, advances_state: false });
  const lease = tip.lease;
  const preconditions = {
    run_id: tip.run_id,
    allocation_id: tip.allocation_id,
    started_receipt_id: activeChain[0].receipt_id,
    started_sequence: activeChain[0].sequence,
    chain_digest: digest(activeChain),
    chain_length: activeChain.length,
    tip_receipt_id: tip.receipt_id,
    tip_sequence: tip.sequence,
    tip_prior_receipt_id: tip.prior_receipt_id,
    tip_type: tip.receipt_type,
    lease_id: lease.lease_id,
    fence_id: lease.fence_id,
    fence_sequence: lease.fence_sequence,
    lease_issued_at: lease.issued_at,
    lease_expires_at: lease.expires_at,
  };
  return ok('ACTIVE_RECEIPT_FENCE_VALID', { receipts: clone(activeChain), preconditions });
}

function receiptBoundEvents(events) {
  return (Array.isArray(events) ? events : []).filter((event) => event?.schema === MANAGED_EVENT_SCHEMA
    && ((Array.isArray(event.consumed_receipt_ids) && event.consumed_receipt_ids.length) || event.receipt_id));
}

function readDurableReceiptInventory(store, snapshot, events, activeChain) {
  if (store && typeof store.readAllReceipts === 'function') {
    let receiptsList;
    try { receiptsList = store.readAllReceipts(); } catch (_error) { return fail('run-receipt-readback-failed'); }
    if (!Array.isArray(receiptsList)) return fail('run-receipt-readback-invalid');
    return ok('DURABLE_RECEIPT_INVENTORY_READ', { receipts: receiptsList });
  }
  if (Array.isArray(snapshot?.receipts)) {
    if (!Array.isArray(activeChain) || !activeChain.length) return ok('DURABLE_RECEIPT_INVENTORY_READ', { receipts: snapshot.receipts });
    const activeRunId = activeChain[0].run_id;
    const historical = snapshot.receipts.filter((receipt) => receipt?.run_id !== activeRunId);
    return ok('DURABLE_RECEIPT_INVENTORY_READ', { receipts: [...historical, ...activeChain] });
  }
  const claimed = receiptBoundEvents(events);
  if (!claimed.length) return ok('DURABLE_RECEIPT_INVENTORY_NOT_REQUIRED', { receipts: activeChain });
  const activeIds = new Set((activeChain || []).map((receipt) => receipt.receipt_id));
  if (Array.isArray(activeChain) && claimed.every((event) => [event.receipt_id, ...(event.consumed_receipt_ids || [])]
    .filter(Boolean).every((receiptId) => activeIds.has(receiptId)))) {
    return ok('DURABLE_RECEIPT_INVENTORY_READ', { receipts: activeChain });
  }
  return fail('receipt-inventory-not-durable');
}

function canAdvanceFromTerminal(input = {}) {
  const terminal = input.receipt || input.terminal;
  const chain = validateRunReceiptChain(input.receipts || (terminal ? [terminal] : []), { repository: input.repository, parent_issue: input.parent_issue });
  if (!chain.ok) return chain;
  if (!terminal || !TERMINAL_RECEIPT_TYPES.includes(terminal.receipt_type)) return fail('terminal-receipt-required');
  if (input.terminal_persisted !== true) return fail('terminal-persistence-required');
  if (receiptFenceExpired(terminal, input.now || new Date())
    || input.superseded_fence_id === terminal.lease.fence_id
    || input.expected_fence_sequence !== undefined && terminal.lease.fence_sequence !== input.expected_fence_sequence
    || input.minimum_fence_sequence !== undefined && terminal.lease.fence_sequence < input.minimum_fence_sequence) {
    return fail('expired-fence', { historical: true, advances_state: false });
  }
  return ok('TERMINAL_DURABLE_AND_ADVANCEABLE', { receipt_id: terminal.receipt_id, advances_state: true });
}
function consumeTerminalEvidence(input = {}) {
  const result = canAdvanceFromTerminal(input);
  return result.ok ? result : result.reason === 'expired-fence'
    ? fail('expired-fence-evidence-historical-only', { historical: true, advances_state: false })
    : result;
}
function candidateMatches(expected, actual) {
  if (!expected || !actual) return false;
  return ['pr', 'branch', 'base_ref', 'base_sha', 'head', 'tree', 'version', 'epoch_id'].every((key) => expected[key] === actual[key]);
}
function transitionConflict(input) {
  return input.conflicting_transition === true || input.preview_conflict === true
    || Array.isArray(input.transitions) && input.transitions.some((entry) => entry.conflict === true);
}
function classifyRecovery(input = {}) {
  const expectedCandidate = input.expected_candidate || input.candidate_binding || input.expected?.candidate;
  const actualCandidate = input.actual_candidate || input.candidate;
  if (expectedCandidate && actualCandidate && !candidateMatches(expectedCandidate, actualCandidate)) return {
    ok: true, status: 'STALE_CANDIDATE', code: 'RECOVERY_STALE_CANDIDATE', advances_state: false, reason: 'candidate-binding-mismatch',
  };
  if (input.stale_candidate === true) return { ok: true, status: 'STALE_CANDIDATE', code: 'RECOVERY_STALE_CANDIDATE', advances_state: false };
  if (transitionConflict(input)) return { ok: true, status: 'CONFLICTING_TRANSITION', code: 'RECOVERY_CONFLICTING_TRANSITION', advances_state: false };
  const fence = input.receipt || input.terminal || input.fence;
  if (input.expired_fence === true || fence && input.now && receiptFenceExpired(fence, input.now)
    || input.superseded_fence === true || input.superseded_fence_id && fence?.lease?.fence_id === input.superseded_fence_id) {
    return { ok: true, status: 'EXPIRED_FENCE', code: 'RECOVERY_EXPIRED_FENCE', advances_state: false, historical: true };
  }
  if (input.g4_terminal && input.web_decision_required !== true && input.g4_adjudicated !== true) return {
    ok: true, status: 'G4_UNADJUDICATED', code: 'RECOVERY_G4_UNADJUDICATED', advances_state: false, web_decision_required: true,
  };
  if (input.g4_terminal && input.web_decision_required === true || input.web_decision_required === true) return {
    ok: true, status: 'WEB_DECISION_REQUIRED', code: 'RECOVERY_WEB_DECISION_REQUIRED', advances_state: false,
  };
  if (input.previewed === true && input.applied !== true) return { ok: true, status: 'PREVIEWED_NOT_APPLIED', code: 'RECOVERY_PREVIEWED_NOT_APPLIED', advances_state: false };
  if (input.applied === true && input.acknowledged !== true) return { ok: true, status: 'APPLIED_ACK_LOST', code: 'RECOVERY_APPLIED_ACK_LOST', advances_state: false, readback_required: true };
  if (input.applied === true && input.readback_verified === true || input.already_applied === true) return { ok: true, status: 'ALREADY_APPLIED', code: 'RECOVERY_ALREADY_APPLIED', advances_state: false, readback_verified: true };
  if (input.terminal && input.terminal_persisted !== true || input.terminal_unconsumed === true) return { ok: true, status: 'TERMINAL_UNCONSUMED', code: 'RECOVERY_TERMINAL_UNCONSUMED', advances_state: false };
  if (input.running === true || input.status === 'RUNNING') return { ok: true, status: 'RUNNING', code: 'RECOVERY_RUNNING', advances_state: false };
  if (input.lost === true || input.status === 'LOST') return { ok: true, status: 'LOST', code: 'RECOVERY_LOST', advances_state: false, replay_allowed: true };
  if (input.decision_required === true) return { ok: true, status: 'WEB_DECISION_REQUIRED', code: 'RECOVERY_WEB_DECISION_REQUIRED', advances_state: false };
  return { ok: true, status: 'LOST', code: 'RECOVERY_LOST', advances_state: false, replay_allowed: true };
}
function recoverRun(input = {}) { return classifyRecovery(input); }

function validateWriterAction(input = {}) {
  const actor = input.actor || input.writer;
  const action = input.action || input.kind;
  const allowed = {
    EXECUTOR: new Set(['code', 'candidate', 'structured-evidence', 'evidence']),
    G4: new Set(['structured-evidence', 'evidence', 'read-only-evidence']),
    LOOP_MANAGER: new Set(['receipt', 'receipt-persistence', 'orchestration', 'invoke-reconciler']),
    RECONCILER: new Set(['canonical-state', 'programme-state', 'transition', 'projection']),
    WEB: new Set(['architecture', 'lock', 'material-judgement', 'g4', 'finality', 'authority']),
  };
  if (!allowed[actor] || !allowed[actor].has(action)) return fail('writer-ownership-violation', { actor, action });
  return ok('WRITER_ACTION_AUTHORISED', { actor, action });
}

function validateProgrammeOperations(operations) {
  if (!Array.isArray(operations)) return fail('programme-operation-inventory-invalid');
  for (const operation of operations) {
    const kind = typeof operation?.kind === 'string' ? operation.kind : '';
    if (CANONICAL_OPERATION_CLASSES.includes(kind)) continue;
    const detail = { operation_id: operation?.operation_id || null, kind: kind || null };
    if (/(?:^|[-_])(bootstrap|repository|repo)[-]?file(?:$|[-_])/i.test(kind)) return fail('repository-file-operation-forbidden', detail);
    if (/(?:receipt|evidence|operational)/i.test(kind)) return fail('receipt-evidence-operation-forbidden', detail);
    return fail('unknown-programme-operation-class', detail);
  }
  return ok('PROGRAMME_OPERATION_INVENTORY_VALID', { operation_count: operations.length });
}

function validateProgrammeOperationIntegrity(operations) {
  const inventory = validateProgrammeOperations(operations);
  if (!inventory.ok) return inventory;
  const allowedBindings = new Set(['required_relationship_operations', 'relationship_capability_digest', 'receipt_inventory_digest']);
  for (const operation of operations) {
    if (!isRecord(operation) || !exactKeys(operation, ['kind', 'target', 'before_digest', 'after', 'after_digest', 'operation_id'],
      ['required_relationship_operations', 'relationship_capability_digest', 'receipt_inventory_digest'])) {
      return fail('programme-operation-shape-invalid', { operation_id: operation?.operation_id || null });
    }
    if (!sha256(operation.before_digest) || !sha256(operation.after_digest) || !sha256(operation.operation_id)
      || operation.after_digest !== digest(operation.after)) return fail('programme-operation-digest-invalid', { operation_id: operation.operation_id });
    const unsigned = clone(operation);
    delete unsigned.operation_id;
    if (digest(unsigned) !== operation.operation_id) return fail('programme-operation-id-invalid', { operation_id: operation.operation_id });
    for (const key of Object.keys(operation)) if (['kind', 'target', 'before_digest', 'after', 'after_digest', 'operation_id'].includes(key) === false && !allowedBindings.has(key)) {
      return fail('programme-operation-binding-invalid', { operation_id: operation.operation_id, key });
    }
    if (operation.required_relationship_operations !== undefined
      && (!arrayOf(operation.required_relationship_operations, safeId, 20)
        || new Set(operation.required_relationship_operations).size !== operation.required_relationship_operations.length)) {
      return fail('programme-operation-binding-invalid', { operation_id: operation.operation_id });
    }
    if (operation.relationship_capability_digest !== undefined && !sha256(operation.relationship_capability_digest)
      || operation.receipt_inventory_digest !== undefined && !sha256(operation.receipt_inventory_digest)) {
      return fail('programme-operation-binding-invalid', { operation_id: operation.operation_id });
    }
  }
  return ok('PROGRAMME_OPERATION_INTEGRITY_VALID', {
    operation_count: operations.length,
    operations_digest: digest(operations),
    operation_binding_digest: operationBindingDigest(operations),
    ordered_operation_ids: operations.map((operation) => operation.operation_id),
  });
}

function validContractPath(value) {
  return typeof value === 'string' && /^(?:repo|\.github)\/[A-Za-z0-9._/-]+$/.test(value) && !value.includes('..');
}
function validateResolvedToolkitContract(bootstrap, expected = {}) {
  const pin = bootstrap.toolkit_contract;
  if (expected.toolkit_contract !== undefined) {
    const requested = expected.toolkit_contract;
    for (const key of ['repository', 'revision', 'path', 'sha256']) {
      if (requested[key] !== undefined && requested[key] !== pin[key]) return fail('toolkit-contract-' + key + '-mismatch');
    }
  }
  const supplied = expected.resolved_contract !== undefined ? expected.resolved_contract
    : expected.contract_bytes !== undefined ? expected.contract_bytes
      : expected.toolkit_contract_bytes;
  const strict = expected.require_pinned_resolution === true;
  if (strict && bootstrap.toolkit_contract.revision === BOOTSTRAP_REVISION) return fail('toolkit-contract-resolution-required');
  const verifyMetadata = (resolved) => {
    if (!strict) return ok('TOOLKIT_CONTRACT_METADATA_UNCHECKED');
    if (!isRecord(resolved) || resolved.repository !== bootstrap.toolkit_contract.repository
      || resolved.revision !== bootstrap.toolkit_contract.revision || resolved.path !== bootstrap.toolkit_contract.path) {
      return fail('toolkit-contract-resolution-mismatch');
    }
    if (resolved.sha256 !== undefined && resolved.sha256 !== bootstrap.toolkit_contract.sha256) return fail('toolkit-contract-digest-mismatch');
    return ok('TOOLKIT_CONTRACT_METADATA_VERIFIED');
  };
  const verifyContent = (content) => {
    let actual;
    try {
      if (typeof content === 'string') {
        const parsed = JSON.parse(content);
        actual = digest(parsed);
      } else if (Buffer.isBuffer(content) || content instanceof Uint8Array) {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(content));
        const parsed = JSON.parse(decoded);
        actual = digest(parsed);
      } else {
        actual = digest(content);
      }
    } catch (_error) { return fail('toolkit-contract-content-invalid'); }
    return actual === pin.sha256 ? ok('PINNED_TOOLKIT_CONTRACT_VERIFIED', { contract_digest: actual }) : fail('toolkit-contract-digest-mismatch', { expected: pin.sha256, actual });
  };
  if (supplied !== undefined) {
    const metadata = verifyMetadata(supplied);
    if (!metadata.ok) return metadata;
    if (strict && !isRecord(supplied)) return fail('toolkit-contract-resolution-required');
    const content = !strict
      ? isRecord(supplied) && (supplied.bytes !== undefined || supplied.content !== undefined || supplied.contract !== undefined)
        ? supplied.bytes === undefined ? supplied.content === undefined ? supplied.contract : supplied.content : supplied.bytes
        : supplied
      : supplied.bytes === undefined ? supplied.content === undefined ? supplied.contract : supplied.content : supplied.bytes;
    if (content === undefined) return fail('toolkit-contract-resolution-required');
    return verifyContent(content);
  }
  if (typeof expected.resolve_contract === 'function') {
    let resolved;
    try { resolved = expected.resolve_contract(clone(pin)); } catch (_error) { return fail('toolkit-contract-resolution-failed'); }
    if (!resolved) return fail('toolkit-contract-resolution-failed');
    const metadata = verifyMetadata(resolved);
    if (!metadata.ok) return metadata;
    const content = resolved?.bytes === undefined ? resolved?.content === undefined ? resolved?.contract === undefined ? resolved : resolved.contract : resolved.content : resolved.bytes;
    if (content === undefined) return fail('toolkit-contract-resolution-failed');
    return verifyContent(content);
  }
  if (expected.require_pinned_resolution === true) return fail('toolkit-contract-resolution-required');
  return ok('PINNED_TOOLKIT_CONTRACT_UNRESOLVED', { contract_digest: pin.sha256, resolution_required: true });
}

function validateControllerBootstrap(bootstrap, expected = {}) {
  if (!isRecord(bootstrap) || !exactKeys(bootstrap, ['schema', 'profile', 'repository', 'parent_issue', 'programme_state_schema', 'surface_contract_schema', 'toolkit_package_version', 'toolkit_contract', 'conformance', 'compatibility'], ['$schema'])
    || bootstrap.schema !== BOOTSTRAP_SCHEMA || bootstrap.profile !== 'github-managed-programme'
    || !SAFE_REPOSITORY.test(bootstrap.repository) || !issue(bootstrap.parent_issue)
    || bootstrap.programme_state_schema !== STATE_SCHEMA || bootstrap.surface_contract_schema !== SURFACE_CONTRACT.$schema
    || !/^\d+\.\d+\.\d+$/.test(bootstrap.toolkit_package_version)
    || !exactKeys(bootstrap.toolkit_contract, ['repository', 'revision', 'path', 'sha256'])
    || bootstrap.toolkit_contract.repository !== TOOLKIT_CONTRACT_REPOSITORY || !sha(bootstrap.toolkit_contract.revision)
    || !validContractPath(bootstrap.toolkit_contract.path) || bootstrap.toolkit_contract.path !== TOOLKIT_CONTRACT_PATH
    || !sha256(bootstrap.toolkit_contract.sha256)
    || !exactKeys(bootstrap.conformance, ['required_class', 'migration_from'])
    || bootstrap.conformance.required_class !== 'CURRENT_MANAGED'
    || !arrayOf(bootstrap.conformance.migration_from, (entry) => entry === 'toolkit.github-program.state.v4', 10)
    || !bootstrap.conformance.migration_from.length
    || !exactKeys(bootstrap.compatibility, ['fail_closed_on_unknown_major'])
    || bootstrap.compatibility.fail_closed_on_unknown_major !== true) return fail('bootstrap-invalid');
  if (Number(bootstrap.toolkit_package_version.split('.')[0]) !== 2) return fail('bootstrap-unknown-major');
  if (expected.repository !== undefined && bootstrap.repository !== expected.repository) return fail('bootstrap-repository-mismatch');
  if (expected.parent_issue !== undefined && bootstrap.parent_issue !== expected.parent_issue) return fail('bootstrap-parent-mismatch');
  if (expected.version !== undefined && bootstrap.toolkit_package_version !== expected.version) return fail('bootstrap-version-mismatch');
  if (expected.revision !== undefined && bootstrap.toolkit_contract.revision !== expected.revision) return fail('bootstrap-revision-mismatch');
  const resolved = validateResolvedToolkitContract(bootstrap, expected);
  if (!resolved.ok) return resolved;
  return ok('CONTROLLER_BOOTSTRAP_VALID', {
    bootstrap: clone(bootstrap), pinned_contract_digest: bootstrap.toolkit_contract.sha256,
    toolkit_contract: clone(bootstrap.toolkit_contract), contract_resolution: resolved.code,
  });
}
function resolvePinnedContract(bootstrap, expected = {}) {
  const valid = validateControllerBootstrap(bootstrap, { ...expected, require_pinned_resolution: true });
  if (!valid.ok) return valid;
  return ok('PINNED_CONTRACT_RESOLVED', {
    bootstrap: clone(bootstrap),
    repository: bootstrap.repository, parent_issue: bootstrap.parent_issue, version: bootstrap.toolkit_package_version,
    profile: bootstrap.profile, toolkit_contract: clone(bootstrap.toolkit_contract),
    contract_digest: bootstrap.toolkit_contract.sha256, programme_state_schema: bootstrap.programme_state_schema,
    surface_contract_schema: bootstrap.surface_contract_schema,
  });
}

function independentBootstrapRevision(input = {}, options = {}) {
  if (hasOwn(input, 'bootstrap_revision') && input.bootstrap_revision !== undefined) return input.bootstrap_revision;
  if (hasOwn(input, 'expected_bootstrap_revision') && input.expected_bootstrap_revision !== undefined) return input.expected_bootstrap_revision;
  if (hasOwn(options, 'bootstrap_revision') && options.bootstrap_revision !== undefined) return options.bootstrap_revision;
  if (hasOwn(options, 'expected_bootstrap_revision') && options.expected_bootstrap_revision !== undefined) return options.expected_bootstrap_revision;
  return undefined;
}

function detectManagedRepository(input = {}) {
  const bootstrap = input.bootstrap;
  const hasV5 = input.canonical_state?.schema === STATE_SCHEMA || input.state_schema === STATE_SCHEMA;
  const hasV4 = input.canonical_state?.schema === 'toolkit.github-program.state.v4' || input.state_schema === 'toolkit.github-program.state.v4';
  const hasEvents = Array.isArray(input.managed_events) && input.managed_events.length > 0;
  if (bootstrap !== undefined && bootstrap !== null) {
    const valid = validateControllerBootstrap(bootstrap, {
      repository: input.repository,
      parent_issue: input.parent_issue,
      version: input.version,
    });
    if (!valid.ok) return { ok: true, classification: 'DRIFTED_MANAGED', managed: true, fail_closed: true, code: valid.code, reason: valid.reason };
    return { ok: true, classification: 'CURRENT_MANAGED', managed: true, fail_closed: false, bootstrap: valid.bootstrap };
  }
  if (hasV5) return { ok: true, classification: 'DRIFTED_MANAGED', managed: true, fail_closed: true, code: 'PARENT_RECONCILIATION_INCOMPLETE', reason: 'v5-bootstrap-missing' };
  if (hasV4 || hasEvents) return { ok: true, classification: 'LEGACY_MANAGED', managed: true, fail_closed: false };
  return { ok: true, classification: 'UNMANAGED', managed: false, fail_closed: false };
}

function inspectControllerContext(input = {}) {
  const read = typeof input.read === 'function' ? input.read : null;
  let readFailure = null;
  const readDirect = (path, fallback = null) => {
    try {
      if (typeof input['read_' + path] === 'function') return input['read_' + path]();
      if (read) return read(path);
    } catch (_error) {
      readFailure = path;
      return undefined;
    }
    return fallback;
  };
  const bootstrap = input.bootstrap !== undefined ? input.bootstrap : readDirect('.github/ai-agent-toolkit-programme.json');
  const detection = detectManagedRepository({ ...input, bootstrap });
  const paths = ['.github/ai-agent-toolkit-programme.json'];
  if (!detection.managed) return ok('UNMANAGED_REPOSITORY', { detection, paths });
  if (detection.classification === 'DRIFTED_MANAGED') return fail('v5-bootstrap-invalid-or-missing', { detection, paths });
  const pinned = input.resolve_contract || input.contract_bytes || input.toolkit_contract_bytes
    ? resolvePinnedContract(bootstrap, {
      repository: input.repository, parent_issue: input.parent_issue,
      resolve_contract: input.resolve_contract, contract_bytes: input.contract_bytes,
      toolkit_contract_bytes: input.toolkit_contract_bytes,
    })
    : validateControllerBootstrap(bootstrap, { repository: input.repository, parent_issue: input.parent_issue });
  if (!pinned.ok) return pinned;
  const pinnedBootstrap = pinned.bootstrap || bootstrap;
  const parentIssue = pinnedBootstrap.parent_issue;
  const parent = input.parent_body !== undefined ? input.parent_body : readDirect('issue/' + parentIssue + '/body');
  const children = input.children !== undefined ? input.children : readDirect('issue/' + parentIssue + '/children', {});
  const prs = input.prs !== undefined ? input.prs : readDirect('parent/' + parentIssue + '/prs', {});
  const managedEvents = input.managed_events !== undefined ? input.managed_events : readDirect('managed-events', []);
  const receiptList = input.receipts !== undefined ? input.receipts : readDirect('run-receipts', []);
  const native = input.native !== undefined ? input.native : readDirect('issue/' + parentIssue + '/native-relationships', null);
  const checks = input.checks !== undefined ? input.checks : readDirect('issue/' + parentIssue + '/checks', {});
  const reviews = input.reviews !== undefined ? input.reviews : readDirect('issue/' + parentIssue + '/reviews', {});
  paths.push(
    'issue/' + parentIssue + '/body', 'issue/' + parentIssue + '/children', 'parent/' + parentIssue + '/prs',
    'managed-events', 'run-receipts', 'issue/' + parentIssue + '/native-relationships',
    'issue/' + parentIssue + '/checks', 'issue/' + parentIssue + '/reviews'
  );
  const requiredReads = { parent, children, prs, managed_events: managedEvents, receipts: receiptList, native, checks, reviews };
  if (readFailure) return fail('required-controller-inspection-read-failed', { detection, pinned: pinned.bootstrap, failed_path: readFailure, paths });
  const missing = Object.entries(requiredReads).filter(([, value]) => value === undefined || value === null).map(([key]) => key);
  if (missing.length) return fail('required-controller-inspection-missing', { detection, pinned: pinned.bootstrap, missing, paths });
  return ok('CONTROLLER_CONTEXT_INSPECTED', {
    detection, pinned: pinnedBootstrap, parent, children, prs, managed_events: managedEvents,
    receipts: receiptList, native, checks, reviews, paths, repository_scan: false,
  });
}

function buildBootstrap(input = {}) {
  return {
    $schema: BOOTSTRAP_SCHEMA,
    schema: BOOTSTRAP_SCHEMA,
    profile: 'github-managed-programme',
    repository: input.repository,
    parent_issue: input.parent_issue,
    programme_state_schema: STATE_SCHEMA,
    surface_contract_schema: SURFACE_CONTRACT.$schema,
    toolkit_package_version: input.version || input.toolkit_package_version || '2.11.0',
    toolkit_contract: {
      repository: input.toolkit_contract?.repository || input.toolkit_contract_repository || TOOLKIT_CONTRACT_REPOSITORY,
      revision: input.toolkit_contract?.revision || input.revision || BOOTSTRAP_REVISION,
      path: input.toolkit_contract?.path || TOOLKIT_CONTRACT_PATH,
      sha256: input.toolkit_contract?.sha256 || digest(SURFACE_CONTRACT),
    },
    conformance: { required_class: 'CURRENT_MANAGED', migration_from: ['toolkit.github-program.state.v4'] },
    compatibility: { fail_closed_on_unknown_major: true },
  };
}
function validateBootstrapForProgramme(bootstrap, repository, parentIssue, version = '2.11.0') {
  return validateControllerBootstrap(bootstrap, { repository, parent_issue: parentIssue, version });
}

function materializeBody(currentBody, kind, renderedBody, expected) {
  if (currentBody === null || currentBody === undefined) return ok('MANAGED_BODY_INITIALISED', { body: renderedBody });
  const currentV5 = parseProgrammeV5Body(currentBody, {
    kind, repository: expected.repository, parent_issue: expected.parent_issue, number: expected.number,
  });
  if (currentV5.ok) return ok('MANAGED_BODY_MATERIALISED', { body: currentV5.prefix + renderedBody + currentV5.suffix });
  const currentV4 = v4.parseProgrammeV4Body(currentBody, {
    kind, repository: expected.repository, parent_issue: expected.parent_issue, number: expected.number,
  });
  if (!currentV4.ok) return fail('current-body-requires-explicit-migration', { kind, number: expected.number, detail: currentV4.reason });
  return ok('MANAGED_BODY_MIGRATED', { body: currentV4.prefix + renderedBody + currentV4.suffix });
}

function validateMaterializedBodies(bodies) {
  if (!isRecord(bodies) || typeof bodies.parent !== 'string' || !isRecord(bodies.children) || !isRecord(bodies.prs)) return fail('materialized-body-inventory-invalid');
  const entries = [['parent', String(0), bodies.parent]];
  for (const [number, body] of Object.entries(bodies.children)) entries.push(['child', number, body]);
  for (const [number, body] of Object.entries(bodies.prs)) entries.push(['pr', number, body]);
  let total = 0;
  for (const [kind, number, body] of entries) {
    if (typeof body !== 'string') return fail('materialized-body-inventory-invalid', { kind, number: Number(number) || number });
    const actual = bytes(body);
    total += actual;
    if (actual > BODY_BUDGET_BYTES) return fail('materialized-body-byte-budget-exceeded', { kind, number: Number(number) || number, limit: BODY_BUDGET_BYTES, actual });
  }
  if (total > TOTAL_PROJECTION_BUDGET_BYTES) return fail('materialized-body-total-byte-budget-exceeded', { limit: TOTAL_PROJECTION_BUDGET_BYTES, actual: total });
  return ok('MATERIALIZED_BODY_BUDGETS_VALID', { total_materialized_body_bytes: total });
}

function expectedNativeRelationshipsV5(state, before = {}) {
  const associations = derivePrAssociationsV5(state);
  if (!associations.ok) return associations;
  const beforeChildren = Array.isArray(before.children) ? before.children : [];
  const children = [...new Set([...beforeChildren, ...state.children.map((child) => child.issue)])];
  const dependencies = clone(before.dependencies || {});
  for (const child of state.children) dependencies[String(child.issue)] = clone(child.dependencies);
  const associatedPrs = [...new Set([...(Array.isArray(before.associated_prs) ? before.associated_prs : []), ...state.prs.map((pr) => pr.number)])];
  const prAssociations = clone(before.pr_associations || {});
  for (const [number, association] of Object.entries(associations.associations)) prAssociations[number] = association;
  return ok('PROGRAMME_V5_NATIVE_RELATIONSHIPS_DERIVED', {
    native: {
      children, dependencies, associated_prs: associatedPrs, pr_associations: prAssociations,
      api_version: before.api_version || '2022-11-28',
    },
  });
}

function validateMigrationInput(snapshot) {
  if (!isRecord(snapshot) || snapshot.complete !== true || !safeLine(snapshot.repository, 200)
    || !safeLine(snapshot.revision, 256) || !isRecord(snapshot.bodies)
    || !isRecord(snapshot.bodies.children) || !isRecord(snapshot.bodies.prs)
    || !isRecord(snapshot.labels) || !Array.isArray(snapshot.managed_events)
    || !isRecord(snapshot.native) || snapshot.receipts !== undefined && !Array.isArray(snapshot.receipts)) return fail('migration-input-incomplete');
  return ok('MIGRATION_INPUT_VALID');
}

function receiptContext(input, state, candidate, operationDigestValue, detailDigestValue) {
  const context = input.receipt_context || input;
  const suppliedChain = context.canonical_started_chain || context.started_chain || context.receipt_chain;
  if (!Array.isArray(suppliedChain) || suppliedChain.length < 1) return fail('canonical-started-chain-required');
  if (!safeLine(context.authority_ref, 512)) return fail('transition-authority-ref-invalid');
  const chain = validateRunReceiptChain(suppliedChain, {
    repository: state.repository, parent_issue: state.parent.issue,
  });
  if (!chain.ok) return chain;
  const started = chain.receipts[0];
  const prior = chain.receipts.at(-1);
  if (context.run_id !== undefined && context.run_id !== started.run_id
    || context.allocation_id !== undefined && context.allocation_id !== started.allocation_id
    || context.authority !== undefined && !same(context.authority, started.authority)
    || context.start !== undefined && !same(context.start, started.start)
    || context.lease !== undefined && !same(context.lease, prior.lease)
    || context.lock !== undefined && context.lock !== prior.lock) return fail('canonical-started-chain-binding-mismatch');
  if (ACTIVE_RECEIPT_INVALIDATORS.includes(prior.receipt_type)) return fail('canonical-started-chain-terminal');
  const child = state.children.find((entry) => entry.issue === (context.child_issue || state.active_lanes[0]?.child_issue)) || state.children[0];
  if (!child || started.child_issue !== child.issue) return fail('canonical-started-chain-child-mismatch');
  const lane = state.active_lanes.find((entry) => entry.child_issue === child.issue) || state.active_lanes[0] || null;
  const epoch = child.epochs.find((entry) => entry.id === (context.epoch_id || lane?.epoch_id)) || child.epochs[0];
  const transitionInput = context.transition_receipt || context.transition;
  let transition;
  if (transitionInput !== undefined) {
    const transitionCheck = validateReceiptObject(transitionInput, {
      repository: state.repository, parent_issue: state.parent.issue,
      run_id: started.run_id, allocation_id: started.allocation_id,
      child_issue: started.child_issue, receipt_type: 'TRANSITION_PREVIEW',
      sequence: prior.sequence + 1, prior_receipt_id: prior.receipt_id,
      detail_digest: detailDigestValue, operation_digest: operationDigestValue,
      candidate,
    });
    if (!transitionCheck.ok) return transitionCheck;
    transition = clone(transitionInput);
  } else {
    const timestamp = context.transition_created_at || context.created_at || new Date().toISOString();
    if (!isoTimestamp(timestamp) || Date.parse(timestamp) < Date.parse(prior.created_at)) return fail('transition-receipt-chronology-invalid');
    transition = createRunReceipt({
      receipt_type: 'TRANSITION_PREVIEW', sequence: prior.sequence + 1, prior_receipt_id: prior.receipt_id,
      run_id: started.run_id, allocation_id: started.allocation_id,
      repository: state.repository, parent_issue: state.parent.issue, child_issue: started.child_issue,
      lock: prior.lock, authority: prior.authority, start: prior.start, candidate,
      lease: prior.lease,
      payload: {
        classification: 'TRANSITION_PREVIEW', detail_digest: detailDigestValue,
        operation_digest: operationDigestValue, mutation_outcome: 'KNOWN',
      },
      created_at: timestamp,
    });
    const transitionCheck = validateReceiptObject(transition, {
      repository: state.repository, parent_issue: state.parent.issue,
      run_id: started.run_id, allocation_id: started.allocation_id,
      child_issue: started.child_issue, receipt_type: 'TRANSITION_PREVIEW',
      sequence: prior.sequence + 1, prior_receipt_id: prior.receipt_id,
      detail_digest: detailDigestValue, operation_digest: operationDigestValue,
      candidate,
    });
    if (!transitionCheck.ok) return transitionCheck;
  }
  const fullChain = prior.receipt_id === transition.prior_receipt_id && chain.receipts.at(-1).receipt_id === transition.prior_receipt_id
    ? [...chain.receipts, transition]
    : chain.receipts.some((receipt) => receipt.receipt_id === transition.receipt_id)
      ? chain.receipts
      : [...chain.receipts, transition];
  const fullChainCheck = validateRunReceiptChain(fullChain, {
    repository: state.repository, parent_issue: state.parent.issue,
  });
  if (!fullChainCheck.ok) return fullChainCheck;
  const common = {
    run_id: started.run_id,
    allocation_id: started.allocation_id,
    repository: state.repository,
    parent_issue: state.parent.issue,
    child_issue: started.child_issue,
    lock: prior.lock || epoch.lock,
    authority: clone(started.authority),
    start: clone(started.start),
    lease: clone(prior.lease),
    authority_digest: context.authority_digest || digest(started.authority),
    authority_ref: context.authority_ref,
  };
  return ok('TRANSITION_RECEIPTS_BUILT', {
    receipts: fullChainCheck.receipts,
    started,
    transition,
    child_issue: common.child_issue,
    lane_id: context.lane_id || lane?.lane_id || null,
    epoch_id: context.epoch_id || lane?.epoch_id || epoch.id,
    gate: context.gate || lane?.gate || epoch.gates[0],
    lock: common.lock,
    authority_ref: common.authority_ref,
    authority_digest: common.authority_digest,
  });
}

function managedEventForTransition(input) {
  const event = createManagedEventV3(input);
  const valid = validateManagedEventV3(event, { repository: input.repository, parent_issue: input.parent_issue });
  return valid.ok ? ok('MANAGED_EVENT_V3_BUILT', { event }) : valid;
}

function bodyDigestInventory(bodies) {
  return {
    parent: digest(bodies.parent),
    children: Object.fromEntries(Object.entries(bodies.children || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([key, value]) => [key, digest(value)])),
    prs: Object.fromEntries(Object.entries(bodies.prs || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([key, value]) => [key, digest(value)])),
  };
}

function requireBodyInventory(snapshot, state) {
  if (typeof snapshot.bodies?.parent !== 'string') return fail('required-body-inspection-missing', { kind: 'parent', number: state.parent.issue });
  for (const child of state.children) {
    if (typeof snapshot.bodies.children?.[String(child.issue)] !== 'string') return fail('required-body-inspection-missing', { kind: 'child', number: child.issue });
  }
  for (const pr of state.prs) {
    if (typeof snapshot.bodies.prs?.[String(pr.number)] !== 'string') return fail('required-body-inspection-missing', { kind: 'pr', number: pr.number });
  }
  return ok('REQUIRED_BODY_INVENTORY_PRESENT');
}

function buildMigrationPreviewV5(input = {}) {
  const inputValid = validateMigrationInput(input.legacy_snapshot);
  if (!inputValid.ok) return inputValid;
  const snapshot = input.legacy_snapshot;
  const parentIssue = input.parent_issue || snapshot.canonical_state?.parent?.issue;
  if (!issue(parentIssue)) return fail('migration-parent-identity-required');
  const source = parseV4CanonicalSnapshot(snapshot, snapshot.repository, parentIssue);
  if (!source.ok) return source;
  const bodyCheck = parseV4Bodies(snapshot, source.state);
  if (!bodyCheck.ok) return fail('v4-body-inventory-invalid', { detail: bodyCheck.reason });
  const currentEvents = validateManagedEventInventoryV5(snapshot.managed_events, snapshot.repository, {
    parent_issue: parentIssue, receipts: snapshot.receipts,
  });
  if (!currentEvents.ok) return currentEvents;
  const migrated = migrateV4ToV5(source.state, {
    authority_ref: input.authority_ref,
    authority_evidence_id: input.authority_evidence_id,
    concurrency_authority: input.concurrency_authority,
    live_candidate: input.live_candidate || input.candidate,
  });
  if (!migrated.ok) return migrated;
  const target = migrated.state;
  const targetValid = validateCanonicalStateV5(target);
  if (!targetValid.ok) return targetValid;
  const trust = inspectTrustBindingsV5(target, input.scope_grant, input.broker);
  if (!trust.ok) return trust;
  const rendered = renderProgrammeV5(target);
  if (!rendered.ok) return rendered;
  const integrity = verifyRenderedProgrammeIntegrityV5(target, rendered);
  if (!integrity.ok) return integrity;
  const bodies = { parent: null, children: clone(snapshot.bodies.children), prs: clone(snapshot.bodies.prs) };
  const parentBody = materializeBody(snapshot.bodies.parent, 'parent', rendered.bodies.parent, {
    repository: target.repository, parent_issue: target.parent.issue, number: target.parent.issue,
  });
  if (!parentBody.ok) return parentBody;
  bodies.parent = parentBody.body;
  for (const child of target.children) {
    const materialized = materializeBody(snapshot.bodies.children[String(child.issue)], 'child', rendered.bodies.children[String(child.issue)], {
      repository: target.repository, parent_issue: target.parent.issue, number: child.issue,
    });
    if (!materialized.ok) return materialized;
    bodies.children[String(child.issue)] = materialized.body;
  }
  for (const pr of target.prs) {
    const materialized = materializeBody(snapshot.bodies.prs[String(pr.number)], 'pr', rendered.bodies.prs[String(pr.number)], {
      repository: target.repository, parent_issue: target.parent.issue, number: pr.number,
    });
    if (!materialized.ok) return materialized;
    bodies.prs[String(pr.number)] = materialized.body;
  }
  const materializedBodies = validateMaterializedBodies(bodies);
  if (!materializedBodies.ok) return materializedBodies;
  const native = expectedNativeRelationshipsV5(target, snapshot.native);
  if (!native.ok) return native;
  const relationshipDelta = classifyRelationshipDeltaV5(snapshot.native, native.native);
  if (!relationshipDelta.ok) return relationshipDelta;
  const relationshipCapability = requireRelationshipCapabilitiesV5(input.scope_grant, relationshipDelta.required_relationship_operations);
  if (!relationshipCapability.ok) return relationshipCapability;
  const labels = expectedLabelsV5(target, snapshot.labels);
  const bootstrapBefore = snapshot.bootstrap === undefined ? null : clone(snapshot.bootstrap);
  const bootstrapRevision = input.bootstrap_revision !== undefined ? input.bootstrap_revision : input.expected_bootstrap_revision;
  const bootstrapAfter = input.bootstrap_after || input.bootstrap || buildBootstrap({
    repository: target.repository, parent_issue: target.parent.issue, version: input.toolkit_version || '2.11.0',
    revision: bootstrapRevision,
    toolkit_contract: input.toolkit_contract,
  });
  const bootstrapCheck = resolvePinnedContract(bootstrapAfter, {
    repository: target.repository, parent_issue: target.parent.issue,
    version: input.toolkit_version || '2.11.0', revision: independentBootstrapRevision(input),
    contract_bytes: input.contract_bytes, toolkit_contract_bytes: input.toolkit_contract_bytes,
    resolved_contract: input.resolved_contract, resolve_contract: input.resolve_contract,
  });
  if (!bootstrapCheck.ok) return bootstrapCheck;
  const operations = [];
  addOperation(operations, 'migrate-parent-body', target.parent.issue, snapshot.bodies.parent, bodies.parent);
  for (const child of target.children) addOperation(operations, 'migrate-child-body', child.issue, snapshot.bodies.children[String(child.issue)], bodies.children[String(child.issue)]);
  for (const pr of target.prs) addOperation(operations, 'migrate-pr-body', pr.number, snapshot.bodies.prs[String(pr.number)], bodies.prs[String(pr.number)]);
  addOperation(operations, 'labels', target.parent.issue, snapshot.labels, labels);
  addOperation(operations, 'native-relationships', target.parent.issue, snapshot.native, native.native, {
    required_relationship_operations: relationshipDelta.required_relationship_operations,
    relationship_capability_digest: relationshipCapability.relationship_capability_digest,
  });
  const sourceCanonicalDigest = source.canonical_digest;
  const previousEvent = snapshot.managed_events.at(-1)?.event_id || null;
  const eventBaseInput = {
    event_type: 'migration',
    repository: target.repository,
    parent_issue: target.parent.issue,
    entity: { kind: 'parent', number: target.parent.issue },
    source_state_schema: 'toolkit.github-program.state.v4',
    from_state_digest: sourceCanonicalDigest,
    to_state_digest: targetValid.canonical_digest,
    authority_ref: input.authority_ref,
    authority_digest: input.authority_digest || digest({ authority_ref: input.authority_ref, target_canonical_digest: targetValid.canonical_digest }),
    candidate_binding_digest: candidateBindingDigest(target),
    prior_event_id: previousEvent,
    receipt_id: null,
    consumed_receipt_ids: [],
    receipt_inventory_digest: null,
  };
  const eventBase = createManagedEventV3(eventBaseInput);
  const operationDigestValue = operationBindingDigest(operations);
  const receiptBuilt = receiptContext(input, target, target.active_lanes[0]?.candidate || null, operationDigestValue, transitionBindingDigest(eventBase));
  if (!receiptBuilt.ok) return receiptBuilt;
  const eventResult = managedEventForTransition({
    ...eventBaseInput,
    receipt_id: receiptBuilt.transition.receipt_id,
    consumed_receipt_ids: receiptBuilt.receipts.map((receipt) => receipt.receipt_id),
    receipt_inventory_digest: receiptInventoryDigest(receiptBuilt.receipts.map((receipt) => receipt.receipt_id)),
  });
  if (!eventResult.ok) return eventResult;
  const event = eventResult.event;
  const consumption = validateReceiptConsumption(event, receiptBuilt.receipts, {
    repository: target.repository, parent_issue: target.parent.issue, operation_digest: operationDigestValue,
  });
  if (!consumption.ok) return consumption;
  addOperation(operations, 'managed-event', target.parent.issue, null, event, {
    receipt_inventory_digest: event.receipt_inventory_digest,
  });
  const operationCheck = validateProgrammeOperationIntegrity(operations);
  if (!operationCheck.ok) return operationCheck;
  const targetEvents = [...snapshot.managed_events.map(clone), event];
  const targetEventInventory = validateManagedEventInventoryV5(targetEvents, target.repository, { skip_receipt_bindings: true });
  if (!targetEventInventory.ok) return targetEventInventory;
  const expectedSnapshot = {
    repository: target.repository, revision: snapshot.revision, complete: true, canonical_state: clone(target),
    bodies, labels, managed_events: targetEventInventory.events, native: native.native, bootstrap: bootstrapAfter,
  };
  const sourceBodyDigests = bodyDigestInventory(snapshot.bodies);
  const targetBodyDigests = bodyDigestInventory(bodies);
  const consumedIds = receiptBuilt.receipts.map((receipt) => receipt.receipt_id);
  const bootstrapCandidateDigest = digest(bootstrapAfter);
  const bootstrapConformance = {
    valid: true, repository: target.repository, parent_issue: target.parent.issue,
    apply_operation: false, ownership: 'repository-code-via-PR',
  };
  const managedEventDelta = {
    retained_count: snapshot.managed_events.length, new_events: [event],
    retained_history_digest: digest(snapshot.managed_events),
    target_inventory_digest: targetEventInventory.inventory_digest,
    consumed_receipt_ids: consumedIds, receipt_inventory_digest: receiptInventoryDigest(consumedIds),
  };
  const preview = {
    schema: MIGRATION_SCHEMA, preview_kind: 'MIGRATION', repository: target.repository, parent_issue: target.parent.issue,
    authority_ref: input.authority_ref, authority_digest: event.authority_digest,
    source_state_schema: 'toolkit.github-program.state.v4', target_state_schema: STATE_SCHEMA,
    expected_revision: snapshot.revision, source_snapshot_digest: snapshotDigest(snapshot),
    source_event_inventory_digest: currentEvents.inventory_digest,
    source_canonical_digest: sourceCanonicalDigest, source_body_digests: sourceBodyDigests,
    target_canonical_digest: targetValid.canonical_digest, target_managed_body_digests: rendered.body_digests,
    target_body_digests: targetBodyDigests, candidate_binding_digest: candidateBindingDigest(target),
    trusted_pr_inspection_digest: trust.trusted_pr_inspection_digest,
    trusted_relationship_inspection_digest: trust.trusted_relationship_inspection_digest,
    relationship_capability_digest: trust.relationship_capability_digest,
    required_relationship_operations: relationshipDelta.required_relationship_operations,
    bootstrap: { before: bootstrapBefore, candidate: bootstrapAfter, after: bootstrapAfter, candidate_digest: bootstrapCandidateDigest, conformance: bootstrapConformance },
    bootstrap_conformance: bootstrapConformance,
    labels: { before: clone(snapshot.labels), after: labels, changed: !same(snapshot.labels, labels) },
    native_relationships: { before: clone(snapshot.native), after: native.native, changed: relationshipDelta.changed, pr_associations: native.native.pr_associations },
    managed_event_delta: managedEventDelta,
    required_receipt_delta: {
      receipt_type: receiptBuilt.transition.receipt_type, receipt_id: receiptBuilt.transition.receipt_id,
      started_receipt_id: receiptBuilt.started.receipt_id, started_sequence: receiptBuilt.started.sequence,
      started_classification: receiptBuilt.started.payload.classification,
      receipt: clone(receiptBuilt.transition), chain: clone(receiptBuilt.receipts), durable_required: true,
      persisted_in_preview: false, persist_before_apply: true, readback_required: true,
      receipt_inventory_digest: receiptInventoryDigest(consumedIds),
      reason: 'Operational receipt is separate from canonical transition history.',
    },
    receipt_consumption_plan: {
      transition: 'PREVIEW_TO_AUTHORISED_APPLY', required_receipt_ids: consumedIds,
      receipt_inventory_digest: receiptInventoryDigest(consumedIds), persist_before_dependent_progression: true,
      read_back_before_apply: true, persisted_in_preview: false, on_missing_conflicting_or_stale: 'FAIL_CLOSED',
    },
    operations, operation_binding_digest: operationBindingDigest(operations),
    operations_digest: digest(operations), ordered_operation_ids: operations.map((operation) => operation.operation_id),
    expected_snapshot_digest: snapshotDigest(expectedSnapshot), expected_snapshot: expectedSnapshot,
    mutation_authority: 'NOT_GRANTED', finality_authority: 'NOT_GRANTED', preview_only: true,
  };
  preview.preview_id = digest(preview);
  return ok('PROGRAMME_V5_MIGRATION_PREVIEW_READY', preview);
}

function validateCurrentSnapshot(snapshot, desired, input = {}) {
  if (!isRecord(snapshot) || snapshot.complete !== true || snapshot.repository !== desired.repository
    || !safeLine(snapshot.revision, 256) || !isRecord(snapshot.bodies)
    || !isRecord(snapshot.labels) || !Array.isArray(snapshot.managed_events)
    || !isRecord(snapshot.native)) return fail('current-snapshot-incomplete');
  if (!isRecord(snapshot.canonical_state) || snapshot.canonical_state.schema !== STATE_SCHEMA) return fail('current-v5-state-missing');
  const stateValid = validateCanonicalStateV5(snapshot.canonical_state);
  if (!stateValid.ok) return fail('current-v5-state-invalid', { detail: stateValid.reason });
  if (snapshot.canonical_state.repository !== desired.repository
    || snapshot.canonical_state.parent.issue !== desired.parent.issue
    || stateValid.canonical_digest !== digest(snapshot.canonical_state)) return fail('current-v5-state-identity-mismatch');
  const bootstrapExpected = {
    repository: desired.repository,
    parent_issue: desired.parent.issue,
    version: input.toolkit_version || '2.11.0',
    revision: input.bootstrap_revision,
    contract_bytes: input.contract_bytes,
    toolkit_contract_bytes: input.toolkit_contract_bytes,
    resolved_contract: input.resolved_contract,
    resolve_contract: input.resolve_contract,
  };
  const bootstrap = resolvePinnedContract(snapshot.bootstrap, {
    ...bootstrapExpected,
    revision: independentBootstrapRevision(input),
  });
  if (!bootstrap.ok) return fail('v5-bootstrap-invalid-or-missing', { detail: bootstrap.reason });
  const bodies = requireBodyInventory(snapshot, desired);
  if (!bodies.ok) return bodies;
  const events = validateManagedEventInventoryV5(snapshot.managed_events, desired.repository, {
    parent_issue: desired.parent.issue,
    receipts: input.receipts !== undefined ? input.receipts : snapshot.receipts,
  });
  if (!events.ok) return events;
  return ok('CURRENT_V5_SNAPSHOT_VALID', {
    state: snapshot.canonical_state, bootstrap: bootstrap.bootstrap, events: events.events,
    event_inventory_digest: events.inventory_digest,
  });
}

function buildConvergencePreviewV5(input = {}) {
  const valid = validateCanonicalStateV5(input.desired);
  if (!valid.ok) return valid;
  const snapshotCheck = validateCurrentSnapshot(input.snapshot, input.desired, input);
  if (!snapshotCheck.ok) return snapshotCheck;
  const snapshot = input.snapshot;
  const trust = inspectTrustBindingsV5(input.desired, input.scope_grant, input.broker);
  if (!trust.ok) return trust;
  const rendered = renderProgrammeV5(input.desired);
  if (!rendered.ok) return rendered;
  const integrity = verifyRenderedProgrammeIntegrityV5(input.desired, rendered);
  if (!integrity.ok) return integrity;
  const bodies = { parent: null, children: clone(snapshot.bodies.children), prs: clone(snapshot.bodies.prs) };
  const parentBody = materializeBody(snapshot.bodies.parent, 'parent', rendered.bodies.parent, {
    repository: input.desired.repository, parent_issue: input.desired.parent.issue, number: input.desired.parent.issue,
  });
  if (!parentBody.ok) return parentBody;
  bodies.parent = parentBody.body;
  for (const child of input.desired.children) {
    const result = materializeBody(snapshot.bodies.children[String(child.issue)], 'child', rendered.bodies.children[String(child.issue)], {
      repository: input.desired.repository, parent_issue: input.desired.parent.issue, number: child.issue,
    });
    if (!result.ok) return result;
    bodies.children[String(child.issue)] = result.body;
  }
  for (const pr of input.desired.prs) {
    const result = materializeBody(snapshot.bodies.prs[String(pr.number)], 'pr', rendered.bodies.prs[String(pr.number)], {
      repository: input.desired.repository, parent_issue: input.desired.parent.issue, number: pr.number,
    });
    if (!result.ok) return result;
    bodies.prs[String(pr.number)] = result.body;
  }
  const materializedBodies = validateMaterializedBodies(bodies);
  if (!materializedBodies.ok) return materializedBodies;
  const labels = expectedLabelsV5(input.desired, snapshot.labels);
  const native = expectedNativeRelationshipsV5(input.desired, snapshot.native);
  if (!native.ok) return native;
  const relationshipDelta = classifyRelationshipDeltaV5(snapshot.native, native.native);
  if (!relationshipDelta.ok) return relationshipDelta;
  const relationshipCapability = requireRelationshipCapabilitiesV5(input.scope_grant, relationshipDelta.required_relationship_operations);
  if (!relationshipCapability.ok) return relationshipCapability;
  const targetEventsBefore = snapshotCheck.events;
  const matchingEvents = targetEventsBefore.filter((event) => event.schema === MANAGED_EVENT_SCHEMA
    && event.to_state_digest === valid.canonical_digest
    && event.repository === input.desired.repository
    && event.parent_issue === input.desired.parent.issue);
  if (matchingEvents.length > 1) return fail('duplicate-target-transition-event');
  const existingEvent = matchingEvents[0] || null;
  const operations = [];
  addOperation(operations, 'parent-body', input.desired.parent.issue, snapshot.bodies.parent, bodies.parent);
  for (const child of input.desired.children) addOperation(operations, 'child-body', child.issue, snapshot.bodies.children[String(child.issue)], bodies.children[String(child.issue)]);
  for (const pr of input.desired.prs) addOperation(operations, 'pr-body', pr.number, snapshot.bodies.prs[String(pr.number)], bodies.prs[String(pr.number)]);
  addOperation(operations, 'labels', input.desired.parent.issue, snapshot.labels, labels);
  addOperation(operations, 'native-relationships', input.desired.parent.issue, snapshot.native, native.native, {
    required_relationship_operations: relationshipDelta.required_relationship_operations,
    relationship_capability_digest: relationshipCapability.relationship_capability_digest,
  });
  if (existingEvent && operations.length > 0) return fail('existing-transition-receipt-required');
  let event = existingEvent;
  let receiptBuilt = null;
  if (!event) {
    const eventBaseInput = {
      event_type: 'canonical_transition',
      repository: input.desired.repository,
      parent_issue: input.desired.parent.issue,
      entity: { kind: 'parent', number: input.desired.parent.issue },
      source_state_schema: STATE_SCHEMA,
      from_state_digest: digest(snapshot.canonical_state),
      to_state_digest: valid.canonical_digest,
      authority_ref: input.authority_ref || 'runtime:v5',
      authority_digest: input.authority_digest || digest(input.authority_ref || 'runtime:v5'),
      candidate_binding_digest: candidateBindingDigest(input.desired),
      prior_event_id: targetEventsBefore.at(-1)?.event_id || null,
      receipt_id: null,
      consumed_receipt_ids: [],
      receipt_inventory_digest: null,
    };
    const eventBase = createManagedEventV3(eventBaseInput);
    const operationDigestValue = operationBindingDigest(operations);
    receiptBuilt = receiptContext(input, input.desired, input.desired.active_lanes[0]?.candidate || null, operationDigestValue, transitionBindingDigest(eventBase));
    if (!receiptBuilt.ok) return receiptBuilt;
    const eventResult = managedEventForTransition({
      ...eventBaseInput,
      receipt_id: receiptBuilt.transition.receipt_id,
      consumed_receipt_ids: receiptBuilt.receipts.map((receipt) => receipt.receipt_id),
      receipt_inventory_digest: receiptInventoryDigest(receiptBuilt.receipts.map((receipt) => receipt.receipt_id)),
    });
    if (!eventResult.ok) return eventResult;
    event = eventResult.event;
    const consumption = validateReceiptConsumption(event, receiptBuilt.receipts, {
      repository: input.desired.repository,
      parent_issue: input.desired.parent.issue,
      operation_digest: operationDigestValue,
    });
    if (!consumption.ok) return consumption;
    addOperation(operations, 'managed-event', input.desired.parent.issue, null, event, {
      receipt_inventory_digest: event.receipt_inventory_digest,
    });
  }
  const operationCheck = validateProgrammeOperationIntegrity(operations);
  if (!operationCheck.ok) return operationCheck;
  const targetEvents = existingEvent ? targetEventsBefore : [...targetEventsBefore, event];
  const eventInventory = validateManagedEventInventoryV5(targetEvents, input.desired.repository, { skip_receipt_bindings: true });
  if (!eventInventory.ok) return eventInventory;
  const expectedSnapshot = {
    repository: input.desired.repository,
    revision: snapshot.revision,
    complete: true,
    canonical_state: clone(input.desired),
    bodies,
    labels,
    managed_events: eventInventory.events,
    native: native.native,
    bootstrap: clone(snapshot.bootstrap),
  };
  const consumedIds = receiptBuilt ? receiptBuilt.receipts.map((receipt) => receipt.receipt_id) : [];
  const preview = {
    schema: PREVIEW_SCHEMA,
    preview_kind: 'RECONCILIATION',
    repository: input.desired.repository,
    parent_issue: input.desired.parent.issue,
    authority_ref: input.authority_ref || 'runtime:v5',
    authority_digest: input.authority_digest || digest(input.authority_ref || 'runtime:v5'),
    current_revision: snapshot.revision,
    current_snapshot_digest: snapshotDigest(snapshot),
    source_event_inventory_digest: snapshotCheck.event_inventory_digest,
    canonical_digest: valid.canonical_digest,
    candidate_binding_digest: candidateBindingDigest(input.desired),
    trusted_pr_inspection_digest: trust.trusted_pr_inspection_digest,
    trusted_relationship_inspection_digest: trust.trusted_relationship_inspection_digest,
    relationship_capability_digest: trust.relationship_capability_digest,
    required_relationship_operations: relationshipDelta.required_relationship_operations,
    target_body_digests: bodyDigestInventory(bodies),
    target_projection_digests: rendered.body_digests,
    expected_event_inventory_digest: eventInventory.inventory_digest,
    managed_event_delta: {
      retained_count: targetEventsBefore.length, new_events: existingEvent ? [] : [event],
      retained_history_digest: digest(targetEventsBefore), target_inventory_digest: eventInventory.inventory_digest,
    },
    required_receipt_delta: receiptBuilt ? {
      receipt_type: receiptBuilt.transition.receipt_type,
      receipt_id: receiptBuilt.transition.receipt_id,
      started_receipt_id: receiptBuilt.started.receipt_id,
      started_sequence: receiptBuilt.started.sequence,
      started_classification: receiptBuilt.started.payload.classification,
      receipt: clone(receiptBuilt.transition),
      chain: clone(receiptBuilt.receipts),
      durable_required: true,
      persisted_in_preview: false,
      persist_before_apply: true,
      readback_required: true,
      receipt_inventory_digest: receiptInventoryDigest(consumedIds),
      reason: 'Operational receipt is separate from canonical transition history.',
    } : null,
    receipt_consumption_plan: receiptBuilt ? {
      transition: 'PREVIEW_TO_AUTHORISED_APPLY',
      required_receipt_ids: consumedIds,
      receipt_inventory_digest: receiptInventoryDigest(consumedIds),
      persist_before_dependent_progression: true,
      read_back_before_apply: true,
      persisted_in_preview: false,
      on_missing_conflicting_or_stale: 'FAIL_CLOSED',
    } : null,
    operations,
    operation_binding_digest: operationBindingDigest(operations),
    operations_digest: digest(operations),
    ordered_operation_ids: operations.map((operation) => operation.operation_id),
    expected_snapshot_digest: snapshotDigest(expectedSnapshot),
    expected_snapshot: expectedSnapshot,
    mutation_authority: 'NOT_GRANTED',
    finality_authority: 'NOT_GRANTED',
    preview_only: true,
  };
  preview.preview_id = digest(preview);
  return ok(operations.length ? 'PROGRAMME_V5_PREVIEW_READY' : 'PROGRAMME_ZERO_DELTA', preview);
}

function buildPreviewV5(input = {}) {
  if (input.legacy_snapshot || input.snapshot?.canonical_state?.schema === 'toolkit.github-program.state.v4') {
    return buildMigrationPreviewV5({ ...input, legacy_snapshot: input.legacy_snapshot || input.snapshot });
  }
  return buildConvergencePreviewV5(input);
}

function verifyConvergenceReadbackV5(snapshot, preview) {
  if (!isRecord(snapshot) || snapshot.complete !== true || snapshot.repository !== preview.repository
    || snapshot.revision !== (preview.expected_revision || preview.current_revision)) return fail('readback-snapshot-binding-invalid');
  if (snapshotDigest(snapshot) !== preview.expected_snapshot_digest) return fail('readback-snapshot-digest-mismatch');
  return ok('PROGRAMME_V5_READBACK_VERIFIED', { zero_delta_required: true });
}

function createMemoryDurableStore(initial = {}) {
  // Test adapter only. Production receipt durability remains the existing
  // github-program-receipt store supplied by the host.
  const receiptList = Array.isArray(initial.receipts) ? initial.receipts.map(clone) : [];
  const previews = Array.isArray(initial.previews) ? initial.previews.map(clone) : [];
  const events = Array.isArray(initial.events) ? initial.events.map(clone) : [];
  return Object.freeze({
    appendReceipt(receipt) {
      const existing = receiptList.find((entry) => entry.receipt_id === receipt.receipt_id);
      if (existing) return same(existing, receipt) ? { duplicate: true } : { conflict: true };
      receiptList.push(clone(receipt));
      return { duplicate: false };
    },
    readReceiptChain(runId) {
      return receiptList.filter((entry) => !runId || entry.run_id === runId).map(clone);
    },
    readAllReceipts() { return receiptList.map(clone); },
    writePreview(preview) {
      const existing = previews.find((entry) => entry.preview_id === preview.preview_id);
      if (existing && !same(existing, preview)) return { conflict: true };
      if (!existing) previews.push(clone(preview));
      return { duplicate: Boolean(existing) };
    },
    readPreview(previewId) { return clone(previews.find((entry) => entry.preview_id === previewId) || null); },
    appendEvent(event) {
      const existing = events.find((entry) => entry.event_id === event.event_id);
      if (existing) return same(existing, event) ? { duplicate: true } : { conflict: true };
      events.push(clone(event));
      return { duplicate: false };
    },
    readEvents() { return events.map(clone); },
  });
}

function previewAuthorityBinding(preview) {
  return {
    preview_schema: preview.schema,
    preview_kind: preview.preview_kind,
    preview_id: preview.preview_id,
    repository: preview.repository,
    parent_issue: preview.parent_issue,
    expected_revision: preview.expected_revision || preview.current_revision,
    source_snapshot_digest: preview.source_snapshot_digest || preview.current_snapshot_digest,
    source_event_inventory_digest: preview.source_event_inventory_digest || null,
    target_canonical_digest: preview.target_canonical_digest || preview.canonical_digest,
    target_projection_digests: clone(preview.target_managed_body_digests || preview.target_projection_digests || null),
    candidate_binding_digest: preview.candidate_binding_digest || null,
    authority_ref: preview.authority_ref || null,
    expected_event_inventory_digest: preview.managed_event_delta?.target_inventory_digest || preview.expected_event_inventory_digest || null,
    required_receipt_ids: clone(preview.receipt_consumption_plan?.required_receipt_ids || []),
    expected_snapshot_digest: preview.expected_snapshot_digest,
    operations_digest: preview.operations_digest,
    operation_binding_digest: preview.operation_binding_digest,
    operation_ids: preview.operations.map((operation) => operation.operation_id),
  };
}

function previewWithoutEnvelope(preview) {
  const value = clone(preview);
  delete value.ok;
  delete value.code;
  return value;
}

function validatePreviewIdentity(preview) {
  if (!sha256(preview?.preview_id)) return fail('programme-preview-identity-invalid');
  const value = previewWithoutEnvelope(preview);
  delete value.preview_id;
  return digest(value) === preview.preview_id ? ok('PROGRAMME_PREVIEW_ID_VALID') : fail('programme-preview-identity-invalid');
}

function previewBootstrapResolution(preview, options = {}, input = {}) {
  const bootstrap = preview.expected_snapshot?.bootstrap || preview.bootstrap?.after;
  if (!isRecord(bootstrap)) return fail('v5-bootstrap-invalid-or-missing');
  const resolved = input.resolved_contract !== undefined ? input.resolved_contract : options.resolved_contract;
  return resolvePinnedContract(bootstrap, {
    repository: preview.repository,
    parent_issue: preview.parent_issue,
    version: input.toolkit_version !== undefined ? input.toolkit_version : options.toolkit_version || bootstrap.toolkit_package_version,
    revision: independentBootstrapRevision(input, options),
    contract_bytes: input.contract_bytes !== undefined ? input.contract_bytes : options.contract_bytes,
    toolkit_contract_bytes: input.toolkit_contract_bytes !== undefined ? input.toolkit_contract_bytes : options.toolkit_contract_bytes,
    resolved_contract: resolved,
    resolve_contract: input.resolve_contract || options.resolve_contract,
  });
}

function expectedApplyOperations(preview, sourceSnapshot, sourceEvents, expectedSnapshot, desired, scopeGrant) {
  const operations = [];
  const migration = preview.schema === MIGRATION_SCHEMA;
  const bodyKinds = migration
    ? ['migrate-parent-body', 'migrate-child-body', 'migrate-pr-body']
    : ['parent-body', 'child-body', 'pr-body'];
  addOperation(operations, bodyKinds[0], desired.parent.issue, sourceSnapshot.bodies.parent, expectedSnapshot.bodies.parent);
  for (const child of desired.children) {
    addOperation(operations, bodyKinds[1], child.issue,
      sourceSnapshot.bodies.children[String(child.issue)], expectedSnapshot.bodies.children[String(child.issue)]);
  }
  for (const pr of desired.prs) {
    addOperation(operations, bodyKinds[2], pr.number,
      sourceSnapshot.bodies.prs[String(pr.number)], expectedSnapshot.bodies.prs[String(pr.number)]);
  }
  const labels = expectedLabelsV5(desired, sourceSnapshot.labels);
  if (!same(labels, expectedSnapshot.labels)) return fail('expected-target-binding-invalid');
  addOperation(operations, 'labels', desired.parent.issue, sourceSnapshot.labels, expectedSnapshot.labels);
  const native = expectedNativeRelationshipsV5(desired, sourceSnapshot.native);
  if (!native.ok || !same(native.native, expectedSnapshot.native)) return fail('expected-target-binding-invalid');
  const relationshipDelta = classifyRelationshipDeltaV5(sourceSnapshot.native, native.native);
  if (!relationshipDelta.ok) return relationshipDelta;
  const relationshipCapability = requireRelationshipCapabilitiesV5(scopeGrant, relationshipDelta.required_relationship_operations);
  if (!relationshipCapability.ok) return relationshipCapability;
  addOperation(operations, 'native-relationships', desired.parent.issue, sourceSnapshot.native, expectedSnapshot.native, {
    required_relationship_operations: relationshipDelta.required_relationship_operations,
    relationship_capability_digest: relationshipCapability.relationship_capability_digest,
  });
  const retained = Array.isArray(sourceEvents) ? sourceEvents : [];
  const targetEvents = expectedSnapshot.managed_events;
  if (!Array.isArray(targetEvents)) return fail('expected-target-binding-invalid');
  const eventChanged = !same(retained, targetEvents);
  if (eventChanged) {
    if (targetEvents.length !== retained.length + 1
      || !retained.every((event, index) => same(event, targetEvents[index]))) return fail('managed-event-history-invalid');
    const event = targetEvents.at(-1);
    if (event?.schema !== MANAGED_EVENT_SCHEMA) return fail('managed-event-history-invalid');
    addOperation(operations, 'managed-event', desired.parent.issue, null, event, {
      receipt_inventory_digest: event.receipt_inventory_digest,
    });
  }
  return ok('EXPECTED_PROGRAMME_OPERATIONS_REBUILT', { operations, event_changed: eventChanged });
}

function validateApplyFacts(preview, snapshot, desired, options = {}, receiptsForValidation, activeReceiptsForValidation) {
  if (!isRecord(desired)) return fail('programme-preview-desired-state-missing');
  const bootstrap = previewBootstrapResolution(preview, options, options);
  if (!bootstrap.ok) return bootstrap;
  const active = preview.required_receipt_delta
    ? validateActiveReceiptFence(preview.required_receipt_delta, activeReceiptsForValidation, options.now || new Date())
    : ok('ACTIVE_RECEIPT_FENCE_NOT_REQUIRED', { preconditions: null });
  if (!active.ok) return active;
  let sourceEventInventoryDigest;
  let sourceEvents;
  if (preview.schema === MIGRATION_SCHEMA) {
    const migration = validateMigrationInput(snapshot);
    if (!migration.ok) return migration;
    const source = parseV4CanonicalSnapshot(snapshot, snapshot.repository, preview.parent_issue);
    if (!source.ok) return source;
    const bodies = parseV4Bodies(snapshot, source.state);
    if (!bodies.ok) return fail('v4-body-inventory-invalid', { detail: bodies.reason });
    const events = validateManagedEventInventoryV5(snapshot.managed_events, snapshot.repository, {
      parent_issue: preview.parent_issue, receipts: receiptsForValidation,
    });
    if (!events.ok) return events;
    sourceEventInventoryDigest = events.inventory_digest;
    sourceEvents = events.events;
    if (preview.source_canonical_digest !== source.canonical_digest) return fail('stale-preview');
  } else {
    const current = validateCurrentSnapshot(snapshot, desired, {
      ...options, receipts: receiptsForValidation,
      contract_bytes: options.contract_bytes, toolkit_contract_bytes: options.toolkit_contract_bytes,
      resolved_contract: options.resolved_contract, resolve_contract: options.resolve_contract,
    });
    if (!current.ok) return current;
    sourceEventInventoryDigest = current.event_inventory_digest;
    sourceEvents = current.events;
  }
  const expectedSourceDigest = preview.source_snapshot_digest || preview.current_snapshot_digest;
  if (!expectedSourceDigest || snapshotDigest(snapshot) !== expectedSourceDigest) return fail('stale-preview');
  if (preview.source_event_inventory_digest !== undefined && preview.source_event_inventory_digest !== sourceEventInventoryDigest) return fail('stale-preview');
  if (!safeLine(preview.authority_ref, 512) || !sha256(preview.authority_digest)) return fail('trusted-authority-binding-invalid');
  const trust = inspectTrustBindingsV5(desired, options.scope_grant, options.broker);
  if (!trust.ok) return trust;
  const candidateDigest = candidateBindingDigest(desired);
  if (preview.candidate_binding_digest !== candidateDigest
    || preview.trusted_pr_inspection_digest !== trust.trusted_pr_inspection_digest
    || preview.trusted_relationship_inspection_digest !== trust.trusted_relationship_inspection_digest
    || preview.relationship_capability_digest !== trust.relationship_capability_digest) return fail('trusted-programme-binding-stale');
  if (!same(preview.expected_snapshot?.bootstrap, bootstrap.bootstrap)) return fail('bootstrap-binding-stale');
  const expectedSnapshot = preview.expected_snapshot;
  if (!isRecord(expectedSnapshot) || expectedSnapshot.repository !== preview.repository
    || expectedSnapshot.revision !== snapshot.revision || expectedSnapshot.complete !== true
    || !same(expectedSnapshot.canonical_state, desired)
    || snapshotDigest(expectedSnapshot) !== preview.expected_snapshot_digest) return fail('expected-target-binding-invalid');
  const expectedState = validateCanonicalStateV5(expectedSnapshot.canonical_state);
  if (!expectedState.ok) return fail('expected-target-state-invalid', { detail: expectedState.reason });
  const expectedBodies = requireBodyInventory(expectedSnapshot, desired);
  if (!expectedBodies.ok) return expectedBodies;
  const expectedBodyBudgets = validateMaterializedBodies(expectedSnapshot.bodies);
  if (!expectedBodyBudgets.ok) return expectedBodyBudgets;
  const expectedEvents = validateManagedEventInventoryV5(expectedSnapshot.managed_events, preview.repository, {
    parent_issue: preview.parent_issue, receipts: receiptsForValidation,
  });
  if (!expectedEvents.ok) return expectedEvents;
  if (expectedEvents.inventory_digest !== preview.expected_event_inventory_digest
    && expectedEvents.inventory_digest !== preview.managed_event_delta?.target_inventory_digest) return fail('expected-target-binding-invalid');
  if (preview.managed_event_delta?.retained_history_digest !== undefined
    && preview.managed_event_delta.retained_history_digest !== digest(sourceEvents)) return fail('managed-event-history-invalid');
  const rebuilt = expectedApplyOperations(preview, snapshot, sourceEvents, expectedSnapshot, desired, options.scope_grant);
  if (!rebuilt.ok) return rebuilt;
  if (rebuilt.event_changed !== (preview.operations.length > 0)) return fail('transition-receipt-required');
  if (!same(rebuilt.operations, preview.operations)) return fail('programme-operation-binding-invalid');
  const operations = validateProgrammeOperationIntegrity(preview.operations);
  if (!operations.ok) return operations;
  const preconditions = {
    expected_revision: preview.expected_revision || preview.current_revision,
    source_snapshot_digest: expectedSourceDigest,
    source_event_inventory_digest: sourceEventInventoryDigest,
    candidate_binding_digest: candidateDigest,
    trusted_pr_inspection_digest: trust.trusted_pr_inspection_digest,
    trusted_relationship_inspection_digest: trust.trusted_relationship_inspection_digest,
    relationship_capability_digest: trust.relationship_capability_digest,
    authority_ref: preview.authority_ref || null,
    authority_digest: preview.authority_digest || null,
    bootstrap_digest: digest(bootstrap.bootstrap),
    active_receipt_fence: clone(active.preconditions),
    active_receipt_fence_digest: active.preconditions ? digest(active.preconditions) : null,
    expected_snapshot_digest: preview.expected_snapshot_digest,
    operations_digest: operations.operations_digest,
    operation_binding_digest: operations.operation_binding_digest,
    ordered_operation_ids: operations.ordered_operation_ids,
  };
  return ok('PROGRAMME_APPLY_FACTS_VALID', { bootstrap: bootstrap.bootstrap, trust, source_event_inventory_digest: sourceEventInventoryDigest, operations, preconditions });
}

function createProgrammeRuntimeV5(options = {}) {
  const store = options.durable_store || options.store;
  function inspect() {
    if (typeof options.inspect_snapshot !== 'function') return fail('snapshot-adapter-required');
    try { return ok('SNAPSHOT_INSPECTED', { snapshot: options.inspect_snapshot() }); } catch (_error) { return fail('snapshot-inspection-failed'); }
  }
  function persistPreview(result) {
    if (!result.ok) return result;
    if (!store || typeof store.writePreview !== 'function') return fail('durable-preview-store-required');
    try {
      const stored = store.writePreview(result);
      if (stored?.conflict) return fail('preview-persistence-conflict');
      return result;
    } catch (_error) {
      return fail('preview-persistence-failed');
    }
  }
  function preview(input = {}) {
    const inspected = inspect();
    return inspected.ok ? persistPreview(buildPreviewV5({ ...input, snapshot: inspected.snapshot })) : inspected;
  }
  function migrationPreview(input = {}) {
    const inspected = inspect();
    return inspected.ok ? persistPreview(buildMigrationPreviewV5({ ...input, legacy_snapshot: inspected.snapshot })) : inspected;
  }
  function recordReceipt(input = {}) {
    if (!store) return fail('durable-receipt-store-required');
    if (input.schema !== RUN_RECEIPT_SCHEMA) return fail('canonical-receipt-required');
    const receipt = input;
    return appendRunReceipt(store, receipt);
  }
  function recover(input = {}) {
    let chain = input.receipts;
    if (chain === undefined && store && typeof store.readReceiptChain === 'function') {
      try { chain = store.readReceiptChain(input.run_id); } catch (_error) { return fail('run-receipt-readback-failed'); }
    }
    return classifyRecovery({ ...input, receipts: chain || [] });
  }
  function apply(input = {}) {
    if (!store || typeof store.readPreview !== 'function') return fail('durable-preview-store-required');
    const preview = input.preview || store.readPreview(input.preview_id);
    if (!isRecord(preview) || !preview.preview_id || ![PREVIEW_SCHEMA, MIGRATION_SCHEMA].includes(preview.schema)
      || !Array.isArray(preview.operations) || !same(preview, store.readPreview(preview.preview_id))) return fail('durable-preview-required');
    const identity = validatePreviewIdentity(preview);
    if (!identity.ok) return identity;
    const operationCheck = validateProgrammeOperationIntegrity(preview.operations);
    if (!operationCheck.ok) return operationCheck;
    if (preview.operations_digest !== operationCheck.operations_digest
      || preview.operation_binding_digest !== operationCheck.operation_binding_digest
      || !Array.isArray(preview.ordered_operation_ids)
      || !same(preview.ordered_operation_ids, operationCheck.ordered_operation_ids)
      || new Set(operationCheck.ordered_operation_ids).size !== operationCheck.ordered_operation_ids.length) return fail('programme-operation-binding-invalid');
    const required = preview.required_receipt_delta;
    const consumedEvent = preview.managed_event_delta?.new_events?.find((event) => event?.schema === MANAGED_EVENT_SCHEMA) || null;
    if (preview.operations.length > 0 && (!required || !consumedEvent)) return fail('transition-receipt-required');
    const applyOptions = {
      ...options,
      bootstrap_revision: input.bootstrap_revision !== undefined ? input.bootstrap_revision : options.bootstrap_revision,
      expected_bootstrap_revision: input.expected_bootstrap_revision !== undefined ? input.expected_bootstrap_revision : options.expected_bootstrap_revision,
      contract_bytes: input.contract_bytes !== undefined ? input.contract_bytes : options.contract_bytes,
      toolkit_contract_bytes: input.toolkit_contract_bytes !== undefined ? input.toolkit_contract_bytes : options.toolkit_contract_bytes,
      resolved_contract: input.resolved_contract !== undefined ? input.resolved_contract : options.resolved_contract,
      resolve_contract: input.resolve_contract || options.resolve_contract,
      now: input.now !== undefined ? input.now : options.now,
      toolkit_version: input.toolkit_version !== undefined ? input.toolkit_version : options.toolkit_version,
    };
    const readActive = () => {
      if (!required) return ok('ACTIVE_RECEIPT_FENCE_NOT_REQUIRED', { receipts: null, preconditions: null });
      if (typeof store.readReceiptChain !== 'function') return fail('durable-receipt-store-required');
      let chain;
      try { chain = store.readReceiptChain(required.receipt.run_id); } catch (_error) { return fail('run-receipt-readback-failed'); }
      return validateActiveReceiptFence(required, chain, applyOptions.now || new Date());
    };
    const readInventory = (snapshot, activeChain) => readDurableReceiptInventory(store, snapshot, [
      ...(Array.isArray(snapshot?.managed_events) ? snapshot.managed_events : []),
      ...(Array.isArray(preview.expected_snapshot?.managed_events) ? preview.expected_snapshot.managed_events : []),
    ], activeChain);
    const validateReadbackEvents = (snapshot, receiptInventory) => validateManagedEventInventoryV5(
      snapshot?.managed_events, preview.repository, {
        parent_issue: preview.parent_issue,
        receipts: receiptInventory,
      }
    );
    let durableReceipts;
    let activeRunChain = null;
    if (required) {
      const active = readActive();
      if (!active.ok) return active;
      activeRunChain = active.receipts;
      durableReceipts = activeRunChain;
      const requiredCheck = validateReceiptObject(required.receipt, {
        repository: preview.repository, parent_issue: preview.parent_issue,
        receipt_type: 'TRANSITION_PREVIEW', sequence: activeRunChain.at(-1)?.sequence,
        prior_receipt_id: activeRunChain.at(-2)?.receipt_id || null,
      });
      if (!requiredCheck.ok) return requiredCheck;
      if (required.receipt.payload.operation_digest !== operationCheck.operation_binding_digest) return fail('preview-operation-binding-mismatch');
      if (consumedEvent) {
        const consumption = validateReceiptConsumption(consumedEvent, activeRunChain, {
          repository: preview.repository, parent_issue: preview.parent_issue,
          operation_digest: operationCheck.operation_binding_digest, require_readback: true,
        });
        if (!consumption.ok) return consumption;
      }
    }
    const preflight = inspect();
    if (!preflight.ok) return preflight;
    const desired = preview.expected_snapshot?.canonical_state;
    if (!options.scope_grant || !options.broker) return fail('trusted-rerun-adapters-required');
    const preflightInventory = readInventory(preflight.snapshot, activeRunChain);
    if (!preflightInventory.ok) return preflightInventory;
    durableReceipts = preflightInventory.receipts;
    const preflightFacts = validateApplyFacts(preview, preflight.snapshot, desired, applyOptions, durableReceipts, activeRunChain);
    if (!preflightFacts.ok) return preflightFacts;
    if (preview.operations.length === 0) {
      if (snapshotDigest(preflight.snapshot) !== preview.expected_snapshot_digest) return fail('stale-preview');
      return ok('PROGRAMME_ZERO_DELTA', { mutation_count: 0, readback_verified: true, immediate_rerun: 'ZERO_DELTA' });
    }
    if (typeof options.verify_authority !== 'function' || typeof options.apply_operations !== 'function') return fail('mutation-adapters-required');
    const binding = previewAuthorityBinding(preview);
    const writerBinding = {
      ...binding,
      ...preflightFacts.preconditions,
      precondition_digest: digest(preflightFacts.preconditions),
    };
    let authority;
    try {
      authority = options.verify_authority({ assertion: clone(input.authority), binding: clone(binding), preconditions: clone(writerBinding) });
    } catch (_error) { return fail('trusted-authority-verification-failed'); }
    if (!authority?.ok) return fail('trusted-authority-required');
    if (authority.binding !== undefined && !same(authority.binding, binding)) return fail('trusted-authority-binding-changed');
    if (authority.preconditions !== undefined && !same(authority.preconditions, writerBinding)) return fail('trusted-authority-preconditions-changed');
    if (authority.authority_ref !== undefined && authority.authority_ref !== writerBinding.authority_ref) return fail('trusted-authority-binding-changed');
    if (authority.authority_digest !== undefined && authority.authority_digest !== writerBinding.authority_digest) return fail('trusted-authority-binding-changed');
    const authorityActive = readActive();
    if (!authorityActive.ok) return authorityActive;
    activeRunChain = authorityActive.receipts;
    const rebound = inspect();
    if (!rebound.ok) return rebound;
    const reboundInventory = readInventory(rebound.snapshot, activeRunChain);
    if (!reboundInventory.ok) return reboundInventory;
    durableReceipts = reboundInventory.receipts;
    const prewriteActive = readActive();
    if (!prewriteActive.ok) return prewriteActive;
    activeRunChain = prewriteActive.receipts;
    const prewriteInventory = readInventory(rebound.snapshot, activeRunChain);
    if (!prewriteInventory.ok) return prewriteInventory;
    durableReceipts = prewriteInventory.receipts;
    const reboundFacts = validateApplyFacts(preview, rebound.snapshot, desired, applyOptions, durableReceipts, activeRunChain);
    if (!reboundFacts.ok) return reboundFacts;
    if (!same(reboundFacts.preconditions, preflightFacts.preconditions)) return fail('prewrite-freshness-changed');
    let applied;
    try {
      applied = options.apply_operations({
        operations: clone(preview.operations), repository: preview.repository, parent_issue: preview.parent_issue,
        binding: clone(binding), expected: clone(writerBinding), preconditions: clone(writerBinding),
        operations_digest: operationCheck.operations_digest,
        operation_binding_digest: operationCheck.operation_binding_digest,
        ordered_operation_ids: clone(operationCheck.ordered_operation_ids),
      });
    } catch (_error) { return fail('apply-failed'); }
    if (!applied?.ok) return fail('apply-failed');
    if (applied.preconditions_verified !== true || applied.precondition_digest !== writerBinding.precondition_digest
      || applied.operation_binding_digest !== operationCheck.operation_binding_digest) return fail('writer-preconditions-unverified');
    const appliedCount = applied.applied_count ?? preview.operations.length;
    if (!Number.isSafeInteger(appliedCount) || appliedCount !== preview.operations.length) return fail('applied-count-mismatch');
    const postWriteActive = readActive();
    if (!postWriteActive.ok) return postWriteActive;
    activeRunChain = postWriteActive.receipts;
    const inspected = inspect();
    if (!inspected.ok) return inspected;
    const postReadbackActive = readActive();
    if (!postReadbackActive.ok) return postReadbackActive;
    activeRunChain = postReadbackActive.receipts;
    const postReadbackInventory = readInventory(inspected.snapshot, activeRunChain);
    if (!postReadbackInventory.ok) return postReadbackInventory;
    durableReceipts = postReadbackInventory.receipts;
    const readbackEvents = validateReadbackEvents(inspected.snapshot, durableReceipts);
    if (!readbackEvents.ok) return readbackEvents;
    const readback = verifyConvergenceReadbackV5(inspected.snapshot, preview);
    if (!readback.ok) return readback;
    const finalActive = readActive();
    if (!finalActive.ok) return finalActive;
    activeRunChain = finalActive.receipts;
    const finalInventory = readInventory(inspected.snapshot, activeRunChain);
    if (!finalInventory.ok) return finalInventory;
    durableReceipts = finalInventory.receipts;
    const finalEvents = validateReadbackEvents(inspected.snapshot, durableReceipts);
    if (!finalEvents.ok) return finalEvents;
    const rerun = buildConvergencePreviewV5({
      desired,
      snapshot: { ...inspected.snapshot, ...(durableReceipts ? { receipts: durableReceipts } : {}) },
      scope_grant: options.scope_grant,
      broker: options.broker,
      authority_ref: preview.authority_ref || 'runtime:v5',
      authority_digest: preview.authority_digest,
      bootstrap_revision: independentBootstrapRevision(applyOptions),
      contract_bytes: applyOptions.contract_bytes,
      toolkit_contract_bytes: applyOptions.toolkit_contract_bytes,
      resolved_contract: applyOptions.resolved_contract,
      resolve_contract: applyOptions.resolve_contract,
    });
    if (!rerun.ok || rerun.code !== 'PROGRAMME_ZERO_DELTA' || rerun.operations.length !== 0) return fail('immediate-rerun-not-zero-delta');
    const completedActive = readActive();
    if (!completedActive.ok) return completedActive;
    const completedInventory = readInventory(inspected.snapshot, completedActive.receipts);
    if (!completedInventory.ok) return completedInventory;
    const completedEvents = validateReadbackEvents(inspected.snapshot, completedInventory.receipts);
    if (!completedEvents.ok) return completedEvents;
    return ok('PROGRAMME_V5_APPLIED', {
      applied_count: appliedCount,
      operations_digest: preview.operations_digest,
      ordered_operation_ids: clone(preview.ordered_operation_ids),
      readback_verified: true,
      immediate_rerun: 'ZERO_DELTA',
    });
  }
  return Object.freeze({ preview, migrationPreview, recordReceipt, recover, apply });
}

function appendRunReceipt(store, receipt) {
  const valid = validateReceiptObject(receipt);
  if (!valid.ok) return valid;
  if (!store || typeof store.appendReceipt !== 'function') return fail('durable-receipt-store-required');
  if (receipt.sequence === 1 || receipt.receipt_type === 'RUN_STARTED') return fail('canonical-started-receipt-required');
  let prior = [];
  if (typeof store.readReceiptChain === 'function') {
    try { prior = store.readReceiptChain(receipt.run_id) || []; } catch (_error) { return fail('run-receipt-readback-failed'); }
    if (!Array.isArray(prior)) return fail('run-receipt-readback-invalid');
    const existing = prior.find((entry) => entry.receipt_id === receipt.receipt_id);
    if (existing) return same(existing, receipt)
      ? ok('RUN_RECEIPT_DUPLICATE', { receipt: clone(receipt), duplicate: true })
      : fail('run-receipt-conflict');
  }
  if (receipt.sequence === 1 && (receipt.receipt_type !== 'RUN_STARTED' || receipt.prior_receipt_id !== null || prior.length)) return fail('run-started-chain-invalid');
  if (receipt.sequence > 1 && typeof store.readReceiptChain === 'function') {
    const chain = validateRunReceiptChain([...prior, receipt], { repository: receipt.repository, parent_issue: receipt.parent_issue });
    if (!chain.ok) return chain;
  }
  try {
    const result = store.appendReceipt(clone(receipt));
    if (result?.conflict) return fail('run-receipt-conflict');
    return ok(result?.duplicate ? 'RUN_RECEIPT_DUPLICATE' : 'RUN_RECEIPT_PERSISTED', {
      receipt: clone(receipt), duplicate: Boolean(result?.duplicate),
    });
  } catch (_error) {
    return fail('run-receipt-persistence-failed');
  }
}

const validatePrBindingsV5 = validateTrustedPrInspectionV5;
const validateRelationshipInspectionV5 = validateTrustedRelationshipInspectionV5;

module.exports = Object.freeze({
  SURFACE_CONTRACT,
  STATE_SCHEMA, PROJECTION_SCHEMA, EXTENSIONS_SCHEMA, MANAGED_EVENT_SCHEMA, RUN_RECEIPT_SCHEMA,
  BOOTSTRAP_SCHEMA, MIGRATION_SCHEMA, PREVIEW_SCHEMA, DESIGN_LOCK, BOOTSTRAP_REVISION,
  BOOTSTRAP_CONTRACTS, TOOLKIT_CONTRACT_REPOSITORY, TOOLKIT_CONTRACT_PATH, CANONICAL_OPERATION_CLASSES,
  BODY_BUDGET_BYTES, CANONICAL_STATE_BUDGET_BYTES, TOTAL_PROJECTION_BUDGET_BYTES, RECEIPT_BUDGET_BYTES,
  LIFECYCLES, REGISTRY_STATUSES, LIVE_PR_LIFECYCLES, AUTHORITY_MODES, GATE_STATES, GATE_RESULTS,
  PROGRAMME_STATES, TERMINAL_RECEIPT_TYPES, RECOVERY_STATUSES, RECEIPT_TYPES, MARKERS,
  STATE_LINE_PREFIX, PROJECTION_LINE_PREFIX,
  canonicalJson, digest, bytes, clone, authorityDigest, validateConcurrencyAuthority, validateWorkClaims,
  validateCanonicalStateV5, deriveProjectionV5, renderProgrammeV5, parseProgrammeV5Body,
  verifyRenderedProgrammeIntegrityV5, candidateBinding, candidateBindingDigest, derivePrAssociationsV5,
  expectedLabelsV5, expectedNativeRelationshipsV5, snapshotDigest, operationBindingDigest,
  createManagedEventV3, validateManagedEventV3, validateManagedEventInventoryV5,
  validateReceiptConsumption, createRunReceipt, validateRunReceipt, validateReceiptObject,
  evidenceDigest, receiptInventoryDigest, validateRunReceiptChain, appendRunReceipt,
  canAdvanceFromTerminal, consumeTerminalEvidence, classifyRecovery, recoverRun,
  validateWriterAction, validateProgrammeOperations, validateProgrammeOperationIntegrity,
  validateMaterializedBodies,
  validateTrustedPrInspectionV5, validatePrBindingsV5, validateTrustedRelationshipInspectionV5,
  validateRelationshipInspectionV5, inspectTrustBindingsV5, relationshipCapabilityDigestV5,
  buildBootstrap, validateControllerBootstrap, resolvePinnedContract, detectManagedRepository,
  inspectControllerContext, migrateV4ToV5, buildMigrationPreviewV5,
  buildV5MigrationPreview: buildMigrationPreviewV5, buildConvergencePreviewV5,
  buildV5ConvergencePreview: buildConvergencePreviewV5, buildPreviewV5,
  verifyConvergenceReadbackV5, createMemoryDurableStore, createProgrammeRuntimeV5,
  createV5Runtime: createProgrammeRuntimeV5,
});
