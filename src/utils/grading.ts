import {
  ExamResultSummary,
  MatchingPair,
  Question,
  QuestionType,
  StudentAnswer,
  StudentExamSession,
  TrueFalseStatement,
} from '../types';

/**
 * Xác định dạng câu hỏi trắc nghiệm (Mặc định là 'multiple_choice' nếu không khai báo)
 */
export function getQuestionType(
  q: Pick<Question, 'type' | 'statements' | 'matchingPairs'> & {
    questionType?: QuestionType;
    content?: string;
    options?: { id: string; label: string; content: string }[];
  }
): QuestionType {
  const explicitType = q.type || q.questionType;

  const hasNonEmptyStatements =
    Array.isArray(q.statements) &&
    q.statements.length > 0 &&
    q.statements.some((s) => Boolean(s && s.content && s.content.trim()));

  const hasNonEmptyMatchingPairs =
    Array.isArray(q.matchingPairs) &&
    q.matchingPairs.length > 0 &&
    q.matchingPairs.some(
      (p) =>
        Boolean(
          p &&
            ((p.leftContent && p.leftContent.trim()) ||
              (p.rightContent && p.rightContent.trim()))
        )
    );

  const hasNonEmptyOptions =
    Array.isArray(q.options) &&
    q.options.length > 0 &&
    q.options.some((o) => Boolean(o && o.content && o.content.trim()));

  if (explicitType === 'true_false') {
    return 'true_false';
  }
  if (explicitType === 'matching') {
    return 'matching';
  }
  if (explicitType === 'multiple_choice') {
    if (!hasNonEmptyOptions && hasNonEmptyStatements) return 'true_false';
    if (!hasNonEmptyOptions && hasNonEmptyMatchingPairs) return 'matching';
    return 'multiple_choice';
  }

  if (hasNonEmptyStatements || (Array.isArray(q.statements) && q.statements.length > 0)) {
    return 'true_false';
  }
  if (hasNonEmptyMatchingPairs || (Array.isArray(q.matchingPairs) && q.matchingPairs.length > 0)) {
    return 'matching';
  }

  const rawContent = q.content || '';
  if (/\(Trắc nghiệm Đúng\s*\/\s*Sai\)/i.test(rawContent)) {
    return 'true_false';
  }
  if (/\(Trắc nghiệm ghép nối\)/i.test(rawContent)) {
    return 'matching';
  }

  return 'multiple_choice';
}

/**
 * Tự động chuẩn hóa cấu trúc câu hỏi Đúng/Sai và Ghép đôi được trích xuất từ PDF
 * (hoặc đã lưu trong ngân hàng từ phiên bản cũ) thành cấu trúc statements / matchingPairs đầy đủ.
 */
export function normalizeQuestionStructure(q: Question): Question {
  if (!q) return q;

  const rawContent = q.content || '';
  const hasValidStatements =
    Array.isArray(q.statements) &&
    q.statements.length > 0 &&
    q.statements.some((s) => Boolean(s && s.content && s.content.trim()));
  const hasValidPairs =
    Array.isArray(q.matchingPairs) &&
    q.matchingPairs.length > 0 &&
    q.matchingPairs.some(
      (p) =>
        Boolean(
          p &&
            ((p.leftContent && p.leftContent.trim()) ||
              (p.rightContent && p.rightContent.trim()))
        )
    );

  // 1. Якщо là câu hỏi có type === 'multiple_choice' nhưng còn vướng mảng statements/matchingPairs rỗng do modal cũ
  if (q.type === 'multiple_choice' && !hasValidStatements && !hasValidPairs) {
    if (q.statements || q.matchingPairs) {
      return {
        ...q,
        statements: undefined,
        matchingPairs: undefined,
      };
    }
    return q;
  }

  // 2. Nâng cấp câu hỏi "(Trắc nghiệm Đúng/Sai)" từ PDF nếu chưa có statements
  if (
    !hasValidStatements &&
    (q.type === 'true_false' || /\(Trắc nghiệm Đúng\s*\/\s*Sai\)/i.test(rawContent))
  ) {
    const lines = rawContent.split(/\r?\n/);
    const stemLines: string[] = [];
    const extractedItems: { label: string; content: string }[] = [];

    for (const line of lines) {
      const m = line.trim().match(/^([a-z])\)\s*(.+)$/i);
      if (m) {
        extractedItems.push({
          label: m[1].toLowerCase(),
          content: m[2].replace(/\s+(Đúng|Sai)$/i, '').trim(),
        });
      } else if (extractedItems.length > 0 && line.trim()) {
        extractedItems[extractedItems.length - 1].content +=
          ' ' + line.trim().replace(/\s+(Đúng|Sai)$/i, '').trim();
      } else if (line.trim()) {
        stemLines.push(line.trim());
      }
    }

    if (extractedItems.length >= 2) {
      const truthMap = new Map<string, boolean>();
      const correctOpt = (q.options || []).find((o) => o.id === q.correctOptionId) || q.options?.[0];
      const answerSource = `${correctOpt?.content || ''} | ${q.explanation || ''}`;

      const clauses = answerSource.split(/[;|]/);
      for (const clause of clauses) {
        const isTrueClause = /:\s*Đúng\b/i.test(clause);
        const isFalseClause = /:\s*Sai\b/i.test(clause);
        if (isTrueClause || isFalseClause) {
          const leftPart = clause.split(':')[0] || '';
          const labels = Array.from(leftPart.matchAll(/\b([a-z])\b/gi)).map((m) =>
            m[1].toLowerCase()
          );
          for (const lbl of labels) {
            truthMap.set(lbl, isTrueClause);
          }
        }
      }

      const statements: TrueFalseStatement[] = extractedItems.map((item, idx) => ({
        id: `${q.id}_stmt_${item.label || idx + 1}`,
        label: item.label,
        content: item.content,
        isTrue: truthMap.has(item.label) ? truthMap.get(item.label)! : idx % 2 === 0,
      }));

      return {
        ...q,
        type: 'true_false',
        content: stemLines.join('\n') || rawContent,
        options: [],
        correctOptionId: '',
        statements,
        matchingPairs: undefined,
      };
    }
  }

  // 3. Nâng cấp câu hỏi "(Trắc nghiệm ghép nối)" từ PDF nếu chưa có matchingPairs
  if (
    !hasValidPairs &&
    (q.type === 'matching' || /\(Trắc nghiệm ghép nối\)/i.test(rawContent))
  ) {
    const lines = rawContent.split(/\r?\n/);
    const stemLines: string[] = [];
    const leftItems: { num: string; text: string }[] = [];
    const rightMap = new Map<string, string>();
    const rightList: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const combinedMatch = trimmed.match(/^(\d+)\)\s*(.+?)\s+([a-z])\)\s*(.+)$/i);
      if (combinedMatch) {
        const num = combinedMatch[1];
        const leftText = combinedMatch[2].trim();
        const rightLetter = combinedMatch[3].toLowerCase();
        const rightText = combinedMatch[4].trim();
        leftItems.push({ num, text: leftText });
        rightMap.set(rightLetter, rightText);
        rightList.push(rightText);
        continue;
      }

      const leftOnlyMatch = trimmed.match(/^(\d+)\)\s*(.+)$/);
      if (leftOnlyMatch) {
        leftItems.push({ num: leftOnlyMatch[1], text: leftOnlyMatch[2].trim() });
        continue;
      }

      const rightOnlyMatch = trimmed.match(/^([a-z])\)\s*(.+)$/i);
      if (rightOnlyMatch && leftItems.length > 0) {
        const rLetter = rightOnlyMatch[1].toLowerCase();
        const rText = rightOnlyMatch[2].trim();
        rightMap.set(rLetter, rText);
        rightList.push(rText);
        continue;
      }

      if (trimmed) {
        stemLines.push(trimmed);
      }
    }

    if (leftItems.length >= 2 && rightList.length >= 2) {
      const correctOpt = (q.options || []).find((o) => o.id === q.correctOptionId) || q.options?.[0];
      const answerSource = `${correctOpt?.content || ''} | ${q.explanation || ''}`;
      const pairKeyMap = new Map<string, string>();
      for (const m of answerSource.matchAll(/(\d+)\s*-\s*([a-z])/gi)) {
        pairKeyMap.set(m[1], m[2].toLowerCase());
      }

      const matchingPairs: MatchingPair[] = leftItems.map((left, idx) => {
        const matchedLetter = pairKeyMap.get(left.num);
        const rightContent =
          (matchedLetter && rightMap.get(matchedLetter)) ||
          rightList[idx] ||
          '';
        return {
          id: `${q.id}_mp_${left.num}`,
          leftLabel: left.num,
          leftContent: left.text,
          rightLabel: String.fromCharCode(65 + idx),
          rightContent,
        };
      });

      return {
        ...q,
        type: 'matching',
        content: stemLines.join('\n') || rawContent,
        options: [],
        correctOptionId: '',
        statements: undefined,
        matchingPairs,
      };
    }
  }

  return q;
}

/**
 * Kiểm tra xem học sinh đã bắt đầu trả lời câu hỏi này chưa
 */
export function isQuestionAnswered(
  q: Pick<Question, 'type' | 'statements' | 'matchingPairs'>,
  ans?: StudentAnswer | null
): boolean {
  if (!ans) return false;
  const qType = getQuestionType(q);
  if (qType === 'true_false') {
    const map = ans.statementAnswers || {};
    return Object.values(map).some((v) => v === true || v === false);
  }
  if (qType === 'matching') {
    const map = ans.matchingAnswers || {};
    return Object.values(map).some((v) => typeof v === 'string' && v.trim().length > 0);
  }
  return Boolean(ans.selectedOptionId);
}

/**
 * Kiểm tra xem học sinh đã hoàn thành toàn bộ các ý của câu hỏi chưa
 */
export function isQuestionFullyAnswered(
  q: Pick<Question, 'type' | 'statements' | 'matchingPairs'>,
  ans?: StudentAnswer | null
): boolean {
  if (!ans) return false;
  const qType = getQuestionType(q);
  if (qType === 'true_false') {
    const stmts = q.statements || [];
    if (stmts.length === 0) return false;
    const map = ans.statementAnswers || {};
    return stmts.every((s) => map[s.id] === true || map[s.id] === false);
  }
  if (qType === 'matching') {
    const pairs = q.matchingPairs || [];
    if (pairs.length === 0) return false;
    const map = ans.matchingAnswers || {};
    return pairs.every((p) => typeof map[p.id] === 'string' && map[p.id].trim().length > 0);
  }
  return Boolean(ans.selectedOptionId);
}

/**
 * Chấm điểm chi tiết cho 1 câu hỏi đơn lẻ thuộc 1 trong 3 dạng:
 * - Nhiều lựa chọn (multiple_choice): Đúng 100% (1.0) hoặc Sai (0.0)
 * - Đúng/Sai (true_false): Theo quy tắc Bộ GD&ĐT cho câu 4 ý:
 *   + Đúng 1 ý: 10% (0.1) điểm câu
 *   + Đúng 2 ý: 25% (0.25) điểm câu
 *   + Đúng 3 ý: 50% (0.5) điểm câu
 *   + Đúng cả 4 ý: 100% (1.0) điểm câu
 * - Ghép đôi (matching): Điểm tính theo tỷ lệ số cặp nối đúng trên tổng số cặp (vd: nối đúng 3/4 cặp = 0.75)
 */
export function gradeSingleQuestion(
  q: Question,
  studentAns?: StudentAnswer | null
): {
  questionId: string;
  questionType: QuestionType;
  selectedOptionId: string | null;
  correctOptionId: string;
  isAnswered: boolean;
  isCorrect: boolean;
  earnedRatio: number;
  subCorrectCount: number;
  subTotalCount: number;
} {
  const qType = getQuestionType(q);
  const answered = isQuestionAnswered(q, studentAns);

  if (qType === 'true_false') {
    const stmts = q.statements || [];
    const total = stmts.length;
    if (total === 0 || !answered) {
      return {
        questionId: q.id,
        questionType: 'true_false',
        selectedOptionId: null,
        correctOptionId: q.correctOptionId || '',
        isAnswered: false,
        isCorrect: false,
        earnedRatio: 0,
        subCorrectCount: 0,
        subTotalCount: total,
      };
    }

    const ansMap = studentAns?.statementAnswers || {};
    let subCorrect = 0;
    for (const s of stmts) {
      if (ansMap[s.id] === s.isTrue) {
        subCorrect++;
      }
    }

    let earnedRatio = 0;
    if (total === 4) {
      const boGddtScale: Record<number, number> = {
        0: 0,
        1: 0.1,
        2: 0.25,
        3: 0.5,
        4: 1.0,
      };
      earnedRatio = boGddtScale[subCorrect] ?? subCorrect / total;
    } else {
      earnedRatio = subCorrect / total;
    }

    return {
      questionId: q.id,
      questionType: 'true_false',
      selectedOptionId: null,
      correctOptionId: q.correctOptionId || '',
      isAnswered: true,
      isCorrect: subCorrect === total,
      earnedRatio,
      subCorrectCount: subCorrect,
      subTotalCount: total,
    };
  }

  if (qType === 'matching') {
    const pairs = q.matchingPairs || [];
    const total = pairs.length;
    if (total === 0 || !answered) {
      return {
        questionId: q.id,
        questionType: 'matching',
        selectedOptionId: null,
        correctOptionId: q.correctOptionId || '',
        isAnswered: false,
        isCorrect: false,
        earnedRatio: 0,
        subCorrectCount: 0,
        subTotalCount: total,
      };
    }

    const ansMap = studentAns?.matchingAnswers || {};
    let subCorrect = 0;
    for (const p of pairs) {
      const chosen = ansMap[p.id];
      if (chosen && (chosen === p.id || chosen === p.rightLabel)) {
        subCorrect++;
      }
    }

    const earnedRatio = subCorrect / total;
    return {
      questionId: q.id,
      questionType: 'matching',
      selectedOptionId: null,
      correctOptionId: q.correctOptionId || '',
      isAnswered: true,
      isCorrect: subCorrect === total,
      earnedRatio,
      subCorrectCount: subCorrect,
      subTotalCount: total,
    };
  }

  // Mặc định: Nhiều lựa chọn (multiple_choice)
  const selectedOptionId = studentAns ? studentAns.selectedOptionId : null;
  if (!selectedOptionId) {
    return {
      questionId: q.id,
      questionType: 'multiple_choice',
      selectedOptionId: null,
      correctOptionId: q.correctOptionId,
      isAnswered: false,
      isCorrect: false,
      earnedRatio: 0,
      subCorrectCount: 0,
      subTotalCount: 1,
    };
  }

  const isCorrect = selectedOptionId === q.correctOptionId;
  return {
    questionId: q.id,
    questionType: 'multiple_choice',
    selectedOptionId,
    correctOptionId: q.correctOptionId,
    isAnswered: true,
    isCorrect,
    earnedRatio: isCorrect ? 1 : 0,
    subCorrectCount: isCorrect ? 1 : 0,
    subTotalCount: 1,
  };
}

/**
 * Chấm điểm bài thi của học sinh
 * Hỗ trợ cả 3 dạng câu hỏi: Nhiều lựa chọn (A,B,C,D), Đúng/Sai (a,b,c,d), Ghép đôi (Cột A - Cột B)
 */
export function gradeStudentExam(
  answers: Record<string, StudentAnswer>,
  questionSnapshots: Question[],
  maxScore: number = 10
): {
  score: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  details: {
    questionId: string;
    questionType?: QuestionType;
    selectedOptionId: string | null;
    correctOptionId: string;
    isCorrect: boolean;
    earnedRatio?: number;
    subCorrectCount?: number;
    subTotalCount?: number;
  }[];
} {
  const totalQuestions = questionSnapshots.length;
  if (totalQuestions === 0) {
    return {
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      details: [],
    };
  }

  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let totalEarnedRatio = 0;
  const details = [];

  for (const q of questionSnapshots) {
    const studentAns = answers[q.id];
    const single = gradeSingleQuestion(q, studentAns);

    if (!single.isAnswered) {
      unansweredCount++;
    } else if (single.isCorrect) {
      correctCount++;
    } else {
      wrongCount++;
    }

    totalEarnedRatio += single.earnedRatio;
    details.push({
      questionId: q.id,
      questionType: single.questionType,
      selectedOptionId: single.selectedOptionId,
      correctOptionId: single.correctOptionId,
      isCorrect: single.isCorrect,
      earnedRatio: single.earnedRatio,
      subCorrectCount: single.subCorrectCount,
      subTotalCount: single.subTotalCount,
    });
  }

  // Điểm số thang 10, làm tròn 2 chữ số thập phân
  const rawScore = (totalEarnedRatio / totalQuestions) * maxScore;
  const score = Math.round(rawScore * 100) / 100;

  return {
    score,
    correctCount,
    wrongCount,
    unansweredCount,
    details,
  };
}

/**
 * Tính toán thống kê toàn diện cho cả lớp và kỳ thi
 */
export function calculateExamResultSummary(
  examId: string,
  examTitle: string,
  className: string,
  sessions: StudentExamSession[],
  questionSnapshots: Question[]
): ExamResultSummary {
  const submittedSessions = sessions.filter(
    (s) => s.status === 'da_nop_bai' && s.score !== undefined
  );
  const totalStudents = sessions.length;
  const submittedCount = submittedSessions.length;

  if (submittedCount === 0) {
    return {
      examId,
      examTitle,
      className,
      totalStudents,
      submittedCount: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      excellentCount: 0,
      goodCount: 0,
      averageCount: 0,
      weakCount: 0,
      questionStats: questionSnapshots.map((q, idx) => ({
        questionId: q.id,
        questionIndex: idx + 1,
        questionContent: q.content,
        correctPercent: 0,
        totalAttempts: 0,
      })),
    };
  }

  const scores = submittedSessions.map((s) => s.score || 0);
  const totalScore = scores.reduce((sum, s) => sum + s, 0);
  const averageScore = Math.round((totalScore / submittedCount) * 100) / 100;
  const highestScore = Math.max(...scores);
  const lowestScore = Math.min(...scores);

  // Phân loại học lực
  let excellentCount = 0; // >= 8.0
  let goodCount = 0; // 6.5 - 7.9
  let averageCount = 0; // 5.0 - 6.4
  let weakCount = 0; // < 5.0

  for (const s of scores) {
    if (s >= 8.0) excellentCount++;
    else if (s >= 6.5) goodCount++;
    else if (s >= 5.0) averageCount++;
    else weakCount++;
  }

  // Thống kê độ khó và tỷ lệ đúng từng câu hỏi
  const questionStats = questionSnapshots.map((q, idx) => {
    let earnedRatioSum = 0;
    let attempts = 0;

    for (const session of submittedSessions) {
      const ans = session.answers[q.id];
      const gradedQ = gradeSingleQuestion(q, ans);
      if (gradedQ.isAnswered) {
        attempts++;
        earnedRatioSum += gradedQ.earnedRatio;
      }
    }

    const correctPercent =
      submittedCount > 0 ? Math.round((earnedRatioSum / submittedCount) * 100) : 0;

    return {
      questionId: q.id,
      questionIndex: idx + 1,
      questionContent: q.content,
      correctPercent,
      totalAttempts: attempts,
    };
  });

  return {
    examId,
    examTitle,
    className,
    totalStudents,
    submittedCount,
    averageScore,
    highestScore,
    lowestScore,
    excellentCount,
    goodCount,
    averageCount,
    weakCount,
    questionStats,
  };
}
