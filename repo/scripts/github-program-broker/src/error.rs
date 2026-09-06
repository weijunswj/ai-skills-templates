use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrokerError {
    InvalidSchema,
    InvalidRequestId,
    InvalidOperation,
    InvalidRequest,
    InvalidResponse,
    RequestIdMismatch,
    ResultOperationMismatch,
    ResultValueKindMismatch,
    ResultDigestMismatch,
    InvalidValue,
    InvalidDigest,
    InvalidIdentifier,
    InvalidKey,
    InvalidTarget,
    InvalidDomain,
    InvalidMac,
}

impl BrokerError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidSchema => "BROKER_SCHEMA_INVALID",
            Self::InvalidRequestId => "BROKER_REQUEST_ID_INVALID",
            Self::InvalidOperation => "BROKER_OPERATION_INVALID",
            Self::InvalidRequest => "BROKER_REQUEST_INVALID",
            Self::InvalidResponse => "BROKER_RESPONSE_INVALID",
            Self::RequestIdMismatch => "BROKER_REQUEST_ID_MISMATCH",
            Self::ResultOperationMismatch => "BROKER_RESULT_OPERATION_MISMATCH",
            Self::ResultValueKindMismatch => "BROKER_RESULT_VALUE_KIND_MISMATCH",
            Self::ResultDigestMismatch => "BROKER_RESULT_DIGEST_MISMATCH",
            Self::InvalidValue => "BROKER_VALUE_INVALID",
            Self::InvalidDigest => "BROKER_DIGEST_INVALID",
            Self::InvalidIdentifier => "BROKER_IDENTIFIER_INVALID",
            Self::InvalidKey => "BROKER_KEY_INVALID",
            Self::InvalidTarget => "BROKER_TARGET_INVALID",
            Self::InvalidDomain => "BROKER_DOMAIN_INVALID",
            Self::InvalidMac => "BROKER_MAC_INVALID",
        }
    }
}

impl fmt::Display for BrokerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for BrokerError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DecodeErrorKind {
    FrameTooShort,
    FrameOversized,
    FrameTruncated,
    InvalidUtf8,
    MalformedJson,
    DuplicateKey,
    NonCanonicalJson,
    MissingRequestId,
    InvalidRequestId,
    ConversionFailed,
    NestedDecodeFailed,
    SemanticInvalid,
}

impl DecodeErrorKind {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::FrameTooShort => "BROKER_FRAME_TOO_SHORT",
            Self::FrameOversized => "BROKER_FRAME_OVERSIZED",
            Self::FrameTruncated => "BROKER_FRAME_TRUNCATED",
            Self::InvalidUtf8 => "BROKER_UTF8_INVALID",
            Self::MalformedJson => "BROKER_JSON_INVALID",
            Self::DuplicateKey => "BROKER_DUPLICATE_KEY",
            Self::NonCanonicalJson => "BROKER_JSON_NONCANONICAL",
            Self::MissingRequestId => "BROKER_REQUEST_ID_MISSING",
            Self::InvalidRequestId => "BROKER_REQUEST_ID_INVALID",
            Self::ConversionFailed => "BROKER_CONVERSION_FAILED",
            Self::NestedDecodeFailed => "BROKER_NESTED_DECODE_FAILED",
            Self::SemanticInvalid => "BROKER_SEMANTIC_INVALID",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodeError {
    pub kind: DecodeErrorKind,
    request_id: Option<String>,
}

impl DecodeError {
    pub fn new(kind: DecodeErrorKind) -> Self {
        Self {
            kind,
            request_id: None,
        }
    }

    pub fn with_request_id(kind: DecodeErrorKind, request_id: String) -> Self {
        Self {
            kind,
            request_id: Some(request_id),
        }
    }

    pub fn request_id(&self) -> Option<&str> {
        self.request_id.as_deref()
    }

    pub const fn code(&self) -> &'static str {
        self.kind.code()
    }
}

impl fmt::Display for DecodeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for DecodeError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CanonicalError {
    InvalidUtf8,
    Malformed,
    DuplicateKey,
    NonCanonical,
    LoneSurrogate,
    NumberInvalid,
    ValueInvalid,
}

impl CanonicalError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidUtf8 => "BROKER_UTF8_INVALID",
            Self::Malformed => "BROKER_JSON_INVALID",
            Self::DuplicateKey => "BROKER_DUPLICATE_KEY",
            Self::NonCanonical => "BROKER_JSON_NONCANONICAL",
            Self::LoneSurrogate => "BROKER_SURROGATE_INVALID",
            Self::NumberInvalid => "BROKER_NUMBER_INVALID",
            Self::ValueInvalid => "BROKER_VALUE_INVALID",
        }
    }
}

impl fmt::Display for CanonicalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl std::error::Error for CanonicalError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CryptoError {
    InvalidKey,
    InvalidDomain,
}

impl fmt::Display for CryptoError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidKey => "BROKER_KEY_INVALID",
            Self::InvalidDomain => "BROKER_DOMAIN_INVALID",
        })
    }
}

impl std::error::Error for CryptoError {}
