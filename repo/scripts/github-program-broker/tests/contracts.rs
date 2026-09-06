use github_program_broker::{canonical::*, crypto::*, protocol::*};
use serde_json::{Value, json};
use std::io::Write;
use std::process::{Command, Stdio};
fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/source-slice-1-vectors.json")).unwrap()
}
fn framed(v: &Value) -> Vec<u8> {
    encode_frame(&canonical_serde_bytes(v).unwrap()).unwrap()
}
fn rehash(v: &mut Value) {
    let r = &mut v["result"];
    r["result_digest"] =
        json!(digest_value(&json!({"operation":r["operation"],"value":r["value"]})).unwrap());
}
#[test]
fn eleven_operations_and_110_request_bound_off_diagonals() {
    let f = fixture();
    for (i, r) in f["requests"].as_array().unwrap().iter().enumerate() {
        let req = decode_request_frame(&framed(r)).unwrap();
        for (j, s) in f["responses"].as_array().unwrap().iter().enumerate() {
            assert!(decode_response_frame(&framed(s)).is_ok(), "response {j}");
            assert_eq!(
                decode_response_for_request(&framed(s), &req).is_ok(),
                i == j,
                "{i}/{j}"
            );
        }
    }
}
#[test]
fn old_stub_and_required_fields_fail_with_correct_result_hashes() {
    let f = fixture();
    for response in f["responses"].as_array().unwrap() {
        let mut stub = response.clone();
        stub["result"]["value"] =
            json!({"kind":response["result"]["operation"],"state_digest":"a".repeat(64)});
        rehash(&mut stub);
        assert!(decode_response_frame(&framed(&stub)).is_err());
        for key in response["result"]["value"].as_object().unwrap().keys() {
            let mut bad = response.clone();
            bad["result"]["value"].as_object_mut().unwrap().remove(key);
            rehash(&mut bad);
            assert!(
                decode_response_frame(&framed(&bad)).is_err(),
                "missing {key}"
            );
        }
        let mut bad = response.clone();
        bad["result"]["value"]["unexpected"] = json!(0);
        rehash(&mut bad);
        assert!(decode_response_frame(&framed(&bad)).is_err());
    }
}
#[test]
fn raw_envelope_required_null_and_id_ownership() {
    let f = fixture();
    let request = &f["requests"][0];
    let id = request["request_id"].as_str().unwrap();
    for value in [json!({}), json!({"request_id":"bad"})] {
        assert!(
            decode_request_frame(&framed(&value))
                .unwrap_err()
                .request_id()
                .is_none()
        );
    }
    for (key, value) in [
        ("operation", json!({"kind":"WRONG"})),
        ("namespace", json!({"repository":false})),
        ("expected", Value::Null),
    ] {
        let mut bad = request.clone();
        bad[key] = value;
        assert_eq!(
            decode_request_frame(&framed(&bad))
                .unwrap_err()
                .request_id(),
            Some(id)
        );
    }
    for surrogate in ["\\ud800", "\\udc00"] {
        let raw = String::from_utf8(canonical_serde_bytes(request).unwrap())
            .unwrap()
            .replace("NAMESPACE", surrogate);
        assert_eq!(
            decode_request_frame(&encode_frame(raw.as_bytes()).unwrap())
                .unwrap_err()
                .request_id(),
            Some(id)
        );
    }
    let failure = json!({"schema":SCHEMA_ID,"request_id":null,"ok":false,"result":null,"error":{"code":"BROKER_MALFORMED_REQUEST"}});
    assert!(decode_response_frame(&framed(&failure)).is_ok());
    for original in [&failure, &f["responses"][0]] {
        for key in original.as_object().unwrap().keys() {
            let mut v = original.clone();
            v.as_object_mut().unwrap().remove(key);
            assert!(decode_response_frame(&framed(&v)).is_err(), "{key}");
        }
    }
    let mut v = f["responses"][0].clone();
    v["result"] = Value::Null;
    assert!(decode_response_frame(&framed(&v)).is_err());
}
#[test]
fn independent_surrogate_and_scalar_anchors() {
    for (raw, hex, hash) in [
        (
            "\"\\ud800\"",
            "225c756438303022",
            "8c0c59dd0d275aadcd462a5fe12eb352cbdfeaf961eae4f85a4660521df7d2f5",
        ),
        (
            "\"\\udc00\"",
            "225c756463303022",
            "353c7370beca95e64c258c908edac60c2ab30d355ca1b5b7fc31c5bce4a4c65a",
        ),
    ] {
        let p = parse_canonical(raw.as_bytes()).unwrap();
        assert_eq!(hex_encode(&canonical_bytes(&p)), hex);
        assert_eq!(sha256_hex(&canonical_bytes(&p)), hash);
        assert!(to_serde(&p).is_err());
    }
    for raw in [
        "621984972275886.2",
        "\"\u{7f}\"",
        "\"\u{85}\"",
        "1e+21",
        "1e-7",
        "0.000001",
    ] {
        assert!(parse_canonical(raw.as_bytes()).is_ok(), "{raw:?}");
    }
    assert!(parse(b"{\"a\":0,\"\\u0061\":1}").is_err());
    assert!(parse_canonical(b" {\"a\":0}").is_err());
    assert_eq!(canonical_bytes(&parse(b"-0").unwrap()), b"0");
    assert_eq!(
        canonical_bytes(&parse("{\"\u{e000}\":1,\"\u{10000}\":2}".as_bytes()).unwrap()),
        "{\"\u{10000}\":2,\"\u{e000}\":1}".as_bytes()
    );
}
fn executable(frame: &[u8]) -> Value {
    let mut child = Command::new(env!("CARGO_BIN_EXE_github-program-broker"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(frame).unwrap();
    let o = child.wait_with_output().unwrap();
    assert!(o.status.success(), "executable aborted");
    assert!(o.stderr.is_empty());
    let response = decode_response_frame(&o.stdout).unwrap();
    serde_json::to_value(response).unwrap()
}
#[test]
fn hostile_nesting_debug_and_release_executable() {
    for n in [15, 16, 17, 10_000] {
        for shape in 0..3 {
            let mut raw = String::new();
            for i in 0..n {
                raw.push_str(if shape == 0 || shape == 2 && i % 2 == 0 {
                    "["
                } else {
                    "{\"a\":"
                });
            }
            raw.push('0');
            for i in (0..n).rev() {
                raw.push_str(if shape == 0 || shape == 2 && i % 2 == 0 {
                    "]"
                } else {
                    "}"
                });
            }
            assert_eq!(parse(raw.as_bytes()).is_ok(), n <= 16);
            let out = executable(&encode_frame(raw.as_bytes()).unwrap());
            assert_eq!(out["ok"], false);
            assert!(out["request_id"].is_null());
            raw.pop();
            let out = executable(&encode_frame(raw.as_bytes()).unwrap());
            assert_eq!(out["ok"], false);
        }
    }
}
#[test]
fn framing_limits_and_pre_id_responses() {
    for frame in [
        vec![],
        vec![0, 0, 0],
        vec![0, 1, 0, 1],
        vec![0, 0, 0, 2, b'{'],
        vec![0, 0, 0, 1, 255],
    ] {
        assert_eq!(executable(&frame)["request_id"], Value::Null);
    }
    for n in [65536, 65537] {
        let mut frame = (n as u32).to_be_bytes().to_vec();
        frame.extend(vec![b' '; n]);
        assert_eq!(executable(&frame)["ok"], false);
    }
    let mut duplicate =
        String::from_utf8(canonical_serde_bytes(&fixture()["requests"][0]).unwrap()).unwrap();
    duplicate.insert_str(1, "\"request_id\":\"0123456789abcdef0123456789abcdef\",");
    assert!(executable(&encode_frame(duplicate.as_bytes()).unwrap())["request_id"].is_null());
}
#[test]
fn holder_hmac_identity_and_digest_mutations() {
    let f = fixture();
    let a: HolderAttestation = serde_json::from_value(f["holder"].clone()).unwrap();
    let key = HolderKey::from_bytes([11; 32]);
    assert!(verify_holder_attestation(&a, &key).is_ok());
    assert!(verify_holder_attestation(&a, &HolderKey::from_bytes([12; 32])).is_err());
    for at in [0, 1, 63] {
        let mut a = a.clone();
        let replacement = if &a.attestation_tag[at..at + 1] == "0" {
            "1"
        } else {
            "0"
        };
        a.attestation_tag.replace_range(at..at + 1, replacement);
        a.attestation_digest = holder_attestation_digest(&a).unwrap();
        assert!(verify_holder_attestation(&a, &key).is_err());
    }
    assert!(!verify_hmac_sha256_hex(&[11; 32], b"x", &"A".repeat(64)).unwrap());
    assert!(hmac_sha256(&[0; 31], b"x").is_err());
    for at in [0, 1, 63] {
        let a = "a".repeat(64);
        let mut b = a.clone();
        b.replace_range(at..at + 1, "b");
        assert!(check_digest(&a, &b).is_err());
    }
    assert!(check_digest(&"a".repeat(64), &"a".repeat(64)).is_ok());
    assert!(check_digest("aa", &"a".repeat(64)).is_err());
    for bad in ["a".repeat(63), "A".repeat(64), "g".repeat(64)] {
        let mut response = f["responses"][0].clone();
        response["result"]["result_digest"] = json!(bad);
        assert!(decode_response_frame(&framed(&response)).is_err());
    }
    for at in [0, 1, 63] {
        let mut response = f["responses"][0].clone();
        let mut digest = response["result"]["result_digest"]
            .as_str()
            .unwrap()
            .to_owned();
        let replacement = if &digest[at..at + 1] == "0" { "1" } else { "0" };
        digest.replace_range(at..at + 1, replacement);
        response["result"]["result_digest"] = json!(digest);
        assert!(decode_response_frame(&framed(&response)).is_err());
    }

    let id = process_identity_digest("linux", 1234).unwrap();
    assert_eq!(id, a.process_id_digest);
    assert_eq!(
        process_start_identity_digest("linux", &id, 5678).unwrap(),
        a.process_start_digest
    );
    let inc: ProcessIncarnation = serde_json::from_value(f["incarnation"].clone()).unwrap();
    assert_eq!(
        process_incarnation_digest(&inc).unwrap(),
        a.process_incarnation_digest
    );
}
// Test-only batched bridge. Node supplies raw bytes and independent expectations.
#[test]
#[ignore = "invoked by the independent Node differential and raw-schema suite"]
fn external_oracle() {
    let path = std::env::var_os("BROKER_ORACLE_INPUT").unwrap();
    let rows: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let out: Vec<Value> = rows
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            let raw = row["raw"].as_str().unwrap().as_bytes();
            match row["mode"].as_str().unwrap() {
                "identity" => {
                    let v: Value = serde_json::from_slice(raw).unwrap();
                    let text = |k: &str| v[k].as_str().unwrap();
                    let result = match text("kind") {
                        "broker" => broker_identity_digest(
                            text("platform"),
                            text("executable"),
                            text("service"),
                        ),
                        "windows_principal" => windows_principal_digest(text("sid")),
                        "linux_principal" => {
                            linux_principal_digest(text("machine_id"), v["uid"].as_u64().unwrap())
                        }
                        "boot" => boot_identity_digest(text("platform"), text("identity")),
                        "pid_namespace" => {
                            pid_namespace_identity_digest(text("platform"), text("identity"))
                        }
                        "store" => store_binding_identity_digest(text("namespace"), text("store")),
                        "path" => path_binding_identity_digest(text("store"), text("path")),
                        _ => panic!("unknown identity test"),
                    };
                    json!({"digest":result.unwrap()})
                }
                "scalar" => match parse(raw) {
                    Ok(v) => json!({"canonical":String::from_utf8(canonical_bytes(&v)).unwrap()}),
                    Err(_) => json!({"error":true}),
                },
                "request" => match decode_request_frame(&encode_frame(raw).unwrap()) {
                    Ok(_) => json!({"valid":true}),
                    Err(e) => json!({"valid":false,"request_id":e.request_id()}),
                },
                "response" => {
                    let frame = encode_frame(raw).unwrap();
                    let decoded = decode_response_frame(&frame);
                    let bound = row.get("request").is_none_or(|r| {
                        decode_request_frame(&framed(r))
                            .is_ok_and(|r| decode_response_for_request(&frame, &r).is_ok())
                    });
                    json!({"valid":decoded.is_ok(),"bound":bound})
                }
                _ => panic!("invalid oracle mode"),
            }
        })
        .collect();
    println!("ORACLE_JSON={}", serde_json::to_string(&out).unwrap());
}
