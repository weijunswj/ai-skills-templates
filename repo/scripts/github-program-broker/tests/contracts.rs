use std::io::Write;
use std::process::{Command, Stdio};

use github_program_broker::canonical::{
    canonical_bytes, canonical_serde_bytes, parse, parse_canonical, to_serde,
};
use github_program_broker::crypto::{
    constant_time_eq, domain_separated_digest, hmac_sha256_hex, sha256_hex, verify_hmac_sha256_hex,
};
use github_program_broker::{
    BrokerError, DecodeErrorKind, OperationKind, Request, RequestOperation, Response, SCHEMA_ID,
    SuccessValue, decode_request_frame, decode_response_frame, encode_frame, result_digest,
};
use serde_json::Value;

const REQUEST_ID: &str = "0123456789abcdef0123456789abcdef";
const DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const D800_HEX: &str = "225c756438303022";
const D800_DIGEST: &str = "8c0c59dd0d275aadcd462a5fe12eb352cbdfeaf961eae4f85a4660521df7d2f5";
const DC00_HEX: &str = "225c756463303022";
const DC00_DIGEST: &str = "353c7370beca95e64c258c908edac60c2ab30d355ca1b5b7fc31c5bce4a4c65a";

fn request(kind: OperationKind) -> Request {
    Request {
        schema: SCHEMA_ID.to_owned(),
        request_id: REQUEST_ID.to_owned(),
        operation: RequestOperation { kind },
    }
}

fn value(kind: OperationKind) -> SuccessValue {
    match kind {
        OperationKind::ReadbackInspection => SuccessValue::ReadbackInspection {
            state_digest: DIGEST.to_owned(),
        },
        OperationKind::AllocateRun => SuccessValue::AllocateRun {
            allocation_id: "allocation-test".to_owned(),
            allocation_digest: DIGEST.to_owned(),
        },
        OperationKind::StartRun => SuccessValue::StartRun {
            run_id: "run-test".to_owned(),
            start_digest: DIGEST.to_owned(),
        },
        OperationKind::AppendReceipt => SuccessValue::AppendReceipt {
            receipt_id: DIGEST.to_owned(),
            sequence: 1,
        },
        OperationKind::InterruptRun => SuccessValue::InterruptRun {
            interrupt_id: "interrupt-test".to_owned(),
        },
        OperationKind::MutationAdmit => SuccessValue::MutationAdmit {
            operation_id: "operation-test".to_owned(),
            operation_digest: DIGEST.to_owned(),
        },
        OperationKind::MutationDispatch => SuccessValue::MutationDispatch {
            operation_id: "operation-test".to_owned(),
            dispatch_digest: DIGEST.to_owned(),
        },
        OperationKind::MutationOutcome => SuccessValue::MutationOutcome {
            operation_id: "operation-test".to_owned(),
            outcome_digest: DIGEST.to_owned(),
        },
        OperationKind::MutationReconcile => SuccessValue::MutationReconcile {
            operation_id: "operation-test".to_owned(),
            reconciliation_digest: DIGEST.to_owned(),
        },
        OperationKind::OrphanRecovery => SuccessValue::OrphanRecovery {
            recovery_id: "recovery-test".to_owned(),
            evidence_digest: DIGEST.to_owned(),
        },
        OperationKind::MigrateV2ToV3 => SuccessValue::MigrateV2ToV3 {
            migration_id: "migration-test".to_owned(),
            migration_digest: DIGEST.to_owned(),
        },
    }
}

fn success(kind: OperationKind) -> Response {
    Response::success(REQUEST_ID.to_owned(), kind, value(kind)).expect("valid success")
}

fn canonical_request_payload(kind: OperationKind) -> Vec<u8> {
    let request = request(kind);
    let json = serde_json::to_value(request).expect("request serializes");
    github_program_broker::canonical_serde_bytes(&json).expect("request canonicalizes")
}

fn frame_with_payload(payload: &[u8]) -> Vec<u8> {
    encode_frame(payload).expect("frame encodes")
}

#[test]
fn operation_matrix_has_eleven_diagonal_and_all_ordered_off_diagonal_cases() {
    assert_eq!(OperationKind::ALL.len(), 11);
    let mut diagonal = 0;
    let mut off_diagonal = 0;
    for request_kind in OperationKind::ALL {
        for response_kind in OperationKind::ALL {
            let response = success(response_kind);
            let validation = response.validate_for_request(&request(request_kind));
            if request_kind == response_kind {
                diagonal += 1;
                assert!(validation.is_ok(), "diagonal {:?}", request_kind);
            } else {
                off_diagonal += 1;
                assert_eq!(validation, Err(BrokerError::ResultOperationMismatch));
            }
        }
    }
    assert_eq!(diagonal, 11);
    assert_eq!(off_diagonal, 110);
}

#[test]
fn request_id_and_operation_binding_are_checked_at_the_request_bound_validator() {
    let request = request(OperationKind::ReadbackInspection);
    let mut wrong_id = success(OperationKind::ReadbackInspection);
    wrong_id.request_id = "fedcba9876543210fedcba9876543210".to_owned();
    assert_eq!(
        wrong_id.validate_for_request(&request),
        Err(BrokerError::RequestIdMismatch)
    );

    let internally_consistent_wrong_operation = success(OperationKind::AllocateRun);
    assert_eq!(
        internally_consistent_wrong_operation.validate_for_request(&request),
        Err(BrokerError::ResultOperationMismatch)
    );
}

#[test]
fn result_digest_only_covers_operation_and_value() {
    let response = success(OperationKind::ReadbackInspection);
    let result = response.result.as_ref().expect("success result");
    let expected = result_digest(result.operation, &result.value).expect("digest");
    assert_eq!(result.result_digest, expected);
    assert_eq!(
        result.result_digest,
        "07236f4c066f161280f77bd5807c4e6c6bf6297b59597a419e1c60b2d5475f27"
    );
}

#[test]
fn canonical_surrogate_vectors_are_independent_and_exact() {
    for (payload, expected_hex, expected_digest) in [
        (b"\"\\ud800\"".as_slice(), D800_HEX, D800_DIGEST),
        (b"\"\\udc00\"".as_slice(), DC00_HEX, DC00_DIGEST),
    ] {
        let parsed = parse_canonical(payload).expect("lone surrogate is canonical wire data");
        assert_eq!(hex(payload), expected_hex);
        assert_eq!(sha256_hex(&canonical_bytes(&parsed)), expected_digest);
        assert!(
            to_serde(&parsed).is_err(),
            "serde conversion must reject lone surrogate"
        );
    }
}

#[test]
fn canonical_parser_rejects_duplicates_noncanonical_bytes_and_preserves_pairs() {
    assert!(parse(b"{\"a\":1,\"a\":2}").is_err());
    assert!(parse_canonical(b"{ \"a\":1}").is_err());
    let pair = parse(b"\"\\ud83d\\ude00\"").expect("surrogate pair parses");
    assert_eq!(canonical_bytes(&pair), "\"\u{1f600}\"".as_bytes());
    assert_eq!(
        to_serde(&pair).expect("pair converts"),
        Value::String("\u{1f600}".to_owned())
    );
}

#[test]
fn canonical_numbers_follow_the_node_json_number_spelling() {
    for canonical in [
        b"1".as_slice(),
        b"0.000001".as_slice(),
        b"1e-7".as_slice(),
        b"1e+21".as_slice(),
    ] {
        assert!(parse_canonical(canonical).is_ok(), "{canonical:?}");
    }
    for noncanonical in [
        b"-0".as_slice(),
        b"1.0".as_slice(),
        b"1e21".as_slice(),
        b"0.0000001".as_slice(),
    ] {
        assert!(parse_canonical(noncanonical).is_err(), "{noncanonical:?}");
    }
}

#[test]
fn serde_numbers_are_normalized_to_the_node_json_number_spelling() {
    for (raw, canonical) in [
        ("-0", "0"),
        ("1.0", "1"),
        ("1e-7", "1e-7"),
        ("1e21", "1e+21"),
    ] {
        let value: Value = serde_json::from_str(raw).expect("number parses");
        assert_eq!(
            canonical_serde_bytes(&value).expect("number canonicalizes"),
            canonical.as_bytes()
        );
    }
}

#[test]
fn request_id_is_owned_only_after_all_raw_wire_prerequisites() {
    let valid = frame_with_payload(&canonical_request_payload(OperationKind::StartRun));
    assert_eq!(
        decode_request_frame(&valid)
            .expect("valid request")
            .request_id,
        REQUEST_ID
    );

    for invalid in [
        vec![0, 0, 0],
        vec![0, 1, 0, 0],
        vec![0, 0, 0, 1, b'{'],
        vec![0, 0, 0, 1, 0xff],
    ] {
        let error = decode_request_frame(&invalid).expect_err("invalid frame");
        assert_eq!(error.request_id(), None);
    }

    let mut duplicate = canonical_request_payload(OperationKind::StartRun);
    duplicate.pop();
    duplicate.extend_from_slice(b",\"request_id\":\"0123456789abcdef0123456789abcdef\"}");
    let error = decode_request_frame(&frame_with_payload(&duplicate)).expect_err("duplicate key");
    assert_eq!(error.kind, DecodeErrorKind::DuplicateKey);
    assert_eq!(error.request_id(), None);

    let mut noncanonical = canonical_request_payload(OperationKind::StartRun);
    noncanonical.insert(0, b' ');
    let error = decode_request_frame(&frame_with_payload(&noncanonical)).expect_err("noncanonical");
    assert_eq!(error.kind, DecodeErrorKind::NonCanonicalJson);
    assert_eq!(error.request_id(), None);
}

#[test]
fn valid_request_id_survives_nested_semantic_and_lone_surrogate_failures() {
    let mut nested = canonical_request_payload(OperationKind::StartRun);
    let operation_start = nested
        .iter()
        .position(|byte| *byte == b'{')
        .expect("operation object");
    nested.splice(operation_start.., b"{\"operation\":{\"kind\":1},\"request_id\":\"0123456789abcdef0123456789abcdef\",\"schema\":\"toolkit.github-program.broker-ipc.v1\"}".iter().copied());
    let nested_error =
        decode_request_frame(&frame_with_payload(&nested)).expect_err("nested failure");
    assert_eq!(nested_error.request_id(), Some(REQUEST_ID));

    let semantic_payload = b"{\"operation\":{\"kind\":\"START_RUN\"},\"request_id\":\"0123456789abcdef0123456789abcdef\",\"schema\":\"wrong\"}";
    let semantic_error =
        decode_request_frame(&frame_with_payload(semantic_payload)).expect_err("schema failure");
    assert_eq!(semantic_error.request_id(), Some(REQUEST_ID));

    for surrogate in ["\\ud800", "\\udc00"] {
        let payload = format!(
            "{{\"operation\":{{\"kind\":\"START_RUN\"}},\"request_id\":\"{REQUEST_ID}\",\"schema\":\"{SCHEMA_ID}\",\"{surrogate}\":null}}"
        );
        let value = parse(payload.as_bytes()).expect("surrogate payload parses");
        let canonical = canonical_bytes(&value);
        let error = decode_request_frame(&frame_with_payload(&canonical))
            .expect_err("surrogate conversion failure");
        assert_eq!(error.kind, DecodeErrorKind::ConversionFailed);
        assert_eq!(error.request_id(), Some(REQUEST_ID));
    }
}

#[test]
fn executable_echoes_owned_request_id_on_later_failure() {
    let payload = b"{\"operation\":{\"kind\":\"START_RUN\"},\"request_id\":\"0123456789abcdef0123456789abcdef\",\"schema\":\"toolkit.github-program.broker-ipc.v1\",\"\\ud800\":null}";
    let canonical = canonical_bytes(&parse(payload).expect("surrogate payload parses"));
    let frame = frame_with_payload(&canonical);
    let mut child = Command::new(env!("CARGO_BIN_EXE_github-program-broker"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("broker starts");
    child
        .stdin
        .take()
        .expect("broker stdin")
        .write_all(&frame)
        .expect("request writes");
    let output = child.wait_with_output().expect("broker exits");
    assert!(output.status.success());
    let response = decode_response_frame(&output.stdout).expect("failure response decodes");
    assert_eq!(response.request_id, REQUEST_ID);
    assert_eq!(response.result, None);
    assert_eq!(
        response.error.expect("failure error").code,
        "BROKER_CONVERSION_FAILED"
    );
}

#[test]
fn crypto_helpers_use_bounded_keys_domains_and_constant_time_comparison() {
    let message = b"broker-test";
    let key = b"test-key";
    let mac = hmac_sha256_hex(key, message).expect("mac");
    assert!(verify_hmac_sha256_hex(key, message, &mac).expect("verify"));
    assert!(!verify_hmac_sha256_hex(key, b"different", &mac).expect("verify"));
    assert!(!constant_time_eq(b"a", b"b"));
    assert!(constant_time_eq(b"same", b"same"));
    assert!(!constant_time_eq(&[0u8; 256], &[]));
    assert!(domain_separated_digest("request", message).is_ok());
    assert!(domain_separated_digest("request/forbidden", message).is_err());
    assert!(hmac_sha256_hex(&[0u8; 129], message).is_err());
}

fn hex(value: &[u8]) -> String {
    value.iter().map(|byte| format!("{byte:02x}")).collect()
}
