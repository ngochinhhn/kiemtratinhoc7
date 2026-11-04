# SmartTest 7 — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Default Deny Safety Net**: Any path not explicitly matched under `/databases/{database}/documents` is unconditionally denied (`allow read, write: if false`).
2. **Verified Identity Invariant**: All authenticated reads and writes require a non-null `request.auth` with `request.auth.token.email_verified == true`. Unverified email claims are rejected even if the email string matches the bootstrapped administrator (`ngochinhhn@gmail.com`).
3. **Path Variable Hardening (`isValidId`)**: Every single-document operation (`get`, `create`, `update`, `delete`) validates document ID path variables against `^[a-zA-Z0-9_\-]+$` with length `1..128`. `isValidId` is omitted from `list` rules to avoid unnecessary evaluation overhead.
4. **Master Gate Relational Invariant**: An `ExamSessionDocument` at `/exams/{examId}/sessions/{sessionId}` cannot be created, read, updated, or deleted unless its parent `/exams/{examId}` document exists (`exists(...)` / `get(...)`) and `incoming().examId == examId`.
5. **Strict Schema Blueprint (`hasAll` & `hasOnly`)**: Every `create` and `update` call invokes `isValid[Entity](incoming())`, enforcing exact key allowlists, string length bounds (`minLength`..`maxLength`), regex patterns (`^[a-zA-Z0-9_\-]+$`), enum membership, and bounded arrays (`classes.size() <= 30`, `questionIds.size() <= 100`).
6. **Temporal & Immutable Field Integrity**: On `create`, `createdAt == request.time` and `updatedAt == request.time`. On `update`, `createdAt == existing().createdAt`, `ownerId == existing().ownerId`, and `updatedAt == request.time`.
7. **Terminal State Locking**: Once an `ExamDocument` reaches `status == 'da_ket_thuc'` or an `ExamSessionDocument` reaches `status == 'da_nop_bai'`, non-admin updates are locked unless overridden by a verified administrator (`isAdmin()`).
8. **Query Enforcer on `list`**: Every `allow list` rule evaluates `resource.data.ownerId == request.auth.uid` (or `resource.data.status == 'dang_dien_ra'`) without performing `get()` or `exists()` lookups.

---

## 2. The "Dirty Dozen" Payloads (Adversarial Test Cases)

1. **Payload 1 — Unverified Email Spoofing on `/admins/{adminId}`**:
   - Auth: `{ uid: "attacker_1", email: "ngochinhhn@gmail.com", email_verified: false }`
   - Expected: `PERMISSION_DENIED` (blocks email spoofing when `email_verified != true`).
2. **Payload 2 — Shadow Field Injection on `/questions/{questionId}`**:
   - Payload includes all required fields plus `"isSuperVerified": true`.
   - Expected: `PERMISSION_DENIED` (`keys().hasOnly(...)` blocks ghost fields).
3. **Payload 3 — Cross-User Identity Spoofing (`ownerId` mismatch)**:
   - Authenticated user `uid: "teacher_a"` creates `/questions/q_1` with `ownerId: "teacher_b"`.
   - Expected: `PERMISSION_DENIED` (`data.ownerId == request.auth.uid` fails).
4. **Payload 4 — Path Variable Poisoning (Invalid ID format)**:
   - Target path `/questions/bad$id!with spaces` or ID length > 128 chars.
   - Expected: `PERMISSION_DENIED` (`isValidId(questionId)` fails).
5. **Payload 5 — Forged Client Timestamp (`createdAt != request.time`)**:
   - Client sends past/future timestamp instead of `request.time` on `create`.
   - Expected: `PERMISSION_DENIED` (`incoming().createdAt == request.time` fails).
6. **Payload 6 — Immutable `createdAt` Tampering on `update`**:
   - Client updates `/exams/exam_1` and modifies `createdAt`.
   - Expected: `PERMISSION_DENIED` (`incoming().createdAt == existing().createdAt` fails).
7. **Payload 7 — Terminal State Unlocking on Completed ExamSession**:
   - Non-admin user attempts to update `/exams/exam_1/sessions/sess_1` after `existing().status == 'da_nop_bai'`.
   - Expected: `PERMISSION_DENIED` (Terminal State Lock).
8. **Payload 8 — Orphaned Subcollection Write (Master Gate Violation)**:
   - User attempts to create `/exams/non_existent_exam/sessions/sess_1` where `/exams/non_existent_exam` does not exist.
   - Expected: `PERMISSION_DENIED` (Master Gate `exists(/databases/$(database)/documents/exams/$(examId))` fails).
9. **Payload 9 — Unbounded Array Exhaustion on `/exams/{examId}`**:
   - Client sends `questionIds` array with 150 elements (exceeding `max <= 100`).
   - Expected: `PERMISSION_DENIED` (`data.questionIds.size() <= 100` fails).
10. **Payload 10 — Array Element Type Poisoning on `/exams/{examId}`**:
    - Client sends `classes: [12345]` (number instead of string at index 0).
    - Expected: `PERMISSION_DENIED` (`data.classes[0] is string` fails).
11. **Payload 11 — Unauthorized PII Read on `/students/{studentId}`**:
    - Authenticated user `uid: "stranger_uid"` attempts `get` on `/students/st_1` owned by `teacher_uid`.
    - Expected: `PERMISSION_DENIED` (`existing().ownerId == request.auth.uid || isAdmin()` fails).
12. **Payload 12 — Value Poisoning on Whitelisted Update Field**:
    - Owner updates whitelisted `title` field on `/exams/exam_1` with a 5,000-character string (exceeding `maxLength: 300`).
    - Expected: `PERMISSION_DENIED` (`isValidExamDocument(incoming())` wraps the update block and rejects oversized string).
