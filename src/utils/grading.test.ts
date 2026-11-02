import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeStudentExam,
  calculateExamResultSummary,
  getQuestionType,
  normalizeQuestionStructure,
} from './grading';
import { Question, StudentExamSession } from '../types';

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
    ],
    correctOptionId: 'opt_2_b',
    cognitiveLevel: 'nhan_biet',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '2026-10-29',
    updatedAt: '2026-10-29',
  },
];

test('gradeStudentExam calculates score based on correctOptionId', () => {
  // 1 correct, 1 wrong -> 5.0 / 10
  const result1 = gradeStudentExam(
    {
      q1: { questionId: 'q1', selectedOptionId: 'opt_1_a' },
      q2: { questionId: 'q2', selectedOptionId: 'opt_2_a' }, // wrong
    },
    sampleQuestions,
    10
  );

  assert.equal(result1.score, 5.0);
  assert.equal(result1.correctCount, 1);
  assert.equal(result1.wrongCount, 1);
  assert.equal(result1.unansweredCount, 0);

  // 2 correct -> 10.0 / 10
  const result2 = gradeStudentExam(
    {
      q1: { questionId: 'q1', selectedOptionId: 'opt_1_a' },
      q2: { questionId: 'q2', selectedOptionId: 'opt_2_b' },
    },
    sampleQuestions,
    10
  );

  assert.equal(result2.score, 10.0);
  assert.equal(result2.correctCount, 2);
  assert.equal(result2.wrongCount, 0);
});

test('calculateExamResultSummary computes average, min, max, and question percent', () => {
  const sessions: StudentExamSession[] = [
    {
      id: 's1',
      examId: 'e1',
      studentId: 'hs1',
      paperCode: 'MD701',
      status: 'da_nop_bai',
      score: 10,
      timeRemainingSeconds: 0,
      answers: {
        q1: { questionId: 'q1', selectedOptionId: 'opt_1_a' },
        q2: { questionId: 'q2', selectedOptionId: 'opt_2_b' },
      },
      lastHeartbeat: '2026-10-29',
    },
    {
      id: 's2',
      examId: 'e1',
      studentId: 'hs2',
      paperCode: 'MD702',
      status: 'da_nop_bai',
      score: 5,
      timeRemainingSeconds: 0,
      answers: {
        q1: { questionId: 'q1', selectedOptionId: 'opt_1_a' },
        q2: { questionId: 'q2', selectedOptionId: 'opt_2_a' }, // wrong
      },
      lastHeartbeat: '2026-10-29',
    },
  ];

  const summary = calculateExamResultSummary('e1', 'Kiểm tra 15p', '7A', sessions, sampleQuestions);

  assert.equal(summary.totalStudents, 2);
  assert.equal(summary.submittedCount, 2);
  assert.equal(summary.averageScore, 7.5);
  assert.equal(summary.highestScore, 10);
  assert.equal(summary.lowestScore, 5);
  assert.equal(summary.questionStats[0].correctPercent, 100); // cả 2 đúng câu 1
  assert.equal(summary.questionStats[1].correctPercent, 50); // 1 đúng câu 2
});

test('gradeStudentExam supports True/False (Bộ GD&ĐT 4-statement scale) and Matching questions', () => {
  const mixedQuestions: Question[] = [
    sampleQuestions[0], // multiple_choice
    {
      id: 'q_tf',
      type: 'true_false',
      themeId: 'chu_de_1',
      themeName: 'Chủ đề 1: Máy tính và cộng đồng',
      lessonId: 'bai_1',
      lessonName: 'Bài 1: Thiết bị vào - ra',
      content: 'Xét tính Đúng/Sai của các phát biểu sau:',
      options: [],
      correctOptionId: '',
      statements: [
        { id: 's_a', label: 'a', content: 'Ý a', isTrue: true },
        { id: 's_b', label: 'b', content: 'Ý b', isTrue: false },
        { id: 's_c', label: 'c', content: 'Ý c', isTrue: true },
        { id: 's_d', label: 'd', content: 'Ý d', isTrue: false },
      ],
      cognitiveLevel: 'thong_hieu',
      reviewStatus: 'da_kiem_duyet',
      createdAt: '2026-10-29',
      updatedAt: '2026-10-29',
    },
    {
      id: 'q_match',
      type: 'matching',
      themeId: 'chu_de_1',
      themeName: 'Chủ đề 1: Máy tính và cộng đồng',
      lessonId: 'bai_1',
      lessonName: 'Bài 1: Thiết bị vào - ra',
      content: 'Hãy ghép Cột A với Cột B:',
      options: [],
      correctOptionId: '',
      matchingPairs: [
        { id: 'p1', leftLabel: '1', leftContent: 'Bàn phím', rightLabel: 'A', rightContent: 'Nhập văn bản' },
        { id: 'p2', leftLabel: '2', leftContent: 'Màn hình', rightLabel: 'B', rightContent: 'Hiển thị hình ảnh' },
        { id: 'p3', leftLabel: '3', leftContent: 'Loa', rightLabel: 'C', rightContent: 'Phát âm thanh' },
        { id: 'p4', leftLabel: '4', leftContent: 'Máy quét', rightLabel: 'D', rightContent: 'Đưa ảnh vào máy' },
      ],
      cognitiveLevel: 'van_dung',
      reviewStatus: 'da_kiem_duyet',
      createdAt: '2026-10-29',
      updatedAt: '2026-10-29',
    },
  ];

  // Tất cả 3 câu đúng tuyệt đối -> 10.0 điểm
  const perfect = gradeStudentExam(
    {
      q1: { questionId: 'q1', selectedOptionId: 'opt_1_a' },
      q_tf: {
        questionId: 'q_tf',
        selectedOptionId: null,
        statementAnswers: { s_a: true, s_b: false, s_c: true, s_d: false },
      },
      q_match: {
        questionId: 'q_match',
        selectedOptionId: null,
        matchingAnswers: { p1: 'p1', p2: 'p2', p3: 'p3', p4: 'p4' },
      },
    },
    mixedQuestions,
    10
  );
  assert.equal(perfect.score, 10.0);
  assert.equal(perfect.correctCount, 3);

  // Câu 1 đúng (1.0), Câu TF đúng 3/4 ý (0.5 theo thang Bộ GD&ĐT), Câu Matching đúng 2/4 cặp (0.5) -> Tổng điểm quy đổi: (2.0 / 3) * 10 = 6.7
  const partial = gradeStudentExam(
    {
      q1: { questionId: 'q1', selectedOptionId: 'opt_1_a' },
      q_tf: {
        questionId: 'q_tf',
        selectedOptionId: null,
        statementAnswers: { s_a: true, s_b: false, s_c: true, s_d: true }, // sai ý d -> 3/4 đúng -> ratio 0.5
      },
      q_match: {
        questionId: 'q_match',
        selectedOptionId: null,
        matchingAnswers: { p1: 'p1', p2: 'p2', p3: 'p4', p4: 'p3' }, // 2/4 đúng -> ratio 0.5
      },
    },
    mixedQuestions,
    10
  );
  assert.equal(partial.score, 6.67);
});

test('getQuestionType and normalizeQuestionStructure handle modal placeholders and PDF-extracted True/False & Matching questions', () => {
  // 1. Multiple choice question with empty placeholder statements from modal should stay multiple_choice
  const mcWithPlaceholders: Question = {
    ...sampleQuestions[0],
    type: 'multiple_choice',
    statements: [
      { id: 'st1', label: 'a', content: '', isTrue: true },
      { id: 'st2', label: 'b', content: '', isTrue: false },
    ],
  };
  assert.equal(getQuestionType(mcWithPlaceholders), 'multiple_choice');
  const cleanedMc = normalizeQuestionStructure(mcWithPlaceholders);
  assert.equal(cleanedMc.statements, undefined);

  // 2. PDF-extracted True/False question (Câu 4.1)
  const pdfTfQuestion: Question = {
    id: 'pdf_31',
    themeId: 'chu_de_2',
    themeName: 'Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin',
    lessonId: 'bai_4',
    lessonName: 'Bài 4: Mạng xã hội',
    content:
      'Câu 4.1. (Trắc nghiệm Đúng/Sai) Đánh dấu X vào ô Đúng/Sai tương ứng:\na) Dùng chim bồ câu đưa thư là cách trao đổi thông tin.\nb) Mạng xã hội luôn tốt.\nc) Mạng xã hội là cộng đồng trực tuyến.\nd) Facebook cho phép mọi độ tuổi đăng kí.',
    options: [
      { id: 'o1', label: 'A', content: 'a, c: Đúng; b, d: Sai.' },
      { id: 'o2', label: 'B', content: 'a, c: Sai; b, d: Đúng.' },
    ],
    correctOptionId: 'o1',
    explanation: 'Đáp án gốc: a, c: Đúng; b, d: Sai.',
    cognitiveLevel: 'thong_hieu',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '2026-10-30',
    updatedAt: '2026-10-30',
  };
  assert.equal(getQuestionType(pdfTfQuestion), 'true_false');
  const normTf = normalizeQuestionStructure(pdfTfQuestion);
  assert.equal(normTf.type, 'true_false');
  assert.equal(normTf.statements?.length, 4);
  assert.equal(normTf.statements?.[0].isTrue, true);
  assert.equal(normTf.statements?.[1].isTrue, false);
  assert.equal(normTf.statements?.[2].isTrue, true);
  assert.equal(normTf.statements?.[3].isTrue, false);

  // 3. PDF-extracted Matching question (Câu 2.10)
  const pdfMatchQuestion: Question = {
    id: 'pdf_20',
    themeId: 'chu_de_1',
    themeName: 'Chủ đề 1: Máy tính và cộng đồng',
    lessonId: 'bai_2',
    lessonName: 'Bài 2: Phần mềm máy tính',
    content:
      'Câu 2.10. (Trắc nghiệm ghép nối) Ghép mỗi phần mở rộng ở cột bên trái với một loại tệp tương ứng ở cột bên phải:\n1) .mp3, .wma, .wav a) Video\n2) .jpg, .png, .gif b) Âm thanh\n3) .mp4, .avi, .flv c) Hình ảnh',
    options: [{ id: 'm1', label: 'A', content: '1 - b; 2 - c; 3 - a.' }],
    correctOptionId: 'm1',
    explanation: 'Đáp án gốc: 1 - b; 2 - c; 3 - a.',
    cognitiveLevel: 'nhan_biet',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '2026-10-30',
    updatedAt: '2026-10-30',
  };
  assert.equal(getQuestionType(pdfMatchQuestion), 'matching');
  const normMatch = normalizeQuestionStructure(pdfMatchQuestion);
  assert.equal(normMatch.type, 'matching');
  assert.equal(normMatch.matchingPairs?.length, 3);
  assert.equal(normMatch.matchingPairs?.[0].leftContent, '.mp3, .wma, .wav');
  assert.equal(normMatch.matchingPairs?.[0].rightContent, 'Âm thanh');
  assert.equal(normMatch.matchingPairs?.[1].rightContent, 'Hình ảnh');
  assert.equal(normMatch.matchingPairs?.[2].rightContent, 'Video');
});


