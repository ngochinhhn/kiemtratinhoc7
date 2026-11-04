import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readZipTextFiles } from './excelExport';
import {
  getDefaultExamHeaderConfig,
  formatQuestionStemForPrint,
  detectOptimalOptionColumns,
  buildPrintableExamVariant,
  buildPrintableItemsFromStudentPaper,
  buildStandaloneA4PrintHtml,
  preventOrphanWords,
  paginateExamQuestionsForA4,
  buildExamPaperDocxBytes,
} from './examPaperFormatter';
import { createStudentExamPaper } from './examShuffler';
import { Question } from '../types';

const SAMPLE_QUESTIONS: Question[] = [
  {
    id: 'q1',
    themeId: 'chu_de_1',
    themeName: 'Chủ đề 1: Máy tính và cộng đồng',
    lessonId: 'bai_1',
    lessonName: 'Bài 1: Thiết bị vào – ra',
    content: 'Câu 1.1. Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?',
    imageUrl: '/assets/aistudio/hinh_1_1_may_quet.png',
    imageCaption: 'Hình 1.1. Máy quét',
    options: [
      { id: 'q1_a', label: 'A', content: 'Thiết bị vào.' },
      { id: 'q1_b', label: 'B', content: 'Thiết bị ra.' },
      { id: 'q1_c', label: 'C', content: 'Thiết bị vừa vào vừa ra.' },
      { id: 'q1_d', label: 'D', content: 'Thiết bị lưu trữ.' },
    ],
    correctOptionId: 'q1_a',
    cognitiveLevel: 'nhan_biet',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'q2',
    themeId: 'chu_de_1',
    themeName: 'Chủ đề 1: Máy tính và cộng đồng',
    lessonId: 'bai_1',
    lessonName: 'Bài 1: Thiết bị vào – ra',
    content: 'Câu 1.2. Tai nghe trong Hình 1.2 là loại thiết bị nào?',
    imageUrl: '/assets/aistudio/hinh_1_2_tai_nghe.png',
    imageCaption: 'Hình 1.2. Tai nghe',
    options: [
      { id: 'q2_a', label: 'A', content: 'Thiết bị vào.' },
      { id: 'q2_b', label: 'B', content: 'Thiết bị ra.' },
      { id: 'q2_c', label: 'C', content: 'Thiết bị vừa vào vừa ra.' },
      { id: 'q2_d', label: 'D', content: 'Thiết bị lưu trữ.' },
    ],
    correctOptionId: 'q2_b',
    cognitiveLevel: 'nhan_biet',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'q3_tf',
    type: 'true_false',
    themeId: 'chu_de_1',
    themeName: 'Chủ đề 1: Máy tính và cộng đồng',
    lessonId: 'bai_2',
    lessonName: 'Bài 2: Phần mềm máy tính',
    content: 'Em hãy cho biết các phát biểu sau về hệ điều hành và phần mềm ứng dụng là Đúng hay Sai:',
    options: [],
    correctOptionId: '',
    statements: [
      { id: 's1', label: 'a', content: 'Windows và Linux là các phần mềm hệ điều hành.', isTrue: true },
      { id: 's2', label: 'b', content: 'Máy tính có thể hoạt động bình thường mà không cần hệ điều hành.', isTrue: false },
      { id: 's3', label: 'c', content: 'Microsoft Word là phần mềm soạn thảo văn bản.', isTrue: true },
      { id: 's4', label: 'd', content: 'Phần mềm ứng dụng điều khiển trực tiếp phần cứng máy tính.', isTrue: false },
    ],
    cognitiveLevel: 'thong_hieu',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

describe('examPaperFormatter utilities', () => {
  it('getDefaultExamHeaderConfig returns standard THCS Thuy Lam header format matching reference', () => {
    const config = getDefaultExamHeaderConfig({
      type: 'giua_ky',
      durationMinutes: 45,
    });
    assert.equal(config.schoolName, 'TRƯỜNG THCS THUỴ LÂM');
    assert.equal(config.schoolYear, 'Năm học 2025-2026');
    assert.equal(config.examHeaderTitle, 'ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I');
    assert.equal(config.subjectHeader, 'MÔN: TOÁN TIN HỌC 7');
    assert.equal(config.durationText, '(Thời gian: 45 phút)');
    assert.equal(config.showUnderline, true);
    assert.equal(config.showStudentInfo, true);
  });

  it('formatQuestionStemForPrint strips leading Câu X.Y prefix cleanly', () => {
    assert.equal(
      formatQuestionStemForPrint('Câu 1.1. Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?'),
      'Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?'
    );
    assert.equal(
      formatQuestionStemForPrint('Câu 12: Đâu là phần mềm hệ điều hành?'),
      'Đâu là phần mềm hệ điều hành?'
    );
    assert.equal(
      formatQuestionStemForPrint('Thiết bị nào sau đây là thiết bị vào?'),
      'Thiết bị nào sau đây là thiết bị vào?'
    );
  });

  it('preventOrphanWords binds trailing words with non-breaking space to avoid single-word orphans', () => {
    const bound = preventOrphanWords('Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?');
    assert.ok(bound.includes('\u00A0'));
    assert.ok(bound.endsWith('thiết\u00A0bị\u00A0nào?'));

    // Also steps down 2-column options to 1-column when option length risks a 1-word wrap (~36-41 chars)
    assert.equal(
      detectOptimalOptionColumns(
        [
          { content: 'Thiết bị dùng để nhập dữ liệu vào máy.' }, // 38 chars -> orphan risk in 2-col
          { content: 'Thiết bị ra.' },
        ],
        'auto',
        '13pt'
      ),
      1
    );
  });

  it('detectOptimalOptionColumns selects 4, 2, or 1 columns based on option length', () => {
    assert.equal(
      detectOptimalOptionColumns(
        [{ content: 'Chuột' }, { content: 'Bàn phím' }, { content: 'Màn hình' }, { content: 'Loa' }],
        'auto'
      ),
      4
    );
    assert.equal(
      detectOptimalOptionColumns(
        [
          { content: 'Thiết bị vào.' },
          { content: 'Thiết bị ra.' },
          { content: 'Thiết bị vừa vào vừa ra.' },
          { content: 'Thiết bị lưu trữ.' },
        ],
        'auto'
      ),
      2
    );
    assert.equal(
      detectOptimalOptionColumns(
        [
          { content: 'Đây là một phương án trả lời rất dài vượt quá bốn mươi sáu ký tự trên một dòng.' },
          { content: 'Phương án ngắn' },
        ],
        'auto'
      ),
      1
    );
  });

  it('buildPrintableExamVariant preserves original order for GOC and shuffles deterministically for variant codes', () => {
    const exam = {
      id: 'exam_test_1',
      questionIds: ['q1', 'q2'],
      shuffleQuestions: true,
      shuffleOptions: true,
    };

    const originalItems = buildPrintableExamVariant(exam, SAMPLE_QUESTIONS, 'GOC');
    assert.equal(originalItems.length, 2);
    assert.equal(originalItems[0].questionId, 'q1');
    assert.equal(originalItems[0].stem, 'Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?');
    assert.equal(originalItems[0].correctLabel, 'A');
    assert.equal(originalItems[1].questionId, 'q2');
    assert.equal(originalItems[1].correctLabel, 'B');

    const variant701First = buildPrintableExamVariant(exam, SAMPLE_QUESTIONS, '701');
    const variant701Second = buildPrintableExamVariant(exam, SAMPLE_QUESTIONS, '701');
    assert.deepEqual(variant701First, variant701Second);

    for (const item of variant701First) {
      const correctOpt = item.options.find((o) => o.isCorrect);
      assert.ok(correctOpt);
      assert.equal(item.correctLabel, correctOpt.label);
    }
  });

  it('paginateExamQuestionsForA4 splits multi-page exams and numbers pages accurately', () => {
    const manyQuestions: Question[] = Array.from({ length: 18 }, (_, i) => ({
      ...SAMPLE_QUESTIONS[i % 3],
      id: `q_many_${i + 1}`,
    }));
    const headerConfig = getDefaultExamHeaderConfig({ type: 'giua_ky', durationMinutes: 45 });
    const items = buildPrintableExamVariant(
      {
        id: 'ex_many',
        questionIds: manyQuestions.map((q) => q.id),
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      manyQuestions,
      'GOC'
    );

    const pages = paginateExamQuestionsForA4({
      examTitle: 'Đề kiểm tra nhiều trang',
      durationMinutes: 45,
      headerConfig,
      printableItems: items,
      variantCode: 'GOC',
      fontSizePt: '13pt',
      showAnswers: false,
      showExplanations: false,
      showScoreBox: true,
    });

    assert.ok(pages.length >= 2, '18 questions with images and tables should span at least 2 A4 pages');
    assert.equal(pages[0].pageNumber, 1);
    assert.equal(pages[0].totalPages, pages.length);
    assert.equal(pages[0].isFirstPage, true);
    assert.equal(pages[pages.length - 1].isLastPage, true);
    assert.equal(pages[pages.length - 1].showEndMark, true);
  });

  it('buildStandaloneA4PrintHtml generates valid A4 portrait HTML with pagination, page numbers, and True/False table', () => {
    const headerConfig = getDefaultExamHeaderConfig({ type: 'giua_ky', durationMinutes: 45 });
    const items = buildPrintableExamVariant(
      { id: 'ex1', questionIds: ['q1', 'q2', 'q3_tf'], shuffleQuestions: false, shuffleOptions: false },
      SAMPLE_QUESTIONS,
      'GOC'
    );
    const html = buildStandaloneA4PrintHtml({
      examTitle: 'Đề kiểm tra đánh giá giữa học kì I',
      durationMinutes: 45,
      headerConfig,
      printableItems: items,
      variantCode: 'GOC',
      fontSizePt: '13pt',
      showAnswers: false,
      showExplanations: false,
      showScoreBox: true,
    });

    assert.ok(html.includes('size: A4 portrait'));
    assert.ok(html.includes('TRƯỜNG THCS THUỴ LÂM'));
    assert.ok(html.includes('ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I'));
    assert.ok(html.includes('Họ và tên:'));
    assert.ok(html.includes('Lớp:'));
    assert.ok(html.includes('LỜI PHÊ CỦA THẦY, CÔ GIÁO'));
    assert.ok(html.includes('Câu 1. Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?'));
    assert.ok(html.includes('<table class="tf-table">'));
    assert.ok(html.includes('Phát biểu nhận định'));
    assert.ok(html.includes('Trang 1 / 2'));
    assert.ok(html.includes('Trang 2 / 2'));
    assert.ok(html.includes('--- HẾT ---'));
  });

  it('buildExamPaperDocxBytes generates a valid OpenXML .docx archive with header, True/False table, and page numbering footer', async () => {
    const headerConfig = getDefaultExamHeaderConfig({ type: 'giua_ky', durationMinutes: 45 });
    const items = buildPrintableExamVariant(
      { id: 'ex_docx', questionIds: ['q1', 'q2', 'q3_tf'], shuffleQuestions: false, shuffleOptions: false },
      SAMPLE_QUESTIONS,
      '701'
    );
    const bytes = await buildExamPaperDocxBytes({
      examTitle: 'Đề kiểm tra giữa kì I',
      durationMinutes: 45,
      headerConfig,
      printableItems: items,
      variantCode: '701',
      fontSizePt: '13pt',
      showAnswers: true,
      showExplanations: true,
      showScoreBox: true,
    });

    assert.ok(bytes.byteLength > 1000, 'Generated .docx should be a non-empty binary zip');
    const zipFiles = await readZipTextFiles(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    );
    const docXml = zipFiles['word/document.xml'];
    const footerXml = zipFiles['word/footer1.xml'];

    assert.ok(docXml, 'word/document.xml must exist in .docx');
    assert.ok(footerXml, 'word/footer1.xml must exist in .docx');
    assert.ok(docXml!.includes('TRƯỜNG THCS THUỴ LÂM'));
    assert.ok(docXml!.includes('Phát biểu nhận định'));
    assert.ok(docXml!.includes('✓ Đúng'));
    assert.ok(footerXml!.includes('PAGE'));
    assert.ok(footerXml!.includes('NUMPAGES'));
  });

  it('buildPrintableItemsFromStudentPaper converts a shuffled student paper into A4 printable items with True/False table and stripped stem prefixes', () => {
    const paper = createStudentExamPaper('st_01', 'ex_student', 0, SAMPLE_QUESTIONS, false, false);
    const items = buildPrintableItemsFromStudentPaper(paper, 'auto', '13pt');
    assert.equal(items.length, 3);
    assert.equal(items[0].stem, 'Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?');
    assert.equal(items[0].questionType, 'multiple_choice');
    assert.equal(items[2].questionType, 'true_false');
    assert.equal(items[2].statements?.length, 4);
  });
});

