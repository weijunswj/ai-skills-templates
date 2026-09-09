'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const programme = require('../scripts/toolkit-github-program-state-v5.cjs');
const governance = require('../scripts/toolkit-github-governance-review-reconciler.cjs');

const projectRoot = path.resolve(__dirname, '..', '..');
const contractRoot = path.join(projectRoot, 'repo', 'contracts');
const clone = (value) => JSON.parse(JSON.stringify(value));
const sha = (letter) => String(letter).repeat(40);
const digest = (letter) => String(letter).repeat(64);

function genericState(options = {}) {
  const epochs = options.epochs || [{ id: 'P1', name: 'Build', purpose: 'Build the package.', terminal_disposition: null, evidence_ref: null }];
  return {
    schema: 'example.program.state.v1',
    repository: 'example-co/managed-product',
    parent: { issue: 71, title: 'Managed Product Programme', goal: 'Deliver a useful managed product.' },
    children: [
      {
        issue: 72, order: 1, title: 'Finished foundation', lifecycle: 'COMPLETED',
        summary: 'The foundation is complete.', objective: 'Complete the foundation.', scope: ['Foundation work'],
        boundaries: ['Keep the foundation closed.'], out_of_scope: ['Later packages'], done_when: ['Accepted evidence exists.'],
        eli5: 'The foundation is done.', finality: { state: 'MERGED' },
        epochs: [{ id: 'F1', name: 'Foundation', purpose: 'Complete the foundation.', terminal_disposition: 'ACCEPTED', evidence_ref: 'foundation-accepted' }],
        pr_registry: [],
      },
      {
        issue: 73, order: 2, title: 'Current delivery package', lifecycle: 'CURRENT',
        summary: 'The current package is being delivered.', objective: 'Deliver the current package.', scope: ['Current package scope'],
        boundaries: ['Current package boundary'], out_of_scope: ['Future package'], done_when: ['The package is accepted.'],
        eli5: 'This is the package being worked on.', finality: { state: 'UNMERGED' },
        epochs, holds: options.holds || [], pr_registry: options.prRegistry || [],
      },
      {
        issue: 74, order: 3, title: 'Queued follow-up', lifecycle: 'QUEUED',
        summary: 'The follow-up waits in order.', objective: 'Deliver the follow-up.', scope: ['Follow-up scope'],
        boundaries: ['Follow-up boundary'], out_of_scope: ['Unplanned work'], done_when: ['Follow-up accepted.'],
        eli5: 'This work waits its turn.', finality: { state: 'HELD' },
        epochs: [{ id: 'Q1', name: 'Follow-up', purpose: 'Deliver the follow-up.', terminal_disposition: null, evidence_ref: null }],
        pr_registry: [],
      },
    ],
    prs: options.prs || [],
    evidence_refs: [
      { id: 'foundation-accepted', kind: 'WEB', reference: 'example:evidence:foundation', summary: 'The foundation was accepted by the controller.' },
      ...(options.evidence_refs || []),
    ],
    active_lanes: options.active_lanes || [],
    historical_transitions: [],
  };
}

function descriptor(number, purpose, evidenceRefs = [], extra = {}) {
  return {
    changed_surfaces: ['Human-readable programme surfaces.'],
    child_issue: 359,
    design_constraints: ['Intermediate work does not complete the child.'],
    eli5: 'This record explains why the change exists.',
    evidence_refs: evidenceRefs,
    number,
    out_of_scope: ['Live provider mutation.'],
    purpose,
    scope: ['Deterministic presentation and history.'],
    summary: purpose,
    validation_requirements: ['Focused conformance tests.'],
    ...extra,
  };
}
function candidate(seed) {
  return {
    repository: 'weijunswj/ai-agent-toolkit',
    branch: 'codex/history-' + seed,
    base_ref: 'main',
    base_sha: sha('a'),
    head: sha(seed === '383' ? 'b' : 'c'),
    tree: sha(seed === '383' ? 'd' : 'e'),
    version: '2.10.9',
  };
}
function historyDecision(source) {
  const immutable = programme.humanHistoryImmutableDigest(source);
  return programme.createHumanSurfaceConformanceDecision({
    root: 'S2-PRE-E4-HUMAN-READABLE-PROGRAMME-SURFACES-001',
    lock: 'DL-S2-PRE-E4-HUMAN-READABLE-PROGRAMME-SURFACES-001',
    repository: source.repository,
    source: {
      schema: source.schema,
      canonical_digest: programme.digestValue(source),
      immutable_digest: immutable,
      state: source,
    },
    authority: {
      kind: 'USER_WEB_CONTROLLER', repository: source.repository, issue: 384,
      comment_id: 5603390557, body_digest: digest('f'),
    },
    history_additions: {
      prs: [
        descriptor(379, 'Retained and later retired candidate chronology.', ['pr379-history']),
        descriptor(383, 'Accepted merged supporting finalisation implementation.', ['pr383-history']),
      ],
      registry: [{
        child_issue: 359,
        entry: {
          accepted_evidence_ref: 'pr383-history', candidate: candidate('383'), completes_child: false, draft: false,
          epoch_id: 'E3', github_state: 'MERGED', merged: true, pr: 383, retention_evidence_ref: null,
          retirement_evidence_ref: null, role: 'INTERMEDIATE', status: 'ACCEPTED',
        },
      }],
      evidence_refs: [
        { id: 'recovery-g2-web-authority', kind: 'WEB', reference: 'example:evidence:366', summary: 'The historical retirement authority for the earlier candidate was accepted.' },
        { id: 'pr379-history', kind: 'WEB', reference: 'example:evidence:379', summary: 'PR #379 was retained chronology and later closed by authority.' },
        { id: 'pr383-history', kind: 'WEB', reference: 'example:evidence:383', summary: 'PR #383 is the accepted merged supporting finalisation implementation.' },
      ],
      historical_transitions: [],
    },
    accepted_candidate_identities: [{ pr_number: 383, candidate: candidate('383') }],
    invariants: {
      immutable_digest: immutable,
      allowed_paths: programme.HUMAN_HISTORY_ALLOWED_PATHS,
      provider_evidence_observational_only: true,
      no_provider_target_rebase: true,
      no_state_movement: true,
    },
  });
}

test('generic presentation model is portable, deterministic, and free of Toolkit literals', () => {
  const source = genericState();
  const model = programme.buildPresentationModel(source);
  const first = programme.renderPresentationModel(model, 'parent');
  const second = programme.renderPresentationModel(source, 'parent');
  assert.equal(first.ok, true, first.code);
  assert.equal(second.ok, true, second.code);
  assert.equal(first.body, second.body);
  assert.doesNotMatch(first.body, /AI-AGENT-TOOLKIT|SQAG|Swooshz Platform|weijunswj\/ai-agent-toolkit/);
  assert.match(first.body, /# Managed Product Programme/);
  assert.match(first.body, /#73 - Current delivery package/);
  assert.doesNotMatch(first.body, /secret=|password=|api[_ -]?key=/i);
  const escapedSource = genericState();
  escapedSource.children[1].summary = 'A\\B | C';
  const escaped = programme.renderPresentationModel(escapedSource, 'parent');
  assert.equal(escaped.ok, true, escaped.code);
  assert.ok(escaped.body.includes('A\\\\B \\| C'));
  assert.equal(programme.parsePresentationBody(first.body, 'parent').ok, true);
  assert.equal(Object.isFrozen(model), true);
});

test('parent renderer shows ordered work packages, one next action, and conditional hold without lane noise', () => {
  const source = genericState({ holds: [{ active: true, blocks_normal_lanes: true, id: 'hold-1', evidence_ref: null, summary: 'Wait for a controller window.' }] });
  const rendered = programme.renderPresentationModel(source, 'parent');
  assert.equal(rendered.ok, true, rendered.code);
  assert.equal((rendered.body.match(/## Immediate next/g) || []).length, 1);
  assert.match(rendered.body, /COMPLETED \| #72/);
  assert.match(rendered.body, /CURRENT \| #73/);
  assert.match(rendered.body, /QUEUED \| #74/);
  assert.match(rendered.body, /## Completed work/);
  assert.match(rendered.body, /Active hold: Wait for a controller window/);
  assert.doesNotMatch(rendered.body, /normal active lanes|Active normal lanes/i);
  assert.doesNotMatch(rendered.body, /## PR history/);
  assert.equal((rendered.body.match(/\| COMPLETED \| #72 - /g) || []).length, 1);
  assert.equal((rendered.body.match(/\| CURRENT \| #73 - /g) || []).length, 1);
  assert.equal((rendered.body.match(/\| QUEUED \| #74 - /g) || []).length, 1);
});

test('epoch states cover accepted, pending, active, amend, and rejected with evidence-backed outcomes', () => {
  const states = [
    ['ACCEPTED', { terminal_disposition: 'ACCEPTED', evidence_ref: 'accepted' }, []],
    ['PENDING', { terminal_disposition: null, evidence_ref: null }, []],
    ['ACTIVE', { terminal_disposition: null, evidence_ref: null }, [{ child_issue: 73, epoch_id: 'P1', gate: 'G3', gate_result: 'RUNNING' }]],
    ['AMEND', { terminal_disposition: 'AMEND', evidence_ref: 'amend' }, []],
    ['REJECTED', { terminal_disposition: 'REJECTED', evidence_ref: 'rejected' }, []],
  ];
  for (const [expected, epoch, lanes] of states) {
    const source = genericState({ epochs: [{ id: 'P1', name: 'Phase', purpose: 'Do the phase.', ...epoch }], active_lanes: lanes, evidence_refs: [
      { id: 'accepted', kind: 'WEB', reference: 'example:accepted', summary: 'The phase was accepted.' },
      { id: 'amend', kind: 'WEB', reference: 'example:amend', summary: 'The phase needs amendment.' },
      { id: 'rejected', kind: 'WEB', reference: 'example:rejected', summary: 'The phase was rejected.' },
    ] });
    const rendered = programme.renderPresentationModel(source, 'child');
    assert.equal(rendered.ok, true, expected + ': ' + rendered.code + ' ' + rendered.reason);
    assert.match(rendered.body, new RegExp('\\| ' + expected + ' \\|'));
    if (expected === 'ACTIVE') assert.match(rendered.body, /Active: RUNNING/);
    if (expected === 'PENDING') assert.match(rendered.body, /Do the phase\. remains to be completed/);
  }
  const missing = genericState({ epochs: [{ id: 'P1', name: 'Phase', purpose: 'Do the phase.', terminal_disposition: 'ACCEPTED', evidence_ref: 'missing' }] });
  const failed = programme.renderPresentationModel(missing, 'child');
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'HUMAN_EPOCH_EVIDENCE_MISSING');
});

test('human history decision adds #379 and #383 without moving canonical lifecycle or phase truth', () => {
  const source = clone(programme.FINALISATION_STAGE_B_TARGET_STATE);
  const before = {
    parent: clone(source.parent),
    children: source.children.map((child) => ({ issue: child.issue, order: child.order, lifecycle: child.lifecycle, finality: child.finality, epochs: child.epochs, holds: child.holds, dependencies: child.dependencies, scope: child.scope, objective: child.objective, done_when: child.done_when })),
    active_lanes: clone(source.active_lanes),
  };
  const decision = historyDecision(source);
  const valid = programme.validateHumanSurfaceConformanceDecision(decision);
  assert.equal(valid.ok, true, valid.code);
  const provider = programme.createHumanSurfaceConformanceEvidence({
    decision_digest: programme.digestValue(decision), source_canonical_digest: programme.digestValue(source), repository: source.repository,
    observations: [{ pr_number: 383, state: 'MERGED', merged: true, head: candidate('383').head, tree: candidate('383').tree, base: candidate('383').base_sha, revision: 'rev-383' }],
    readback: { complete: true, exact: true }, provider_evidence_observational_only: true, target_rebase: false,
  });
  assert.equal(programme.validateHumanSurfaceConformanceEvidence(provider, decision).ok, true);
  const target = programme.deriveHumanSurfaceHistoryTarget({ source, decision, provider_evidence: provider });
  assert.equal(target.ok, true, target.code + ' ' + target.reason);
  assert.equal(programme.validateHistoryOnlyDelta(source, target.state, decision).ok, true);
  assert.deepEqual({ parent: target.state.parent, children: target.state.children.map((child) => ({ issue: child.issue, order: child.order, lifecycle: child.lifecycle, finality: child.finality, epochs: child.epochs, holds: child.holds, dependencies: child.dependencies, scope: child.scope, objective: child.objective, done_when: child.done_when })), active_lanes: target.state.active_lanes }, before);
  const rendered = programme.renderHumanPresentation(source, { history_decision: decision });
  assert.equal(rendered.ok, true, rendered.code + ' ' + rendered.reason);
  assert.match(rendered.parent, /E3 - E3 - GitHub Programme Product/);
  assert.match(rendered.parent, /Next phase: E4/);
  assert.match(rendered.child, /\| E3 \|/);
  assert.match(rendered.child, /\| E4 \|.*\| PENDING \|/);
  assert.match(rendered.child, /#379/);
  assert.match(rendered.child, /Retained and later retired candidate chronology/);
  assert.match(rendered.child, /RETIRED \/ CLOSED/);
  assert.match(rendered.child, /#383/);
  assert.match(rendered.child, /ACCEPTED \/ MERGED/);
  assert.match(rendered.child, /accepted merged supporting finalisation implementation/i);
  assert.doesNotMatch(rendered.parent, /## PR history/);
  assert.equal(programme.parseHumanParentBody(rendered.parent).ok, true);
  assert.equal(programme.parseHumanChildBody(rendered.child).ok, true);
});

test('PR history renders retained, superseded, and non-convergent dispositions from registry evidence', () => {
  const entries = [
    ['retained', 91, 'RETAINED', 'OPEN'],
    ['superseded', 92, 'SUPERSEDED', 'CLOSED'],
    ['nonconvergent', 93, 'NON_CONVERGENT', 'CLOSED'],
  ].map(([evidence_ref, pr, status, github_state]) => ({
    accepted_evidence_ref: null, completes_child: false, epoch_id: 'P1', github_state, merged: false,
    pr, retirement_evidence_ref: null, retention_evidence_ref: evidence_ref, role: 'INTERMEDIATE', status,
  }));
  const source = genericState({
    prRegistry: entries,
    prs: entries.map((entry) => descriptor(entry.pr, 'Authoritative purpose for PR #' + String(entry.pr) + '.', ['pr-' + String(entry.pr)], { child_issue: 73 })),
    evidence_refs: entries.map((entry) => ({ id: entry.retention_evidence_ref, kind: 'WEB', reference: 'example:' + entry.retention_evidence_ref, summary: 'Authority recorded the ' + entry.status.toLowerCase() + ' disposition.' })),
  });
  const rendered = programme.renderPresentationModel(source, 'child');
  assert.equal(rendered.ok, true, rendered.code + ' ' + rendered.reason);
  assert.match(rendered.body, /#91.*RETAINED \/ OPEN/);
  assert.match(rendered.body, /#92.*SUPERSEDED \/ CLOSED/);
  assert.match(rendered.body, /#93.*NON_CONVERGENT \/ CLOSED/);
  assert.match(rendered.body, /Authority recorded the retained disposition/);
});

test('missing material PR descriptor fails closed', () => {
  const source = genericState({ prRegistry: [{ accepted_evidence_ref: null, completes_child: false, epoch_id: 'P1', pr: 99, retirement_evidence_ref: null, role: 'INTERMEDIATE', status: 'RETIRED', github_state: 'CLOSED' }] });
  const rendered = programme.renderPresentationModel(source, 'child');
  assert.equal(rendered.ok, false);
  assert.equal(rendered.code, 'HUMAN_PR_DESCRIPTOR_MISSING');
});

test('PR renderer has stable normal order, no inferred repair boilerplate, explicit optional sections, and number binding', () => {
  const descriptorInput = descriptor(null, 'Implement the current human-readable programme surfaces.', ['surface-evidence'], {
    child_issue: 73, changed_surfaces: ['Behavioural programme projection.', 'Deterministic PR history.'],
    scope: ['Portable model and managed renderers.'], out_of_scope: ['Provider client and live mutation.'],
    validation_requirements: ['Focused matrix passes.'], eli5: 'The change gives the programme a readable story.',
    position: { parent: 71, child: 73, epoch: 'P1', gate: 'G3', role: 'INTERMEDIATE', completes_child: false, current_status: 'PENDING' },
    next_action: 'Return the exact head to the controller.', applicability: { eli5: false },
  });
  const pre = programme.renderHumanPrBody(descriptorInput, { phase: 'pre-number' });
  assert.equal(pre.ok, true, pre.code);
  const headings = ['## Summary', '## Programme position', '## What changed', '## Why', '## Scope', '## Out of scope', '## Validation', '## Candidate / lineage', '## Final status / what happens next'];
  let cursor = -1;
  for (const heading of headings) { const next = pre.body.indexOf(heading); assert.ok(next > cursor, heading); cursor = next; }
  assert.match(pre.body, /PR number: pending provider assignment/);
  assert.doesNotMatch(pre.body, /Repair history|Before \/ after|Repair budget|Hosted qualification|Recovery-specific evidence/);
  assert.equal(programme.parseHumanPrBody(pre.body).ok, true);
  const post = programme.bindHumanPrNumber(descriptorInput, 901);
  assert.equal(post.ok, true, post.code);
  assert.equal(post.model.number, 901);
  assert.match(post.body, /PR number: #901/);
  assert.equal(programme.parseHumanPrBody(post.body, { number: 901 }).ok, true);
  assert.equal(programme.verifyHumanPrBodyIdentity(post.body, post.model).ok, true);
  const optional = programme.renderHumanPrBody({ ...descriptorInput, applicability: { repair_history: true, before_after: true, repair_budget: true, hosted_qualification: true, recovery_evidence: true }, repair_history: ['One bounded repair.'], before_after: ['Before and after are both source-derived.'], repair_budget: ['Budget is explicit.'], hosted_qualification: ['Hosted proof remains pending.'], recovery_evidence: ['Recovery evidence is separately bound.'] }, { phase: 'pre-number' });
  assert.equal(optional.ok, true, optional.code);
  for (const heading of ['## Repair history', '## Before / after', '## Repair budget', '## Hosted qualification', '## Recovery-specific evidence']) assert.match(optional.body, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('history trust boundary rejects provider purpose or target fields and target rebases', () => {
  const source = clone(programme.FINALISATION_STAGE_B_TARGET_STATE);
  const decision = historyDecision(source);
  const providerInput = {
    decision_digest: programme.digestValue(decision), source_canonical_digest: programme.digestValue(source), repository: source.repository,
    observations: [], readback: { complete: true, exact: true }, provider_evidence_observational_only: true, target_rebase: false,
  };
  const withPurpose = { ...providerInput, purpose: 'provider supplied intent' };
  assert.equal(programme.validateHumanSurfaceConformanceEvidence(withPurpose, decision).ok, false);
  const rebased = { ...providerInput, target_rebase: true };
  assert.equal(programme.validateHumanSurfaceConformanceEvidence(rebased, decision).ok, false);
  assert.throws(
    () => programme.createHumanSurfaceConformanceDecision({ ...decision, target: { lifecycle: 'COMPLETE' } }),
    (error) => error.code === 'HUMAN_HISTORY_TARGET_FORBIDDEN',
  );
  assert.doesNotMatch(fs.readFileSync(path.join(projectRoot, 'repo', 'scripts', 'toolkit-github-program-state-v5.cjs'), 'utf8'), /#384/);
});

test('legacy E3 bytes remain exact while the human Stage B view is distinct and rich', () => {
  assert.equal(programme.renderProgrammeV5(programme.FINALISATION_SOURCE_STATE).parent, programme.FINALISATION_SOURCE_RENDERED.parent);
  assert.equal(programme.renderProgrammeV5(programme.FINALISATION_STAGE_A_TARGET_STATE).parent, programme.FINALISATION_RENDERED_TARGETS.stage_a.parent);
  assert.equal(programme.renderProgrammeV5(programme.FINALISATION_STAGE_B_TARGET_STATE).child, programme.FINALISATION_RENDERED_TARGETS.stage_b.child);
  assert.equal(programme.FINALISATION_SOURCE_RENDERED.canonical_digest, programme.FINALISATION_SOURCE_CANONICAL_DIGEST);
  assert.equal(programme.FINALISATION_RENDERED_TARGETS.stage_a.canonical_digest, programme.FINALISATION_STAGE_A_CANONICAL_DIGEST);
  assert.equal(programme.FINALISATION_RENDERED_TARGETS.stage_b.canonical_digest, programme.FINALISATION_STAGE_B_CANONICAL_DIGEST);
  const decision = historyDecision(clone(programme.FINALISATION_STAGE_B_TARGET_STATE));
  const human = programme.renderHumanPresentation(programme.FINALISATION_STAGE_B_TARGET_STATE, { history_decision: decision });
  assert.equal(human.ok, true, human.code + ' ' + human.reason);
  assert.ok(human.child.length > programme.FINALISATION_RENDERED_TARGETS.stage_b.child.length);
  assert.match(human.child, /E3/);
  assert.match(human.child, /E4/);
});

test('human parsers reject duplicate, partial, mixed, unknown, and malformed bodies', () => {
  const rendered = programme.renderPresentationModel(genericState(), 'parent');
  assert.equal(rendered.ok, true);
  const body = rendered.body;
  assert.equal(programme.parsePresentationBody(body + body, 'parent').ok, false);
  assert.equal(programme.parsePresentationBody(body.replace('<!-- MANAGED-PROGRAM-PARENT:END human-v1 -->', ''), 'parent').code, 'HUMAN_PRESENTATION_PARTIAL');
  assert.equal(programme.parsePresentationBody(body.replaceAll('human-v1', 'human-v2'), 'parent').code, 'HUMAN_PRESENTATION_VERSION_UNKNOWN');
  assert.equal(programme.parsePresentationBody(body + '<!-- MANAGED-PROGRAM-PARENT:BEGIN human-v2 -->', 'parent').code, 'HUMAN_PRESENTATION_VERSION_UNKNOWN');
  assert.equal(programme.parsePresentationBody(body.replace('<!-- MANAGED-PROGRAM-PRESENTATION human-v1 ', '<!-- MANAGED-PROGRAM-PRESENTATION human-v1 !!! '), 'parent').ok, false);
  assert.equal(programme.parsePresentationBody(body + programme.MANAGED_MARKERS.child.begin, 'parent').code, 'HUMAN_PRESENTATION_MIXED_MARKERS');
});

test('new decision and evidence schemas accept canonical fixtures and reject extra provider fields', () => {
  let Ajv;
  try { Ajv = require('ajv/dist/2020').default || require('ajv/dist/2020'); } catch (_error) {
    try { Ajv = require('ajv'); } catch (_fallbackError) { return; }
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  const decisionSchema = JSON.parse(fs.readFileSync(path.join(contractRoot, 'github-program-reconciler', 'human-surface-conformance-decision-v1.schema.json'), 'utf8'));
  const evidenceSchema = JSON.parse(fs.readFileSync(path.join(contractRoot, 'github-program-reconciler', 'human-surface-conformance-evidence-v1.schema.json'), 'utf8'));
  const source = clone(programme.FINALISATION_STAGE_B_TARGET_STATE);
  const decision = historyDecision(source);
  const provider = programme.createHumanSurfaceConformanceEvidence({
    decision_digest: programme.digestValue(decision), source_canonical_digest: programme.digestValue(source), repository: source.repository,
    observations: [], readback: { complete: true, exact: true }, provider_evidence_observational_only: true, target_rebase: false,
  });
  const validDecision = ajv.compile(decisionSchema);
  const validEvidence = ajv.compile(evidenceSchema);
  assert.equal(validDecision(decision), true, JSON.stringify(validDecision.errors));
  assert.equal(validEvidence(provider), true, JSON.stringify(validEvidence.errors));
  assert.equal(ajv.compile(evidenceSchema)({ ...provider, target: {} }), false);
});

test('version alignment and governance facade expose the human surface contract', () => {
  const aligned = [
    path.join(projectRoot, 'repo', 'contracts', 'toolkit-local-bridge', 'version.json'),
    path.join(projectRoot, 'repo', 'contracts', 'toolkit-local-bridge', 'codex-plugin', 'plugin.json'),
    path.join(projectRoot, 'repo', 'contracts', 'toolkit-local-bridge', 'claude-plugin', 'plugin.json'),
    path.join(projectRoot, '.codex-plugin', 'plugin.json'), path.join(projectRoot, '.claude-plugin', 'plugin.json'),
  ];
  for (const file of aligned) assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, '2.10.9', file);
  const surface = JSON.parse(fs.readFileSync(path.join(contractRoot, 'github-program-reconciler', 'programme-surface-contract-v5.json'), 'utf8'));
  assert.equal(surface.toolkit_package_version, '2.10.9');
  assert.equal(surface.presentation.generic_renderer_portable, true);
  assert.equal(surface.history_conformance.provider_evidence_observational_only, true);
  assert.equal(typeof governance.renderHumanPresentation, 'function');
  assert.equal(governance.programmeV5.projectionBootstrapRecovery, programme.projectionBootstrapRecovery);
  assert.equal(typeof governance.programmeV5.renderHuman, 'function');
});
