import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Verifies firestore.rules configuration for SMART TEST 7 collections
 */
describe('Firestore Security Rules Verification', () => {
  const rootDir = process.cwd();
  const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf-8');

  it('uses rules_version = 2', () => {
    assert.ok(rulesText.includes("rules_version = '2';"));
  });

  it('defines open read/write rules for all required SMART TEST 7 collections', () => {
    assert.ok(rulesText.includes('match /questions/{questionId}'));
    assert.ok(rulesText.includes('match /exams/{examId}'));
    assert.ok(rulesText.includes('match /sessions/{sessionId}'));
    assert.ok(rulesText.includes('match /students/{studentId}'));
    assert.ok(rulesText.includes('match /submissions/{submissionId}'));
    assert.ok(rulesText.includes('match /results/{resultId}'));
    assert.ok(rulesText.includes('match /settings/{settingId}'));
    assert.ok(rulesText.includes('match /{document=**}'));
    assert.ok(rulesText.includes('allow read, write: if true;'));
  });
});
