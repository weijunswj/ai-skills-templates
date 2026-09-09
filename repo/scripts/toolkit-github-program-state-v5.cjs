#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const { canonicalSerialize, digestValue } = require('./toolkit-execution-loop.cjs');
const receipt = require('./toolkit-github-program-receipt.cjs');

const REPOSITORY = 'weijunswj/ai-agent-toolkit';
const PARENT_ISSUE = 240;
const CHILD_ISSUE = 359;
const MAIN_SHA = 'c72028c63cc09dd07d3e522692065448b6b7dbb6';
const RECOVERY_ROOT = 'E3-V5-PROGRAMME-PROJECTION-BOOTSTRAP-RECOVERY-001';
const LOCK = 'DL-S2-E3-V5-PROJECTION-BOOTSTRAP-RECOVERY-001';
const OLD_ROOT = 'E3-CANONICAL-HISTORICAL-RECEIPT-RESOLUTION-003';
const PARKED_ROOT = 'E3-HISTORICAL-RECEIPT-CI-PROOF-BOUNDARY-SIMPLIFICATION-004';
const WRITE_SAFETY_MODE = 'WEB_EXCLUSIVE_SINGLE_WRITER_RECOVERY_WINDOW';
const STATE_SCHEMA = 'toolkit.github-program.state.v5';
const PROJECTION_SCHEMA = 'toolkit.github-program.projection.v1';
const SURFACE_SCHEMA = 'toolkit.github-program.surface.v5';
const DECISION_SCHEMA = 'toolkit.github-program.projection-bootstrap-recovery-decision.v1';
const EVIDENCE_SCHEMA = 'toolkit.github-program.projection-bootstrap-recovery-evidence.v1';
const BOOTSTRAP_SCHEMA = 'toolkit.github-program.controller-bootstrap.v1';
const RECOVERY_OPERATION_SCHEMA = 'toolkit.github-program.projection-bootstrap-recovery-operation.v1';
const RECOVERY_EVIDENCE_REF = 'recovery-g2-web-authority';
const HOLD_EVIDENCE_REF = 'web-recovery-g1-accepted-5580530088';
const HOLD_EVIDENCE_REFERENCE = 'github:issue-comment:359:5580530088';
const RETENTION_EVIDENCE_REF = 'web-pr379-retained-5580538176';
const RETENTION_EVIDENCE_REFERENCE = 'github:issue-comment:379:5580538176';
const SOURCE_CANONICAL_DIGEST = 'a09fdafa6b77ad85624298ceea488a5c342d00a0700218de62ba2276ed050280';
const SOURCE_PARENT_BODY_DIGEST = 'a1e16640c3cdb20ed5e94e0c2c86c0bd763ff135565bd81d4aaaaa9e2a81afae';
const SOURCE_CHILD_BODY_DIGEST = '8ba74c91078b9acdae69ce3a5f2877ea677cab57fe16a402520aef8abbf4d960';
const SOURCE_PARENT_REVISION = '2026-09-08T07:21:55Z';
const SOURCE_CHILD_REVISION = '2026-09-08T07:21:42Z';
const EMPTY_DIGEST = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const FROZEN_HEAD = 'adca2ffec8322eb57afcd9f9fdc67210503ebcf1';
const FROZEN_TREE = '2c712aa9c7c6e66a89bdd9d033acece5415fd575';
const FROZEN_BRANCH = 'codex/e3-canonical-historical-receipt-resolution-003';
const FROZEN_BASE_REF = 'main';
const FROZEN_VERSION = '2.11.0';
const PR366_HEAD = 'a7dcb69da43100c5411076008307a221e89b720f';
const PR366_TREE = '2c88782fa274e502fb6c8c5126d55470112f38e9';
const PR366_BASE_SHA = 'e86a2d74fd771f6500aa02fe0892940933bf7647';
const PR366_VERSION = '2.12.0';
const TARGET_CANONICAL_DIGEST = '1d810f3d7df41012707672cd323c12ccfcff279c172165bbf732e1a49eae39aa';
const FINALISATION_ROOT = 'E3-V5-POST-MERGE-EPOCH-FINALISATION-001';
const FINALISATION_LOCK = 'DL-S2-E3-V5-POST-MERGE-EPOCH-FINALISATION-001';
const FINALISATION_SCOPE = 'POST_MERGE_EPOCH_FINALISATION';
const FINALISATION_WRITE_SAFETY_MODE = 'WEB_EXCLUSIVE_POST_MERGE_EPOCH_FINALISATION';
const FINALISATION_DECISION_SCHEMA = 'toolkit.github-program.post-merge-epoch-finalisation-decision.v1';
const FINALISATION_EVIDENCE_SCHEMA = 'toolkit.github-program.post-merge-epoch-finalisation-evidence.v1';
const FINALISATION_OPERATION_SCHEMA = 'toolkit.github-program.post-merge-epoch-finalisation-operation.v1';
const FINALISATION_SOURCE_CANONICAL_DIGEST = TARGET_CANONICAL_DIGEST;
const PR380_HEAD = 'f8afc5df62b9e86a478ce24745b6aa481cbc7a1a';
const PR380_TREE = 'd9e78e1a09fc53f88d077f3f4216027102534ce3';
const PR380_BRANCH = 'codex/e3-v5-projection-bootstrap-recovery-001';
const PR380_BASE_SHA = MAIN_SHA;
const PR380_VERSION = '2.10.8';
const MERGE_COMMIT_SHA = '4381386c5fdfa45b8848af9b30b9082df06d99a0';
const MERGE_COMMIT_TREE = PR380_TREE;
const FINAL_G4_EVIDENCE_REF = 'post-merge-g4-web-acceptance-5143994659';
const FINAL_G4_EVIDENCE_REFERENCE = 'github:pull-request-review:380:5143994659';
const FINAL_G4_REVIEW_BODY_DIGEST = 'f5366317d6d0855a5daace66ed22008709ee899ebac81d9ff989358c62334f17';
const POST_MERGE_TECHNICAL_EVIDENCE_REF = 'post-merge-technical-finality-5144137683';
const POST_MERGE_TECHNICAL_EVIDENCE_REFERENCE = 'github:pull-request-review:380:5144137683';
const POST_MERGE_TECHNICAL_BODY_DIGEST = '5a6a3a4e598952e061e533c39f54f79408840f5b569f93deeb5a76203576ca4e';
const PR379_NON_CONVERGENCE_EVIDENCE_REF = 'pr379-non-convergence-5579738186';
const PR379_NON_CONVERGENCE_EVIDENCE_REFERENCE = 'github:issue-comment:379:5579738186';
const PR379_NON_CONVERGENCE_BODY_DIGEST = '48806a388a2771d0c8b4dc3229a202605f0bf76fd8a356f20e8c4bd18f8d436f';
const FINALISATION_TRANSITION_ID = 'e3-post-merge-epoch-finalisation';
const FINALISATION_CHECKPOINTS = Object.freeze([
  'BEFORE_STAGE_A',
  'CHILD_STAGE_A_OBSERVED',
  'PARENT_STAGE_A_OBSERVED',
  'PR379_CLOSED_STAGE_A',
  'CHILD_STAGE_B_OBSERVED',
  'FINAL_TARGET_OBSERVED',
  'CHILD_STAGE_A_ACKNOWLEDGEMENT_LOST',
  'PARENT_STAGE_A_ACKNOWLEDGEMENT_LOST',
  'PR379_CLOSE_ACKNOWLEDGEMENT_LOST',
  'CHILD_STAGE_B_ACKNOWLEDGEMENT_LOST',
  'PARENT_STAGE_B_ACKNOWLEDGEMENT_LOST',
]);
const FINALISATION_ACK_LOSS_CHECKPOINTS = Object.freeze([
  'CHILD_STAGE_A_ACKNOWLEDGEMENT_LOST',
  'PARENT_STAGE_A_ACKNOWLEDGEMENT_LOST',
  'PR379_CLOSE_ACKNOWLEDGEMENT_LOST',
  'CHILD_STAGE_B_ACKNOWLEDGEMENT_LOST',
  'PARENT_STAGE_B_ACKNOWLEDGEMENT_LOST',
]);
const FINALISATION_OPERATION_ORDER = Object.freeze([
  Object.freeze({ order: 1, operation_id: 'CHILD_STAGE_A', issue: CHILD_ISSUE, target_kind: 'ISSUE_BODY', target: 'STAGE_A', operation_kind: 'IDEMPOTENT_SET' }),
  Object.freeze({ order: 2, operation_id: 'PARENT_STAGE_A', issue: PARENT_ISSUE, target_kind: 'ISSUE_BODY', target: 'STAGE_A', operation_kind: 'IDEMPOTENT_SET' }),
  Object.freeze({ order: 3, operation_id: 'PR379_CLOSE', issue: 379, target_kind: 'PULL_REQUEST_STATE', target: 'CLOSED', operation_kind: 'IDEMPOTENT_CLOSE' }),
  Object.freeze({ order: 4, operation_id: 'CHILD_STAGE_B', issue: CHILD_ISSUE, target_kind: 'ISSUE_BODY', target: 'STAGE_B', operation_kind: 'IDEMPOTENT_SET' }),
  Object.freeze({ order: 5, operation_id: 'PARENT_STAGE_B', issue: PARENT_ISSUE, target_kind: 'ISSUE_BODY', target: 'STAGE_B', operation_kind: 'IDEMPOTENT_SET' }),
]);

const AUTHORITY_CONTROLLING = Object.freeze([
  Object.freeze({ issue: CHILD_ISSUE, comment_id: 5580972753, body_digest: 'e9054376b3c26a640034496f1cfb5c2605c04ed9083dc04000b6832dd3aa6e5e' }),
  Object.freeze({ issue: PARENT_ISSUE, comment_id: 5580975069, body_digest: '522c93197d3af0d0d39dc17e3edd53ff7862be7d2aaa14eef4d76804abcadeb6' }),
  Object.freeze({ issue: 379, comment_id: 5580978455, body_digest: '215f751ad7dae274f59e00c917fad6128456018fa41aa861e8aaebabbd4daf65' }),
]);
const AUTHORITY_PREDECESSOR = Object.freeze([
  Object.freeze({ issue: CHILD_ISSUE, comment_id: 5580530088, body_digest: '15be9217334e8eba98aeeba4922de68317720aff04ea143a652bf1cecaa45159' }),
  Object.freeze({ issue: PARENT_ISSUE, comment_id: 5580534575, body_digest: '13db0765fdad8926ac3d2fd9510932f89602003cb332b48d41a292c93d2f8886' }),
  Object.freeze({ issue: 379, comment_id: 5580538176, body_digest: '802ab4f0ae3766bba52588af64b3e9cb41896c47ba47175f921d8f7fe0fec423' }),
]);
const PR379_REVIEW_FACTS = Object.freeze([
  Object.freeze({
    id: 5137053054,
    user: 'weijunswj',
    state: 'COMMENTED',
    submitted_at: '2026-09-08T03:37:30Z',
    body_digest: 'e677613f898edac018137223a27e9e747f62a44a8777657fd91b98642ba7da5f',
  }),
]);
const PR379_COMMENT_FACTS = Object.freeze([
  Object.freeze({ id: 5579264600, user: 'weijunswj', created_at: '2026-09-08T04:31:55Z', updated_at: '2026-09-08T04:31:55Z', body_digest: '5bff4ca8ec0364c899a40955832aab70c0b067cf63ef6e76f0896e29be7f1ab4' }),
  Object.freeze({ id: 5579508129, user: 'weijunswj', created_at: '2026-09-08T05:00:02Z', updated_at: '2026-09-08T05:00:02Z', body_digest: 'dce06fd266097da537c286a03c734d173e311a5ebb64e0b6195fc5b5f01dff8e' }),
  Object.freeze({ id: 5579738186, user: 'weijunswj', created_at: '2026-09-08T05:25:00Z', updated_at: '2026-09-08T05:25:00Z', body_digest: '48806a388a2771d0c8b4dc3229a202605f0bf76fd8a356f20e8c4bd18f8d436f' }),
  Object.freeze({ id: 5579993168, user: 'weijunswj', created_at: '2026-09-08T05:53:45Z', updated_at: '2026-09-08T05:53:45Z', body_digest: '67d6900eaf01f9a6063f1dbd3a6e9742325418e0284275dde4f795637bd4465c' }),
  Object.freeze({ id: 5580538176, user: 'weijunswj', created_at: '2026-09-08T06:45:59Z', updated_at: '2026-09-08T06:45:59Z', body_digest: '802ab4f0ae3766bba52588af64b3e9cb41896c47ba47175f921d8f7fe0fec423' }),
  Object.freeze({ id: 5580978455, user: 'weijunswj', created_at: '2026-09-08T07:22:12Z', updated_at: '2026-09-08T07:22:12Z', body_digest: '215f751ad7dae274f59e00c917fad6128456018fa41aa861e8aaebabbd4daf65' }),
]);
const PR379_CHECK_FACTS = Object.freeze([
  Object.freeze({ name: 'CodeQL', status: 'completed', conclusion: 'success', head_sha: FROZEN_HEAD, completed_at: '2026-09-08T04:48:55Z' }),
  Object.freeze({ name: 'validate', status: 'completed', conclusion: 'failure', head_sha: FROZEN_HEAD, completed_at: '2026-09-08T04:52:58Z' }),
  Object.freeze({ name: 'validate', status: 'completed', conclusion: 'failure', head_sha: FROZEN_HEAD, completed_at: '2026-09-08T04:52:43Z' }),
  Object.freeze({ name: 'Analyze (actions)', status: 'completed', conclusion: 'success', head_sha: FROZEN_HEAD, completed_at: '2026-09-08T04:49:01Z' }),
  Object.freeze({ name: 'Analyze (javascript-typescript)', status: 'completed', conclusion: 'success', head_sha: FROZEN_HEAD, completed_at: '2026-09-08T04:49:50Z' }),
  Object.freeze({ name: 'Analyze (python)', status: 'completed', conclusion: 'success', head_sha: FROZEN_HEAD, completed_at: '2026-09-08T04:49:15Z' }),
]);

function success(code, extra = {}) { return { ok: true, code, ...extra }; }
function failure(code, extra = {}) { return { ok: false, code, ...extra }; }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function same(left, right) { return canonicalSerialize(left) === canonicalSerialize(right); }
function exactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function keysFrom(required, optional = []) { return [...required, ...optional]; }
function hasOnly(value, required, optional = []) {
  return isRecord(value)
    && required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
function isDigest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function isSha(value) { return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value); }
function isIssue(value) { return Number.isSafeInteger(value) && value >= 1; }
function isSafeId(value, max = 256) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
    && !value.includes('..');
}
function isSafeRevision(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && !/[\r\n]/.test(value);
}
function isProviderRevision(value) {
  return isSafeRevision(value) && value !== 'OPEN' && value !== 'CLOSED';
}
function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}
function isStringArray(value, max = 4096) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length <= max && !/[\r\n]/.test(item));
}
function sha256Text(value) { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }
function base64url(value) { return Buffer.from(value, 'utf8').toString('base64url'); }
function fromBase64url(value) {
  try { return Buffer.from(value, 'base64url').toString('utf8'); } catch (_error) { return null; }
}
function without(value, key) {
  const copy = clone(value);
  delete copy[key];
  return copy;
}
function authorityBinding(decision) {
  return {
    controlling: clone(decision.web_authority.controlling),
    predecessor: clone(decision.web_authority.predecessor),
  };
}
function authorityDigest(decision) { return digestValue(authorityBinding(decision)); }
function factsDigest(reviews, threads, comments, checks) {
  return digestValue({
    reviews: reviews.map(({ id, user, state, submitted_at, body_digest }) => ({ id, user, state, submitted_at, body_digest })),
    threads,
    comments: comments.map(({ id, user, created_at, updated_at, body_digest }) => ({ id, user, created_at, updated_at, body_digest })),
    checks,
  });
}
function sourceBoundary() {
  return {
    parent_prefix_digest: EMPTY_DIGEST,
    parent_suffix_digest: EMPTY_DIGEST,
    child_prefix_digest: EMPTY_DIGEST,
    child_suffix_digest: EMPTY_DIGEST,
  };
}
function retainedCandidate() {
  return {
    repository: REPOSITORY,
    branch: FROZEN_BRANCH,
    base_ref: FROZEN_BASE_REF,
    base_sha: MAIN_SHA,
    head: FROZEN_HEAD,
    tree: FROZEN_TREE,
    version: FROZEN_VERSION,
  };
}
function acceptedCandidate380() {
  return {
    repository: REPOSITORY,
    branch: PR380_BRANCH,
    base_ref: 'main',
    base_sha: PR380_BASE_SHA,
    head: PR380_HEAD,
    tree: PR380_TREE,
    version: PR380_VERSION,
  };
}
function finalisationEvidenceRefs() {
  return [
    {
      id: FINAL_G4_EVIDENCE_REF,
      kind: 'WEB',
      reference: FINAL_G4_EVIDENCE_REFERENCE,
      summary: 'Accepted final G4 Web review for the merged E3 candidate.',
    },
    {
      id: POST_MERGE_TECHNICAL_EVIDENCE_REF,
      kind: 'WEB',
      reference: POST_MERGE_TECHNICAL_EVIDENCE_REFERENCE,
      summary: 'Accepted post-merge technical E3 finality review.',
    },
    {
      id: PR379_NON_CONVERGENCE_EVIDENCE_REF,
      kind: 'WEB',
      reference: PR379_NON_CONVERGENCE_EVIDENCE_REFERENCE,
      summary: 'Retained #379 non-convergence history evidence.',
    },
  ];
}
function oldRootDisposition() {
  return {
    root: OLD_ROOT,
    disposition: 'NON_CONVERGENT',
    terminal: true,
    repair_budget: { used: 2, limit: 2, further_repair_authorised: false },
  };
}
function parkedRootDisposition() { return { root: PARKED_ROOT, status: 'NOT_LAUNCHED' }; }
function recoveryHold() {
  return {
    id: RECOVERY_ROOT,
    root: RECOVERY_ROOT,
    lock: LOCK,
    kind: 'BLOCKING',
    scope: 'PROGRAMME_PROJECTION_RECOVERY',
    active: true,
    blocks_normal_lanes: true,
    evidence_ref: HOLD_EVIDENCE_REF,
    summary: 'Managed v5 parent and child projections are stale and remain held pending separately authorised recovery.',
  };
}
function recoveryState() {
  return {
    root: RECOVERY_ROOT,
    lock: LOCK,
    status: 'HELD',
    normal_active_lanes: 0,
    active_blocking_recovery_hold: true,
    e3_status: 'UNACCEPTED',
    e4_status: 'PENDING',
    queued_children: [360, 361, 362, 363],
    old_root: oldRootDisposition(),
    parked_root: parkedRootDisposition(),
  };
}
function retainedRegistryEntry() {
  return {
    accepted_evidence_ref: null,
    candidate: retainedCandidate(),
    completes_child: false,
    draft: true,
    epoch_id: 'E3',
    github_state: 'OPEN',
    merged: false,
    pr: 379,
    retention_evidence_ref: RETENTION_EVIDENCE_REF,
    retirement_evidence_ref: null,
    role: 'INTERMEDIATE',
    status: 'RETAINED',
  };
}
function retired366RegistryEntry() {
  return {
    accepted_evidence_ref: null,
    candidate: null,
    completes_child: false,
    draft: true,
    epoch_id: 'E3',
    github_state: 'CLOSED',
    merged: false,
    pr: 366,
    retention_evidence_ref: null,
    retirement_evidence_ref: RECOVERY_EVIDENCE_REF,
    role: 'INTERMEDIATE',
    status: 'RETIRED',
  };
}
function retired379RegistryEntry(githubState = 'OPEN') {
  return {
    accepted_evidence_ref: null,
    candidate: retainedCandidate(),
    completes_child: false,
    draft: true,
    epoch_id: 'E3',
    github_state: githubState,
    merged: false,
    pr: 379,
    retention_evidence_ref: RETENTION_EVIDENCE_REF,
    retirement_evidence_ref: POST_MERGE_TECHNICAL_EVIDENCE_REF,
    role: 'INTERMEDIATE',
    status: 'RETIRED',
  };
}
function accepted380RegistryEntry() {
  return {
    accepted_evidence_ref: FINAL_G4_EVIDENCE_REF,
    candidate: acceptedCandidate380(),
    completes_child: false,
    draft: false,
    epoch_id: 'E3',
    github_state: 'MERGED',
    merged: true,
    pr: 380,
    retention_evidence_ref: null,
    retirement_evidence_ref: null,
    role: 'INTERMEDIATE',
    status: 'ACCEPTED',
  };
}

const DECISION_KEYS = [
  'schema', 'recovery_root', 'lock', 'repository', 'parent_issue', 'child_issue',
  'source', 'web_authority', 'pr_366', 'pr_379', 'old_root',
  'allowed_body_targets', 'prohibitions', 'self_retirement_fence', 'write_safety',
];
function makeDecisionTemplate() {
  const controlling = clone(AUTHORITY_CONTROLLING);
  const predecessor = clone(AUTHORITY_PREDECESSOR);
  const reviewFacts = clone(PR379_REVIEW_FACTS);
  const commentFacts = clone(PR379_COMMENT_FACTS);
  const checkFacts = clone(PR379_CHECK_FACTS);
  return {
    schema: DECISION_SCHEMA,
    recovery_root: RECOVERY_ROOT,
    lock: LOCK,
    repository: REPOSITORY,
    parent_issue: PARENT_ISSUE,
    child_issue: CHILD_ISSUE,
    source: {
      canonical_digest: SOURCE_CANONICAL_DIGEST,
      parent_body_sha256: SOURCE_PARENT_BODY_DIGEST,
      child_body_sha256: SOURCE_CHILD_BODY_DIGEST,
      parent_revision: SOURCE_PARENT_REVISION,
      child_revision: SOURCE_CHILD_REVISION,
      ...sourceBoundary(),
    },
    web_authority: {
      controlling,
      predecessor,
      digest: digestValue({ controlling, predecessor }),
    },
    pr_366: {
      pr: 366,
      status: 'RETIRED',
      github_state: 'CLOSED',
      draft: true,
      merged: false,
      role: 'INTERMEDIATE',
      completes_child: false,
      candidate: null,
    },
    pr_379: {
      pr: 379,
      status: 'RETAINED',
      github_state: 'OPEN',
      draft: true,
      merged: false,
      role: 'INTERMEDIATE',
      completes_child: false,
      epoch_id: 'E3',
      retention_evidence_ref: RETENTION_EVIDENCE_REF,
      candidate: retainedCandidate(),
      facts_digest: factsDigest(reviewFacts, [], commentFacts, checkFacts),
    },
    old_root: oldRootDisposition(),
    allowed_body_targets: [
      { issue: CHILD_ISSUE, order: 1, body_role: 'CHILD_MANAGED_BODY', operation_kind: 'IDEMPOTENT_SET' },
      { issue: PARENT_ISSUE, order: 2, body_role: 'PARENT_MANAGED_BODY', operation_kind: 'IDEMPOTENT_SET' },
    ],
    prohibitions: {
      active_normal_lane_creation: false,
      acceptance_or_finality: false,
      programme_apply: false,
      provider_client: false,
      provider_cas: false,
      pr_body_mutation: false,
      pr_renderer: false,
      issue_relationship_mutation: false,
      workflow_or_fetch_depth_change: false,
      repair3: false,
      g4_ready_merge: false,
    },
    self_retirement_fence: {
      source_canonical_digest: SOURCE_CANONICAL_DIGEST,
      target_canonical_digest: TARGET_CANONICAL_DIGEST,
      exact_target_canonical_only: true,
      zero_delta_retires_recovery: true,
      target_recovery_status: 'RETIRED',
      further_repair_authorised: false,
    },
    write_safety: {
      mode: WRITE_SAFETY_MODE,
      provider_cas_available: false,
      provider_cas_claim: false,
      fresh_prewrite_evidence_revision_rebinding: true,
      web_exclusive_single_writer: true,
      postwrite_exact_readback: true,
      residual_external_race_disclosed: true,
    },
  };
}
const DECISION_TEMPLATE = makeDecisionTemplate();

function validateDecision(value) {
  if (!isRecord(value) || !exactKeys(value, DECISION_KEYS)) return failure('RECOVERY_DECISION_INVALID');
  if (!same(value, DECISION_TEMPLATE)) return failure('RECOVERY_DECISION_INVALID', { reason: 'fixed_delta_or_authority_mismatch' });
  if (Object.prototype.hasOwnProperty.call(value, 'desired')
    || Object.prototype.hasOwnProperty.call(value, 'patch')
    || Object.prototype.hasOwnProperty.call(value, 'transition')) {
    return failure('RECOVERY_DECISION_INVALID', { reason: 'caller_state_control_forbidden' });
  }
  return success('RECOVERY_DECISION_VALID', { decision: clone(value), decision_digest: digestValue(value) });
}
function createRecoveryDecision() { return clone(DECISION_TEMPLATE); }

function validateCandidateStructure(value) {
  return isRecord(value)
    && exactKeys(value, ['repository', 'branch', 'base_ref', 'base_sha', 'head', 'tree', 'version'])
    && value.repository === REPOSITORY
    && isSafeId(value.branch, 240)
    && value.base_ref === FROZEN_BASE_REF
    && isSha(value.base_sha)
    && isSha(value.head)
    && isSha(value.tree)
    && typeof value.version === 'string'
    && value.version.length > 0
    && value.version.length <= 64;
}
function validateRecoveryCandidate(value) {
  return validateCandidateStructure(value)
    && value.base_sha === MAIN_SHA
    && value.head === FROZEN_HEAD
    && value.tree === FROZEN_TREE
    && value.version === FROZEN_VERSION;
}
function validateCandidate(value) { return validateCandidateStructure(value); }
function validateFinalisationCandidate(value) {
  return validateCandidateStructure(value)
    && value.base_sha === PR380_BASE_SHA
    && value.head === PR380_HEAD
    && value.tree === PR380_TREE
    && value.branch === PR380_BRANCH
    && value.version === PR380_VERSION;
}
function validateEpoch(value) {
  return isRecord(value)
    && exactKeys(value, ['evidence_ref', 'gates', 'id', 'lock', 'name', 'purpose', 'terminal_disposition'])
    && (value.evidence_ref === null || isSafeId(value.evidence_ref))
    && isStringArray(value.gates)
    && isSafeId(value.id)
    && isSafeId(value.lock, 240)
    && typeof value.name === 'string'
    && typeof value.purpose === 'string'
    && (value.terminal_disposition === null || ['ACCEPTED', 'REJECTED', 'AMEND'].includes(value.terminal_disposition));
}
function validateFinality(value) {
  return isRecord(value)
    && exactKeys(value, ['authority_ref', 'state'])
    && (value.authority_ref === null || isSafeId(value.authority_ref))
    && ['HELD', 'MERGED', 'UNMERGED'].includes(value.state);
}
function validateHold(value) {
  return isRecord(value)
    && exactKeys(value, ['active', 'blocks_normal_lanes', 'evidence_ref', 'id', 'kind', 'lock', 'root', 'scope', 'summary'])
    && typeof value.active === 'boolean'
    && typeof value.blocks_normal_lanes === 'boolean'
    && isSafeId(value.evidence_ref)
    && isSafeId(value.id)
    && isSafeId(value.kind)
    && isSafeId(value.lock, 240)
    && isSafeId(value.root, 240)
    && isSafeId(value.scope, 240)
    && typeof value.summary === 'string';
}
function validateRegistryEntry(value, target = false) {
  const required = ['accepted_evidence_ref', 'completes_child', 'epoch_id', 'pr', 'retirement_evidence_ref', 'role', 'status'];
  const optional = ['candidate', 'draft', 'github_state', 'merged', 'retention_evidence_ref'];
  if (!hasOnly(value, required, optional)
    || (value.accepted_evidence_ref !== null && !isSafeId(value.accepted_evidence_ref))
    || typeof value.completes_child !== 'boolean'
    || !isSafeId(value.epoch_id)
    || !isIssue(value.pr)
    || (value.retirement_evidence_ref !== null && !isSafeId(value.retirement_evidence_ref))
    || (Object.prototype.hasOwnProperty.call(value, 'retention_evidence_ref')
      && value.retention_evidence_ref !== null && !isSafeId(value.retention_evidence_ref))
    || value.role !== 'INTERMEDIATE'
    || !['ACTIVE', 'ACCEPTED', 'RETIRED', 'RETAINED'].includes(value.status)) return false;
  if (Object.prototype.hasOwnProperty.call(value, 'draft') && typeof value.draft !== 'boolean') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'merged') && typeof value.merged !== 'boolean') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'github_state') && !['OPEN', 'CLOSED', 'MERGED'].includes(value.github_state)) return false;
  if (Object.prototype.hasOwnProperty.call(value, 'candidate') && value.candidate !== null && !validateCandidateStructure(value.candidate)) return false;
  if (target && !exactKeys(value, ['accepted_evidence_ref', 'candidate', 'completes_child', 'draft', 'epoch_id', 'github_state', 'merged', 'pr', 'retention_evidence_ref', 'retirement_evidence_ref', 'role', 'status'])) return false;
  return true;
}
function validateChild(value) {
  const keys = ['boundaries', 'deliverables', 'dependencies', 'done_when', 'eli5', 'epochs', 'finality', 'holds', 'issue', 'lifecycle', 'objective', 'order', 'out_of_scope', 'pr_registry', 'scope', 'summary', 'title'];
  return isRecord(value)
    && exactKeys(value, keys)
    && isStringArray(value.boundaries)
    && isStringArray(value.deliverables)
    && Array.isArray(value.dependencies) && value.dependencies.every(isIssue)
    && isStringArray(value.done_when)
    && typeof value.eli5 === 'string'
    && Array.isArray(value.epochs) && value.epochs.every(validateEpoch)
    && validateFinality(value.finality)
    && Array.isArray(value.holds) && value.holds.every(validateHold)
    && isIssue(value.issue)
    && ['COMPLETED', 'CURRENT', 'QUEUED'].includes(value.lifecycle)
    && typeof value.objective === 'string'
    && Number.isSafeInteger(value.order)
    && isStringArray(value.out_of_scope)
    && Array.isArray(value.pr_registry) && value.pr_registry.every((entry) => validateRegistryEntry(entry))
    && isStringArray(value.scope)
    && typeof value.summary === 'string'
    && typeof value.title === 'string';
}
function validateParent(value) {
  return isRecord(value)
    && exactKeys(value, ['goal', 'issue', 'title'])
    && typeof value.goal === 'string'
    && value.issue === PARENT_ISSUE
    && typeof value.title === 'string';
}
function validatePrDescriptor(value) {
  const keys = ['changed_surfaces', 'child_issue', 'design_constraints', 'eli5', 'evidence_refs', 'number', 'out_of_scope', 'purpose', 'scope', 'summary', 'validation_requirements'];
  return isRecord(value)
    && exactKeys(value, keys)
    && isStringArray(value.changed_surfaces)
    && isIssue(value.child_issue)
    && isStringArray(value.design_constraints)
    && typeof value.eli5 === 'string'
    && Array.isArray(value.evidence_refs) && value.evidence_refs.every((item) => isSafeId(item))
    && isIssue(value.number)
    && isStringArray(value.out_of_scope)
    && typeof value.purpose === 'string'
    && isStringArray(value.scope)
    && typeof value.summary === 'string'
    && isStringArray(value.validation_requirements);
}
function validateLane(value) {
  return isRecord(value)
    && exactKeys(value, ['candidate', 'child_issue', 'epoch_id', 'gate', 'gate_result', 'gate_state', 'lane_id', 'work_claims'])
    && isRecord(value.candidate)
    && isSafeId(value.candidate.branch, 240)
    && value.candidate.base_ref === FROZEN_BASE_REF
    && isSha(value.candidate.base_sha)
    && isSha(value.candidate.head)
    && isSha(value.candidate.tree)
    && isSafeId(value.candidate.epoch_id)
    && isIssue(value.candidate.pr)
    && typeof value.candidate.version === 'string'
    && isIssue(value.child_issue)
    && isSafeId(value.epoch_id)
    && isSafeId(value.gate)
    && (value.gate_result === null || typeof value.gate_result === 'string')
    && value.gate_state === 'ACTIVE'
    && isSafeId(value.lane_id)
    && Array.isArray(value.work_claims)
    && value.work_claims.every((claim) => isRecord(claim)
      && exactKeys(claim, ['mode', 'operation', 'resource'])
      && isSafeId(claim.mode) && isSafeId(claim.operation) && isSafeId(claim.resource, 240));
}
function validateEvidenceRef(value) {
  return isRecord(value)
    && exactKeys(value, ['id', 'kind', 'reference', 'summary'])
    && isSafeId(value.id)
    && isSafeId(value.kind)
    && isSafeId(value.reference, 512)
    && typeof value.summary === 'string';
}
function validateTransition(value) {
  return isRecord(value)
    && exactKeys(value, ['child_issue', 'disposition', 'epoch_id', 'evidence_ref', 'gate', 'id'])
    && isIssue(value.child_issue)
    && isSafeId(value.disposition)
    && isSafeId(value.epoch_id)
    && isSafeId(value.evidence_ref)
    && isSafeId(value.gate)
    && isSafeId(value.id);
}
function validateOldRoot(value) {
  return isRecord(value)
    && exactKeys(value, ['disposition', 'repair_budget', 'root', 'terminal'])
    && value.root === OLD_ROOT
    && value.disposition === 'NON_CONVERGENT'
    && value.terminal === true
    && isRecord(value.repair_budget)
    && exactKeys(value.repair_budget, ['further_repair_authorised', 'limit', 'used'])
    && value.repair_budget.used === 2
    && value.repair_budget.limit === 2
    && value.repair_budget.further_repair_authorised === false;
}
function validateRecoveryState(value) {
  return isRecord(value)
    && exactKeys(value, ['active_blocking_recovery_hold', 'e3_status', 'e4_status', 'lock', 'normal_active_lanes', 'old_root', 'parked_root', 'queued_children', 'root', 'status'])
    && value.root === RECOVERY_ROOT
    && value.lock === LOCK
    && value.status === 'HELD'
    && value.normal_active_lanes === 0
    && value.active_blocking_recovery_hold === true
    && value.e3_status === 'UNACCEPTED'
    && value.e4_status === 'PENDING'
    && same(value.queued_children, [360, 361, 362, 363])
    && validateOldRoot(value.old_root)
    && isRecord(value.parked_root)
    && exactKeys(value.parked_root, ['root', 'status'])
    && value.parked_root.root === PARKED_ROOT
    && value.parked_root.status === 'NOT_LAUNCHED';
}
function hasWebEvidence(state, id, reference) {
  return Array.isArray(state?.evidence_refs)
    && state.evidence_refs.filter((item) => item.id === id && item.kind === 'WEB' && item.reference === reference).length === 1;
}
function eligibleRecoveryHold(child, state) {
  return Array.isArray(child?.holds)
    && child.holds.length === 1
    && same(child.holds[0], recoveryHold())
    && hasWebEvidence(state, HOLD_EVIDENCE_REF, HOLD_EVIDENCE_REFERENCE);
}
function registryEntryByPr(state, pr) {
  return childByIssue(state, CHILD_ISSUE)?.pr_registry.find((entry) => entry.pr === pr) || null;
}
function finalisationEvidencePresent(state, id, reference) {
  return hasWebEvidence(state, id, reference);
}
function finalisationTransition(state) {
  return state.historical_transitions.filter((item) => item.id === FINALISATION_TRANSITION_ID);
}
function validateInterEpochStateV5(value) {
  if (!isRecord(value) || Object.prototype.hasOwnProperty.call(value, 'recovery')) {
    return failure('V5_INTER_EPOCH_STATE_INVALID', { reason: 'recovery_present' });
  }
  const child = childByIssue(value, CHILD_ISSUE);
  if (!child
    || child.lifecycle !== 'CURRENT'
    || child.finality.state !== 'UNMERGED'
    || child.finality.authority_ref !== null
    || child.holds.length !== 0
    || value.active_lanes.length !== 0
    || value.concurrency_authority.permitted_child_issues.length !== 0
    || value.design_lock !== FINALISATION_LOCK) {
    return failure('V5_INTER_EPOCH_STATE_INVALID', { reason: 'clean_zero_lane_invariants' });
  }
  const epochs = new Map(child.epochs.map((epoch) => [epoch.id, epoch]));
  if (child.epochs.length !== 4
    || !same([...epochs.keys()], ['E1', 'E2', 'E3', 'E4'])
    || ['E1', 'E2', 'E3'].some((id) => epochs.get(id)?.terminal_disposition !== 'ACCEPTED'
      || epochs.get(id)?.evidence_ref === null
      || !isSafeId(epochs.get(id)?.evidence_ref))
    || epochs.get('E4')?.terminal_disposition !== null
    || epochs.get('E4')?.evidence_ref !== null) {
    return failure('V5_INTER_EPOCH_STATE_INVALID', { reason: 'epoch_prefix' });
  }
  const registry = child.pr_registry;
  const byPr = new Map(registry.map((entry) => [entry.pr, entry]));
  if (registry.length !== 3 || !same([...byPr.keys()].sort((a, b) => a - b), [366, 379, 380])) {
    return failure('V5_INTER_EPOCH_STATE_INVALID', { reason: 'registry_topology' });
  }
  if (!validateRegistryEntry(byPr.get(366), true) || !same(byPr.get(366), retired366RegistryEntry())) {
    return failure('V5_INTER_EPOCH_STATE_INVALID', { reason: 'pr366_terminal_history' });
  }
  if (!validateRegistryEntry(byPr.get(379), true)
    || !['OPEN', 'CLOSED'].includes(byPr.get(379).github_state)
    || !same(byPr.get(379), retired379RegistryEntry(byPr.get(379).github_state))) {
    return failure('V5_INTER_EPOCH_STATE_INVALID', { reason: 'pr379_terminal_history' });
  }
  if (!validateRegistryEntry(byPr.get(380), true) || !same(byPr.get(380), accepted380RegistryEntry())) {
    return failure('V5_INTER_EPOCH_STATE_INVALID', { reason: 'pr380_accepted_identity' });
  }
  const evidenceRequirements = finalisationEvidenceRefs();
  if (evidenceRequirements.some((entry) => !finalisationEvidencePresent(value, entry.id, entry.reference))) {
    return failure('V5_INTER_EPOCH_STATE_INVALID', { reason: 'finalisation_evidence' });
  }
  const transitions = finalisationTransition(value);
  if (transitions.length !== 1 || !same(transitions[0], {
    child_issue: CHILD_ISSUE,
    disposition: 'ACCEPTED',
    epoch_id: 'E3',
    evidence_ref: FINAL_G4_EVIDENCE_REF,
    gate: 'G4',
    id: FINALISATION_TRANSITION_ID,
  })) return failure('V5_INTER_EPOCH_STATE_INVALID', { reason: 'finalisation_transition' });
  return success('V5_INTER_EPOCH_STATE_VALID', { state: clone(value), canonical_digest: digestValue(value) });
}
function looksLikeInterEpochState(value) {
  const child = childByIssue(value, CHILD_ISSUE);
  return isRecord(value)
    && !Object.prototype.hasOwnProperty.call(value, 'recovery')
    && Array.isArray(value.active_lanes)
    && value.active_lanes.length === 0
    && (child?.finality?.state === 'UNMERGED' || child?.pr_registry?.some((entry) => entry.pr === 380));
}
function validateCanonicalStateV5(value) {
  const required = ['active_lanes', 'children', 'concurrency_authority', 'design_lock', 'evidence_refs', 'extensions', 'historical_transitions', 'parent', 'predecessor_contract_digest', 'prs', 'repository', 'schema'];
  const optional = ['recovery'];
  if (!hasOnly(value, required, optional)
    || value.schema !== STATE_SCHEMA
    || value.repository !== REPOSITORY
    || typeof value.design_lock !== 'string'
    || !validateParent(value.parent)
    || !isDigest(value.predecessor_contract_digest)
    || !Array.isArray(value.children)
    || value.children.length !== 6
    || !value.children.every(validateChild)
    || !Array.isArray(value.prs)
    || !value.prs.every(validatePrDescriptor)
    || !isRecord(value.concurrency_authority)
    || !exactKeys(value.concurrency_authority, ['authority_digest', 'authority_ref', 'max_active_lanes', 'mode', 'permitted_child_issues'])
    || (value.concurrency_authority.authority_digest !== null && !isDigest(value.concurrency_authority.authority_digest))
    || (value.concurrency_authority.authority_ref !== null && !isSafeId(value.concurrency_authority.authority_ref))
    || value.concurrency_authority.max_active_lanes !== 1
    || value.concurrency_authority.mode !== 'SINGLE_DEFAULT'
    || !Array.isArray(value.concurrency_authority.permitted_child_issues)
    || value.concurrency_authority.permitted_child_issues.some((item) => !isIssue(item))
    || !Array.isArray(value.active_lanes)
    || !Array.isArray(value.evidence_refs)
    || !value.evidence_refs.every(validateEvidenceRef)
    || !Array.isArray(value.historical_transitions)
    || !value.historical_transitions.every(validateTransition)
    || !Array.isArray(value.extensions)
    || value.extensions.some((item) => !isRecord(item))) return failure('V5_STATE_INVALID');
  const expectedIssues = [358, 359, 360, 361, 362, 363];
  const issues = value.children.map((child) => child.issue);
  if (!same(issues, expectedIssues) || new Set(issues).size !== issues.length) return failure('V5_STATE_INVALID', { reason: 'child_topology' });
  if (value.children.some((child, index) => child.order !== index + 1)) return failure('V5_STATE_INVALID', { reason: 'child_order' });
  const current = value.children.filter((child) => child.lifecycle === 'CURRENT');
  if (current.length !== 1 || current[0].issue !== CHILD_ISSUE) return failure('V5_STATE_INVALID', { reason: 'current_child' });
  const laneChildren = new Set();
  for (const lane of value.active_lanes) {
    if (!validateLane(lane) || laneChildren.has(lane.child_issue)) return failure('V5_STATE_INVALID', { reason: 'active_lane' });
    laneChildren.add(lane.child_issue);
    const child = value.children.find((item) => item.issue === lane.child_issue);
    if (!child || child.lifecycle !== 'CURRENT') return failure('V5_STATE_INVALID', { reason: 'lane_not_current' });
  }
  if (value.active_lanes.length > value.concurrency_authority.max_active_lanes) return failure('V5_STATE_INVALID', { reason: 'lane_limit' });
  if (value.active_lanes.length === 0) {
    if (Object.prototype.hasOwnProperty.call(value, 'recovery')) {
      if (!validateRecoveryState(value.recovery)
        || current[0].finality.state !== 'HELD' || !eligibleRecoveryHold(current[0], value)) {
        return failure('V5_CURRENT_ZERO_LANE_HOLD_REQUIRED');
      }
    } else {
      const interEpoch = validateInterEpochStateV5(value);
      if (!interEpoch.ok) return looksLikeInterEpochState(value) ? interEpoch : failure('V5_CURRENT_ZERO_LANE_HOLD_REQUIRED');
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'recovery')) {
    if (!validateRecoveryState(value.recovery)
      || value.active_lanes.length !== 0
      || value.children.find((child) => child.issue === CHILD_ISSUE).finality.state !== 'HELD'
      || !eligibleRecoveryHold(value.children.find((child) => child.issue === CHILD_ISSUE), value)) {
      return failure('V5_RECOVERY_STATE_INVALID');
    }
    const registry = value.children.find((child) => child.issue === CHILD_ISSUE).pr_registry;
    if (registry.length !== 2) return failure('V5_RECOVERY_STATE_INVALID', { reason: 'pr_registry_count' });
    const byPr = new Map(registry.map((entry) => [entry.pr, entry]));
    if (!byPr.has(366) || !byPr.has(379)
      || !validateRegistryEntry(byPr.get(366), true)
      || !validateRegistryEntry(byPr.get(379), true)
      || !same(byPr.get(366), retired366RegistryEntry())
      || !same(byPr.get(379), retainedRegistryEntry())) {
      return failure('V5_RECOVERY_STATE_INVALID', { reason: 'pr_registry_semantics' });
    }
    if (!hasWebEvidence(value, RETENTION_EVIDENCE_REF, RETENTION_EVIDENCE_REFERENCE)) {
      return failure('V5_RECOVERY_STATE_INVALID', { reason: 'retention_evidence' });
    }
    if (TARGET_CANONICAL_DIGEST !== null && digestValue(value) !== TARGET_CANONICAL_DIGEST) {
      return failure('V5_RECOVERY_TARGET_NOT_EXACT');
    }
  } else if (value.active_lanes.length === 0) {
    const interEpoch = validateInterEpochStateV5(value);
    if (!interEpoch.ok) return interEpoch;
  }
  return success('V5_STATE_VALID', { state: clone(value), canonical_digest: digestValue(value) });
}

function recoveryAuthorityEvidence(entry) {
  if (entry.issue === CHILD_ISSUE && entry.comment_id === 5580530088) {
    return {
      id: HOLD_EVIDENCE_REF,
      kind: 'WEB',
      reference: HOLD_EVIDENCE_REFERENCE,
      summary: 'Accepted G1 recovery-hold authority body bound by digest.',
    };
  }
  if (entry.issue === 379 && entry.comment_id === 5580538176) {
    return {
      id: RETENTION_EVIDENCE_REF,
      kind: 'WEB',
      reference: RETENTION_EVIDENCE_REFERENCE,
      summary: 'Accepted retained PR #379 chronology body bound by digest.',
    };
  }
  return {
    id: 'recovery-authority-' + String(entry.comment_id),
    kind: 'WEB',
    reference: 'github:issue-comment:' + String(entry.issue) + ':' + String(entry.comment_id),
    summary: 'Accepted recovery authority body bound by digest.',
  };
}
function recoveryPredecessorEvidence(entry) {
  if (entry.issue === CHILD_ISSUE && entry.comment_id === 5580530088) {
    return {
      id: HOLD_EVIDENCE_REF,
      kind: 'WEB',
      reference: HOLD_EVIDENCE_REFERENCE,
      summary: 'Accepted G1 recovery-hold authority body bound by digest.',
    };
  }
  if (entry.issue === 379 && entry.comment_id === 5580538176) {
    return {
      id: RETENTION_EVIDENCE_REF,
      kind: 'WEB',
      reference: RETENTION_EVIDENCE_REFERENCE,
      summary: 'Accepted retained PR #379 chronology body bound by digest.',
    };
  }
  return {
    id: 'recovery-predecessor-' + String(entry.comment_id),
    kind: 'WEB',
    reference: 'github:issue-comment:' + String(entry.issue) + ':' + String(entry.comment_id),
    summary: 'Predecessor non-convergence evidence bound by digest.',
  };
}
function buildRecoveryTargetState(sourceState) {
  const valid = validateCanonicalStateV5(sourceState);
  if (!valid.ok || Object.prototype.hasOwnProperty.call(sourceState, 'recovery')) return null;
  const next = clone(sourceState);
  next.design_lock = LOCK;
  next.active_lanes = [];
  next.concurrency_authority.permitted_child_issues = [];
  const child = next.children.find((item) => item.issue === CHILD_ISSUE);
  child.summary = 'E1 and E2 remain accepted; E3 is held in a zero-lane recovery window pending separate Web acceptance.';
  child.done_when = [
    'E1 and E2 remain accepted with retained evidence.',
    'The v5 projection recovery is read back exactly and separate Web authority records E3 acceptance.',
    'E4 truthful native adapters are complete and Web records S2 finality.',
  ];
  child.scope = [
    'Read-only v5 programme projection bootstrap recovery for the canonical parent and current child.',
    'Preservation of retained and historical PR chronology without launching a normal gate.',
  ];
  child.out_of_scope = [
    'G4 result or E3 acceptance before separate Web authority.',
    'Ready, merge, finality, E4 execution and S3 through S6 progression.',
    'Programme Apply or any provider operation in this recovery window.',
  ];
  child.boundaries = [
    'Web owns E3 acceptance, Ready, merge and finality.',
    'The recovery hold is Web-exclusive and has no provider CAS claim.',
    'E4 and S3 through S6 remain pending or blocked/queued.',
  ];
  child.eli5 = 'The programme is paused safely while the two managed views are repaired from trusted Web evidence; no normal work lane is running.';
  child.finality = { authority_ref: null, state: 'HELD' };
  child.holds = [recoveryHold()];
  child.pr_registry = [retired366RegistryEntry(), retainedRegistryEntry()];
  const oldPr = next.prs.find((item) => item.number === 366);
  if (oldPr) {
    oldPr.summary = 'Historical PR #366 is closed and retired; no merged candidate is active.';
  }
  next.evidence_refs = [
    ...next.evidence_refs,
    ...DECISION_TEMPLATE.web_authority.controlling.map(recoveryAuthorityEvidence),
    ...DECISION_TEMPLATE.web_authority.predecessor.map(recoveryPredecessorEvidence),
  ];
  next.recovery = recoveryState();
  return next;
}

function validateFinalisationSourceState(sourceState) {
  const valid = validateCanonicalStateV5(sourceState);
  if (!valid.ok
    || !Object.prototype.hasOwnProperty.call(sourceState, 'recovery')
    || valid.canonical_digest !== FINALISATION_SOURCE_CANONICAL_DIGEST) {
    return failure('FINALISATION_SOURCE_STATE_INVALID');
  }
  const child = childByIssue(sourceState, CHILD_ISSUE);
  const registry = child?.pr_registry || [];
  const byPr = new Map(registry.map((entry) => [entry.pr, entry]));
  if (registry.length !== 2
    || !same([...byPr.keys()].sort((a, b) => a - b), [366, 379])
    || !same(byPr.get(366), retired366RegistryEntry())
    || !same(byPr.get(379), retainedRegistryEntry())) {
    return failure('FINALISATION_SOURCE_STATE_INVALID', { reason: 'recovery_registry_identity' });
  }
  return success('FINALISATION_SOURCE_STATE_VALID', { state: clone(sourceState), canonical_digest: valid.canonical_digest });
}
function buildPostMergeEpochFinalisationStageATargetState(sourceState) {
  const sourceValid = validateFinalisationSourceState(sourceState);
  if (!sourceValid.ok) return null;
  const next = clone(sourceState);
  next.design_lock = FINALISATION_LOCK;
  next.active_lanes = [];
  next.concurrency_authority.permitted_child_issues = [];
  delete next.recovery;
  const child = childByIssue(next, CHILD_ISSUE);
  child.summary = 'E1, E2 and E3 are accepted; E4 remains pending while the current child stays unmerged and waits for separate Web E4 authority.';
  child.done_when = [
    'E1, E2 and E3 remain accepted with retained evidence.',
    'E3 merge/finality and #380/#379 chronology are recorded exactly; the current child remains unmerged.',
    'E4 truthful native adapters are complete and Web records S2 finality.',
  ];
  child.scope = [
    'Retained-skill productisation, the v5 GitHub programme reconciler and truthful post-merge epoch finalisation.',
    'A clean inter-epoch boundary with E3 accepted and E4 pending.',
  ];
  child.out_of_scope = [
    'E4 execution, E4 activation and S3 through S6 progression.',
    'Programme Apply or provider state changes not separately authorised by future Web finalisation authority.',
  ];
  child.boundaries = [
    'Web owns E4 authority, Ready, merge, finality and consequential provider operations.',
    'This clean inter-epoch state has no recovery hold, normal lane, active gate or provider CAS claim.',
    'E4 remains pending and no automatic transition is performed.',
  ];
  child.eli5 = 'E3 is accepted and the next epoch is waiting; the current child is still not finished and no work lane is running.';
  child.finality = { authority_ref: null, state: 'UNMERGED' };
  child.holds = [];
  child.epochs = child.epochs.map((epoch) => epoch.id === 'E3'
    ? { ...epoch, evidence_ref: FINAL_G4_EVIDENCE_REF, terminal_disposition: 'ACCEPTED' }
    : epoch.id === 'E4'
      ? { ...epoch, evidence_ref: null, terminal_disposition: null }
      : epoch);
  child.pr_registry = [retired366RegistryEntry(), retired379RegistryEntry('OPEN'), accepted380RegistryEntry()];
  next.evidence_refs = [
    ...next.evidence_refs,
    ...finalisationEvidenceRefs().filter((item) => !next.evidence_refs.some((existing) => existing.id === item.id)),
  ];
  if (!finalisationTransition(next).length) {
    next.historical_transitions = [
      ...next.historical_transitions,
      {
        child_issue: CHILD_ISSUE,
        disposition: 'ACCEPTED',
        epoch_id: 'E3',
        evidence_ref: FINAL_G4_EVIDENCE_REF,
        gate: 'G4',
        id: FINALISATION_TRANSITION_ID,
      },
    ];
  }
  return validateCanonicalStateV5(next).ok ? next : null;
}
function buildPostMergeEpochFinalisationStageBTargetState(stageAState) {
  const stageAValid = validateCanonicalStateV5(stageAState);
  if (!stageAValid.ok || !validateInterEpochStateV5(stageAState).ok || registryEntryByPr(stageAState, 379)?.github_state !== 'OPEN') return null;
  const next = clone(stageAState);
  const child = childByIssue(next, CHILD_ISSUE);
  child.pr_registry = child.pr_registry.map((entry) => entry.pr === 379 ? retired379RegistryEntry('CLOSED') : entry);
  return validateCanonicalStateV5(next).ok ? next : null;
}

function childByIssue(state, issue) { return state.children.find((child) => child.issue === issue) || null; }
function childSnapshotState(state) {
  const child = childByIssue(state, CHILD_ISSUE);
  const lane = state.active_lanes.find((item) => item.child_issue === CHILD_ISSUE) || null;
  const recoveryHoldActive = Boolean(state.recovery && eligibleRecoveryHold(child, state));
  return {
    lifecycle: child.lifecycle,
    finality: child.finality.state,
    gate_state: state.recovery ? 'HELD' : lane ? lane.gate_state : 'NONE',
    normal_active_lanes: state.active_lanes.length,
    active_blocking_recovery_hold: recoveryHoldActive,
  };
}
function epochStatus(child, epochId, lane) {
  const epoch = child.epochs.find((item) => item.id === epochId);
  if (!epoch) return 'UNKNOWN';
  if (epoch.terminal_disposition) return epoch.terminal_disposition;
  if (child.finality.state === 'HELD' && epochId === 'E3') return 'UNACCEPTED';
  if (lane?.epoch_id === epochId) return lane.gate_state;
  return epochId === 'E4' ? 'PENDING' : 'PENDING';
}
function registryEntry(state, pr) {
  return registryEntryByPr(state, pr);
}
function registryStateText(entry) {
  if (!entry) return 'NOT REPRESENTED';
  return entry.status + ' / ' + entry.github_state;
}
function activeRecoveryHold(state) {
  const child = childByIssue(state, CHILD_ISSUE);
  return Boolean(state.recovery && eligibleRecoveryHold(child, state));
}
function projectionPayload(state, kind) {
  const child = childByIssue(state, CHILD_ISSUE);
  const lane = state.active_lanes.find((item) => item.child_issue === CHILD_ISSUE) || null;
  const recoveryHoldActive = activeRecoveryHold(state);
  const e3Status = state.recovery ? 'UNACCEPTED' : epochStatus(child, 'E3', lane);
  const e4Status = epochStatus(child, 'E4', lane);
  const retained = registryEntry(state, 379);
  const retired = registryEntry(state, 366);
  const accepted = registryEntry(state, 380);
  if (kind === 'parent') {
    return {
      schema: PROJECTION_SCHEMA,
      kind: 'parent',
      number: PARENT_ISSUE,
      parent_issue: PARENT_ISSUE,
      repository: REPOSITORY,
      lifecycle: state.recovery ? 'HELD' : 'ACTIVE',
      finality: state.recovery ? 'HELD' : child.finality.state,
      normal_active_lanes: state.active_lanes.length,
      active_blocking_recovery_hold: recoveryHoldActive,
      current_child_issues: state.children.filter((item) => item.lifecycle === 'CURRENT').map((item) => item.issue),
      queued_children: state.children.filter((item) => item.lifecycle === 'QUEUED').map((item) => item.issue),
      retained_pr: retained?.pr || null,
      retired_pr: retired?.pr || null,
      accepted_pr: accepted?.pr || null,
      e3_status: e3Status,
      e4_status: e4Status,
      old_root: state.recovery ? OLD_ROOT : null,
      parked_root: state.recovery ? PARKED_ROOT : null,
    };
  }
  return {
    schema: PROJECTION_SCHEMA,
    kind: 'child',
    number: CHILD_ISSUE,
    parent_issue: PARENT_ISSUE,
    repository: REPOSITORY,
    lifecycle: child.lifecycle,
    finality: child.finality.state,
    epoch: lane?.epoch_id || 'E3',
    gate: state.recovery ? 'NONE' : lane?.gate || 'NONE',
    gate_state: state.recovery ? 'HELD' : lane?.gate_state || 'NONE',
    normal_active_lanes: state.active_lanes.length,
    active_blocking_recovery_hold: recoveryHoldActive,
    e3_status: e3Status,
    e4_status: e4Status,
    retained_pr: retained?.pr || null,
    retired_pr: retired?.pr || null,
    accepted_pr: accepted?.pr || null,
    queued_children: state.children.filter((item) => item.lifecycle === 'QUEUED').map((item) => item.issue),
    old_root: state.recovery ? OLD_ROOT : null,
    parked_root: state.recovery ? PARKED_ROOT : null,
  };
}
function projectionEnvelope(state, kind) {
  const payload = projectionPayload(state, kind);
  return {
    canonical_digest: digestValue(state),
    extension_digest: digestValue({ schema: SURFACE_SCHEMA, recovery: state.recovery || null }),
    kind,
    number: kind === 'parent' ? PARENT_ISSUE : CHILD_ISSUE,
    parent_issue: PARENT_ISSUE,
    projection_digest: digestValue(payload),
    repository: REPOSITORY,
    schema: PROJECTION_SCHEMA,
  };
}
function validateProjectionEnvelope(value, kind, canonicalDigest) {
  if (!isRecord(value)
    || !exactKeys(value, ['canonical_digest', 'extension_digest', 'kind', 'number', 'parent_issue', 'projection_digest', 'repository', 'schema'])
    || !isDigest(value.canonical_digest)
    || !isDigest(value.extension_digest)
    || value.kind !== kind
    || value.number !== (kind === 'parent' ? PARENT_ISSUE : CHILD_ISSUE)
    || value.parent_issue !== PARENT_ISSUE
    || !isDigest(value.projection_digest)
    || value.repository !== REPOSITORY
    || value.schema !== PROJECTION_SCHEMA
    || canonicalDigest !== undefined && value.canonical_digest !== canonicalDigest) return false;
  return true;
}
const MANAGED_MARKERS = Object.freeze({
  parent: Object.freeze({
    begin: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PARENT:BEGIN v5 -->',
    end: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PARENT:END -->',
  }),
  child: Object.freeze({
    begin: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-CHILD:BEGIN v5 -->',
    end: '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-CHILD:END -->',
  }),
});
function splitManagedBlock(body, kind) {
  if (typeof body !== 'string') return null;
  const marker = MANAGED_MARKERS[kind];
  const start = body.indexOf(marker.begin);
  const end = body.indexOf(marker.end);
  if (start < 0 || end < start || body.indexOf(marker.begin, start + marker.begin.length) >= 0
    || body.indexOf(marker.end, end + marker.end.length) >= 0) return null;
  return {
    prefix: body.slice(0, start),
    managed: body.slice(start, end + marker.end.length),
    suffix: body.slice(end + marker.end.length),
  };
}
function markerPayload(body, expression) {
  const matches = [...body.matchAll(expression)];
  return matches.length === 1 ? matches[0][1] : null;
}
function parseParentV5Body(body, options = {}) {
  if (options.complete === false || typeof body !== 'string') return failure('PARENT_V5_BODY_INCOMPLETE');
  const split = splitManagedBlock(body, 'parent');
  if (!split) return failure('PARENT_V5_PARSE_UNCERTAIN');
  const encoded = markerPayload(split.managed, /^<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-CANONICAL v5 ([A-Za-z0-9_-]+) -->$/gm);
  if (!encoded) return failure('PARENT_V5_PARSE_UNCERTAIN');
  const decoded = fromBase64url(encoded);
  if (decoded === null) return failure('PARENT_V5_PARSE_UNCERTAIN');
  let payload;
  try { payload = JSON.parse(decoded); } catch (_error) { return failure('PARENT_V5_PARSE_UNCERTAIN'); }
  if (!isRecord(payload) || !exactKeys(payload, ['envelope', 'state'])) return failure('PARENT_V5_PARSE_UNCERTAIN');
  const stateValid = validateCanonicalStateV5(payload.state);
  if (!stateValid.ok || !validateProjectionEnvelope(payload.envelope, 'parent', stateValid.canonical_digest)) return failure('PARENT_V5_STATE_INVALID');
  if (options.repository && options.repository !== payload.state.repository) return failure('PARENT_V5_IDENTITY_MISMATCH');
  if (options.parent_issue && options.parent_issue !== payload.state.parent.issue) return failure('PARENT_V5_IDENTITY_MISMATCH');
  return success('PARENT_V5_VALID', {
    kind: 'parent',
    state: clone(payload.state),
    envelope: clone(payload.envelope),
    prefix: split.prefix,
    suffix: split.suffix,
    managed: split.managed,
    body_digest: sha256Text(body),
    managed_digest: sha256Text(split.managed),
    prefix_digest: sha256Text(split.prefix),
    suffix_digest: sha256Text(split.suffix),
  });
}
function parseChildV5Body(body, options = {}) {
  if (options.complete === false || typeof body !== 'string') return failure('CHILD_V5_BODY_INCOMPLETE');
  const split = splitManagedBlock(body, 'child');
  if (!split) return failure('CHILD_V5_PARSE_UNCERTAIN');
  const encoded = markerPayload(split.managed, /^<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PROJECTION v1 ([A-Za-z0-9_-]+) -->$/gm);
  if (!encoded) return failure('CHILD_V5_PARSE_UNCERTAIN');
  const decoded = fromBase64url(encoded);
  if (decoded === null) return failure('CHILD_V5_PARSE_UNCERTAIN');
  let envelope;
  try { envelope = JSON.parse(decoded); } catch (_error) { return failure('CHILD_V5_PARSE_UNCERTAIN'); }
  if (!validateProjectionEnvelope(envelope, 'child', options.canonical_digest)) return failure('CHILD_V5_PROJECTION_INVALID');
  if (options.repository && options.repository !== envelope.repository) return failure('CHILD_V5_IDENTITY_MISMATCH');
  if (options.parent_issue && options.parent_issue !== envelope.parent_issue) return failure('CHILD_V5_IDENTITY_MISMATCH');
  return success('CHILD_V5_VALID', {
    kind: 'child',
    envelope: clone(envelope),
    prefix: split.prefix,
    suffix: split.suffix,
    managed: split.managed,
    body_digest: sha256Text(body),
    managed_digest: sha256Text(split.managed),
    prefix_digest: sha256Text(split.prefix),
    suffix_digest: sha256Text(split.suffix),
  });
}
function parseProgrammeV5Body(body, kind, options = {}) {
  return kind === 'parent' ? parseParentV5Body(body, options) : parseChildV5Body(body, options);
}

function managedContent(kind, state) {
  const child = childByIssue(state, CHILD_ISSUE);
  const recovery = state.recovery || null;
  const lane = state.active_lanes.find((item) => item.child_issue === CHILD_ISSUE) || null;
  const holdActive = activeRecoveryHold(state);
  const currentGateState = recovery ? 'HELD' : lane?.gate_state || 'NONE';
  const nextAction = recovery
    ? 'Maintain the blocking recovery hold; collect fresh prewrite evidence and exact readback only under the authorised Web window.'
    : 'Wait for separate Web E4 authority; do not launch E4 or Programme Apply.';
  const registry = child.pr_registry;
  const registryRows = registry.map((entry) => '| #' + String(entry.pr) + ' | ' + entry.status + ' | '
    + entry.github_state + ' | ' + String(entry.draft) + ' | ' + String(entry.merged) + ' | '
    + entry.role + ' | ' + String(entry.completes_child) + ' | ' + entry.epoch_id + ' |');
  const epochRows = child.epochs.map((epoch) => '| ' + epoch.id + ' | ' + epochStatus(child, epoch.id, lane) + ' |');
  const boundaryLines = child.boundaries.map((boundary) => '- ' + boundary);
  const lines = [];
  if (kind === 'parent') {
    lines.push(
      MANAGED_MARKERS.parent.begin,
      '# AI Agent Toolkit Programme',
      '',
      '## Programme status',
      '| Field | Value |',
      '| --- | --- |',
      '| Repository | ' + REPOSITORY + ' |',
      '| Programme lifecycle | ' + (recovery ? 'HELD' : 'ACTIVE') + ' |',
      '| Programme finality | ' + (recovery ? 'HELD' : child.finality.state) + ' |',
      '| Normal active lanes | ' + String(state.active_lanes.length) + ' |',
      '| Active blocking recovery hold | ' + (holdActive ? 'YES' : 'NO') + ' |',
      '',
      '## Active normal lanes',
      recovery
        ? 'None. #359 is held by the eligible blocking recovery hold.'
        : state.active_lanes.length === 0 ? 'None. #359 is at a clean inter-epoch boundary.' : String(state.active_lanes.length),
      '',
      '## Children',
      '| Issue | Lifecycle | Gate state | Result |',
      '| --- | --- | --- | --- |',
    );
    for (const item of state.children) {
      const blocked = recovery && item.lifecycle === 'QUEUED' ? 'BLOCKED/QUEUED' : item.lifecycle;
      const itemLane = state.active_lanes.find((activeLane) => activeLane.child_issue === item.issue) || null;
      const gateState = item.issue === CHILD_ISSUE ? currentGateState : itemLane?.gate_state || 'NONE';
      const result = item.issue === CHILD_ISSUE ? 'CURRENT / ' + item.finality.state : blocked;
      lines.push('| #' + String(item.issue) + ' | ' + blocked + ' | ' + gateState + ' | ' + result + ' |');
    }
    lines.push(
      '',
      '## PR registry',
      '| PR | Status | GitHub state | Draft | Merged | Role | Completes child | Epoch |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...registryRows,
      '',
      recovery ? '## Recovery hold' : '## Inter-epoch boundary',
      '- Active blocking recovery hold: ' + (holdActive ? 'YES' : 'NO'),
      recovery ? '- Write safety: ' + WRITE_SAFETY_MODE : '- No recovery window is active.',
      '- Provider CAS claim: NO',
      ...(recovery ? ['- Hold evidence: ' + HOLD_EVIDENCE_REF, '- #379 retention evidence: ' + RETENTION_EVIDENCE_REF] : [
        '- E3: ' + epochStatus(child, 'E3', lane),
        '- E4: ' + epochStatus(child, 'E4', lane),
        '- #380: ' + registryStateText(registryEntry(state, 380)),
        '- #379: ' + registryStateText(registryEntry(state, 379)),
      ]),
      '',
      '## Root dispositions',
      recovery ? '- Old root: ' + OLD_ROOT + ' / NON_CONVERGENT / terminal=true / repair budget=2/2 / further repair authorised=false' : '- None',
      recovery ? '- Parked root: ' + PARKED_ROOT + ' / NOT_LAUNCHED' : '',
      '',
      '## Epoch and queue status',
      ...child.epochs.map((epoch) => '- ' + epoch.id + ': ' + epochStatus(child, epoch.id, lane)),
      '- S3-S6: ' + (state.children.filter((item) => item.lifecycle === 'QUEUED').length ? 'BLOCKED/QUEUED' : 'NOT QUEUED'),
      '- G4 active: ' + (lane?.gate === 'G4' && lane.gate_state === 'ACTIVE' ? 'YES' : 'NO'),
      '',
      '## Boundaries',
      ...boundaryLines,
      '- Programme Apply is not authorised.',
      '',
      '## Next action',
      nextAction,
      '',
      '## ELI5',
      child.eli5,
      '',
      '## Additional context',
      recovery
        ? 'The retained PR is chronology only; it is not active execution, accepted, Ready, G4, merged or child completion.'
        : 'The canonical registry records accepted E3 merge evidence and retained #379 chronology; E4 remains unstarted.',
      '',
      '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-CANONICAL v5 ' + base64url(JSON.stringify({ envelope: projectionEnvelope(state, 'parent'), state })) + ' -->',
      MANAGED_MARKERS.parent.end,
    );
    return lines.join('\n');
  }
  lines.push(
    MANAGED_MARKERS.child.begin,
    '# ' + child.title,
    '',
    '## Summary',
    child.summary,
    '',
    '## Operating contract',
    '| Field | Value |',
    '| --- | --- |',
    '| Parent | #240 |',
    '| Lane | ' + (lane ? '#' + String(lane.candidate.pr) : 'None') + ' |',
    '| Lifecycle | ' + child.lifecycle + ' |',
    '| Epoch | ' + (lane?.epoch_id || 'E3') + ' |',
    '| Gate | ' + (recovery ? 'None' : lane?.gate || 'None') + ' |',
    '| Gate state | ' + currentGateState + ' |',
    '| Lock | ' + state.design_lock + ' |',
    '| Finality | ' + child.finality.state + ' |',
    '',
    '## Objective',
    child.objective,
    '',
    '## Progress',
    ...child.epochs.map((epoch) => '- ' + epoch.id + ': ' + epochStatus(child, epoch.id, lane)),
    '- Normal active lanes: ' + String(state.active_lanes.length),
    '- Active blocking recovery hold: ' + (holdActive ? 'YES' : 'NO'),
    '',
    '## PR registry',
    '| PR | Status | GitHub state | Draft | Merged | Role | Completes child | Epoch |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...registryRows,
    '',
    recovery ? '## Holds' : '## Holds / write safety',
    '- Active blocking recovery hold: ' + (holdActive ? 'YES' : 'NO'),
    recovery ? '- Write safety: ' + WRITE_SAFETY_MODE : '- No recovery window is active.',
    '- Provider CAS claim: NO',
    ...(recovery ? ['- Hold evidence: ' + HOLD_EVIDENCE_REF] : [
      '- #380: ' + registryStateText(registryEntry(state, 380)),
      '- #379: ' + registryStateText(registryEntry(state, 379)),
    ]),
    '',
    '## Epochs / Locks',
    '| Epoch | State |',
    '| --- | --- |',
    ...epochRows,
    '',
    '## Boundaries',
    ...boundaryLines,
    '- G4 active: ' + (lane?.gate === 'G4' && lane.gate_state === 'ACTIVE' ? 'YES' : 'NO') + '.',
    '- S3-S6 remain BLOCKED/QUEUED.',
    '- Programme Apply is not authorised.',
    '',
    '## Next action',
    nextAction,
    '',
    '## Root dispositions',
    ...(recovery ? [
      '- Old root: ' + OLD_ROOT + ' / NON_CONVERGENT / terminal=true / repair budget=2/2 / further repair authorised=false',
      '- Parked root: ' + PARKED_ROOT + ' / NOT_LAUNCHED',
      '- #379 retention evidence: ' + RETENTION_EVIDENCE_REF,
    ] : ['- None']),
    '',
    '## ELI5',
    child.eli5,
    '',
    '## Additional context',
    recovery
      ? 'Retained PR #379 remains frozen chronology. Retired PR #366 is historical only.'
      : 'PR #380 is accepted E3 merge evidence, PR #379 is retired chronology, and E4 has not started.',
    '',
    '<!-- AI-AGENT-TOOLKIT:GITHUB-PROGRAM-PROJECTION v1 ' + base64url(JSON.stringify(projectionEnvelope(state, 'child'))) + ' -->',
    MANAGED_MARKERS.child.end,
  );
  return lines.join('\n');
}
function renderProgrammeV5(state) {
  const valid = validateCanonicalStateV5(state);
  if (!valid.ok) return valid;
  const parent = managedContent('parent', state);
  const child = managedContent('child', state);
  return success('V5_RENDER_READY', {
    state: clone(state),
    canonical_digest: digestValue(state),
    parent,
    child,
    projections: {
      parent: projectionEnvelope(state, 'parent'),
      child: projectionEnvelope(state, 'child'),
    },
  });
}
function materialize(parsed, managed) {
  return parsed.prefix + managed + parsed.suffix;
}

function normalizedReviewFacts(value) {
  return value.map(({ id, user, state, submitted_at, body_digest }) => ({ id, user, state, submitted_at, body_digest }));
}
function normalizedCommentFacts(value) {
  return value.map(({ id, user, created_at, updated_at, body_digest }) => ({ id, user, created_at, updated_at, body_digest }));
}
function validatePR379(value) {
  const required = ['repository', 'pr', 'state', 'draft', 'merged', 'merged_at', 'head', 'tree', 'branch', 'base_ref', 'base_sha', 'changed_files', 'candidate', 'reviews', 'threads', 'comments', 'checks', 'facts_digest', 'complete'];
  if (!isRecord(value) || !exactKeys(value, required)
    || value.repository !== REPOSITORY
    || value.pr !== 379
    || value.state !== 'OPEN'
    || value.draft !== true
    || value.merged !== false
    || value.merged_at !== null
    || value.head !== FROZEN_HEAD
    || value.tree !== FROZEN_TREE
    || value.branch !== FROZEN_BRANCH
    || value.base_ref !== FROZEN_BASE_REF
    || value.base_sha !== MAIN_SHA
    || value.changed_files !== 48
    || !validateRecoveryCandidate(value.candidate)
    || !Array.isArray(value.reviews)
    || !Array.isArray(value.threads)
    || !Array.isArray(value.comments)
    || !Array.isArray(value.checks)
    || !isDigest(value.facts_digest)
    || value.complete !== true) return failure('RECOVERY_PR379_INVALID');
  const expectedReviews = PR379_REVIEW_FACTS;
  if (value.reviews.length !== expectedReviews.length || value.reviews.some((item, index) => !isRecord(item)
    || !exactKeys(item, ['id', 'user', 'state', 'submitted_at', 'body', 'body_digest'])
    || item.id !== expectedReviews[index].id
    || item.user !== expectedReviews[index].user
    || item.state !== expectedReviews[index].state
    || item.submitted_at !== expectedReviews[index].submitted_at
    || typeof item.body !== 'string'
    || sha256Text(item.body) !== item.body_digest
    || item.body_digest !== expectedReviews[index].body_digest)) return failure('RECOVERY_PR379_REVIEW_MOVED');
  if (!same(value.threads, [])) return failure('RECOVERY_PR379_THREAD_MOVED');
  const expectedComments = PR379_COMMENT_FACTS;
  if (value.comments.length !== expectedComments.length || value.comments.some((item, index) => !isRecord(item)
    || !exactKeys(item, ['id', 'user', 'created_at', 'updated_at', 'body', 'body_digest'])
    || item.id !== expectedComments[index].id
    || item.user !== expectedComments[index].user
    || item.created_at !== expectedComments[index].created_at
    || item.updated_at !== expectedComments[index].updated_at
    || typeof item.body !== 'string'
    || sha256Text(item.body) !== item.body_digest
    || item.body_digest !== expectedComments[index].body_digest)) return failure('RECOVERY_PR379_COMMENT_MOVED');
  if (value.checks.length !== PR379_CHECK_FACTS.length || value.checks.some((item, index) => !same(item, PR379_CHECK_FACTS[index]))) return failure('RECOVERY_PR379_CHECK_MOVED');
  const computed = factsDigest(value.reviews, value.threads, value.comments, value.checks);
  if (value.facts_digest !== computed || value.facts_digest !== DECISION_TEMPLATE.pr_379.facts_digest) return failure('RECOVERY_PR379_FACTS_INVALID');
  return success('RECOVERY_PR379_VALID');
}
function validatePR366(value) {
  return isRecord(value)
    && exactKeys(value, ['pr', 'status', 'github_state', 'draft', 'merged', 'merged_at', 'merge_commit', 'role', 'completes_child', 'candidate', 'head', 'tree', 'base_ref', 'base_sha', 'complete'])
    && value.pr === 366
    && value.status === 'RETIRED'
    && value.github_state === 'CLOSED'
    && value.draft === true
    && value.merged === false
    && value.merged_at === null
    && value.merge_commit === null
    && value.role === 'INTERMEDIATE'
    && value.completes_child === false
    && value.candidate === null
    && value.head === PR366_HEAD
    && value.tree === PR366_TREE
    && value.base_ref === FROZEN_BASE_REF
    && value.base_sha === PR366_BASE_SHA
    && value.complete === true;
}
const PAGINATION_COLLECTIONS = Object.freeze({
  parent: Object.freeze({ endpoint: 'github:issues/240', items: 1, transport_mode: 'DIRECT', server_total: 'UNAVAILABLE' }),
  child: Object.freeze({ endpoint: 'github:issues/359', items: 1, transport_mode: 'DIRECT', server_total: 'UNAVAILABLE' }),
  native_children: Object.freeze({ endpoint: 'github:issues/240/sub_issues', items: 6, transport_mode: 'LINK', server_total: 'UNAVAILABLE' }),
  current_label: Object.freeze({ endpoint: 'github:issues/359/labels', items: 1, transport_mode: 'LINK', server_total: 'UNAVAILABLE' }),
  pr366: Object.freeze({ endpoint: 'github:pulls/366', items: 1, transport_mode: 'DIRECT', server_total: 'UNAVAILABLE' }),
  pr379: Object.freeze({ endpoint: 'github:pulls/379', items: 1, transport_mode: 'DIRECT', server_total: 'UNAVAILABLE' }),
  reviews: Object.freeze({ endpoint: 'github:pulls/379/reviews', items: 1, transport_mode: 'LINK', server_total: 'UNAVAILABLE' }),
  threads: Object.freeze({ endpoint: 'github:pulls/379/review-threads', items: 0, transport_mode: 'LINK', server_total: 'UNAVAILABLE' }),
  review_thread_comments: Object.freeze({ endpoint: 'github:pulls/379/review-thread-comments', items: 0, transport_mode: 'LINK', server_total: 'UNAVAILABLE' }),
  comments: Object.freeze({ endpoint: 'github:issues/379/comments', items: 6, transport_mode: 'LINK', server_total: 'UNAVAILABLE' }),
  checks: Object.freeze({ endpoint: 'github:commits/' + FROZEN_HEAD + '/check-runs', items: 6, transport_mode: 'LINK', server_total: 'AVAILABLE' }),
  web_authority: Object.freeze({ endpoint: 'github:web-authority:issues/240,359;pull/379', items: 6, transport_mode: 'DIRECT', server_total: 'UNAVAILABLE' }),
});
const PAGINATION_KEYS = Object.freeze(Object.keys(PAGINATION_COLLECTIONS));
const PAGINATION_PAGE_SIZE = 100;
const CHECK_RUNS_TOTAL_FIELD = 'total_count';
function paginationInventory(key, evidence) {
  if (!isRecord(evidence)) return null;
  switch (key) {
    case 'parent':
      return isRecord(evidence.parent) ? {
        issue: evidence.parent.issue,
        body_digest: evidence.parent.body_digest,
        canonical_digest: evidence.parent.canonical_digest,
        revision: evidence.parent.revision,
        native_children: evidence.parent.native_children,
        relationships: evidence.parent.relationships,
      } : null;
    case 'child':
      return isRecord(evidence.child) ? {
        issue: evidence.child.issue,
        body_digest: evidence.child.body_digest,
        canonical_digest: evidence.child.canonical_digest,
        revision: evidence.child.revision,
        labels: evidence.child.labels,
        native_parent: evidence.child.native_parent,
        relationships: evidence.child.relationships,
        sole_current: evidence.child.sole_current,
        dependencies: evidence.child.dependencies,
      } : null;
    case 'native_children':
      return evidence.parent?.native_children || null;
    case 'current_label':
      return evidence.child?.labels || null;
    case 'pr366':
      return evidence.pr_366 || null;
    case 'pr379':
      return evidence.pr_379 || null;
    case 'reviews':
      return Array.isArray(evidence.pr_379?.reviews) ? normalizedReviewFacts(evidence.pr_379.reviews) : null;
    case 'threads':
      return Array.isArray(evidence.pr_379?.threads) ? evidence.pr_379.threads : null;
    case 'review_thread_comments':
      return Array.isArray(evidence.pr_379?.threads) && evidence.pr_379.threads.length === 0 ? [] : null;
    case 'comments':
      return Array.isArray(evidence.pr_379?.comments) ? normalizedCommentFacts(evidence.pr_379.comments) : null;
    case 'checks':
      return Array.isArray(evidence.pr_379?.checks) ? evidence.pr_379.checks : null;
    case 'web_authority':
      return Array.isArray(evidence.web_authority)
        ? evidence.web_authority.map(({ issue, comment_id, body_digest }) => ({ issue, comment_id, body_digest }))
        : null;
    default:
      return null;
  }
}
function validateProviderEvidence(value) {
  return isRecord(value)
    && exactKeys(value, ['check_runs'])
    && isRecord(value.check_runs)
    && exactKeys(value.check_runs, ['endpoint_or_query_identity', 'field', 'value'])
    && value.check_runs.endpoint_or_query_identity === PAGINATION_COLLECTIONS.checks.endpoint
    && value.check_runs.field === CHECK_RUNS_TOTAL_FIELD
    && Number.isSafeInteger(value.check_runs.value)
    && value.check_runs.value >= 0;
}
function providerTotalCount(key, evidence) {
  if (key !== 'checks' || !isRecord(evidence?.provider_evidence?.check_runs)) return null;
  const value = evidence.provider_evidence.check_runs.value;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function inventoryCount(inventory) {
  return Array.isArray(inventory) ? inventory.length : inventory === null ? null : 1;
}
function buildPaginationEvidence(key, evidence) {
  const definition = PAGINATION_COLLECTIONS[key];
  const inventory = paginationInventory(key, evidence);
  const retrievedCount = inventoryCount(inventory);
  if (!definition || inventory === null || !Number.isSafeInteger(retrievedCount)) return null;
  const providerTotal = definition.server_total === 'AVAILABLE' ? providerTotalCount(key, evidence) : null;
  const isLink = definition.transport_mode === 'LINK';
  const pageDigest = digestValue({ endpoint_or_query_identity: definition.endpoint, page: 1, inventory });
  return {
    complete: true,
    endpoint_or_query_identity: definition.endpoint,
    transport_mode: definition.transport_mode,
    page_size: isLink ? PAGINATION_PAGE_SIZE : null,
    page_count: 1,
    ordered_page_digests: [{ page: 1, digest: pageDigest }],
    retrieved_count: retrievedCount,
    provider_total_count: providerTotal,
    server_total: providerTotal === null
      ? { status: 'UNAVAILABLE', value: null }
      : { status: 'AVAILABLE', value: providerTotal },
    progression: isLink ? { style: 'LINK', pages: [{ page: 1, next_url: null }] } : null,
    terminal_state: isLink ? { has_next_page: false, next_url: null } : null,
    inventory_digest: digestValue(inventory),
  };
}
function validateLinkProgression(value) {
  return isRecord(value.progression)
    && exactKeys(value.progression, ['pages', 'style'])
    && value.progression.style === 'LINK'
    && Array.isArray(value.progression.pages)
    && value.progression.pages.length === value.page_count
    && value.progression.pages.every((page, index) => isRecord(page)
      && exactKeys(page, ['next_url', 'page'])
      && page.page === index + 1
      && (page.next_url === null || (typeof page.next_url === 'string' && page.next_url.length > 0 && !/[\r\n]/.test(page.next_url))))
    && value.progression.pages[0]?.next_url === null
    && isRecord(value.terminal_state)
    && exactKeys(value.terminal_state, ['has_next_page', 'next_url'])
    && value.terminal_state.has_next_page === false
    && value.terminal_state.next_url === null
    && value.progression.pages[value.progression.pages.length - 1]?.next_url === value.terminal_state.next_url;
}
function validateDirectTransport(value) {
  return value.page_size === null && value.progression === null && value.terminal_state === null;
}
function validatePage(value, key, evidence) {
  const definition = PAGINATION_COLLECTIONS[key];
  const inventory = paginationInventory(key, evidence);
  const retrievedCount = inventoryCount(inventory);
  const providerTotal = definition ? providerTotalCount(key, evidence) : null;
  const isLink = definition?.transport_mode === 'LINK';
  if (!definition || inventory === null || !isRecord(value)
    || !exactKeys(value, [
      'complete', 'endpoint_or_query_identity', 'inventory_digest', 'ordered_page_digests',
      'page_count', 'page_size', 'progression', 'provider_total_count', 'retrieved_count',
      'server_total', 'terminal_state', 'transport_mode',
    ])
    || value.complete !== true
    || value.endpoint_or_query_identity !== definition.endpoint
    || value.transport_mode !== definition.transport_mode
    || (isLink ? value.page_size !== PAGINATION_PAGE_SIZE : !validateDirectTransport(value))
    || !Number.isSafeInteger(value.page_count) || value.page_count !== 1
    || !Number.isSafeInteger(value.retrieved_count) || value.retrieved_count !== definition.items
    || value.retrieved_count !== retrievedCount
    || !Array.isArray(value.ordered_page_digests) || value.ordered_page_digests.length !== value.page_count
    || !value.ordered_page_digests.every((page, index) => isRecord(page)
      && exactKeys(page, ['digest', 'page'])
      && page.page === index + 1
      && isDigest(page.digest))
    || value.ordered_page_digests[0]?.digest !== digestValue({
      endpoint_or_query_identity: definition.endpoint,
      page: 1,
      inventory,
    })
    || value.provider_total_count !== providerTotal
    || !isRecord(value.server_total)
    || !exactKeys(value.server_total, ['status', 'value'])
    || value.server_total.status !== definition.server_total
    || !['AVAILABLE', 'UNAVAILABLE'].includes(value.server_total.status)
    || (value.server_total.status === 'AVAILABLE'
      && (providerTotal === null
        || !Number.isSafeInteger(value.server_total.value)
        || value.server_total.value !== providerTotal
        || value.server_total.value !== value.retrieved_count))
    || (value.server_total.status === 'UNAVAILABLE'
      && (value.server_total.value !== null || providerTotal !== null))
    || (isLink ? !validateLinkProgression(value) : !validateDirectTransport(value))
    || value.inventory_digest !== digestValue(inventory)) return false;
  return true;
}
function validatePagination(value, evidence) {
  if (!isRecord(value) || !exactKeys(value, PAGINATION_KEYS)) return false;
  return PAGINATION_KEYS.every((key) => validatePage(value[key], key, evidence));
}
function validateCollector(value) {
  return isRecord(value)
    && exactKeys(value, ['kind', 'identity', 'version', 'authenticated', 'provider_client_used'])
    && value.kind === 'WEB_AUTHENTICATED_GITHUB_COLLECTION'
    && value.identity === 'github-web-readonly-adapter'
    && value.version === 'v1'
    && value.authenticated === true
    && value.provider_client_used === false;
}
function validateWebAuthority(value, decision) {
  const expected = [...decision.web_authority.controlling, ...decision.web_authority.predecessor];
  if (!Array.isArray(value) || value.length !== expected.length) return failure('RECOVERY_AUTHORITY_INCOMPLETE');
  if (value.some((item, index) => !isRecord(item)
    || !exactKeys(item, ['issue', 'comment_id', 'body', 'body_digest'])
    || item.issue !== expected[index].issue
    || item.comment_id !== expected[index].comment_id
    || typeof item.body !== 'string'
    || sha256Text(item.body) !== item.body_digest
    || item.body_digest !== expected[index].body_digest)) return failure('RECOVERY_AUTHORITY_CONTRADICTORY');
  const normalized = value.map(({ issue, comment_id, body_digest }) => ({ issue, comment_id, body_digest }));
  if (!same(normalized, expected)) return failure('RECOVERY_AUTHORITY_MOVED');
  return success('RECOVERY_AUTHORITY_VALID');
}
function expectedChildSnapshotState(state) { return childSnapshotState(state); }
function validateSnapshotState(value, expected) {
  return isRecord(value)
    && exactKeys(value, ['active_blocking_recovery_hold', 'finality', 'gate_state', 'lifecycle', 'normal_active_lanes'])
    && same(value, expected);
}
function classifySnapshot(parentDigest, childDigest, targetDigest) {
  const parentSource = parentDigest === SOURCE_CANONICAL_DIGEST;
  const childSource = childDigest === SOURCE_CANONICAL_DIGEST;
  const parentTarget = parentDigest === targetDigest;
  const childTarget = childDigest === targetDigest;
  if (parentSource && childSource) return 'BEFORE_CHILD';
  if (parentSource && childTarget) return 'CHILD_WRITTEN_PARENT_STALE';
  if (parentTarget && childTarget) return 'PARENT_AND_CHILD_TARGET_OBSERVED';
  return null;
}
function classifyPartialState(input = {}) {
  if (!isRecord(input)
    || !isDigest(input.parent_canonical_digest)
    || !isDigest(input.child_canonical_digest)
    || !isDigest(input.source_canonical_digest)
    || !isDigest(input.target_canonical_digest)) return failure('RECOVERY_PARTIAL_STATE_INVALID');
  const classification = classifySnapshot(input.parent_canonical_digest, input.child_canonical_digest, input.target_canonical_digest);
  return classification ? success('RECOVERY_PARTIAL_STATE_CLASSIFIED', { classification }) : failure('RECOVERY_PARTIAL_STATE_INVALID');
}
function validateContinuation(value, expected, decisionDigest, authorityDigestValue) {
  if (!isRecord(value)
    || !exactKeys(value, ['authority_digest', 'child_operation_digest', 'child_operation_id', 'decision_digest', 'preview_id', 'receipt_operation_digest', 'receipt_operation_id', 'safety_mode'])
    || value.preview_id !== expected.preview_id
    || value.child_operation_id !== expected.child_operation_id
    || value.child_operation_digest !== expected.child_operation_digest
    || value.receipt_operation_digest !== expected.receipt_operation_digest
    || !isSafeId(value.receipt_operation_id)
    || value.decision_digest !== decisionDigest
    || value.authority_digest !== authorityDigestValue
    || value.safety_mode !== WRITE_SAFETY_MODE) return failure('RECOVERY_CONTINUATION_INVALID');
  return success('RECOVERY_CONTINUATION_VALID');
}

function buildReceiptOperationDescriptor(input) {
  const sourceBinding = digestValue({
    mode: WRITE_SAFETY_MODE,
    authority_digest: input.authority_digest,
    source_body_digest: input.source_body_digest,
    source_revision: input.source_revision,
  });
  const targetIdentity = {
    resource_type: 'provider_resource',
    resource_id: 'github:issue:' + String(input.issue) + '/body',
  };
  return {
    operation_kind: 'IDEMPOTENT_SET',
    safety_class: 'IDEMPOTENT',
    target_identity: targetIdentity,
    target_digest: digestValue(targetIdentity),
    expected_source_digest: input.source_body_digest,
    cas_digest: sourceBinding,
    expected_post_state_digest: input.target_body_digest,
    adapter_identity_digest: digestValue({
      adapter: 'github-web-readonly-adapter',
      mode: WRITE_SAFETY_MODE,
      provider_cas_claim: false,
    }),
    retry_of_operation_id: null,
  };
}
function makeOperation(input) {
  const descriptor = buildReceiptOperationDescriptor(input);
  try { receipt.validateOperationDescriptor(descriptor); } catch (_error) { return failure('RECOVERY_RECEIPT_BINDING_INVALID'); }
  const logical = digestValue({
    operation_kind: descriptor.operation_kind,
    safety_class: descriptor.safety_class,
    target_identity: descriptor.target_identity,
    target_digest: descriptor.target_digest,
    expected_post_state_digest: descriptor.expected_post_state_digest,
    adapter_identity_digest: descriptor.adapter_identity_digest,
  });
  const operationId = digestValue({
    schema: RECOVERY_OPERATION_SCHEMA,
    issue: input.issue,
    body_role: input.body_role,
    source_body_digest: input.source_body_digest,
    target_body_digest: input.target_body_digest,
    target_canonical_digest: input.target_canonical_digest,
    target_projection_digest: input.target_projection_digest,
    decision_digest: input.decision_digest,
    authority_digest: input.authority_digest,
    write_safety_mode: WRITE_SAFETY_MODE,
  });
  return success('RECOVERY_OPERATION_READY', {
    operation: {
      schema: RECOVERY_OPERATION_SCHEMA,
      order: input.order,
      issue: input.issue,
      body_role: input.body_role,
      operation_kind: 'IDEMPOTENT_SET',
      safety_class: 'IDEMPOTENT',
      target_identity: descriptor.target_identity,
      target_identity_digest: descriptor.target_digest,
      source_body_digest: input.source_body_digest,
      source_revision: input.source_revision,
      target_body_digest: input.target_body_digest,
      target_canonical_digest: input.target_canonical_digest,
      target_projection_digest: input.target_projection_digest,
      target_bytes: input.target_bytes,
      source_revision_binding_digest: descriptor.cas_digest,
      receipt_operation_kind: 'IDEMPOTENT_SET',
      receipt_safety_class: 'IDEMPOTENT',
      receipt_logical_operation_digest: logical,
      receipt_descriptor_digest: receipt.digestValue(descriptor),
      provider_cas_claim: false,
      write_safety_mode: WRITE_SAFETY_MODE,
      operation_id: operationId,
    },
  });
}

function validateEvidence(value, decisionInput = DECISION_TEMPLATE) {
  const decisionValid = validateDecision(decisionInput);
  if (!decisionValid.ok) return decisionValid;
  const required = [
    'schema', 'recovery_root', 'lock', 'decision_digest', 'snapshot', 'repository',
    'parent_issue', 'child_issue', 'parent', 'child', 'pr_366', 'pr_379',
    'web_authority', 'pagination', 'provider_evidence', 'collector', 'authority_digest', 'continuation',
    'evidence_digest',
  ];
  if (!isRecord(value) || !exactKeys(value, required)
    || value.schema !== EVIDENCE_SCHEMA
    || value.recovery_root !== RECOVERY_ROOT
    || value.lock !== LOCK
    || value.decision_digest !== decisionValid.decision_digest
    || !['BEFORE_CHILD', 'CHILD_WRITTEN_PARENT_STALE', 'PARENT_AND_CHILD_TARGET_OBSERVED'].includes(value.snapshot)
    || value.repository !== REPOSITORY
    || value.parent_issue !== PARENT_ISSUE
    || value.child_issue !== CHILD_ISSUE
    || !isDigest(value.authority_digest)
    || !validateCollector(value.collector)
    || !validateProviderEvidence(value.provider_evidence)
    || !isDigest(value.evidence_digest)) return failure('RECOVERY_EVIDENCE_INVALID');
  if (value.authority_digest !== decisionInput.web_authority.digest) return failure('RECOVERY_AUTHORITY_DIGEST_MISMATCH');
  const webValid = validateWebAuthority(value.web_authority, decisionInput);
  if (!webValid.ok) return webValid;
  if (!isRecord(value.parent)
    || !exactKeys(value.parent, ['issue', 'raw_body', 'body_digest', 'canonical_digest', 'revision', 'state', 'native_children', 'relationships', 'prefix_digest', 'suffix_digest', 'complete'])
    || value.parent.issue !== PARENT_ISSUE
    || typeof value.parent.raw_body !== 'string'
    || sha256Text(value.parent.raw_body) !== value.parent.body_digest
    || !isDigest(value.parent.canonical_digest)
    || !isSafeRevision(value.parent.revision)
    || !Array.isArray(value.parent.native_children)
    || !same(value.parent.native_children, [358, 359, 360, 361, 362, 363])
    || !isRecord(value.parent.relationships)
    || !exactKeys(value.parent.relationships, ['child_issue', 'child_is_native_sub_issue', 'parent_issue', 'sole_current'])
    || !same(value.parent.relationships, { child_issue: CHILD_ISSUE, child_is_native_sub_issue: true, parent_issue: PARENT_ISSUE, sole_current: true })
    || !isDigest(value.parent.prefix_digest)
    || !isDigest(value.parent.suffix_digest)
    || value.parent.complete !== true
    || !isRecord(value.parent.state)) return failure('RECOVERY_PARENT_EVIDENCE_INVALID');
  const parentParsed = parseParentV5Body(value.parent.raw_body, { repository: REPOSITORY, parent_issue: PARENT_ISSUE });
  if (!parentParsed.ok
    || parentParsed.body_digest !== value.parent.body_digest
    || parentParsed.canonical_digest === undefined && parentParsed.envelope.canonical_digest !== value.parent.canonical_digest
    || parentParsed.envelope.canonical_digest !== value.parent.canonical_digest
    || parentParsed.prefix_digest !== value.parent.prefix_digest
    || parentParsed.suffix_digest !== value.parent.suffix_digest
    || !same(parentParsed.state, value.parent.state)) return failure('RECOVERY_PARENT_EVIDENCE_INVALID');
  const sourceParent = value.parent.canonical_digest === SOURCE_CANONICAL_DIGEST;
  if (sourceParent && (value.parent.body_digest !== decisionInput.source.parent_body_sha256
    || value.parent.revision !== decisionInput.source.parent_revision
    || value.parent.prefix_digest !== decisionInput.source.parent_prefix_digest
    || value.parent.suffix_digest !== decisionInput.source.parent_suffix_digest)) return failure('RECOVERY_PARENT_SOURCE_STALE');
  if (!sourceParent && !Object.prototype.hasOwnProperty.call(value.parent.state, 'recovery')) return failure('RECOVERY_PARENT_TARGET_INVALID');
  const stateValid = validateCanonicalStateV5(value.parent.state);
  if (!stateValid.ok) return failure('RECOVERY_PARENT_STATE_INVALID');
  if (!isRecord(value.child)
    || !exactKeys(value.child, ['issue', 'raw_body', 'body_digest', 'canonical_digest', 'revision', 'labels', 'native_parent', 'relationships', 'sole_current', 'dependencies', 'state', 'projection', 'prefix_digest', 'suffix_digest', 'complete'])
    || value.child.issue !== CHILD_ISSUE
    || typeof value.child.raw_body !== 'string'
    || sha256Text(value.child.raw_body) !== value.child.body_digest
    || !isDigest(value.child.canonical_digest)
    || !isSafeRevision(value.child.revision)
    || !Array.isArray(value.child.labels)
    || !same(value.child.labels, ['current'])
    || value.child.native_parent !== PARENT_ISSUE
    || !isRecord(value.child.relationships)
    || !exactKeys(value.child.relationships, ['child_issue', 'child_is_native_sub_issue', 'parent_issue', 'sole_current'])
    || !same(value.child.relationships, { child_issue: CHILD_ISSUE, child_is_native_sub_issue: true, parent_issue: PARENT_ISSUE, sole_current: true })
    || value.child.sole_current !== true
    || !same(value.child.dependencies, [])
    || !validateSnapshotState(value.child.state, expectedChildSnapshotState(
      value.child.canonical_digest === SOURCE_CANONICAL_DIGEST
        ? value.parent.state
        : (buildRecoveryTargetState(value.parent.state) || value.parent.state),
    ))
    || !isRecord(value.child.projection)
    || !isDigest(value.child.prefix_digest)
    || !isDigest(value.child.suffix_digest)
    || value.child.complete !== true) return failure('RECOVERY_CHILD_EVIDENCE_INVALID');
  const childParsed = parseChildV5Body(value.child.raw_body, { repository: REPOSITORY, parent_issue: PARENT_ISSUE });
  if (!childParsed.ok
    || childParsed.body_digest !== value.child.body_digest
    || childParsed.envelope.canonical_digest !== value.child.canonical_digest
    || childParsed.prefix_digest !== value.child.prefix_digest
    || childParsed.suffix_digest !== value.child.suffix_digest
    || !same(childParsed.envelope, value.child.projection)) return failure('RECOVERY_CHILD_EVIDENCE_INVALID');
  if (value.child.canonical_digest !== value.parent.canonical_digest
    && value.parent.canonical_digest !== SOURCE_CANONICAL_DIGEST) return failure('RECOVERY_PROJECTION_CANONICAL_MISMATCH');
  const sourceChild = value.child.canonical_digest === SOURCE_CANONICAL_DIGEST;
  if (sourceChild && (value.child.body_digest !== decisionInput.source.child_body_sha256
    || value.child.revision !== decisionInput.source.child_revision
    || value.child.prefix_digest !== decisionInput.source.child_prefix_digest
    || value.child.suffix_digest !== decisionInput.source.child_suffix_digest)) return failure('RECOVERY_CHILD_SOURCE_STALE');
  const targetState = sourceParent ? buildRecoveryTargetState(value.parent.state) : value.parent.state;
  if (!targetState) return failure('RECOVERY_TARGET_BUILD_FAILED');
  const targetValid = validateCanonicalStateV5(targetState);
  if (!targetValid.ok) return failure('RECOVERY_TARGET_INVALID');
  const targetDigest = targetValid.canonical_digest;
  const classification = classifySnapshot(value.parent.canonical_digest, value.child.canonical_digest, targetDigest);
  if (!classification || value.snapshot !== classification) return failure('RECOVERY_PARTIAL_STATE_INVALID');
  const rendered = renderProgrammeV5(targetState);
  if (value.parent.canonical_digest === targetDigest) {
    if (value.parent.prefix_digest !== decisionInput.source.parent_prefix_digest
      || value.parent.suffix_digest !== decisionInput.source.parent_suffix_digest
      || value.parent.raw_body !== value.parent.raw_body.slice(0, value.parent.raw_body.indexOf(MANAGED_MARKERS.parent.begin))
        + rendered.parent
        + value.parent.raw_body.slice(value.parent.raw_body.indexOf(MANAGED_MARKERS.parent.end) + MANAGED_MARKERS.parent.end.length)) return failure('RECOVERY_PARENT_TARGET_BYTES_INVALID');
  }
  if (value.child.canonical_digest === targetDigest) {
    if (value.child.prefix_digest !== decisionInput.source.child_prefix_digest
      || value.child.suffix_digest !== decisionInput.source.child_suffix_digest
      || value.child.raw_body !== value.child.raw_body.slice(0, value.child.raw_body.indexOf(MANAGED_MARKERS.child.begin))
        + rendered.child
        + value.child.raw_body.slice(value.child.raw_body.indexOf(MANAGED_MARKERS.child.end) + MANAGED_MARKERS.child.end.length)) return failure('RECOVERY_CHILD_TARGET_BYTES_INVALID');
    if (value.child.projection.projection_digest !== rendered.projections.child.projection_digest) return failure('RECOVERY_CHILD_PROJECTION_INVALID');
  }
  if (value.parent.canonical_digest === targetDigest && value.parent.projection_digest !== undefined) return failure('RECOVERY_PARENT_PROJECTION_INVALID');
  if (!validatePR366(value.pr_366)) return failure('RECOVERY_PR366_INVALID');
  const pr379Valid = validatePR379(value.pr_379);
  if (!pr379Valid.ok) return pr379Valid;
  if (!validatePagination(value.pagination, value)) return failure('RECOVERY_PAGINATION_INVALID');
  if (value.continuation !== null) {
    if (classification === 'BEFORE_CHILD') return failure('RECOVERY_CONTINUATION_UNEXPECTED');
    const parentTargetBody = materialize(parentParsed, rendered.parent);
    const childTargetBody = materialize(childParsed, rendered.child);
    const childOperationResult = makeOperation({
      order: 1,
      issue: CHILD_ISSUE,
      body_role: 'CHILD_MANAGED_BODY',
      source_body_digest: decisionInput.source.child_body_sha256,
      source_revision: decisionInput.source.child_revision,
      target_body_digest: sha256Text(childTargetBody),
      target_canonical_digest: targetDigest,
      target_projection_digest: rendered.projections.child.projection_digest,
      target_bytes: childTargetBody,
      decision_digest: decisionValid.decision_digest,
      authority_digest: decisionInput.web_authority.digest,
    });
    if (!childOperationResult.ok) return childOperationResult;
    const parentOperationResult = makeOperation({
      order: 2,
      issue: PARENT_ISSUE,
      body_role: 'PARENT_MANAGED_BODY',
      source_body_digest: decisionInput.source.parent_body_sha256,
      source_revision: decisionInput.source.parent_revision,
      target_body_digest: sha256Text(parentTargetBody),
      target_canonical_digest: targetDigest,
      target_projection_digest: rendered.projections.parent.projection_digest,
      target_bytes: parentTargetBody,
      decision_digest: decisionValid.decision_digest,
      authority_digest: decisionInput.web_authority.digest,
    });
    if (!parentOperationResult.ok) return parentOperationResult;
    const basePreviewId = previewIdentity({
      decision_digest: decisionValid.decision_digest,
      authority_digest: decisionInput.web_authority.digest,
      target_canonical_digest: targetDigest,
      target_body_digests: { parent: sha256Text(parentTargetBody), child: sha256Text(childTargetBody) },
      target_projection_digests: { parent: rendered.projections.parent.projection_digest, child: rendered.projections.child.projection_digest },
      ordered_operation_digest: digestValue([childOperationResult.operation, parentOperationResult.operation]),
    });
    const expectedContinuation = {
      preview_id: basePreviewId,
      child_operation_digest: childOperationResult.operation.receipt_logical_operation_digest,
      child_operation_id: childOperationResult.operation.operation_id,
      receipt_operation_digest: childOperationResult.operation.receipt_logical_operation_digest,
    };
    const continuationValid = validateContinuation(value.continuation, expectedContinuation, decisionValid.decision_digest, decisionInput.web_authority.digest);
    if (!continuationValid.ok) return continuationValid;
  } else if (classification !== 'BEFORE_CHILD') {
    return failure('RECOVERY_CONTINUATION_REQUIRED');
  }
  const expectedEvidenceDigest = digestValue(without(value, 'evidence_digest'));
  if (value.evidence_digest !== expectedEvidenceDigest) return failure('RECOVERY_EVIDENCE_DIGEST_INVALID');
  return success('RECOVERY_EVIDENCE_VALID', {
    evidence: clone(value),
    parsed: { parent: parentParsed, child: childParsed, target_state: targetState, target_digest: targetDigest, classification },
    evidence_digest: value.evidence_digest,
  });
}

function previewIdentity(input) {
  return digestValue({
    schema: RECOVERY_OPERATION_SCHEMA,
    decision_digest: input.decision_digest,
    authority_digest: input.authority_digest,
    source_canonical_digest: SOURCE_CANONICAL_DIGEST,
    source_body_digests: {
      parent: SOURCE_PARENT_BODY_DIGEST,
      child: SOURCE_CHILD_BODY_DIGEST,
    },
    target_canonical_digest: input.target_canonical_digest,
    target_body_digests: input.target_body_digests,
    target_projection_digests: input.target_projection_digests,
    ordered_operation_digest: input.ordered_operation_digest,
    write_safety_mode: WRITE_SAFETY_MODE,
  });
}
function previewRecovery(input = {}) {
  if (!isRecord(input) || !exactKeys(input, ['decision', 'evidence'])) return failure('RECOVERY_PREVIEW_INPUT_INVALID');
  const decisionValid = validateDecision(input.decision);
  if (!decisionValid.ok) return decisionValid;
  const evidenceValid = validateEvidence(input.evidence, input.decision);
  if (!evidenceValid.ok) return evidenceValid;
  const parsed = evidenceValid.parsed;
  const targetState = parsed.target_state;
  const rendered = renderProgrammeV5(targetState);
  if (!rendered.ok) return failure('RECOVERY_TARGET_RENDER_INVALID');
  const parentTargetBytes = parsed.parent.canonical_digest === parsed.target_digest
    ? parsed.parent.raw_body
    : materialize(parsed.parent, rendered.parent);
  const childTargetBytes = parsed.child.canonical_digest === parsed.target_digest
    ? parsed.child.raw_body
    : materialize(parsed.child, rendered.child);
  const targetBodyDigests = { parent: sha256Text(parentTargetBytes), child: sha256Text(childTargetBytes) };
  const targetProjectionDigests = {
    parent: rendered.projections.parent.projection_digest,
    child: rendered.projections.child.projection_digest,
  };
  const operations = [];
  const fullPlan = [];
  const childPlan = makeOperation({
    order: 1,
    issue: CHILD_ISSUE,
    body_role: 'CHILD_MANAGED_BODY',
    source_body_digest: decisionValid.decision.source.child_body_sha256,
    source_revision: decisionValid.decision.source.child_revision,
    target_body_digest: targetBodyDigests.child,
    target_canonical_digest: parsed.target_digest,
    target_projection_digest: targetProjectionDigests.child,
    target_bytes: childTargetBytes,
    decision_digest: decisionValid.decision_digest,
    authority_digest: decisionValid.decision.web_authority.digest,
  });
  const parentPlan = makeOperation({
    order: 2,
    issue: PARENT_ISSUE,
    body_role: 'PARENT_MANAGED_BODY',
    source_body_digest: decisionValid.decision.source.parent_body_sha256,
    source_revision: decisionValid.decision.source.parent_revision,
    target_body_digest: targetBodyDigests.parent,
    target_canonical_digest: parsed.target_digest,
    target_projection_digest: targetProjectionDigests.parent,
    target_bytes: parentTargetBytes,
    decision_digest: decisionValid.decision_digest,
    authority_digest: decisionValid.decision.web_authority.digest,
  });
  if (!childPlan.ok || !parentPlan.ok) return failure('RECOVERY_OPERATION_BINDING_INVALID');
  fullPlan.push(childPlan.operation, parentPlan.operation);
  if (parsed.classification === 'BEFORE_CHILD') {
    operations.push(...fullPlan);
  } else if (parsed.classification === 'CHILD_WRITTEN_PARENT_STALE') {
    operations.push(parentPlan.operation);
  }
  const orderedOperationDigest = digestValue(operations);
  const previewId = previewIdentity({
    decision_digest: decisionValid.decision_digest,
    authority_digest: decisionValid.decision.web_authority.digest,
    target_canonical_digest: parsed.target_digest,
    target_body_digests: targetBodyDigests,
    target_projection_digests: targetProjectionDigests,
    ordered_operation_digest: digestValue(fullPlan),
  });
  if (parsed.classification === 'CHILD_WRITTEN_PARENT_STALE') {
    if (input.evidence.continuation.preview_id !== previewId) return failure('RECOVERY_CONTINUATION_PREVIEW_MISMATCH');
  }
  const zeroDelta = parsed.classification === 'PARENT_AND_CHILD_TARGET_OBSERVED';
  const response = {
    ok: true,
    code: zeroDelta ? 'PROGRAMME_ZERO_DELTA' : 'PROJECTION_BOOTSTRAP_RECOVERY_PREVIEW_READY',
    schema: RECOVERY_OPERATION_SCHEMA,
    recovery_root: RECOVERY_ROOT,
    lock: LOCK,
    status: zeroDelta ? 'RECOVERY_ALREADY_TARGET' : 'PREVIEW_READY',
    partial_state: parsed.classification,
    recovery_retired: zeroDelta,
    preview_id: previewId,
    source: {
      canonical_digest: SOURCE_CANONICAL_DIGEST,
      body_digests: { parent: decisionValid.decision.source.parent_body_sha256, child: decisionValid.decision.source.child_body_sha256 },
      projection_digests: { parent: parsed.parent.envelope.projection_digest, child: parsed.child.envelope.projection_digest },
    },
    target: {
      canonical_digest: parsed.target_digest,
      body_digests: targetBodyDigests,
      projection_digests: targetProjectionDigests,
      bodies: { parent: parentTargetBytes, child: childTargetBytes },
    },
    decision_digest: decisionValid.decision_digest,
    evidence_digest: evidenceValid.evidence_digest,
    authority_digest: decisionValid.decision.web_authority.digest,
    operations,
    ordered_operation_digest: orderedOperationDigest,
    operation_count: operations.length,
    operation_order: operations.map((operation) => operation.issue),
    outside_bytes_preserved: true,
    write_safety: {
      mode: WRITE_SAFETY_MODE,
      provider_cas_available: false,
      provider_cas_claim: false,
      fresh_prewrite_evidence_revision_rebinding: true,
      web_exclusive_single_writer: true,
      postwrite_exact_readback: true,
      residual_external_race_disclosed: true,
    },
    receipt: {
      schema: receipt.SCHEMA_ID,
      operation_kind: 'IDEMPOTENT_SET',
      safety_class: 'IDEMPOTENT',
      operation_binding_truthful: true,
      provider_cas_claim: false,
      source_changed: false,
    },
    self_retirement_fence: {
      source_canonical_digest: SOURCE_CANONICAL_DIGEST,
      target_canonical_digest: parsed.target_digest,
      exact_target_only: true,
      zero_delta_retires_recovery: true,
    },
    readback_required: true,
    duplicate_write: false,
  };
  return response;
}

const FINALISATION_DECISION_KEYS = Object.freeze([
  'schema', 'root', 'lock', 'repository', 'parent_issue', 'child_issue',
  'source_binding', 'source_state', 'target_state', 'pr_379', 'pr_380', 'merge_ancestry',
  'accepted_evidence', 'write_authority', 'allowed_operations',
  'allowed_checkpoints', 'prohibitions', 'write_safety',
]);
const FINALISATION_EVIDENCE_KEYS = Object.freeze([
  'schema', 'root', 'lock', 'decision_digest', 'repository', 'parent_issue', 'child_issue',
  'parent', 'child', 'source_binding', 'pr_379', 'pr_380', 'accepted_evidence', 'accepted_epoch_event',
  'merge_ancestry', 'canonical_main', 'source_revisions', 'write_authority',
  'pagination', 'provider_facts', 'collector', 'transaction', 'evidence_digest',
]);
const FINALISATION_PAGINATION_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'parent', endpoint: 'github:issues/240', expected_count: 1 }),
  Object.freeze({ id: 'child', endpoint: 'github:issues/359', expected_count: 1 }),
  Object.freeze({ id: 'pr_379', endpoint: 'github:pulls/379', expected_count: 1 }),
  Object.freeze({ id: 'pr_380', endpoint: 'github:pulls/380', expected_count: 1 }),
  Object.freeze({ id: 'accepted_evidence', endpoint: 'github:web:e3-post-merge-finalisation-evidence', expected_count: 3 }),
  Object.freeze({ id: 'canonical_main', endpoint: 'github:refs/heads/main', expected_count: 1 }),
  Object.freeze({ id: 'source_revisions', endpoint: 'github:web:e3-post-merge-source-revisions', expected_count: 1 }),
  Object.freeze({ id: 'write_authority', endpoint: 'github:web:e3-post-merge-write-authority', expected_count: 1 }),
]);
const FINALISATION_PROHIBITIONS = Object.freeze({
  desired_state_api: false,
  arbitrary_patch: false,
  arbitrary_transition: false,
  arbitrary_target_state: false,
  programme_apply: false,
  e4_activation: false,
  provider_client: false,
  provider_cas_claim: false,
  pr_body_mutation: false,
  automatic_e4_transition: false,
});
const FINALISATION_WRITE_SAFETY = Object.freeze({
  mode: FINALISATION_WRITE_SAFETY_MODE,
  provider_cas_available: false,
  provider_cas_claim: false,
  provider_client: false,
  fresh_complete_rebind_between_operations: true,
  exact_readback_between_operations: true,
  acknowledgement_loss_requires_readback: true,
  web_exclusive_single_writer: true,
  zero_delta_is_noop: true,
});

function finalisationAcceptedEvidence() {
  return [
    { id: FINAL_G4_EVIDENCE_REF, kind: 'WEB', reference: FINAL_G4_EVIDENCE_REFERENCE, body_digest: FINAL_G4_REVIEW_BODY_DIGEST },
    { id: POST_MERGE_TECHNICAL_EVIDENCE_REF, kind: 'WEB', reference: POST_MERGE_TECHNICAL_EVIDENCE_REFERENCE, body_digest: POST_MERGE_TECHNICAL_BODY_DIGEST },
    { id: PR379_NON_CONVERGENCE_EVIDENCE_REF, kind: 'WEB', reference: PR379_NON_CONVERGENCE_EVIDENCE_REFERENCE, body_digest: PR379_NON_CONVERGENCE_BODY_DIGEST },
  ];
}
function normaliseFinalisationWriteAuthority(input) {
  const candidate = isRecord(input?.write_authority) ? input.write_authority : input;
  if (!isRecord(candidate)) return null;
  const reference = candidate.reference ?? candidate.authority_ref;
  const bodyDigest = candidate.body_digest ?? candidate.authority_body_digest;
  if (!isSafeId(reference, 512) || !isDigest(bodyDigest)
    || candidate.repository !== REPOSITORY
    || candidate.root !== FINALISATION_ROOT
    || candidate.lock !== FINALISATION_LOCK
    || candidate.scope !== FINALISATION_SCOPE) return null;
  return {
    reference,
    body_digest: bodyDigest,
    repository: candidate.repository,
    root: candidate.root,
    lock: candidate.lock,
    scope: candidate.scope,
  };
}
function finalisationAuthorityValid(value) {
  return isRecord(value)
    && exactKeys(value, ['body_digest', 'lock', 'reference', 'repository', 'root', 'scope'])
    && isDigest(value.body_digest)
    && isSafeId(value.reference, 512)
    && value.repository === REPOSITORY
    && value.root === FINALISATION_ROOT
    && value.lock === FINALISATION_LOCK
    && value.scope === FINALISATION_SCOPE;
}
const FINALISATION_PR379_FACT_KEYS = Object.freeze([
  'base_ref', 'base_sha', 'branch', 'candidate', 'changed_files', 'draft', 'github_state',
  'head', 'merged', 'merged_at', 'non_convergence_evidence_ref', 'pr', 'repository',
  'retention_evidence_ref', 'retirement_evidence_ref', 'state', 'status', 'tree',
]);
const FINALISATION_PR380_FACT_KEYS = Object.freeze([
  'accepted_evidence_ref', 'accepted_head_tree', 'base_ref', 'base_sha', 'candidate',
  'draft', 'github_state', 'head', 'merged', 'merge_commit', 'merge_method',
  'ordered_parents', 'pr', 'repository', 'state', 'status', 'tree',
]);
function finalisationPr379FactsFromObservation(value) {
  return {
    base_ref: value.base_ref,
    base_sha: value.base_sha,
    branch: value.branch,
    candidate: clone(value.candidate),
    changed_files: value.changed_files,
    draft: value.draft,
    github_state: value.github_state,
    head: value.head,
    merged: value.merged,
    merged_at: value.merged_at,
    non_convergence_evidence_ref: value.non_convergence_evidence_ref,
    pr: value.pr,
    repository: value.repository,
    retention_evidence_ref: value.retention_evidence_ref,
    retirement_evidence_ref: value.retirement_evidence_ref,
    state: value.state,
    status: value.status,
    tree: value.tree,
  };
}
function finalisationPr380FactsFromObservation(value) {
  return {
    accepted_evidence_ref: value.accepted_evidence_ref,
    accepted_head_tree: value.accepted_head_tree,
    base_ref: value.base_ref,
    base_sha: value.base_sha,
    candidate: clone(value.candidate),
    draft: value.draft,
    github_state: value.github_state,
    head: value.head,
    merged: value.merged,
    merge_commit: value.merge_commit,
    merge_method: value.merge_method,
    ordered_parents: clone(value.ordered_parents),
    pr: value.pr,
    repository: value.repository,
    state: value.state,
    status: value.status,
    tree: value.tree,
  };
}
function finalisationPr379FactsValid(value) {
  return isRecord(value)
    && exactKeys(value, FINALISATION_PR379_FACT_KEYS)
    && value.repository === REPOSITORY
    && value.pr === 379
    && value.state === value.github_state
    && ['OPEN', 'CLOSED'].includes(value.github_state)
    && value.status === 'RETIRED'
    && value.draft === true
    && value.merged === false
    && value.merged_at === null
    && value.head === FROZEN_HEAD
    && value.tree === FROZEN_TREE
    && value.branch === FROZEN_BRANCH
    && value.base_ref === FROZEN_BASE_REF
    && value.base_sha === MAIN_SHA
    && value.changed_files === 48
    && validateRecoveryCandidate(value.candidate)
    && value.retention_evidence_ref === RETENTION_EVIDENCE_REF
    && value.retirement_evidence_ref === POST_MERGE_TECHNICAL_EVIDENCE_REF
    && value.non_convergence_evidence_ref === PR379_NON_CONVERGENCE_EVIDENCE_REF;
}
function finalisationPr380FactsValid(value) {
  return isRecord(value)
    && exactKeys(value, FINALISATION_PR380_FACT_KEYS)
    && value.repository === REPOSITORY
    && value.pr === 380
    && value.state === 'MERGED'
    && value.github_state === 'MERGED'
    && value.status === 'ACCEPTED'
    && value.draft === false
    && value.merged === true
    && value.merge_method === 'MERGE_COMMIT'
    && value.merge_commit === MERGE_COMMIT_SHA
    && same(value.ordered_parents, [PR380_BASE_SHA, PR380_HEAD])
    && value.accepted_head_tree === PR380_TREE
    && value.head === PR380_HEAD
    && value.tree === PR380_TREE
    && value.base_ref === 'main'
    && value.base_sha === PR380_BASE_SHA
    && validateFinalisationCandidate(value.candidate)
    && value.accepted_evidence_ref === FINAL_G4_EVIDENCE_REF;
}
function finalisationParentBindingValid(value) {
  return isRecord(value)
    && exactKeys(value, ['body_digest', 'canonical_digest', 'issue', 'native_children', 'prefix_digest', 'relationships', 'revision', 'suffix_digest'])
    && value.issue === PARENT_ISSUE
    && isDigest(value.body_digest)
    && isDigest(value.canonical_digest)
    && isProviderRevision(value.revision)
    && isDigest(value.prefix_digest)
    && isDigest(value.suffix_digest)
    && same(value.native_children, [358, 359, 360, 361, 362, 363])
    && same(value.relationships, { child_issue: CHILD_ISSUE, child_is_native_sub_issue: true, parent_issue: PARENT_ISSUE, sole_current: true });
}
function finalisationChildBindingValid(value) {
  return isRecord(value)
    && exactKeys(value, ['body_digest', 'canonical_digest', 'dependencies', 'issue', 'labels', 'native_parent', 'prefix_digest', 'projection_digest', 'relationships', 'revision', 'sole_current', 'suffix_digest'])
    && value.issue === CHILD_ISSUE
    && isDigest(value.body_digest)
    && isDigest(value.canonical_digest)
    && same(value.dependencies, [])
    && same(value.labels, ['current'])
    && value.native_parent === PARENT_ISSUE
    && isDigest(value.prefix_digest)
    && isDigest(value.projection_digest)
    && same(value.relationships, { child_issue: CHILD_ISSUE, child_is_native_sub_issue: true, parent_issue: PARENT_ISSUE, sole_current: true })
    && isProviderRevision(value.revision)
    && value.sole_current === true
    && isDigest(value.suffix_digest);
}
function finalisationProviderBindingValid(value, kind) {
  const factsValid = kind === 'pr_379' ? finalisationPr379FactsValid(value?.facts) : finalisationPr380FactsValid(value?.facts);
  return isRecord(value)
    && exactKeys(value, ['body_digest', 'facts', 'facts_digest', 'pr', 'revision'])
    && value.pr === (kind === 'pr_379' ? 379 : 380)
    && isDigest(value.body_digest)
    && factsValid
    && isDigest(value.facts_digest)
    && value.facts_digest === digestValue(value.facts)
    && isProviderRevision(value.revision);
}
function finalisationSourceBindingValid(value, options = {}) {
  if (!isRecord(value)
    || !exactKeys(value, ['canonical_main', 'child', 'collector', 'complete', 'parent', 'pr_379', 'pr_380', 'snapshot_digest'])
    || value.complete !== true
    || !finalisationParentBindingValid(value.parent)
    || !finalisationChildBindingValid(value.child)
    || !finalisationProviderBindingValid(value.pr_379, 'pr_379')
    || !finalisationProviderBindingValid(value.pr_380, 'pr_380')
    || !finalisationCanonicalMainValid(value.canonical_main)
    || !finalisationCollectorValid(value.collector)
    || !isDigest(value.snapshot_digest)
    || value.snapshot_digest !== digestValue(without(value, 'snapshot_digest'))) return false;
  if (options.source === true && (value.parent.canonical_digest !== FINALISATION_SOURCE_CANONICAL_DIGEST
    || value.child.canonical_digest !== FINALISATION_SOURCE_CANONICAL_DIGEST
    || value.pr_379.facts.github_state !== 'OPEN'
    || value.pr_380.facts.github_state !== 'MERGED')) return false;
  return true;
}
function normaliseFinalisationSourceBinding(input) {
  if (!isRecord(input)) return null;
  const candidate = isRecord(input.source_snapshot)
    ? input.source_snapshot
    : isRecord(input.execution_snapshot)
      ? input.execution_snapshot
      : isRecord(input.provider_snapshot)
        ? input.provider_snapshot
        : isRecord(input.source_binding)
          ? input.source_binding
          : input;
  return clone(candidate);
}
function finalisationSourceBindingFromEvidence(value) {
  const binding = {
    canonical_main: clone(value.canonical_main),
    child: {
      body_digest: value.child.body_digest,
      canonical_digest: value.child.canonical_digest,
      dependencies: clone(value.child.dependencies),
      issue: value.child.issue,
      labels: clone(value.child.labels),
      native_parent: value.child.native_parent,
      prefix_digest: value.child.prefix_digest,
      projection_digest: value.child.projection.projection_digest,
      relationships: clone(value.child.relationships),
      revision: value.child.revision,
      sole_current: value.child.sole_current,
      suffix_digest: value.child.suffix_digest,
    },
    collector: clone(value.collector),
    complete: true,
    parent: {
      body_digest: value.parent.body_digest,
      canonical_digest: value.parent.canonical_digest,
      issue: value.parent.issue,
      native_children: clone(value.parent.native_children),
      prefix_digest: value.parent.prefix_digest,
      relationships: clone(value.parent.relationships),
      revision: value.parent.revision,
      suffix_digest: value.parent.suffix_digest,
    },
    pr_379: {
      body_digest: value.pr_379.body_digest,
      facts: clone(value.pr_379.facts),
      facts_digest: value.pr_379.facts_digest,
      pr: value.pr_379.pr,
      revision: value.pr_379.revision,
    },
    pr_380: {
      body_digest: value.pr_380.body_digest,
      facts: clone(value.pr_380.facts),
      facts_digest: value.pr_380.facts_digest,
      pr: value.pr_380.pr,
      revision: value.pr_380.revision,
    },
  };
  return { ...binding, snapshot_digest: digestValue(binding) };
}
function buildPostMergeEpochFinalisationSourceBinding(input = {}, options = {}) {
  const candidate = normaliseFinalisationSourceBinding(input);
  if (!candidate) return null;
  const binding = {
    ...without(candidate, 'snapshot_digest'),
    snapshot_digest: digestValue(without(candidate, 'snapshot_digest')),
  };
  if (candidate.snapshot_digest !== undefined && candidate.snapshot_digest !== binding.snapshot_digest) return null;
  return binding && finalisationSourceBindingValid(binding, options) ? binding : null;
}
function finalisationDecisionTemplate(authority, sourceBinding) {
  return {
    schema: FINALISATION_DECISION_SCHEMA,
    root: FINALISATION_ROOT,
    lock: FINALISATION_LOCK,
    repository: REPOSITORY,
    parent_issue: PARENT_ISSUE,
    child_issue: CHILD_ISSUE,
    source_binding: clone(sourceBinding),
    source_state: {
      canonical_digest: FINALISATION_SOURCE_CANONICAL_DIGEST,
      lifecycle: 'CURRENT',
      finality: 'HELD',
      recovery_present: true,
      active_lanes: 0,
      holds: 1,
      e3: 'UNACCEPTED',
      e4: 'PENDING',
    },
    target_state: {
      class: 'CLEAN_INTER_EPOCH',
      lifecycle: 'CURRENT',
      finality: 'UNMERGED',
      recovery_present: false,
      active_lanes: 0,
      holds: 0,
      accepted_epoch_prefix: ['E1', 'E2', 'E3'],
      first_remaining_epoch: 'E4',
      first_remaining_epoch_status: 'PENDING',
      active_candidate: false,
      active_gate: false,
      active_lane: false,
      e4_candidate: false,
      completes_child: false,
    },
    pr_379: {
      pr: 379,
      status: 'RETIRED',
      github_state: 'OPEN_OR_CLOSED_AFTER_STAGE_A',
      draft: true,
      merged: false,
      role: 'INTERMEDIATE',
      completes_child: false,
      epoch_id: 'E3',
      candidate: retainedCandidate(),
      retention_evidence_ref: RETENTION_EVIDENCE_REF,
      non_convergence_evidence_ref: PR379_NON_CONVERGENCE_EVIDENCE_REF,
    },
    pr_380: {
      pr: 380,
      status: 'ACCEPTED',
      github_state: 'MERGED',
      draft: false,
      merged: true,
      role: 'INTERMEDIATE',
      completes_child: false,
      epoch_id: 'E3',
      candidate: acceptedCandidate380(),
      accepted_evidence_ref: FINAL_G4_EVIDENCE_REF,
    },
    merge_ancestry: {
      merged: true,
      method: 'MERGE_COMMIT',
      merge_commit: MERGE_COMMIT_SHA,
      ordered_parents: [PR380_BASE_SHA, PR380_HEAD],
      accepted_head: PR380_HEAD,
      accepted_head_tree: PR380_TREE,
      merge_tree: MERGE_COMMIT_TREE,
    },
    accepted_evidence: finalisationAcceptedEvidence(),
    write_authority: authority,
    allowed_operations: clone(FINALISATION_OPERATION_ORDER),
    allowed_checkpoints: [...FINALISATION_CHECKPOINTS],
    prohibitions: clone(FINALISATION_PROHIBITIONS),
    write_safety: clone(FINALISATION_WRITE_SAFETY),
  };
}
function createPostMergeEpochFinalisationDecision(input = {}) {
  if (!isRecord(input)
    || Object.keys(input).some((key) => ['desired', 'patch', 'transition', 'target', 'programme_apply', 'e4_activation'].includes(key))) return null;
  const authority = normaliseFinalisationWriteAuthority(input);
  const sourceBinding = buildPostMergeEpochFinalisationSourceBinding(input, { source: true });
  if (!authority || !finalisationAuthorityValid(authority)
    || !sourceBinding || !finalisationSourceBindingValid(sourceBinding, { source: true })) return null;
  return finalisationDecisionTemplate(authority, sourceBinding);
}
function validateFinalisationOperationOrder(value) {
  return Array.isArray(value)
    && value.length === FINALISATION_OPERATION_ORDER.length
    && value.every((item, index) => isRecord(item)
      && exactKeys(item, ['issue', 'operation_id', 'operation_kind', 'order', 'target', 'target_kind'])
      && same(item, FINALISATION_OPERATION_ORDER[index]));
}
function validateFinalisationDecision(value) {
  if (!isRecord(value) || !exactKeys(value, FINALISATION_DECISION_KEYS)) return failure('FINALISATION_DECISION_INVALID');
  if (value.schema !== FINALISATION_DECISION_SCHEMA
    || value.root !== FINALISATION_ROOT
    || value.lock !== FINALISATION_LOCK
    || value.repository !== REPOSITORY
    || value.parent_issue !== PARENT_ISSUE
    || value.child_issue !== CHILD_ISSUE
    || !finalisationSourceBindingValid(value.source_binding, { source: true })
    || !finalisationAuthorityValid(value.write_authority)
    || !validateFinalisationOperationOrder(value.allowed_operations)
    || !same(value.allowed_checkpoints, [...FINALISATION_CHECKPOINTS])
    || !same(value.prohibitions, FINALISATION_PROHIBITIONS)
    || !same(value.write_safety, FINALISATION_WRITE_SAFETY)
    || !same(value.accepted_evidence, finalisationAcceptedEvidence())) return failure('FINALISATION_DECISION_INVALID', { reason: 'fixed_contract_mismatch' });
  const expected = finalisationDecisionTemplate(value.write_authority, value.source_binding);
  if (!same(value, expected)) return failure('FINALISATION_DECISION_INVALID', { reason: 'fixed_identity_or_target_mismatch' });
  return success('FINALISATION_DECISION_VALID', { decision: clone(value), decision_digest: digestValue(value) });
}
function finalisationAcceptedEvidenceValid(value, decision) {
  return Array.isArray(value)
    && value.length === decision.accepted_evidence.length
    && value.every((item, index) => isRecord(item)
      && exactKeys(item, ['body_digest', 'id', 'kind', 'reference'])
      && same(item, decision.accepted_evidence[index]));
}
function finalisationWriteAuthorityEvidenceValid(value, decision) {
  return isRecord(value)
    && exactKeys(value, ['body', 'body_digest', 'complete', 'lock', 'reference', 'repository', 'root', 'scope'])
    && typeof value.body === 'string'
    && value.body.length > 0
    && value.body.length <= 65536
    && isDigest(value.body_digest)
    && sha256Text(value.body) === value.body_digest
    && value.body_digest === decision.write_authority.body_digest
    && value.reference === decision.write_authority.reference
    && value.repository === REPOSITORY
    && value.root === FINALISATION_ROOT
    && value.lock === FINALISATION_LOCK
    && value.scope === FINALISATION_SCOPE
    && value.complete === true;
}
function validateFinalisationAcceptedEpochEvent(value) {
  return isRecord(value)
    && exactKeys(value, ['child_issue', 'disposition', 'epoch_id', 'evidence_ref', 'gate', 'id', 'occurrence', 'complete'])
    && value.child_issue === CHILD_ISSUE
    && value.disposition === 'ACCEPTED'
    && value.epoch_id === 'E3'
    && value.evidence_ref === FINAL_G4_EVIDENCE_REF
    && value.gate === 'G4'
    && value.id === FINALISATION_TRANSITION_ID
    && value.occurrence === 1
    && value.complete === true;
}
function validateFinalisationSourceRevisions(value, evidence, decision) {
  if (!isRecord(value)
    || !exactKeys(value, ['canonical_digest', 'child', 'complete', 'parent'])
    || value.canonical_digest !== decision.source_binding.parent.canonical_digest
    || value.complete !== true) return false;
  for (const key of ['parent', 'child']) {
    const item = value[key];
    if (!isRecord(item)
      || !exactKeys(item, ['body_digest', 'prefix_digest', 'revision', 'suffix_digest'])
      || !isDigest(item.body_digest)
      || !isDigest(item.prefix_digest)
      || !isDigest(item.suffix_digest)
      || !isProviderRevision(item.revision)) return false;
  }
  const sourceParent = decision.source_binding.parent;
  const sourceChild = decision.source_binding.child;
  return value.parent.revision === sourceParent.revision
    && value.parent.body_digest === sourceParent.body_digest
    && value.parent.prefix_digest === sourceParent.prefix_digest
    && value.parent.suffix_digest === sourceParent.suffix_digest
    && value.child.revision === sourceChild.revision
    && value.child.body_digest === sourceChild.body_digest
    && value.child.prefix_digest === sourceChild.prefix_digest
    && value.child.suffix_digest === sourceChild.suffix_digest
    && evidence.parent.issue === sourceParent.issue
    && evidence.child.issue === sourceChild.issue;
}
function finalisationProviderPr379Valid(value) {
  return isRecord(value)
    && exactKeys(value, [
      'base_ref', 'base_sha', 'body_digest', 'branch', 'candidate', 'changed_files', 'complete', 'draft', 'facts',
      'facts_digest', 'github_state', 'head', 'merged', 'merged_at', 'non_convergence_evidence_ref', 'pr', 'repository',
      'retention_evidence_ref', 'retirement_evidence_ref', 'revision', 'state', 'status', 'tree',
    ])
    && value.repository === REPOSITORY
    && value.pr === 379
    && value.state === value.github_state
    && ['OPEN', 'CLOSED'].includes(value.github_state)
    && value.status === 'RETIRED'
    && value.draft === true
    && value.merged === false
    && value.merged_at === null
    && value.head === FROZEN_HEAD
    && value.tree === FROZEN_TREE
    && value.branch === FROZEN_BRANCH
    && value.base_ref === FROZEN_BASE_REF
    && value.base_sha === MAIN_SHA
    && value.changed_files === 48
    && validateRecoveryCandidate(value.candidate)
    && isDigest(value.body_digest)
    && finalisationPr379FactsValid(value.facts)
    && same(value.facts, finalisationPr379FactsFromObservation(value))
    && isDigest(value.facts_digest)
    && value.facts_digest === digestValue(value.facts)
    && isProviderRevision(value.revision)
    && value.retention_evidence_ref === RETENTION_EVIDENCE_REF
    && value.retirement_evidence_ref === POST_MERGE_TECHNICAL_EVIDENCE_REF
    && value.non_convergence_evidence_ref === PR379_NON_CONVERGENCE_EVIDENCE_REF
    && value.complete === true;
}
function finalisationProviderPr380Valid(value) {
  return isRecord(value)
    && exactKeys(value, [
      'accepted_evidence_ref', 'accepted_head_tree', 'base_ref', 'base_sha', 'body_digest', 'candidate', 'complete',
      'draft', 'facts', 'facts_digest', 'github_state', 'head', 'merged', 'merge_commit', 'merge_method', 'ordered_parents',
      'pr', 'repository', 'revision', 'state', 'status', 'tree',
    ])
    && value.repository === REPOSITORY
    && value.pr === 380
    && value.state === 'MERGED'
    && value.github_state === 'MERGED'
    && value.status === 'ACCEPTED'
    && value.draft === false
    && value.merged === true
    && value.merge_method === 'MERGE_COMMIT'
    && value.merge_commit === MERGE_COMMIT_SHA
    && same(value.ordered_parents, [PR380_BASE_SHA, PR380_HEAD])
    && value.accepted_head_tree === PR380_TREE
    && value.head === PR380_HEAD
    && value.tree === PR380_TREE
    && value.base_ref === 'main'
    && value.base_sha === PR380_BASE_SHA
    && validateFinalisationCandidate(value.candidate)
    && isDigest(value.body_digest)
    && finalisationPr380FactsValid(value.facts)
    && same(value.facts, finalisationPr380FactsFromObservation(value))
    && isDigest(value.facts_digest)
    && value.facts_digest === digestValue(value.facts)
    && isProviderRevision(value.revision)
    && value.accepted_evidence_ref === FINAL_G4_EVIDENCE_REF
    && value.complete === true;
}
function finalisationCanonicalMainValid(value) {
  return isRecord(value)
    && exactKeys(value, ['complete', 'equals_merge_commit', 'ref', 'sha', 'tree'])
    && value.ref === 'main'
    && value.sha === MERGE_COMMIT_SHA
    && value.tree === MERGE_COMMIT_TREE
    && value.equals_merge_commit === true
    && value.complete === true;
}
function finalisationMergeAncestryValid(value) {
  return isRecord(value)
    && exactKeys(value, ['accepted_head', 'accepted_head_tree', 'merge_commit', 'merge_tree', 'merged', 'method', 'ordered_parents'])
    && value.merged === true
    && value.method === 'MERGE_COMMIT'
    && value.merge_commit === MERGE_COMMIT_SHA
    && same(value.ordered_parents, [PR380_BASE_SHA, PR380_HEAD])
    && value.accepted_head === PR380_HEAD
    && value.accepted_head_tree === PR380_TREE
    && value.merge_tree === MERGE_COMMIT_TREE;
}
function finalisationCollectorValid(value) {
  return isRecord(value)
    && exactKeys(value, ['authenticated', 'identity', 'kind', 'provider_client_used', 'version'])
    && value.kind === 'WEB_AUTHENTICATED_GITHUB_COLLECTION'
    && value.identity === 'github-web-readonly-adapter'
    && value.version === 'v1'
    && value.authenticated === true
    && value.provider_client_used === false;
}
function finalisationProviderFacts(sourceBinding) {
  return {
    inventory: 'EXACT_BOUNDED',
    provider_client_used: false,
    provider_cas_claim: false,
    facts_digest: sourceBinding.snapshot_digest,
    complete: true,
  };
}
function finalisationProviderFactsValid(value, evidence) {
  return isRecord(value)
    && exactKeys(value, ['complete', 'facts_digest', 'inventory', 'provider_cas_claim', 'provider_client_used'])
    && value.inventory === 'EXACT_BOUNDED'
    && value.provider_client_used === false
    && value.provider_cas_claim === false
    && value.complete === true
    && value.facts_digest === evidence.source_binding.snapshot_digest;
}
function finalisationPaginationInventory(id, evidence) {
  switch (id) {
    case 'parent': return { issue: evidence.parent.issue, body_digest: evidence.parent.body_digest, canonical_digest: evidence.parent.canonical_digest, revision: evidence.parent.revision };
    case 'child': return { issue: evidence.child.issue, body_digest: evidence.child.body_digest, canonical_digest: evidence.child.canonical_digest, revision: evidence.child.revision };
    case 'pr_379': return evidence.pr_379;
    case 'pr_380': return evidence.pr_380;
    case 'accepted_evidence': return evidence.accepted_evidence;
    case 'canonical_main': return evidence.canonical_main;
    case 'source_revisions': return evidence.source_revisions;
    case 'write_authority': return {
      reference: evidence.write_authority.reference,
      body_digest: evidence.write_authority.body_digest,
      repository: evidence.write_authority.repository,
      root: evidence.write_authority.root,
      lock: evidence.write_authority.lock,
      scope: evidence.write_authority.scope,
    };
    default: return null;
  }
}
function buildFinalisationPaginationEvidence(evidence) {
  return {
    complete: true,
    collections: FINALISATION_PAGINATION_DEFINITIONS.map((definition) => {
      const inventory = finalisationPaginationInventory(definition.id, evidence);
      return {
        id: definition.id,
        endpoint_or_query_identity: definition.endpoint,
        page_count: 1,
        retrieved_count: Array.isArray(inventory) ? inventory.length : 1,
        expected_count: definition.expected_count,
        inventory_digest: digestValue(inventory),
        complete: true,
      };
    }),
  };
}
function finalisationPaginationValid(value, evidence) {
  if (!isRecord(value) || !exactKeys(value, ['collections', 'complete']) || value.complete !== true
    || !Array.isArray(value.collections) || value.collections.length !== FINALISATION_PAGINATION_DEFINITIONS.length) return false;
  return FINALISATION_PAGINATION_DEFINITIONS.every((definition, index) => {
    const item = value.collections[index];
    const inventory = finalisationPaginationInventory(definition.id, evidence);
    return isRecord(item)
      && exactKeys(item, ['complete', 'endpoint_or_query_identity', 'expected_count', 'id', 'inventory_digest', 'page_count', 'retrieved_count'])
      && item.id === definition.id
      && item.endpoint_or_query_identity === definition.endpoint
      && item.page_count === 1
      && item.expected_count === definition.expected_count
      && item.retrieved_count === definition.expected_count
      && item.complete === true
      && isDigest(item.inventory_digest)
      && item.inventory_digest === digestValue(inventory);
  });
}
function finalisationBodyEvidenceValid(value, kind) {
  const required = kind === 'parent'
    ? ['body_digest', 'canonical_digest', 'complete', 'issue', 'native_children', 'prefix_digest', 'raw_body', 'relationships', 'revision', 'state', 'suffix_digest']
    : ['body_digest', 'canonical_digest', 'complete', 'dependencies', 'issue', 'labels', 'native_parent', 'prefix_digest', 'projection', 'raw_body', 'relationships', 'revision', 'sole_current', 'state', 'suffix_digest'];
  if (!isRecord(value) || !exactKeys(value, required)
    || value.issue !== (kind === 'parent' ? PARENT_ISSUE : CHILD_ISSUE)
    || typeof value.raw_body !== 'string'
    || !isDigest(value.body_digest)
    || sha256Text(value.raw_body) !== value.body_digest
    || !isDigest(value.canonical_digest)
    || !isProviderRevision(value.revision)
    || !isDigest(value.prefix_digest)
    || !isDigest(value.suffix_digest)
    || value.complete !== true
    || !isRecord(value.state)) return false;
  if (kind === 'parent') {
    return Array.isArray(value.native_children)
      && same(value.native_children, [358, 359, 360, 361, 362, 363])
      && isRecord(value.relationships)
      && exactKeys(value.relationships, ['child_issue', 'child_is_native_sub_issue', 'parent_issue', 'sole_current'])
      && same(value.relationships, { child_issue: CHILD_ISSUE, child_is_native_sub_issue: true, parent_issue: PARENT_ISSUE, sole_current: true });
  }
  return Array.isArray(value.labels)
    && same(value.labels, ['current'])
    && value.native_parent === PARENT_ISSUE
    && isRecord(value.relationships)
    && exactKeys(value.relationships, ['child_issue', 'child_is_native_sub_issue', 'parent_issue', 'sole_current'])
    && same(value.relationships, { child_issue: CHILD_ISSUE, child_is_native_sub_issue: true, parent_issue: PARENT_ISSUE, sole_current: true })
    && value.sole_current === true
    && same(value.dependencies, [])
    && isRecord(value.projection)
    && validateProjectionEnvelope(value.projection, 'child', value.canonical_digest);
}
function materialisedManagedBody(parsed, rendered, kind) {
  if (!parsed || !rendered?.ok) return null;
  return materialize(parsed, rendered[kind]);
}
function finalisationStageAFromStageB(stageBState) {
  if (!validateInterEpochStateV5(stageBState).ok || registryEntryByPr(stageBState, 379)?.github_state !== 'CLOSED') return null;
  const next = clone(stageBState);
  const child = childByIssue(next, CHILD_ISSUE);
  child.pr_registry = child.pr_registry.map((entry) => entry.pr === 379 ? retired379RegistryEntry('OPEN') : entry);
  return validateCanonicalStateV5(next).ok ? next : null;
}
function finalisationObservedStages(parentState) {
  if (Object.prototype.hasOwnProperty.call(parentState, 'recovery')) {
    const stageA = buildPostMergeEpochFinalisationStageATargetState(parentState);
    const stageB = stageA ? buildPostMergeEpochFinalisationStageBTargetState(stageA) : null;
    return { source: parentState, stageA, stageB };
  }
  const stageA = registryEntryByPr(parentState, 379)?.github_state === 'OPEN'
    ? parentState
    : finalisationStageAFromStageB(parentState);
  const stageB = registryEntryByPr(parentState, 379)?.github_state === 'CLOSED'
    ? parentState
    : stageA ? buildPostMergeEpochFinalisationStageBTargetState(stageA) : null;
  return { source: null, stageA, stageB };
}
function finalisationObservedCheckpoint(parentState, childDigest, providerState) {
  const stages = finalisationObservedStages(parentState);
  const sourceDigest = stages.source ? digestValue(stages.source) : null;
  const stageADigest = stages.stageA ? digestValue(stages.stageA) : null;
  const stageBDigest = stages.stageB ? digestValue(stages.stageB) : null;
  const parentDigest = digestValue(parentState);
  if (sourceDigest && parentDigest === sourceDigest && providerState === 'OPEN' && childDigest === sourceDigest) {
    return { checkpoint: 'BEFORE_STAGE_A', base_checkpoint: 'BEFORE_STAGE_A', stages };
  }
  if (sourceDigest && parentDigest === sourceDigest && providerState === 'OPEN' && childDigest === stageADigest) {
    return { checkpoint: 'CHILD_STAGE_A_OBSERVED', base_checkpoint: 'CHILD_STAGE_A_OBSERVED', stages };
  }
  if (stageADigest && parentDigest === stageADigest && providerState === 'OPEN' && childDigest === stageADigest) {
    return { checkpoint: 'PARENT_STAGE_A_OBSERVED', base_checkpoint: 'PARENT_STAGE_A_OBSERVED', stages };
  }
  if (stageADigest && parentDigest === stageADigest && providerState === 'CLOSED' && childDigest === stageADigest) {
    return { checkpoint: 'PR379_CLOSED_STAGE_A', base_checkpoint: 'PR379_CLOSED_STAGE_A', stages };
  }
  if (stageADigest && stageBDigest && parentDigest === stageADigest && providerState === 'CLOSED' && childDigest === stageBDigest) {
    return { checkpoint: 'CHILD_STAGE_B_OBSERVED', base_checkpoint: 'CHILD_STAGE_B_OBSERVED', stages };
  }
  if (stageBDigest && parentDigest === stageBDigest && providerState === 'CLOSED' && childDigest === stageBDigest) {
    return { checkpoint: 'FINAL_TARGET_OBSERVED', base_checkpoint: 'FINAL_TARGET_OBSERVED', stages };
  }
  return null;
}
function finalisationTransactionSpec(baseCheckpoint) {
  const table = {
    BEFORE_STAGE_A: { completed: [], previous: null },
    CHILD_STAGE_A_OBSERVED: { completed: [1], previous: 'BEFORE_STAGE_A' },
    PARENT_STAGE_A_OBSERVED: { completed: [1, 2], previous: 'CHILD_STAGE_A_OBSERVED' },
    PR379_CLOSED_STAGE_A: { completed: [1, 2, 3], previous: 'PARENT_STAGE_A_OBSERVED' },
    CHILD_STAGE_B_OBSERVED: { completed: [1, 2, 3, 4], previous: 'PR379_CLOSED_STAGE_A' },
    FINAL_TARGET_OBSERVED: { completed: [1, 2, 3, 4, 5], previous: 'CHILD_STAGE_B_OBSERVED' },
  };
  return table[baseCheckpoint] || null;
}
function finalisationAcknowledgementSpec(checkpoint) {
  const table = {
    CHILD_STAGE_A_ACKNOWLEDGEMENT_LOST: { base: 'CHILD_STAGE_A_OBSERVED', pre: 'BEFORE_STAGE_A', order: 1, resource: 'child', completed: [1], previous: 'BEFORE_STAGE_A' },
    PARENT_STAGE_A_ACKNOWLEDGEMENT_LOST: { base: 'PARENT_STAGE_A_OBSERVED', pre: 'CHILD_STAGE_A_OBSERVED', order: 2, resource: 'parent', completed: [1, 2], previous: 'CHILD_STAGE_A_OBSERVED' },
    PR379_CLOSE_ACKNOWLEDGEMENT_LOST: { base: 'PR379_CLOSED_STAGE_A', pre: 'PARENT_STAGE_A_OBSERVED', order: 3, resource: 'pr_379', completed: [1, 2], previous: 'PARENT_STAGE_A_OBSERVED' },
    CHILD_STAGE_B_ACKNOWLEDGEMENT_LOST: { base: 'CHILD_STAGE_B_OBSERVED', pre: 'PR379_CLOSED_STAGE_A', order: 4, resource: 'child', completed: [1, 2, 3, 4], previous: 'PR379_CLOSED_STAGE_A' },
    PARENT_STAGE_B_ACKNOWLEDGEMENT_LOST: { base: 'FINAL_TARGET_OBSERVED', pre: 'CHILD_STAGE_B_OBSERVED', order: 5, resource: 'parent', completed: [1, 2, 3, 4, 5], previous: 'CHILD_STAGE_B_OBSERVED' },
  };
  return table[checkpoint] || null;
}
const FINALISATION_OPERATION_RESOURCE = Object.freeze({
  1: 'child',
  2: 'parent',
  3: 'pr_379',
  4: 'child',
  5: 'parent',
});
function finalisationBindingCheckpoint(binding, stages, decision) {
  if (!finalisationSourceBindingValid(binding)) return null;
  const sourceDigest = stages.source ? digestValue(stages.source) : decision.source_state.canonical_digest;
  const stageADigest = stages.stageA ? digestValue(stages.stageA) : null;
  const stageBDigest = stages.stageB ? digestValue(stages.stageB) : null;
  const parentDigest = binding.parent.canonical_digest;
  const childDigest = binding.child.canonical_digest;
  const providerState = binding.pr_379.facts.github_state;
  if (sourceDigest && parentDigest === sourceDigest && childDigest === sourceDigest && providerState === 'OPEN') return 'BEFORE_STAGE_A';
  if (sourceDigest && parentDigest === sourceDigest && childDigest === stageADigest && providerState === 'OPEN') return 'CHILD_STAGE_A_OBSERVED';
  if (stageADigest && parentDigest === stageADigest && childDigest === stageADigest && providerState === 'OPEN') return 'PARENT_STAGE_A_OBSERVED';
  if (stageADigest && parentDigest === stageADigest && childDigest === stageADigest && providerState === 'CLOSED') return 'PR379_CLOSED_STAGE_A';
  if (stageADigest && stageBDigest && parentDigest === stageADigest && childDigest === stageBDigest && providerState === 'CLOSED') return 'CHILD_STAGE_B_OBSERVED';
  if (stageBDigest && parentDigest === stageBDigest && childDigest === stageBDigest && providerState === 'CLOSED') return 'FINAL_TARGET_OBSERVED';
  return null;
}
function finalisationBindingChangedResources(current, previous) {
  return ['parent', 'child', 'pr_379', 'pr_380'].filter((key) => !same(current[key], previous[key]));
}
function finalisationRebindValid(current, decision, observed, transaction) {
  const currentCheckpoint = finalisationBindingCheckpoint(current, observed.stages, decision);
  if (!currentCheckpoint) return failure('FINALISATION_SOURCE_BINDING_CHECKPOINT_INVALID');
  const acknowledgement = finalisationAcknowledgementSpec(transaction.checkpoint);
  const normal = finalisationTransactionSpec(transaction.checkpoint);
  if (!acknowledgement && (!normal || currentCheckpoint !== transaction.checkpoint)) {
    return failure('FINALISATION_SOURCE_BINDING_CHECKPOINT_INVALID');
  }
  if (!acknowledgement && transaction.checkpoint === 'BEFORE_STAGE_A') {
    if (transaction.previous_source_binding !== null || !same(current, decision.source_binding)) return failure('FINALISATION_SOURCE_BINDING_INVALID');
    return success('FINALISATION_SOURCE_BINDING_VALID', { changed_resources: [] });
  }
  if (!isRecord(transaction.previous_source_binding)
    || !finalisationSourceBindingValid(transaction.previous_source_binding)) return failure('FINALISATION_PREVIOUS_SOURCE_BINDING_INVALID');
  const previousCheckpoint = finalisationBindingCheckpoint(transaction.previous_source_binding, observed.stages, decision);
  const expectedPrevious = acknowledgement ? acknowledgement.pre : normal.previous;
  if (previousCheckpoint !== expectedPrevious) return failure('FINALISATION_PREVIOUS_SOURCE_BINDING_CHECKPOINT_INVALID');
  const changedResources = finalisationBindingChangedResources(current, transaction.previous_source_binding);
  if (acknowledgement) {
    if (![acknowledgement.pre, acknowledgement.base].includes(currentCheckpoint)
      || !changedResources.every((resource) => resource === acknowledgement.resource)
      || changedResources.length > 1) return failure('FINALISATION_ACKNOWLEDGEMENT_REBIND_INVALID');
    if (changedResources.length === 1
      && current[acknowledgement.resource].revision === transaction.previous_source_binding[acknowledgement.resource].revision) {
      return failure('FINALISATION_ACKNOWLEDGEMENT_REVISION_INVALID');
    }
    return success('FINALISATION_SOURCE_BINDING_VALID', { changed_resources: changedResources });
  }
  const resource = FINALISATION_OPERATION_RESOURCE[normal.completed.length];
  if (changedResources.length !== 1 || changedResources[0] !== resource
    || current[resource].revision === transaction.previous_source_binding[resource].revision) {
    return failure('FINALISATION_REBIND_MOVEMENT_INVALID');
  }
  return success('FINALISATION_SOURCE_BINDING_VALID', { changed_resources: changedResources });
}
function finalisationTransactionValid(value, observed, decisionValid, currentBinding) {
  if (!isRecord(value)
    || !exactKeys(value, ['acknowledgement', 'acknowledgement_loss_operation_order', 'complete', 'completed_operation_orders', 'continuation', 'duplicate_event_count', 'previous_source_binding', 'readback', 'checkpoint'])
    || !FINALISATION_CHECKPOINTS.includes(value.checkpoint)
    || value.complete !== true
    || value.duplicate_event_count !== 1
    || !isRecord(value.readback)
    || !exactKeys(value.readback, ['complete', 'exact'])
    || value.readback.complete !== true
    || value.readback.exact !== true) return failure('FINALISATION_TRANSACTION_INVALID');
  const ack = finalisationAcknowledgementSpec(value.checkpoint);
  const normal = finalisationTransactionSpec(observed.base_checkpoint);
  if (!ack && (!normal || value.checkpoint !== observed.base_checkpoint)) return failure('FINALISATION_UNKNOWN_PARTIAL_CHECKPOINT');
  const expected = ack || { base: observed.base_checkpoint, order: null, completed: normal.completed, previous: normal.previous };
  if (ack) {
    if (![ack.pre, ack.base].includes(observed.base_checkpoint)
      || value.acknowledgement !== 'LOST'
      || value.acknowledgement_loss_operation_order !== ack.order) return failure('FINALISATION_ACKNOWLEDGEMENT_CHECKPOINT_INVALID');
  } else if (value.acknowledgement !== 'CONFIRMED' || value.acknowledgement_loss_operation_order !== null) return failure('FINALISATION_ACKNOWLEDGEMENT_INVALID');
  if (!same(value.completed_operation_orders, expected.completed)) return failure('FINALISATION_TRANSACTION_ORDER_INVALID');
  if (expected.previous === null) {
    if (value.continuation !== null) return failure('FINALISATION_CONTINUATION_UNEXPECTED');
  } else {
    const continuation = value.continuation;
    if (!isRecord(continuation)
      || !exactKeys(continuation, ['authority_body_digest', 'complete', 'decision_digest', 'exact_readback', 'fresh_complete_rebind', 'previous_checkpoint'])
      || continuation.previous_checkpoint !== expected.previous
      || continuation.decision_digest !== decisionValid.decision_digest
      || continuation.authority_body_digest !== decisionValid.decision.write_authority.body_digest
      || continuation.fresh_complete_rebind !== true
      || continuation.exact_readback !== true
      || continuation.complete !== true) return failure('FINALISATION_CONTINUATION_INVALID');
  }
  const rebind = finalisationRebindValid(currentBinding, decisionValid.decision, observed, value);
  if (!rebind.ok) return rebind;
  return success('FINALISATION_TRANSACTION_VALID', { acknowledgement_loss: Boolean(ack), base_checkpoint: expected.base, completed_operation_orders: expected.completed });
}
function validatePostMergeEpochFinalisationEvidence(value, decisionInput) {
  const decisionValid = validateFinalisationDecision(decisionInput);
  if (!decisionValid.ok) return decisionValid;
  if (!isRecord(value) || !exactKeys(value, FINALISATION_EVIDENCE_KEYS)
    || value.schema !== FINALISATION_EVIDENCE_SCHEMA
    || value.root !== FINALISATION_ROOT
    || value.lock !== FINALISATION_LOCK
    || value.decision_digest !== decisionValid.decision_digest
    || value.repository !== REPOSITORY
    || value.parent_issue !== PARENT_ISSUE
    || value.child_issue !== CHILD_ISSUE
    || !finalisationSourceBindingValid(value.source_binding)
    || !finalisationAuthorityValid(decisionValid.decision.write_authority)
    || !finalisationWriteAuthorityEvidenceValid(value.write_authority, decisionValid.decision)
    || !finalisationAcceptedEvidenceValid(value.accepted_evidence, decisionValid.decision)
    || !validateFinalisationAcceptedEpochEvent(value.accepted_epoch_event)
    || !finalisationMergeAncestryValid(value.merge_ancestry)
    || !finalisationCanonicalMainValid(value.canonical_main)
    || !finalisationCollectorValid(value.collector)
    || !finalisationProviderPr379Valid(value.pr_379)
    || !finalisationProviderPr380Valid(value.pr_380)
    || !finalisationProviderFactsValid(value.provider_facts, value)
    || !finalisationBodyEvidenceValid(value.parent, 'parent')
    || !finalisationBodyEvidenceValid(value.child, 'child')
    || !validateFinalisationSourceRevisions(value.source_revisions, value, decisionValid.decision)) return failure('FINALISATION_EVIDENCE_INVALID');
  if (!same(value.source_binding, finalisationSourceBindingFromEvidence(value))) return failure('FINALISATION_SOURCE_BINDING_INVALID');
  const parentParsed = parseParentV5Body(value.parent.raw_body, { repository: REPOSITORY, parent_issue: PARENT_ISSUE });
  if (!parentParsed.ok
    || parentParsed.body_digest !== value.parent.body_digest
    || parentParsed.envelope.canonical_digest !== value.parent.canonical_digest
    || parentParsed.prefix_digest !== value.parent.prefix_digest
    || parentParsed.suffix_digest !== value.parent.suffix_digest
    || !same(parentParsed.state, value.parent.state)) return failure('FINALISATION_PARENT_READBACK_INVALID');
  const childParsed = parseChildV5Body(value.child.raw_body, { repository: REPOSITORY, parent_issue: PARENT_ISSUE });
  if (!childParsed.ok
    || childParsed.body_digest !== value.child.body_digest
    || childParsed.envelope.canonical_digest !== value.child.canonical_digest
    || childParsed.prefix_digest !== value.child.prefix_digest
    || childParsed.suffix_digest !== value.child.suffix_digest
    || !same(childParsed.envelope, value.child.projection)) return failure('FINALISATION_CHILD_READBACK_INVALID');
  const parentStateValid = validateCanonicalStateV5(value.parent.state);
  if (!parentStateValid.ok) return failure('FINALISATION_PARENT_STATE_INVALID');
  const observed = finalisationObservedCheckpoint(value.parent.state, value.child.canonical_digest, value.pr_379.github_state);
  if (!observed) return failure('FINALISATION_UNKNOWN_PARTIAL_CHECKPOINT');
  if (finalisationBindingCheckpoint(value.source_binding, observed.stages, decisionValid.decision) !== observed.base_checkpoint) {
    return failure('FINALISATION_SOURCE_BINDING_CHECKPOINT_INVALID');
  }
  const recognisedProjectionDivergence = ['CHILD_STAGE_A_OBSERVED', 'CHILD_STAGE_B_OBSERVED'].includes(observed.base_checkpoint);
  if (value.child.canonical_digest !== value.parent.canonical_digest
    && value.parent.canonical_digest !== FINALISATION_SOURCE_CANONICAL_DIGEST
    && !recognisedProjectionDivergence) return failure('FINALISATION_CANONICAL_DIVERGENCE');
  const observedChildState = value.child.canonical_digest === digestValue(value.parent.state)
    ? value.parent.state
    : value.child.canonical_digest === digestValue(observed.stages.stageA)
      ? observed.stages.stageA
      : observed.stages.stageB;
  if (!observedChildState || !validateSnapshotState(value.child.state, expectedChildSnapshotState(observedChildState))) return failure('FINALISATION_CHILD_STATE_DIVERGENCE');
  const transactionValid = finalisationTransactionValid(value.transaction, observed, decisionValid, value.source_binding);
  if (!transactionValid.ok) return transactionValid;
  if (!finalisationPaginationValid(value.pagination, value)) return failure('FINALISATION_PAGINATION_INCOMPLETE');
  if (value.evidence_digest !== digestValue(without(value, 'evidence_digest'))) return failure('FINALISATION_EVIDENCE_DIGEST_INVALID');
  const stages = observed.stages;
  const stageA = stages.stageA;
  const stageB = stages.stageB;
  if (!stageA || !stageB) return failure('FINALISATION_TARGET_BUILD_FAILED');
  const stageARendered = renderProgrammeV5(stageA);
  const stageBRendered = renderProgrammeV5(stageB);
  if (!stageARendered.ok || !stageBRendered.ok) return failure('FINALISATION_TARGET_RENDER_INVALID');
  const expectedStageAParent = materialisedManagedBody(parentParsed, stageARendered, 'parent');
  const expectedStageAChild = materialisedManagedBody(childParsed, stageARendered, 'child');
  const expectedStageBParent = materialisedManagedBody(parentParsed, stageBRendered, 'parent');
  const expectedStageBChild = materialisedManagedBody(childParsed, stageBRendered, 'child');
  const expectedBodies = {
    stage_a_parent: expectedStageAParent,
    stage_a_child: expectedStageAChild,
    stage_b_parent: expectedStageBParent,
    stage_b_child: expectedStageBChild,
  };
  if ([expectedStageAParent, expectedStageAChild, expectedStageBParent, expectedStageBChild].some((body) => typeof body !== 'string')) return failure('FINALISATION_TARGET_RENDER_INVALID');
  const sourceParent = value.parent.canonical_digest === FINALISATION_SOURCE_CANONICAL_DIGEST;
  if (sourceParent && (value.parent.state.recovery === undefined || !validateFinalisationSourceState(value.parent.state).ok)) return failure('FINALISATION_SOURCE_STATE_INVALID');
  if (value.parent.canonical_digest !== FINALISATION_SOURCE_CANONICAL_DIGEST && !validateInterEpochStateV5(value.parent.state).ok) return failure('FINALISATION_INTER_EPOCH_STATE_INVALID');
  const expectedBodyForParent = value.parent.canonical_digest === digestValue(stageA) ? expectedStageAParent : value.parent.canonical_digest === digestValue(stageB) ? expectedStageBParent : null;
  const expectedBodyForChild = value.child.canonical_digest === digestValue(stageA) ? expectedStageAChild : value.child.canonical_digest === digestValue(stageB) ? expectedStageBChild : value.child.canonical_digest === FINALISATION_SOURCE_CANONICAL_DIGEST ? value.child.raw_body : null;
  if (expectedBodyForParent && value.parent.raw_body !== expectedBodyForParent) return failure('FINALISATION_PARENT_TARGET_BYTES_INVALID');
  if (expectedBodyForChild && value.child.raw_body !== expectedBodyForChild) return failure('FINALISATION_CHILD_TARGET_BYTES_INVALID');
  return success('FINALISATION_EVIDENCE_VALID', {
    evidence: clone(value),
    evidence_digest: value.evidence_digest,
    parsed: {
      parent: parentParsed,
      child: childParsed,
      checkpoint: value.transaction.checkpoint,
      base_checkpoint: observed.base_checkpoint,
      acknowledgement_loss: transactionValid.acknowledgement_loss,
      completed_operation_orders: transactionValid.completed_operation_orders,
      source_state: stages.source,
      stage_a_state: clone(stageA),
      stage_b_state: clone(stageB),
      stage_a_rendered: stageARendered,
      stage_b_rendered: stageBRendered,
      target_bodies: expectedBodies,
    },
  });
}
function buildFinalisationOperationDescriptor(input = {}) {
  if (!isRecord(input) || ['desired', 'patch', 'transition', 'programme_apply', 'e4_activation'].some((key) => Object.prototype.hasOwnProperty.call(input, key))) return null;
  const spec = FINALISATION_OPERATION_ORDER.find((item) => item.order === input.order);
  if (!spec || !isDigest(input.decision_digest) || !isDigest(input.authority_body_digest)) return null;
  const descriptor = {
    schema: FINALISATION_OPERATION_SCHEMA,
    order: spec.order,
    operation_id: spec.operation_id,
    issue: spec.issue,
    target_kind: spec.target_kind,
    target: spec.target,
    operation_kind: spec.operation_kind,
    source_revision: input.source_revision,
    source_body_digest: input.source_body_digest,
    target_revision: input.target_revision ?? null,
    target_body_digest: input.target_body_digest ?? null,
    target_canonical_digest: input.target_canonical_digest,
    target_projection_digest: input.target_projection_digest ?? null,
    target_bytes: input.target_bytes ?? null,
    source_binding_digest: digestValue({
      authority_body_digest: input.authority_body_digest,
      decision_digest: input.decision_digest,
      issue: spec.issue,
      source_body_digest: input.source_body_digest,
      source_revision: input.source_revision,
      write_safety_mode: FINALISATION_WRITE_SAFETY_MODE,
    }),
    expected_provider_state: input.expected_provider_state ?? null,
    target_provider_state: input.target_provider_state ?? null,
    expected_provider_digest: input.expected_provider_digest ?? null,
    target_provider_digest: input.target_provider_digest ?? null,
    provider_client_used: false,
    provider_cas_claim: false,
    programme_apply: false,
    e4_activation: false,
    write_safety_mode: FINALISATION_WRITE_SAFETY_MODE,
    readback_required: true,
  };
  if (!isSafeRevision(descriptor.source_revision)
    || !isDigest(descriptor.source_body_digest)
    || !isDigest(descriptor.target_canonical_digest)) return null;
  if (spec.target_kind === 'ISSUE_BODY') {
    if (typeof descriptor.target_bytes !== 'string'
      || !isDigest(descriptor.target_body_digest)
      || sha256Text(descriptor.target_bytes) !== descriptor.target_body_digest
      || !isDigest(descriptor.target_projection_digest)
      || descriptor.target_revision !== null) return null;
  } else if (descriptor.target_bytes !== null
    || descriptor.target_body_digest !== null
    || descriptor.target_projection_digest !== null
    || descriptor.target_revision !== null
    || ['OPEN', 'CLOSED'].includes(descriptor.source_revision)
    || descriptor.expected_provider_state !== 'OPEN'
    || descriptor.target_provider_state !== 'CLOSED'
    || !isDigest(descriptor.expected_provider_digest)
    || !isDigest(descriptor.target_provider_digest)) return null;
  descriptor.operation_digest = digestValue(without(descriptor, 'operation_digest'));
  return descriptor;
}
function finalisationRemainingOperationOrders(completed) {
  return FINALISATION_OPERATION_ORDER.filter((item) => !completed.includes(item.order)).map((item) => item.order);
}
function previewPostMergeEpochFinalisation(input = {}) {
  if (!isRecord(input) || !exactKeys(input, ['decision', 'evidence'])) return failure('FINALISATION_PREVIEW_INPUT_INVALID');
  const evidenceValid = validatePostMergeEpochFinalisationEvidence(input.evidence, input.decision);
  if (!evidenceValid.ok) return evidenceValid;
  const decisionValid = validateFinalisationDecision(input.decision);
  const parsed = evidenceValid.parsed;
  const completed = parsed.completed_operation_orders;
  const targetStates = { stage_a: parsed.stage_a_state, stage_b: parsed.stage_b_state };
  const operations = [];
  const allRendered = { stage_a: parsed.stage_a_rendered, stage_b: parsed.stage_b_rendered };
  const sourceParsed = { parent: parsed.parent, child: parsed.child };
  for (const spec of FINALISATION_OPERATION_ORDER) {
    if (completed.includes(spec.order) || parsed.acknowledgement_loss) continue;
    const isBody = spec.target_kind === 'ISSUE_BODY';
    const targetState = spec.order <= 3 ? targetStates.stage_a : targetStates.stage_b;
    if (!targetState || !allRendered[spec.order <= 3 ? 'stage_a' : 'stage_b']?.ok) return failure('FINALISATION_TARGET_BUILD_FAILED');
    if (isBody) {
      const kind = spec.issue === PARENT_ISSUE ? 'parent' : 'child';
      const currentParsed = sourceParsed[kind];
      const render = allRendered[spec.order <= 3 ? 'stage_a' : 'stage_b'];
      const targetBytes = materialisedManagedBody(currentParsed, render, kind);
      const targetProjectionDigest = render.projections[kind].projection_digest;
      const descriptor = buildFinalisationOperationDescriptor({
        order: spec.order,
        decision_digest: decisionValid.decision_digest,
        authority_body_digest: decisionValid.decision.write_authority.body_digest,
        source_revision: kind === 'parent' ? input.evidence.parent.revision : input.evidence.child.revision,
        source_body_digest: kind === 'parent' ? input.evidence.parent.body_digest : input.evidence.child.body_digest,
        target_canonical_digest: digestValue(targetState),
        target_body_digest: sha256Text(targetBytes),
        target_projection_digest: targetProjectionDigest,
        target_bytes: targetBytes,
      });
      if (!descriptor) return failure('FINALISATION_OPERATION_DESCRIPTOR_INVALID');
      operations.push(descriptor);
    } else {
      const descriptor = buildFinalisationOperationDescriptor({
        order: spec.order,
        decision_digest: decisionValid.decision_digest,
        authority_body_digest: decisionValid.decision.write_authority.body_digest,
        source_revision: input.evidence.pr_379.revision,
        source_body_digest: input.evidence.pr_379.body_digest,
        target_canonical_digest: digestValue(targetStates.stage_a),
        expected_provider_state: 'OPEN',
        target_provider_state: 'CLOSED',
        expected_provider_digest: digestValue({ pr: 379, state: 'OPEN', head: FROZEN_HEAD, tree: FROZEN_TREE }),
        target_provider_digest: digestValue({ pr: 379, state: 'CLOSED', head: FROZEN_HEAD, tree: FROZEN_TREE }),
      });
      if (!descriptor) return failure('FINALISATION_OPERATION_DESCRIPTOR_INVALID');
      operations.push(descriptor);
    }
  }
  const zeroDelta = parsed.checkpoint === 'FINAL_TARGET_OBSERVED';
  const acknowledgementLoss = parsed.acknowledgement_loss;
  const response = {
    ok: true,
    code: zeroDelta ? 'FINALISATION_ZERO_DELTA' : acknowledgementLoss ? 'FINALISATION_ACKNOWLEDGEMENT_LOSS_REQUIRES_REBIND' : 'POST_MERGE_EPOCH_FINALISATION_PREVIEW_READY',
    schema: FINALISATION_OPERATION_SCHEMA,
    root: FINALISATION_ROOT,
    lock: FINALISATION_LOCK,
    status: zeroDelta ? 'ALREADY_FINAL' : acknowledgementLoss ? 'REQUIRES_FRESH_COMPLETE_REBIND' : 'PREVIEW_READY',
    checkpoint: parsed.checkpoint,
    base_checkpoint: parsed.base_checkpoint,
    acknowledgement_loss: acknowledgementLoss,
    decision_digest: decisionValid.decision_digest,
    evidence_digest: evidenceValid.evidence_digest,
    authority_body_digest: decisionValid.decision.write_authority.body_digest,
    completed_operation_orders: [...completed],
    remaining_operation_orders: finalisationRemainingOperationOrders(completed),
    operations,
    operation_count: operations.length,
    operation_order: operations.map((operation) => operation.operation_id),
    ordered_operation_digest: digestValue(operations),
    stage_a: {
      canonical_digest: digestValue(targetStates.stage_a),
      projection_digests: {
        parent: allRendered.stage_a.projections.parent.projection_digest,
        child: allRendered.stage_a.projections.child.projection_digest,
      },
    },
    stage_b: {
      canonical_digest: digestValue(targetStates.stage_b),
      projection_digests: {
        parent: allRendered.stage_b.projections.parent.projection_digest,
        child: allRendered.stage_b.projections.child.projection_digest,
      },
    },
    write_safety: clone(FINALISATION_WRITE_SAFETY),
    prohibitions: clone(FINALISATION_PROHIBITIONS),
    readback_required: true,
    duplicate_write: false,
    zero_delta: zeroDelta,
    programme_apply: false,
    e4_auto_launch: false,
    provider_client_added: false,
    provider_cas_claim: false,
    fresh_complete_rebind_required: acknowledgementLoss || operations.length > 0,
  };
  return response;
}
function classifyPostMergeEpochFinalisationCheckpoint(input = {}) {
  if (isRecord(input) && Object.prototype.hasOwnProperty.call(input, 'evidence')) {
    const valid = validatePostMergeEpochFinalisationEvidence(input.evidence, input.decision);
    return valid.ok
      ? success('FINALISATION_CHECKPOINT_CLASSIFIED', {
        checkpoint: valid.parsed.checkpoint,
        base_checkpoint: valid.parsed.base_checkpoint,
        acknowledgement_loss: valid.parsed.acknowledgement_loss,
      })
      : valid;
  }
  if (!isRecord(input)
    || !isDigest(input.parent_canonical_digest)
    || !isDigest(input.child_canonical_digest)
    || !isDigest(input.source_canonical_digest)
    || !isDigest(input.stage_a_canonical_digest)
    || !isDigest(input.stage_b_canonical_digest)
    || input.source_canonical_digest !== FINALISATION_SOURCE_CANONICAL_DIGEST
    || !['OPEN', 'CLOSED'].includes(input.pr379_github_state)) return failure('FINALISATION_UNKNOWN_PARTIAL_CHECKPOINT');
  let checkpoint = null;
  if (input.parent_canonical_digest === input.source_canonical_digest
    && input.child_canonical_digest === input.source_canonical_digest
    && input.pr379_github_state === 'OPEN') checkpoint = 'BEFORE_STAGE_A';
  else if (input.parent_canonical_digest === input.source_canonical_digest
    && input.child_canonical_digest === input.stage_a_canonical_digest
    && input.pr379_github_state === 'OPEN') checkpoint = 'CHILD_STAGE_A_OBSERVED';
  else if (input.parent_canonical_digest === input.stage_a_canonical_digest
    && input.child_canonical_digest === input.stage_a_canonical_digest
    && input.pr379_github_state === 'OPEN') checkpoint = 'PARENT_STAGE_A_OBSERVED';
  else if (input.parent_canonical_digest === input.stage_a_canonical_digest
    && input.child_canonical_digest === input.stage_a_canonical_digest
    && input.pr379_github_state === 'CLOSED') checkpoint = 'PR379_CLOSED_STAGE_A';
  else if (input.parent_canonical_digest === input.stage_a_canonical_digest
    && input.child_canonical_digest === input.stage_b_canonical_digest
    && input.pr379_github_state === 'CLOSED') checkpoint = 'CHILD_STAGE_B_OBSERVED';
  else if (input.parent_canonical_digest === input.stage_b_canonical_digest
    && input.child_canonical_digest === input.stage_b_canonical_digest
    && input.pr379_github_state === 'CLOSED') checkpoint = 'FINAL_TARGET_OBSERVED';
  return checkpoint ? success('FINALISATION_CHECKPOINT_CLASSIFIED', { checkpoint, base_checkpoint: checkpoint, acknowledgement_loss: false }) : failure('FINALISATION_UNKNOWN_PARTIAL_CHECKPOINT');
}
function validatePostMergeEpochFinalisationReadback(input = {}) {
  if (!isRecord(input) || !exactKeys(input, ['decision', 'evidence'])) return failure('FINALISATION_READBACK_INPUT_INVALID');
  const valid = validatePostMergeEpochFinalisationEvidence(input.evidence, input.decision);
  if (!valid.ok) return valid;
  return success('FINALISATION_READBACK_VALID', {
    checkpoint: valid.parsed.checkpoint,
    final_target: valid.parsed.checkpoint === 'FINAL_TARGET_OBSERVED',
    zero_delta: valid.parsed.checkpoint === 'FINAL_TARGET_OBSERVED',
    canonical_main: MERGE_COMMIT_SHA,
    merge_commit: MERGE_COMMIT_SHA,
  });
}
function buildPostMergeEpochFinalisationOperationDescriptor(input) {
  return buildFinalisationOperationDescriptor(input);
}

function validateControllerBootstrap(value) {
  const keys = ['schema', 'profile', 'repository', 'parent_issue', 'programme_state_schema', 'surface_contract_schema', 'toolkit_package_version', 'toolkit_contract', 'conformance', 'compatibility'];
  if (!isRecord(value) || !exactKeys(value, keys)
    || value.schema !== BOOTSTRAP_SCHEMA
    || value.profile !== 'github-managed-programme'
    || value.repository !== REPOSITORY
    || value.parent_issue !== PARENT_ISSUE
    || value.programme_state_schema !== STATE_SCHEMA
    || value.surface_contract_schema !== SURFACE_SCHEMA
    || value.toolkit_package_version !== '2.10.8'
    || !isRecord(value.toolkit_contract)
    || !exactKeys(value.toolkit_contract, ['repository', 'revision', 'path', 'sha256'])
    || value.toolkit_contract.repository !== REPOSITORY
    || !isSha(value.toolkit_contract.revision)
    || value.toolkit_contract.path !== 'repo/contracts/github-program-reconciler/programme-surface-contract-v5.json'
    || !isDigest(value.toolkit_contract.sha256)
    || !isRecord(value.conformance)
    || !exactKeys(value.conformance, ['actual_workspace_bytes', 'canonical_json', 'historical_git_object_required', 'resolver', 'source_revision_pinned'])
    || value.conformance.actual_workspace_bytes !== true
    || value.conformance.canonical_json !== true
    || value.conformance.historical_git_object_required !== false
    || value.conformance.resolver !== 'unchanged'
    || value.conformance.source_revision_pinned !== true
    || !isRecord(value.compatibility)
    || !exactKeys(value.compatibility, ['fail_closed_on_unknown_major', 'provider_cas_claim', 'receipt_source_changed'])
    || value.compatibility.fail_closed_on_unknown_major !== true
    || value.compatibility.provider_cas_claim !== false
    || value.compatibility.receipt_source_changed !== false) return failure('BOOTSTRAP_INVALID');
  return success('BOOTSTRAP_VALID', { bootstrap: clone(value) });
}
function verifyBootstrapWorkspaceProof(input = {}) {
  if (!isRecord(input) || !exactKeys(input, ['bootstrap', 'contract_bytes', 'workspace_revision'])) return failure('BOOTSTRAP_PROOF_INVALID');
  const valid = validateControllerBootstrap(input.bootstrap);
  if (!valid.ok) return valid;
  if (input.workspace_revision !== input.bootstrap.toolkit_contract.revision
    || typeof input.contract_bytes !== 'string'
    || input.contract_bytes.length === 0) return failure('BOOTSTRAP_WORKSPACE_BINDING_INVALID');
  let contract;
  try { contract = JSON.parse(input.contract_bytes); } catch (_error) { return failure('BOOTSTRAP_CONTRACT_JSON_INVALID'); }
  if (!isRecord(contract)
    || contract.schema !== SURFACE_SCHEMA
    || digestValue(contract) !== input.bootstrap.toolkit_contract.sha256) return failure('BOOTSTRAP_CONTRACT_DIGEST_INVALID');
  return success('BOOTSTRAP_WORKSPACE_PROOF_VALID', {
    actual_workspace_bytes: true,
    canonical_json: true,
    canonical_contract_digest: digestValue(contract),
    source_revision: input.workspace_revision,
    historical_git_object_required: false,
    resolver: 'unchanged',
  });
}

const projectionBootstrapRecovery = Object.freeze({
  schema: DECISION_SCHEMA,
  evidenceSchema: EVIDENCE_SCHEMA,
  createDecision: createRecoveryDecision,
  validateDecision,
  validateEvidence,
  classifyPartialState,
  parseParentV5Body,
  parseChildV5Body,
  parse: parseProgrammeV5Body,
  render: renderProgrammeV5,
  preview: previewRecovery,
  buildTargetState: buildRecoveryTargetState,
  buildReceiptOperationDescriptor,
  validateControllerBootstrap,
  verifyBootstrapWorkspaceProof,
});
const postMergeEpochFinalisation = Object.freeze({
  schema: FINALISATION_DECISION_SCHEMA,
  evidenceSchema: FINALISATION_EVIDENCE_SCHEMA,
  operationSchema: FINALISATION_OPERATION_SCHEMA,
  createDecision: createPostMergeEpochFinalisationDecision,
  buildSourceBinding: buildPostMergeEpochFinalisationSourceBinding,
  bindSourceSnapshot: buildPostMergeEpochFinalisationSourceBinding,
  validateDecision: validateFinalisationDecision,
  validateEvidence: validatePostMergeEpochFinalisationEvidence,
  preview: previewPostMergeEpochFinalisation,
  buildStageATargetState: buildPostMergeEpochFinalisationStageATargetState,
  buildStageBTargetState: buildPostMergeEpochFinalisationStageBTargetState,
  buildStageA: buildPostMergeEpochFinalisationStageATargetState,
  buildStageB: buildPostMergeEpochFinalisationStageBTargetState,
  buildOperationDescriptor: buildPostMergeEpochFinalisationOperationDescriptor,
  buildReceiptOperationDescriptor: buildPostMergeEpochFinalisationOperationDescriptor,
  classifyCheckpoint: classifyPostMergeEpochFinalisationCheckpoint,
  classifyPartialState: classifyPostMergeEpochFinalisationCheckpoint,
  validateReadback: validatePostMergeEpochFinalisationReadback,
  buildPaginationEvidence: buildFinalisationPaginationEvidence,
});
const programmeV5 = Object.freeze({
  schema: STATE_SCHEMA,
  validateCanonicalStateV5,
  deriveProjectionV5: (state, kind) => {
    const valid = validateCanonicalStateV5(state);
    return valid.ok ? success('V5_PROJECTION_READY', { projection: projectionPayload(state, kind), projection_digest: digestValue(projectionPayload(state, kind)) }) : valid;
  },
  renderProgrammeV5,
  parseProgrammeV5Body,
  projectionBootstrapRecovery,
  postMergeEpochFinalisation,
});

module.exports = Object.freeze({
  REPOSITORY,
  PARENT_ISSUE,
  CHILD_ISSUE,
  MAIN_SHA,
  RECOVERY_ROOT,
  LOCK,
  OLD_ROOT,
  PARKED_ROOT,
  WRITE_SAFETY_MODE,
  STATE_SCHEMA,
  PROJECTION_SCHEMA,
  SURFACE_SCHEMA,
  DECISION_SCHEMA,
  EVIDENCE_SCHEMA,
  BOOTSTRAP_SCHEMA,
  SOURCE_CANONICAL_DIGEST,
  SOURCE_PARENT_BODY_DIGEST,
  SOURCE_CHILD_BODY_DIGEST,
  SOURCE_PARENT_REVISION,
  SOURCE_CHILD_REVISION,
  TARGET_CANONICAL_DIGEST,
  FINALISATION_ROOT,
  FINALISATION_LOCK,
  FINALISATION_SCOPE,
  FINALISATION_WRITE_SAFETY_MODE,
  FINALISATION_DECISION_SCHEMA,
  FINALISATION_EVIDENCE_SCHEMA,
  FINALISATION_OPERATION_SCHEMA,
  FINALISATION_SOURCE_CANONICAL_DIGEST,
  PR380_HEAD,
  PR380_TREE,
  PR380_BRANCH,
  PR380_BASE_SHA,
  MERGE_COMMIT_SHA,
  MERGE_COMMIT_TREE,
  FINAL_G4_EVIDENCE_REF,
  POST_MERGE_TECHNICAL_EVIDENCE_REF,
  PR379_NON_CONVERGENCE_EVIDENCE_REF,
  FINALISATION_CHECKPOINTS,
  FINALISATION_ACK_LOSS_CHECKPOINTS,
  FINALISATION_OPERATION_ORDER,
  RECOVERY_EVIDENCE_REF,
  HOLD_EVIDENCE_REF,
  RETENTION_EVIDENCE_REF,
  PAGINATION_COLLECTIONS,
  PAGINATION_KEYS,
  CHECK_RUNS_TOTAL_FIELD,
  FROZEN_HEAD,
  FROZEN_TREE,
  FROZEN_BRANCH,
  PR366_HEAD,
  PR366_TREE,
  PR366_BASE_SHA,
  AUTHORITY_CONTROLLING,
  AUTHORITY_PREDECESSOR,
  PR379_REVIEW_FACTS,
  PR379_COMMENT_FACTS,
  PR379_CHECK_FACTS,
  MANAGED_MARKERS,
  canonicalSerialize,
  digestValue,
  sha256Text,
  createRecoveryDecision,
  validateDecision,
  validateCanonicalStateV5,
  buildRecoveryTargetState,
  buildPostMergeEpochFinalisationStageATargetState,
  buildPostMergeEpochFinalisationStageBTargetState,
  createPostMergeEpochFinalisationDecision,
  buildPostMergeEpochFinalisationSourceBinding,
  validateFinalisationDecision,
  validatePostMergeEpochFinalisationEvidence,
  previewPostMergeEpochFinalisation,
  buildPostMergeEpochFinalisationOperationDescriptor,
  classifyPostMergeEpochFinalisationCheckpoint,
  validatePostMergeEpochFinalisationReadback,
  buildFinalisationPaginationEvidence,
  deriveProjectionV5: programmeV5.deriveProjectionV5,
  renderProgrammeV5,
  parseParentV5Body,
  parseChildV5Body,
  parseProgrammeV5Body,
  validateEvidence,
  validateProviderEvidence,
  buildPaginationEvidence,
  classifyPartialState,
  buildReceiptOperationDescriptor,
  verifyBootstrapWorkspaceProof,
  validateControllerBootstrap,
  projectionBootstrapRecovery,
  postMergeEpochFinalisation,
  programmeV5,
});
