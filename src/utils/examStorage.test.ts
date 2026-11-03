import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AppStorage } from './storage';
import { Exam } from '../types';

// Mock localStorage for node environment
const storageMock: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => storageMock[key] ?? null,
  setItem: (key: string, value: string) => {
    storageMock[key] = value;
  },
  removeItem: (key: string) => {
    delete storageMock[key];
  },
  clear: () => {
    for (const k in storageMock) delete storageMock[k];
  },
  key: (i: number) => Object.keys(storageMock)[i] ?? null,
  length: 0,
};

describe('examStorage operations', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('updateExam should update existing exam or add new if not found', () => {
    const storage = AppStorage.getInstance();
    const testExam: Exam = {
      id: 'exam_test_1',
      title: 'Đề kiểm tra thử',
      type: '15_phut',
      classes: ['7A'],
      durationMinutes: 15,
      totalQuestions: 5,
      maxScore: 10,
      questionIds: ['q1', 'q2'],
      status: 'chua_mo',
      allowReviewAfterSubmit: true,
      shuffleQuestions: true,
      shuffleOptions: true,
      createdAt: '2026-10-30',
    };

    storage.saveExams([testExam]);
    let exams = storage.getExams();
    assert.strictEqual(exams.length, 1);
    assert.strictEqual(exams[0].title, 'Đề kiểm tra thử');

    // Update the exam title and duration
    storage.updateExam({
      ...testExam,
      title: 'Đề kiểm tra thử đã sửa',
      durationMinutes: 20,
    });

    exams = storage.getExams();
    assert.strictEqual(exams.length, 1);
    assert.strictEqual(exams[0].title, 'Đề kiểm tra thử đã sửa');
    assert.strictEqual(exams[0].durationMinutes, 20);
  });

  it('deleteExam should remove exam and clean up associated papers and sessions', () => {
    const storage = AppStorage.getInstance();
    const testExam: Exam = {
      id: 'exam_to_delete',
      title: 'Đề cần xóa',
      type: '15_phut',
      classes: ['7A'],
      durationMinutes: 15,
      totalQuestions: 2,
      maxScore: 10,
      questionIds: ['q1', 'q2'],
      status: 'chua_mo',
      allowReviewAfterSubmit: true,
      shuffleQuestions: true,
      shuffleOptions: true,
      createdAt: '2026-10-30',
    };

    storage.saveExams([testExam]);
    storage.savePapers({
      'student1_exam_to_delete': {
        paperCode: 'MD701',
        examId: 'exam_to_delete',
        studentId: 'student1',
        questionOrder: ['q1', 'q2'],
        optionOrders: {},
        questionSnapshots: [],
      },
    });

    assert.strictEqual(storage.getExams().length, 1);
    assert.ok(storage.getPapers()['student1_exam_to_delete']);

    // Perform deletion
    storage.deleteExam('exam_to_delete');

    assert.strictEqual(storage.getExams().length, 0);
    assert.strictEqual(storage.getPapers()['student1_exam_to_delete'], undefined);
  });

  it('never re-adds deleted questions on ensureInitialized and cleans auto-appended legacy kntt_ seed questions', () => {
    const storage = AppStorage.getInstance();
    storage.resetToDefaults();

    const seedQuestions = storage.getQuestions();
    assert.strictEqual(seedQuestions.length, 46);

    // Simulate legacy kntt_ questions accidentally appended after PDF questions
    const legacyKnttQuestions = Array.from({ length: 5 }, (_, i) => ({
      id: `kntt_c1_b1_0${i + 1}`,
      themeId: 'chu_de_1',
      themeName: 'Chủ đề 1: Máy tính và cộng đồng',
      lessonId: 'bai_1',
      lessonName: 'Bài 1: Thiết bị vào - ra',
      content: `Câu hỏi mẫu cũ ${i + 1}`,
      options: [
        { id: `opt_k_${i}_a`, label: 'A' as const, content: 'Phương án A' },
        { id: `opt_k_${i}_b`, label: 'B' as const, content: 'Phương án B' },
        { id: `opt_k_${i}_c`, label: 'C' as const, content: 'Phương án C' },
        { id: `opt_k_${i}_d`, label: 'D' as const, content: 'Phương án D' },
      ],
      correctOptionId: `opt_k_${i}_a`,
      cognitiveLevel: 'nhan_biet' as const,
      reviewStatus: 'da_kiem_duyet' as const,
      createdAt: '2026-10-29',
      updatedAt: '2026-10-29',
    }));

    storage.saveQuestions([...seedQuestions, ...legacyKnttQuestions]);
    globalThis.localStorage.removeItem('smarttest7_cleaned_auto_seed_v1');
    globalThis.localStorage.removeItem('smarttest7_deleted_qids_v1');
    storage.ensureInitialized();

    const afterCleanup = storage.getQuestions();
    assert.strictEqual(afterCleanup.length, 46);
    assert.ok(afterCleanup.every((q) => !q.id.startsWith('kntt_')));

    // Now delete 6 unsuitable questions and edit question #1
    const editedAndFiltered = afterCleanup.slice(0, 40).map((q, idx) =>
      idx === 0 ? { ...q, content: 'Câu hỏi số 1 đã được giáo viên sửa nội dung' } : q
    );
    storage.saveQuestions(editedAndFiltered);

    // Calling ensureInitialized again must NEVER re-add any deleted questions
    storage.ensureInitialized();
    const finalQuestions = storage.getQuestions();
    assert.strictEqual(finalQuestions.length, 40);
    assert.strictEqual(
      finalQuestions[0].content,
      'Câu hỏi số 1 đã được giáo viên sửa nội dung'
    );
  });

  it('flushRepoSyncBeforeLogout sends current questions, classes, students, exams, and config to /api/sync-repo-data', async () => {
    const storage = AppStorage.getInstance();
    storage.resetToDefaults();

    let capturedPayload: Record<string, unknown> | null = null;
    const prevWindow = (globalThis as Record<string, unknown>).window;
    const prevFetch = globalThis.fetch;

    try {
      (globalThis as Record<string, unknown>).window = { document: {} };
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) {
          capturedPayload = JSON.parse(init.body as string);
        }
        return {
          ok: true,
          json: async () => ({
            ok: true,
            syncId: 'sync_test_logout',
            updatedAt: '2026-11-02T15:30:00.000Z',
            counts: {
              questions: 46,
              classes: 5,
              students: 225,
              exams: 7,
            },
          }),
        } as Response;
      }) as typeof fetch;

      storage.addClass('7A11');
      const result = await storage.flushRepoSyncBeforeLogout();

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.updatedAt, '2026-11-02T15:30:00.000Z');
      assert.ok(capturedPayload);
      assert.ok(Array.isArray((capturedPayload as { classes: string[] }).classes));
      assert.ok((capturedPayload as { classes: string[] }).classes.includes('7A11'));
      assert.strictEqual(
        (capturedPayload as { questions: unknown[] }).questions.length,
        46
      );
      assert.strictEqual(
        (capturedPayload as { students: unknown[] }).students.length,
        225
      );
      assert.strictEqual((capturedPayload as { exams: unknown[] }).exams.length, 7);
    } finally {
      (globalThis as Record<string, unknown>).window = prevWindow;
      globalThis.fetch = prevFetch;
    }
  });

  it('activateExam allows multiple exams to run simultaneously and saveSession persists student score into class list', () => {
    const storage = AppStorage.getInstance();
    storage.resetToDefaults();

    const exams = storage.getExams();
    assert.ok(exams.length >= 2);
    const exam1Id = exams[0].id;
    const exam2Id = exams[1].id;

    storage.activateExam(exam1Id);
    storage.activateExam(exam2Id);

    const runningAfterBoth = storage
      .getExams()
      .filter((e) => e.status === 'dang_dien_ra')
      .map((e) => e.id);
    assert.ok(runningAfterBoth.includes(exam1Id), 'First exam should remain running');
    assert.ok(runningAfterBoth.includes(exam2Id), 'Second exam should also be running');

    // Submit a student session and verify the score is saved into the student record in class list
    const firstStudent = storage.getStudents()[0];
    assert.ok(firstStudent);

    storage.saveSession({
      id: `sess_${firstStudent.id}_${exam1Id}`,
      examId: exam1Id,
      studentId: firstStudent.id,
      paperCode: 'MD701',
      status: 'da_nop_bai',
      submittedAt: '2026-11-02T19:00:00.000Z',
      timeRemainingSeconds: 0,
      answers: {},
      score: 9.5,
      correctCount: 19,
      wrongCount: 1,
      unansweredCount: 0,
      lastHeartbeat: '2026-11-02T19:00:00.000Z',
    });

    const updatedStudent = storage.getStudents().find((s) => s.id === firstStudent.id);
    assert.strictEqual(updatedStudent?.latestScore, 9.5);
    assert.strictEqual(updatedStudent?.latestExamId, exam1Id);
    assert.strictEqual(updatedStudent?.examScores?.[exam1Id]?.score, 9.5);
  });
});
