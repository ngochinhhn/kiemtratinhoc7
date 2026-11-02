import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compactPapersForStorage, hydratePapersFromStorage } from './storage';
import { createStudentExamPaper, getDisplayQuestionsForStudent } from './examShuffler';
import { SEED_QUESTIONS } from '../data/seedQuestions';
import { Question, StudentExamPaper } from '../types';

describe('storage compaction and hydration for StudentExamPaper', () => {
  it('compacts 60 student exam papers with large imageUrl snapshots by >95% and rehydrates faithfully', () => {
    const fakeBase64Image = 'data:image/png;base64,' + 'A'.repeat(60_000);
    const questionsWithImages: Question[] = SEED_QUESTIONS.slice(0, 10).map((q, idx) => ({
      ...q,
      imageUrl: idx < 4 ? fakeBase64Image : undefined,
      imageCaption: idx < 4 ? `Hình 1.${idx + 1}` : undefined,
    }));

    const originalPapers: Record<string, StudentExamPaper> = {};
    for (let i = 0; i < 60; i++) {
      const studentId = `hs_${i + 1}`;
      const examId = 'exam_test_quota';
      originalPapers[`${studentId}_${examId}`] = createStudentExamPaper(
        studentId,
        examId,
        i,
        questionsWithImages,
        true,
        true
      );
    }

    const uncompactedSize = JSON.stringify(originalPapers).length;
    const knownIds = new Set(questionsWithImages.map((q) => q.id));
    const compactedPapers = compactPapersForStorage(originalPapers, knownIds);
    const compactedSize = JSON.stringify(compactedPapers).length;

    // Uncompacted size for 60 students * 4 * 60KB is > 14MB; compacted size is < 60KB
    assert.ok(uncompactedSize > 10_000_000, `Expected uncompacted > 10MB, got ${uncompactedSize}`);
    assert.ok(compactedSize < 80_000, `Expected compacted < 80KB, got ${compactedSize}`);

    const hydratedPapers = hydratePapersFromStorage(compactedPapers, questionsWithImages);
    assert.strictEqual(Object.keys(hydratedPapers).length, 60);

    for (let i = 0; i < 60; i++) {
      const key = `hs_${i + 1}_exam_test_quota`;
      const orig = originalPapers[key];
      const hydr = hydratedPapers[key];

      assert.strictEqual(hydr.paperCode, orig.paperCode);
      assert.deepStrictEqual(hydr.questionOrder, orig.questionOrder);
      assert.deepStrictEqual(hydr.optionOrders, orig.optionOrders);
      assert.strictEqual(hydr.questionSnapshots.length, 10);

      // Display questions for student should match identically including imageUrl
      const origDisplay = getDisplayQuestionsForStudent(orig);
      const hydrDisplay = getDisplayQuestionsForStudent(hydr);
      assert.strictEqual(hydrDisplay.length, origDisplay.length);

      for (let qIdx = 0; qIdx < origDisplay.length; qIdx++) {
        assert.strictEqual(hydrDisplay[qIdx].id, origDisplay[qIdx].id);
        assert.strictEqual(hydrDisplay[qIdx].imageUrl, origDisplay[qIdx].imageUrl);
        assert.deepStrictEqual(
          hydrDisplay[qIdx].options,
          origDisplay[qIdx].options
        );
      }
    }
  });
});
