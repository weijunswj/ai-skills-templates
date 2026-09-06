use sha2::{Digest, Sha256};

use crate::error::CryptoError;

pub const MAX_HMAC_KEY_BYTES: usize = 128;
pub const MAX_DOMAIN_BYTES: usize = 64;

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

pub fn hmac_sha256(key: &[u8], message: &[u8]) -> Result<[u8; 32], CryptoError> {
    if key.is_empty() || key.len() > MAX_HMAC_KEY_BYTES {
        return Err(CryptoError::InvalidKey);
    }

    let mut block = [0u8; 64];
    if key.len() > block.len() {
        block[..32].copy_from_slice(&sha256_digest(key));
    } else {
        block[..key.len()].copy_from_slice(key);
    }

    let mut inner = [0u8; 64];
    let mut outer = [0u8; 64];
    for index in 0..64 {
        inner[index] = block[index] ^ 0x36;
        outer[index] = block[index] ^ 0x5c;
    }

    let mut inner_hasher = Sha256::new();
    inner_hasher.update(inner);
    inner_hasher.update(message);
    let inner_digest = inner_hasher.finalize();

    let mut outer_hasher = Sha256::new();
    outer_hasher.update(outer);
    outer_hasher.update(inner_digest);
    Ok(outer_hasher.finalize().into())
}

pub fn hmac_sha256_hex(key: &[u8], message: &[u8]) -> Result<String, CryptoError> {
    Ok(hex_encode(&hmac_sha256(key, message)?))
}

pub fn verify_hmac_sha256_hex(
    key: &[u8],
    message: &[u8],
    expected_hex: &str,
) -> Result<bool, CryptoError> {
    let expected = decode_hex(expected_hex);
    if expected.len() != 32 {
        return Ok(false);
    }
    Ok(constant_time_eq(&hmac_sha256(key, message)?, &expected))
}

pub fn domain_separated_digest(domain: &str, payload: &[u8]) -> Result<String, CryptoError> {
    if domain.is_empty()
        || domain.len() > MAX_DOMAIN_BYTES
        || !domain
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
    {
        return Err(CryptoError::InvalidDomain);
    }
    let mut input = Vec::with_capacity(32 + domain.len() + payload.len() + 2);
    input.extend_from_slice(b"toolkit.github-program.broker.v1\0");
    input.extend_from_slice(domain.as_bytes());
    input.push(0);
    input.extend_from_slice(payload);
    Ok(sha256_hex(&input))
}

fn decode_hex(value: &str) -> Vec<u8> {
    if !value.len().is_multiple_of(2) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Vec::new();
    }
    value
        .as_bytes()
        .chunks(2)
        .map(|pair| (hex_value(pair[0]) << 4) | hex_value(pair[1]))
        .collect()
}

fn hex_value(byte: u8) -> u8 {
    match byte {
        b'0'..=b'9' => byte - b'0',
        b'a'..=b'f' => byte - b'a' + 10,
        b'A'..=b'F' => byte - b'A' + 10,
        _ => 0,
    }
}
