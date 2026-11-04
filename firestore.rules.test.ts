import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Verifies the "Dirty Dozen" adversarial payloads and Eight Pillars of Hardened Rules
 * against firestore.rules and firebase-blueprint.json.
 */
describe('Firestore Security Rules & Blueprint TDD Verification', () => {
  const rootDir = process.cwd();
  const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf-8');
  const blueprint = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'firebase-blueprint.json'), 'utf-8')
  );

  it('enforces global default-deny safety net and rules_version = 2', () => {
    assert.ok(rulesText.includes("rules_version = '2';"));
    assert.ok(rulesText.includes('match /{document=**}'));
    assert.ok(rulesText.includes('allow read, write: if false;'));
  });

  it('secures every collection path declared in firebase-blueprint.json', () => {
    const paths = Object.keys(blueprint.firestore || {});
    assert.ok(paths.includes('/admins/{adminId}'));
    assert.ok(paths.includes('/questions/{questionId}'));
    assert.ok(paths.includes('/students/{studentId}'));
    assert.ok(paths.includes('/exams/{examId}'));
    assert.ok(paths.includes('/exams/{examId}/sessions/{sessionId}'));

    assert.ok(rulesText.includes('match /admins/{adminId}'));
    assert.ok(rulesText.includes('match /questions/{questionId}'));
    assert.ok(rulesText.includes('match /students/{studentId}'));
    assert.ok(rulesText.includes('match /exams/{examId}'));
    assert.ok(rulesText.includes('match /sessions/{sessionId}'));
  });

  it('rejects Dirty Dozen payloads via structural and relational rule gates', () => {
    // 1. Unverified email spoofing blocked
    assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
    assert.ok(rulesText.includes("request.auth.token.email == 'ngochinhhn@gmail.com'"));

    // 2. Shadow field injection blocked via hasAll + hasOnly
    assert.ok(rulesText.includes('data.keys().hasAll('));
    assert.ok(rulesText.includes('data.keys().hasOnly('));

    // 3. Cross-user ownerId spoofing blocked via isTrustedOwnerId and immutable ownerId
    assert.ok(rulesText.includes('isTrustedOwnerId(data.ownerId)'));
    assert.ok(rulesText.includes('incoming().ownerId == existing().ownerId'));

    // 4. Path variable poisoning blocked via isValidId
    assert.ok(
      rulesText.includes(
        "id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$')"
      )
    );

    // 5 & 6. Temporal integrity & immutable createdAt enforced
    assert.ok(rulesText.includes('incoming().createdAt == request.time'));
    assert.ok(rulesText.includes('incoming().updatedAt == request.time'));
    assert.ok(rulesText.includes('incoming().createdAt == existing().createdAt'));

    // 7 & 8. Master Gate relational check on /sessions/{sessionId}
    assert.ok(
      rulesText.includes('exists(/databases/$(database)/documents/exams/$(examId))')
    );

    // 9 & 10. Bounded array guards on classes and questionIds
    assert.ok(
      rulesText.includes('data.classes is list && data.classes.size() >= 1 && data.classes.size() <= 30')
    );
    assert.ok(
      rulesText.includes(
        'data.questionIds is list && data.questionIds.size() >= 1 && data.questionIds.size() <= 100'
      )
    );

    // 11 & 12. Query enforcer on list and validation helper wrapping update
    assert.ok(rulesText.includes('allow list: if isTrustedOwnerId(resource.data.ownerId);'));
    assert.ok(rulesText.includes('isValidExamDocument(incoming())'));
  });
});
