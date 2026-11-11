use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const T0: u64 = 1_800_000_000_000; // ms

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(predecessor: &str, deposit: u128, now_ms: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("sentinel.testnet"))
        .predecessor_account_id(acc(predecessor))
        .signer_account_id(acc(predecessor))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(50))
        .block_timestamp(now_ms * 1_000_000);
    testing_env!(b.build());
}

fn input(max_tx: u128, max_total: u128, review: Option<u128>, expires: u64) -> CapsuleInput {
    CapsuleInput {
        agent_id: acc("agent.testnet"),
        operation: OP_NATIVE_TRANSFER.into(),
        asset: ASSET_NEAR.into(),
        recipient: acc("vendor.testnet"),
        max_per_tx: U128(max_tx),
        max_total: U128(max_total),
        review_threshold: review.map(U128),
        expires_at_ms: U64(expires),
        instruction: "Pay vendor.testnet up to 3 NEAR for invoice #1042".into(),
        expected_commitment: None,
    }
}

/// Vault with 10 NEAR, one agent and capsule #1 (3 NEAR per tx / 3 NEAR total, 24h).
fn setup() -> SentinelVault {
    ctx("sentinel.testnet", 0, T0);
    let mut v = SentinelVault::new(acc("owner.testnet"));
    ctx("owner.testnet", 10 * NEAR, T0);
    v.deposit();
    ctx("owner.testnet", 1, T0);
    v.register_agent(acc("agent.testnet"), "Demo agent".into());
    ctx("owner.testnet", 1, T0);
    v.create_capsule(input(3 * NEAR, 3 * NEAR, None, T0 + 86_400_000));
    v
}

fn req(nonce: u64, recipient: &str, amount: u128) -> TransferRequest {
    TransferRequest {
        capsule_id: 1,
        nonce,
        operation: OP_NATIVE_TRANSFER.into(),
        asset: ASSET_NEAR.into(),
        recipient: recipient.into(),
        amount: U128(amount),
        memo: None,
    }
}

fn as_agent(v: &mut SentinelVault, r: TransferRequest, now: u64) -> Option<Evaluation> {
    ctx("agent.testnet", 0, now);
    match v.request_transfer(r) {
        PromiseOrValue::Value(e) => Some(e),
        PromiseOrValue::Promise(_) => None,
    }
}

fn last_request(v: &SentinelVault) -> RequestRecord {
    v.get_requests(None, Some(1)).pop().unwrap()
}

// ---------------------------------------------------------------- funds

#[test]
fn owner_deposit_credits_vault() {
    let v = setup();
    assert_eq!(v.get_overview().vault_balance.0, 10 * NEAR);
}

#[test]
#[should_panic(expected = "only the owner")]
fn non_owner_cannot_deposit() {
    let mut v = setup();
    ctx("agent.testnet", NEAR, T0);
    v.deposit();
}

// ------------------------------------------------------------ happy path

#[test]
fn authorized_transfer_is_approved_and_reserved_then_settled() {
    let mut v = setup();
    assert!(as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 1).is_none(), "approved path returns a promise");
    let r = last_request(&v);
    assert_eq!(r.decision, Decision::Approved);
    assert_eq!(r.status, RequestStatus::PendingTransfer);
    assert_eq!(v.get_overview().vault_balance.0, 9 * NEAR);
    assert_eq!(v.get_capsule(1).unwrap().reserved.0, NEAR);

    ctx("sentinel.testnet", 0, T0 + 2);
    let e = v.finalize_transfer(r.id, true);
    assert_eq!(e.status, RequestStatus::Executed);
    let c = v.get_capsule(1).unwrap();
    assert_eq!(c.spent.0, NEAR);
    assert_eq!(c.reserved.0, 0);
    assert_eq!(v.get_overview().executed_total, 1);
}

#[test]
fn failed_transfer_is_refunded_and_not_counted() {
    let mut v = setup();
    as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 1);
    ctx("sentinel.testnet", 0, T0 + 2);
    let e = v.finalize_transfer(1, false);
    assert_eq!(e.status, RequestStatus::TransferFailed);
    assert_eq!(e.reason, ReasonCode::TransferFailed);
    let c = v.get_capsule(1).unwrap();
    assert_eq!(c.spent.0, 0);
    assert_eq!(c.reserved.0, 0);
    assert_eq!(v.get_overview().vault_balance.0, 10 * NEAR);
    assert_eq!(v.get_overview().failed_total, 1);
}

#[test]
fn finalize_twice_does_not_double_count() {
    let mut v = setup();
    as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 1);
    ctx("sentinel.testnet", 0, T0 + 2);
    v.finalize_transfer(1, true);
    v.finalize_transfer(1, true);
    v.finalize_transfer(1, false);
    let c = v.get_capsule(1).unwrap();
    assert_eq!(c.spent.0, NEAR);
    assert_eq!(v.get_overview().vault_balance.0, 9 * NEAR);
}

// ------------------------------------------------------------- attacks

#[test]
#[should_panic(expected = "not a registered agent")]
fn unregistered_agent_is_rejected() {
    let mut v = setup();
    ctx("rogue.testnet", 0, T0 + 1);
    let _ = v.request_transfer(req(1, "vendor.testnet", NEAR));
}

#[test]
fn recipient_substitution_is_blocked_and_recorded() {
    let mut v = setup();
    let e = as_agent(&mut v, req(1, "attacker.testnet", NEAR), T0 + 1).unwrap();
    assert_eq!(e.decision, Decision::Blocked);
    assert_eq!(e.reason, ReasonCode::RecipientMismatch);
    assert_eq!(e.status, RequestStatus::Rejected);
    assert_eq!(v.get_overview().vault_balance.0, 10 * NEAR, "no funds reserved");
    assert_eq!(v.get_agent(acc("agent.testnet")).unwrap().blocked_count, 1);
    assert_eq!(v.get_audit(Some(1))[0].kind, "request_blocked");
}

#[test]
fn amount_above_limit_is_blocked() {
    let mut v = setup();
    let e = as_agent(&mut v, req(1, "vendor.testnet", 8 * NEAR), T0 + 1).unwrap();
    assert_eq!(e.reason, ReasonCode::AmountExceedsTxLimit);
}

#[test]
fn asset_substitution_is_blocked() {
    let mut v = setup();
    let mut r = req(1, "vendor.testnet", NEAR / 10);
    r.asset = "TOKENB".into();
    assert_eq!(as_agent(&mut v, r, T0 + 1).unwrap().reason, ReasonCode::AssetMismatch);
}

#[test]
fn operation_substitution_is_blocked() {
    let mut v = setup();
    let mut r = req(1, "vendor.testnet", NEAR);
    r.operation = "function_call".into();
    assert_eq!(as_agent(&mut v, r, T0 + 1).unwrap().reason, ReasonCode::OperationMismatch);
}

#[test]
fn cumulative_limit_counts_reserved_and_spent() {
    let mut v = setup();
    as_agent(&mut v, req(1, "vendor.testnet", 2 * NEAR), T0 + 1); // reserved 2
    let e = as_agent(&mut v, req(2, "vendor.testnet", 2 * NEAR), T0 + 2).unwrap();
    assert_eq!(e.reason, ReasonCode::CumulativeLimitExceeded);
    ctx("sentinel.testnet", 0, T0 + 3);
    v.finalize_transfer(1, true);
    assert!(as_agent(&mut v, req(3, "vendor.testnet", NEAR), T0 + 4).is_none(), "exactly reaches the total");
    ctx("sentinel.testnet", 0, T0 + 5);
    v.finalize_transfer(3, true);
    assert_eq!(v.get_capsule(1).unwrap().status, CapsuleStatus::Exhausted);
    let e = as_agent(&mut v, req(4, "vendor.testnet", 1), T0 + 6).unwrap();
    assert_eq!(e.reason, ReasonCode::CapsuleExhausted);
}

#[test]
fn replayed_nonce_is_blocked() {
    let mut v = setup();
    as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 1);
    let e = as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 2).unwrap();
    assert_eq!(e.reason, ReasonCode::NonceReplay);
}

#[test]
fn blocked_attempt_consumes_its_nonce() {
    let mut v = setup();
    as_agent(&mut v, req(1, "attacker.testnet", NEAR), T0 + 1);
    let e = as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 2).unwrap();
    assert_eq!(e.reason, ReasonCode::NonceReplay);
    assert!(as_agent(&mut v, req(2, "vendor.testnet", NEAR), T0 + 3).is_none());
}

#[test]
fn out_of_order_nonce_is_blocked() {
    let mut v = setup();
    assert_eq!(as_agent(&mut v, req(5, "vendor.testnet", NEAR), T0 + 1).unwrap().reason, ReasonCode::NonceOutOfOrder);
}

#[test]
fn expired_capsule_returns_expired() {
    let mut v = setup();
    let e = as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 86_400_000).unwrap();
    assert_eq!(e.decision, Decision::Expired);
    assert_eq!(e.reason, ReasonCode::CapsuleExpired);
}

#[test]
fn revoked_capsule_returns_revoked() {
    let mut v = setup();
    ctx("owner.testnet", 0, T0 + 1);
    v.revoke_capsule(1);
    let e = as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 2).unwrap();
    assert_eq!(e.decision, Decision::Revoked);
    assert_eq!(e.reason, ReasonCode::CapsuleRevoked);
}

#[test]
fn revoked_agent_is_blocked_and_its_capsules_stay_revoked_after_reinstatement() {
    let mut v = setup();
    ctx("owner.testnet", 0, T0 + 1);
    v.revoke_agent(acc("agent.testnet"));
    let e = as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 2).unwrap();
    assert_eq!(e.decision, Decision::Revoked);
    assert_eq!(e.reason, ReasonCode::AgentRevoked);
    assert_eq!(v.get_capsule(1).unwrap().status, CapsuleStatus::Revoked);
    ctx("owner.testnet", 1, T0 + 3);
    v.reinstate_agent(acc("agent.testnet"));
    let e = as_agent(&mut v, req(2, "vendor.testnet", NEAR), T0 + 4).unwrap();
    assert_eq!(e.reason, ReasonCode::CapsuleRevoked);
}

#[test]
fn suspended_agent_is_blocked_until_resumed() {
    let mut v = setup();
    ctx("owner.testnet", 0, T0 + 1);
    v.suspend_agent(acc("agent.testnet"));
    assert_eq!(as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 2).unwrap().reason, ReasonCode::AgentSuspended);
    ctx("owner.testnet", 1, T0 + 3);
    v.resume_agent(acc("agent.testnet"));
    assert!(as_agent(&mut v, req(2, "vendor.testnet", NEAR), T0 + 4).is_none());
}

#[test]
fn capsule_of_another_agent_cannot_be_used() {
    let mut v = setup();
    ctx("owner.testnet", 1, T0);
    v.register_agent(acc("agent2.testnet"), "Second".into());
    ctx("agent2.testnet", 0, T0 + 1);
    match v.request_transfer(req(1, "vendor.testnet", NEAR)) {
        PromiseOrValue::Value(e) => assert_eq!(e.reason, ReasonCode::CapsuleAgentMismatch),
        _ => panic!("must not approve"),
    }
    assert_eq!(v.get_capsule(1).unwrap().last_nonce.0, 0, "foreign agent cannot burn nonces");
}

// ---------------------------------------------------- owner controls

#[test]
fn frozen_vault_blocks_agents_but_owner_can_withdraw() {
    let mut v = setup();
    ctx("owner.testnet", 0, T0 + 1);
    v.freeze();
    assert_eq!(as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 2).unwrap().reason, ReasonCode::VaultFrozen);
    ctx("owner.testnet", 1, T0 + 3);
    let _ = v.withdraw(U128(4 * NEAR));
    assert_eq!(v.get_overview().vault_balance.0, 6 * NEAR);
    ctx("sentinel.testnet", 0, T0 + 4);
    // Unit tests cannot produce promise results; settlement of withdrawals is covered in tests/sandbox.rs.
}

#[test]
#[should_panic(expected = "exceeds available vault balance")]
fn cannot_withdraw_reserved_funds() {
    let mut v = setup();
    as_agent(&mut v, req(1, "vendor.testnet", 3 * NEAR), T0 + 1);
    ctx("owner.testnet", 1, T0 + 2);
    let _ = v.withdraw(U128(8 * NEAR));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn loosening_actions_require_full_access_confirmation() {
    let mut v = setup();
    ctx("owner.testnet", 0, T0 + 1);
    v.unfreeze();
}

#[test]
#[should_panic(expected = "only the owner")]
fn agent_cannot_create_its_own_capsule() {
    let mut v = setup();
    ctx("agent.testnet", 1, T0 + 1);
    v.create_capsule(input(100 * NEAR, 100 * NEAR, None, T0 + 60_000));
}

#[test]
#[should_panic(expected = "only the owner")]
fn agent_cannot_revoke_or_freeze() {
    let mut v = setup();
    ctx("agent.testnet", 0, T0 + 1);
    v.freeze();
}

// --------------------------------------------------------- human review

#[test]
fn review_threshold_holds_request_until_owner_decides() {
    let mut v = setup();
    ctx("owner.testnet", 1, T0);
    v.create_capsule(input(3 * NEAR, 3 * NEAR, Some(NEAR / 2), T0 + 86_400_000)); // capsule #2
    let mut r = req(1, "vendor.testnet", NEAR);
    r.capsule_id = 2;
    let e = as_agent(&mut v, r, T0 + 1).unwrap();
    assert_eq!(e.decision, Decision::RequiresHumanReview);
    assert_eq!(e.status, RequestStatus::PendingReview);
    assert_eq!(v.get_overview().vault_balance.0, 9 * NEAR, "held amount is reserved");

    ctx("owner.testnet", 0, T0 + 2);
    match v.resolve_review(e.request_id, false) {
        PromiseOrValue::Value(x) => assert_eq!(x.reason, ReasonCode::OwnerRejected),
        _ => panic!("reject must not transfer"),
    }
    assert_eq!(v.get_overview().vault_balance.0, 10 * NEAR, "reservation released");
    assert_eq!(v.get_capsule(2).unwrap().reserved.0, 0);
}

#[test]
fn owner_approval_releases_held_request() {
    let mut v = setup();
    ctx("owner.testnet", 1, T0);
    v.create_capsule(input(3 * NEAR, 3 * NEAR, Some(NEAR / 2), T0 + 86_400_000));
    let mut r = req(1, "vendor.testnet", NEAR);
    r.capsule_id = 2;
    let e = as_agent(&mut v, r, T0 + 1).unwrap();
    ctx("owner.testnet", 1, T0 + 2);
    assert!(matches!(v.resolve_review(e.request_id, true), PromiseOrValue::Promise(_)));
    assert_eq!(v.get_request(e.request_id).unwrap().reason, ReasonCode::OwnerApproved);
    ctx("sentinel.testnet", 0, T0 + 3);
    assert_eq!(v.finalize_transfer(e.request_id, true).status, RequestStatus::Executed);
}

// ------------------------------------------------------ capsule validation

#[test]
#[should_panic(expected = "exceeds total limit")]
fn per_tx_above_total_is_rejected() {
    let mut v = setup();
    ctx("owner.testnet", 1, T0);
    v.create_capsule(input(5 * NEAR, 3 * NEAR, None, T0 + 60_000));
}

#[test]
#[should_panic(expected = "expiry is too soon")]
fn past_expiry_is_rejected() {
    let mut v = setup();
    ctx("owner.testnet", 1, T0);
    v.create_capsule(input(NEAR, NEAR, None, T0 - 1));
}

#[test]
#[should_panic(expected = "only native_transfer")]
fn unsupported_operation_is_rejected() {
    let mut v = setup();
    let mut i = input(NEAR, NEAR, None, T0 + 60_000);
    i.operation = "function_call".into();
    ctx("owner.testnet", 1, T0);
    v.create_capsule(i);
}

#[test]
#[should_panic(expected = "commitment mismatch")]
fn expected_commitment_must_match() {
    let mut v = setup();
    let mut i = input(NEAR, NEAR, None, T0 + 60_000);
    i.expected_commitment = Some("00".repeat(32));
    ctx("owner.testnet", 1, T0);
    v.create_capsule(i);
}

#[test]
fn amendment_creates_new_version_and_revokes_old() {
    let mut v = setup();
    ctx("owner.testnet", 1, T0 + 1);
    let c2 = v.amend_capsule(1, input(NEAR, 2 * NEAR, None, T0 + 3_600_000));
    assert_eq!(c2.version, 2);
    assert_eq!(c2.supersedes, Some(1));
    assert_eq!(v.get_capsule(1).unwrap().status, CapsuleStatus::Revoked);
    assert_ne!(c2.commitment, v.get_capsule(1).unwrap().commitment);
}

// ------------------------------------------------- commitment parity

/// Shared test vector with packages/engine/test/commitment.test.ts.
#[test]
fn commitment_matches_shared_vector() {
    ctx("sentinel.testnet", 0, T0);
    let v = SentinelVault::new(acc("owner.testnet"));
    let mut i = input(3 * NEAR, 3 * NEAR, None, 1_800_000_000_000);
    i.instruction = "Pay vendor.testnet up to 3 NEAR for invoice #1042".into();
    assert_eq!(
        v.preview_commitment(i, Some(1), None),
        "34161a6feb114b8786bbc63c3513c07ec5da342527bb7c4f544aac60ef9e5e3c"
    );
}

#[test]
fn fmt_near_matches_engine() {
    assert_eq!(fmt_near(3 * NEAR), "3 NEAR");
    assert_eq!(fmt_near(NEAR / 10), "0.1 NEAR");
    assert_eq!(fmt_near(1), "0.000000000000000000000001 NEAR");
}

// ------------------------------------------------ audit regressions

/// Audit finding H-1: a compromised agent must not be able to inflate contract storage
/// (which is paid from the same balance that holds vault funds) with oversized strings.
#[test]
fn oversized_agent_strings_are_clipped_before_storage() {
    let mut v = setup();
    let huge = "a".repeat(5_000);
    let mut r = req(1, &format!("{}.testnet", huge), NEAR);
    r.operation = huge.clone();
    r.asset = huge.clone();
    r.memo = Some(huge.clone());
    let e = as_agent(&mut v, r, T0 + 1).unwrap();
    assert_eq!(e.decision, Decision::Blocked);
    assert!(e.explanation.len() <= MAX_EXPLANATION_BYTES + 32);
    assert!(e.checks.iter().all(|c| c.detail.len() <= MAX_DETAIL_BYTES + 32));
    let stored = v.get_request(e.request_id).unwrap();
    assert!(stored.recipient.len() <= MAX_FIELD_BYTES + 32, "recipient stored at {} bytes", stored.recipient.len());
    assert!(stored.operation.len() <= MAX_FIELD_BYTES + 32);
    assert!(stored.asset.len() <= MAX_FIELD_BYTES + 32);
    assert!(stored.memo.unwrap().len() <= MAX_MEMO_BYTES + 32);
    assert!(stored.explanation.len() <= MAX_EXPLANATION_BYTES + 32);
    assert!(v.get_audit(Some(1))[0].detail.len() <= MAX_EXPLANATION_BYTES + 32);
}

#[test]
fn clipping_never_turns_a_mismatch_into_a_match() {
    let mut v = setup();
    // Authorized recipient followed by padding must still be a different recipient.
    let padded = format!("vendor.testnet{}", "x".repeat(200));
    let e = as_agent(&mut v, req(1, &padded, NEAR), T0 + 1).unwrap();
    assert_eq!(e.reason, ReasonCode::RecipientMismatch);
}

#[test]
fn clip_respects_utf8_boundaries() {
    let s = "é".repeat(100); // 2 bytes per char
    let c = clip(&s, 65);
    assert!(c.starts_with(&"é".repeat(32)));
    assert_eq!(clip("short", 64), "short");
}

/// Boundary checks the attack scenarios rely on.
/// One vault per test: the mocked blockchain keeps storage for the whole test thread,
/// so calling setup() twice in one test would re-register the same agent.
#[test]
fn exact_limits_are_inclusive_and_one_yocto_over_is_blocked() {
    let mut v = setup();
    assert!(as_agent(&mut v, req(1, "vendor.testnet", 3 * NEAR), T0 + 1).is_none(), "exactly the per-tx limit is allowed");
    let e = as_agent(&mut v, req(2, "vendor.testnet", 3 * NEAR + 1), T0 + 2).unwrap();
    assert_eq!(e.reason, ReasonCode::AmountExceedsTxLimit);
}

#[test]
fn request_at_exact_expiry_instant_is_expired() {
    let mut v = setup();
    let e = as_agent(&mut v, req(1, "vendor.testnet", NEAR), T0 + 86_400_000).unwrap();
    assert_eq!(e.reason, ReasonCode::CapsuleExpired);
}

#[test]
fn lookalike_recipients_are_blocked() {
    let mut v = setup();
    let fakes = ["Vendor.testnet", "vendor.testnet ", "vеndor.testnet" /* Cyrillic e */, "vendor.testnet.evil.testnet"];
    for (i, fake) in fakes.iter().enumerate() {
        // Each blocked attempt consumes its nonce, so the next attempt uses the next one.
        let e = as_agent(&mut v, req(i as u64 + 1, fake, NEAR), T0 + 1 + i as u64).unwrap();
        assert_eq!(e.reason, ReasonCode::RecipientMismatch, "{fake}");
    }
    assert_eq!(v.get_overview().vault_balance.0, 10 * NEAR, "no funds moved");
}

#[test]
#[should_panic(expected = "only the owner")]
fn agent_cannot_resolve_its_own_review() {
    let mut v = setup();
    ctx("owner.testnet", 1, T0);
    v.create_capsule(input(3 * NEAR, 3 * NEAR, Some(NEAR / 2), T0 + 86_400_000));
    let mut r = req(1, "vendor.testnet", NEAR);
    r.capsule_id = 2;
    let e = as_agent(&mut v, r, T0 + 1).unwrap();
    ctx("agent.testnet", 1, T0 + 2);
    let _ = v.resolve_review(e.request_id, true);
}

#[test]
#[should_panic(expected = "only the owner")]
fn agent_cannot_withdraw() {
    let mut v = setup();
    ctx("agent.testnet", 1, T0 + 1);
    let _ = v.withdraw(U128(NEAR));
}

#[test]
#[should_panic(expected = "only the owner")]
fn agent_cannot_reinstate_itself() {
    let mut v = setup();
    ctx("owner.testnet", 0, T0 + 1);
    v.revoke_agent(acc("agent.testnet"));
    ctx("agent.testnet", 1, T0 + 2);
    v.reinstate_agent(acc("agent.testnet"));
}
