import { Question } from '../types';

export interface TopicInfo {
  themeId: string;
  themeName: string;
  totalCount: number;
  questionIds: string[];
}

/**
 * Lấy danh sách các chủ đề duy nhất từ danh sách câu hỏi
 */
export function getTopicsFromQuestions(questions: Question[]): TopicInfo[] {
  const map = new Map<string, TopicInfo>();

  for (const q of questions) {
    const key = q.themeName || q.themeId || 'Chủ đề khác';
    const id = q.themeId || key;

    if (!map.has(key)) {
      map.set(key, {
        themeId: id,
        themeName: key,
        totalCount: 0,
        questionIds: [],
      });
    }

    const topic = map.get(key)!;
    topic.totalCount += 1;
    topic.questionIds.push(q.id);
  }

  return Array.from(map.values()).sort((a, b) => a.themeName.localeCompare(b.themeName, 'vi'));
}

/**
 * Lấy ngẫu nhiên k phần tử từ một mảng mà không lặp lại
 */
export function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Lấy ngẫu nhiên số lượng câu hỏi từ một chủ đề cụ thể
 */
export function sampleRandomQuestionsFromTopic(
  questions: Question[],
  themeKey: string,
  count: number,
  excludeIds: string[] = []
): string[] {
  const candidateQuestions = questions.filter(
    (q) => (q.themeName === themeKey || q.themeId === themeKey) && !excludeIds.includes(q.id)
  );

  const shuffled = shuffleArray(candidateQuestions);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((q) => q.id);
}

/**
 * Lấy ngẫu nhiên câu hỏi theo cấu hình phân bổ số lượng từng chủ đề
 * topicQuotas: Record<themeKey, numberOfQuestions>
 */
export function sampleQuestionsByTopicQuotas(
  questions: Question[],
  topicQuotas: Record<string, number>
): { selectedIds: string[]; topicResults: Record<string, string[]> } {
  const topicResults: Record<string, string[]> = {};
  const selectedIds: string[] = [];

  for (const [themeKey, count] of Object.entries(topicQuotas)) {
    if (count <= 0) {
      topicResults[themeKey] = [];
      continue;
    }

    const sampled = sampleRandomQuestionsFromTopic(questions, themeKey, count);
    topicResults[themeKey] = sampled;
    selectedIds.push(...sampled);
  }

  return { selectedIds, topicResults };
}

/**
 * Tự động phân bổ đều tổng số câu hỏi vào các chủ đề được chọn
 */
export function distributeQuestionsEvenlyAcrossTopics(
  selectedThemeKeys: string[],
  totalTargetQuestions: number,
  availablePerTopic: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  if (selectedThemeKeys.length === 0 || totalTargetQuestions <= 0) {
    return result;
  }

  // Khởi tạo mỗi chủ đề 0 câu
  for (const key of selectedThemeKeys) {
    result[key] = 0;
  }

  let remaining = totalTargetQuestions;
  let activeKeys = [...selectedThemeKeys];

  // Phân bổ vòng tròn (round-robin) đến khi đủ số lượng hoặc hết câu khả dụng
  while (remaining > 0 && activeKeys.length > 0) {
    const keysToKeep: string[] = [];
    for (const key of activeKeys) {
      const maxAvailable = availablePerTopic[key] || 0;
      if (result[key] < maxAvailable && remaining > 0) {
        result[key] += 1;
        remaining -= 1;
      }
      if (result[key] < maxAvailable) {
        keysToKeep.push(key);
      }
    }
    activeKeys = keysToKeep;
  }

  return result;
}
