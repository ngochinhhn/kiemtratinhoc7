import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTopicsFromQuestions,
  sampleRandomQuestionsFromTopic,
  sampleQuestionsByTopicQuotas,
  distributeQuestionsEvenlyAcrossTopics,
} from './topicSampling';
import { Question } from '../types';

const mockQuestions: Question[] = [
  {
    id: 'q1',
    themeId: 'chu_de_1',
    themeName: 'Chủ đề 1: Máy tính và cộng đồng',
    lessonId: 'bai_1',
    lessonName: 'Bài 1',
    content: 'Câu hỏi 1',
    options: [],
    correctOptionId: 'opt1',
    cognitiveLevel: 'nhan_biet',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'q2',
    themeId: 'chu_de_1',
    themeName: 'Chủ đề 1: Máy tính và cộng đồng',
    lessonId: 'bai_1',
    lessonName: 'Bài 1',
    content: 'Câu hỏi 2',
    options: [],
    correctOptionId: 'opt1',
    cognitiveLevel: 'thong_hieu',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'q3',
    themeId: 'chu_de_1',
    themeName: 'Chủ đề 1: Máy tính và cộng đồng',
    lessonId: 'bai_2',
    lessonName: 'Bài 2',
    content: 'Câu hỏi 3',
    options: [],
    correctOptionId: 'opt1',
    cognitiveLevel: 'van_dung',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'q4',
    themeId: 'chu_de_2',
    themeName: 'Chủ đề 2: Tổ chức lưu trữ',
    lessonId: 'bai_3',
    lessonName: 'Bài 3',
    content: 'Câu hỏi 4',
    options: [],
    correctOptionId: 'opt1',
    cognitiveLevel: 'nhan_biet',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'q5',
    themeId: 'chu_de_2',
    themeName: 'Chủ đề 2: Tổ chức lưu trữ',
    lessonId: 'bai_3',
    lessonName: 'Bài 3',
    content: 'Câu hỏi 5',
    options: [],
    correctOptionId: 'opt1',
    cognitiveLevel: 'thong_hieu',
    reviewStatus: 'da_kiem_duyet',
    createdAt: '',
    updatedAt: '',
  },
];

describe('topicSampling utilities', () => {
  it('getTopicsFromQuestions should extract and group topics correctly', () => {
    const topics = getTopicsFromQuestions(mockQuestions);
    assert.strictEqual(topics.length, 2);

    const topic1 = topics.find((t) => t.themeId === 'chu_de_1');
    assert.ok(topic1);
    assert.strictEqual(topic1.totalCount, 3);
    assert.deepStrictEqual(topic1.questionIds, ['q1', 'q2', 'q3']);

    const topic2 = topics.find((t) => t.themeId === 'chu_de_2');
    assert.ok(topic2);
    assert.strictEqual(topic2.totalCount, 2);
  });

  it('sampleRandomQuestionsFromTopic should pick exactly requested count without duplicates', () => {
    const sampled = sampleRandomQuestionsFromTopic(
      mockQuestions,
      'Chủ đề 1: Máy tính và cộng đồng',
      2
    );
    assert.strictEqual(sampled.length, 2);
    assert.strictEqual(new Set(sampled).size, 2);
    for (const id of sampled) {
      assert.ok(['q1', 'q2', 'q3'].includes(id));
    }
  });

  it('sampleRandomQuestionsFromTopic should not exceed available questions', () => {
    const sampled = sampleRandomQuestionsFromTopic(
      mockQuestions,
      'Chủ đề 2: Tổ chức lưu trữ',
      10 // requesting 10 when only 2 available
    );
    assert.strictEqual(sampled.length, 2);
    assert.ok(sampled.includes('q4'));
    assert.ok(sampled.includes('q5'));
  });

  it('sampleQuestionsByTopicQuotas should sample across multiple topics according to quotas', () => {
    const quotas = {
      'Chủ đề 1: Máy tính và cộng đồng': 2,
      'Chủ đề 2: Tổ chức lưu trữ': 1,
    };
    const { selectedIds, topicResults } = sampleQuestionsByTopicQuotas(mockQuestions, quotas);

    assert.strictEqual(selectedIds.length, 3);
    assert.strictEqual(topicResults['Chủ đề 1: Máy tính và cộng đồng'].length, 2);
    assert.strictEqual(topicResults['Chủ đề 2: Tổ chức lưu trữ'].length, 1);
  });

  it('distributeQuestionsEvenlyAcrossTopics should divide questions evenly', () => {
    const available = {
      T1: 5,
      T2: 5,
      T3: 5,
    };
    const distribution = distributeQuestionsEvenlyAcrossTopics(['T1', 'T2', 'T3'], 7, available);
    const sum = Object.values(distribution).reduce((acc, v) => acc + v, 0);
    assert.strictEqual(sum, 7);
    // 7 divided by 3 is 3, 2, 2
    assert.strictEqual(distribution['T1'], 3);
    assert.strictEqual(distribution['T2'], 2);
    assert.strictEqual(distribution['T3'], 2);
  });
});
