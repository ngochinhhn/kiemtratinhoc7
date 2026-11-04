import { createZipBuffer } from './excelExport';
import { Exam, ExamHeaderConfig, ExamType, Question, QuestionType, StudentExamPaper } from '../types';
import { getDisplayQuestionsForStudent } from './examShuffler';
import { getQuestionType } from './grading';

export type OptionLayoutMode = 'auto' | '1_col' | '2_col' | '4_col';

export interface PrintableOptionItem {
  id: string;
  label: 'A' | 'B' | 'C' | 'D';
  content: string;
  isCorrect: boolean;
}

export interface PrintableTrueFalseItem {
  id: string;
  label: string;
  content: string;
  isTrue: boolean;
}

export interface PrintableMatchingRow {
  leftId: string;
  leftLabel: string;
  leftContent: string;
  rightId: string;
  rightLabel: string;
  rightContent: string;
  correctRightLabel: string;
}

export interface PrintableQuestionItem {
  index: number; // 1-based index (Câu 1, Câu 2...)
  questionId: string;
  questionType: QuestionType;
  stem: string; // Nội dung câu hỏi đã chuẩn hóa đầu dòng
  rawContent: string;
  imageUrl?: string;
  imageCaption?: string;
  themeName: string;
  lessonName: string;
  explanation?: string;
  options: PrintableOptionItem[];
  statements?: PrintableTrueFalseItem[];
  matchingRows?: PrintableMatchingRow[];
  correctLabel: string; // 'A' | 'B' | 'C' | 'D' hoặc chuỗi tóm tắt đáp án Đúng/Sai, Ghép đôi
  recommendedColumns: 1 | 2 | 4;
}

export interface A4PageSection {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  items: PrintableQuestionItem[];
  showEndMark: boolean;
  showTeacherKey: boolean;
}

/**
 * Lấy tiêu đề kỳ kiểm tra mặc định theo loại đề kiểm tra
 */
export function getDefaultExamHeaderTitleByType(type?: ExamType): string {
  switch (type) {
    case 'cuoi_ky':
      return 'ĐỀ KIỂM TRA ĐÁNH GIÁ CUỐI HỌC KÌ I';
    case '15_phut':
    case '45_phut':
    case 'giua_ky':
    case 'tu_chon':
    default:
      return 'ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I';
  }
}

export function normalizeExamSchoolName(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (
    !trimmed ||
    /^trường\s+thcs\s+thu[yỵ]\s+lâm$/i.test(trimmed) ||
    /^trường\s+th\s*&\s*thcs\s+thu[yỵ]\s+lâm$/i.test(trimmed)
  ) {
    return 'TRƯỜNG TH & THCS THỤY LÂM';
  }
  return trimmed;
}

export function normalizeExamSubjectHeader(raw?: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed || /toán\s+tin\s+học\s*7/i.test(trimmed)) {
    return 'MÔN: TIN HỌC 7';
  }
  return trimmed;
}

/**
 * Khởi tạo cấu hình tiêu đề bản in A4 chuẩn theo mẫu trường TH & THCS Thụy Lâm
 */
export function getDefaultExamHeaderConfig(exam?: Partial<Exam>): ExamHeaderConfig {
  const existing = exam?.headerConfig;
  const duration = exam?.durationMinutes ?? 45;
  return {
    schoolName: normalizeExamSchoolName(existing?.schoolName),
    schoolYear: existing?.schoolYear || 'Năm học 2025-2026',
    examHeaderTitle: existing?.examHeaderTitle || getDefaultExamHeaderTitleByType(exam?.type),
    subjectHeader: normalizeExamSubjectHeader(existing?.subjectHeader),
    durationText: existing?.durationText || `(Thời gian: ${duration} phút)`,
    showUnderline: existing?.showUnderline ?? true,
    showStudentInfo: existing?.showStudentInfo ?? true,
    showAnswerGrid: existing?.showAnswerGrid ?? false,
  };
}

/**
 * Loại bỏ tiền tố "Câu 1.1.", "Câu 2:" ở đầu nội dung câu hỏi để khi đánh số "Câu 1.", "Câu 2." trên bản in A4 không bị trùng lặp
 */
export function formatQuestionStemForPrint(content: string): string {
  if (!content) return '';
  return content.replace(/^Câu\s+\d+(?:[.,]\d+)?\s*[.:]?\s*/i, '').trim();
}

/**
 * Gắn khoảng trắng không ngắt dòng (\u00A0) vào các từ cuối câu để tránh hiện tượng rơi 1 từ (hoặc 1 âm tiết tiếng Việt) xuống dòng mới
 */
export function preventOrphanWords(text: string): string {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const words = cleaned.split(' ');
  if (words.length <= 1) return cleaned;
  if (words.length === 2) {
    return cleaned.length <= 16 ? `${words[0]}\u00A0${words[1]}` : cleaned;
  }

  // Với tiếng Việt, một từ ghép thường gồm 2 âm tiết (ví dụ: "máy tính?", "thông tin.", "vào ra.").
  // Nếu âm tiết cuối rất ngắn (<= 5 ký tự kể cả dấu câu) và âm tiết kế cuối cũng ngắn (<= 5 ký tự),
  // ta nối cả cụm 2-3 âm tiết cuối để không bao giờ bị lẻ 1 từ ở dòng dưới.
  const lastWord = words[words.length - 1];
  const secondLastWord = words[words.length - 2];
  const thirdLastWord = words[words.length - 3];

  if (
    words.length >= 4 &&
    lastWord.length <= 5 &&
    secondLastWord.length <= 5 &&
    thirdLastWord.length <= 5 &&
    lastWord.length + secondLastWord.length + thirdLastWord.length <= 14
  ) {
    const prefix = words.slice(0, -3).join(' ');
    return `${prefix} ${thirdLastWord}\u00A0${secondLastWord}\u00A0${lastWord}`;
  }

  const prefix = words.slice(0, -2).join(' ');
  return `${prefix} ${secondLastWord}\u00A0${lastWord}`;
}

/**
 * Tính toán kiểu khoảng cách chữ/từ vi mô cho các đoạn văn bản có độ dài sát ngưỡng ngắt dòng
 * nhằm tự động co/giãn nhẹ tránh rơi đúng 1 từ xuống dòng tiếp theo trên trang A4.
 */
export function getAntiOrphanTextStyle(
  text: string,
  lineCharCapacity: number = 84
): { letterSpacing?: string; wordSpacing?: string } {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean || lineCharCapacity <= 10) return {};
  const rem = clean.length % lineCharCapacity;
  // Nếu phần dư sang dòng mới chỉ từ 1 đến 7 ký tự (tương đương 1 từ ngắn bị rơi xuống dòng)
  if (clean.length > lineCharCapacity && rem > 0 && rem <= 7) {
    return {
      letterSpacing: '-0.18px',
      wordSpacing: '-0.6px',
    };
  }
  return {};
}

/**
 * Tính số cột hiển thị phương án A, B, C, D tối ưu cho từng câu hỏi trên khổ giấy A4,
 * đồng thời tránh chia 2 cột hoặc 4 cột khi độ dài phương án dễ làm rơi 1 từ lẻ sang dòng thứ 2.
 */
export function detectOptimalOptionColumns(
  options: { content: string }[],
  layoutMode: OptionLayoutMode = 'auto',
  fontSizePt: '12pt' | '13pt' | '14pt' = '13pt'
): 1 | 2 | 4 {
  if (layoutMode === '1_col') return 1;
  if (layoutMode === '2_col') return 2;
  if (layoutMode === '4_col') return 4;

  const lengths = options.map((opt) => (opt.content || '').replace(/\s+/g, ' ').trim().length);
  const maxLen = lengths.reduce((max, len) => Math.max(max, len), 0);

  const col4Limit = fontSizePt === '12pt' ? 14 : fontSizePt === '14pt' ? 11 : 13;
  const col2SingleLineLimit = fontSizePt === '12pt' ? 36 : fontSizePt === '14pt' ? 29 : 33;

  if (maxLen <= col4Limit) return 4;

  // Nếu tất cả phương án nằm gọn trên 1 dòng của bố cục 2 cột -> dùng 2 cột
  if (maxLen <= col2SingleLineLimit) return 2;

  // Nếu có phương án vượt nhẹ ngưỡng 1 dòng của 2 cột (từ 34 đến 45 ký tự),
  // khi để 2 cột sẽ bị rơi 1-2 từ xuống dòng thứ 2 trông rời rạc -> tự động chuyển về 1 cột ngang rộng rãi.
  if (maxLen <= 46) {
    const hasOrphanRiskIn2Col = lengths.some(
      (len) => len > col2SingleLineLimit && len <= col2SingleLineLimit + 9
    );
    return hasOrphanRiskIn2Col ? 1 : 2;
  }

  return 1;
}

/**
 * Bộ sinh số giả ngẫu nhiên có hạt giống (seeded PRNG) để tạo các mã đề in ấn ổn định (701, 702, 703, 704)
 */
function createSeededRandom(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    h += h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Xây dựng danh sách câu hỏi và đáp án cho một mã đề in A4 cụ thể
 * Hỗ trợ đầy đủ 3 dạng câu hỏi: Nhiều lựa chọn, Đúng/Sai (Bộ GD&ĐT), Ghép đôi (Cột A - Cột B)
 */
export function buildPrintableExamVariant(
  exam: Pick<Exam, 'id' | 'questionIds' | 'shuffleQuestions' | 'shuffleOptions'>,
  allQuestions: Question[],
  variantCode: string = 'GOC',
  layoutMode: OptionLayoutMode = 'auto',
  fontSizePt: '12pt' | '13pt' | '14pt' = '13pt'
): PrintableQuestionItem[] {
  const questionMap = new Map<string, Question>();
  for (const q of allQuestions) {
    questionMap.set(q.id, q);
  }

  const baseQuestions: Question[] = [];
  for (const qId of exam.questionIds) {
    const found = questionMap.get(qId);
    if (found) {
      baseQuestions.push(found);
    }
  }

  const isOriginal = variantCode === 'GOC';
  const rand = createSeededRandom(`${exam.id}_${variantCode}`);

  const orderedQuestions =
    !isOriginal && exam.shuffleQuestions ? seededShuffle(baseQuestions, rand) : baseQuestions;

  const labels: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const tfLabels: ('a' | 'b' | 'c' | 'd')[] = ['a', 'b', 'c', 'd'];

  return orderedQuestions.map((q, idx) => {
    const qType = getQuestionType(q);

    if (qType === 'true_false' && q.statements && q.statements.length > 0) {
      const rawStmts =
        !isOriginal && exam.shuffleOptions ? seededShuffle(q.statements, rand) : [...q.statements];
      const formattedStmts: PrintableTrueFalseItem[] = rawStmts.map((st, sIdx) => ({
        id: st.id,
        label: tfLabels[sIdx] || String.fromCharCode(97 + sIdx),
        content: st.content,
        isTrue: st.isTrue,
      }));
      const summaryKey = formattedStmts
        .map((st) => `${st.label}-${st.isTrue ? 'Đ' : 'S'}`)
        .join(' | ');

      return {
        index: idx + 1,
        questionId: q.id,
        questionType: 'true_false',
        stem: formatQuestionStemForPrint(q.content),
        rawContent: q.content,
        imageUrl: q.imageUrl,
        imageCaption: q.imageCaption,
        themeName: q.themeName,
        lessonName: q.lessonName,
        explanation: q.explanation,
        options: [],
        statements: formattedStmts,
        correctLabel: summaryKey,
        recommendedColumns: 1,
      };
    }

    if (qType === 'matching' && q.matchingPairs && q.matchingPairs.length > 0) {
      const pairs = [...q.matchingPairs];
      const rightSeedRand = isOriginal
        ? createSeededRandom(`matching_default_${q.id}`)
        : rand;
      const shuffledRight = seededShuffle(pairs, rightSeedRand);

      const rightLabelByPairId = new Map<string, string>();
      shuffledRight.forEach((rp, rIdx) => {
        const lbl = labels[rIdx] || String.fromCharCode(65 + rIdx);
        rightLabelByPairId.set(rp.id, lbl);
      });

      const matchingRows: PrintableMatchingRow[] = pairs.map((lp, lIdx) => {
        const rp = shuffledRight[lIdx] || lp;
        const rLbl = labels[lIdx] || String.fromCharCode(65 + lIdx);
        const leftLbl = lp.leftLabel || String(lIdx + 1);
        return {
          leftId: lp.id,
          leftLabel: leftLbl,
          leftContent: lp.leftContent,
          rightId: rp.id,
          rightLabel: rLbl,
          rightContent: rp.rightContent,
          correctRightLabel: rightLabelByPairId.get(lp.id) || rLbl,
        };
      });

      const summaryKey = matchingRows
        .map((r) => `${r.leftLabel}-${r.correctRightLabel}`)
        .join(' | ');

      return {
        index: idx + 1,
        questionId: q.id,
        questionType: 'matching',
        stem: formatQuestionStemForPrint(q.content),
        rawContent: q.content,
        imageUrl: q.imageUrl,
        imageCaption: q.imageCaption,
        themeName: q.themeName,
        lessonName: q.lessonName,
        explanation: q.explanation,
        options: [],
        matchingRows,
        correctLabel: summaryKey,
        recommendedColumns: 1,
      };
    }

    // Dạng 1: Nhiều lựa chọn (multiple_choice)
    const rawOptions =
      !isOriginal && exam.shuffleOptions ? seededShuffle(q.options, rand) : [...q.options];

    let correctLabel: 'A' | 'B' | 'C' | 'D' = 'A';
    const formattedOptions: PrintableOptionItem[] = rawOptions.map((opt, optIdx) => {
      const label = labels[optIdx] || 'A';
      const isCorrect = opt.id === q.correctOptionId;
      if (isCorrect) {
        correctLabel = label;
      }
      return {
        id: opt.id,
        label,
        content: opt.content,
        isCorrect,
      };
    });

    return {
      index: idx + 1,
      questionId: q.id,
      questionType: 'multiple_choice',
      stem: formatQuestionStemForPrint(q.content),
      rawContent: q.content,
      imageUrl: q.imageUrl,
      imageCaption: q.imageCaption,
      themeName: q.themeName,
      lessonName: q.lessonName,
      explanation: q.explanation,
      options: formattedOptions,
      correctLabel,
      recommendedColumns: detectOptimalOptionColumns(formattedOptions, layoutMode, fontSizePt),
    };
  });
}

/**
 * Chuyển đổi trực tiếp đề thi riêng của học sinh (StudentExamPaper đã đảo câu/đáp án)
 * sang danh sách PrintableQuestionItem để phân trang A4, chống rơi từ lẻ, hiển thị bảng Đúng/Sai
 * và xuất file .PDF / .DOCX trên màn hình Học sinh.
 */
export function buildPrintableItemsFromStudentPaper(
  paper: StudentExamPaper,
  layoutMode: OptionLayoutMode = 'auto',
  fontSizePt: '12pt' | '13pt' | '14pt' = '13pt'
): PrintableQuestionItem[] {
  const displayQuestions = getDisplayQuestionsForStudent(paper);

  return displayQuestions.map((q, idx) => {
    if (q.type === 'true_false' && q.statements && q.statements.length > 0) {
      const formattedStmts: PrintableTrueFalseItem[] = q.statements.map((st) => ({
        id: st.id,
        label: st.label,
        content: st.content,
        isTrue: st.isTrue,
      }));
      const summaryKey = formattedStmts
        .map((st) => `${st.label}-${st.isTrue ? 'Đ' : 'S'}`)
        .join(' | ');

      return {
        index: idx + 1,
        questionId: q.id,
        questionType: 'true_false',
        stem: formatQuestionStemForPrint(q.content),
        rawContent: q.content,
        imageUrl: q.imageUrl,
        imageCaption: q.imageCaption,
        themeName: q.themeName,
        lessonName: q.lessonName,
        explanation: q.explanation,
        options: [],
        statements: formattedStmts,
        correctLabel: summaryKey,
        recommendedColumns: 1,
      };
    }

    if (q.type === 'matching' && q.matchingLeftItems && q.matchingLeftItems.length > 0) {
      const rightLabelMap = new Map<string, string>();
      q.matchingRightOptions.forEach((ro) => {
        rightLabelMap.set(ro.id, ro.displayLabel);
      });

      const matchingRows: PrintableMatchingRow[] = q.matchingLeftItems.map((lp, lIdx) => {
        const ro = q.matchingRightOptions[lIdx] || {
          id: lp.id,
          displayLabel: String.fromCharCode(65 + lIdx),
          content: '',
        };
        return {
          leftId: lp.id,
          leftLabel: lp.label,
          leftContent: lp.content,
          rightId: ro.id,
          rightLabel: ro.displayLabel,
          rightContent: ro.content,
          correctRightLabel: rightLabelMap.get(lp.id) || ro.displayLabel,
        };
      });

      const summaryKey = matchingRows
        .map((r) => `${r.leftLabel}-${r.correctRightLabel}`)
        .join(' | ');

      return {
        index: idx + 1,
        questionId: q.id,
        questionType: 'matching',
        stem: formatQuestionStemForPrint(q.content),
        rawContent: q.content,
        imageUrl: q.imageUrl,
        imageCaption: q.imageCaption,
        themeName: q.themeName,
        lessonName: q.lessonName,
        explanation: q.explanation,
        options: [],
        matchingRows,
        correctLabel: summaryKey,
        recommendedColumns: 1,
      };
    }

    let correctLabel: 'A' | 'B' | 'C' | 'D' = 'A';
    const formattedOptions: PrintableOptionItem[] = q.options.map((opt) => {
      const isCorrect = opt.id === q.correctOptionId;
      if (isCorrect) {
        correctLabel = opt.label;
      }
      return {
        id: opt.id,
        label: opt.label,
        content: opt.content,
        isCorrect,
      };
    });

    return {
      index: idx + 1,
      questionId: q.id,
      questionType: 'multiple_choice',
      stem: formatQuestionStemForPrint(q.content),
      rawContent: q.content,
      imageUrl: q.imageUrl,
      imageCaption: q.imageCaption,
      themeName: q.themeName,
      lessonName: q.lessonName,
      explanation: q.explanation,
      options: formattedOptions,
      correctLabel,
      recommendedColumns: detectOptimalOptionColumns(formattedOptions, layoutMode, fontSizePt),
    };
  });
}

export interface A4PrintRenderOptions {
  examTitle: string;
  durationMinutes: number;
  headerConfig: ExamHeaderConfig;
  printableItems: PrintableQuestionItem[];
  variantCode: string;
  fontSizePt: '12pt' | '13pt' | '14pt';
  showAnswers: boolean;
  showExplanations: boolean;
  showScoreBox?: boolean;
  studentFullName?: string;
  studentClassName?: string;
}

/**
 * Ước lượng chiều cao (đơn vị mm) của một câu hỏi khi trình bày trên khổ giấy A4
 * để phân trang tự động chính xác, không cắt ngang câu hỏi hoặc bảng biểu.
 */
function estimateQuestionHeightMm(
  item: PrintableQuestionItem,
  fontSizePt: '12pt' | '13pt' | '14pt',
  showAnswers: boolean,
  showExplanations: boolean
): number {
  const lineMm = fontSizePt === '12pt' ? 5.6 : fontSizePt === '14pt' ? 6.6 : 6.1;
  const charsPerLine = fontSizePt === '12pt' ? 88 : fontSizePt === '14pt' ? 74 : 82;

  const fullStem = `Câu ${item.index}. ${item.stem}`;
  const stemLines = Math.max(1, Math.ceil(fullStem.length / charsPerLine));
  let heightMm = stemLines * lineMm + 2.5;

  if (item.imageUrl) {
    heightMm += 36;
  }

  if (item.questionType === 'true_false' && item.statements && item.statements.length > 0) {
    // Bảng biểu Đúng/Sai: dòng tiêu đề + các dòng phát biểu a, b, c, d
    heightMm += 7.5;
    for (const st of item.statements) {
      const stLines = Math.max(1, Math.ceil((st.content.length + 4) / (charsPerLine - 18)));
      heightMm += stLines * lineMm + 2.2;
    }
    heightMm += 3;
  } else if (item.questionType === 'matching' && item.matchingRows && item.matchingRows.length > 0) {
    // Bảng ghép đôi Cột A - Cột B + dòng trả lời
    heightMm += 7.5;
    const colChars = Math.floor((charsPerLine - 8) / 2);
    for (const row of item.matchingRows) {
      const leftLines = Math.max(1, Math.ceil((row.leftContent.length + 4) / colChars));
      const rightLines = Math.max(1, Math.ceil((row.rightContent.length + 4) / colChars));
      heightMm += Math.max(leftLines, rightLines) * lineMm + 2.2;
    }
    heightMm += lineMm + 3;
  } else {
    // Nhiều lựa chọn A, B, C, D
    const cols = item.recommendedColumns;
    if (cols === 4) {
      heightMm += lineMm + 1.5;
    } else if (cols === 2) {
      const colChars = Math.floor((charsPerLine - 8) / 2);
      for (let r = 0; r < 2; r++) {
        const opt1 = item.options[r * 2];
        const opt2 = item.options[r * 2 + 1];
        const l1 = opt1 ? Math.max(1, Math.ceil((opt1.content.length + 4) / colChars)) : 1;
        const l2 = opt2 ? Math.max(1, Math.ceil((opt2.content.length + 4) / colChars)) : 1;
        heightMm += Math.max(l1, l2) * lineMm + 1;
      }
    } else {
      for (const opt of item.options) {
        const l = Math.max(1, Math.ceil((opt.content.length + 4) / (charsPerLine - 4)));
        heightMm += l * lineMm + 0.8;
      }
    }
  }

  if (showAnswers && showExplanations && item.explanation) {
    const expLines = Math.max(1, Math.ceil((item.explanation.length + 25) / charsPerLine));
    heightMm += expLines * (lineMm * 0.92) + 2;
  }

  return heightMm + 3.5;
}

/**
 * Phân trang tự động danh sách câu hỏi trên khổ giấy A4 (210mm x 297mm)
 * kèm đánh số trang Trang 1/N, Trang 2/N...
 */
export function paginateExamQuestionsForA4(opts: A4PrintRenderOptions): A4PageSection[] {
  const {
    headerConfig,
    printableItems,
    fontSizePt,
    showAnswers,
    showExplanations,
    showScoreBox = false,
  } = opts;

  // Chiều cao khả dụng trong lòng trang A4 (297mm - lề trên 16mm - lề dưới 16mm - chân trang 11mm = 254mm)
  const USABLE_PAGE_HEIGHT_MM = 252;

  let firstPageHeaderMm = 28; // Bảng tiêu đề 2 cột
  if (headerConfig.showStudentInfo !== false) {
    firstPageHeaderMm += 10;
  }
  if (showScoreBox) {
    firstPageHeaderMm += 24;
  }
  if (headerConfig.showAnswerGrid && printableItems.length > 0) {
    const gridRows = Math.ceil(printableItems.length / 10);
    firstPageHeaderMm += 10 + gridRows * 10;
  }

  const rawPages: {
    items: PrintableQuestionItem[];
    usedMm: number;
    isFirstPage: boolean;
    showEndMark: boolean;
    showTeacherKey: boolean;
  }[] = [
    {
      items: [],
      usedMm: firstPageHeaderMm,
      isFirstPage: true,
      showEndMark: false,
      showTeacherKey: false,
    },
  ];

  for (const item of printableItems) {
    const itemHeightMm = estimateQuestionHeightMm(item, fontSizePt, showAnswers, showExplanations);
    const currentPage = rawPages[rawPages.length - 1];

    if (
      currentPage.items.length > 0 &&
      currentPage.usedMm + itemHeightMm > USABLE_PAGE_HEIGHT_MM
    ) {
      rawPages.push({
        items: [item],
        usedMm: itemHeightMm,
        isFirstPage: false,
        showEndMark: false,
        showTeacherKey: false,
      });
    } else {
      currentPage.items.push(item);
      currentPage.usedMm += itemHeightMm;
    }
  }

  const endMarkMm = 14;
  const teacherKeyRows = Math.ceil(printableItems.length / 10);
  const teacherKeyMm = showAnswers && printableItems.length > 0 ? 16 + teacherKeyRows * 10 : 0;

  const lastPage = rawPages[rawPages.length - 1];
  lastPage.showEndMark = true;
  lastPage.usedMm += endMarkMm;

  if (teacherKeyMm > 0) {
    if (lastPage.usedMm + teacherKeyMm <= USABLE_PAGE_HEIGHT_MM + 8) {
      lastPage.showTeacherKey = true;
      lastPage.usedMm += teacherKeyMm;
    } else {
      rawPages.push({
        items: [],
        usedMm: teacherKeyMm,
        isFirstPage: false,
        showEndMark: false,
        showTeacherKey: true,
      });
    }
  }

  const totalPages = rawPages.length;
  return rawPages.map((p, idx) => ({
    pageNumber: idx + 1,
    totalPages,
    isFirstPage: p.isFirstPage,
    isLastPage: idx === totalPages - 1,
    items: p.items,
    showEndMark: p.showEndMark,
    showTeacherKey: p.showTeacherKey,
  }));
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Tạo mã HTML độc lập chuẩn khổ giấy A4 (210mm x 297mm) có phân trang và đánh số trang
 * phục vụ kết nối máy in hoặc xuất PDF
 */
export function buildStandaloneA4PrintHtml(opts: A4PrintRenderOptions): string {
  const {
    examTitle,
    durationMinutes,
    headerConfig,
    printableItems,
    variantCode,
    fontSizePt,
    showAnswers,
    showExplanations,
    showScoreBox = false,
    studentFullName,
    studentClassName,
  } = opts;

  const pages = paginateExamQuestionsForA4(opts);
  const durationStr = headerConfig.durationText || `(Thời gian: ${durationMinutes} phút)`;
  const underlineHtml =
    headerConfig.showUnderline !== false
      ? `<div class="header-underline"></div>`
      : '';
  const variantBadgeHtml =
    variantCode !== 'GOC'
      ? `<div class="variant-box">Mã đề: ${escapeHtml(variantCode)}</div>`
      : '';

  const studentInfoHtml =
    headerConfig.showStudentInfo !== false
      ? `
      <div class="student-info-row">
        <div class="student-name-col">
          <span class="info-label">Họ và tên:</span>
          ${
            studentFullName
              ? `<span style="font-weight: bold; border-bottom: 1px dotted #000; flex: 1; padding-left: 4px;">${escapeHtml(studentFullName)}</span>`
              : `<span class="dot-leader"></span>`
          }
        </div>
        <div class="student-class-col">
          <span class="info-label">Lớp:</span>
          ${
            studentClassName
              ? `<span style="font-weight: bold; border-bottom: 1px dotted #000; flex: 1; padding-left: 4px;">${escapeHtml(studentClassName)}</span>`
              : `<span class="dot-leader"></span>`
          }
        </div>
      </div>
    `
      : '';

  const scoreBoxHtml = showScoreBox
    ? `
      <table class="score-table">
        <thead>
          <tr>
            <th style="width: 28%;">ĐIỂM</th>
            <th>LỜI PHÊ CỦA THẦY, CÔ GIÁO</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="height: 56px;"></td>
            <td style="height: 56px;"></td>
          </tr>
        </tbody>
      </table>
    `
    : '';

  const answerGridHtml =
    headerConfig.showAnswerGrid && printableItems.length > 0
      ? `
      <div class="answer-grid-section">
        <div class="section-subtitle">PHIẾU TRẢ LỜI TRẮC NGHIỆM:</div>
        <div class="answer-grid">
          ${printableItems
            .map(
              (item) => `
            <div class="answer-grid-cell">
              <div class="answer-grid-header">Câu ${item.index}</div>
              <div class="answer-grid-val" style="font-size: ${item.questionType === 'multiple_choice' ? '1em' : '0.72em'};">${showAnswers ? escapeHtml(item.correctLabel) : ''}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
      : '';

  const renderQuestionHtml = (item: PrintableQuestionItem) => {
    const colClass =
      item.recommendedColumns === 4
        ? 'opts-4-col'
        : item.recommendedColumns === 2
          ? 'opts-2-col'
          : 'opts-1-col';

    const showCaption =
      item.imageCaption &&
      item.imageUrl &&
      !item.imageUrl.includes('hinh_1_1') &&
      !item.imageUrl.includes('hinh_1_2');

    const imageHtml = item.imageUrl
      ? `
      <div class="question-image-wrap">
        <img src="${escapeHtml(item.imageUrl)}" alt="Hình câu ${item.index}" class="question-image" />
        ${showCaption ? `<div class="question-caption">${escapeHtml(item.imageCaption || '')}</div>` : ''}
      </div>
    `
      : '';

    let bodyHtml = '';
    if (item.questionType === 'true_false' && item.statements && item.statements.length > 0) {
      const rowsHtml = item.statements
        .map(
          (st) => `
          <tr>
            <td class="tf-stmt-cell"><strong>${escapeHtml(st.label)})</strong> ${escapeHtml(st.content)}</td>
            <td class="tf-choice-cell">${showAnswers && st.isTrue ? '✓ Đúng' : '☐'}</td>
            <td class="tf-choice-cell">${showAnswers && !st.isTrue ? '✓ Sai' : '☐'}</td>
          </tr>
        `
        )
        .join('');
      bodyHtml = `
        <table class="tf-table">
          <thead>
            <tr>
              <th style="text-align: left; padding: 4px 8px;">Phát biểu nhận định</th>
              <th style="width: 64px; text-align: center;">Đúng</th>
              <th style="width: 64px; text-align: center;">Sai</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    } else if (item.questionType === 'matching' && item.matchingRows && item.matchingRows.length > 0) {
      const rowsHtml = item.matchingRows
        .map(
          (row) => `
          <tr>
            <td style="width: 48%; padding: 4px 8px; vertical-align: top;"><strong>${escapeHtml(row.leftLabel)}.</strong> ${escapeHtml(row.leftContent)}</td>
            <td style="width: 52%; padding: 4px 8px; vertical-align: top;"><strong>${escapeHtml(row.rightLabel)}.</strong> ${escapeHtml(row.rightContent)}</td>
          </tr>
        `
        )
        .join('');
      const answerLine = item.matchingRows
        .map((row) =>
          showAnswers
            ? `<strong>${escapeHtml(row.leftLabel)} - ${escapeHtml(row.correctRightLabel)}</strong>`
            : `${escapeHtml(row.leftLabel)} - ........`
        )
        .join(';&nbsp;&nbsp;&nbsp;');
      bodyHtml = `
        <table class="tf-table">
          <thead>
            <tr>
              <th style="width: 48%; text-align: left; padding: 4px 8px;">Cột A</th>
              <th style="width: 52%; text-align: left; padding: 4px 8px;">Cột B</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="padding-left: 4px; margin-top: 4px; font-size: 0.95em;">
          <strong>Trả lời ghép đôi:</strong> ${answerLine}
        </div>
      `;
    } else {
      const optionsHtml = item.options
        .map((opt) => {
          const isHigh = showAnswers && opt.isCorrect;
          return `
          <div class="option-item ${isHigh ? 'option-correct' : ''}">
            <span class="option-label ${isHigh ? 'option-label-circle' : ''}">${escapeHtml(opt.label)}.</span>
            <span class="option-text">${escapeHtml(opt.content)}</span>
          </div>
        `;
        })
        .join('');
      bodyHtml = `<div class="options-grid ${colClass}">${optionsHtml}</div>`;
    }

    const explanationHtml =
      showAnswers && showExplanations && item.explanation
        ? `
      <div class="question-explanation">
        <strong>• Đáp án: ${escapeHtml(item.correctLabel)}.</strong> <em>Hướng dẫn giải: ${escapeHtml(item.explanation)}</em>
      </div>
    `
        : '';

    const typeNote =
      item.questionType === 'true_false'
        ? ' <span style="font-weight: normal; font-style: italic;">(Đúng/Sai)</span>'
        : item.questionType === 'matching'
          ? ' <span style="font-weight: normal; font-style: italic;">(Ghép đôi)</span>'
          : '';

    return `
      <div class="question-block">
        <div class="question-stem">
          <strong>Câu ${item.index}.${typeNote} ${escapeHtml(item.stem)}</strong>
        </div>
        ${imageHtml}
        ${bodyHtml}
        ${explanationHtml}
      </div>
    `;
  };

  const teacherKeyHtml =
    showAnswers && printableItems.length > 0
      ? `
      <div class="teacher-key-section">
        <div class="teacher-key-title">BẢNG ĐÁP ÁN CHẤM ĐIỂM (${
          variantCode === 'GOC' ? 'ĐỀ GỐC' : `MÃ ĐỀ ${escapeHtml(variantCode)}`
        })</div>
        <div class="answer-grid">
          ${printableItems
            .map(
              (item) => `
            <div class="answer-grid-cell">
              <div class="answer-grid-header">Câu ${item.index}</div>
              <div class="answer-grid-val" style="font-size: ${item.questionType === 'multiple_choice' ? '1em' : '0.72em'}; padding: 2px;">${escapeHtml(item.correctLabel)}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
      : '';

  const pagesHtml = pages
    .map((page) => {
      const pageHeaderHtml = page.isFirstPage
        ? `
        <table class="header-table">
          <tr>
            <td class="header-left">
              <div class="school-name">${escapeHtml(headerConfig.schoolName)}</div>
              <div class="school-year">${escapeHtml(headerConfig.schoolYear)}</div>
              ${underlineHtml}
            </td>
            <td class="header-right">
              <div class="exam-title">${escapeHtml(headerConfig.examHeaderTitle)}</div>
              <div class="subject-name">${escapeHtml(headerConfig.subjectHeader)}</div>
              <div class="exam-duration">${escapeHtml(durationStr)}</div>
              ${variantBadgeHtml}
            </td>
          </tr>
        </table>
        ${studentInfoHtml}
        ${scoreBoxHtml}
        ${answerGridHtml}
      `
        : `
        <div class="running-page-header">
          <span>${escapeHtml(headerConfig.examHeaderTitle)} - ${escapeHtml(headerConfig.subjectHeader)}</span>
          <span>${variantCode === 'GOC' ? 'Đề gốc' : `Mã đề: ${escapeHtml(variantCode)}`}</span>
        </div>
      `;

      const pageQuestionsHtml = page.items.map(renderQuestionHtml).join('');
      const endMarkHtml = page.showEndMark
        ? `
        <div class="exam-footer">
          <div class="exam-end-mark">--- HẾT ---</div>
          <div class="exam-end-note">(Học sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm)</div>
        </div>
      `
        : '';

      return `
        <section class="a4-page ${page.isLastPage ? 'a4-page-last' : ''}" data-page-number="${page.pageNumber}">
          <div class="a4-page-body">
            ${pageHeaderHtml}
            <div class="questions-list">
              ${pageQuestionsHtml}
            </div>
            ${endMarkHtml}
            ${page.showTeacherKey ? teacherKeyHtml : ''}
          </div>
          <footer class="a4-page-footer">
            <span>${escapeHtml(headerConfig.schoolName)} • ${variantCode === 'GOC' ? 'Đề gốc' : `Mã đề ${escapeHtml(variantCode)}`}</span>
            <span class="page-number-badge">Trang ${page.pageNumber} / ${page.totalPages}</span>
          </footer>
        </section>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(examTitle)} - ${variantCode === 'GOC' ? 'Đề gốc' : `Mã đề ${variantCode}`}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 14mm 20mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: "Times New Roman", Times, Georgia, serif;
      font-size: ${fontSizePt};
      line-height: 1.45;
    }
    .a4-document {
      width: 100%;
      max-width: 175mm;
      margin: 0 auto;
    }
    .a4-page {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 266mm;
      page-break-after: always;
      break-after: page;
    }
    .a4-page-last {
      page-break-after: auto;
      break-after: auto;
    }
    .a4-page-body {
      flex: 1;
    }
    .running-page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.88em;
      font-style: italic;
      color: #334155;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
      margin-bottom: 10px;
    }
    .a4-page-footer {
      margin-top: 12px;
      padding-top: 5px;
      border-top: 1px solid #000000;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.88em;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .page-number-badge {
      font-weight: bold;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .header-table td {
      vertical-align: top;
      text-align: center;
      padding: 0 4px;
    }
    .header-left {
      width: 44%;
    }
    .header-right {
      width: 56%;
    }
    .school-name, .exam-title, .subject-name {
      font-weight: bold;
      text-transform: uppercase;
      line-height: 1.3;
    }
    .school-year {
      font-weight: bold;
      line-height: 1.3;
      margin-top: 2px;
    }
    .header-underline {
      width: 130px;
      margin: 8px auto 0 auto;
      border-bottom: 1.5px solid #000000;
    }
    .exam-duration {
      font-weight: bold;
      font-style: italic;
      line-height: 1.3;
      margin-top: 2px;
    }
    .variant-box {
      display: inline-block;
      margin-top: 4px;
      padding: 1px 8px;
      border: 1px solid #000000;
      font-weight: bold;
      font-size: 0.92em;
    }
    .student-info-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      margin: 10px 0 14px 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11.5pt;
    }
    .student-name-col {
      flex: 1.65;
      display: flex;
      align-items: baseline;
    }
    .student-class-col {
      flex: 1;
      display: flex;
      align-items: baseline;
    }
    .info-label {
      font-weight: bold;
      white-space: nowrap;
      margin-right: 6px;
    }
    .dot-leader {
      flex: 1;
      border-bottom: 1.2px dotted #000000;
      height: 0.9em;
    }
    .score-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 11.5pt;
    }
    .score-table th, .score-table td {
      border: 1px solid #000000;
      padding: 4px 8px;
    }
    .score-table th {
      font-weight: bold;
      text-align: center;
      background: #f8fafc;
    }
    .answer-grid-section {
      margin-bottom: 14px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .section-subtitle {
      font-weight: bold;
      font-size: 0.95em;
      margin-bottom: 4px;
    }
    .answer-grid {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      border-top: 1px solid #000000;
      border-left: 1px solid #000000;
      text-align: center;
      font-size: 0.9em;
    }
    .answer-grid-cell {
      border-right: 1px solid #000000;
      border-bottom: 1px solid #000000;
    }
    .answer-grid-header {
      font-weight: bold;
      border-bottom: 1px solid #000000;
      background: #f1f5f9;
      padding: 2px 0;
    }
    .answer-grid-val {
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    .question-block {
      margin-bottom: 11px;
      break-inside: avoid;
      page-break-inside: avoid;
      orphans: 2;
      widows: 2;
    }
    .question-stem {
      text-align: justify;
      text-wrap: pretty;
      margin-bottom: 3px;
    }
    .question-image-wrap {
      text-align: center;
      margin: 6px 0;
    }
    .question-image {
      max-height: 150px;
      max-width: 90%;
      object-fit: contain;
    }
    .question-caption {
      font-style: italic;
      font-size: 0.92em;
      margin-top: 2px;
    }
    .options-grid {
      display: grid;
      gap: 3px 16px;
      padding-left: 8px;
    }
    .opts-4-col {
      grid-template-columns: repeat(4, 1fr);
    }
    .opts-2-col {
      grid-template-columns: repeat(2, 1fr);
    }
    .opts-1-col {
      grid-template-columns: 1fr;
    }
    .option-item {
      display: flex;
      align-items: baseline;
      gap: 4px;
      text-wrap: pretty;
    }
    .option-label {
      font-weight: bold;
      flex-shrink: 0;
    }
    .option-text {
      text-wrap: pretty;
    }
    .option-correct {
      font-weight: bold;
      text-decoration: underline;
    }
    .option-label-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 19px;
      height: 19px;
      border: 1.5px solid #000000;
      border-radius: 999px;
      text-decoration: none;
    }
    .question-explanation {
      padding-left: 8px;
      margin-top: 3px;
      font-size: 0.92em;
      text-wrap: pretty;
    }
    .tf-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      margin-bottom: 4px;
      font-size: 0.96em;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .tf-table th, .tf-table td {
      border: 1px solid #000000;
      padding: 4px 8px;
    }
    .tf-table th {
      background: #f8fafc;
      font-weight: bold;
    }
    .tf-stmt-cell {
      text-align: justify;
      text-wrap: pretty;
    }
    .tf-choice-cell {
      text-align: center;
      width: 64px;
      font-weight: bold;
      vertical-align: middle;
    }
    .exam-footer {
      margin-top: 18px;
      text-align: center;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .exam-end-mark {
      font-weight: bold;
      letter-spacing: 1px;
    }
    .exam-end-note {
      font-style: italic;
      font-size: 0.92em;
      margin-top: 2px;
    }
    .teacher-key-section {
      margin-top: 18px;
      padding-top: 10px;
      border-top: 1.5px dashed #475569;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .teacher-key-title {
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
  </style>
</head>
<body>
  <div class="a4-document">
    ${pagesHtml}
  </div>
</body>
</html>`;
}

/**
 * Kết nối với hộp thoại Máy in hoặc Lưu thành PDF của trình duyệt thông qua một khung A4 độc lập
 */
export function printExamPaperViaA4Frame(opts: A4PrintRenderOptions): void {
  const html = buildStandaloneA4PrintHtml(opts);
  const previousTitle = document.title;
  const safeFileTitle = `${opts.examTitle.replace(/\s+/g, '_')}_${
    opts.variantCode === 'GOC' ? 'De_Goc' : `Ma_${opts.variantCode}`
  }`;
  document.title = safeFileTitle;

  let iframe = document.getElementById('smarttest-a4-print-iframe') as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'smarttest-a4-print-iframe';
    iframe.title = 'Khung in đề kiểm tra A4';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    window.print();
    document.title = previousTitle;
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    } catch (_e) {
      window.print();
    } finally {
      setTimeout(() => {
        document.title = previousTitle;
      }, 1500);
    }
  };

  const images = Array.from(doc.images || []);
  if (images.length === 0) {
    setTimeout(triggerPrint, 120);
  } else {
    let loaded = 0;
    const checkDone = () => {
      loaded++;
      if (loaded >= images.length) {
        setTimeout(triggerPrint, 100);
      }
    };
    images.forEach((img) => {
      if (img.complete) {
        checkDone();
      } else {
        img.addEventListener('load', checkDone, { once: true });
        img.addEventListener('error', checkDone, { once: true });
      }
    });
    setTimeout(() => {
      if (loaded < images.length) {
        triggerPrint();
      }
    }, 1500);
  }
}

/**
 * Đóng gói danh sách ảnh JPEG của từng trang A4 thành tệp nhị phân chuẩn %PDF-1.4 đa trang
 */
function buildPdfBytesFromJpegPages(
  pages: { jpegBytes: Uint8Array; widthPx: number; heightPx: number }[]
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const pushStr = (s: string) => {
    const b = encoder.encode(s);
    chunks.push(b);
    offset += b.length;
  };
  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };

  const pageCount = pages.length;
  const totalObjects = 2 + pageCount * 3;
  const xrefOffsets: number[] = new Array(totalObjects + 1).fill(0);

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  xrefOffsets[1] = offset;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  const kidsRefs = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  xrefOffsets[2] = offset;
  pushStr(`2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs} ] /Count ${pageCount} >>\nendobj\n`);

  // A4 dimensions in PDF points (72 dpi): 595.28 x 841.89
  const a4W = 595.28;
  const a4H = 841.89;

  pages.forEach((p, i) => {
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;
    const imgName = `/Im${i + 1}`;

    xrefOffsets[pageObjId] = offset;
    pushStr(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${a4W} ${a4H}] /Resources << /XObject << ${imgName} ${imageObjId} 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    const contentStream = `q\n${a4W} 0 0 ${a4H} 0 0 cm\n${imgName} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    xrefOffsets[contentObjId] = offset;
    pushStr(`${contentObjId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr('\nendstream\nendobj\n');

    xrefOffsets[imageObjId] = offset;
    pushStr(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(p.jpegBytes);
    pushStr('\nendstream\nendobj\n');
  });

  const xrefStart = offset;
  pushStr(`xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= totalObjects; id++) {
    const offStr = String(xrefOffsets[id]).padStart(10, '0');
    pushStr(`${offStr} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Ngắt dòng trên Canvas thông minh, tự động cân bằng dòng cuối để không bao giờ rơi 1 từ đơn lẻ xuống dòng mới
 */
function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [''];

  // Nếu toàn bộ câu chỉ vượt quá maxWidth một chút (<= 3.5%), giữ trên 1 dòng để tránh rơi 1 từ
  if (ctx.measureText(cleaned).width <= maxWidth * 1.035) {
    return [cleaned];
  }

  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);

  // Cân bằng dòng cuối: nếu dòng cuối chỉ có 1 từ (hoặc 2 âm tiết cực ngắn <= 8 ký tự),
  // chuyển bớt 1-2 từ từ dòng áp chót xuống để dòng cuối có ít nhất 2-3 từ cân đối.
  if (lines.length >= 2) {
    const lastIdx = lines.length - 1;
    const prevIdx = lines.length - 2;
    const lastWords = lines[lastIdx].split(' ').filter(Boolean);
    const prevWords = lines[prevIdx].split(' ').filter(Boolean);

    if (
      (lastWords.length === 1 || (lastWords.length === 2 && lines[lastIdx].length <= 8)) &&
      prevWords.length >= 3
    ) {
      const pullCount = lastWords.length === 1 && prevWords.length >= 4 ? 2 : 1;
      const moved = prevWords.slice(-pullCount).join(' ');
      const candidateLast = `${moved} ${lines[lastIdx]}`;
      if (ctx.measureText(candidateLast).width <= maxWidth) {
        lines[prevIdx] = prevWords.slice(0, -pullCount).join(' ');
        lines[lastIdx] = candidateLast;
      }
    }
  }

  return lines;
}

/**
 * Kết xuất trực tiếp đề kiểm tra khổ giấy A4 thành tệp .PDF chuẩn đa trang:
 * - Giữ nguyên định dạng bảng biểu kẻ khung đối với câu hỏi Đúng/Sai và Ghép đôi
 * - Tự động cân bằng dòng tránh rơi 1 từ xuống dòng
 * - Tự động phân trang và đánh số trang (Trang 1 / N) ở chân mỗi trang A4
 */
export async function exportExamPaperToPdfA4(opts: A4PrintRenderOptions): Promise<string> {
  const {
    examTitle,
    durationMinutes,
    headerConfig,
    printableItems,
    variantCode,
    fontSizePt,
    showAnswers,
    showExplanations,
    showScoreBox = false,
  } = opts;

  // Khổ giấy A4 ở độ phân giải 150 DPI: 1240 x 1754 px
  const PAGE_W = 1240;
  const PAGE_H = 1754;
  const MARGIN_LEFT = 118; // ~20mm
  const MARGIN_RIGHT = 90; // ~15mm
  const MARGIN_TOP = 94; // ~16mm
  const MARGIN_BOTTOM = 94;
  const FOOTER_RESERVED_H = 52; // Dành cho dòng chân trang & đánh số trang
  const MAX_CONTENT_Y = PAGE_H - MARGIN_BOTTOM - FOOTER_RESERVED_H;
  const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

  const baseFontPx = fontSizePt === '12pt' ? 23 : fontSizePt === '14pt' ? 27 : 25;
  const lineH = Math.round(baseFontPx * 1.42);

  // Tải trước hình ảnh câu hỏi nếu có
  const imageMap = new Map<string, HTMLImageElement>();
  await Promise.all(
    printableItems.map(async (item) => {
      if (item.imageUrl) {
        const img = await loadImageElement(item.imageUrl);
        if (img) {
          imageMap.set(item.questionId, img);
        }
      }
    })
  );

  const canvases: HTMLCanvasElement[] = [];
  let currentCanvas = document.createElement('canvas');
  currentCanvas.width = PAGE_W;
  currentCanvas.height = PAGE_H;
  let ctx = currentCanvas.getContext('2d')!;

  const initPage = (canvas: HTMLCanvasElement, isContinuationPage: boolean) => {
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, PAGE_W, PAGE_H);
    c.fillStyle = '#000000';
    c.textBaseline = 'top';

    if (isContinuationPage) {
      c.font = `italic ${baseFontPx - 4}px "Times New Roman", Times, serif`;
      c.fillStyle = '#334155';
      c.textAlign = 'left';
      c.fillText(
        `${(headerConfig.examHeaderTitle || 'ĐỀ KIỂM TRA').toUpperCase()} - ${(headerConfig.subjectHeader || '').toUpperCase()}`,
        MARGIN_LEFT,
        MARGIN_TOP - 8
      );
      c.textAlign = 'right';
      c.fillText(
        variantCode === 'GOC' ? 'Đề gốc' : `Mã đề: ${variantCode}`,
        MARGIN_LEFT + CONTENT_W,
        MARGIN_TOP - 8
      );
      c.strokeStyle = '#cbd5e1';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(MARGIN_LEFT, MARGIN_TOP + lineH - 10);
      c.lineTo(MARGIN_LEFT + CONTENT_W, MARGIN_TOP + lineH - 10);
      c.stroke();
      c.fillStyle = '#000000';
      c.textAlign = 'left';
    }
    return c;
  };

  ctx = initPage(currentCanvas, false);
  canvases.push(currentCanvas);
  let y = MARGIN_TOP;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > MAX_CONTENT_Y) {
      currentCanvas = document.createElement('canvas');
      currentCanvas.width = PAGE_W;
      currentCanvas.height = PAGE_H;
      ctx = initPage(currentCanvas, true);
      canvases.push(currentCanvas);
      y = MARGIN_TOP + lineH + 4;
    }
  };

  // 1. Vẽ Tiêu đề 2 cột chuẩn như mẫu
  const leftCenterX = MARGIN_LEFT + CONTENT_W * 0.22;
  const rightCenterX = MARGIN_LEFT + CONTENT_W * 0.72;

  ctx.textAlign = 'center';
  ctx.font = `bold ${baseFontPx}px "Times New Roman", Times, serif`;
  ctx.fillText((headerConfig.schoolName || 'TRƯỜNG TH & THCS THỤY LÂM').toUpperCase(), leftCenterX, y);
  ctx.fillText(
    (headerConfig.examHeaderTitle || 'ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I').toUpperCase(),
    rightCenterX,
    y
  );

  const row2Y = y + lineH;
  ctx.font = `bold ${baseFontPx}px "Times New Roman", Times, serif`;
  ctx.fillText(headerConfig.schoolYear || 'Năm học 2025-2026', leftCenterX, row2Y);
  ctx.fillText((headerConfig.subjectHeader || 'MÔN: TIN HỌC 7').toUpperCase(), rightCenterX, row2Y);

  const row3Y = row2Y + lineH;
  if (headerConfig.showUnderline !== false) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftCenterX - 95, row3Y + 8);
    ctx.lineTo(leftCenterX + 95, row3Y + 8);
    ctx.stroke();
  }

  ctx.font = `bold italic ${baseFontPx}px "Times New Roman", Times, serif`;
  const durStr = headerConfig.durationText || `(Thời gian: ${durationMinutes} phút)`;
  ctx.fillText(durStr, rightCenterX, row3Y);

  y = row3Y + lineH + 10;

  if (variantCode !== 'GOC') {
    ctx.font = `bold ${baseFontPx - 2}px "Times New Roman", Times, serif`;
    const badgeText = `Mã đề: ${variantCode}`;
    const bw = ctx.measureText(badgeText).width + 24;
    ctx.strokeRect(rightCenterX - bw / 2, y - 4, bw, lineH);
    ctx.fillText(badgeText, rightCenterX, y);
    y += lineH + 8;
  }

  ctx.textAlign = 'left';

  // 2. Dòng Họ và tên & Lớp
  if (headerConfig.showStudentInfo !== false) {
    y += 4;
    ctx.font = `bold ${baseFontPx - 2}px Arial, sans-serif`;
    const nameLabel = 'Họ và tên: ';
    ctx.fillText(nameLabel, MARGIN_LEFT, y);
    const nameLabelW = ctx.measureText(nameLabel).width;
    const classX = MARGIN_LEFT + Math.round(CONTENT_W * 0.64);

    if (opts.studentFullName) {
      ctx.font = `bold ${baseFontPx - 2}px Arial, sans-serif`;
      ctx.fillText(opts.studentFullName, MARGIN_LEFT + nameLabelW, y);
    } else {
      ctx.font = `${baseFontPx - 2}px Arial, sans-serif`;
      const dots1 = '.'.repeat(62);
      ctx.save();
      ctx.beginPath();
      ctx.rect(MARGIN_LEFT + nameLabelW, y, classX - (MARGIN_LEFT + nameLabelW) - 18, lineH);
      ctx.clip();
      ctx.fillText(dots1, MARGIN_LEFT + nameLabelW, y);
      ctx.restore();
    }

    ctx.font = `bold ${baseFontPx - 2}px Arial, sans-serif`;
    const classLabel = 'Lớp: ';
    ctx.fillText(classLabel, classX, y);
    const classLabelW = ctx.measureText(classLabel).width;

    if (opts.studentClassName) {
      ctx.font = `bold ${baseFontPx - 2}px Arial, sans-serif`;
      ctx.fillText(opts.studentClassName, classX + classLabelW, y);
    } else {
      ctx.font = `${baseFontPx - 2}px Arial, sans-serif`;
      ctx.save();
      ctx.beginPath();
      ctx.rect(classX + classLabelW, y, MARGIN_LEFT + CONTENT_W - (classX + classLabelW), lineH);
      ctx.clip();
      ctx.fillText('.'.repeat(40), classX + classLabelW, y);
      ctx.restore();
    }

    y += lineH + 14;
  }

  // 3. Khung Điểm & Lời phê (nếu bật)
  if (showScoreBox) {
    const boxH = 110;
    ensureSpace(boxH + 20);
    const col1W = Math.round(CONTENT_W * 0.28);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(MARGIN_LEFT, y, CONTENT_W, boxH);
    ctx.beginPath();
    ctx.moveTo(MARGIN_LEFT, y + 34);
    ctx.lineTo(MARGIN_LEFT + CONTENT_W, y + 34);
    ctx.moveTo(MARGIN_LEFT + col1W, y);
    ctx.lineTo(MARGIN_LEFT + col1W, y + boxH);
    ctx.stroke();

    ctx.font = `bold ${baseFontPx - 2}px "Times New Roman", Times, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('ĐIỂM', MARGIN_LEFT + col1W / 2, y + 6);
    ctx.fillText(
      'LỜI PHÊ CỦA THẦY, CÔ GIÁO',
      MARGIN_LEFT + col1W + (CONTENT_W - col1W) / 2,
      y + 6
    );
    ctx.textAlign = 'left';
    y += boxH + 16;
  }

  // 4. Vẽ danh sách câu hỏi
  for (const item of printableItems) {
    ctx.font = `bold ${baseFontPx}px "Times New Roman", Times, serif`;
    const typeLabel =
      item.questionType === 'true_false'
        ? ' (Trắc nghiệm Đúng/Sai)'
        : item.questionType === 'matching'
          ? ' (Trắc nghiệm Ghép đôi)'
          : '';
    const stemText = `Câu ${item.index}.${typeLabel} ${item.stem}`;
    const stemLines = wrapCanvasLines(ctx, stemText, CONTENT_W);

    const img = imageMap.get(item.questionId);
    let imgDrawW = 0;
    let imgDrawH = 0;
    if (img && img.width > 0 && img.height > 0) {
      const maxImgH = 210;
      const maxImgW = CONTENT_W * 0.75;
      const scale = Math.min(maxImgW / img.width, maxImgH / img.height, 1.4);
      imgDrawW = Math.round(img.width * scale);
      imgDrawH = Math.round(img.height * scale);
    }

    // Tính trước chiều cao phần thân đáp án / bảng biểu để không bị cắt ngang câu hỏi giữa 2 trang
    let bodyEstHeight = 0;
    const tfColChoiceW = 104;
    const tfColStmtW = CONTENT_W - tfColChoiceW * 2;
    let precomputedTfRows: { label: string; lines: string[]; isTrue: boolean; rowH: number }[] = [];
    let precomputedMatchRows: {
      leftLabel: string;
      leftLines: string[];
      rightLabel: string;
      rightLines: string[];
      correctRightLabel: string;
      rowH: number;
    }[] = [];

    if (item.questionType === 'true_false' && item.statements && item.statements.length > 0) {
      ctx.font = `${baseFontPx - 1}px "Times New Roman", Times, serif`;
      const headerRowH = lineH + 12;
      bodyEstHeight += headerRowH;
      for (const st of item.statements) {
        const lines = wrapCanvasLines(ctx, `${st.label}) ${st.content}`, tfColStmtW - 22);
        const rowH = Math.max(lineH + 12, lines.length * lineH + 12);
        precomputedTfRows.push({
          label: st.label,
          lines,
          isTrue: st.isTrue,
          rowH,
        });
        bodyEstHeight += rowH;
      }
      bodyEstHeight += 10;
    } else if (item.questionType === 'matching' && item.matchingRows && item.matchingRows.length > 0) {
      ctx.font = `${baseFontPx - 1}px "Times New Roman", Times, serif`;
      const colAW = Math.round(CONTENT_W * 0.47);
      const colBW = CONTENT_W - colAW;
      const headerRowH = lineH + 12;
      bodyEstHeight += headerRowH;
      for (const row of item.matchingRows) {
        const leftLines = wrapCanvasLines(ctx, `${row.leftLabel}. ${row.leftContent}`, colAW - 22);
        const rightLines = wrapCanvasLines(ctx, `${row.rightLabel}. ${row.rightContent}`, colBW - 22);
        const rowH = Math.max(leftLines.length, rightLines.length) * lineH + 12;
        precomputedMatchRows.push({
          leftLabel: row.leftLabel,
          leftLines,
          rightLabel: row.rightLabel,
          rightLines,
          correctRightLabel: row.correctRightLabel,
          rowH,
        });
        bodyEstHeight += rowH;
      }
      bodyEstHeight += lineH + 14;
    } else {
      const optRowsEst = item.recommendedColumns === 4 ? 1 : item.recommendedColumns === 2 ? 2 : 4;
      bodyEstHeight = optRowsEst * lineH + 18;
    }

    const estTotalQuestionH =
      stemLines.length * lineH +
      (imgDrawH > 0 ? imgDrawH + 22 : 0) +
      bodyEstHeight +
      16;
    ensureSpace(estTotalQuestionH);

    // Vẽ thân câu hỏi
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${baseFontPx}px "Times New Roman", Times, serif`;
    for (const line of stemLines) {
      ctx.fillText(line, MARGIN_LEFT, y);
      y += lineH;
    }

    // Vẽ hình minh họa nếu có
    if (img && imgDrawH > 0) {
      y += 6;
      const imgX = MARGIN_LEFT + Math.round((CONTENT_W - imgDrawW) / 2);
      ctx.drawImage(img, imgX, y, imgDrawW, imgDrawH);
      y += imgDrawH + 8;
    }

    // DẠNG 2: VẼ BẢNG BIỂU KẺ KHUNG ĐỐI VỚI CÂU HỎI TRẮC NGHIỆM ĐÚNG/SAI
    if (item.questionType === 'true_false' && precomputedTfRows.length > 0) {
      y += 4;
      const tableX = MARGIN_LEFT;
      const col1W = tfColStmtW;
      const col2W = tfColChoiceW;
      const col3W = tfColChoiceW;
      const headerH = lineH + 12;

      // Nền dòng tiêu đề bảng Đúng/Sai
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(tableX, y, CONTENT_W, headerH);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(tableX, y, CONTENT_W, headerH);

      // Đường kẻ dọc chia cột tiêu đề
      ctx.beginPath();
      ctx.moveTo(tableX + col1W, y);
      ctx.lineTo(tableX + col1W, y + headerH);
      ctx.moveTo(tableX + col1W + col2W, y);
      ctx.lineTo(tableX + col1W + col2W, y + headerH);
      ctx.stroke();

      // Chữ tiêu đề cột
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${baseFontPx - 1}px "Times New Roman", Times, serif`;
      ctx.textAlign = 'left';
      ctx.fillText('Phát biểu nhận định', tableX + 10, y + 6);
      ctx.textAlign = 'center';
      ctx.fillText('Đúng', tableX + col1W + col2W / 2, y + 6);
      ctx.fillText('Sai', tableX + col1W + col2W + col3W / 2, y + 6);
      ctx.textAlign = 'left';
      y += headerH;

      // Các dòng phát biểu a), b), c), d)
      for (const row of precomputedTfRows) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(tableX, y, CONTENT_W, row.rowH);
        ctx.beginPath();
        ctx.moveTo(tableX + col1W, y);
        ctx.lineTo(tableX + col1W, y + row.rowH);
        ctx.moveTo(tableX + col1W + col2W, y);
        ctx.lineTo(tableX + col1W + col2W, y + row.rowH);
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = `${baseFontPx - 1}px "Times New Roman", Times, serif`;
        row.lines.forEach((ln, lIdx) => {
          ctx.fillText(ln, tableX + 10, y + 6 + lIdx * lineH);
        });

        // Vẽ ô chọn Đúng / Sai ở giữa mỗi cột
        const midY = y + Math.max(6, Math.round((row.rowH - lineH) / 2));
        ctx.textAlign = 'center';
        ctx.font = `bold ${baseFontPx - 1}px "Times New Roman", Times, serif`;
        if (showAnswers) {
          ctx.fillText(row.isTrue ? '✓ Đúng' : '☐', tableX + col1W + col2W / 2, midY);
          ctx.fillText(!row.isTrue ? '✓ Sai' : '☐', tableX + col1W + col2W + col3W / 2, midY);
        } else {
          // Vẽ hình vuông checkbox chuẩn ở giữa cột Đúng và cột Sai
          const boxSize = 18;
          const boxY = y + Math.round((row.rowH - boxSize) / 2);
          ctx.strokeRect(tableX + col1W + Math.round((col2W - boxSize) / 2), boxY, boxSize, boxSize);
          ctx.strokeRect(
            tableX + col1W + col2W + Math.round((col3W - boxSize) / 2),
            boxY,
            boxSize,
            boxSize
          );
        }
        ctx.textAlign = 'left';
        y += row.rowH;
      }
      y += 6;
    } else if (item.questionType === 'matching' && precomputedMatchRows.length > 0) {
      // DẠNG 3: VẼ BẢNG BIỂU CỘT A - CỘT B ĐỐI VỚI CÂU HỎI GHÉP ĐÔI
      y += 4;
      const tableX = MARGIN_LEFT;
      const colAW = Math.round(CONTENT_W * 0.47);
      const colBW = CONTENT_W - colAW;
      const headerH = lineH + 12;

      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(tableX, y, CONTENT_W, headerH);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(tableX, y, CONTENT_W, headerH);
      ctx.beginPath();
      ctx.moveTo(tableX + colAW, y);
      ctx.lineTo(tableX + colAW, y + headerH);
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `bold ${baseFontPx - 1}px "Times New Roman", Times, serif`;
      ctx.fillText('Cột A', tableX + 10, y + 6);
      ctx.fillText('Cột B', tableX + colAW + 10, y + 6);
      y += headerH;

      for (const row of precomputedMatchRows) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(tableX, y, CONTENT_W, row.rowH);
        ctx.beginPath();
        ctx.moveTo(tableX + colAW, y);
        ctx.lineTo(tableX + colAW, y + row.rowH);
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = `${baseFontPx - 1}px "Times New Roman", Times, serif`;
        row.leftLines.forEach((ln, lIdx) => {
          ctx.fillText(ln, tableX + 10, y + 6 + lIdx * lineH);
        });
        row.rightLines.forEach((ln, lIdx) => {
          ctx.fillText(ln, tableX + colAW + 10, y + 6 + lIdx * lineH);
        });
        y += row.rowH;
      }

      y += 6;
      ctx.font = `bold ${baseFontPx - 1}px "Times New Roman", Times, serif`;
      const ansText = precomputedMatchRows
        .map((r) =>
          showAnswers ? `${r.leftLabel} nối với ${r.correctRightLabel}` : `${r.leftLabel} nối với .......`
        )
        .join(';   ');
      ctx.fillText(`Trả lời ghép đôi:  ${ansText}`, MARGIN_LEFT + 4, y);
      y += lineH + 4;
    } else {
      // DẠNG 1: Vẽ các phương án A, B, C, D
      const cols = item.recommendedColumns;
      const colW = Math.floor((CONTENT_W - 16) / cols);

      if (cols === 4) {
        let maxRowH = lineH;
        item.options.forEach((opt, idx) => {
          const colX = MARGIN_LEFT + 12 + idx * colW;
          const isHigh = showAnswers && opt.isCorrect;
          ctx.font = `bold ${baseFontPx}px "Times New Roman", Times, serif`;
          const lbl = `${opt.label}. `;
          ctx.fillText(lbl, colX, y);
          const lblW = ctx.measureText(lbl).width;

          ctx.font = `${isHigh ? 'bold ' : ''}${baseFontPx}px "Times New Roman", Times, serif`;
          const lines = wrapCanvasLines(ctx, opt.content, colW - lblW - 10);
          lines.forEach((ln, lIdx) => {
            ctx.fillText(ln, colX + lblW, y + lIdx * lineH);
          });
          maxRowH = Math.max(maxRowH, lines.length * lineH);
        });
        y += maxRowH;
      } else if (cols === 2) {
        for (let r = 0; r < 2; r++) {
          let maxRowH = lineH;
          for (let c = 0; c < 2; c++) {
            const opt = item.options[r * 2 + c];
            if (!opt) continue;
            const colX = MARGIN_LEFT + 12 + c * colW;
            const isHigh = showAnswers && opt.isCorrect;
            ctx.font = `bold ${baseFontPx}px "Times New Roman", Times, serif`;
            const lbl = `${opt.label}. `;
            ctx.fillText(lbl, colX, y);
            const lblW = ctx.measureText(lbl).width;

            ctx.font = `${isHigh ? 'bold ' : ''}${baseFontPx}px "Times New Roman", Times, serif`;
            const lines = wrapCanvasLines(ctx, opt.content, colW - lblW - 14);
            lines.forEach((ln, lIdx) => {
              ctx.fillText(ln, colX + lblW, y + lIdx * lineH);
            });
            maxRowH = Math.max(maxRowH, lines.length * lineH);
          }
          y += maxRowH;
        }
      } else {
        for (const opt of item.options) {
          const isHigh = showAnswers && opt.isCorrect;
          const colX = MARGIN_LEFT + 12;
          ctx.font = `bold ${baseFontPx}px "Times New Roman", Times, serif`;
          const lbl = `${opt.label}. `;
          ctx.fillText(lbl, colX, y);
          const lblW = ctx.measureText(lbl).width;

          ctx.font = `${isHigh ? 'bold ' : ''}${baseFontPx}px "Times New Roman", Times, serif`;
          const lines = wrapCanvasLines(ctx, opt.content, CONTENT_W - lblW - 20);
          lines.forEach((ln, lIdx) => {
            ctx.fillText(ln, colX + lblW, y + lIdx * lineH);
          });
          y += lines.length * lineH;
        }
      }
    }

    if (showAnswers && showExplanations && item.explanation) {
      ctx.font = `italic ${baseFontPx - 2}px "Times New Roman", Times, serif`;
      const expLines = wrapCanvasLines(
        ctx,
        `• Đáp án: ${item.correctLabel}. Hướng dẫn giải: ${item.explanation}`,
        CONTENT_W - 16
      );
      ensureSpace(expLines.length * lineH);
      for (const ln of expLines) {
        ctx.fillText(ln, MARGIN_LEFT + 12, y);
        y += lineH;
      }
    }

    y += 12;
  }

  // 5. Kết thúc đề thi
  ensureSpace(lineH * 3);
  y += 12;
  ctx.textAlign = 'center';
  ctx.font = `bold ${baseFontPx}px "Times New Roman", Times, serif`;
  ctx.fillText('--- HẾT ---', PAGE_W / 2, y);
  y += lineH;
  ctx.font = `italic ${baseFontPx - 2}px "Times New Roman", Times, serif`;
  ctx.fillText(
    '(Học sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm)',
    PAGE_W / 2,
    y
  );

  // 6. Vẽ dòng Chân trang & Đánh số trang (Trang X / N) cho toàn bộ các trang A4
  const totalPages = canvases.length;
  canvases.forEach((pageCanvas, idx) => {
    const pCtx = pageCanvas.getContext('2d')!;
    const footerLineY = PAGE_H - MARGIN_BOTTOM - 32;

    pCtx.strokeStyle = '#334155';
    pCtx.lineWidth = 1.2;
    pCtx.beginPath();
    pCtx.moveTo(MARGIN_LEFT, footerLineY);
    pCtx.lineTo(MARGIN_LEFT + CONTENT_W, footerLineY);
    pCtx.stroke();

    pCtx.fillStyle = '#1e293b';
    pCtx.font = `${baseFontPx - 3}px "Times New Roman", Times, serif`;
    pCtx.textAlign = 'left';
    pCtx.fillText(
      `${headerConfig.schoolName || 'TRƯỜNG TH & THCS THỤY LÂM'} • ${
        variantCode === 'GOC' ? 'Đề gốc' : `Mã đề ${variantCode}`
      }`,
      MARGIN_LEFT,
      footerLineY + 8
    );

    pCtx.font = `bold ${baseFontPx - 3}px "Times New Roman", Times, serif`;
    pCtx.textAlign = 'right';
    pCtx.fillText(
      `Trang ${idx + 1} / ${totalPages}`,
      MARGIN_LEFT + CONTENT_W,
      footerLineY + 8
    );
  });

  // Đóng gói tất cả trang canvas sang PDF
  const pdfPages = canvases.map((c) => {
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    return {
      jpegBytes: dataUrlToUint8Array(dataUrl),
      widthPx: PAGE_W,
      heightPx: PAGE_H,
    };
  });

  const pdfBytes = buildPdfBytesFromJpegPages(pdfPages);
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const filename = `De_Kiem_Tra_${examTitle
    .replace(/[^a-zA-Z0-9\u00C0-\u1EF9]+/g, '_')
    .replace(/^_+|_+$/g, '')}_${variantCode === 'GOC' ? 'De_Goc' : `Ma_${variantCode}`}.pdf`;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => window.URL.revokeObjectURL(url), 2000);

  return filename;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Tạo gói dữ liệu nhị phân chuẩn Office Open XML (.docx) cho đề kiểm tra khổ giấy A4:
 * - Đầy đủ tiêu đề 2 cột chuẩn trường THCS, thông tin Họ và tên / Lớp
 * - Tự động giữ câu hỏi không bị ngắt trang (w:keepNext / w:keepLines) và chống rơi 1 từ xuống dòng
 * - Giữ nguyên bảng biểu kẻ khung đối với câu hỏi Đúng/Sai và Ghép đôi
 * - Có chân trang (Footer) tự động đánh số trang "Trang X / Y" chuẩn Microsoft Word
 */
export async function buildExamPaperDocxBytes(opts: A4PrintRenderOptions): Promise<Uint8Array> {
  const {
    durationMinutes,
    headerConfig,
    printableItems,
    variantCode,
    fontSizePt,
    showAnswers,
    showExplanations,
    showScoreBox = false,
  } = opts;

  const halfPt = fontSizePt === '12pt' ? 24 : fontSizePt === '14pt' ? 28 : 26;
  const smallHalfPt = halfPt - 2;
  const durationStr = headerConfig.durationText || `(Thời gian: ${durationMinutes} phút)`;

  const wRun = (
    text: string,
    style?: { bold?: boolean; italic?: boolean; underline?: boolean; sz?: number }
  ) => {
    const rPr = [
      `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>`,
      style?.bold ? `<w:b/>` : '',
      style?.italic ? `<w:i/>` : '',
      style?.underline ? `<w:u w:val="single"/>` : '',
      `<w:sz w:val="${style?.sz || halfPt}"/>`,
      `<w:szCs w:val="${style?.sz || halfPt}"/>`,
    ].join('');
    return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  };

  const wPara = (
    runsXml: string,
    pOpts?: {
      align?: 'left' | 'center' | 'right' | 'both';
      spaceBefore?: number;
      spaceAfter?: number;
      keepNext?: boolean;
      keepLines?: boolean;
      borderBottom?: boolean;
    }
  ) => {
    const pPr = [
      `<w:widowControl/>`,
      pOpts?.keepNext ? `<w:keepNext/>` : '',
      pOpts?.keepLines !== false ? `<w:keepLines/>` : '',
      `<w:spacing w:before="${pOpts?.spaceBefore ?? 0}" w:after="${pOpts?.spaceAfter ?? 60}" w:line="276" w:lineRule="auto"/>`,
      pOpts?.align ? `<w:jc w:val="${pOpts.align}"/>` : '',
      pOpts?.borderBottom
        ? `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="000000"/></w:pBdr>`
        : '',
    ].join('');
    return `<w:p><w:pPr>${pPr}</w:pPr>${runsXml}</w:p>`;
  };

  const borderedTblPr = `
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:insideH w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        <w:insideV w:val="single" w:sz="6" w:space="0" w:color="000000"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="60" w:type="dxa"/>
        <w:left w:w="110" w:type="dxa"/>
        <w:bottom w:w="60" w:type="dxa"/>
        <w:right w:w="110" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
  `;

  const borderlessTblPr = `
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:right w:val="none" w:sz="0" w:color="auto"/>
        <w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="30" w:type="dxa"/>
        <w:left w:w="60" w:type="dxa"/>
        <w:bottom w:w="30" w:type="dxa"/>
        <w:right w:w="60" w:type="dxa"/>
      </w:tblCellMar>
    </w:tblPr>
  `;

  const bodyParts: string[] = [];

  // 1. Bảng tiêu đề 2 cột (44% - 56%)
  const leftHeaderParas = [
    wPara(wRun((headerConfig.schoolName || 'TRƯỜNG TH & THCS THỤY LÂM').toUpperCase(), { bold: true }), {
      align: 'center',
      spaceAfter: 20,
    }),
    wPara(wRun(headerConfig.schoolYear || 'Năm học 2025-2026', { bold: true }), {
      align: 'center',
      spaceAfter: 20,
    }),
    headerConfig.showUnderline !== false
      ? wPara(wRun('____________________', { bold: true, sz: smallHalfPt }), {
          align: 'center',
          spaceAfter: 40,
        })
      : '',
  ].join('');

  const rightHeaderParas = [
    wPara(
      wRun((headerConfig.examHeaderTitle || 'ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I').toUpperCase(), {
        bold: true,
      }),
      { align: 'center', spaceAfter: 20 }
    ),
    wPara(wRun((headerConfig.subjectHeader || 'MÔN: TIN HỌC 7').toUpperCase(), { bold: true }), {
      align: 'center',
      spaceAfter: 20,
    }),
    wPara(wRun(durationStr, { bold: true, italic: true }), {
      align: 'center',
      spaceAfter: 20,
    }),
    variantCode !== 'GOC'
      ? wPara(wRun(`[ Mã đề: ${variantCode} ]`, { bold: true }), {
          align: 'center',
          spaceAfter: 40,
        })
      : '',
  ].join('');

  bodyParts.push(`
    <w:tbl>
      ${borderlessTblPr}
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="2200" w:type="pct"/></w:tcPr>
          ${leftHeaderParas}
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="2800" w:type="pct"/></w:tcPr>
          ${rightHeaderParas}
        </w:tc>
      </w:tr>
    </w:tbl>
  `);

  // 2. Dòng Họ và tên & Lớp
  if (headerConfig.showStudentInfo !== false) {
    const nameValueText = opts.studentFullName
      ? `${opts.studentFullName}                              `
      : '........................................................................   ';
    const classValueText = opts.studentClassName
      ? `${opts.studentClassName}               `
      : '........................................';
    bodyParts.push(
      wPara(
        [
          wRun('Họ và tên: ', { bold: true }),
          wRun(nameValueText, { bold: Boolean(opts.studentFullName) }),
          wRun('Lớp: ', { bold: true }),
          wRun(classValueText, { bold: Boolean(opts.studentClassName) }),
        ].join(''),
        { spaceBefore: 80, spaceAfter: 140 }
      )
    );
  }

  // 3. Khung Điểm & Lời phê (nếu bật)
  if (showScoreBox) {
    bodyParts.push(`
      <w:tbl>
        ${borderedTblPr}
        <w:tr>
          <w:tc>
            <w:tcPr>
              <w:tcW w:w="1400" w:type="pct"/>
              <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
            </w:tcPr>
            ${wPara(wRun('ĐIỂM', { bold: true }), { align: 'center', spaceAfter: 20 })}
          </w:tc>
          <w:tc>
            <w:tcPr>
              <w:tcW w:w="3600" w:type="pct"/>
              <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
            </w:tcPr>
            ${wPara(wRun('LỜI PHÊ CỦA THẦY, CÔ GIÁO', { bold: true }), { align: 'center', spaceAfter: 20 })}
          </w:tc>
        </w:tr>
        <w:tr>
          <w:trPr><w:trHeight w:val="900" w:hRule="atLeast"/></w:trPr>
          <w:tc><w:tcPr><w:tcW w:w="1400" w:type="pct"/></w:tcPr>${wPara('')}</w:tc>
          <w:tc><w:tcPr><w:tcW w:w="3600" w:type="pct"/></w:tcPr>${wPara('')}</w:tc>
        </w:tr>
      </w:tbl>
    `);
    bodyParts.push(wPara('', { spaceAfter: 80 }));
  }

  // 4. Danh sách câu hỏi
  for (const item of printableItems) {
    const typeNote =
      item.questionType === 'true_false'
        ? ' (Trắc nghiệm Đúng/Sai) '
        : item.questionType === 'matching'
          ? ' (Trắc nghiệm Ghép đôi) '
          : ' ';

    const safeStem = preventOrphanWords(item.stem);
    bodyParts.push(
      wPara(
        [
          wRun(`Câu ${item.index}.`, { bold: true }),
          typeNote.trim() ? wRun(typeNote, { italic: true }) : wRun(' '),
          wRun(safeStem, { bold: true }),
        ].join(''),
        { align: 'both', spaceBefore: 80, spaceAfter: 60, keepNext: true }
      )
    );

    if (item.questionType === 'true_false' && item.statements && item.statements.length > 0) {
      // Bảng biểu Đúng/Sai kẻ khung chuẩn
      const rowsXml = item.statements
        .map((st, idx) => {
          const isLastRow = idx === item.statements!.length - 1;
          const safeStmt = preventOrphanWords(st.content);
          const trueMark = showAnswers && st.isTrue ? '✓ Đúng' : '☐';
          const falseMark = showAnswers && !st.isTrue ? '✓ Sai' : '☐';
          return `
            <w:tr>
              <w:trPr><w:cantSplit/></w:trPr>
              <w:tc>
                <w:tcPr><w:tcW w:w="3600" w:type="pct"/></w:tcPr>
                ${wPara([wRun(`${st.label}) `, { bold: true }), wRun(safeStmt)].join(''), {
                  align: 'both',
                  spaceAfter: 20,
                  keepNext: !isLastRow,
                })}
              </w:tc>
              <w:tc>
                <w:tcPr><w:tcW w:w="700" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>
                ${wPara(wRun(trueMark, { bold: true }), {
                  align: 'center',
                  spaceAfter: 20,
                  keepNext: !isLastRow,
                })}
              </w:tc>
              <w:tc>
                <w:tcPr><w:tcW w:w="700" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>
                ${wPara(wRun(falseMark, { bold: true }), {
                  align: 'center',
                  spaceAfter: 20,
                  keepNext: !isLastRow,
                })}
              </w:tc>
            </w:tr>
          `;
        })
        .join('');

      bodyParts.push(`
        <w:tbl>
          ${borderedTblPr}
          <w:tr>
            <w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="3600" w:type="pct"/>
                <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
              </w:tcPr>
              ${wPara(wRun('Phát biểu nhận định', { bold: true }), { spaceAfter: 20, keepNext: true })}
            </w:tc>
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="700" w:type="pct"/>
                <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
              </w:tcPr>
              ${wPara(wRun('Đúng', { bold: true }), { align: 'center', spaceAfter: 20, keepNext: true })}
            </w:tc>
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="700" w:type="pct"/>
                <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
              </w:tcPr>
              ${wPara(wRun('Sai', { bold: true }), { align: 'center', spaceAfter: 20, keepNext: true })}
            </w:tc>
          </w:tr>
          ${rowsXml}
        </w:tbl>
      `);
      bodyParts.push(wPara('', { spaceAfter: 40 }));
    } else if (item.questionType === 'matching' && item.matchingRows && item.matchingRows.length > 0) {
      // Bảng biểu Ghép đôi Cột A - Cột B
      const rowsXml = item.matchingRows
        .map(
          (row) => `
          <w:tr>
            <w:trPr><w:cantSplit/></w:trPr>
            <w:tc>
              <w:tcPr><w:tcW w:w="2350" w:type="pct"/></w:tcPr>
              ${wPara(
                [wRun(`${row.leftLabel}. `, { bold: true }), wRun(preventOrphanWords(row.leftContent))].join(''),
                { spaceAfter: 20, keepNext: true }
              )}
            </w:tc>
            <w:tc>
              <w:tcPr><w:tcW w:w="2650" w:type="pct"/></w:tcPr>
              ${wPara(
                [wRun(`${row.rightLabel}. `, { bold: true }), wRun(preventOrphanWords(row.rightContent))].join(''),
                { spaceAfter: 20, keepNext: true }
              )}
            </w:tc>
          </w:tr>
        `
        )
        .join('');

      bodyParts.push(`
        <w:tbl>
          ${borderedTblPr}
          <w:tr>
            <w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="2350" w:type="pct"/>
                <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
              </w:tcPr>
              ${wPara(wRun('Cột A', { bold: true }), { spaceAfter: 20, keepNext: true })}
            </w:tc>
            <w:tc>
              <w:tcPr>
                <w:tcW w:w="2650" w:type="pct"/>
                <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
              </w:tcPr>
              ${wPara(wRun('Cột B', { bold: true }), { spaceAfter: 20, keepNext: true })}
            </w:tc>
          </w:tr>
          ${rowsXml}
        </w:tbl>
      `);

      const answerRuns = item.matchingRows
        .map((r) =>
          showAnswers ? `${r.leftLabel} nối với ${r.correctRightLabel}` : `${r.leftLabel} nối với .........`
        )
        .join(';    ');
      bodyParts.push(
        wPara([wRun('Trả lời ghép đôi: ', { bold: true }), wRun(answerRuns)].join(''), {
          spaceBefore: 40,
          spaceAfter: 80,
        })
      );
    } else {
      // Dạng 1: Nhiều lựa chọn (chia cột bằng bảng không viền để căn lề chuẩn trong Word)
      const cols = item.recommendedColumns;
      if (cols === 4) {
        const cells = item.options
          .map((opt) => {
            const isHigh = showAnswers && opt.isCorrect;
            return `
              <w:tc>
                <w:tcPr><w:tcW w:w="1250" w:type="pct"/></w:tcPr>
                ${wPara(
                  [
                    wRun(`${opt.label}. `, { bold: true, underline: isHigh }),
                    wRun(preventOrphanWords(opt.content), { bold: isHigh, underline: isHigh }),
                  ].join(''),
                  { spaceAfter: 40 }
                )}
              </w:tc>
            `;
          })
          .join('');
        bodyParts.push(`<w:tbl>${borderlessTblPr}<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>`);
      } else if (cols === 2) {
        const rowsXml: string[] = [];
        for (let r = 0; r < 2; r++) {
          const rowCells: string[] = [];
          for (let c = 0; c < 2; c++) {
            const opt = item.options[r * 2 + c];
            const isHigh = Boolean(opt && showAnswers && opt.isCorrect);
            rowCells.push(`
              <w:tc>
                <w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>
                ${
                  opt
                    ? wPara(
                        [
                          wRun(`${opt.label}. `, { bold: true, underline: isHigh }),
                          wRun(preventOrphanWords(opt.content), { bold: isHigh, underline: isHigh }),
                        ].join(''),
                        { spaceAfter: 40, keepNext: r === 0 }
                      )
                    : wPara('')
                }
              </w:tc>
            `);
          }
          rowsXml.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${rowCells.join('')}</w:tr>`);
        }
        bodyParts.push(`<w:tbl>${borderlessTblPr}${rowsXml.join('')}</w:tbl>`);
      } else {
        item.options.forEach((opt, oIdx) => {
          const isHigh = showAnswers && opt.isCorrect;
          const isLastOpt = oIdx === item.options.length - 1;
          bodyParts.push(
            wPara(
              [
                wRun(`    ${opt.label}. `, { bold: true, underline: isHigh }),
                wRun(preventOrphanWords(opt.content), { bold: isHigh, underline: isHigh }),
              ].join(''),
              { spaceAfter: isLastOpt ? 80 : 30, keepNext: !isLastOpt }
            )
          );
        });
      }
    }

    if (showAnswers && showExplanations && item.explanation) {
      bodyParts.push(
        wPara(
          [
            wRun(`• Đáp án: ${item.correctLabel}. `, { bold: true, italic: true, sz: smallHalfPt }),
            wRun(`Hướng dẫn giải: ${preventOrphanWords(item.explanation)}`, {
              italic: true,
              sz: smallHalfPt,
            }),
          ].join(''),
          { spaceAfter: 80 }
        )
      );
    }
  }

  // 5. Phần kết thúc đề thi
  bodyParts.push(
    wPara(wRun('--- HẾT ---', { bold: true }), {
      align: 'center',
      spaceBefore: 180,
      spaceAfter: 40,
      keepNext: true,
    })
  );
  bodyParts.push(
    wPara(
      wRun('(Học sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm)', {
        italic: true,
        sz: smallHalfPt,
      }),
      { align: 'center', spaceAfter: 160 }
    )
  );

  // 6. Bảng đáp án tổng hợp dành cho giáo viên (nếu bật showAnswers)
  if (showAnswers && printableItems.length > 0) {
    bodyParts.push(
      wPara(
        wRun(
          `BẢNG ĐÁP ÁN CHẤM ĐIỂM (${variantCode === 'GOC' ? 'ĐỀ GỐC' : `MÃ ĐỀ ${variantCode}`})`,
          { bold: true }
        ),
        { align: 'center', spaceBefore: 160, spaceAfter: 80, keepNext: true }
      )
    );
    const ansSummary = printableItems
      .map((item) => `Câu ${item.index}: ${item.correctLabel}`)
      .join('   |   ');
    bodyParts.push(wPara(wRun(ansSummary, { bold: true, sz: smallHalfPt }), { align: 'both' }));
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyParts.join('\n')}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rIdFooter1"/>
      <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>
      <w:pgMar w:top="907" w:right="850" w:bottom="907" w:left="1134" w:header="708" w:footer="567" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const footerLeftLabel = `${headerConfig.schoolName || 'TRƯỜNG TH & THCS THỤY LÂM'} • ${
    variantCode === 'GOC' ? 'Đề gốc' : `Mã đề ${variantCode}`
  }`;

  const footer1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="4" w:color="334155"/>
        <w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>
        <w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="3400" w:type="pct"/></w:tcPr>
        <w:p>
          <w:pPr><w:jc w:val="left"/></w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
              <w:sz w:val="${smallHalfPt}"/>
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(footerLeftLabel)}</w:t>
          </w:r>
        </w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="1600" w:type="pct"/></w:tcPr>
        <w:p>
          <w:pPr><w:jc w:val="right"/></w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
              <w:b/>
              <w:sz w:val="${smallHalfPt}"/>
            </w:rPr>
            <w:t xml:space="preserve">Trang </w:t>
          </w:r>
          <w:fldSimple w:instr="PAGE">
            <w:r>
              <w:rPr><w:b/><w:sz w:val="${smallHalfPt}"/></w:rPr>
              <w:t>1</w:t>
            </w:r>
          </w:fldSimple>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
              <w:b/>
              <w:sz w:val="${smallHalfPt}"/>
            </w:rPr>
            <w:t xml:space="preserve"> / </w:t>
          </w:r>
          <w:fldSimple w:instr="NUMPAGES">
            <w:r>
              <w:rPr><w:b/><w:sz w:val="${smallHalfPt}"/></w:rPr>
              <w:t>1</w:t>
            </w:r>
          </w:fldSimple>
        </w:p>
      </w:tc>
    </w:tr>
  </w:tbl>
</w:ftr>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="${halfPt}"/>
        <w:szCs w:val="${halfPt}"/>
        <w:lang w:val="vi-VN"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:widowControl/>
        <w:spacing w:after="60" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

  const zipBuffer = await createZipBuffer({
    '[Content_Types].xml': contentTypesXml,
    '_rels/.rels': rootRelsXml,
    'word/document.xml': documentXml,
    'word/styles.xml': stylesXml,
    'word/footer1.xml': footer1Xml,
    'word/_rels/document.xml.rels': documentRelsXml,
  });

  return new Uint8Array(zipBuffer);
}

/**
 * Xuất bản và tải trực tiếp đề kiểm tra ra tệp Microsoft Word (.docx) chuẩn khổ giấy A4
 */
export async function exportExamPaperToDocxA4(opts: A4PrintRenderOptions): Promise<string> {
  const docxBytes = await buildExamPaperDocxBytes(opts);
  const blob = new Blob([docxBytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const filename = `De_Kiem_Tra_${opts.examTitle
    .replace(/[^a-zA-Z0-9\u00C0-\u1EF9]+/g, '_')
    .replace(/^_+|_+$/g, '')}_${
    opts.variantCode === 'GOC' ? 'De_Goc' : `Ma_${opts.variantCode}`
  }.docx`;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => window.URL.revokeObjectURL(url), 2000);

  return filename;
}
