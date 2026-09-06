use serde::{Deserialize, Serialize};
use serde_json::Value as SerdeValue;

use crate::canonical::{JsonValue, canonical_serde_bytes, parse_canonical, to_serde};
use crate::crypto::{constant_time_eq, hex_encode, sha256_digest, sha256_hex};
use crate::error::{BrokerError, CanonicalError, DecodeError, DecodeErrorKind};

pub const SCHEMA_ID: &str = "toolkit.github-program.broker-ipc.v1";
pub const FRAME_LENGTH_BYTES: usize = 4;
pub const MAX_FRAME_PAYLOAD_BYTES: usize = 64 * 1024;
pub const REQUEST_ID_BYTES: usize = 16;
pub const REQUEST_ID_HEX_LENGTH: usize = REQUEST_ID_BYTES * 2;
pub const MAX_IDENTIFIER_BYTES: usize = 160;
pub const MAX_DIGEST_BYTES: usize = 64;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub enum OperationKind {
    #[serde(rename = "READBACK_INSPECTION")]
    ReadbackInspection,
    #[serde(rename = "ALLOCATE_RUN")]
    AllocateRun,
    #[serde(rename = "START_RUN")]
    StartRun,
    #[serde(rename = "APPEND_RECEIPT")]
    AppendReceipt,
    #[serde(rename = "INTERRUPT_RUN")]
    InterruptRun,
    #[serde(rename = "MUTATION_ADMIT")]
    MutationAdmit,
    #[serde(rename = "MUTATION_DISPATCH")]
    MutationDispatch,
    #[serde(rename = "MUTATION_OUTCOME")]
    MutationOutcome,
    #[serde(rename = "MUTATION_RECONCILE")]
    MutationReconcile,
    #[serde(rename = "ORPHAN_RECOVERY")]
    OrphanRecovery,
    #[serde(rename = "MIGRATE_V2_TO_V3")]
    MigrateV2ToV3,
}

impl OperationKind {
    pub const ALL: [Self; 11] = [
        Self::ReadbackInspection,
        Self::AllocateRun,
        Self::StartRun,
        Self::AppendReceipt,
        Self::InterruptRun,
        Self::MutationAdmit,
        Self::MutationDispatch,
        Self::MutationOutcome,
        Self::MutationReconcile,
        Self::OrphanRecovery,
        Self::MigrateV2ToV3,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ReadbackInspection => "READBACK_INSPECTION",
            Self::AllocateRun => "ALLOCATE_RUN",
            Self::StartRun => "START_RUN",
            Self::AppendReceipt => "APPEND_RECEIPT",
            Self::InterruptRun => "INTERRUPT_RUN",
            Self::MutationAdmit => "MUTATION_ADMIT",
            Self::MutationDispatch => "MUTATION_DISPATCH",
            Self::MutationOutcome => "MUTATION_OUTCOME",
            Self::MutationReconcile => "MUTATION_RECONCILE",
            Self::OrphanRecovery => "ORPHAN_RECOVERY",
            Self::MigrateV2ToV3 => "MIGRATE_V2_TO_V3",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RequestOperation {
    pub kind: OperationKind,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub schema: String,
    pub request_id: String,
    pub operation: RequestOperation,
}

impl Request {
    pub fn validate(&self) -> Result<(), BrokerError> {
        if self.schema != SCHEMA_ID {
            return Err(BrokerError::InvalidSchema);
        }
        validate_request_id(&self.request_id)?;
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum SuccessValue {
    #[serde(rename = "READBACK_INSPECTION")]
    ReadbackInspection { state_digest: String },
    #[serde(rename = "ALLOCATE_RUN")]
    AllocateRun {
        allocation_id: String,
        allocation_digest: String,
    },
    #[serde(rename = "START_RUN")]
    StartRun {
        run_id: String,
        start_digest: String,
    },
    #[serde(rename = "APPEND_RECEIPT")]
    AppendReceipt { receipt_id: String, sequence: u64 },
    #[serde(rename = "INTERRUPT_RUN")]
    InterruptRun { interrupt_id: String },
    #[serde(rename = "MUTATION_ADMIT")]
    MutationAdmit {
        operation_id: String,
        operation_digest: String,
    },
    #[serde(rename = "MUTATION_DISPATCH")]
    MutationDispatch {
        operation_id: String,
        dispatch_digest: String,
    },
    #[serde(rename = "MUTATION_OUTCOME")]
    MutationOutcome {
        operation_id: String,
        outcome_digest: String,
    },
    #[serde(rename = "MUTATION_RECONCILE")]
    MutationReconcile {
        operation_id: String,
        reconciliation_digest: String,
    },
    #[serde(rename = "ORPHAN_RECOVERY")]
    OrphanRecovery {
        recovery_id: String,
        evidence_digest: String,
    },
    #[serde(rename = "MIGRATE_V2_TO_V3")]
    MigrateV2ToV3 {
        migration_id: String,
        migration_digest: String,
    },
}

impl SuccessValue {
    pub const fn kind(&self) -> OperationKind {
        match self {
            Self::ReadbackInspection { .. } => OperationKind::ReadbackInspection,
            Self::AllocateRun { .. } => OperationKind::AllocateRun,
            Self::StartRun { .. } => OperationKind::StartRun,
            Self::AppendReceipt { .. } => OperationKind::AppendReceipt,
            Self::InterruptRun { .. } => OperationKind::InterruptRun,
            Self::MutationAdmit { .. } => OperationKind::MutationAdmit,
            Self::MutationDispatch { .. } => OperationKind::MutationDispatch,
            Self::MutationOutcome { .. } => OperationKind::MutationOutcome,
            Self::MutationReconcile { .. } => OperationKind::MutationReconcile,
            Self::OrphanRecovery { .. } => OperationKind::OrphanRecovery,
            Self::MigrateV2ToV3 { .. } => OperationKind::MigrateV2ToV3,
        }
    }

    pub fn validate(&self) -> Result<(), BrokerError> {
        match self {
            Self::ReadbackInspection { state_digest } => validate_digest(state_digest),
            Self::AllocateRun {
                allocation_id,
                allocation_digest,
            } => {
                validate_identifier(allocation_id)?;
                validate_digest(allocation_digest)
            }
            Self::StartRun {
                run_id,
                start_digest,
            } => {
                validate_identifier(run_id)?;
                validate_digest(start_digest)
            }
            Self::AppendReceipt {
                receipt_id,
                sequence,
            } => {
                validate_digest(receipt_id)?;
                if *sequence == 0 || *sequence > 128 {
                    return Err(BrokerError::InvalidValue);
                }
                Ok(())
            }
            Self::InterruptRun { interrupt_id } => validate_identifier(interrupt_id),
            Self::MutationAdmit {
                operation_id,
                operation_digest,
            }
            | Self::MutationDispatch {
                operation_id,
                dispatch_digest: operation_digest,
            }
            | Self::MutationOutcome {
                operation_id,
                outcome_digest: operation_digest,
            }
            | Self::MutationReconcile {
                operation_id,
                reconciliation_digest: operation_digest,
            } => {
                validate_identifier(operation_id)?;
                validate_digest(operation_digest)
            }
            Self::OrphanRecovery {
                recovery_id,
                evidence_digest,
            } => {
                validate_identifier(recovery_id)?;
                validate_digest(evidence_digest)
            }
            Self::MigrateV2ToV3 {
                migration_id,
                migration_digest,
            } => {
                validate_identifier(migration_id)?;
                validate_digest(migration_digest)
            }
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ResponseResult {
    pub operation: OperationKind,
    pub value: SuccessValue,
    pub result_digest: String,
}

impl ResponseResult {
    pub fn validate(&self) -> Result<(), BrokerError> {
        if self.operation != self.value.kind() {
            return Err(BrokerError::ResultValueKindMismatch);
        }
        self.value.validate()?;
        validate_digest(&self.result_digest)?;
        if self.result_digest != result_digest(self.operation, &self.value)? {
            return Err(BrokerError::ResultDigestMismatch);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ResponseError {
    pub code: String,
}

impl ResponseError {
    pub fn validate(&self) -> Result<(), BrokerError> {
        if self.code.is_empty()
            || self.code.len() > 96
            || !self.code.bytes().all(|byte| {
                byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_' || byte == b'-'
            })
        {
            return Err(BrokerError::InvalidResponse);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    pub schema: String,
    pub request_id: String,
    pub result: Option<ResponseResult>,
    pub error: Option<ResponseError>,
}

impl Response {
    pub fn success(
        request_id: String,
        operation: OperationKind,
        value: SuccessValue,
    ) -> Result<Self, BrokerError> {
        let result = ResponseResult {
            operation,
            value,
            result_digest: String::new(),
        };
        let mut response = Self {
            schema: SCHEMA_ID.to_owned(),
            request_id,
            result: Some(result),
            error: None,
        };
        let result = response
            .result
            .as_mut()
            .ok_or(BrokerError::InvalidResponse)?;
        result.result_digest = result_digest(result.operation, &result.value)?;
        response.validate()?;
        Ok(response)
    }

    pub fn failure(request_id: String, code: impl Into<String>) -> Self {
        Self {
            schema: SCHEMA_ID.to_owned(),
            request_id,
            result: None,
            error: Some(ResponseError { code: code.into() }),
        }
    }

    pub fn validate(&self) -> Result<(), BrokerError> {
        if self.schema != SCHEMA_ID {
            return Err(BrokerError::InvalidSchema);
        }
        validate_request_id(&self.request_id)?;
        match (&self.result, &self.error) {
            (Some(result), None) => result.validate(),
            (None, Some(error)) => error.validate(),
            _ => Err(BrokerError::InvalidResponse),
        }
    }

    pub fn validate_for_request(&self, request: &Request) -> Result<(), BrokerError> {
        request.validate()?;
        self.validate()?;
        if self.request_id != request.request_id {
            return Err(BrokerError::RequestIdMismatch);
        }
        if let Some(result) = &self.result {
            if result.operation != request.operation.kind {
                return Err(BrokerError::ResultOperationMismatch);
            }
            if result.value.kind() != request.operation.kind {
                return Err(BrokerError::ResultValueKindMismatch);
            }
        }
        Ok(())
    }
}

pub fn result_digest(
    operation: OperationKind,
    value: &SuccessValue,
) -> Result<String, BrokerError> {
    let result = SerdeValue::Object(serde_json::Map::from_iter([
        (
            "operation".to_owned(),
            SerdeValue::String(operation.as_str().to_owned()),
        ),
        (
            "value".to_owned(),
            serde_json::to_value(value).map_err(|_| BrokerError::InvalidValue)?,
        ),
    ]));
    let bytes = canonical_serde_bytes(&result).map_err(|_| BrokerError::InvalidValue)?;
    Ok(sha256_hex(&bytes))
}

pub fn encode_frame(payload: &[u8]) -> Result<Vec<u8>, BrokerError> {
    if payload.len() > MAX_FRAME_PAYLOAD_BYTES || payload.len() > u32::MAX as usize {
        return Err(BrokerError::InvalidValue);
    }
    let mut frame = Vec::with_capacity(FRAME_LENGTH_BYTES + payload.len());
    frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    frame.extend_from_slice(payload);
    Ok(frame)
}

pub fn encode_request(request: &Request) -> Result<Vec<u8>, BrokerError> {
    request.validate()?;
    let value = serde_json::to_value(request).map_err(|_| BrokerError::InvalidRequest)?;
    let bytes = canonical_serde_bytes(&value).map_err(|_| BrokerError::InvalidRequest)?;
    encode_frame(&bytes)
}

pub fn encode_response(response: &Response) -> Result<Vec<u8>, BrokerError> {
    response.validate()?;
    let value = serde_json::to_value(response).map_err(|_| BrokerError::InvalidResponse)?;
    let bytes = canonical_serde_bytes(&value).map_err(|_| BrokerError::InvalidResponse)?;
    encode_frame(&bytes)
}

pub fn decode_request_frame(frame: &[u8]) -> Result<Request, DecodeError> {
    let payload = frame_payload(frame)?;
    let parsed = parse_canonical(payload).map_err(map_canonical_error)?;
    let request_id = extract_valid_request_id(&parsed)?;
    let converted = to_serde(&parsed).map_err(|_| {
        DecodeError::with_request_id(DecodeErrorKind::ConversionFailed, request_id.clone())
    })?;
    let request = serde_json::from_value::<Request>(converted).map_err(|_| {
        DecodeError::with_request_id(DecodeErrorKind::NestedDecodeFailed, request_id.clone())
    })?;
    request
        .validate()
        .map_err(|_| DecodeError::with_request_id(DecodeErrorKind::SemanticInvalid, request_id))?;
    Ok(request)
}

pub fn decode_response_frame(frame: &[u8]) -> Result<Response, DecodeError> {
    let payload = frame_payload(frame)?;
    let parsed = parse_canonical(payload).map_err(map_canonical_error)?;
    let converted =
        to_serde(&parsed).map_err(|_| DecodeError::new(DecodeErrorKind::ConversionFailed))?;
    let response = serde_json::from_value::<Response>(converted)
        .map_err(|_| DecodeError::new(DecodeErrorKind::NestedDecodeFailed))?;
    response
        .validate()
        .map_err(|_| DecodeError::new(DecodeErrorKind::SemanticInvalid))?;
    Ok(response)
}

pub fn frame_payload(frame: &[u8]) -> Result<&[u8], DecodeError> {
    if frame.len() < FRAME_LENGTH_BYTES {
        return Err(DecodeError::new(DecodeErrorKind::FrameTooShort));
    }
    let declared = u32::from_be_bytes(frame[..FRAME_LENGTH_BYTES].try_into().unwrap()) as usize;
    if declared > MAX_FRAME_PAYLOAD_BYTES {
        return Err(DecodeError::new(DecodeErrorKind::FrameOversized));
    }
    let expected = FRAME_LENGTH_BYTES
        .checked_add(declared)
        .ok_or_else(|| DecodeError::new(DecodeErrorKind::FrameOversized))?;
    if frame.len() != expected {
        return Err(DecodeError::new(DecodeErrorKind::FrameTruncated));
    }
    Ok(&frame[FRAME_LENGTH_BYTES..])
}

pub fn extract_valid_request_id(value: &JsonValue) -> Result<String, DecodeError> {
    let JsonValue::Object(members) = value else {
        return Err(DecodeError::new(DecodeErrorKind::MissingRequestId));
    };
    let key = crate::canonical::JsonString::from_text("request_id");
    let Some((_, JsonValue::String(request_id))) =
        members.iter().find(|(member_key, _)| member_key == &key)
    else {
        return Err(DecodeError::new(DecodeErrorKind::MissingRequestId));
    };
    let Ok(request_id) = request_id.to_plain_string() else {
        return Err(DecodeError::new(DecodeErrorKind::InvalidRequestId));
    };
    if validate_request_id(&request_id).is_err() {
        return Err(DecodeError::new(DecodeErrorKind::InvalidRequestId));
    }
    Ok(request_id)
}

pub fn validate_request_id(value: &str) -> Result<(), BrokerError> {
    if value.len() != REQUEST_ID_HEX_LENGTH
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(BrokerError::InvalidRequestId);
    }
    Ok(())
}

pub fn validate_identifier(value: &str) -> Result<(), BrokerError> {
    if value.is_empty()
        || value.len() > MAX_IDENTIFIER_BYTES
        || value.starts_with('-')
        || value.contains("..")
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._:/-".contains(&byte))
    {
        return Err(BrokerError::InvalidIdentifier);
    }
    Ok(())
}

pub fn validate_digest(value: &str) -> Result<(), BrokerError> {
    if value.len() != MAX_DIGEST_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(BrokerError::InvalidDigest);
    }
    Ok(())
}

fn map_canonical_error(error: CanonicalError) -> DecodeError {
    let kind = match error {
        CanonicalError::InvalidUtf8 => DecodeErrorKind::InvalidUtf8,
        CanonicalError::Malformed
        | CanonicalError::NumberInvalid
        | CanonicalError::ValueInvalid => DecodeErrorKind::MalformedJson,
        CanonicalError::DuplicateKey => DecodeErrorKind::DuplicateKey,
        CanonicalError::NonCanonical => DecodeErrorKind::NonCanonicalJson,
        CanonicalError::LoneSurrogate => DecodeErrorKind::MalformedJson,
    };
    DecodeError::new(kind)
}

#[allow(dead_code)]
fn _constant_time_digest_check(left: &str, right: &str) -> bool {
    constant_time_eq(left.as_bytes(), right.as_bytes())
}

#[allow(dead_code)]
fn _digest_bytes_for_identity(value: &[u8]) -> String {
    hex_encode(&sha256_digest(value))
}
