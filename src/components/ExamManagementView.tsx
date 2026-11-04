import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  Shuffle,
  Users,
  Eye,
  Trash2,
  X,
  AlertCircle,
  RefreshCw,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Search,
  Edit3,
  Printer,
  FileText,
  FileDown,
} from 'lucide-react';
import { Exam, ExamHeaderConfig, ExamType, Question, QuestionType, Student } from '../types';
import { getQuestionType } from '../utils/grading';
import {
  getTopicsFromQuestions,
  sampleRandomQuestionsFromTopic,
  distributeQuestionsEvenlyAcrossTopics,
} from '../utils/topicSampling';
import {
  buildPrintableExamVariant,
  exportExamPaperToDocxA4,
  getDefaultExamHeaderConfig,
  getDefaultExamHeaderTitleByType,
} from '../utils/examPaperFormatter';
import { ExamPaperPreviewModal } from './ExamPaperPreviewModal';

interface ExamManagementViewProps {
  exams: Exam[];
  questions: Question[];
  students: Student[];
  onSaveExams: (exams: Exam[]) => void;
  onDeleteExam?: (examId: string) => void;
  onActivateExam: (examId: string) => void;
  onPauseExam: (examId: string) => void;
  onFinishExam: (examId: string) => void;
  onNavigateToMonitoring: (examId: string) => void;
  onNavigateToResults: (examId: string) => void;
}

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  '15_phut': 'Kiểm tra thường xuyên 15 phút',
  '45_phut': 'Kiểm tra định kỳ 45 phút',
  giua_ky: 'Kiểm tra giữa học kỳ',
  cuoi_ky: 'Kiểm tra cuối học kỳ',
  tu_chon: 'Đề kiểm tra tự chọn',
};

const COGNITIVE_LEVEL_LABELS: Record<string, { label: string; className: string }> = {
  nhan_biet: { label: 'Nhận biết', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  thong_hieu: { label: 'Thông hiểu', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  van_dung: { label: 'Vận dụng', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  van_dung_cao: { label: 'Vận dụng cao', className: 'bg-purple-100 text-purple-800 border-purple-200' },
};

const QUESTION_TYPE_BADGES: Record<QuestionType, { label: string; className: string }> = {
  multiple_choice: {
    label: 'Nhiều lựa chọn',
    className: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  true_false: {
    label: 'Đúng/Sai (Bộ GD&ĐT)',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  matching: {
    label: 'Ghép đôi (Cột A-B)',
    className: 'bg-purple-50 text-purple-800 border-purple-200',
  },
};

export const ExamManagementView: React.FC<ExamManagementViewProps> = ({
  exams,
  questions,
  students,
  onSaveExams,
  onDeleteExam,
  onActivateExam,
  onPauseExam,
  onFinishExam,
  onNavigateToMonitoring,
  onNavigateToResults,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [previewExamId, setPreviewExamId] = useState<string | null>(null);
  const [previewOpenPrintDialog, setPreviewOpenPrintDialog] = useState<boolean>(false);
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const [examTitle, setExamTitle] = useState('Đề kiểm tra đánh giá giữa học kì I - Tin học 7');
  const [examType, setExamType] = useState<ExamType>('giua_ky');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [selectedClasses, setSelectedClasses] = useState<string[]>(['7A']);
  const [topicSelectedQuestionIds, setTopicSelectedQuestionIds] = useState<string[]>([]);
  const [manualSelectedQuestionIds, setManualSelectedQuestionIds] = useState<string[]>([]);
  const [allowReview, setAllowReview] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);

  // Cấu hình tiêu đề bản in trang A4 (mặc định theo mẫu TRƯỜNG TH & THCS THỤY LÂM)
  const [headerConfig, setHeaderConfig] = useState<ExamHeaderConfig>(() =>
    getDefaultExamHeaderConfig({ type: 'giua_ky', durationMinutes: 45 })
  );

  // Chế độ chọn câu hỏi: 'by_topic' (Lấy ngẫu nhiên theo chủ đề) hoặc 'manual' (Chọn từng câu thủ công)
  const [questionSelectMode, setQuestionSelectMode] = useState<'by_topic' | 'manual'>('by_topic');

  // Số lượng câu hỏi mong muốn cho toàn đề trong Cơ chế tự động
  const [targetTotalQuestions, setTargetTotalQuestions] = useState<number>(10);

  // Trạng thái cấu hình chủ đề
  const [selectedTopicKeys, setSelectedTopicKeys] = useState<string[]>([]);
  const [topicQuotas, setTopicQuotas] = useState<Record<string, number>>({});
  const [topicSampledQuestions, setTopicSampledQuestions] = useState<Record<string, string[]>>({});
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  // Tìm kiếm và lọc cho chế độ thủ công
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [manualTopicFilter, setManualTopicFilter] = useState('all');
  const [manualTypeFilter, setManualTypeFilter] = useState<'all' | QuestionType>('all');

  const availableClasses = Array.from(new Set(students.map((s) => s.className))).sort();
  // Sử dụng toàn bộ câu hỏi hiện có trong ngân hàng để đồng bộ 100% số lượng và bộ lọc với Ngân hàng câu hỏi
  const verifiedQuestions = useMemo(() => questions, [questions]);
  const questionBankIndexMap = useMemo(
    () => new Map(questions.map((q, idx) => [q.id, idx + 1])),
    [questions]
  );
  const questionMap = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions]
  );
  const availableTopics = useMemo(() => getTopicsFromQuestions(verifiedQuestions), [verifiedQuestions]);

  // Danh sách ID câu hỏi đang hiệu lực tùy theo chế độ đang mở ('by_topic' hay 'manual')
  const selectedQuestionIds =
    questionSelectMode === 'manual' ? manualSelectedQuestionIds : topicSelectedQuestionIds;

  // Tự động loại bỏ ngay các câu hỏi đã bị xóa khỏi trạng thái sinh đề
  useEffect(() => {
    const validIdSet = new Set(verifiedQuestions.map((q) => q.id));
    setTopicSelectedQuestionIds((prev) => {
      const filtered = prev.filter((id) => validIdSet.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
    setManualSelectedQuestionIds((prev) => {
      const filtered = prev.filter((id) => validIdSet.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
    setTopicSampledQuestions((prev) => {
      let changed = false;
      const next: Record<string, string[]> = {};
      for (const [theme, ids] of Object.entries(prev)) {
        const filtered = ids.filter((id) => validIdSet.has(id));
        if (filtered.length !== ids.length) changed = true;
        if (filtered.length > 0) {
          next[theme] = filtered;
        }
      }
      return changed ? next : prev;
    });
  }, [verifiedQuestions]);

  // Tổng số câu hỏi tối đa có sẵn trong các chủ đề đang được chọn
  const maxAvailableInSelectedTopics = useMemo(() => {
    const keys = selectedTopicKeys.length > 0 ? selectedTopicKeys : availableTopics.map((t) => t.themeName);
    return availableTopics
      .filter((t) => keys.includes(t.themeName))
      .reduce((sum, t) => sum + t.totalCount, 0);
  }, [availableTopics, selectedTopicKeys]);

  // Tập câu hỏi khớp bộ lọc chủ đề + từ khóa tìm kiếm (trước khi lọc theo dạng câu hỏi) để thống kê đúng số lượng từng dạng
  const manualBaseFilteredQuestions = useMemo(() => {
    return verifiedQuestions.filter((q) => {
      const matchesTopic =
        manualTopicFilter === 'all' ||
        q.themeName === manualTopicFilter ||
        q.themeId === manualTopicFilter;
      const qSearch = manualSearchQuery.trim().toLowerCase();
      const matchesSearch =
        !qSearch ||
        (q.content || '').toLowerCase().includes(qSearch) ||
        (q.lessonName || '').toLowerCase().includes(qSearch) ||
        (q.themeName || '').toLowerCase().includes(qSearch);
      return matchesTopic && matchesSearch;
    });
  }, [verifiedQuestions, manualTopicFilter, manualSearchQuery]);

  // Số lượng câu hỏi theo từng dạng trong bộ lọc hiện tại
  const manualTypeCounts = useMemo(() => {
    const counts: Record<'all' | QuestionType, number> = {
      all: manualBaseFilteredQuestions.length,
      multiple_choice: 0,
      true_false: 0,
      matching: 0,
    };
    for (const q of manualBaseFilteredQuestions) {
      const t = getQuestionType(q);
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [manualBaseFilteredQuestions]);

  // Thống kê số câu hỏi đã chọn trong chế độ thủ công theo từng dạng
  const manualSelectedTypeCounts = useMemo(() => {
    const counts: Record<QuestionType, number> = {
      multiple_choice: 0,
      true_false: 0,
      matching: 0,
    };
    for (const id of manualSelectedQuestionIds) {
      const q = questionMap.get(id);
      if (q) {
        const t = getQuestionType(q);
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return counts;
  }, [manualSelectedQuestionIds, questionMap]);

  const filteredManualQuestions = useMemo(() => {
    if (manualTypeFilter === 'all') return manualBaseFilteredQuestions;
    return manualBaseFilteredQuestions.filter((q) => getQuestionType(q) === manualTypeFilter);
  }, [manualBaseFilteredQuestions, manualTypeFilter]);

  // Cập nhật topicSelectedQuestionIds từ danh sách các câu hỏi đã lấy ngẫu nhiên của các chủ đề đang chọn
  // Tuyệt đối KHÔNG ghi đè lên manualSelectedQuestionIds của chế độ thủ công
  const syncQuestionIdsFromTopics = (
    activeTopicKeys: string[],
    samples: Record<string, string[]>
  ) => {
    const ids: string[] = [];
    for (const key of activeTopicKeys) {
      if (samples[key]) {
        ids.push(...samples[key]);
      }
    }
    setTopicSelectedQuestionIds(ids);
    if (ids.length > 0) {
      setTargetTotalQuestions(ids.length);
    }
  };

  // Mở modal tạo đề mới
  const handleOpenCreateModal = () => {
    setEditingExamId(null);
    setFormError(null);
    setQuestionSelectMode('by_topic');
    setExamTitle('Đề kiểm tra đánh giá giữa học kì I - Tin học 7');
    setExamType('giua_ky');
    setDurationMinutes(45);
    setSelectedClasses(availableClasses.length > 0 ? [availableClasses[0]] : ['7A']);
    setShuffleQuestions(true);
    setShuffleOptions(true);
    setAllowReview(true);
    setHeaderConfig(getDefaultExamHeaderConfig({ type: 'giua_ky', durationMinutes: 45 }));

    // Đặt lại hoàn toàn trạng thái chọn thủ công về 0 câu để khi chuyển sang tab thủ công không bị dính câu hỏi ngẫu nhiên
    setManualSelectedQuestionIds([]);
    setManualSearchQuery('');
    setManualTopicFilter('all');
    setManualTypeFilter('all');

    // Mặc định chọn tất cả các chủ đề khả dụng và phân bổ tự động 10 câu hỏi cho tab "Chọn theo chủ đề"
    const initialSelectedTopics = availableTopics.map((t) => t.themeName);
    const availableCounts: Record<string, number> = {};
    const initialExpanded: Record<string, boolean> = {};
    for (const topic of availableTopics) {
      availableCounts[topic.themeName] = topic.totalCount;
      initialExpanded[topic.themeName] = true;
    }

    const defaultTotal = Math.min(10, verifiedQuestions.length || 10);
    const distribution = distributeQuestionsEvenlyAcrossTopics(
      initialSelectedTopics,
      defaultTotal,
      availableCounts
    );

    const initialQuotas: Record<string, number> = {};
    const initialSamples: Record<string, string[]> = {};
    const activeKeys: string[] = [];

    for (const [key, count] of Object.entries(distribution)) {
      if (count > 0) {
        activeKeys.push(key);
        initialQuotas[key] = count;
        initialSamples[key] = sampleRandomQuestionsFromTopic(verifiedQuestions, key, count);
      }
    }

    setSelectedTopicKeys(activeKeys);
    setTopicQuotas(initialQuotas);
    setTopicSampledQuestions(initialSamples);
    setExpandedTopics(initialExpanded);
    setTargetTotalQuestions(defaultTotal);
    syncQuestionIdsFromTopics(activeKeys, initialSamples);

    setIsCreateModalOpen(true);
  };

  // Mở modal chỉnh sửa đề thi đã tạo
  const handleOpenEditModal = (exam: Exam) => {
    setEditingExamId(exam.id);
    setFormError(null);
    setExamTitle(exam.title);
    setExamType(exam.type);
    setDurationMinutes(exam.durationMinutes);
    const validExamQuestionIds = exam.questionIds.filter((qId) =>
      verifiedQuestions.some((item) => item.id === qId)
    );
    setSelectedClasses([...exam.classes]);
    setTopicSelectedQuestionIds(validExamQuestionIds);
    setManualSelectedQuestionIds(validExamQuestionIds);
    setManualSearchQuery('');
    setManualTopicFilter('all');
    setManualTypeFilter('all');
    setShuffleQuestions(exam.shuffleQuestions);
    setShuffleOptions(exam.shuffleOptions);
    setAllowReview(exam.allowReviewAfterSubmit);
    setHeaderConfig(getDefaultExamHeaderConfig(exam));
    setTargetTotalQuestions(validExamQuestionIds.length || 10);

    // Phân tích các câu hỏi của đề thi theo chủ đề
    const sampledByTopic: Record<string, string[]> = {};
    const quotas: Record<string, number> = {};
    const expanded: Record<string, boolean> = {};

    for (const qId of validExamQuestionIds) {
      const q = verifiedQuestions.find((item) => item.id === qId);
      if (q) {
        const theme = q.themeName || 'Chủ đề khác';
        if (!sampledByTopic[theme]) {
          sampledByTopic[theme] = [];
        }
        sampledByTopic[theme].push(qId);
      }
    }

    const matchedThemes = Object.keys(sampledByTopic);
    for (const theme of matchedThemes) {
      quotas[theme] = sampledByTopic[theme].length;
      expanded[theme] = true;
    }

    setSelectedTopicKeys(matchedThemes);
    setTopicQuotas(quotas);
    setTopicSampledQuestions(sampledByTopic);
    setExpandedTopics(expanded);
    // Mở mặc định ở chế độ chọn thủ công khi sửa đề để giáo viên thấy chính xác từng câu trong đề hiện tại
    setQuestionSelectMode('manual');

    setIsCreateModalOpen(true);
  };

  // Bật/tắt chọn một chủ đề
  const handleToggleTopic = (themeName: string) => {
    const isCurrentlySelected = selectedTopicKeys.includes(themeName);
    let newSelected: string[];
    let newSamples = { ...topicSampledQuestions };
    let newQuotas = { ...topicQuotas };

    if (isCurrentlySelected) {
      newSelected = selectedTopicKeys.filter((t) => t !== themeName);
      delete newSamples[themeName];
    } else {
      newSelected = [...selectedTopicKeys, themeName];
      const topicInfo = availableTopics.find((t) => t.themeName === themeName);
      const count = newQuotas[themeName] || Math.min(2, topicInfo?.totalCount || 1);
      newQuotas[themeName] = count;
      newSamples[themeName] = sampleRandomQuestionsFromTopic(verifiedQuestions, themeName, count);
    }

    setSelectedTopicKeys(newSelected);
    setTopicQuotas(newQuotas);
    setTopicSampledQuestions(newSamples);
    syncQuestionIdsFromTopics(newSelected, newSamples);
  };

  // Thay đổi số lượng câu hỏi lấy từ một chủ đề
  const handleChangeTopicQuota = (themeName: string, newQuota: number) => {
    const topicInfo = availableTopics.find((t) => t.themeName === themeName);
    const maxCount = topicInfo?.totalCount || 1;
    const clampedQuota = Math.max(1, Math.min(maxCount, newQuota));

    const newQuotas = { ...topicQuotas, [themeName]: clampedQuota };
    const newSamples = {
      ...topicSampledQuestions,
      [themeName]: sampleRandomQuestionsFromTopic(verifiedQuestions, themeName, clampedQuota),
    };

    setTopicQuotas(newQuotas);
    setTopicSampledQuestions(newSamples);
    syncQuestionIdsFromTopics(selectedTopicKeys, newSamples);
  };

  // Đổi ngẫu nhiên câu hỏi của một chủ đề cụ thể
  const handleRerollTopic = (themeName: string) => {
    const quota = topicQuotas[themeName] || 2;
    const newSamples = {
      ...topicSampledQuestions,
      [themeName]: sampleRandomQuestionsFromTopic(verifiedQuestions, themeName, quota),
    };
    setTopicSampledQuestions(newSamples);
    syncQuestionIdsFromTopics(selectedTopicKeys, newSamples);
  };

  // Đổi ngẫu nhiên tất cả các chủ đề đã chọn
  const handleRerollAllTopics = () => {
    const newSamples: Record<string, string[]> = {};
    for (const themeName of selectedTopicKeys) {
      const quota = topicQuotas[themeName] || 2;
      newSamples[themeName] = sampleRandomQuestionsFromTopic(verifiedQuestions, themeName, quota);
    }
    setTopicSampledQuestions(newSamples);
    syncQuestionIdsFromTopics(selectedTopicKeys, newSamples);
  };

  // Đổi riêng một câu hỏi đơn lẻ trong chủ đề bằng một câu ngẫu nhiên khác
  const handleSwapSingleQuestion = (themeName: string, oldQuestionId: string) => {
    const currentThemeIds = topicSampledQuestions[themeName] || [];
    const replacement = sampleRandomQuestionsFromTopic(
      verifiedQuestions,
      themeName,
      1,
      currentThemeIds // loại trừ các câu đã lấy trong chủ đề này
    );

    if (replacement.length > 0) {
      const updatedThemeIds = currentThemeIds.map((id) =>
        id === oldQuestionId ? replacement[0] : id
      );
      const newSamples = {
        ...topicSampledQuestions,
        [themeName]: updatedThemeIds,
      };
      setTopicSampledQuestions(newSamples);
      syncQuestionIdsFromTopics(selectedTopicKeys, newSamples);
    } else {
      setFormError('Chủ đề này đã lấy hết toàn bộ câu hỏi khả dụng nên không còn câu thay thế khác.');
    }
  };

  // Áp dụng bộ thiết lập sẵn (Preset theo mỗi chủ đề)
  const handleApplyPreset = (countPerTopic: number) => {
    const allThemeKeys = availableTopics.map((t) => t.themeName);
    const newQuotas: Record<string, number> = {};
    const newSamples: Record<string, string[]> = {};

    for (const topic of availableTopics) {
      const quota = Math.min(countPerTopic, topic.totalCount);
      newQuotas[topic.themeName] = quota;
      newSamples[topic.themeName] = sampleRandomQuestionsFromTopic(
        verifiedQuestions,
        topic.themeName,
        quota
      );
    }

    setSelectedTopicKeys(allThemeKeys);
    setTopicQuotas(newQuotas);
    setTopicSampledQuestions(newSamples);
    syncQuestionIdsFromTopics(allThemeKeys, newSamples);
  };

  // Tự động chia đều tổng số câu hỏi cho đề vào các chủ đề đang chọn
  const handleDistributeTotal = (totalQuestions: number) => {
    const safeTotal = Math.max(1, Math.min(verifiedQuestions.length || 100, totalQuestions));
    setTargetTotalQuestions(safeTotal);

    const targets =
      selectedTopicKeys.length > 0 ? selectedTopicKeys : availableTopics.map((t) => t.themeName);
    const availableCounts: Record<string, number> = {};
    for (const t of availableTopics) {
      availableCounts[t.themeName] = t.totalCount;
    }

    const distribution = distributeQuestionsEvenlyAcrossTopics(targets, safeTotal, availableCounts);
    const newQuotas: Record<string, number> = {};
    const newSamples: Record<string, string[]> = {};
    const activeKeys: string[] = [];

    for (const [key, count] of Object.entries(distribution)) {
      if (count > 0) {
        activeKeys.push(key);
        newQuotas[key] = count;
        newSamples[key] = sampleRandomQuestionsFromTopic(verifiedQuestions, key, count);
      }
    }

    setSelectedTopicKeys(activeKeys);
    setTopicQuotas(newQuotas);
    setTopicSampledQuestions(newSamples);
    syncQuestionIdsFromTopics(activeKeys, newSamples);
  };

  // Lưu cấu hình tiêu đề A4 từ cửa sổ xem trước
  const handleSaveExamHeaderConfig = (examId: string, updatedHeader: ExamHeaderConfig) => {
    const updatedExams = exams.map((e) =>
      e.id === examId
        ? {
            ...e,
            headerConfig: updatedHeader,
            updatedAt: new Date().toISOString(),
          }
        : e
    );
    onSaveExams(updatedExams);
  };

  // Lưu đề thi (Tạo mới hoặc Cập nhật đề thi đã tạo)
  const handleSaveExam = (openPreviewAfterSave: boolean = false) => {
    if (!examTitle.trim()) {
      setFormError('Vui lòng nhập tên bài kiểm tra');
      return;
    }
    if (selectedClasses.length === 0) {
      setFormError('Vui lòng chọn ít nhất một lớp tham gia thi');
      return;
    }
    if (selectedQuestionIds.length === 0) {
      setFormError('Vui lòng chọn ít nhất một câu hỏi cho đề thi');
      return;
    }

    setFormError(null);

    const normalizedHeader: ExamHeaderConfig = {
      ...headerConfig,
      durationText: headerConfig.durationText || `(Thời gian: ${durationMinutes} phút)`,
    };

    if (editingExamId) {
      // Cập nhật đề thi đã tạo
      const updatedExams = exams.map((e) => {
        if (e.id === editingExamId) {
          return {
            ...e,
            title: examTitle.trim(),
            type: examType,
            classes: selectedClasses,
            durationMinutes,
            totalQuestions: selectedQuestionIds.length,
            questionIds: selectedQuestionIds,
            allowReviewAfterSubmit: allowReview,
            shuffleQuestions,
            shuffleOptions,
            headerConfig: normalizedHeader,
            updatedAt: new Date().toISOString(),
          };
        }
        return e;
      });

      onSaveExams(updatedExams);
      setNotification(`Đã lưu thay đổi thành công cho đề thi "${examTitle.trim()}" (${selectedQuestionIds.length} câu hỏi)`);
      setIsCreateModalOpen(false);
      if (openPreviewAfterSave) {
        setPreviewExamId(editingExamId);
      }
    } else {
      // Tạo đề thi mới
      const newExamId = `exam_${Date.now()}`;
      const newExam: Exam = {
        id: newExamId,
        title: examTitle.trim(),
        type: examType,
        classes: selectedClasses,
        durationMinutes,
        totalQuestions: selectedQuestionIds.length,
        maxScore: 10,
        questionIds: selectedQuestionIds,
        status: 'chua_mo',
        allowReviewAfterSubmit: allowReview,
        shuffleQuestions,
        shuffleOptions,
        headerConfig: normalizedHeader,
        createdAt: new Date().toISOString(),
      };

      onSaveExams([newExam, ...exams]);
      setNotification(`Đã tạo thành công đề thi mới "${newExam.title}" (${newExam.totalQuestions} câu hỏi)`);
      setIsCreateModalOpen(false);
      if (openPreviewAfterSave) {
        setPreviewExamId(newExamId);
      }
    }
  };

  const previewingExam = useMemo(
    () => exams.find((e) => e.id === previewExamId) || null,
    [exams, previewExamId]
  );

  return (
    <div className="space-y-6">
      {/* Thông báo thao tác thành công */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-850 text-xs p-3.5 rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold text-emerald-900">{notification}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-emerald-600 hover:text-emerald-800 p-0.5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Tiêu đề & Nút Tạo đề mới */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <span>Quản lý đề thi & Cơ chế xáo trộn mã đề thông minh</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Mỗi học sinh trong phòng máy nhận một mã đề riêng biệt (MD701, MD702...) với thứ tự câu hỏi và phương án được đảo ngẫu nhiên
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo đề kiểm tra mới</span>
        </button>
      </div>

      {/* Thông tin cơ chế đảo đề */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start space-x-3 text-xs text-blue-900">
        <Shuffle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-sm">Cơ chế bảo mật đề thi trong phòng máy 60 học sinh:</p>
          <p>
            • Toàn bộ học sinh cùng làm chung một ngân hàng câu hỏi nhưng thứ tự câu hỏi và thứ tự phương án A, B, C, D của từng câu đều được đảo ngẫu nhiên riêng cho từng máy tính.
          </p>
          <p>
            • Chấm điểm dựa trên mã định danh duy nhất của câu hỏi và đáp án gốc, không phụ thuộc vào vị trí hiển thị trên màn hình.
          </p>
          <p>
            • Hệ thống tự động chụp bản snapshot đề thi tại thời điểm mở thi, bảo đảm kết quả của học sinh không bị ảnh hưởng nếu ngân hàng câu hỏi được chỉnh sửa sau đó.
          </p>
        </div>
      </div>

      {/* Danh sách đề thi */}
      <div className="space-y-4">
        {exams.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">Chưa có đề thi nào được tạo</h3>
            <p className="text-xs text-slate-500 mt-1">
              Bấm nút "Tạo đề kiểm tra mới" ở góc trên để tạo đề kiểm tra 15 phút hoặc 45 phút.
            </p>
          </div>
        ) : (
          exams.map((exam) => {
            const isRunning = exam.status === 'dang_dien_ra';
            const isPaused = exam.status === 'tam_dung';
            const isFinished = exam.status === 'da_ket_thuc';

            return (
              <div
                key={exam.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-blue-950 text-base">{exam.title}</span>
                      <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded font-semibold">
                        {EXAM_TYPE_LABELS[exam.type] || exam.type}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <span>Thời gian: {exam.durationMinutes} phút</span>
                      </span>
                      <span>•</span>
                      <span className="font-bold text-slate-700">
                        Số câu hỏi: {exam.questionIds.length} câu
                      </span>
                      <span>•</span>
                      {(() => {
                        const tc = { multiple_choice: 0, true_false: 0, matching: 0 };
                        exam.questionIds.forEach((id) => {
                          const q = questionMap.get(id);
                          if (q) tc[getQuestionType(q)] += 1;
                        });
                        return (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {tc.multiple_choice > 0 && (
                              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-semibold text-[11px]">
                                Nhiều lựa chọn: {tc.multiple_choice}
                              </span>
                            )}
                            {tc.true_false > 0 && (
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px]">
                                Đúng/Sai: {tc.true_false}
                              </span>
                            )}
                            {tc.matching > 0 && (
                              <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-semibold text-[11px]">
                                Ghép đôi: {tc.matching}
                              </span>
                            )}
                          </span>
                        );
                      })()}
                      <span>•</span>
                      <span>Thang điểm: {exam.maxScore}</span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <Users className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Phân công: Lớp {exam.classes.join(', ')}</span>
                      </span>
                    </div>
                  </div>

                  {/* Trạng thái đề thi */}
                  <div className="flex items-center space-x-2">
                    {isRunning ? (
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs px-3 py-1 rounded-full font-bold flex items-center space-x-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        <span>Đang diễn ra</span>
                      </span>
                    ) : isPaused ? (
                      <span className="bg-amber-100 text-amber-800 text-xs px-3 py-1 rounded-full font-bold">
                        Đang tạm dừng
                      </span>
                    ) : isFinished ? (
                      <span className="bg-slate-100 text-slate-600 text-xs px-3 py-1 rounded-full font-bold">
                        Đã kết thúc
                      </span>
                    ) : (
                      <span className="bg-blue-50 text-blue-700 border border-blue-200 text-xs px-3 py-1 rounded-full font-bold">
                        Chưa mở thi
                      </span>
                    )}
                  </div>
                </div>

                {/* Các nút hành động */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-3 text-slate-600">
                    <span className="flex items-center space-x-1">
                      <Shuffle className="w-3.5 h-3.5 text-blue-500" />
                      <span>
                        Đảo câu: {exam.shuffleQuestions ? 'Bật' : 'Tắt'} • Đảo phương án:{' '}
                        {exam.shuffleOptions ? 'Bật' : 'Tắt'}
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Nút Xem trình bày đề A4 */}
                    <button
                      onClick={() => {
                        setPreviewOpenPrintDialog(false);
                        setPreviewExamId(exam.id);
                      }}
                      data-testid={`btn-preview-a4-${exam.id}`}
                      className="bg-slate-100 hover:bg-indigo-50 text-slate-800 hover:text-indigo-700 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 border border-slate-300 transition-colors"
                      title="Xem đề và chỉnh sửa tiêu đề trên khổ giấy A4"
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Xem đề A4</span>
                    </button>

                    {/* Nút In đề (kết nối máy in hoặc xuất file PDF / DOCX) */}
                    <button
                      onClick={() => {
                        setPreviewOpenPrintDialog(true);
                        setPreviewExamId(exam.id);
                      }}
                      data-testid={`btn-print-exam-${exam.id}`}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-sm transition-colors"
                      title="In đề kiểm tra (Kết nối với máy in hoặc in ra file PDF trên khổ giấy A4)"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>In đề</span>
                    </button>

                    {/* Nút Xuất bản file .docx trực tiếp */}
                    <button
                      onClick={async () => {
                        const hdr = getDefaultExamHeaderConfig(exam);
                        const items = buildPrintableExamVariant(exam, questions, 'GOC', 'auto', '13pt');
                        const fname = await exportExamPaperToDocxA4({
                          examTitle: exam.title,
                          durationMinutes: exam.durationMinutes,
                          headerConfig: hdr,
                          printableItems: items,
                          variantCode: 'GOC',
                          fontSizePt: '13pt',
                          showAnswers: false,
                          showExplanations: false,
                          showScoreBox: false,
                        });
                        setNotification(`Đã xuất bản và tải xuống tệp Word (.docx): ${fname}`);
                      }}
                      data-testid={`btn-export-docx-exam-${exam.id}`}
                      className="bg-slate-100 hover:bg-blue-50 text-slate-800 hover:text-blue-700 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 border border-slate-300 transition-colors"
                      title="Tải đề kiểm tra ra file Microsoft Word (.docx) khổ giấy A4"
                    >
                      <FileDown className="w-3.5 h-3.5 text-blue-600" />
                      <span>Xuất .docx</span>
                    </button>

                    {/* Nút Mở thi */}
                    {!isRunning ? (
                      <button
                        onClick={() => {
                          onActivateExam(exam.id);
                          onNavigateToMonitoring(exam.id);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow-sm transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Mở thi & Giám sát</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onNavigateToMonitoring(exam.id)}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow-sm transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Màn hình giám sát</span>
                        </button>
                        <button
                          onClick={() => onPauseExam(exam.id)}
                          className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 transition-colors"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>Tạm dừng</span>
                        </button>
                        <button
                          onClick={() => onFinishExam(exam.id)}
                          className="bg-slate-700 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Kết thúc kỳ thi</span>
                        </button>
                      </>
                    )}

                    {/* Nút Chỉnh sửa */}
                    <button
                      onClick={() => handleOpenEditModal(exam)}
                      className="bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1 border border-slate-300 transition-colors"
                      title="Chỉnh sửa cấu hình và câu hỏi của đề thi"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Chỉnh sửa</span>
                    </button>

                    {/* Nút Xem bảng điểm */}
                    <button
                      onClick={() => onNavigateToResults(exam.id)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1 border border-slate-300 transition-colors"
                    >
                      <span>Xem điểm</span>
                    </button>

                    {/* Nút Xóa */}
                    {!isRunning && (
                      <button
                        onClick={() => setExamToDelete(exam)}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                        title="Xóa đề thi"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL TẠO ĐỀ THI MỚI / CHỈNH SỬA ĐỀ THI */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center space-x-2">
                {editingExamId ? (
                  <>
                    <Edit3 className="w-5 h-5 text-blue-600" />
                    <span>Chỉnh sửa đề kiểm tra Tin học 7</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                    <span>Tạo đề kiểm tra Tin học 7 mới</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-semibold">{formError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tên bài kiểm tra <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    placeholder="Ví dụ: Đề kiểm tra đánh giá giữa học kì I - Tin học 7"
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Loại bài kiểm tra</label>
                  <select
                    value={examType}
                    onChange={(e) => {
                      const type = e.target.value as ExamType;
                      setExamType(type);
                      const newDuration = type === '15_phut' ? 15 : 45;
                      setDurationMinutes(newDuration);
                      setHeaderConfig((prev) => ({
                        ...prev,
                        examHeaderTitle: getDefaultExamHeaderTitleByType(type),
                        durationText: `(Thời gian: ${newDuration} phút)`,
                      }));
                    }}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="15_phut">Kiểm tra thường xuyên 15 phút</option>
                    <option value="45_phut">Kiểm tra định kỳ 45 phút</option>
                    <option value="giua_ky">Kiểm tra giữa học kỳ</option>
                    <option value="cuoi_ky">Kiểm tra cuối học kỳ</option>
                    <option value="tu_chon">Đề kiểm tra tự chọn</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Thời gian làm bài (phút)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={durationMinutes}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDurationMinutes(val);
                      setHeaderConfig((prev) => ({
                        ...prev,
                        durationText: `(Thời gian: ${val} phút)`,
                      }));
                    }}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Phân công lớp thi:
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {availableClasses.map((cls) => (
                      <label
                        key={cls}
                        className={`px-3 py-1.5 rounded-lg border cursor-pointer font-bold transition-colors ${
                          selectedClasses.includes(cls)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={selectedClasses.includes(cls)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedClasses([...selectedClasses, cls]);
                            } else {
                              setSelectedClasses(selectedClasses.filter((c) => c !== cls));
                            }
                          }}
                        />
                        Lớp {cls}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* KHUNG TIÊU ĐỀ TRÌNH BÀY ĐỀ KIỂM TRA TRÊN TRANG A4 (GIỐNG ẢNH MẪU) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Tiêu đề trình bày đề kiểm tra trên trang A4 (Theo mẫu chuẩn trường THCS):</span>
                  </span>
                  <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-semibold">
                    Hỗ trợ xem & in A4
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tên trường
                    </label>
                    <input
                      type="text"
                      value={headerConfig.schoolName}
                      onChange={(e) =>
                        setHeaderConfig({ ...headerConfig, schoolName: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold uppercase bg-white"
                      placeholder="TRƯỜNG TH & THCS THỤY LÂM"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Năm học
                    </label>
                    <input
                      type="text"
                      value={headerConfig.schoolYear}
                      onChange={(e) =>
                        setHeaderConfig({ ...headerConfig, schoolYear: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                      placeholder="Năm học 2025-2026"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tiêu đề kỳ kiểm tra
                    </label>
                    <input
                      type="text"
                      value={headerConfig.examHeaderTitle}
                      onChange={(e) =>
                        setHeaderConfig({ ...headerConfig, examHeaderTitle: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold uppercase bg-white"
                      placeholder="ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Môn học
                    </label>
                    <input
                      type="text"
                      value={headerConfig.subjectHeader}
                      onChange={(e) =>
                        setHeaderConfig({ ...headerConfig, subjectHeader: e.target.value })
                      }
                      className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold uppercase bg-white"
                      placeholder="MÔN: TIN HỌC 7"
                    />
                  </div>
                </div>

                {/* Xem trước trực tiếp mẫu tiêu đề như hình gửi */}
                <div
                  style={{ fontFamily: '"Times New Roman", Times, Georgia, serif' }}
                  className="bg-white border border-slate-300 rounded-lg px-5 py-3.5 text-black shadow-2xs"
                >
                  <div className="grid grid-cols-12 gap-2 items-start text-[13.5px]">
                    <div className="col-span-5 text-center">
                      <div className="font-bold uppercase">{headerConfig.schoolName}</div>
                      <div className="font-bold">{headerConfig.schoolYear}</div>
                      <div className="w-32 mx-auto border-b-[1.5px] border-[#4472c4] mt-1.5" />
                    </div>
                    <div className="col-span-7 text-center">
                      <div className="font-bold uppercase">{headerConfig.examHeaderTitle}</div>
                      <div className="font-bold uppercase">{headerConfig.subjectHeader}</div>
                      <div className="font-bold italic">
                        {headerConfig.durationText || `(Thời gian: ${durationMinutes} phút)`}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                    className="flex items-center justify-between gap-4 mt-3 text-[12px]"
                  >
                    <div className="flex-1 flex items-baseline">
                      <span className="font-bold mr-1">Họ và tên:</span>
                      <span className="flex-1 border-b border-dotted border-black" />
                    </div>
                    <div className="w-40 flex items-baseline">
                      <span className="font-bold mr-1">Lớp:</span>
                      <span className="flex-1 border-b border-dotted border-black" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tùy chọn bảo mật & Đảo đề */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800">Cấu hình mã đề & Hiển thị kết quả:</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Đảo thứ tự câu hỏi</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shuffleOptions}
                      onChange={(e) => setShuffleOptions(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Đảo phương án A, B, C, D</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowReview}
                      onChange={(e) => setAllowReview(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Xem điểm ngay sau khi nộp</span>
                  </label>
                </div>
              </div>

              {/* LỰA CHỌN CÂU HỎI CHO ĐỀ THI */}
              <div className="space-y-3 pt-2">
                {/* Thanh chuyển chế độ chọn câu hỏi */}
                <div className="flex border-b border-slate-200 gap-2">
                  <button
                    type="button"
                    data-testid="tab-select-mode-by_topic"
                    onClick={() => setQuestionSelectMode('by_topic')}
                    className={`pb-2.5 px-3 font-bold text-xs flex items-center space-x-1.5 border-b-2 transition-all ${
                      questionSelectMode === 'by_topic'
                        ? 'border-blue-600 text-blue-700 bg-blue-50/70 rounded-t-lg'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Chọn theo chủ đề &amp; Lấy ngẫu nhiên ({topicSelectedQuestionIds.length} câu)</span>
                  </button>

                  <button
                    type="button"
                    data-testid="tab-select-mode-manual"
                    onClick={() => setQuestionSelectMode('manual')}
                    className={`pb-2.5 px-3 font-bold text-xs flex items-center space-x-1.5 border-b-2 transition-all ${
                      questionSelectMode === 'manual'
                        ? 'border-blue-600 text-blue-700 bg-blue-50/70 rounded-t-lg'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <ListChecks className="w-4 h-4 text-blue-600" />
                    <span>Chọn từng câu hỏi thủ công ({manualSelectedQuestionIds.length} câu đã chọn)</span>
                  </button>
                </div>

                {/* CHẾ ĐỘ 1: CHỌN THEO CHỦ ĐỀ & LẤY NGẪU NHIÊN CÂU HỎI */}
                {questionSelectMode === 'by_topic' && (
                  <div className="space-y-3">
                    {/* CƠ CHẾ TỰ ĐỘNG: CHỌN SỐ LƯỢNG CÂU HỎI CHO ĐỀ */}
                    <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200 space-y-3">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
                            <Sparkles className="w-4 h-4 text-blue-600" />
                            <span>Cơ chế tự động – Chọn tổng số lượng câu hỏi cho đề:</span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            Nhập hoặc chọn tổng số câu hỏi cần tạo, hệ thống sẽ tự động chia đều và bốc ngẫu nhiên từ các chủ đề đã chọn (Tối đa <strong>{maxAvailableInSelectedTopics}</strong> câu khả dụng).
                          </p>
                        </div>

                        {/* Bộ nhập trực tiếp tổng số lượng câu hỏi của đề */}
                        <div className="flex items-center space-x-2 shrink-0">
                          <div className="flex items-center bg-white border-2 border-blue-400 rounded-lg p-0.5 shadow-2xs">
                            <span className="text-[11px] font-bold text-slate-700 px-2">
                              Số câu của đề:
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleDistributeTotal(Math.max(1, targetTotalQuestions - 1))
                              }
                              className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-blue-100 text-slate-700 font-bold rounded transition-colors"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              data-testid="input-auto-total-questions"
                              min={1}
                              max={Math.max(1, maxAvailableInSelectedTopics)}
                              value={targetTotalQuestions}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val > 0) {
                                  handleDistributeTotal(val);
                                } else {
                                  setTargetTotalQuestions(1);
                                }
                              }}
                              className="w-14 text-center font-black text-sm text-blue-700 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleDistributeTotal(
                                  Math.min(maxAvailableInSelectedTopics || 100, targetTotalQuestions + 1)
                                )
                              }
                              className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-blue-100 text-slate-700 font-bold rounded transition-colors"
                            >
                              +
                            </button>
                            <span className="text-[11px] font-semibold text-slate-500 px-1.5">
                              câu
                            </span>
                          </div>

                          <button
                            type="button"
                            data-testid="btn-apply-auto-total"
                            onClick={() => handleDistributeTotal(targetTotalQuestions)}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg shadow-2xs transition-colors flex items-center space-x-1"
                            title="Tự động phân bổ và lấy lại câu hỏi theo tổng số câu đã chọn"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Lấy tự động {targetTotalQuestions} câu</span>
                          </button>
                        </div>
                      </div>

                      {/* Hàng nút chọn nhanh tổng số câu hỏi cho đề */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200/70">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-600 mr-1">
                            Chọn nhanh quy mô đề:
                          </span>
                          {[5, 10, 15, 20, 25, 30, 40].map((count) => {
                            const isActive = selectedQuestionIds.length === count;
                            return (
                              <button
                                key={count}
                                type="button"
                                data-testid={`btn-preset-total-${count}`}
                                onClick={() => handleDistributeTotal(count)}
                                className={`px-2.5 py-1 font-bold text-[11px] rounded-lg border transition-colors ${
                                  isActive
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                    : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {count} câu
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApplyPreset(2)}
                            className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-700 font-semibold text-[11px] rounded-lg border border-slate-300 transition-colors"
                          >
                            2 câu/chủ đề
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyPreset(3)}
                            className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-700 font-semibold text-[11px] rounded-lg border border-slate-300 transition-colors"
                          >
                            3 câu/chủ đề
                          </button>
                          <button
                            type="button"
                            onClick={handleRerollAllTopics}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] rounded-lg flex items-center space-x-1 shadow-2xs transition-colors"
                            title="Đổi lại toàn bộ câu hỏi ngẫu nhiên trong tất cả các chủ đề"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Đổi ngẫu nhiên tất cả</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Danh sách các chủ đề */}
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {availableTopics.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                          Chưa có câu hỏi nào trong ngân hàng đã được kiểm duyệt. Vui lòng duyệt câu hỏi trước.
                        </div>
                      ) : (
                        availableTopics.map((topic) => {
                          const isSelected = selectedTopicKeys.includes(topic.themeName);
                          const quota = topicQuotas[topic.themeName] || Math.min(2, topic.totalCount);
                          const sampledIds = topicSampledQuestions[topic.themeName] || [];
                          const isExpanded = expandedTopics[topic.themeName] !== false;

                          return (
                            <div
                              key={topic.themeId || topic.themeName}
                              className={`rounded-xl border transition-all ${
                                isSelected
                                  ? 'border-blue-300 bg-blue-50/20 shadow-2xs'
                                  : 'border-slate-200 bg-slate-50/60 opacity-85'
                              }`}
                            >
                              {/* Hàng tiêu đề của chủ đề */}
                              <div className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <label className="flex items-center space-x-2.5 cursor-pointer flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleTopic(topic.themeName)}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                                  />
                                  <div>
                                    <span className="font-bold text-slate-800 text-xs">
                                      {topic.themeName}
                                    </span>
                                    <span className="ml-2 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                      {topic.totalCount} câu có sẵn
                                    </span>
                                  </div>
                                </label>

                                {isSelected && (
                                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                                    {/* Bộ chỉnh số lượng câu hỏi */}
                                    <div className="flex items-center space-x-1 bg-white border border-slate-300 rounded-lg p-0.5">
                                      <span className="text-[11px] text-slate-500 font-medium px-1.5">
                                        Lấy ngẫu nhiên:
                                      </span>
                                      <button
                                        type="button"
                                        disabled={quota <= 1}
                                        onClick={() => handleChangeTopicQuota(topic.themeName, quota - 1)}
                                        className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:hover:bg-transparent font-bold text-xs"
                                      >
                                        -
                                      </button>
                                      <span className="w-7 text-center font-bold text-xs text-blue-700">
                                        {quota}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={quota >= topic.totalCount}
                                        onClick={() => handleChangeTopicQuota(topic.themeName, quota + 1)}
                                        className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:hover:bg-transparent font-bold text-xs"
                                      >
                                        +
                                      </button>
                                      <span className="text-[11px] text-slate-500 pr-1">câu</span>
                                    </div>

                                    {/* Nút đổi ngẫu nhiên câu hỏi của chủ đề này */}
                                    <button
                                      type="button"
                                      onClick={() => handleRerollTopic(topic.themeName)}
                                      className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors"
                                      title="Lấy ngẫu nhiên câu hỏi khác cho chủ đề này"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Nút xem chi tiết các câu đã lấy */}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedTopics({
                                          ...expandedTopics,
                                          [topic.themeName]: !isExpanded,
                                        })
                                      }
                                      className="text-[11px] text-slate-600 hover:text-slate-900 flex items-center space-x-0.5 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 transition-colors"
                                    >
                                      <span>{isExpanded ? 'Thu gọn' : `Xem ${sampledIds.length} câu`}</span>
                                      {isExpanded ? (
                                        <ChevronUp className="w-3 h-3" />
                                      ) : (
                                        <ChevronDown className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Danh sách các câu hỏi cụ thể đã bốc ngẫu nhiên cho chủ đề này */}
                              {isSelected && isExpanded && (
                                <div className="border-t border-blue-200/60 p-2.5 bg-white/70 space-y-2">
                                  {sampledIds.map((qId, idx) => {
                                    const q = verifiedQuestions.find((item) => item.id === qId);
                                    if (!q) return null;
                                    const cogLevel = COGNITIVE_LEVEL_LABELS[q.cognitiveLevel] || {
                                      label: 'Nhận biết',
                                      className: 'bg-slate-100 text-slate-700 border-slate-200',
                                    };
                                    const qTypeBadge = QUESTION_TYPE_BADGES[getQuestionType(q)];

                                    return (
                                      <div
                                        key={q.id}
                                        className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-start justify-between gap-2 shadow-2xs hover:border-blue-300 transition-colors"
                                      >
                                        <div className="space-y-1 flex-1">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="font-bold text-blue-800 text-[11px] bg-blue-100 px-1.5 py-0.5 rounded">
                                              #{questionBankIndexMap.get(q.id) || idx + 1}
                                            </span>
                                            <span
                                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${qTypeBadge.className}`}
                                            >
                                              {qTypeBadge.label}
                                            </span>
                                            <span
                                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cogLevel.className}`}
                                            >
                                              {cogLevel.label}
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-medium">
                                              {q.lessonName}
                                            </span>
                                          </div>
                                          <p className="text-xs text-slate-800 line-clamp-2">
                                            {q.content}
                                          </p>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => handleSwapSingleQuestion(topic.themeName, q.id)}
                                          className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold border border-blue-200 hover:bg-blue-50 px-2 py-1 rounded flex items-center space-x-1 shrink-0 transition-colors"
                                          title="Đổi riêng câu hỏi này bằng câu khác cùng chủ đề"
                                        >
                                          <RefreshCw className="w-2.5 h-2.5" />
                                          <span>Đổi câu này</span>
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* CHẾ ĐỘ 2: CHỌN TỪNG CÂU HỎI THỦ CÔNG */}
                {questionSelectMode === 'manual' && (
                  <div className="space-y-3" data-testid="manual-selection-panel">
                    {/* BỘ LỌC NHANH THEO 3 DẠNG CÂU HỎI TRẮC NGHIỆM */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-800 flex items-center space-x-1.5">
                          <ListChecks className="w-4 h-4 text-blue-600" />
                          <span>Lọc theo dạng câu hỏi trắc nghiệm (Chỉ lấy đúng các câu bạn đánh dấu chọn):</span>
                        </span>
                        <span className="text-[11px] text-slate-600">
                          Đang hiển thị: <strong>{filteredManualQuestions.length}</strong> câu hỏi
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                          type="button"
                          data-testid="manual-filter-type-all"
                          onClick={() => setManualTypeFilter('all')}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            manualTypeFilter === 'all'
                              ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-extrabold text-xs">Tất cả 3 dạng</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                manualTypeFilter === 'all'
                                  ? 'bg-slate-700 text-white'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {manualTypeCounts.all} câu
                            </span>
                          </div>
                          <div
                            className={`text-[10px] mt-1 font-semibold ${
                              manualTypeFilter === 'all' ? 'text-slate-200' : 'text-slate-500'
                            }`}
                          >
                            Đã chọn: {manualSelectedQuestionIds.length} câu
                          </div>
                        </button>

                        <button
                          type="button"
                          data-testid="manual-filter-type-multiple_choice"
                          onClick={() =>
                            setManualTypeFilter((prev) =>
                              prev === 'multiple_choice' ? 'all' : 'multiple_choice'
                            )
                          }
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            manualTypeFilter === 'multiple_choice'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-extrabold text-xs">1. Nhiều lựa chọn</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                manualTypeFilter === 'multiple_choice'
                                  ? 'bg-blue-800 text-white'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {manualTypeCounts.multiple_choice} câu
                            </span>
                          </div>
                          <div
                            className={`text-[10px] mt-1 font-semibold ${
                              manualTypeFilter === 'multiple_choice'
                                ? 'text-blue-100'
                                : 'text-blue-700'
                            }`}
                          >
                            Đã chọn: {manualSelectedTypeCounts.multiple_choice} câu
                          </div>
                        </button>

                        <button
                          type="button"
                          data-testid="manual-filter-type-true_false"
                          onClick={() =>
                            setManualTypeFilter((prev) =>
                              prev === 'true_false' ? 'all' : 'true_false'
                            )
                          }
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            manualTypeFilter === 'true_false'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-extrabold text-xs">2. Đúng/Sai</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                manualTypeFilter === 'true_false'
                                  ? 'bg-emerald-800 text-white'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {manualTypeCounts.true_false} câu
                            </span>
                          </div>
                          <div
                            className={`text-[10px] mt-1 font-semibold ${
                              manualTypeFilter === 'true_false'
                                ? 'text-emerald-100'
                                : 'text-emerald-700'
                            }`}
                          >
                            Đã chọn: {manualSelectedTypeCounts.true_false} câu
                          </div>
                        </button>

                        <button
                          type="button"
                          data-testid="manual-filter-type-matching"
                          onClick={() =>
                            setManualTypeFilter((prev) =>
                              prev === 'matching' ? 'all' : 'matching'
                            )
                          }
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            manualTypeFilter === 'matching'
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-purple-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-extrabold text-xs">3. Ghép đôi</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                manualTypeFilter === 'matching'
                                  ? 'bg-purple-800 text-white'
                                  : 'bg-purple-50 text-purple-800 border border-purple-200'
                              }`}
                            >
                              {manualTypeCounts.matching} câu
                            </span>
                          </div>
                          <div
                            className={`text-[10px] mt-1 font-semibold ${
                              manualTypeFilter === 'matching'
                                ? 'text-purple-100'
                                : 'text-purple-700'
                            }`}
                          >
                            Đã chọn: {manualSelectedTypeCounts.matching} câu
                          </div>
                        </button>
                      </div>

                      {/* Hàng 1: Thanh tìm kiếm, lọc Chủ đề và lọc Dạng câu hỏi */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                        <div className="relative sm:col-span-5">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            value={manualSearchQuery}
                            onChange={(e) => setManualSearchQuery(e.target.value)}
                            placeholder="Tìm kiếm nội dung câu hỏi, bài học..."
                            className="w-full pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <select
                            aria-label="Lọc chủ đề thủ công"
                            value={manualTopicFilter}
                            onChange={(e) => setManualTopicFilter(e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                          >
                            <option value="all">Tất cả chủ đề ({verifiedQuestions.length} câu)</option>
                            {availableTopics.map((t) => (
                              <option key={t.themeId || t.themeName} value={t.themeName}>
                                {t.themeName} ({t.totalCount} câu)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <select
                            aria-label="Lọc dạng câu hỏi thủ công"
                            data-testid="manual-type-filter-select"
                            value={manualTypeFilter}
                            onChange={(e) =>
                              setManualTypeFilter(e.target.value as 'all' | QuestionType)
                            }
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white font-semibold"
                          >
                            <option value="all">
                              Tất cả 3 dạng ({manualTypeCounts.all} câu)
                            </option>
                            <option value="multiple_choice">
                              1. Nhiều lựa chọn ({manualTypeCounts.multiple_choice} câu)
                            </option>
                            <option value="true_false">
                              2. Đúng/Sai ({manualTypeCounts.true_false} câu)
                            </option>
                            <option value="matching">
                              3. Ghép đôi ({manualTypeCounts.matching} câu)
                            </option>
                          </select>
                        </div>
                      </div>

                      {/* Hàng 2: Thống kê câu đã chọn & các nút thao tác nhanh */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-bold text-slate-700">
                            Đề đang chọn:{' '}
                            <strong className="text-blue-700 text-xs">
                              {manualSelectedQuestionIds.length} câu
                            </strong>
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                            Nhiều lựa chọn: {manualSelectedTypeCounts.multiple_choice}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                            Đúng/Sai: {manualSelectedTypeCounts.true_false}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-semibold">
                            Ghép đôi: {manualSelectedTypeCounts.matching}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            data-testid="btn-manual-select-all-visible"
                            onClick={() => {
                              const currentFilteredIds = filteredManualQuestions.map((q) => q.id);
                              const merged = Array.from(
                                new Set([...manualSelectedQuestionIds, ...currentFilteredIds])
                              );
                              setManualSelectedQuestionIds(merged);
                            }}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-colors"
                          >
                            Chọn tất cả đang lọc ({filteredManualQuestions.length})
                          </button>
                          <button
                            type="button"
                            data-testid="btn-manual-deselect-visible"
                            onClick={() => {
                              const currentFilteredIds = new Set(
                                filteredManualQuestions.map((q) => q.id)
                              );
                              setManualSelectedQuestionIds((prev) =>
                                prev.filter((id) => !currentFilteredIds.has(id))
                              );
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-[11px] rounded-lg border border-slate-300 transition-colors"
                          >
                            Bỏ chọn đang lọc
                          </button>
                          {manualSelectedQuestionIds.length > 0 && (
                            <button
                              type="button"
                              data-testid="btn-manual-clear-all"
                              onClick={() => setManualSelectedQuestionIds([])}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] rounded-lg border border-rose-200 transition-colors"
                            >
                              Xóa chọn tất cả ({manualSelectedQuestionIds.length})
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Danh sách câu hỏi thủ công */}
                    <div className="border border-slate-200 rounded-xl p-2.5 max-h-96 overflow-y-auto space-y-2 bg-slate-50/70">
                      {filteredManualQuestions.length === 0 ? (
                        <div className="p-6 text-center text-slate-500 text-xs bg-white rounded-lg border border-dashed border-slate-300">
                          Không tìm thấy câu hỏi nào phù hợp với bộ lọc đang chọn.
                        </div>
                      ) : (
                        filteredManualQuestions.map((q) => {
                          const isSelected = manualSelectedQuestionIds.includes(q.id);
                          const cogLevel = COGNITIVE_LEVEL_LABELS[q.cognitiveLevel] || {
                            label: 'Nhận biết',
                            className: 'bg-slate-100 text-slate-700 border-slate-200',
                          };
                          const qType = getQuestionType(q);
                          const qTypeBadge = QUESTION_TYPE_BADGES[qType];

                          return (
                            <div
                              key={q.id}
                              data-testid={`manual-question-item-${q.id}`}
                              onClick={() => {
                                setManualSelectedQuestionIds((prev) =>
                                  prev.includes(q.id)
                                    ? prev.filter((id) => id !== q.id)
                                    : [...prev, q.id]
                                );
                              }}
                              className={`p-3 rounded-xl border text-xs cursor-pointer flex items-start space-x-3 transition-all ${
                                isSelected
                                  ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-400 text-slate-900 shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-slate-50/60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // xử lý bởi thẻ bọc ngoài
                                className="mt-1 w-4 h-4 text-blue-600 rounded cursor-pointer shrink-0"
                              />
                              <div className="flex-1 space-y-2 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-extrabold text-blue-900 bg-blue-100 px-2 py-0.5 rounded text-[11px]">
                                    #{questionBankIndexMap.get(q.id) || 1}
                                  </span>
                                  <span
                                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${qTypeBadge.className}`}
                                  >
                                    {qTypeBadge.label}
                                  </span>
                                  <span
                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${cogLevel.className}`}
                                  >
                                    {cogLevel.label}
                                  </span>
                                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                    {q.themeName}
                                  </span>
                                  {q.lessonName && (
                                    <span className="text-[10px] text-slate-500">
                                      • {q.lessonName}
                                    </span>
                                  )}
                                </div>

                                <p className="font-bold text-slate-800 leading-snug">{q.content}</p>

                                {/* Xem nhanh nội dung chi tiết từng dạng câu hỏi ngay trong danh sách chọn thủ công */}
                                {qType === 'true_false' &&
                                  q.statements &&
                                  q.statements.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                                      {q.statements.map((st) => (
                                        <div
                                          key={st.id}
                                          className="flex items-start justify-between gap-2 bg-emerald-50/60 border border-emerald-200/80 rounded-lg px-2.5 py-1.5 text-[11px]"
                                        >
                                          <span className="text-slate-700 leading-snug">
                                            <strong className="text-emerald-900">
                                              {st.label})
                                            </strong>{' '}
                                            {st.content}
                                          </span>
                                          <span
                                            className={`px-1.5 py-0.2 rounded font-extrabold text-[10px] shrink-0 ${
                                              st.isTrue
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-rose-600 text-white'
                                            }`}
                                          >
                                            {st.isTrue ? 'Đúng' : 'Sai'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                {qType === 'matching' &&
                                  q.matchingPairs &&
                                  q.matchingPairs.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                                      {q.matchingPairs.map((pair) => (
                                        <div
                                          key={pair.id}
                                          className="flex items-center justify-between gap-2 bg-purple-50/60 border border-purple-200/80 rounded-lg px-2.5 py-1.5 text-[11px]"
                                        >
                                          <span className="text-slate-700 truncate">
                                            <strong className="text-purple-900">
                                              {pair.leftLabel}.
                                            </strong>{' '}
                                            {pair.leftContent}
                                          </span>
                                          <span className="text-purple-700 font-extrabold shrink-0">
                                            ↔ {pair.rightLabel}. {pair.rightContent}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                {qType === 'multiple_choice' &&
                                  q.options &&
                                  q.options.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-0.5">
                                      {q.options.map((opt) => {
                                        const isCorrect = opt.id === q.correctOptionId;
                                        return (
                                          <div
                                            key={opt.id}
                                            className={`px-2 py-1 rounded border text-[11px] flex items-center space-x-1.5 ${
                                              isCorrect
                                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                                : 'bg-slate-50 border-slate-200 text-slate-600'
                                            }`}
                                          >
                                            <span className="font-bold">{opt.label}.</span>
                                            <span className="truncate">{opt.content}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* TỔNG KẾT SỐ LƯỢNG CÂU HỎI & THỜI LƯỢNG */}
                <div
                  data-testid="exam-modal-total-summary"
                  className="bg-blue-50/80 border border-blue-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-blue-950 gap-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      Tổng số câu hỏi trong đề:{' '}
                      <strong
                        data-testid="selected-question-total-count"
                        className="text-blue-700 text-sm font-black"
                      >
                        {selectedQuestionIds.length}
                      </strong>{' '}
                      câu
                    </span>
                    {questionSelectMode === 'by_topic' ? (
                      <span className="text-slate-600">
                        (từ <strong>{selectedTopicKeys.length}</strong> chủ đề đã chọn)
                      </span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-bold">
                          Nhiều lựa chọn: {manualSelectedTypeCounts.multiple_choice}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">
                          Đúng/Sai: {manualSelectedTypeCounts.true_false}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-bold">
                          Ghép đôi: {manualSelectedTypeCounts.matching}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-600">
                    Khuyến nghị thời gian:{' '}
                    <strong>{Math.round(selectedQuestionIds.length * 1.5)} phút</strong> (1 - 1.5 phút/câu)
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                data-testid="btn-save-exam-only"
                onClick={() => handleSaveExam(false)}
                className="px-4 py-2 border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold rounded-lg flex items-center space-x-1.5 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{editingExamId ? 'Lưu đề thi' : 'Tạo đề & Lưu vào danh sách'}</span>
              </button>
              <button
                type="button"
                data-testid="btn-save-and-preview-a4"
                onClick={() => handleSaveExam(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm flex items-center space-x-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>
                  {editingExamId
                    ? 'Lưu & Xem trình bày trang A4'
                    : 'Tạo đề & Xem trình bày trang A4'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM ĐỀ, TRÌNH BÀY TIÊU ĐỀ & IN TRÊN TRANG A4 */}
      {previewingExam && (
        <ExamPaperPreviewModal
          exam={previewingExam}
          questions={questions}
          onClose={() => {
            setPreviewExamId(null);
            setPreviewOpenPrintDialog(false);
          }}
          onSaveExamHeader={handleSaveExamHeaderConfig}
          onOpenEditQuestions={(ex) => handleOpenEditModal(ex)}
          initialOpenPrintDialog={previewOpenPrintDialog}
        />
      )}

      {/* MODAL XÁC NHẬN XÓA ĐỀ THI */}
      {examToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Xác nhận xóa đề thi</h3>
                <p className="text-xs text-slate-500">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-2">
              <p>Bạn có chắc chắn muốn xóa bài kiểm tra sau khỏi hệ thống?</p>
              <p className="font-bold text-sm text-slate-900 bg-white p-2.5 rounded border border-slate-200">
                {examToDelete.title}
              </p>
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <p>• Phân công: Lớp {examToDelete.classes.join(', ')}</p>
                <p>• Số câu hỏi: {examToDelete.totalQuestions} câu ({examToDelete.durationMinutes} phút)</p>
              </div>
              <p className="text-amber-700 font-medium text-[11px] pt-1 border-t border-slate-200">
                ⚠️ Toàn bộ phiên làm bài và bản ghi điểm số liên quan đến đề thi này sẽ được dọn dẹp an toàn.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setExamToDelete(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId = examToDelete.id;
                  const targetTitle = examToDelete.title;
                  if (onDeleteExam) {
                    onDeleteExam(targetId);
                  } else {
                    onSaveExams(exams.filter((e) => e.id !== targetId));
                  }
                  setNotification(`Đã xóa thành công đề thi "${targetTitle}"`);
                  setExamToDelete(null);
                }}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác nhận xóa đề thi</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
