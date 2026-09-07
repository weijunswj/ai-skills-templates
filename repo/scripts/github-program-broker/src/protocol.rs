// Typed wire fields are inherited from Run-030 sections 12-14 and canonical receipt schemas.
// Integrity laws below are derived from toolkit-github-program-receipt.cjs and Web F1-F6.
use serde::{Deserialize, Serialize};
use serde_json::Value as SerdeValue;

use crate::canonical::{JsonValue, canonical_serde_bytes, parse_canonical, to_serde};
use crate::crypto::{constant_time_eq, sha256_hex};
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
pub struct Namespace {
    pub repository: String,
    pub parent_issue: u64,
    pub child_issue: u64,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExpectedState {
    #[serde(deserialize_with = "required_nullable")]
    pub state_digest: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuthorAssociation {
    Owner,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AuthoritySnapshot {
    pub child_comment_id: u64,
    pub parent_comment_id: u64,
    pub node_id: String,
    pub author_login: String,
    pub author_association: AuthorAssociation,
    pub body_digest: String,
    pub updated_at: String,
    pub update_identity_digest: String,
    pub scope_digest: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RefSnapshot {
    pub detached: bool,
    #[serde(deserialize_with = "required_nullable")]
    pub name: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StartSnapshot {
    pub base_sha: String,
    pub head_sha: String,
    pub tree_sha: String,
    pub status_digest: String,
    pub clean_worktree: bool,
    #[serde(rename = "ref")]
    pub ref_snapshot: RefSnapshot,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Candidate {
    pub pr_number: u64,
    pub branch: String,
    pub base_ref: String,
    pub base_sha: String,
    pub head_sha: String,
    pub tree_sha: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Lease {
    pub lease_id: String,
    pub fence_id: String,
    pub fence_sequence: u64,
    pub issued_at: String,
    pub expires_at: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct EvidenceRef {
    pub id: String,
    pub digest: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PayloadMutationOutcome {
    Known,
    Unknown,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReceiptPayload {
    pub classification: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "optional_nonnull")]
    pub reason_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "optional_nonnull")]
    pub outcome_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "optional_nonnull")]
    pub evidence_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "optional_nonnull")]
    pub operation_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "optional_nonnull")]
    pub detail_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "optional_nonnull")]
    pub mutation_outcome: Option<PayloadMutationOutcome>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "optional_nonnull")]
    pub evidence_refs: Option<Vec<EvidenceRef>>,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReceiptType {
    RunStarted,
    TransitionPreview,
    ExecutorTerminal,
    G4Terminal,
    RunInterrupted,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReceiptInput {
    pub receipt_type: ReceiptType,
    #[serde(deserialize_with = "required_nullable")]
    pub candidate: Option<Candidate>,
    pub payload: ReceiptPayload,
    pub created_at: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TargetIdentity {
    pub resource_type: String,
    pub resource_id: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MutationState {
    Prepared,
    InFlight,
    Applied,
    NotApplied,
    Unknown,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct OutcomeEvidence {
    pub operation_id: String,
    pub logical_operation_digest: String,
    pub adapter_identity_digest: String,
    pub target_identity: TargetIdentity,
    pub target_digest: String,
    pub provider_operation_key: String,
    pub cas_digest: String,
    pub classification: MutationState,
    #[serde(deserialize_with = "required_nullable")]
    pub observed_post_state_digest: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub rejection_digest: Option<String>,
    pub delayed_completion_excluded: bool,
    pub evidence_at: String,
    pub evidence_digest: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RunAllocation {
    pub allocation_id: String,
    pub run_id: String,
    pub lock: String,
    pub lease: Lease,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PreRecoveryEvidence {
    pub schema: String,
    pub request_id: String,
    pub repository: String,
    pub parent_issue: u64,
    pub child_issue: u64,
    pub lock: String,
    pub namespace_digest: String,
    pub old_allocation_id: String,
    pub old_run_id: String,
    pub old_allocation_digest: String,
    pub old_run_digest: String,
    pub old_lease_id: String,
    pub old_fence_id: String,
    pub old_fence_sequence: u64,
    pub old_lease_issued_at: String,
    pub old_lease_expires_at: String,
    pub old_lease_tip_event_id: String,
    pub old_lease_tip_event_digest: String,
    pub old_receipt_tip_id: String,
    pub old_receipt_tip_sequence: u64,
    pub old_receipt_tip_digest: String,
    pub old_receipt_chain_digest: String,
    pub zero_operation_count: u64,
    pub zero_operation_event_count: u64,
    pub zero_operation_inventory_digest: String,
    pub authority_digest: String,
    pub source_digest: String,
    pub start_digest: String,
    pub old_holder_classification: String,
    pub old_holder_identity_digest: String,
    pub old_holder_attestation_digest: String,
    pub recovery_peer_platform: String,
    pub recovery_peer_identity_digest: String,
    pub recovery_peer_process_incarnation_digest: String,
    pub broker_identity_digest: String,
    pub broker_key_id: String,
    pub observed_at: String,
    pub authority_observed_at: String,
    pub source_observed_at: String,
    pub start_observed_at: String,
    pub store_observed_at: String,
    pub holder_observed_at: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RecoveryRecord {
    pub schema: String,
    pub recovery_record_id: String,
    pub request_id: String,
    pub namespace_digest: String,
    pub old_allocation_id: String,
    pub old_run_id: String,
    pub old_lease_id: String,
    pub old_fence_id: String,
    pub old_fence_sequence: u64,
    pub pre_recovery_evidence: PreRecoveryEvidence,
    pub pre_recovery_evidence_digest: String,
    pub terminal_receipt_id: String,
    pub terminal_receipt_digest: String,
    pub release_event_id: String,
    pub release_event_digest: String,
    pub replacement_allocation_id: String,
    pub replacement_allocation_digest: String,
    pub replacement_run_id: String,
    pub replacement_run_digest: String,
    pub replacement_lease_id: String,
    pub replacement_fence_id: String,
    pub replacement_fence_sequence: u64,
    pub replacement_holder_attestation_id: String,
    pub replacement_holder_attestation_digest: String,
    pub new_high_water: u64,
    pub authority_digest: String,
    pub source_digest: String,
    pub start_digest: String,
    pub committed_at: String,
    pub recovery_record_digest: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReceiptRecord {
    pub schema: String,
    pub receipt_type: ReceiptType,
    pub receipt_id: String,
    pub sequence: u64,
    #[serde(deserialize_with = "required_nullable")]
    pub prior_receipt_id: Option<String>,
    pub run_id: String,
    pub allocation_id: String,
    pub repository: String,
    pub parent_issue: u64,
    pub child_issue: u64,
    pub lock: String,
    pub authority: AuthoritySnapshot,
    pub start: StartSnapshot,
    #[serde(deserialize_with = "required_nullable")]
    pub candidate: Option<Candidate>,
    pub lease: Lease,
    pub payload: ReceiptPayload,
    pub created_at: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MutationOperationKind {
    GitRefUpdate,
    ConditionalProviderUpdate,
    IdempotentSet,
    AppendCreate,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SafetyClass {
    Cas,
    Idempotent,
    AppendIdempotent,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MutationDescriptor {
    pub operation_kind: MutationOperationKind,
    pub safety_class: SafetyClass,
    pub target_identity: TargetIdentity,
    pub target_digest: String,
    pub expected_source_digest: String,
    pub cas_digest: String,
    #[serde(deserialize_with = "required_nullable")]
    pub expected_post_state_digest: Option<String>,
    pub adapter_identity_digest: String,
    #[serde(deserialize_with = "required_nullable")]
    pub retry_of_operation_id: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MutationOperation {
    pub operation_id: String,
    pub logical_operation_digest: String,
    pub run_id: String,
    pub allocation_id: String,
    pub lock: String,
    pub authority_digest: String,
    pub lease_id: String,
    pub fence_id: String,
    pub fence_sequence: u64,
    pub operation_kind: MutationOperationKind,
    pub safety_class: SafetyClass,
    pub target_identity: TargetIdentity,
    pub target_digest: String,
    pub expected_source_digest: String,
    pub cas_digest: String,
    #[serde(deserialize_with = "required_nullable")]
    pub expected_post_state_digest: Option<String>,
    pub provider_operation_key: String,
    pub adapter_identity_digest: String,
    #[serde(deserialize_with = "required_nullable")]
    pub retry_of_operation_id: Option<String>,
    pub created_at: String,
    pub operation_digest: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MutationEvent {
    pub event_id: String,
    pub operation_id: String,
    pub sequence: u64,
    #[serde(deserialize_with = "required_nullable")]
    pub prior_event_id: Option<String>,
    pub event_type: String,
    pub state: MutationState,
    pub event_at: String,
    pub authority_digest: String,
    pub provider_evidence_digest: String,
    #[serde(deserialize_with = "required_nullable")]
    pub readback_digest: Option<String>,
    pub detail_digest: String,
    pub event_digest: String,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecoveryStatus {
    RunNotFound,
    Terminal,
    UnstartedAllocationExpired,
    UnstartedAllocationActive,
    StartedLeaseExpired,
    LiveRunNotAdoptable,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum Readback {
    #[serde(rename = "NAMESPACE")]
    Namespace {
        namespace: Namespace,
        namespace_digest: String,
    },
    #[serde(rename = "RUN")]
    Run {
        allocation: RunAllocation,
        started: bool,
        #[serde(deserialize_with = "required_nullable")]
        run_started_receipt_id: Option<String>,
    },
    #[serde(rename = "RECEIPT_CHAIN")]
    ReceiptChain {
        run_id: String,
        receipts: Vec<ReceiptRecord>,
        chain_digest: String,
    },
    #[serde(rename = "MUTATION")]
    Mutation {
        operation: Box<MutationOperation>,
        state: MutationState,
        events: Vec<MutationEvent>,
    },
    #[serde(rename = "RECOVERY")]
    Recovery {
        run_id: String,
        status: RecoveryStatus,
        #[serde(deserialize_with = "required_nullable")]
        receipt_id: Option<String>,
    },
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReadbackTarget {
    #[serde(rename = "NAMESPACE")]
    Namespace,
    #[serde(rename = "RUN")]
    Run,
    #[serde(rename = "RECEIPT_CHAIN")]
    ReceiptChain,
    #[serde(rename = "MUTATION")]
    Mutation,
    #[serde(rename = "RECOVERY")]
    Recovery,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InterruptReason {
    #[serde(rename = "REQUESTED")]
    Requested,
    #[serde(rename = "BROKER_RECOVERY")]
    BrokerRecovery,
    #[serde(rename = "SHUTDOWN")]
    Shutdown,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum Operation {
    #[serde(rename = "READBACK_INSPECTION")]
    ReadbackInspection { target: ReadbackTarget },
    #[serde(rename = "ALLOCATE_RUN")]
    AllocateRun {
        authority: AuthoritySnapshot,
        start: StartSnapshot,
        #[serde(deserialize_with = "required_nullable")]
        candidate: Option<Candidate>,
        lease_ms: u64,
    },
    #[serde(rename = "START_RUN")]
    StartRun { allocation_id: String },
    #[serde(rename = "APPEND_RECEIPT")]
    AppendReceipt { receipt: ReceiptInput },
    #[serde(rename = "INTERRUPT_RUN")]
    InterruptRun { reason: InterruptReason },
    #[serde(rename = "MUTATION_ADMIT")]
    MutationAdmit { descriptor: MutationDescriptor },
    #[serde(rename = "MUTATION_DISPATCH")]
    MutationDispatch { operation_id: String },
    #[serde(rename = "MUTATION_OUTCOME")]
    MutationOutcome {
        operation_id: String,
        evidence: OutcomeEvidence,
    },
    #[serde(rename = "MUTATION_RECONCILE")]
    MutationReconcile { operation_id: String },
    #[serde(rename = "ORPHAN_RECOVERY")]
    OrphanRecovery {
        old_run_digest: String,
        evidence_digest: String,
    },
    #[serde(rename = "MIGRATE_V2_TO_V3")]
    MigrateV2ToV3 { source_schema_fingerprint: String },
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub schema: String,
    pub request_id: String,
    pub operation: Operation,
    pub namespace: Namespace,
    pub lock: String,
    pub expected: ExpectedState,
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum SuccessValue {
    #[serde(rename = "READBACK_INSPECTION")]
    ReadbackInspection {
        target: ReadbackTarget,
        readback: Readback,
    },
    #[serde(rename = "ALLOCATE_RUN")]
    AllocateRun {
        allocation: RunAllocation,
        started: bool,
        #[serde(deserialize_with = "required_nullable")]
        run_started_receipt_id: Option<String>,
    },
    #[serde(rename = "START_RUN")]
    StartRun {
        allocation: RunAllocation,
        started: bool,
        #[serde(deserialize_with = "required_nullable")]
        run_started_receipt_id: Option<String>,
    },
    #[serde(rename = "APPEND_RECEIPT")]
    AppendReceipt {
        receipt: ReceiptRecord,
        duplicate: bool,
    },
    #[serde(rename = "INTERRUPT_RUN")]
    InterruptRun {
        receipt: ReceiptRecord,
        duplicate: bool,
    },
    #[serde(rename = "MUTATION_ADMIT")]
    MutationAdmit { readback: Readback },
    #[serde(rename = "MUTATION_DISPATCH")]
    MutationDispatch { readback: Readback },
    #[serde(rename = "MUTATION_OUTCOME")]
    MutationOutcome { readback: Readback },
    #[serde(rename = "MUTATION_RECONCILE")]
    MutationReconcile { readback: Readback },
    #[serde(rename = "ORPHAN_RECOVERY")]
    OrphanRecovery {
        recovery_record: Box<RecoveryRecord>,
        replacement_allocation: RunAllocation,
    },
    #[serde(rename = "MIGRATE_V2_TO_V3")]
    MigrateV2ToV3 {
        status: String,
        source_schema_fingerprint: String,
        destination_schema_fingerprint: String,
        namespace_digest: String,
        store_binding_digest: String,
    },
}

fn required_nullable<'de, D, T>(decoder: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(decoder)
}
fn optional_nonnull<'de, D, T>(decoder: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(decoder).map(Some)
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
    if converted
        .get("schema")
        .and_then(SerdeValue::as_str)
        .is_some_and(|s| s != SCHEMA_ID)
    {
        return Err(DecodeError::with_request_id(
            DecodeErrorKind::UnsupportedSchema,
            request_id,
        ));
    }
    if converted
        .get("operation")
        .and_then(|o| o.get("kind"))
        .and_then(SerdeValue::as_str)
        .is_some_and(|s| !OperationKind::ALL.iter().any(|k| k.as_str() == s))
    {
        return Err(DecodeError::with_request_id(
            DecodeErrorKind::UnsupportedOperation,
            request_id,
        ));
    }
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
        CanonicalError::LimitViolation => DecodeErrorKind::LimitViolation,
        CanonicalError::LoneSurrogate => DecodeErrorKind::MalformedJson,
    };
    DecodeError::new(kind)
}

pub type RequestOperation = Operation;
const SAFE_INTEGER: u64 = 9_007_199_254_740_991;
type Check = Result<(), BrokerError>;
fn require(ok: bool) -> Check {
    if ok {
        Ok(())
    } else {
        Err(BrokerError::InvalidValue)
    }
}
fn json<T: Serialize>(v: &T) -> Result<SerdeValue, BrokerError> {
    serde_json::to_value(v).map_err(|_| BrokerError::InvalidValue)
}
pub fn digest_value(v: &SerdeValue) -> Result<String, BrokerError> {
    canonical_serde_bytes(v)
        .map(|b| sha256_hex(&b))
        .map_err(|_| BrokerError::InvalidValue)
}
pub fn digest_without(v: &SerdeValue, keys: &[&str]) -> Result<String, BrokerError> {
    let mut object = v.as_object().ok_or(BrokerError::InvalidValue)?.clone();
    for key in keys {
        object.remove(*key);
    }
    digest_value(&SerdeValue::Object(object))
}
pub fn check_digest(actual: &str, expected: &str) -> Check {
    validate_digest(actual)?;
    validate_digest(expected)?;
    require(constant_time_eq(actual.as_bytes(), expected.as_bytes()))
}
fn check_hash(v: &SerdeValue, key: &str) -> Check {
    check_digest(
        v[key].as_str().ok_or(BrokerError::InvalidValue)?,
        &digest_without(v, &[key])?,
    )
}
fn text(v: &SerdeValue) -> Result<&str, BrokerError> {
    v.as_str().ok_or(BrokerError::InvalidValue)
}
fn id_bound(v: &str, max: usize) -> Check {
    require(
        !v.is_empty()
            && v.len() <= max
            && !v.starts_with('-')
            && !v.contains("..")
            && v.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._:/-".contains(&b)),
    )
}
fn contract_id(s: &str, max: usize) -> Check {
    id_bound(s, max)?;
    require(s.as_bytes().first().is_some_and(u8::is_ascii_alphanumeric) && !s.contains('/'))
}
fn git_ref(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 240
        && s != "@"
        && !s.starts_with(['-', '/'])
        && !s.ends_with(['.', '/'])
        && !s.contains("..")
        && !s.contains("@{")
        && !s
            .bytes()
            .any(|b| b <= 32 || b == 127 || b"~^:?*\\[".contains(&b))
        && s.split('/')
            .all(|p| !p.is_empty() && !p.starts_with('.') && !p.ends_with(".lock"))
}
pub fn valid_timestamp(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 24
        || [4, 7, 10, 13, 16, 19, 23]
            .iter()
            .zip(b"--T::.Z")
            .any(|(i, c)| b[*i] != *c)
    {
        return false;
    }
    if b.iter()
        .enumerate()
        .any(|(i, c)| ![4, 7, 10, 13, 16, 19, 23].contains(&i) && !c.is_ascii_digit())
    {
        return false;
    }
    let n = |a: usize, z: usize| {
        b[a..z]
            .iter()
            .fold(0u32, |v, c| v * 10 + u32::from(c - b'0'))
    };
    let y = n(0, 4);
    let m = n(5, 7);
    let d = n(8, 10);
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if y.is_multiple_of(400) || (y.is_multiple_of(4) && !y.is_multiple_of(100)) {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    d > 0 && d <= days && n(11, 13) < 24 && n(14, 16) < 60 && n(17, 19) < 60
}
// Run-030's closed types are decoded first. This traversal enforces inherited
// primitive/record semantics recursively, before any outer digest is trusted.
pub fn validate_tree(v: &SerdeValue) -> Check {
    validate_tree_at(v, 0)
}
fn validate_tree_at(v: &SerdeValue, depth: usize) -> Check {
    require(depth <= 16)?;
    match v {
        SerdeValue::Number(n) => {
            require(n.as_i64().is_some_and(|n| n.unsigned_abs() <= SAFE_INTEGER))
        }
        SerdeValue::String(s) => require(s.len() <= 4096),
        SerdeValue::Array(a) => {
            require(a.len() <= 256)?;
            for x in a {
                validate_tree_at(x, depth + 1)?;
            }
            Ok(())
        }
        SerdeValue::Object(o) => {
            require(o.len() <= 64)?;
            for (k, x) in o {
                validate_tree_at(x, depth + 1)?;
                if x.is_null() {
                    continue;
                }
                if k.ends_with("_digest")
                    || k.ends_with("_fingerprint")
                    || k == "digest"
                    || k == "attestation_tag"
                    || [
                        "receipt_id",
                        "prior_receipt_id",
                        "terminal_receipt_id",
                        "old_receipt_tip_id",
                        "run_started_receipt_id",
                    ]
                    .contains(&k.as_str())
                {
                    validate_digest(text(x)?)?;
                } else if k.ends_with("_sha") || k == "executable_sha256" {
                    let t = text(x)?;
                    require(
                        t.len() == if k == "executable_sha256" { 64 } else { 40 }
                            && t.bytes()
                                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
                    )?;
                } else if k.ends_with("_at") {
                    require(valid_timestamp(text(x)?))?;
                } else if k == "repository" {
                    let t = text(x)?;
                    let parts: Vec<_> = t.split('/').collect();
                    require(
                        parts.len() == 2
                            && parts.iter().all(|p| {
                                !p.is_empty()
                                    && p.len() <= 100
                                    && p.bytes().all(|b| {
                                        b.is_ascii_lowercase()
                                            || b.is_ascii_digit()
                                            || b"_.-".contains(&b)
                                    })
                            }),
                    )?;
                } else if (k.ends_with("_id")
                    || ["lock", "id", "provider_operation_key", "reason_code"]
                        .contains(&k.as_str()))
                    && !x.is_number()
                {
                    id_bound(text(x)?, if k == "resource_id" { 512 } else { 160 })?;
                }
                if x.is_number() {
                    let n = x.as_u64().ok_or(BrokerError::InvalidValue)?;
                    require(
                        n <= SAFE_INTEGER
                            && (n > 0
                                || ["zero_operation_count", "zero_operation_event_count"]
                                    .contains(&k.as_str())),
                    )?;
                }
            }
            if let Some(x) = o.get("author_association") {
                require(x == "OWNER")?;
                let t = text(&v["author_login"])?;
                require(
                    !t.is_empty()
                        && t.len() <= 39
                        && t.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'),
                )?;
            }
            if o.contains_key("clean_worktree") {
                require(v["clean_worktree"] == true)?;
                require(if v["ref"]["detached"] == true {
                    v["ref"]["name"].is_null()
                } else {
                    git_ref(text(&v["ref"]["name"])?)
                })?;
            }
            if o.contains_key("pr_number") {
                require(git_ref(text(&v["branch"])?) && git_ref(text(&v["base_ref"])?))?;
            }
            if o.contains_key("expires_at") {
                require(text(&v["expires_at"])? > text(&v["issued_at"])?)?;
            }
            if o.contains_key("resource_type") {
                id_bound(text(&v["resource_type"])?, 80)?;
                id_bound(text(&v["resource_id"])?, 512)?;
                require(
                    canonical_serde_bytes(v)
                        .map_err(|_| BrokerError::InvalidValue)?
                        .len()
                        <= 2048,
                )?;
            }
            if o.contains_key("operation_kind") {
                validate_descriptor(v)?;
            }
            if o.contains_key("provider_operation_key") && o.contains_key("operation_digest") {
                validate_operation_record(v)?;
            }
            if o.contains_key("evidence_at") {
                validate_outcome(v)?;
            }
            if o.contains_key("event_digest") {
                check_hash(v, "event_digest")?;
            }
            if o.contains_key("receipt_type") {
                validate_receipt(v)?;
            }
            if o.contains_key("zero_operation_count") {
                validate_recovery_evidence(v)?;
            }
            if o.contains_key("recovery_record_digest") {
                validate_recovery_record(v)?;
            }
            if let Some(kind) = o.get("kind").and_then(|x| x.as_str()) {
                match kind {
                    "NAMESPACE" => check_digest(
                        text(&v["namespace_digest"])?,
                        &namespace_digest(
                            &serde_json::from_value(v["namespace"].clone())
                                .map_err(|_| BrokerError::InvalidValue)?,
                        )?,
                    )?,
                    "RUN" => require(v["started"] == !v["run_started_receipt_id"].is_null())?,
                    "RECEIPT_CHAIN" => validate_chain(v)?,
                    "MUTATION" => validate_mutation_history(v)?,
                    "RECOVERY" => require(if v["status"] == "TERMINAL" {
                        !v["receipt_id"].is_null()
                    } else {
                        v["receipt_id"].is_null()
                    })?,
                    _ => {}
                }
            }
            Ok(())
        }
        _ => Ok(()),
    }
}
fn validate_descriptor(v: &SerdeValue) -> Check {
    let (class, resource) = match text(&v["operation_kind"])? {
        "GIT_REF_UPDATE" => ("CAS", "git_ref"),
        "CONDITIONAL_PROVIDER_UPDATE" => ("CAS", "provider_resource"),
        "IDEMPOTENT_SET" => ("IDEMPOTENT", "provider_resource"),
        "APPEND_CREATE" => ("APPEND_IDEMPOTENT", "provider_collection"),
        _ => return Err(BrokerError::InvalidValue),
    };
    require(v["safety_class"] == class && v["target_identity"]["resource_type"] == resource)?;
    if v["operation_kind"] != "APPEND_CREATE" {
        require(!v["expected_post_state_digest"].is_null())?;
    }
    check_digest(
        text(&v["target_digest"])?,
        &digest_value(&v["target_identity"])?,
    )
}
fn validate_operation_record(v: &SerdeValue) -> Check {
    let logical: serde_json::Map<_, _> = [
        "operation_kind",
        "safety_class",
        "target_identity",
        "target_digest",
        "expected_post_state_digest",
        "adapter_identity_digest",
    ]
    .iter()
    .map(|k| ((*k).to_owned(), v[*k].clone()))
    .collect();
    check_digest(
        text(&v["logical_operation_digest"])?,
        &digest_value(&SerdeValue::Object(logical))?,
    )?;
    require(text(&v["provider_operation_key"])? == format!("gpr:{}", text(&v["operation_id"])?))?;
    let mut row = v.as_object().ok_or(BrokerError::InvalidValue)?.clone();
    row.remove("operation_digest");
    for (public, stored) in [
        ("lock", "lock_id"),
        ("expected_source_digest", "source_digest"),
    ] {
        let x = row.remove(public).ok_or(BrokerError::InvalidValue)?;
        row.insert(stored.to_owned(), x);
    }
    row.remove("target_identity");
    row.insert(
        "target_identity_json".to_owned(),
        SerdeValue::String(
            String::from_utf8(
                canonical_serde_bytes(&v["target_identity"])
                    .map_err(|_| BrokerError::InvalidValue)?,
            )
            .map_err(|_| BrokerError::InvalidValue)?,
        ),
    );
    check_digest(
        text(&v["operation_digest"])?,
        &digest_value(&SerdeValue::Object(row))?,
    )
}
fn validate_outcome(v: &SerdeValue) -> Check {
    check_hash(v, "evidence_digest")?;
    check_digest(
        text(&v["target_digest"])?,
        &digest_value(&v["target_identity"])?,
    )?;
    require(text(&v["provider_operation_key"])? == format!("gpr:{}", text(&v["operation_id"])?))?;
    require(
        canonical_serde_bytes(v)
            .map_err(|_| BrokerError::InvalidValue)?
            .len()
            <= 4096,
    )?;
    match text(&v["classification"])? {
        "APPLIED" => {
            require(!v["observed_post_state_digest"].is_null() && v["rejection_digest"].is_null())
        }
        "NOT_APPLIED" => require(
            v["observed_post_state_digest"].is_null()
                && !v["rejection_digest"].is_null()
                && v["delayed_completion_excluded"] == true,
        ),
        "UNKNOWN" => Ok(()),
        _ => Err(BrokerError::InvalidValue),
    }
}
fn validate_receipt(v: &SerdeValue) -> Check {
    let p = &v["payload"];
    id_bound(text(&p["classification"])?, 160)?;
    if let Some(a) = p.get("evidence_refs") {
        require(a.as_array().is_some_and(|a| a.len() <= 50))?;
    }
    require(
        canonical_serde_bytes(p)
            .map_err(|_| BrokerError::InvalidValue)?
            .len()
            <= 8192,
    )?;
    if v.get("receipt_id").is_none() {
        return require(v["receipt_type"] != "RUN_STARTED");
    }
    require(v["schema"] == RECEIPT_SCHEMA_ID)?;
    check_hash(v, "receipt_id")?;
    require(
        canonical_serde_bytes(v)
            .map_err(|_| BrokerError::InvalidValue)?
            .len()
            <= 16384,
    )?;
    require(text(&v["created_at"])? >= text(&v["lease"]["issued_at"])?)?;
    let seq = v["sequence"].as_u64().ok_or(BrokerError::InvalidValue)?;
    require((1..=128).contains(&seq))?;
    if seq == 1 {
        require(
            v["receipt_type"] == "RUN_STARTED"
                && v["prior_receipt_id"].is_null()
                && v["candidate"].is_null(),
        )
    } else {
        require(v["receipt_type"] != "RUN_STARTED" && !v["prior_receipt_id"].is_null())
    }
}
const RECEIPT_SCHEMA_ID: &str = "toolkit.github-program.run-receipt.v1";
fn terminal(v: &SerdeValue) -> bool {
    ["EXECUTOR_TERMINAL", "G4_TERMINAL", "RUN_INTERRUPTED"]
        .iter()
        .any(|x| v == *x)
}
fn validate_chain(v: &SerdeValue) -> Check {
    let a = v["receipts"].as_array().ok_or(BrokerError::InvalidValue)?;
    require(!a.is_empty() && a.len() <= 128)?;
    let mut candidate = SerdeValue::Null;
    for (i, r) in a.iter().enumerate() {
        require(r["run_id"] == v["run_id"] && r["sequence"].as_u64() == Some(i as u64 + 1))?;
        if i > 0 {
            let prev = &a[i - 1];
            require(
                r["prior_receipt_id"] == prev["receipt_id"]
                    && !terminal(&prev["receipt_type"])
                    && text(&r["created_at"])? >= text(&prev["created_at"])?,
            )?;
            for key in [
                "repository",
                "parent_issue",
                "child_issue",
                "lock",
                "run_id",
                "allocation_id",
                "authority",
                "start",
                "lease",
            ] {
                require(r[key] == prev[key])?;
            }
            if candidate.is_null() && !r["candidate"].is_null() {
                require(r["receipt_type"] == "TRANSITION_PREVIEW")?;
                candidate = r["candidate"].clone();
            } else {
                require(r["candidate"] == candidate)?;
            }
        }
    }
    check_digest(text(&v["chain_digest"])?, &digest_value(&v["receipts"])?)
}
fn validate_mutation_history(v: &SerdeValue) -> Check {
    let a = v["events"].as_array().ok_or(BrokerError::InvalidValue)?;
    require(a.len() >= 2)?;
    let op = &v["operation"];
    let mut ids = std::collections::BTreeSet::new();
    for (i, e) in a.iter().enumerate() {
        require(
            ids.insert(text(&e["event_id"])?)
                && e["operation_id"] == op["operation_id"]
                && e["sequence"].as_u64() == Some(i as u64 + 1),
        )?;
        require(
            text(&e["event_at"])?
                >= text(if i == 0 {
                    &op["created_at"]
                } else {
                    &a[i - 1]["event_at"]
                })?,
        )?;
        require(
            e["prior_event_id"]
                == if i == 0 {
                    SerdeValue::Null
                } else {
                    a[i - 1]["event_id"].clone()
                },
        )?;
        if i == 0 {
            require(e["state"] == "PREPARED" && e["event_type"] == "PREPARED")?;
        } else if i == 1 {
            require(e["state"] == "IN_FLIGHT" && e["event_type"] == "IN_FLIGHT")?;
        } else {
            require(
                ["IN_FLIGHT", "UNKNOWN"]
                    .iter()
                    .any(|s| a[i - 1]["state"] == *s)
                    && ["APPLIED", "NOT_APPLIED", "UNKNOWN"]
                        .iter()
                        .any(|s| e["state"] == *s)
                    && ["OUTCOME_RECORDED", "RECONCILED"]
                        .iter()
                        .any(|s| e["event_type"] == *s),
            )?;
        }
    }
    require(v["state"] == a.last().ok_or(BrokerError::InvalidValue)?["state"])
}
fn validate_recovery_evidence(v: &SerdeValue) -> Check {
    for k in [
        "request_id",
        "lock",
        "old_allocation_id",
        "old_run_id",
        "old_lease_id",
        "old_fence_id",
        "old_lease_tip_event_id",
    ] {
        contract_id(text(&v[k])?, 160)?;
    }
    contract_id(text(&v["broker_key_id"])?, 80)?;
    require(
        v["schema"] == "toolkit.github-program.pre-recovery-evidence.v1"
            && v["old_holder_classification"] == "ORPHAN_NONADOPTABLE"
            && v["zero_operation_count"] == 0
            && v["zero_operation_event_count"] == 0,
    )?;
    require(
        ["linux", "windows"]
            .iter()
            .any(|s| v["recovery_peer_platform"] == *s),
    )?;
    require(text(&v["old_lease_expires_at"])? > text(&v["old_lease_issued_at"])?)?;
    for k in [
        "authority_observed_at",
        "source_observed_at",
        "start_observed_at",
        "store_observed_at",
        "holder_observed_at",
    ] {
        require(text(&v[k])? <= text(&v["observed_at"])?)?;
    }
    check_digest(
        text(&v["zero_operation_inventory_digest"])?,
        &digest_value(
            &serde_json::json!({"mutation_operation_ids":[],"mutation_operation_event_ids":[],"unresolved_operation_ids":[]}),
        )?,
    )
}
fn validate_recovery_record(v: &SerdeValue) -> Check {
    for k in [
        "recovery_record_id",
        "request_id",
        "old_allocation_id",
        "old_run_id",
        "old_lease_id",
        "old_fence_id",
        "release_event_id",
        "replacement_allocation_id",
        "replacement_run_id",
        "replacement_lease_id",
        "replacement_fence_id",
        "replacement_holder_attestation_id",
    ] {
        contract_id(text(&v[k])?, 160)?;
    }
    require(v["schema"] == "toolkit.github-program.recovery-record.v1")?;
    let n = v["old_fence_sequence"]
        .as_u64()
        .ok_or(BrokerError::InvalidValue)?;
    require(
        v["replacement_fence_sequence"].as_u64() == n.checked_add(1)
            && v["new_high_water"] == v["replacement_fence_sequence"]
            && v["terminal_receipt_id"] == v["terminal_receipt_digest"],
    )?;
    let e = &v["pre_recovery_evidence"];
    check_digest(text(&v["pre_recovery_evidence_digest"])?, &digest_value(e)?)?;
    for k in [
        "request_id",
        "namespace_digest",
        "old_allocation_id",
        "old_run_id",
        "old_lease_id",
        "old_fence_id",
        "old_fence_sequence",
        "authority_digest",
        "source_digest",
        "start_digest",
    ] {
        require(v[k] == e[k])?;
    }
    check_hash(v, "recovery_record_digest")
}
pub fn namespace_digest(ns: &Namespace) -> Result<String, BrokerError> {
    digest_value(
        &serde_json::json!({"schema":RECEIPT_SCHEMA_ID,"repository":ns.repository,"parent_issue":ns.parent_issue,"child_issue":ns.child_issue}),
    )
}
impl Operation {
    pub fn kind(&self) -> OperationKind {
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
}
impl Request {
    pub fn validate(&self) -> Check {
        if self.schema != SCHEMA_ID {
            return Err(BrokerError::InvalidSchema);
        }
        validate_request_id(&self.request_id)?;
        validate_tree(&json(self)?)?;
        match &self.operation {
            Operation::AllocateRun {
                candidate,
                lease_ms,
                ..
            } => require(candidate.is_none() && (1000..=86400000).contains(lease_ms)),
            Operation::MutationOutcome {
                operation_id,
                evidence,
            } => require(operation_id == &evidence.operation_id),
            _ => Ok(()),
        }
    }
}
impl SuccessValue {
    pub fn kind(&self) -> OperationKind {
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
    pub fn validate(&self) -> Check {
        let v = json(self)?;
        validate_tree(&v)?;
        match self {
            Self::ReadbackInspection { target, .. } => {
                require(json(target)? == v["readback"]["kind"])
            }
            Self::AllocateRun {
                started,
                run_started_receipt_id,
                ..
            } => require(!started && run_started_receipt_id.is_none()),
            Self::StartRun {
                started,
                run_started_receipt_id,
                ..
            } => require(*started && run_started_receipt_id.is_some()),
            Self::AppendReceipt { receipt, .. } => {
                require(!matches!(receipt.receipt_type, ReceiptType::RunStarted))
            }
            Self::InterruptRun { receipt, .. } => {
                require(matches!(receipt.receipt_type, ReceiptType::RunInterrupted))
            }
            Self::MutationAdmit { .. } | Self::MutationDispatch { .. } => require(
                v["readback"]["kind"] == "MUTATION" && v["readback"]["state"] == "IN_FLIGHT",
            ),
            Self::MutationOutcome { .. } => require(
                v["readback"]["kind"] == "MUTATION"
                    && ["APPLIED", "NOT_APPLIED", "UNKNOWN"]
                        .iter()
                        .any(|s| v["readback"]["state"] == *s),
            ),
            Self::MutationReconcile { .. } => require(v["readback"]["kind"] == "MUTATION"),
            Self::OrphanRecovery {
                recovery_record: r,
                replacement_allocation: a,
            } => require(
                r.replacement_allocation_id == a.allocation_id
                    && r.replacement_run_id == a.run_id
                    && r.replacement_lease_id == a.lease.lease_id
                    && r.replacement_fence_id == a.lease.fence_id
                    && r.replacement_fence_sequence == a.lease.fence_sequence
                    && r.pre_recovery_evidence.lock == a.lock,
            ),
            Self::MigrateV2ToV3 { status, .. } => require(status == "MIGRATED"),
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
    pub fn validate(&self) -> Check {
        require(self.operation == self.value.kind())?;
        self.value.validate()?;
        check_digest(
            &self.result_digest,
            &result_digest(self.operation, &self.value)?,
        )
    }
}
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ResponseError {
    pub code: String,
}
pub const ERROR_CODES: [&str; 12] = [
    "BROKER_MALFORMED_FRAME",
    "BROKER_MALFORMED_REQUEST",
    "BROKER_UNSUPPORTED_SCHEMA",
    "BROKER_UNSUPPORTED_OPERATION",
    "BROKER_INVALID_FIELD",
    "BROKER_LIMIT_VIOLATION",
    "BROKER_REQUEST_CONFLICT",
    "BROKER_BUSY",
    "BROKER_STALE_EXPECTED_STATE",
    "BROKER_UNVERIFIABLE_IDENTITY",
    "BROKER_UNSUPPORTED_PLATFORM",
    "BROKER_INTERNAL_INVARIANT",
];
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Response {
    pub schema: String,
    #[serde(deserialize_with = "required_nullable")]
    pub request_id: Option<String>,
    pub ok: bool,
    #[serde(deserialize_with = "required_nullable")]
    pub result: Option<ResponseResult>,
    #[serde(deserialize_with = "required_nullable")]
    pub error: Option<ResponseError>,
}
impl Response {
    pub fn failure(request_id: Option<String>, code: impl Into<String>) -> Self {
        Self {
            schema: SCHEMA_ID.to_owned(),
            request_id,
            ok: false,
            result: None,
            error: Some(ResponseError { code: code.into() }),
        }
    }
    pub fn success(
        request_id: String,
        operation: OperationKind,
        value: SuccessValue,
    ) -> Result<Self, BrokerError> {
        let digest = result_digest(operation, &value)?;
        let s = Self {
            schema: SCHEMA_ID.to_owned(),
            request_id: Some(request_id),
            ok: true,
            result: Some(ResponseResult {
                operation,
                value,
                result_digest: digest,
            }),
            error: None,
        };
        s.validate()?;
        Ok(s)
    }
    pub fn validate(&self) -> Check {
        require(self.schema == SCHEMA_ID)?;
        if let Some(id) = &self.request_id {
            validate_request_id(id)?;
        }
        match (self.ok, &self.result, &self.error) {
            (true, Some(r), None) => {
                require(self.request_id.is_some())?;
                r.validate()
            }
            (false, None, Some(e)) => require(ERROR_CODES.contains(&e.code.as_str())),
            _ => Err(BrokerError::InvalidResponse),
        }
    }
    pub fn validate_for_request(&self, r: &Request) -> Check {
        r.validate()?;
        self.validate()?;
        require(self.request_id.as_ref() == Some(&r.request_id))?;
        if let Some(result) = &self.result {
            require(
                result.operation == r.operation.kind() && result.value.kind() == r.operation.kind(),
            )?;
        }
        Ok(())
    }
}
pub fn decode_response_for_request(
    frame: &[u8],
    request: &Request,
) -> Result<Response, DecodeError> {
    let response = decode_response_frame(frame)?;
    response
        .validate_for_request(request)
        .map_err(|_| DecodeError::new(DecodeErrorKind::SemanticInvalid))?;
    Ok(response)
}
pub fn result_digest(
    operation: OperationKind,
    value: &SuccessValue,
) -> Result<String, BrokerError> {
    digest_value(&serde_json::json!({"operation":operation,"value":value}))
}
