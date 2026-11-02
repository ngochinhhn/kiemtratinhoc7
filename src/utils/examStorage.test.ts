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

  it('never re-adds deleted questions on ensureInitialized and cleans auto-appended seed questions (#47-#74)', () => {
    const storage = AppStorage.getInstance();
    storage.resetToDefaults();

    // Simulate user importing 46 PDF questions (#1 - #46) and having 28 SEED_QUESTIONS (#47 - #74) appended
    const pdfQuestions = Array.from({ length: 46 }, (_, i) => ({
      id: `pdf_q_${i + 1}`,
      themeId: 'chu_de_1',
      themeName: 'Chủ đề 1: Máy tính và cộng đồng',
      lessonId: 'bai_1',
      lessonName: 'Bài 1: Thiết bị vào - ra',
      content: `Câu hỏi PDF số ${i + 1} (đã chỉnh sửa)`,
      options: [
        { id: `opt_${i}_a`, label: 'A' as const, content: 'Phương án A' },
        { id: `opt_${i}_b`, label: 'B' as const, content: 'Phương án B' },
        { id: `opt_${i}_c`, label: 'C' as const, content: 'Phương án C' },
        { id: `opt_${i}_d`, label: 'D' as const, content: 'Phương án D' },
      ],
      correctOptionId: `opt_${i}_a`,
      cognitiveLevel: 'nhan_biet' as const,
      reviewStatus: 'da_kiem_duyet' as const,
      sourcePage: 1,
      sourceBook: 'Cau_hoi_chu_de_1-3.pdf',
      createdAt: '2026-11-01',
      updatedAt: '2026-11-01',
    }));

    const seedQuestions = storage.getQuestions();
    assert.strictEqual(seedQuestions.length, 28);

    // Simulate contaminated state with 46 PDF questions + 28 seed questions = 74 questions
    globalThis.localStorage.removeItem('smarttest7_cleaned_auto_seed_v1');
    globalThis.localStorage.setItem(
      'smarttest7_questions_v1',
      JSON.stringify([...pdfQuestions, ...seedQuestions])
    );

    // Clear memory cache by re-running ensureInitialized after reset simulation
    storage.saveQuestions([...pdfQuestions, ...seedQuestions]);
    globalThis.localStorage.removeItem('smarttest7_cleaned_auto_seed_v1');
    globalThis.localStorage.removeItem('smarttest7_deleted_qids_v1');
    storage.ensureInitialized();

    const afterCleanup = storage.getQuestions();
    assert.strictEqual(afterCleanup.length, 46);
    assert.ok(afterCleanup.every((q) => q.id.startsWith('pdf_q_')));

    // Now delete 6 unsuitable questions and edit question #1
    const editedAndFiltered = afterCleanup.slice(0, 40).map((q, idx) =>
      idx === 0 ? { ...q, content: 'Câu hỏi PDF số 1 đã được giáo viên sửa nội dung' } : q
    );
    storage.saveQuestions(editedAndFiltered);

    // Calling ensureInitialized again must NEVER re-add any deleted questions
    storage.ensureInitialized();
    const finalQuestions = storage.getQuestions();
    assert.strictEqual(finalQuestions.length, 40);
    assert.strictEqual(
      finalQuestions[0].content,
      'Câu hỏi PDF số 1 đã được giáo viên sửa nội dung'
    );
  });
});
