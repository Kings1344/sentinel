//! Sentinel Vault — on-chain intent enforcement for AI agents.
//!
//! One deployment = one owner's vault holding native NEAR. The owner commits Intent Capsules
//! (what a specific agent may pay, to whom, how much, until when). Registered agents can only
//! *request* transfers; the contract re-checks every field of every request against the capsule
//! and releases funds only when all checks pass. Policy violations are recorded and returned,
//! never panicked, so the audit trail survives. See docs/SECURITY_MODEL.md.

use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    assert_one_yocto, env, log, near, require, AccountId, BorshStorageKey, Gas, NearToken,
    PanicOnDefault, Promise, PromiseOrValue, PromiseResult,
};

pub const OP_NATIVE_TRANSFER: &str = "native_transfer";
pub const ASSET_NEAR: &str = "NEAR";
pub const COMMITMENT_DOMAIN: &str = "sentinel-capsule-v1";
pub const MAX_INSTRUCTION_BYTES: usize = 500;
pub const MAX_MEMO_BYTES: usize = 256;
pub const MAX_LABEL_BYTES: usize = 64;
pub const MIN_CAPSULE_TTL_MS: u64 = 10_000;
pub const MAX_CAPSULE_TTL_MS: u64 = 30 * 24 * 60 * 60 * 1000;
pub const AUDIT_CAPACITY: u64 = 500;
pub const REQUEST_CAPACITY: u64 = 500;
pub const MAX_PAGE: u64 = 100;
/// Untrusted agent strings are stored and logged clipped to these sizes (storage-amplification guard).
pub const MAX_FIELD_BYTES: usize = 64;
pub const MAX_EXPLANATION_BYTES: usize = 600;
pub const MAX_DETAIL_BYTES: usize = 300;
/// Settlement callback budget. Generous on purpose: a callback that runs out of gas would leave funds reserved.
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(25);
const EVENT_STANDARD: &str = "sentinel";
const EVENT_VERSION: &str = "1.0.0";

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Agents,
    Capsules,
    Requests,
    Audit,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgentStatus {
    Active,
    Suspended,
    Revoked,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CapsuleStatus {
    Active,
    Revoked,
    Exhausted,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Approved,
    Blocked,
    RequiresHumanReview,
    Expired,
    Revoked,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RequestStatus {
    Rejected,
    PendingReview,
    PendingTransfer,
    Executed,
    TransferFailed,
    ReviewRejected,
}

impl RequestStatus {
    pub fn is_pending(&self) -> bool {
        matches!(self, RequestStatus::PendingReview | RequestStatus::PendingTransfer)
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReasonCode {
    Authorized,
    OwnerApproved,
    VaultFrozen,
    AgentSuspended,
    AgentRevoked,
    CapsuleNotFound,
    CapsuleAgentMismatch,
    CapsuleRevoked,
    CapsuleExhausted,
    CapsuleExpired,
    NonceReplay,
    NonceOutOfOrder,
    OperationMismatch,
    AssetMismatch,
    RecipientMismatch,
    InvalidAmount,
    AmountExceedsTxLimit,
    CumulativeLimitExceeded,
    InvalidMemo,
    InsufficientVaultBalance,
    ReviewThresholdExceeded,
    OwnerRejected,
    ReviewInvalidated,
    TransferFailed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Agent {
    pub account_id: AccountId,
    pub label: String,
    pub status: AgentStatus,
    pub registered_at_ms: U64,
    pub approved_count: u32,
    pub blocked_count: u32,
    pub capsule_ids: Vec<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Capsule {
    pub id: u64,
    pub version: u32,
    pub supersedes: Option<u64>,
    pub agent_id: AccountId,
    pub operation: String,
    pub asset: String,
    pub recipient: AccountId,
    pub max_per_tx: U128,
    pub max_total: U128,
    pub review_threshold: Option<U128>,
    pub instruction: String,
    pub created_at_ms: U64,
    pub expires_at_ms: U64,
    pub status: CapsuleStatus,
    pub spent: U128,
    pub reserved: U128,
    pub last_nonce: U64,
    pub commitment: String,
}

/// What the owner signs when creating a capsule.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct CapsuleInput {
    pub agent_id: AccountId,
    pub operation: String,
    pub asset: String,
    pub recipient: AccountId,
    pub max_per_tx: U128,
    pub max_total: U128,
    pub review_threshold: Option<U128>,
    pub expires_at_ms: U64,
    pub instruction: String,
    /// If set, creation fails unless the on-chain commitment equals this value
    /// ("what you reviewed is what gets committed").
    pub expected_commitment: Option<String>,
}

/// Canonical committed terms. Field order is part of the commitment format; it MUST match
/// packages/engine/src/commitment.ts.
#[near(serializers = [json])]
pub struct CommitmentPayload {
    pub domain: String,
    pub vault: AccountId,
    pub owner: AccountId,
    pub agent_id: AccountId,
    pub operation: String,
    pub asset: String,
    pub recipient: AccountId,
    pub max_per_tx: U128,
    pub max_total: U128,
    pub review_threshold: Option<U128>,
    pub expires_at_ms: U64,
    pub instruction: String,
    pub version: u32,
    pub supersedes: Option<u64>,
}

/// What an agent submits. Strings (not AccountId) so malformed attacker input is recorded
/// as a rejection instead of failing deserialization.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct TransferRequest {
    pub capsule_id: u64,
    pub nonce: u64,
    pub operation: String,
    pub asset: String,
    pub recipient: String,
    pub amount: U128,
    pub memo: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Check {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Evaluation {
    pub request_id: u64,
    pub decision: Decision,
    pub reason: ReasonCode,
    pub explanation: String,
    pub status: RequestStatus,
    pub checks: Vec<Check>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct RequestRecord {
    pub id: u64,
    pub capsule_id: u64,
    pub agent_id: AccountId,
    pub nonce: U64,
    pub operation: String,
    pub asset: String,
    pub recipient: String,
    pub amount: U128,
    pub memo: Option<String>,
    pub decision: Decision,
    pub reason: ReasonCode,
    pub explanation: String,
    pub status: RequestStatus,
    pub created_at_ms: U64,
    pub block_height: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct AuditEvent {
    pub seq: U64,
    pub kind: String,
    pub actor: AccountId,
    pub capsule_id: Option<u64>,
    pub request_id: Option<u64>,
    pub detail: String,
    pub timestamp_ms: U64,
}

#[near(serializers = [json])]
pub struct Overview {
    pub owner: AccountId,
    pub frozen: bool,
    pub vault_balance: U128,
    pub total_reserved: U128,
    pub contract_balance: U128,
    pub agent_count: u32,
    pub capsule_count: u64,
    pub request_count: u64,
    pub approved_total: u64,
    pub blocked_total: u64,
    pub executed_total: u64,
    pub failed_total: u64,
    pub audit_count: u64,
}

pub struct Verdict {
    pub decision: Decision,
    pub reason: ReasonCode,
    pub explanation: String,
    pub checks: Vec<Check>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SentinelVault {
    owner: AccountId,
    frozen: bool,
    /// NEAR deposited by the owner that is neither reserved nor spent nor withdrawn.
    vault_balance: u128,
    /// NEAR reserved for approved-but-unsettled transfers and pending reviews.
    total_reserved: u128,
    agents: IterableMap<AccountId, Agent>,
    capsules: LookupMap<u64, Capsule>,
    capsule_count: u64,
    requests: LookupMap<u64, RequestRecord>,
    request_count: u64,
    audit: LookupMap<u64, AuditEvent>,
    audit_count: u64,
    approved_total: u64,
    blocked_total: u64,
    executed_total: u64,
    failed_total: u64,
}

#[near]
impl SentinelVault {
    // ------------------------------------------------------------------ init

    #[init]
    #[private]
    pub fn new(owner_id: AccountId) -> Self {
        let mut s = Self {
            owner: owner_id.clone(),
            frozen: false,
            vault_balance: 0,
            total_reserved: 0,
            agents: IterableMap::new(StorageKey::Agents),
            capsules: LookupMap::new(StorageKey::Capsules),
            capsule_count: 0,
            requests: LookupMap::new(StorageKey::Requests),
            request_count: 0,
            audit: LookupMap::new(StorageKey::Audit),
            audit_count: 0,
            approved_total: 0,
            blocked_total: 0,
            executed_total: 0,
            failed_total: 0,
        };
        s.record("vault_initialized", None, None, format!("Owner set to {}", owner_id));
        s
    }

    // ------------------------------------------------------------- funds

    /// Owner deposits native NEAR into the vault ledger.
    #[payable]
    pub fn deposit(&mut self) -> U128 {
        self.assert_owner();
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Sentinel: attach NEAR to deposit");
        self.vault_balance = self.vault_balance.checked_add(amount).expect("overflow");
        self.record("deposit", None, None, format!("Deposited {}", fmt_near(amount)));
        U128(self.vault_balance)
    }

    /// Owner withdraws unreserved NEAR. Works while frozen (emergency exit).
    #[payable]
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        assert_one_yocto();
        self.assert_owner();
        let amount = amount.0;
        require!(amount > 0, "Sentinel: amount must be positive");
        require!(amount <= self.vault_balance, "Sentinel: amount exceeds available vault balance");
        self.vault_balance -= amount;
        self.record("withdraw", None, None, format!("Withdrawal of {} sent to owner", fmt_near(amount)));
        Promise::new(self.owner.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_CALLBACK).on_withdraw_complete(U128(amount)))
    }

    #[private]
    pub fn on_withdraw_complete(&mut self, amount: U128) -> bool {
        let ok = promise_succeeded();
        if !ok {
            self.vault_balance = self.vault_balance.saturating_add(amount.0);
            self.record("withdraw_failed", None, None, format!("Withdrawal of {} failed and was restored", fmt_near(amount.0)));
        }
        ok
    }

    // ----------------------------------------------------------- controls

    /// Emergency freeze. Tightening action: no full-access confirmation required.
    pub fn freeze(&mut self) {
        self.assert_owner();
        self.frozen = true;
        self.record("vault_frozen", None, None, "All agent transfers halted".to_string());
    }

    /// Loosening action: requires 1 yoctoNEAR (full-access key / wallet confirmation).
    #[payable]
    pub fn unfreeze(&mut self) {
        assert_one_yocto();
        self.assert_owner();
        self.frozen = false;
        self.record("vault_unfrozen", None, None, "Agent transfers re-enabled".to_string());
    }

    // ------------------------------------------------------------- agents

    #[payable]
    pub fn register_agent(&mut self, agent_id: AccountId, label: String) -> Agent {
        assert_one_yocto();
        self.assert_owner();
        require!(agent_id != self.owner, "Sentinel: the owner cannot be an agent");
        require!(agent_id != env::current_account_id(), "Sentinel: the vault cannot be an agent");
        require!(self.agents.get(&agent_id).is_none(), "Sentinel: agent already registered");
        require!(!label.trim().is_empty() && label.len() <= MAX_LABEL_BYTES, "Sentinel: label must be 1-64 bytes");
        let agent = Agent {
            account_id: agent_id.clone(),
            label,
            status: AgentStatus::Active,
            registered_at_ms: U64(env::block_timestamp_ms()),
            approved_count: 0,
            blocked_count: 0,
            capsule_ids: vec![],
        };
        self.agents.insert(agent_id.clone(), agent.clone());
        self.record("agent_registered", None, None, format!("Registered {}", agent_id));
        agent
    }

    /// Tightening action: suspend without revoking capsules.
    pub fn suspend_agent(&mut self, agent_id: AccountId) {
        self.assert_owner();
        let mut a = self.agent_or_panic(&agent_id);
        require!(a.status == AgentStatus::Active, "Sentinel: agent is not active");
        a.status = AgentStatus::Suspended;
        self.agents.insert(agent_id.clone(), a);
        self.record("agent_suspended", None, None, format!("Suspended {}", agent_id));
    }

    #[payable]
    pub fn resume_agent(&mut self, agent_id: AccountId) {
        assert_one_yocto();
        self.assert_owner();
        let mut a = self.agent_or_panic(&agent_id);
        require!(a.status == AgentStatus::Suspended, "Sentinel: agent is not suspended");
        a.status = AgentStatus::Active;
        self.agents.insert(agent_id.clone(), a);
        self.record("agent_resumed", None, None, format!("Resumed {}", agent_id));
    }

    /// Tightening action: revokes the agent AND every capsule bound to it, permanently.
    pub fn revoke_agent(&mut self, agent_id: AccountId) {
        self.assert_owner();
        let mut a = self.agent_or_panic(&agent_id);
        require!(a.status != AgentStatus::Revoked, "Sentinel: agent already revoked");
        a.status = AgentStatus::Revoked;
        let mut revoked = 0u32;
        for id in a.capsule_ids.iter() {
            if let Some(mut c) = self.capsules.get(id).cloned() {
                if c.status == CapsuleStatus::Active {
                    c.status = CapsuleStatus::Revoked;
                    self.capsules.insert(*id, c);
                    revoked += 1;
                }
            }
        }
        self.agents.insert(agent_id.clone(), a);
        self.record("agent_revoked", None, None, format!("Revoked {} and {} active capsule(s)", agent_id, revoked));
    }

    /// Loosening action. Gives a revoked agent a clean slate; its old capsules stay revoked.
    #[payable]
    pub fn reinstate_agent(&mut self, agent_id: AccountId) {
        assert_one_yocto();
        self.assert_owner();
        let mut a = self.agent_or_panic(&agent_id);
        require!(a.status == AgentStatus::Revoked, "Sentinel: agent is not revoked");
        a.status = AgentStatus::Active;
        self.agents.insert(agent_id.clone(), a);
        self.record("agent_reinstated", None, None, format!("Reinstated {} (previous capsules remain revoked)", agent_id));
    }

    // ----------------------------------------------------------- capsules

    #[payable]
    pub fn create_capsule(&mut self, input: CapsuleInput) -> Capsule {
        assert_one_yocto();
        self.assert_owner();
        let capsule = self.build_capsule(input, 1, None);
        self.store_new_capsule(capsule, "capsule_created")
    }

    /// Owner issues a new version of a capsule. The old version is revoked; the new one
    /// starts with fresh spending and nonce counters.
    #[payable]
    pub fn amend_capsule(&mut self, capsule_id: u64, input: CapsuleInput) -> Capsule {
        assert_one_yocto();
        self.assert_owner();
        let mut old = self.capsule_or_panic(capsule_id);
        require!(old.agent_id == input.agent_id, "Sentinel: an amendment must keep the same agent");
        if old.status == CapsuleStatus::Active {
            old.status = CapsuleStatus::Revoked;
            self.capsules.insert(capsule_id, old.clone());
        }
        let capsule = self.build_capsule(input, old.version + 1, Some(capsule_id));
        self.store_new_capsule(capsule, "capsule_amended")
    }

    /// Tightening action.
    pub fn revoke_capsule(&mut self, capsule_id: u64) {
        self.assert_owner();
        let mut c = self.capsule_or_panic(capsule_id);
        require!(c.status == CapsuleStatus::Active, "Sentinel: capsule is not active");
        c.status = CapsuleStatus::Revoked;
        self.capsules.insert(capsule_id, c);
        self.record("capsule_revoked", Some(capsule_id), None, format!("Capsule #{} revoked", capsule_id));
    }

    // ------------------------------------------------------ agent requests

    /// The only path for an agent to move funds. Never panics on a policy violation:
    /// violations are stored, logged as NEP-297 events and returned.
    pub fn request_transfer(&mut self, request: TransferRequest) -> PromiseOrValue<Evaluation> {
        let caller = env::predecessor_account_id();
        // Unregistered callers are rejected without touching storage (prevents storage spam).
        let mut agent = self
            .agents
            .get(&caller)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Sentinel: caller is not a registered agent"));
        let now = env::block_timestamp_ms();
        let mut capsule = self.capsules.get(&request.capsule_id).cloned();
        let verdict = evaluate(self.frozen, self.vault_balance, &agent, capsule.as_ref(), &request, now);

        // Consume the nonce whenever it is the next one for a capsule this agent owns,
        // regardless of the decision. A blocked attempt cannot be replayed later.
        if let Some(c) = capsule.as_mut() {
            if c.agent_id == caller && request.nonce == c.last_nonce.0.saturating_add(1) {
                c.last_nonce = U64(request.nonce);
            }
        }

        // Everything below is stored or logged. The agent controls these strings, so clip them:
        // evaluation above already ran on the original values, and transfers use the capsule's recipient.
        let stored_operation = clip(&request.operation, MAX_FIELD_BYTES);
        let stored_asset = clip(&request.asset, MAX_FIELD_BYTES);
        let stored_recipient = clip(&request.recipient, MAX_FIELD_BYTES);
        let stored_memo = request.memo.as_ref().map(|m| clip(m, MAX_MEMO_BYTES));
        let explanation = clip(&verdict.explanation, MAX_EXPLANATION_BYTES);
        let checks: Vec<Check> = verdict
            .checks
            .into_iter()
            .map(|c| Check { detail: clip(&c.detail, MAX_DETAIL_BYTES), ..c })
            .collect();

        let request_id = self.request_count + 1;
        self.request_count = request_id;
        let amount = request.amount.0;
        let status = match verdict.decision {
            Decision::Approved => RequestStatus::PendingTransfer,
            Decision::RequiresHumanReview => RequestStatus::PendingReview,
            _ => RequestStatus::Rejected,
        };

        if status.is_pending() {
            // Both checks passed above guarantee these cannot underflow/overflow.
            let c = capsule.as_mut().expect("capsule checked");
            self.vault_balance -= amount;
            self.total_reserved += amount;
            c.reserved = U128(c.reserved.0 + amount);
        }

        match verdict.decision {
            Decision::Approved => {
                agent.approved_count += 1;
                self.approved_total += 1;
            }
            Decision::RequiresHumanReview => {}
            _ => {
                agent.blocked_count += 1;
                self.blocked_total += 1;
            }
        }

        let record = RequestRecord {
            id: request_id,
            capsule_id: request.capsule_id,
            agent_id: caller.clone(),
            nonce: U64(request.nonce),
            operation: stored_operation.clone(),
            asset: stored_asset.clone(),
            recipient: stored_recipient.clone(),
            amount: request.amount,
            memo: stored_memo.clone(),
            decision: verdict.decision,
            reason: verdict.reason,
            explanation: explanation.clone(),
            status,
            created_at_ms: U64(now),
            block_height: U64(env::block_height()),
        };
        self.store_request(record);
        self.agents.insert(caller.clone(), agent);
        let recipient_account = capsule.as_ref().map(|c| c.recipient.clone());
        if let Some(c) = capsule {
            self.capsules.insert(c.id, c);
        }

        let kind = match verdict.decision {
            Decision::Approved => "request_approved",
            Decision::RequiresHumanReview => "request_held",
            _ => "request_blocked",
        };
        self.record(kind, Some(request.capsule_id), Some(request_id), explanation.clone());

        let evaluation = Evaluation {
            request_id,
            decision: verdict.decision,
            reason: verdict.reason,
            explanation,
            status,
            checks,
        };
        emit(
            "request_evaluated",
            json!({ "evaluation": evaluation, "agent_id": caller, "capsule_id": request.capsule_id, "proposed": {
                "nonce": request.nonce.to_string(), "operation": stored_operation, "asset": stored_asset,
                "recipient": stored_recipient, "amount": request.amount, "memo": stored_memo } }),
        );

        if verdict.decision == Decision::Approved {
            // Recipient is taken from the capsule (identical to the request, checked above).
            let to = recipient_account.expect("capsule checked");
            PromiseOrValue::Promise(self.release(request_id, to, amount))
        } else {
            PromiseOrValue::Value(evaluation)
        }
    }

    #[private]
    pub fn on_transfer_complete(&mut self, request_id: u64) -> Evaluation {
        let ok = promise_succeeded();
        self.finalize_transfer(request_id, ok)
    }

    /// Owner resolves a request held for review. Approving is a loosening action (1 yocto).
    #[payable]
    pub fn resolve_review(&mut self, request_id: u64, approve: bool) -> PromiseOrValue<Evaluation> {
        if approve {
            assert_one_yocto();
        }
        self.assert_owner();
        let mut record = self.requests.get(&request_id).cloned().unwrap_or_else(|| env::panic_str("Sentinel: request not found"));
        require!(record.status == RequestStatus::PendingReview, "Sentinel: request is not awaiting review");
        let mut capsule = self.capsule_or_panic(record.capsule_id);
        let agent = self.agent_or_panic(&record.agent_id);
        let now = env::block_timestamp_ms();
        let still_valid = !self.frozen
            && agent.status == AgentStatus::Active
            && capsule.status == CapsuleStatus::Active
            && now < capsule.expires_at_ms.0;
        let amount = record.amount.0;

        if approve && still_valid {
            record.status = RequestStatus::PendingTransfer;
            record.decision = Decision::Approved;
            record.reason = ReasonCode::OwnerApproved;
            record.explanation = "Approved by the owner after review.".to_string();
            self.approved_total += 1;
            self.requests.insert(request_id, record);
            self.record("review_approved", Some(capsule.id), Some(request_id), "Owner approved held request".to_string());
            return PromiseOrValue::Promise(self.release(request_id, capsule.recipient.clone(), amount));
        }

        // Release the reservation.
        self.vault_balance += amount;
        self.total_reserved = self.total_reserved.saturating_sub(amount);
        capsule.reserved = U128(capsule.reserved.0.saturating_sub(amount));
        record.status = RequestStatus::ReviewRejected;
        record.decision = Decision::Blocked;
        record.reason = if approve { ReasonCode::ReviewInvalidated } else { ReasonCode::OwnerRejected };
        record.explanation = if approve {
            "Owner approved, but the capsule, agent or vault is no longer valid. Funds were not released.".to_string()
        } else {
            "Rejected by the owner after review.".to_string()
        };
        self.blocked_total += 1;
        let eval = Evaluation {
            request_id,
            decision: record.decision,
            reason: record.reason,
            explanation: record.explanation.clone(),
            status: record.status,
            checks: vec![],
        };
        self.capsules.insert(capsule.id, capsule.clone());
        self.requests.insert(request_id, record);
        self.record("review_rejected", Some(capsule.id), Some(request_id), eval.explanation.clone());
        PromiseOrValue::Value(eval)
    }

    // -------------------------------------------------------------- views

    pub fn get_overview(&self) -> Overview {
        Overview {
            owner: self.owner.clone(),
            frozen: self.frozen,
            vault_balance: U128(self.vault_balance),
            total_reserved: U128(self.total_reserved),
            contract_balance: U128(env::account_balance().as_yoctonear()),
            agent_count: self.agents.len(),
            capsule_count: self.capsule_count,
            request_count: self.request_count,
            approved_total: self.approved_total,
            blocked_total: self.blocked_total,
            executed_total: self.executed_total,
            failed_total: self.failed_total,
            audit_count: self.audit_count,
        }
    }

    pub fn get_agents(&self) -> Vec<Agent> {
        self.agents.values().cloned().collect()
    }

    pub fn get_agent(&self, agent_id: AccountId) -> Option<Agent> {
        self.agents.get(&agent_id).cloned()
    }

    pub fn get_capsule(&self, capsule_id: u64) -> Option<Capsule> {
        self.capsules.get(&capsule_id).cloned()
    }

    /// Newest first. `from_id` defaults to the latest capsule.
    pub fn get_capsules(&self, from_id: Option<u64>, limit: Option<u64>) -> Vec<Capsule> {
        let start = from_id.unwrap_or(self.capsule_count).min(self.capsule_count);
        let limit = limit.unwrap_or(50).min(MAX_PAGE);
        (1..=start).rev().take(limit as usize).filter_map(|id| self.capsules.get(&id).cloned()).collect()
    }

    pub fn get_request(&self, request_id: u64) -> Option<RequestRecord> {
        self.requests.get(&request_id).cloned()
    }

    /// Newest first. Old finalized requests beyond REQUEST_CAPACITY are pruned.
    pub fn get_requests(&self, from_id: Option<u64>, limit: Option<u64>) -> Vec<RequestRecord> {
        let start = from_id.unwrap_or(self.request_count).min(self.request_count);
        let limit = limit.unwrap_or(50).min(MAX_PAGE);
        (1..=start).rev().filter_map(|id| self.requests.get(&id).cloned()).take(limit as usize).collect()
    }

    /// Newest first, from a ring buffer of the last AUDIT_CAPACITY events.
    pub fn get_audit(&self, limit: Option<u64>) -> Vec<AuditEvent> {
        let n = limit.unwrap_or(50).min(MAX_PAGE).min(self.audit_count).min(AUDIT_CAPACITY);
        (0..n)
            .filter_map(|i| self.audit.get(&((self.audit_count - 1 - i) % AUDIT_CAPACITY)).cloned())
            .collect()
    }

    /// Compute the commitment a capsule would get, so the UI can show it before signing.
    pub fn preview_commitment(&self, input: CapsuleInput, version: Option<u32>, supersedes: Option<u64>) -> String {
        commitment_hex(&self.commitment_payload(&input, version.unwrap_or(1), supersedes))
    }
}

// ------------------------------------------------------------------ internals

impl SentinelVault {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Sentinel: only the owner can do this");
    }

    fn agent_or_panic(&self, id: &AccountId) -> Agent {
        self.agents.get(id).cloned().unwrap_or_else(|| env::panic_str("Sentinel: agent not found"))
    }

    fn capsule_or_panic(&self, id: u64) -> Capsule {
        self.capsules.get(&id).cloned().unwrap_or_else(|| env::panic_str("Sentinel: capsule not found"))
    }

    fn commitment_payload(&self, input: &CapsuleInput, version: u32, supersedes: Option<u64>) -> CommitmentPayload {
        CommitmentPayload {
            domain: COMMITMENT_DOMAIN.to_string(),
            vault: env::current_account_id(),
            owner: self.owner.clone(),
            agent_id: input.agent_id.clone(),
            operation: input.operation.clone(),
            asset: input.asset.clone(),
            recipient: input.recipient.clone(),
            max_per_tx: input.max_per_tx,
            max_total: input.max_total,
            review_threshold: input.review_threshold,
            expires_at_ms: input.expires_at_ms,
            instruction: input.instruction.clone(),
            version,
            supersedes,
        }
    }

    fn build_capsule(&mut self, input: CapsuleInput, version: u32, supersedes: Option<u64>) -> Capsule {
        let now = env::block_timestamp_ms();
        let agent = self.agent_or_panic(&input.agent_id);
        require!(agent.status == AgentStatus::Active, "Sentinel: agent must be active");
        require!(input.operation == OP_NATIVE_TRANSFER, "Sentinel: only native_transfer capsules are supported");
        require!(input.asset == ASSET_NEAR, "Sentinel: only the NEAR asset is supported");
        require!(input.recipient != env::current_account_id(), "Sentinel: recipient cannot be the vault");
        require!(input.recipient != input.agent_id, "Sentinel: recipient cannot be the agent");
        require!(input.max_per_tx.0 > 0, "Sentinel: per-transaction limit must be positive");
        require!(input.max_per_tx.0 <= input.max_total.0, "Sentinel: per-transaction limit exceeds total limit");
        if let Some(t) = input.review_threshold {
            require!(t.0 < input.max_per_tx.0, "Sentinel: review threshold must be below the per-transaction limit");
        }
        let exp = input.expires_at_ms.0;
        require!(exp >= now.saturating_add(MIN_CAPSULE_TTL_MS), "Sentinel: expiry is too soon (minimum 10 seconds)");
        require!(exp <= now.saturating_add(MAX_CAPSULE_TTL_MS), "Sentinel: expiry is too far (maximum 30 days)");
        let ins = input.instruction.trim();
        require!(!ins.is_empty() && input.instruction.len() <= MAX_INSTRUCTION_BYTES, "Sentinel: instruction must be 1-500 bytes");

        let commitment = commitment_hex(&self.commitment_payload(&input, version, supersedes));
        if let Some(expected) = &input.expected_commitment {
            require!(expected.to_lowercase() == commitment, "Sentinel: commitment mismatch; the reviewed terms differ from the submitted terms");
        }
        self.capsule_count += 1;
        Capsule {
            id: self.capsule_count,
            version,
            supersedes,
            agent_id: input.agent_id,
            operation: input.operation,
            asset: input.asset,
            recipient: input.recipient,
            max_per_tx: input.max_per_tx,
            max_total: input.max_total,
            review_threshold: input.review_threshold,
            instruction: input.instruction,
            created_at_ms: U64(now),
            expires_at_ms: input.expires_at_ms,
            status: CapsuleStatus::Active,
            spent: U128(0),
            reserved: U128(0),
            last_nonce: U64(0),
            commitment,
        }
    }

    fn store_new_capsule(&mut self, capsule: Capsule, kind: &str) -> Capsule {
        let mut agent = self.agent_or_panic(&capsule.agent_id);
        agent.capsule_ids.push(capsule.id);
        self.agents.insert(agent.account_id.clone(), agent);
        self.capsules.insert(capsule.id, capsule.clone());
        self.record(
            kind,
            Some(capsule.id),
            None,
            format!(
                "v{} for {}: pay {} up to {} per tx / {} total, commitment {}",
                capsule.version,
                capsule.agent_id,
                capsule.recipient,
                fmt_near(capsule.max_per_tx.0),
                fmt_near(capsule.max_total.0),
                capsule.commitment
            ),
        );
        emit("capsule_committed", json!({ "capsule_id": capsule.id, "version": capsule.version, "commitment": capsule.commitment }));
        capsule
    }

    fn release(&self, request_id: u64, to: AccountId, amount: u128) -> Promise {
        Promise::new(to)
            .transfer(NearToken::from_yoctonear(amount))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_CALLBACK).on_transfer_complete(request_id))
    }

    fn store_request(&mut self, record: RequestRecord) {
        let id = record.id;
        self.requests.insert(id, record);
        if id > REQUEST_CAPACITY {
            let old = id - REQUEST_CAPACITY;
            let prunable = self.requests.get(&old).map(|r| !r.status.is_pending()).unwrap_or(false);
            if prunable {
                self.requests.remove(&old);
            }
        }
    }

    /// Settles an approved transfer exactly once. Never panics (it runs in a callback).
    pub(crate) fn finalize_transfer(&mut self, request_id: u64, success: bool) -> Evaluation {
        let mut record = match self.requests.get(&request_id).cloned() {
            Some(r) => r,
            None => env::panic_str("Sentinel: unknown request in callback"),
        };
        if record.status != RequestStatus::PendingTransfer {
            // Double-execution guard: already settled.
            return Evaluation {
                request_id,
                decision: record.decision,
                reason: record.reason,
                explanation: record.explanation,
                status: record.status,
                checks: vec![],
            };
        }
        let amount = record.amount.0;
        let mut capsule = self.capsules.get(&record.capsule_id).cloned().expect("capsule exists for a pending request");
        capsule.reserved = U128(capsule.reserved.0.saturating_sub(amount));
        self.total_reserved = self.total_reserved.saturating_sub(amount);

        if success {
            capsule.spent = U128(capsule.spent.0.saturating_add(amount));
            if capsule.spent.0 >= capsule.max_total.0 && capsule.status == CapsuleStatus::Active {
                capsule.status = CapsuleStatus::Exhausted;
            }
            record.status = RequestStatus::Executed;
            record.explanation = format!("{} Transfer settled on-chain.", record.explanation);
            self.executed_total += 1;
            self.record("transfer_executed", Some(capsule.id), Some(request_id), format!("Sent {} to {}", fmt_near(amount), capsule.recipient));
        } else {
            self.vault_balance = self.vault_balance.saturating_add(amount);
            record.status = RequestStatus::TransferFailed;
            record.reason = ReasonCode::TransferFailed;
            record.explanation = "The transfer failed on-chain. Funds returned to the vault and nothing was counted as spent.".to_string();
            self.failed_total += 1;
            self.record("transfer_failed", Some(capsule.id), Some(request_id), format!("Transfer of {} to {} failed; refunded", fmt_near(amount), capsule.recipient));
        }
        let eval = Evaluation {
            request_id,
            decision: record.decision,
            reason: record.reason,
            explanation: record.explanation.clone(),
            status: record.status,
            checks: vec![],
        };
        emit("transfer_finalized", json!({ "request_id": request_id, "status": record.status, "amount": record.amount }));
        self.capsules.insert(capsule.id, capsule);
        self.requests.insert(request_id, record);
        eval
    }

    fn record(&mut self, kind: &str, capsule_id: Option<u64>, request_id: Option<u64>, detail: String) {
        let seq = self.audit_count;
        self.audit_count += 1;
        self.audit.insert(
            seq % AUDIT_CAPACITY,
            AuditEvent {
                seq: U64(seq),
                kind: kind.to_string(),
                actor: env::predecessor_account_id(),
                capsule_id,
                request_id,
                detail,
                timestamp_ms: U64(env::block_timestamp_ms()),
            },
        );
    }
}

// ---------------------------------------------------------- pure functions

/// Deterministic verification. Order and names must match packages/engine/src/verify.ts.
/// The first failing check decides; all evaluated checks are reported.
pub fn evaluate(
    frozen: bool,
    vault_balance: u128,
    agent: &Agent,
    capsule: Option<&Capsule>,
    req: &TransferRequest,
    now_ms: u64,
) -> Verdict {
    let mut checks: Vec<Check> = Vec::new();
    let mut failure: Option<(Decision, ReasonCode, String)> = None;
    let mut check = |name: &str, passed: bool, detail: String, decision: Decision, reason: ReasonCode| {
        if !passed && failure.is_none() {
            failure = Some((decision, reason, detail.clone()));
        }
        checks.push(Check { name: name.to_string(), passed, detail });
    };

    check(
        "vault_active",
        !frozen,
        if frozen { "The vault is frozen by the owner. No transfers are released.".into() } else { "Vault is not frozen.".into() },
        Decision::Blocked,
        ReasonCode::VaultFrozen,
    );

    match agent.status {
        AgentStatus::Active => check("agent_active", true, format!("Agent {} is active.", agent.account_id), Decision::Blocked, ReasonCode::AgentSuspended),
        AgentStatus::Revoked => check("agent_active", false, format!("Agent {} was revoked by the owner.", agent.account_id), Decision::Revoked, ReasonCode::AgentRevoked),
        AgentStatus::Suspended => check("agent_active", false, format!("Agent {} is suspended by the owner.", agent.account_id), Decision::Blocked, ReasonCode::AgentSuspended),
    }

    let c = match capsule {
        None => {
            check("capsule_exists", false, format!("Capsule #{} does not exist.", req.capsule_id), Decision::Blocked, ReasonCode::CapsuleNotFound);
            return finish(failure, checks, req);
        }
        Some(c) => c,
    };
    let short: String = c.commitment.chars().take(12).collect();
    check("capsule_exists", true, format!("Capsule #{} exists (commitment {}…).", c.id, short), Decision::Blocked, ReasonCode::CapsuleNotFound);

    if c.agent_id != agent.account_id {
        check(
            "capsule_bound_to_agent",
            false,
            format!("Capsule #{} is bound to {}, not {}.", c.id, c.agent_id, agent.account_id),
            Decision::Blocked,
            ReasonCode::CapsuleAgentMismatch,
        );
        return finish(failure, checks, req);
    }
    check("capsule_bound_to_agent", true, format!("Capsule #{} is bound to this agent.", c.id), Decision::Blocked, ReasonCode::CapsuleAgentMismatch);

    match c.status {
        CapsuleStatus::Revoked => check("capsule_active", false, format!("Capsule #{} was revoked by the owner.", c.id), Decision::Revoked, ReasonCode::CapsuleRevoked),
        CapsuleStatus::Exhausted => check("capsule_active", false, format!("Capsule #{} has used its full spending allowance.", c.id), Decision::Blocked, ReasonCode::CapsuleExhausted),
        CapsuleStatus::Active => check("capsule_active", true, format!("Capsule #{} is active.", c.id), Decision::Blocked, ReasonCode::CapsuleRevoked),
    }

    let exp = c.expires_at_ms.0;
    check(
        "capsule_not_expired",
        now_ms < exp,
        if now_ms < exp {
            format!("Capsule expires at {} (ms).", exp)
        } else {
            format!("Capsule #{} expired at {} (ms); now is {}.", c.id, exp, now_ms)
        },
        Decision::Expired,
        ReasonCode::CapsuleExpired,
    );

    let last = c.last_nonce.0;
    if req.nonce <= last {
        check("nonce_sequence", false, format!("Nonce {} was already used (last accepted nonce {}). Replay rejected.", req.nonce, last), Decision::Blocked, ReasonCode::NonceReplay);
    } else if req.nonce != last + 1 {
        check("nonce_sequence", false, format!("Nonce {} skips ahead; expected {}.", req.nonce, last + 1), Decision::Blocked, ReasonCode::NonceOutOfOrder);
    } else {
        check("nonce_sequence", true, format!("Nonce {} is the next expected nonce.", req.nonce), Decision::Blocked, ReasonCode::NonceReplay);
    }

    let op_ok = req.operation == c.operation;
    check(
        "operation_matches",
        op_ok,
        if op_ok { format!("Operation {} is authorized.", req.operation) } else { format!("Operation {} does not match the authorized operation {}.", req.operation, c.operation) },
        Decision::Blocked,
        ReasonCode::OperationMismatch,
    );
    let asset_ok = req.asset == c.asset;
    check(
        "asset_matches",
        asset_ok,
        if asset_ok { format!("Asset {} is authorized.", req.asset) } else { format!("Asset {} does not match the authorized asset {}.", req.asset, c.asset) },
        Decision::Blocked,
        ReasonCode::AssetMismatch,
    );
    let rec_ok = req.recipient == c.recipient.as_str();
    check(
        "recipient_matches",
        rec_ok,
        if rec_ok { format!("Recipient {} is authorized.", req.recipient) } else { format!("Recipient {} does not match the authorized recipient {}.", req.recipient, c.recipient) },
        Decision::Blocked,
        ReasonCode::RecipientMismatch,
    );

    let amount = req.amount.0;
    let max_tx = c.max_per_tx.0;
    if amount == 0 {
        check("amount_within_tx_limit", false, "Amount must be greater than zero.".into(), Decision::Blocked, ReasonCode::InvalidAmount);
    } else if amount > max_tx {
        check(
            "amount_within_tx_limit",
            false,
            format!("Amount {} exceeds the per-transaction limit of {}.", fmt_near(amount), fmt_near(max_tx)),
            Decision::Blocked,
            ReasonCode::AmountExceedsTxLimit,
        );
    } else {
        check(
            "amount_within_tx_limit",
            true,
            format!("Amount {} is within the per-transaction limit of {}.", fmt_near(amount), fmt_near(max_tx)),
            Decision::Blocked,
            ReasonCode::AmountExceedsTxLimit,
        );
    }

    let max_total = c.max_total.0;
    let after = c.spent.0.checked_add(c.reserved.0).and_then(|x| x.checked_add(amount));
    match after {
        Some(a) if a <= max_total => check(
            "cumulative_within_limit",
            true,
            format!("Cumulative spend after this request: {} of {}.", fmt_near(a), fmt_near(max_total)),
            Decision::Blocked,
            ReasonCode::CumulativeLimitExceeded,
        ),
        Some(a) => check(
            "cumulative_within_limit",
            false,
            format!("Cumulative spend would reach {}, above the capsule total of {}.", fmt_near(a), fmt_near(max_total)),
            Decision::Blocked,
            ReasonCode::CumulativeLimitExceeded,
        ),
        None => check("cumulative_within_limit", false, "Amount overflows the spending ledger.".into(), Decision::Blocked, ReasonCode::CumulativeLimitExceeded),
    }

    let memo_len = req.memo.as_ref().map(|m| m.len()).unwrap_or(0);
    check(
        "memo_valid",
        memo_len <= MAX_MEMO_BYTES,
        if memo_len <= MAX_MEMO_BYTES { "Memo length is valid.".into() } else { format!("Memo is {} bytes; the limit is {}.", memo_len, MAX_MEMO_BYTES) },
        Decision::Blocked,
        ReasonCode::InvalidMemo,
    );

    let liquid = amount <= vault_balance;
    check(
        "vault_liquidity",
        liquid,
        if liquid { format!("Vault holds {} available.", fmt_near(vault_balance)) } else { format!("Vault holds {} available; {} requested.", fmt_near(vault_balance), fmt_near(amount)) },
        Decision::Blocked,
        ReasonCode::InsufficientVaultBalance,
    );

    if let Some(t) = c.review_threshold {
        let within = amount <= t.0;
        check(
            "review_threshold",
            within,
            if within {
                format!("Amount is within the automatic approval threshold of {}.", fmt_near(t.0))
            } else {
                format!("Amount {} is above the review threshold of {}. Held for owner review.", fmt_near(amount), fmt_near(t.0))
            },
            Decision::RequiresHumanReview,
            ReasonCode::ReviewThresholdExceeded,
        );
    }

    finish(failure, checks, req)
}

fn finish(failure: Option<(Decision, ReasonCode, String)>, checks: Vec<Check>, req: &TransferRequest) -> Verdict {
    match failure {
        Some((decision, reason, explanation)) => Verdict { decision, reason, explanation, checks },
        None => Verdict {
            decision: Decision::Approved,
            reason: ReasonCode::Authorized,
            explanation: format!(
                "All {} checks passed. Transfer of {} to {} is within capsule #{}.",
                checks.len(),
                fmt_near(req.amount.0),
                req.recipient,
                req.capsule_id
            ),
            checks,
        },
    }
}

pub fn commitment_hex(payload: &CommitmentPayload) -> String {
    let bytes = serde_json::to_vec(payload).expect("serializable");
    to_hex(&env::sha256(&bytes))
}

/// Clip an untrusted string to `max` bytes on a char boundary, noting the original size.
pub fn clip(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}… ({} bytes)", &s[..end], s.len())
}

pub fn to_hex(bytes: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 0x0f) as usize] as char);
    }
    s
}

/// Same output as fmtNear() in packages/engine/src/units.ts.
pub fn fmt_near(yocto: u128) -> String {
    let one: u128 = 10u128.pow(24);
    let whole = yocto / one;
    let frac = yocto % one;
    if frac == 0 {
        return format!("{} NEAR", whole);
    }
    let mut f = format!("{:024}", frac);
    while f.ends_with('0') {
        f.pop();
    }
    format!("{}.{} NEAR", whole, f)
}

fn promise_succeeded() -> bool {
    env::promise_results_count() == 1 && matches!(env::promise_result(0), PromiseResult::Successful(_))
}

fn emit(event: &str, data: serde_json::Value) {
    log!(
        "EVENT_JSON:{}",
        json!({ "standard": EVENT_STANDARD, "version": EVENT_VERSION, "event": event, "data": [data] })
    );
}

#[cfg(test)]
mod tests;
