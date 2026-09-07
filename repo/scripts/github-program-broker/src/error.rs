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
            Self::InvalidSchema => "BROKER_UNSUPPORTED_SCHEMA",
            Self::InvalidRequestId => "BROKER_INVALID_FIELD",
            Self::InvalidOperation => "BROKER_UNSUPPORTED_OPERATION",
            Self::InvalidRequest => "BROKER_INVALID_FIELD",
            Self::InvalidResponse => "BROKER_INVALID_FIELD",
            Self::RequestIdMismatch => "BROKER_INVALID_FIELD",
            Self::ResultOperationMismatch => "BROKER_INVALID_FIELD",
            Self::ResultValueKindMismatch => "BROKER_INVALID_FIELD",
            Self::ResultDigestMismatch => "BROKER_INVALID_FIELD",
            Self::InvalidValue => "BROKER_INVALID_FIELD",
            Self::InvalidDigest => "BROKER_INVALID_FIELD",
            Self::InvalidIdentifier => "BROKER_INVALID_FIELD",
            Self::InvalidKey => "BROKER_INVALID_FIELD",
            Self::InvalidTarget => "BROKER_INVALID_FIELD",
            Self::InvalidDomain => "BROKER_INVALID_FIELD",
            Self::InvalidMac => "BROKER_INVALID_FIELD",
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
    LimitViolation,
    UnsupportedSchema,
    UnsupportedOperation,
}

impl DecodeErrorKind {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::FrameTooShort => "BROKER_MALFORMED_FRAME",
            Self::FrameOversized => "BROKER_LIMIT_VIOLATION",
            Self::FrameTruncated => "BROKER_MALFORMED_FRAME",
            Self::InvalidUtf8 => "BROKER_MALFORMED_REQUEST",
            Self::MalformedJson => "BROKER_MALFORMED_REQUEST",
            Self::DuplicateKey => "BROKER_MALFORMED_REQUEST",
            Self::NonCanonicalJson => "BROKER_MALFORMED_REQUEST",
            Self::MissingRequestId => "BROKER_INVALID_FIELD",
            Self::InvalidRequestId => "BROKER_INVALID_FIELD",
            Self::ConversionFailed => "BROKER_INVALID_FIELD",
            Self::NestedDecodeFailed => "BROKER_INVALID_FIELD",
            Self::SemanticInvalid => "BROKER_INVALID_FIELD",
            Self::LimitViolation => "BROKER_LIMIT_VIOLATION",
            Self::UnsupportedSchema => "BROKER_UNSUPPORTED_SCHEMA",
            Self::UnsupportedOperation => "BROKER_UNSUPPORTED_OPERATION",
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
    LimitViolation,
}

impl CanonicalError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidUtf8 => "BROKER_MALFORMED_REQUEST",
            Self::Malformed => "BROKER_MALFORMED_REQUEST",
            Self::DuplicateKey => "BROKER_MALFORMED_REQUEST",
            Self::NonCanonical => "BROKER_MALFORMED_REQUEST",
            Self::LoneSurrogate => "BROKER_INVALID_FIELD",
            Self::NumberInvalid => "BROKER_INVALID_FIELD",
            Self::ValueInvalid => "BROKER_INVALID_FIELD",
            Self::LimitViolation => "BROKER_LIMIT_VIOLATION",
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
            Self::InvalidKey => "BROKER_INVALID_FIELD",
            Self::InvalidDomain => "BROKER_INVALID_FIELD",
        })
    }
}

impl std::error::Error for CryptoError {}
