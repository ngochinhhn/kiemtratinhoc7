import { Question, StudentExamPaper } from '../types';
import { getQuestionType } from './grading';

/**
 * Hàm xáo trộn mảng theo thuật toán Fisher-Yates
 */
export function shuffleArray<T>(array: T[], seedNumber?: number): T[] {
  const result = [...array];
  // Sử dụng pseudo-random generator nếu có seed, hoặc Math.random
  let seed = seedNumber !== undefined ? seedNumber : Math.floor(Math.random() * 1000000);
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor((seedNumber !== undefined ? random() : Math.random()) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Tạo mã đề định danh duy nhất (VD: MD701, MD702, MD703...)
 */
export function generatePaperCode(index: number): string {
  const codeNum = 701 + index;
  return `MD${codeNum}`;
}

/**
 * Sinh cấu hình đề thi riêng cho một học sinh:
 * - Cùng tập hợp câu hỏi nhưng đảo thứ tự câu hỏi
 * - Đảo thứ tự các phương án A, B, C, D của từng câu hỏi
 * - Cấp mã đề riêng
 * - Lưu snapshot câu hỏi tại thời điểm tạo đề
 */
export function createStudentExamPaper(
  studentId: string,
  examId: string,
  index: number,
  baseQuestions: Question[],
  shuffleQuestions: boolean = true,
  shuffleOptions: boolean = true
): StudentExamPaper {
  // Sinh hạt giống dựa trên studentId và examId
  let seed = 0;
  const seedString = `${studentId}_${examId}_${index}`;
  for (let i = 0; i < seedString.length; i++) {
    seed += seedString.charCodeAt(i) * (i + 1);
  }

  // Đảo câu hỏi
  const orderedQuestions = shuffleQuestions
    ? shuffleArray(baseQuestions, seed)
    : [...baseQuestions];

  const questionOrder = orderedQuestions.map((q) => q.id);

  // Đảo các phương án cho từng câu hỏi (hoặc các mục Cột B của câu ghép đôi)
  const optionOrders: Record<string, string[]> = {};
  for (let i = 0; i < orderedQuestions.length; i++) {
    const q = orderedQuestions[i];
    const qType = getQuestionType(q);

    if (qType === 'matching' && q.matchingPairs && q.matchingPairs.length > 0) {
      const pairIds = q.matchingPairs.map((p) => p.id);
      optionOrders[q.id] = shuffleOptions
        ? shuffleArray(pairIds, seed + i * 17 + 5)
        : pairIds;
    } else if (qType === 'true_false' && q.statements && q.statements.length > 0) {
      const stmtIds = q.statements.map((s) => s.id);
      optionOrders[q.id] = shuffleOptions
        ? shuffleArray(stmtIds, seed + i * 17 + 5)
        : stmtIds;
    } else {
      const optionIds = (q.options || []).map((opt) => opt.id);
      optionOrders[q.id] = shuffleOptions
        ? shuffleArray(optionIds, seed + i * 17 + 5)
        : optionIds;
    }
  }

  const paperCode = generatePaperCode(index);

  return {
    studentId,
    examId,
    paperCode,
    questionOrder,
    optionOrders,
    questionSnapshots: JSON.parse(JSON.stringify(baseQuestions)),
  };
}

/**
 * Lấy danh sách câu hỏi đã được sắp xếp và gán lại nhãn hiển thị cho học sinh trên giao diện
 * Hỗ trợ đầy đủ 3 dạng: Nhiều lựa chọn (A,B,C,D), Đúng/Sai (a,b,c,d), Ghép đôi (Cột A 1,2,3,4 - Cột B A,B,C,D)
 */
export function getDisplayQuestionsForStudent(paper: StudentExamPaper) {
  const questionMap = new Map<string, Question>();
  paper.questionSnapshots.forEach((q) => questionMap.set(q.id, q));

  return paper.questionOrder.map((qId, qIdx) => {
    const originalQ = questionMap.get(qId);
    if (!originalQ) {
      throw new Error(`Không tìm thấy câu hỏi ID ${qId} trong snapshot đề thi`);
    }

    const qType = getQuestionType(originalQ);

    const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
    const tfLabels: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];

    // 1. Phương án cho câu Nhiều lựa chọn
    const originalOptions = originalQ.options || [];
    const shuffledOptIds =
      qType === 'multiple_choice' && paper.optionOrders[qId]?.length === originalOptions.length
        ? paper.optionOrders[qId]
        : originalOptions.map((o) => o.id);
    const originalOptMap = new Map(originalOptions.map((o) => [o.id, o]));

    const displayOptions = shuffledOptIds
      .map((optId, optIdx) => {
        const origOpt = originalOptMap.get(optId);
        if (!origOpt) return null;
        return {
          id: origOpt.id,
          label: labels[optIdx] || 'A',
          content: origOpt.content,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // 2. Các phát biểu a, b, c, d cho câu Đúng/Sai
    const originalStatements = originalQ.statements || [];
    const stmtMap = new Map(originalStatements.map((s) => [s.id, s]));
    const orderedStmtIds =
      qType === 'true_false' &&
      paper.optionOrders[qId]?.length === originalStatements.length &&
      paper.optionOrders[qId].every((id) => stmtMap.has(id))
        ? paper.optionOrders[qId]
        : originalStatements.map((s) => s.id);

    const displayStatements = orderedStmtIds
      .map((sId, sIdx) => {
        const origStmt = stmtMap.get(sId);
        if (!origStmt) return null;
        return {
          id: origStmt.id,
          label: tfLabels[sIdx] || String.fromCharCode(97 + sIdx),
          content: origStmt.content,
          isTrue: origStmt.isTrue,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // 3. Cột A và Cột B cho câu Ghép đôi (Matching)
    const originalPairs = originalQ.matchingPairs || [];
    const pairMap = new Map(originalPairs.map((p) => [p.id, p]));
    const shuffledRightPairIds =
      qType === 'matching' &&
      paper.optionOrders[qId]?.length === originalPairs.length &&
      paper.optionOrders[qId].every((id) => pairMap.has(id))
        ? paper.optionOrders[qId]
        : originalPairs.map((p) => p.id);

    const matchingLeftItems = originalPairs.map((p, pIdx) => ({
      id: p.id,
      label: p.leftLabel || String(pIdx + 1),
      content: p.leftContent,
    }));

    const matchingRightOptions = shuffledRightPairIds
      .map((pId, rIdx) => {
        const origPair = pairMap.get(pId);
        if (!origPair) return null;
        return {
          id: origPair.id, // ID của cặp đúng gốc để chấm điểm độc lập vị trí
          displayLabel: labels[rIdx] || origPair.rightLabel || String.fromCharCode(65 + rIdx),
          content: origPair.rightContent,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      id: originalQ.id,
      type: qType,
      displayIndex: qIdx + 1,
      content: originalQ.content,
      imageUrl: originalQ.imageUrl,
      imageCaption: originalQ.imageCaption,
      options: displayOptions,
      statements: displayStatements,
      matchingPairs: originalPairs,
      matchingLeftItems,
      matchingRightOptions,
      cognitiveLevel: originalQ.cognitiveLevel,
      themeName: originalQ.themeName,
      lessonName: originalQ.lessonName,
      sourcePage: originalQ.sourcePage,
      correctOptionId: originalQ.correctOptionId,
      explanation: originalQ.explanation,
    };
  });
}
