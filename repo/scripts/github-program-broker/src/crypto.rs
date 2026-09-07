use crate::error::{BrokerError, CryptoError};
use crate::protocol::{
    SCHEMA_ID, check_digest, digest_value, digest_without, valid_timestamp, validate_digest,
    validate_request_id, validate_tree,
};
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use zeroize::Zeroize;
pub fn sha256_digest(bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().into()
}

pub fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex_encode(&sha256_digest(bytes))
}

pub fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let max_len = left.len().max(right.len());
    let mut difference = u8::from(left.len() != right.len());
    for index in 0..max_len {
        let left_byte = left.get(index).copied().unwrap_or(0);
        let right_byte = right.get(index).copied().unwrap_or(0);
        difference |= left_byte ^ right_byte;
    }
    difference == 0
}

pub struct HolderKey([u8; 32]);
impl HolderKey {
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }
}
impl std::fmt::Debug for HolderKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("HolderKey([REDACTED])")
    }
}
impl Drop for HolderKey {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}
// A source-only client primitive; entropy is not authorization evidence.
pub fn new_request_id() -> Result<String, CryptoError> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| CryptoError::InvalidKey)?;
    Ok(hex_encode(&bytes))
}
pub fn hmac_sha256(key: &[u8], message: &[u8]) -> Result<[u8; 32], CryptoError> {
    if key.len() != 32 {
        return Err(CryptoError::InvalidKey);
    }
    let mut mac = Hmac::<Sha256>::new_from_slice(key).map_err(|_| CryptoError::InvalidKey)?;
    mac.update(message);
    Ok(mac.finalize().into_bytes().into())
}
pub fn hmac_sha256_hex(key: &[u8], message: &[u8]) -> Result<String, CryptoError> {
    Ok(hex_encode(&hmac_sha256(key, message)?))
}
pub fn verify_hmac_sha256_hex(
    key: &[u8],
    message: &[u8],
    expected: &str,
) -> Result<bool, CryptoError> {
    if key.len() != 32 {
        return Err(CryptoError::InvalidKey);
    }
    let Some(bytes) = decode_digest(expected) else {
        return Ok(false);
    };
    let mut mac = Hmac::<Sha256>::new_from_slice(key).map_err(|_| CryptoError::InvalidKey)?;
    mac.update(message);
    Ok(mac.verify_slice(&bytes).is_ok())
}
fn decode_digest(s: &str) -> Option<[u8; 32]> {
    if validate_digest(s).is_err() {
        return None;
    }
    let digit = |b: u8| if b <= b'9' { b - b'0' } else { b - b'a' + 10 };
    let mut out = [0u8; 32];
    for (i, pair) in s.as_bytes().as_chunks::<2>().0.iter().enumerate() {
        out[i] = digit(pair[0]) * 16 + digit(pair[1]);
    }
    Some(out)
}
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HolderAttestation {
    pub schema: String,
    pub attestation_id: String,
    pub algorithm: String,
    pub key_id: String,
    pub platform: String,
    pub repository: String,
    pub parent_issue: u64,
    pub child_issue: u64,
    pub lock: String,
    pub allocation_id: String,
    pub allocation_digest: String,
    pub run_id: String,
    pub run_digest: String,
    pub lease_id: String,
    pub fence_id: String,
    pub fence_sequence: u64,
    pub authority_digest: String,
    pub start_digest: String,
    pub broker_identity_digest: String,
    pub process_id_digest: String,
    pub process_start_digest: String,
    pub boot_id_digest: String,
    pub pid_namespace_digest: String,
    pub process_incarnation_digest: String,
    pub lease_issued_at: String,
    pub lease_expires_at: String,
    pub attestation_digest: String,
    pub attestation_tag: String,
}
fn invalid() -> BrokerError {
    BrokerError::InvalidValue
}
fn ensure(b: bool) -> Result<(), BrokerError> {
    if b { Ok(()) } else { Err(invalid()) }
}
fn platform(s: &str) -> Result<(), BrokerError> {
    ensure(matches!(s, "windows" | "linux"))
}
fn identity_text(s: &str) -> Result<(), BrokerError> {
    ensure(!s.is_empty() && s.len() <= 4096 && !s.chars().any(char::is_control))
}
impl HolderAttestation {
    pub fn validate(&self) -> Result<(), BrokerError> {
        platform(&self.platform)?;
        validate_request_id(&self.key_id)?;
        ensure(
            self.schema == "toolkit.github-program.holder-attestation.v1"
                && self.algorithm == "HMAC-SHA-256",
        )?;
        ensure(
            valid_timestamp(&self.lease_issued_at)
                && valid_timestamp(&self.lease_expires_at)
                && self.lease_expires_at > self.lease_issued_at,
        )?;
        for s in [
            &self.attestation_id,
            &self.lock,
            &self.allocation_id,
            &self.run_id,
            &self.lease_id,
            &self.fence_id,
        ] {
            ensure(
                s.as_bytes().first().is_some_and(u8::is_ascii_alphanumeric)
                    && !s.contains('/')
                    && !s.contains(".."),
            )?;
        }
        validate_tree(&serde_json::to_value(self).map_err(|_| invalid())?)
    }
}
fn holder_payload(a: &HolderAttestation) -> Result<Vec<u8>, BrokerError> {
    a.validate()?;
    let mut v = serde_json::to_value(a).map_err(|_| invalid())?;
    let o = v.as_object_mut().ok_or_else(invalid)?;
    o.remove("attestation_tag");
    o.remove("attestation_digest");
    let mut bytes = b"toolkit.github-program.holder-attestation-tag.v1\0".to_vec();
    bytes.extend(crate::canonical::canonical_serde_bytes(&v).map_err(|_| invalid())?);
    Ok(bytes)
}
pub fn holder_tag(a: &HolderAttestation, key: &HolderKey) -> Result<String, BrokerError> {
    hmac_sha256_hex(&key.0, &holder_payload(a)?).map_err(|_| invalid())
}
pub fn holder_attestation_digest(a: &HolderAttestation) -> Result<String, BrokerError> {
    a.validate()?;
    digest_without(
        &serde_json::to_value(a).map_err(|_| invalid())?,
        &["attestation_digest"],
    )
}
pub fn sign_holder_attestation(
    mut a: HolderAttestation,
    key: &HolderKey,
) -> Result<HolderAttestation, BrokerError> {
    a.attestation_tag = holder_tag(&a, key)?;
    a.attestation_digest = holder_attestation_digest(&a)?;
    Ok(a)
}
pub fn verify_holder_attestation(
    a: &HolderAttestation,
    key: &HolderKey,
) -> Result<(), BrokerError> {
    ensure(
        verify_hmac_sha256_hex(&key.0, &holder_payload(a)?, &a.attestation_tag)
            .map_err(|_| invalid())?,
    )?;
    check_digest(&a.attestation_digest, &holder_attestation_digest(a)?)
}
pub fn broker_identity_digest(
    p: &str,
    executable_sha256: &str,
    service_identity: &str,
) -> Result<String, BrokerError> {
    platform(p)?;
    validate_digest(executable_sha256)?;
    identity_text(service_identity)?;
    digest_value(
        &json!({"schema":"toolkit.github-program.broker-identity.v1","platform":p,"protocol":SCHEMA_ID,"executable_sha256":executable_sha256,"service_identity":service_identity}),
    )
}
pub fn windows_principal_digest(sid: &str) -> Result<String, BrokerError> {
    let parts: Vec<_> = sid.split('-').collect();
    ensure(
        parts.len() >= 4
            && parts[0] == "S"
            && parts[1] == "1"
            && parts[2..].iter().all(|p| {
                !p.is_empty()
                    && p.bytes().all(|b| b.is_ascii_digit())
                    && (p.len() == 1 || !p.starts_with('0'))
            }),
    )?;
    digest_value(&json!([
        "toolkit.github-program.principal.v1",
        "windows",
        sid
    ]))
}
pub fn linux_principal_digest(machine_id: &str, uid: u64) -> Result<String, BrokerError> {
    validate_request_id(machine_id)?;
    // UID is a bounded kernel uid_t; canonical native counters elsewhere use strings.
    ensure(uid <= u32::MAX as u64)?;
    digest_value(
        &json!(["toolkit.github-program.principal.v1","linux",{"machine_id":machine_id,"uid":uid.to_string()}]),
    )
}
pub fn process_identity_digest(p: &str, pid: u64) -> Result<String, BrokerError> {
    platform(p)?;
    ensure(pid > 0)?;
    digest_value(&json!([
        "toolkit.github-program.process-id.v1",
        p,
        pid.to_string()
    ]))
}
pub fn process_start_identity_digest(
    p: &str,
    process_id_digest: &str,
    start: u64,
) -> Result<String, BrokerError> {
    platform(p)?;
    validate_digest(process_id_digest)?;
    digest_value(
        &json!({"schema":"toolkit.github-program.process-start-identity.v1","platform":p,"process_id_digest":process_id_digest,"process_start":start.to_string()}),
    )
}
pub fn boot_identity_digest(p: &str, boot: &str) -> Result<String, BrokerError> {
    platform(p)?;
    identity_text(boot)?;
    digest_value(&json!(["toolkit.github-program.boot-identity.v1", p, boot]))
}
pub fn pid_namespace_identity_digest(p: &str, ns: &str) -> Result<String, BrokerError> {
    platform(p)?;
    identity_text(ns)?;
    digest_value(&json!([
        "toolkit.github-program.pid-namespace-identity.v1",
        p,
        ns
    ]))
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProcessIncarnation {
    pub platform: String,
    pub principal_digest: String,
    pub process_id_digest: String,
    pub process_start_digest: String,
    pub boot_id_digest: String,
    pub pid_namespace_digest: String,
    pub session_peer_scope: String,
}
pub fn process_incarnation_digest(v: &ProcessIncarnation) -> Result<String, BrokerError> {
    platform(&v.platform)?;
    identity_text(&v.session_peer_scope)?;
    for d in [
        &v.principal_digest,
        &v.process_id_digest,
        &v.process_start_digest,
        &v.boot_id_digest,
        &v.pid_namespace_digest,
    ] {
        validate_digest(d)?;
    }
    let mut out = serde_json::to_value(v).map_err(|_| invalid())?;
    out.as_object_mut().ok_or_else(invalid)?.insert(
        "schema".into(),
        json!("toolkit.github-program.process-incarnation.v1"),
    );
    digest_value(&out)
}
pub fn store_binding_identity_digest(namespace: &str, store: &str) -> Result<String, BrokerError> {
    validate_digest(namespace)?;
    validate_digest(store)?;
    digest_value(&json!([
        "toolkit.github-program.store-binding.v1",
        namespace,
        store
    ]))
}
pub fn path_binding_identity_digest(store: &str, path: &str) -> Result<String, BrokerError> {
    validate_digest(store)?;
    validate_digest(path)?;
    digest_value(&json!([
        "toolkit.github-program.path-binding.v1",
        store,
        path
    ]))
}
