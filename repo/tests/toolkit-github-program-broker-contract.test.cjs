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

test('broker schema and policy expose the exact closed Lock-008 Slice 1 contract', () => {
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


test('exact dependency, build profile and release proof wiring is retained', () => {
  const read = p => fs.readFileSync(path.join(repositoryRoot, p), 'utf8');
  const cargo = read('repo/scripts/github-program-broker/Cargo.toml');
  for (const [name, version] of Object.entries({ serde:'1.0.229', serde_json:'1.0.151', hmac:'0.13.0', sha2:'0.11.0', getrandom:'0.4.3', zeroize:'1.9.0' })) {
    assert.ok(cargo.split('\n').some(line => line.startsWith(name+' = ') && line.includes('"='+version+'"')), name);
  }
  for (const text of ['opt-level = 3', 'lto = "thin"', 'codegen-units = 1', 'panic = "abort"', 'debug = true']) assert.ok(cargo.includes(text), text);
  const workflow = read('.github/workflows/github-program-broker-release-proof.yml');
  assert.equal((workflow.match(/uses: actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/g)||[]).length, 4);
  assert.equal((workflow.match(/persist-credentials: false/g)||[]).length, 4);
  for (const text of ['windows-2022','ubuntu-24.04','x86_64-pc-windows-msvc','x86_64-unknown-linux-gnu','--locked','--all-targets --all-features','-- -D warnings','BINARY_SHA256=','BINARY_BYTES=','TREE_SHA=','CARGO_LOCK_SHA256=','STARTED_AT=','FINISHED_AT=','BINARY_UPLOAD=none','upload: never','npm run validate:all']) assert.ok(workflow.includes(text), text);
  assert.ok(!workflow.includes('upload-artifact'));
  assert.ok(!workflow.includes('security-events: write'));
});

test('the exact inline hosted SARIF adjudicator self-tests locally', () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github/workflows/github-program-broker-release-proof.yml'), 'utf8');
  const code = workflow.replace(/\r\n/g, '\n').split("          python - <<'PY'\n")[1].split('\n          PY')[0].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const result = require('node:child_process').spawnSync(process.env.BROKER_SCHEMA_PYTHON || 'python', ['-c', code], {encoding:'utf8',windowsHide:true,env:{...process.env,BROKER_SARIF_SELFTEST_ONLY:'1'}});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RUST_CODEQL_ADJUDICATOR_SELFTEST=PASS_ZERO_SECURITY_FAIL_ONE_SECURITY_CLASSIFY_DIAGNOSTICS/);
});


test('production result validator uses the validated constant-time digest path', () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'repo/scripts/github-program-broker/src/protocol.rs'), 'utf8');
  const check = source.split('pub fn check_digest(')[1].split('fn check_hash(')[0];
  assert.match(check, /validate_digest\(actual\)\?;[\s\S]*validate_digest\(expected\)\?;[\s\S]*constant_time_eq\(actual.as_bytes\(\), expected.as_bytes\(\)\)/);
  const result = source.split('impl ResponseResult {')[1].split('pub struct ResponseError')[0];
  assert.match(result, /check_digest\([\s\S]*&self.result_digest,[\s\S]*&result_digest\(self.operation, &self.value\)\?/);
});

test('Lock-008 published graph retains shared ownership and every accepted field assertion', () => {
  const crypto = require('node:crypto');
  const accepted = fixture.lock008;
  const at = (root, pointer) => pointer === '' ? root : pointer.split('/').slice(1).reduce((v, k) => v[k.replace(/~1/g, '/').replace(/~0/g, '~')], root);
  const localRoot = name => accepted.local_definition_mapping[name] ? schema.$defs[accepted.local_definition_mapping[name]] : schema;
  const resolve = node => node.$ref ? resolve(at(schema, node.$ref.slice(1))) : node;
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n')).digest('hex'), accepted.published_schema_sha256);
  assert.equal(accepted.ledger_sha256, '3d0d2d6b8ef23570a544c3ca1d1a6f23e13333da133a814c2168feb3f301ce1e');
  let closed = 0;
  for (const [name, source] of Object.entries(accepted.original_schemas)) {
    if (name !== 'broker-ipc-v1.schema.json') {
      const actual = JSON.parse(fs.readFileSync(path.join(path.dirname(schemaPath), name), 'utf8'));
      assert.deepEqual(actual, source.schema, 'shared consumer contract remains unchanged: ' + name);
    }
    function compare(node, pointer = '') {
      if (!node || typeof node !== 'object') return;
      if (node.properties && node.additionalProperties === false) {
        const target = at(localRoot(name), pointer);
        assert.deepEqual(Object.keys(target.properties).sort(), Object.keys(node.properties).sort(), name + pointer + ' closed keys');
        assert.deepEqual(target.required || [], node.required || [], name + pointer + ' presence roles');
        assert.equal(target.additionalProperties, false);
        closed++;
      }
      for (const [key, value] of Object.entries(node)) compare(value, pointer + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'));
    }
    compare(source.schema);
  }
  assert.equal(closed, 57);
  let integers = 0;
  for (const site of accepted.sites) {
    const name = path.basename(site.schema_document_path);
    const target = at(localRoot(name), site.json_pointer);
    const cid = site.canonical_constraint_id;
    assert.ok(target, site.site_id);
    if (site.presence_law === 'CONDITIONAL_OVERLAY_ON_REQUIRED_OWNER_FIELD') continue;
    if (/^(LEX|NUM|SCALAR)\./.test(cid) || cid === 'SEM.GIT_REF_UTF8_BYTES') {
      const law = accepted.canonical_constraints[cid === 'SEM.GIT_REF_UTF8_BYTES' ? 'LEX.GIT_REF_SYNTAX' : cid].standard_schema;
      const resolved = resolve(target);
      const nonnull = resolved.anyOf ? resolved.anyOf.map(resolve).find(n => n.type !== 'null') : resolved;
      for (const key of ['type', 'const', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern']) {
        if (key === 'const' && nonnull.enum?.length === 1) { assert.deepEqual(nonnull.enum[0], law.const, site.site_id); continue; }
        if (Object.hasOwn(law, key)) assert.deepEqual(key === 'enum' ? [...nonnull[key]].sort() : nonnull[key], key === 'enum' ? [...law[key]].sort() : law[key], site.site_id + ' ' + key);
      }
    }
    if (site.integer_bounds) integers++;
    for (const id of site.independent_test_vector_ids) assert.ok(accepted.vectors[id], site.site_id + ' ' + id);
  }
  assert.equal(integers, 24);
  assert.equal(accepted.static_mismatches.length, 148);
  assert.deepEqual(accepted.allowed_difference_manifest.map(x=>x.site_id), accepted.sites.filter(x=>x.mismatch_disposition!=='ALIGNED_PRESERVE').map(x=>x.site_id));
  assert.ok(accepted.static_mismatches.every(x => x.disposition === 'SCHEMA_CORRECTION_REQUIRED'));
  assert.equal(accepted.sites.filter(x => x.classification === 'SCHEMA_EXPRESSIBLE').length, 387);
  assert.equal(accepted.sites.filter(x => x.classification === 'SEMANTIC_ONLY').length, 3);
  assert.equal(Object.keys(policy.native_broker_ipc.semantic_constraints).length, 16);
  console.log('LOCK008_PUBLISHED_ASSERTIONS=390 STATIC_CORRECTIONS=148 CLOSED_OBJECTS=57 INTEGER_SITES=24');
});
