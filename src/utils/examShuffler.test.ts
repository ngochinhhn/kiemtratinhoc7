import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentExamPaper, getDisplayQuestionsForStudent } from './examShuffler';
import { Question } from '../types';

const sampleQuestions: Question[] = [
  {
    id: 'q1',
    themeId: 'chu_de_1',
    themeName: 'Chủ đề 1: Máy tính và cộng đồng',
    lessonId: 'bai_1',
    lessonName: 'Bài 1: Thiết bị vào - ra',
    content: 'Thiết bị nào sau đây là thiết bị vào của máy tính?',
    options: [
      { id: 'opt_1_a', label: 'A', content: 'Bàn phím' },
      { id: 'opt_1_b', label: 'B', content: 'Màn hình' },
      { id: 'opt_1_c', label: 'C', content: 'Máy in' },
      { id: 'opt_1_d', label: 'D', content: 'Loa' },
    ],
    correctOptionId: 'opt_1_a',
    cognitiveLevel: 'nhan_biet',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '2026-10-29',
    updatedAt: '2026-10-29',
  },
  {
    id: 'q2',
    themeId: 'chu_de_1',
    themeName: 'Chủ đề 1: Máy tính và cộng đồng',
    lessonId: 'bai_2',
    lessonName: 'Bài 2: Phần mềm ứng dụng',
    content: 'Phần mềm nào sau đây là phần mềm bảng tính?',
    options: [
      { id: 'opt_2_a', label: 'A', content: 'Microsoft Word' },
      { id: 'opt_2_b', label: 'B', content: 'Microsoft Excel' },
      { id: 'opt_2_c', label: 'C', content: 'Paint' },
      { id: 'opt_2_d', label: 'D', content: 'Windows Explorer' },
    ],
    correctOptionId: 'opt_2_b',
    cognitiveLevel: 'nhan_biet',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '2026-10-29',
    updatedAt: '2026-10-29',
  },
  {
    id: 'q3',
    themeId: 'chu_de_2',
    themeName: 'Chủ đề 2: Mạng máy tính và Internet',
    lessonId: 'bai_4',
    lessonName: 'Bài 4: Mạng xã hội',
    content: 'Ứng dụng nào sau đây là một mạng xã hội phổ biến?',
    options: [
      { id: 'opt_3_a', label: 'A', content: 'Facebook' },
      { id: 'opt_3_b', label: 'B', content: 'Notepad' },
      { id: 'opt_3_c', label: 'C', content: 'Calculator' },
      { id: 'opt_3_d', label: 'D', content: 'Command Prompt' },
    ],
    correctOptionId: 'opt_3_a',
    cognitiveLevel: 'nhan_biet',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '2026-10-29',
    updatedAt: '2026-10-29',
  },
];

test('createStudentExamPaper generates student specific paperCode and preserves snapshots', () => {
  const paper1 = createStudentExamPaper('hs_01', 'exam_1', 0, sampleQuestions, true, true);
  const paper2 = createStudentExamPaper('hs_02', 'exam_1', 1, sampleQuestions, true, true);

  assert.equal(paper1.paperCode, 'MD701');
  assert.equal(paper2.paperCode, 'MD702');
  assert.equal(paper1.questionOrder.length, 3);
  assert.equal(paper2.questionOrder.length, 3);

  // Snapshot contains all 3 questions
  assert.equal(paper1.questionSnapshots.length, 3);
});

test('getDisplayQuestionsForStudent formats options with re-labeled A, B, C, D but retains correct original IDs', () => {
  const paper = createStudentExamPaper('hs_01', 'exam_1', 0, sampleQuestions, true, true);
  const displayQuestions = getDisplayQuestionsForStudent(paper);

  assert.equal(displayQuestions.length, 3);
  const firstQ = displayQuestions[0];

  assert.equal(firstQ.options.length, 4);
  assert.deepEqual(
    firstQ.options.map((o) => o.label),
    ['A', 'B', 'C', 'D']
  );

  // ID correct must still match one of the options
  const hasCorrectOption = firstQ.options.some((o) => o.id === firstQ.correctOptionId);
  assert.equal(hasCorrectOption, true);
});
