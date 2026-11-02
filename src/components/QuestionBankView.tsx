import React, { useState, useRef, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  FileUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Edit,
  X,
  FileText,
  HelpCircle,
  Upload,
  Loader2,
  Sparkles,
  FileCheck,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import {
  CognitiveLevel,
  MatchingPair,
  Question,
  QuestionType,
  ReviewStatus,
  TrueFalseStatement,
} from '../types';
import { getQuestionType } from '../utils/grading';
import {
  extractTextFromPdfFile,
  extractTextFromPdfUrl,
  parseRawQuestionsFromText,
  ATTACHED_PDF_ASSET_URL,
  ATTACHED_PDF_FILE_NAME,
  SAMPLE_PDF_TEXT_TIN7,
  TEXTBOOK_FIGURE_MAP,
} from '../utils/pdfParser';

interface QuestionBankViewProps {
  questions: Question[];
  onSaveQuestions: (questions: Question[]) => void;
}

const DEFAULT_CURRICULUM_THEMES = [
  'Chủ đề 1: Máy tính và cộng đồng',
  'Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin',
  'Chủ đề 3: Đạo đức, pháp luật và văn hoá trong môi trường số',
  'Chủ đề 4: Ứng dụng tin học',
  'Chủ đề 5: Giải quyết vấn đề với sự trợ giúp của máy tính',
];

const COGNITIVE_LEVELS: { key: string; label: string; color: string }[] = [
  { key: 'all', label: 'Tất cả mức độ', color: 'bg-slate-100 text-slate-700' },
  {
    key: 'nhan_biet',
    label: 'Nhận biết',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    key: 'thong_hieu',
    label: 'Thông hiểu',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    key: 'van_dung',
    label: 'Vận dụng',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    key: 'van_dung_cao',
    label: 'Vận dụng cao',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
  },
];

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  questions,
  onSaveQuestions,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('Tất cả chủ đề');
  const [selectedLesson, setSelectedLesson] = useState('Tất cả bài học');
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedQuestionType, setSelectedQuestionType] = useState<'all' | QuestionType>('all');

  // Thông báo nội bộ thay cho window.alert
  const [notification, setNotification] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
  const [selectedIdsForBulk, setSelectedIdsForBulk] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Modal thêm/sửa câu hỏi
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal nhập PDF
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfImportMode, setPdfImportMode] = useState<'upload_file' | 'raw_text'>('upload_file');
  const [uploadedPdfFileName, setUploadedPdfFileName] = useState<string | null>(null);
  const [uploadedPdfFileSize, setUploadedPdfFileSize] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [pdfProgressText, setPdfProgressText] = useState('');
  const [rawPdfText, setRawPdfText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<Question[]>([]);
  const [previewSelectedTheme, setPreviewSelectedTheme] = useState<string>('all');
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewImageTargetId, setPreviewImageTargetId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewImageInputRef = useRef<HTMLInputElement>(null);
  const editQuestionImageInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setErrorMessage(null);
    setTimeout(() => {
      setNotification((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  // Danh sách Chủ đề động dựa trên câu hỏi hiện có + khung chương trình chuẩn
  const availableThemes = useMemo(() => {
    const set = new Set<string>(DEFAULT_CURRICULUM_THEMES);
    questions.forEach((q) => {
      if (q.themeName) set.add(q.themeName);
    });
    return ['Tất cả chủ đề', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'))];
  }, [questions]);

  // Thống kê số lượng câu hỏi theo từng Chủ đề trong ngân hàng
  const themeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach((q) => {
      counts[q.themeName] = (counts[q.themeName] || 0) + 1;
    });
    return counts;
  }, [questions]);

  // Danh sách Bài học thuộc Chủ đề đang chọn
  const availableLessons = useMemo(() => {
    const set = new Set<string>();
    questions.forEach((q) => {
      if (selectedTheme === 'Tất cả chủ đề' || q.themeName === selectedTheme) {
        if (q.lessonName) set.add(q.lessonName);
      }
    });
    return ['Tất cả bài học', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'))];
  }, [questions, selectedTheme]);

  // Thống kê số lượng câu hỏi theo 3 dạng câu hỏi trắc nghiệm cơ bản
  const questionTypeCounts = useMemo(() => {
    const counts: Record<QuestionType, number> = {
      multiple_choice: 0,
      true_false: 0,
      matching: 0,
    };
    questions.forEach((q) => {
      const qType = getQuestionType(q);
      counts[qType] = (counts[qType] || 0) + 1;
    });
    return counts;
  }, [questions]);

  // Bản đồ vị trí thực của câu hỏi trong ngân hàng (#1, #2...)
  const questionBankIndexMap = useMemo(
    () => new Map(questions.map((q, idx) => [q.id, idx + 1])),
    [questions]
  );

  // Lọc danh sách câu hỏi
  const filteredQuestions = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return questions.filter((q) => {
      const qType = getQuestionType(q);
      const matchType = selectedQuestionType === 'all' || qType === selectedQuestionType;
      const matchSearch =
        !lowerSearch ||
        q.content.toLowerCase().includes(lowerSearch) ||
        (q.lessonName && q.lessonName.toLowerCase().includes(lowerSearch)) ||
        (q.options || []).some((o) => o.content.toLowerCase().includes(lowerSearch)) ||
        (q.statements || []).some((s) => s.content.toLowerCase().includes(lowerSearch)) ||
        (q.matchingPairs || []).some(
          (p) =>
            p.leftContent.toLowerCase().includes(lowerSearch) ||
            p.rightContent.toLowerCase().includes(lowerSearch)
        );
      const matchTheme =
        selectedTheme === 'Tất cả chủ đề' ||
        q.themeName === selectedTheme ||
        q.themeName.startsWith(selectedTheme.split(':')[0] + ':');
      const matchLesson =
        selectedLesson === 'Tất cả bài học' || q.lessonName === selectedLesson;
      const matchLevel = selectedLevel === 'all' || q.cognitiveLevel === selectedLevel;
      const matchStatus = selectedStatus === 'all' || q.reviewStatus === selectedStatus;
      return matchType && matchSearch && matchTheme && matchLesson && matchLevel && matchStatus;
    });
  }, [
    questions,
    searchTerm,
    selectedTheme,
    selectedLesson,
    selectedLevel,
    selectedStatus,
    selectedQuestionType,
  ]);

  // Thống kê theo Chủ đề của danh sách câu hỏi vừa bóc tách trong Modal PDF
  const previewThemeBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; imageCount: number; lessons: Set<string> }>();
    parsedPreview.forEach((q) => {
      const current = map.get(q.themeName) || {
        count: 0,
        imageCount: 0,
        lessons: new Set<string>(),
      };
      current.count += 1;
      if (q.imageUrl) current.imageCount += 1;
      if (q.lessonName) current.lessons.add(q.lessonName);
      map.set(q.themeName, current);
    });
    return Array.from(map.entries()).map(([themeName, info]) => ({
      themeName,
      count: info.count,
      imageCount: info.imageCount,
      lessons: Array.from(info.lessons),
    }));
  }, [parsedPreview]);

  const totalPreviewImages = useMemo(
    () => parsedPreview.filter((q) => Boolean(q.imageUrl)).length,
    [parsedPreview]
  );

  // Danh sách câu hỏi hiển thị trong khung xem trước PDF (lọc theo Chủ đề nếu chọn)
  const visiblePreviewQuestions = useMemo(() => {
    if (previewSelectedTheme === 'all') return parsedPreview;
    return parsedPreview.filter((q) => q.themeName === previewSelectedTheme);
  }, [parsedPreview, previewSelectedTheme]);

  // Xác nhận xóa câu hỏi
  const confirmDeleteQuestion = () => {
    if (!questionToDelete) return;
    const targetId = questionToDelete.id;
    const updated = questions.filter((q) => q.id !== targetId);
    onSaveQuestions(updated);
    setSelectedIdsForBulk((prev) => prev.filter((id) => id !== targetId));
    setQuestionToDelete(null);
    showToast('Đã xóa câu hỏi khỏi ngân hàng và cập nhật đồng bộ phần sinh đề.');
  };

  // Xác nhận xóa hàng loạt các câu hỏi đã chọn
  const confirmBulkDeleteQuestions = () => {
    if (selectedIdsForBulk.length === 0) return;
    const removeSet = new Set(selectedIdsForBulk);
    const count = removeSet.size;
    const updated = questions.filter((q) => !removeSet.has(q.id));
    onSaveQuestions(updated);
    setSelectedIdsForBulk([]);
    setIsBulkDeleteModalOpen(false);
    showToast(`Đã xóa vĩnh viễn ${count} câu hỏi đã chọn khỏi ngân hàng và phần sinh đề.`);
  };

  // Duyệt nhanh câu hỏi
  const handleQuickApprove = (q: Question) => {
    const updated = questions.map((item) =>
      item.id === q.id
        ? {
            ...item,
            reviewStatus: 'da_kiem_duyet' as ReviewStatus,
            updatedAt: new Date().toISOString(),
          }
        : item
    );
    onSaveQuestions(updated);
    showToast('Đã duyệt câu hỏi sẵn sàng cho kỳ thi.');
  };

  // Đọc tệp ảnh (.png/.jpg/.svg/.webp) thành Data URL để gắn vào câu hỏi
  const readImageFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không thể đọc tệp hình ảnh'));
      reader.readAsDataURL(file);
    });
  };

  // Xử lý gắn hình ảnh cho câu hỏi trong danh sách xem trước PDF
  const handlePreviewQuestionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !previewImageTargetId) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      const targetId = previewImageTargetId;
      setParsedPreview((prev) =>
        prev.map((q) =>
          q.id === targetId
            ? {
                ...q,
                imageUrl: dataUrl,
                imageCaption: q.imageCaption || file.name.replace(/\.[^.]+$/, ''),
              }
            : q
        )
      );
    } catch {
      setErrorMessage('Không thể đọc tệp hình ảnh đã chọn.');
    } finally {
      setPreviewImageTargetId(null);
      if (previewImageInputRef.current) {
        previewImageInputRef.current.value = '';
      }
    }
  };

  // Xử lý gắn hình ảnh cho câu hỏi trong Modal Thêm/Sửa câu hỏi
  const handleEditQuestionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingQuestion) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setEditingQuestion({
        ...editingQuestion,
        imageUrl: dataUrl,
        imageCaption: editingQuestion.imageCaption || file.name.replace(/\.[^.]+$/, ''),
      });
    } catch {
      setModalError('Không thể đọc tệp hình ảnh đã chọn.');
    } finally {
      if (editQuestionImageInputRef.current) {
        editQuestionImageInputRef.current.value = '';
      }
    }
  };

  // Xử lý khi tải file PDF từ máy tính lên
  const handleProcessPdfFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Vui lòng chọn tệp định dạng PDF (.pdf)!');
      return;
    }

    try {
      setErrorMessage(null);
      setIsExtractingPdf(true);
      setUploadedPdfFileName(file.name);
      setUploadedPdfFileSize(`${(file.size / 1024).toFixed(0)} KB`);
      setPdfProgressText('Đang nạp tệp PDF...');

      const { text, numPages } = await extractTextFromPdfFile(file, (curr, total) => {
        setPdfProgressText(`Đang đọc văn bản & hình ảnh: Trang ${curr} / ${total}...`);
      });

      setPdfPageCount(numPages);
      setRawPdfText(text);

      const parsed = parseRawQuestionsFromText(text, file.name, 1);
      setParsedPreview(parsed);
      setPreviewSelectedTheme('all');
      setIsExtractingPdf(false);
      setPdfProgressText('');
    } catch (err: any) {
      console.error('Lỗi khi đọc file PDF:', err);
      setIsExtractingPdf(false);
      setPdfProgressText('');
      setErrorMessage(
        'Không thể trích xuất văn bản từ tệp PDF này. Nếu là tài liệu scan dạng hình ảnh, vui lòng sử dụng tab "Dán văn bản / OCR".'
      );
    }
  };

  // Nạp và phân tích trực tiếp tệp PDF đính kèm (Cau_hoi_chu_de_1-3.pdf)
  const handleLoadAttachedPdf = async () => {
    try {
      setErrorMessage(null);
      setIsPdfModalOpen(true);
      setPdfImportMode('upload_file');
      setIsExtractingPdf(true);
      setUploadedPdfFileName(ATTACHED_PDF_FILE_NAME);
      setPdfProgressText('Đang đọc tệp đính kèm Cau_hoi_chu_de_1-3.pdf...');

      const { text, numPages, fileSizeBytes } = await extractTextFromPdfUrl(
        ATTACHED_PDF_ASSET_URL,
        (curr, total) => {
          setPdfProgressText(
            `Đang bóc tách câu hỏi & hình ảnh theo chủ đề: Trang ${curr} / ${total}...`
          );
        }
      );

      setUploadedPdfFileSize(`${Math.round(fileSizeBytes / 1024)} KB`);
      setPdfPageCount(numPages);
      setRawPdfText(text);

      const parsed = parseRawQuestionsFromText(text, ATTACHED_PDF_FILE_NAME, 1);
      setParsedPreview(parsed);
      setPreviewSelectedTheme('all');
      setIsExtractingPdf(false);
      setPdfProgressText('');
    } catch (err: any) {
      console.error('Lỗi khi nạp file PDF đính kèm:', err);
      setIsExtractingPdf(false);
      setPdfProgressText('');
      setErrorMessage('Không thể tải tệp PDF đính kèm. Vui lòng thử lại hoặc tải tệp từ máy.');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessPdfFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Xử lý nạp văn bản PDF mẫu nhanh
  const handleLoadSamplePdfText = () => {
    setRawPdfText(SAMPLE_PDF_TEXT_TIN7);
    setUploadedPdfFileName('Trich_Doan_SBT_Tin_Hoc_7_Mau.pdf');
    setUploadedPdfFileSize('12 KB');
    setPdfPageCount(3);
    const parsed = parseRawQuestionsFromText(SAMPLE_PDF_TEXT_TIN7);
    setParsedPreview(parsed);
    setPreviewSelectedTheme('all');
  };

  // Xử lý phân tích văn bản PDF khi gõ hoặc dán
  const handleParsePdfText = (text: string) => {
    setRawPdfText(text);
    if (text.trim().length > 10) {
      const parsed = parseRawQuestionsFromText(
        text,
        uploadedPdfFileName || 'SBT Tin học 7 - KNTT'
      );
      setParsedPreview(parsed);
      setPreviewSelectedTheme('all');
    } else {
      setParsedPreview([]);
    }
  };

  // Lưu danh sách câu hỏi bóc tách từ PDF vào ngân hàng (cập nhật cả hình ảnh nếu câu hỏi đã tồn tại mà chưa có ảnh)
  const handleSaveImportedQuestions = (onlySelectedTheme: boolean = false) => {
    const questionsToImport =
      onlySelectedTheme && previewSelectedTheme !== 'all'
        ? parsedPreview.filter((q) => q.themeName === previewSelectedTheme)
        : parsedPreview;

    if (questionsToImport.length === 0) return;

    const existingMap = new Map(
      questions.map((q) => [q.content.trim().toLowerCase(), q])
    );

    const uniqueNewQuestions: Question[] = [];
    const updatedExisting = questions.map((existingQ) => {
      const key = existingQ.content.trim().toLowerCase();
      const matchingImport = questionsToImport.find(
        (iq) => iq.content.trim().toLowerCase() === key
      );
      if (matchingImport && matchingImport.imageUrl && !existingQ.imageUrl) {
        return {
          ...existingQ,
          imageUrl: matchingImport.imageUrl,
          imageCaption: matchingImport.imageCaption || existingQ.imageCaption,
        };
      }
      return existingQ;
    });

    for (const iq of questionsToImport) {
      const key = iq.content.trim().toLowerCase();
      if (!existingMap.has(key)) {
        uniqueNewQuestions.push(iq);
      }
    }

    const updated = [...updatedExisting, ...uniqueNewQuestions];
    onSaveQuestions(updated);
    setIsPdfModalOpen(false);
    setRawPdfText('');
    setParsedPreview([]);
    setUploadedPdfFileName(null);

    if (onlySelectedTheme && previewSelectedTheme !== 'all') {
      setSelectedTheme(previewSelectedTheme);
    }

    const topicCount = new Set(questionsToImport.map((q) => q.themeName)).size;
    const imgCount = questionsToImport.filter((q) => Boolean(q.imageUrl)).length;
    showToast(
      `Đã nhập thành công ${uniqueNewQuestions.length} câu hỏi mới (${imgCount} câu kèm hình ảnh) vào ${topicCount} chủ đề trong ngân hàng!`
    );
  };

  // Thay đổi đáp án đúng trực tiếp trên danh sách xem trước
  const handleTogglePreviewAnswer = (questionId: string, optionId: string) => {
    setParsedPreview((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              correctOptionId: optionId,
              reviewStatus: 'da_kiem_duyet',
            }
          : q
      )
    );
  };

  // Xóa câu hỏi khỏi danh sách xem trước
  const handleRemovePreviewQuestion = (questionId: string) => {
    setParsedPreview((prev) => prev.filter((q) => q.id !== questionId));
  };

  // Xóa hình ảnh của 1 câu hỏi trong danh sách xem trước
  const handleRemovePreviewImage = (questionId: string) => {
    setParsedPreview((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, imageUrl: undefined, imageCaption: undefined }
          : q
      )
    );
  };

  return (
    <div className="space-y-5">
      {/* Input ẩn dùng để chọn tệp hình ảnh cho từng câu hỏi trong Preview PDF */}
      <input
        type="file"
        ref={previewImageInputRef}
        accept="image/*"
        onChange={handlePreviewQuestionImageUpload}
        className="hidden"
      />

      {/* Thông báo thành công / lỗi */}
      {notification && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl flex items-center justify-between text-xs font-semibold shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tiêu đề & Các nút thao tác chính */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span>Ngân hàng câu hỏi Tin học 7 (Sách bài tập - Kết nối tri thức)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tổng cộng: <strong>{questions.length}</strong> câu hỏi • Đã kiểm duyệt:{' '}
            <strong className="text-emerald-600">
              {questions.filter((q) => q.reviewStatus === 'da_kiem_duyet').length}
            </strong>{' '}
            câu • Kèm hình ảnh:{' '}
            <strong className="text-indigo-600">
              {questions.filter((q) => Boolean(q.imageUrl)).length}
            </strong>{' '}
            câu • Số chủ đề:{' '}
            <strong className="text-blue-600">{Object.keys(themeCounts).length}</strong> chủ đề
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Nút nạp nhanh file PDF đính kèm Chủ đề 1-3 */}
          <button
            type="button"
            onClick={handleLoadAttachedPdf}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            <span>Nạp PDF Chủ đề 1–3 đính kèm</span>
          </button>

          {/* Nút Upload PDF bất kỳ */}
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setIsPdfModalOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <FileUp className="w-4 h-4" />
            <span>Upload câu hỏi từ PDF</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setModalError(null);
              const defaultType: QuestionType =
                selectedQuestionType !== 'all' ? selectedQuestionType : 'multiple_choice';
              const now = Date.now();
              setEditingQuestion({
                id: `manual_${now}`,
                type: defaultType,
                themeId: 'chu_de_1',
                themeName:
                  selectedTheme !== 'Tất cả chủ đề'
                    ? selectedTheme
                    : 'Chủ đề 1: Máy tính và cộng đồng',
                lessonId: 'bai_1',
                lessonName: 'Bài 1: Thiết bị vào – ra',
                content: '',
                imageUrl: undefined,
                imageCaption: undefined,
                options: [
                  { id: `opt_${now}_a`, label: 'A', content: '' },
                  { id: `opt_${now}_b`, label: 'B', content: '' },
                  { id: `opt_${now}_c`, label: 'C', content: '' },
                  { id: `opt_${now}_d`, label: 'D', content: '' },
                ],
                correctOptionId: '',
                statements: [
                  { id: `stmt_${now}_a`, label: 'a', content: '', isTrue: true },
                  { id: `stmt_${now}_b`, label: 'b', content: '', isTrue: false },
                  { id: `stmt_${now}_c`, label: 'c', content: '', isTrue: true },
                  { id: `stmt_${now}_d`, label: 'd', content: '', isTrue: false },
                ],
                matchingPairs: [
                  { id: `pair_${now}_1`, leftLabel: '1', leftContent: '', rightLabel: 'A', rightContent: '' },
                  { id: `pair_${now}_2`, leftLabel: '2', leftContent: '', rightLabel: 'B', rightContent: '' },
                  { id: `pair_${now}_3`, leftLabel: '3', leftContent: '', rightLabel: 'C', rightContent: '' },
                  { id: `pair_${now}_4`, leftLabel: '4', leftContent: '', rightLabel: 'D', rightContent: '' },
                ],
                cognitiveLevel: 'nhan_biet',
                reviewStatus: 'da_kiem_duyet',
                sourcePage: 1,
                sourceBook: 'SBT Tin học 7 - KNTT',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              setIsAddModalOpen(true);
            }}
            data-testid="btn-open-add-question-modal"
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm câu hỏi mới</span>
          </button>
        </div>
      </div>

      {/* 3 DẠNG CÂU HỎI TRẮC NGHIỆM CƠ BẢN TRONG ĐỀ THI */}
      <div
        data-testid="question-type-filter-cards"
        className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
              <span>3 Dạng câu hỏi trắc nghiệm cơ bản trong đề thi (Chuẩn Bộ GD&amp;ĐT)</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Nhấp vào từng dạng câu hỏi bên dưới để lọc nhanh hoặc bấm &ldquo;Thêm câu hỏi mới&rdquo; để soạn câu hỏi theo đúng cấu trúc.
            </p>
          </div>

          <button
            type="button"
            data-testid="filter-qtype-all"
            onClick={() => setSelectedQuestionType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              selectedQuestionType === 'all'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            Tất cả 3 dạng ({questions.length} câu)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Dạng 1: Nhiều lựa chọn (Multiple Choice) */}
          <button
            type="button"
            data-testid="filter-qtype-multiple_choice"
            onClick={() =>
              setSelectedQuestionType((prev) =>
                prev === 'multiple_choice' ? 'all' : 'multiple_choice'
              )
            }
            className={`text-left p-3.5 rounded-xl border transition-all space-y-1.5 ${
              selectedQuestionType === 'multiple_choice'
                ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                : 'bg-slate-50/70 border-slate-200 hover:border-blue-300 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-xs text-blue-900">
                1. Nhiều lựa chọn (Multiple Choice)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                {questionTypeCounts.multiple_choice} câu
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Dạng phổ biến nhất, gồm <strong>4 phương án (A, B, C, D)</strong> và thí sinh chỉ chọn{' '}
              <strong>1 đáp án đúng duy nhất</strong>.
            </p>
          </button>

          {/* Dạng 2: Đúng/Sai (True/False) */}
          <button
            type="button"
            data-testid="filter-qtype-true_false"
            onClick={() =>
              setSelectedQuestionType((prev) => (prev === 'true_false' ? 'all' : 'true_false'))
            }
            className={`text-left p-3.5 rounded-xl border transition-all space-y-1.5 ${
              selectedQuestionType === 'true_false'
                ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                : 'bg-slate-50/70 border-slate-200 hover:border-emerald-300 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-xs text-emerald-900">
                2. Đúng/Sai (True/False)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                {questionTypeCounts.true_false} câu
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Thí sinh đánh giá từng phát biểu là <strong>Đúng</strong> hoặc <strong>Sai</strong>. Theo cấu trúc mới của Bộ GD&amp;ĐT, một câu hỏi lớn gồm nhiều ý nhỏ <strong>a), b), c), d)</strong> Đúng/Sai kết hợp.
            </p>
          </button>

          {/* Dạng 3: Ghép đôi (Matching) */}
          <button
            type="button"
            data-testid="filter-qtype-matching"
            onClick={() =>
              setSelectedQuestionType((prev) => (prev === 'matching' ? 'all' : 'matching'))
            }
            className={`text-left p-3.5 rounded-xl border transition-all space-y-1.5 ${
              selectedQuestionType === 'matching'
                ? 'bg-purple-50/90 border-purple-500 ring-2 ring-purple-500/20 shadow-xs'
                : 'bg-slate-50/70 border-slate-200 hover:border-purple-300 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-xs text-purple-900">
                3. Ghép đôi (Matching)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                {questionTypeCounts.matching} câu
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Nối các ý ở <strong>Cột A (1, 2, 3, 4)</strong> với các ý ở <strong>Cột B (A, B, C, D)</strong> sao cho tương thích về mặt nội dung.
            </p>
          </button>
        </div>
      </div>

      {/* Thẻ phân loại nhanh theo từng Chủ đề */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Phân loại ngân hàng câu hỏi theo Chủ đề:</span>
          </span>
          <span className="text-[11px] text-slate-500">
            Đang hiển thị: <strong>{filteredQuestions.length}</strong> câu hỏi
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedTheme('Tất cả chủ đề');
              setSelectedLesson('Tất cả bài học');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center space-x-1.5 ${
              selectedTheme === 'Tất cả chủ đề'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>Tất cả chủ đề</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                selectedTheme === 'Tất cả chủ đề'
                  ? 'bg-blue-800 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {questions.length}
            </span>
          </button>

          {availableThemes
            .filter((t) => t !== 'Tất cả chủ đề')
            .map((theme) => {
              const count = themeCounts[theme] || 0;
              const isSelected = selectedTheme === theme;
              return (
                <button
                  key={theme}
                  type="button"
                  onClick={() => {
                    setSelectedTheme(theme);
                    setSelectedLesson('Tất cả bài học');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center space-x-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{theme}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isSelected
                        ? 'bg-blue-800 text-white'
                        : count > 0
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Thanh bộ lọc & Tìm kiếm */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Ô tìm kiếm */}
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Tìm nội dung, bài học..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
            />
          </div>

          {/* Lọc theo Chủ đề */}
          <div>
            <select
              aria-label="Lọc theo Chủ đề"
              value={selectedTheme}
              onChange={(e) => {
                setSelectedTheme(e.target.value);
                setSelectedLesson('Tất cả bài học');
              }}
              className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {availableThemes.map((t) => (
                <option key={t} value={t}>
                  {t === 'Tất cả chủ đề' ? t : `${t} (${themeCounts[t] || 0} câu)`}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Bài học */}
          <div>
            <select
              aria-label="Lọc theo Bài học"
              value={selectedLesson}
              onChange={(e) => setSelectedLesson(e.target.value)}
              className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {availableLessons.map((lesson) => (
                <option key={lesson} value={lesson}>
                  {lesson}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Mức độ */}
          <div>
            <select
              aria-label="Lọc theo Mức độ nhận thức"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {COGNITIVE_LEVELS.map((lvl) => (
                <option key={lvl.key} value={lvl.key}>
                  {lvl.label}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Trạng thái duyệt */}
          <div>
            <select
              aria-label="Lọc theo Trạng thái duyệt"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">Tất cả trạng thái duyệt</option>
              <option value="da_kiem_duyet">Đã kiểm duyệt (Sẵn sàng thi)</option>
              <option value="chua_kiem_duyet">Chưa kiểm duyệt</option>
              <option value="can_chinh_sua">Cần chỉnh sửa</option>
            </select>
          </div>
        </div>

        {/* Thanh thao tác chọn và xóa nhanh nhiều câu hỏi */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const visibleIds = filteredQuestions.map((q) => q.id);
                const allSelected =
                  visibleIds.length > 0 &&
                  visibleIds.every((id) => selectedIdsForBulk.includes(id));
                if (allSelected) {
                  setSelectedIdsForBulk((prev) =>
                    prev.filter((id) => !visibleIds.includes(id))
                  );
                } else {
                  setSelectedIdsForBulk((prev) =>
                    Array.from(new Set([...prev, ...visibleIds]))
                  );
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold transition-colors"
            >
              {filteredQuestions.length > 0 &&
              filteredQuestions.every((q) => selectedIdsForBulk.includes(q.id))
                ? 'Bỏ chọn các câu đang hiển thị'
                : `Chọn tất cả đang hiển thị (${filteredQuestions.length} câu)`}
            </button>

            {selectedIdsForBulk.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIdsForBulk([])}
                className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-medium transition-colors"
              >
                Bỏ chọn ({selectedIdsForBulk.length})
              </button>
            )}
          </div>

          {selectedIdsForBulk.length > 0 && (
            <button
              type="button"
              data-testid="btn-bulk-delete-questions"
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="bg-red-600 hover:bg-red-500 text-white font-bold px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa {selectedIdsForBulk.length} câu hỏi đã chọn</span>
            </button>
          )}
        </div>
      </div>

      {/* Danh sách câu hỏi */}
      <div className="space-y-4">
        {filteredQuestions.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700">Không tìm thấy câu hỏi phù hợp</h3>
            <p className="text-xs text-slate-500 mt-1">
              Thử xóa bớt bộ lọc hoặc bấm &ldquo;Nạp PDF Chủ đề 1–3 đính kèm&rdquo; để bổ sung câu hỏi.
            </p>
          </div>
        ) : (
          filteredQuestions.map((q, index) => {
            const levelInfo =
              COGNITIVE_LEVELS.find((l) => l.key === q.cognitiveLevel) || COGNITIVE_LEVELS[1];
            const qType = getQuestionType(q);
            const typeBadge =
              qType === 'true_false'
                ? {
                    label: 'Đúng/Sai (Cấu trúc Bộ GD&ĐT)',
                    className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
                  }
                : qType === 'matching'
                ? {
                    label: 'Ghép đôi (Cột A - Cột B)',
                    className: 'bg-purple-100 text-purple-900 border-purple-300',
                  }
                : {
                    label: 'Nhiều lựa chọn (A, B, C, D)',
                    className: 'bg-blue-100 text-blue-900 border-blue-300',
                  };

            return (
              <div
                key={q.id}
                data-testid={`question-card-${q.id}`}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 hover:border-blue-300 transition-colors"
              >
                {/* Header câu hỏi: Số thứ tự, Dạng câu hỏi, Chủ đề, Bài học, Mức độ, Trạng thái */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Chọn câu hỏi #${questionBankIndexMap.get(q.id) || index + 1}`}
                      checked={selectedIdsForBulk.includes(q.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIdsForBulk((prev) => [...prev, q.id]);
                        } else {
                          setSelectedIdsForBulk((prev) => prev.filter((id) => id !== q.id));
                        }
                      }}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="font-extrabold text-blue-900 bg-blue-100 px-2 py-0.5 rounded">
                      #{questionBankIndexMap.get(q.id) || index + 1}
                    </span>
                    <span
                      className={`font-extrabold px-2.5 py-0.5 rounded border ${typeBadge.className}`}
                    >
                      {typeBadge.label}
                    </span>
                    <span className="font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                      {q.themeName}
                    </span>
                    {q.lessonName && (
                      <span className="font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {q.lessonName}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded border font-semibold ${levelInfo.color}`}>
                      {levelInfo.label}
                    </span>
                    {q.imageUrl && (
                      <span className="inline-flex items-center space-x-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-semibold">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Có hình ảnh</span>
                      </span>
                    )}
                    {q.sourcePage && (
                      <span className="text-slate-400">Trang {q.sourcePage}</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    {q.reviewStatus === 'da_kiem_duyet' ? (
                      <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đã kiểm duyệt</span>
                      </span>
                    ) : q.reviewStatus === 'chua_kiem_duyet' ? (
                      <span className="inline-flex items-center space-x-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-bold">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Chưa kiểm duyệt</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded font-bold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Cần chỉnh sửa</span>
                      </span>
                    )}

                    {q.reviewStatus !== 'da_kiem_duyet' && (
                      <button
                        type="button"
                        onClick={() => handleQuickApprove(q)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 rounded font-medium text-xs transition-colors"
                      >
                        Duyệt ngay
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setModalError(null);
                        setEditingQuestion(JSON.parse(JSON.stringify(q)));
                        setIsAddModalOpen(true);
                      }}
                      className="text-slate-500 hover:text-blue-600 p-1 rounded hover:bg-slate-100"
                      title="Sửa câu hỏi"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuestionToDelete(q)}
                      className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100"
                      title="Xóa câu hỏi"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Nội dung câu hỏi + Hình ảnh minh họa (nếu có) */}
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-800 leading-relaxed whitespace-pre-line">
                    {q.content}
                  </p>

                  {q.imageUrl && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col items-center justify-center space-y-1.5 max-w-md">
                      <img
                        src={q.imageUrl}
                        alt={q.imageCaption || 'Hình minh họa câu hỏi'}
                        className="max-h-44 w-auto object-contain rounded-lg bg-white p-1.5 border border-slate-200 shadow-2xs"
                      />
                      {q.imageCaption && (
                        <span className="text-xs italic text-slate-600 font-medium">
                          {q.imageCaption}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* HIỂN THỊ PHƯƠNG ÁN THEO TỪNG DẠNG CÂU HỎI */}
                {qType === 'true_false' && q.statements && q.statements.length > 0 ? (
                  <div className="border border-emerald-200 rounded-xl overflow-hidden text-xs">
                    <div className="bg-emerald-50/80 px-3 py-2 border-b border-emerald-200 flex items-center justify-between font-bold text-emerald-950">
                      <span>Các ý phát biểu nhận định (a, b, c, d)</span>
                      <span>Đáp án chuẩn (Đúng / Sai)</span>
                    </div>
                    <div className="divide-y divide-slate-200 bg-white">
                      {q.statements.map((stmt) => (
                        <div
                          key={stmt.id}
                          className="px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50"
                        >
                          <div className="flex items-start space-x-2 flex-1">
                            <span className="font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">
                              {stmt.label})
                            </span>
                            <span className="text-slate-800 leading-relaxed">{stmt.content}</span>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-full font-extrabold text-[11px] shrink-0 border ${
                              stmt.isTrue
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}
                          >
                            {stmt.isTrue ? 'ĐÚNG' : 'SAI'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : qType === 'matching' && q.matchingPairs && q.matchingPairs.length > 0 ? (
                  <div className="border border-purple-200 rounded-xl overflow-hidden text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 bg-purple-50/80 border-b border-purple-200 font-bold text-purple-950">
                      <div className="px-3 py-2 border-b sm:border-b-0 sm:border-r border-purple-200">
                        Cột A (Nội dung / Thiết bị / Thao tác)
                      </div>
                      <div className="px-3 py-2">
                        Cột B (Đáp án ghép nối tương thích)
                      </div>
                    </div>
                    <div className="divide-y divide-slate-200 bg-white">
                      {q.matchingPairs.map((pair) => (
                        <div
                          key={pair.id}
                          className="grid grid-cols-1 sm:grid-cols-2 hover:bg-slate-50"
                        >
                          <div className="px-3 py-2.5 sm:border-r border-slate-200 flex items-start space-x-2">
                            <span className="w-5 h-5 rounded bg-purple-100 text-purple-900 font-extrabold flex items-center justify-center shrink-0">
                              {pair.leftLabel}
                            </span>
                            <span className="text-slate-800 font-medium">{pair.leftContent}</span>
                          </div>
                          <div className="px-3 py-2.5 flex items-start space-x-2 bg-emerald-50/30">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-extrabold flex items-center justify-center shrink-0">
                              {pair.rightLabel}
                            </span>
                            <span className="text-slate-800 flex-1">{pair.rightContent}</span>
                            <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded shrink-0">
                              {pair.leftLabel} - {pair.rightLabel}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Dạng Nhiều lựa chọn (4 phương án A, B, C, D) */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {q.options.map((opt) => {
                      const isCorrect = opt.id === q.correctOptionId;
                      return (
                        <div
                          key={opt.id}
                          className={`p-2.5 rounded-lg border flex items-start space-x-2.5 ${
                            isCorrect
                              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-medium'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              isCorrect
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {opt.label}
                          </span>
                          <span className="flex-1">{opt.content}</span>
                          {isCorrect && (
                            <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                              Đáp án đúng
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Giải thích / Hướng dẫn giải nếu có */}
                {q.explanation && (
                  <div className="text-xs bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-600 flex items-start space-x-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <span>
                      <strong>Hướng dẫn giải:</strong> {q.explanation}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL XÁC NHẬN XÓA CÂU HỎI */}
      {questionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">Xác nhận xóa câu hỏi</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa câu hỏi:{' '}
              <strong className="text-slate-800">
                &ldquo;{questionToDelete.content.slice(0, 90)}...&rdquo;
              </strong>{' '}
              khỏi ngân hàng câu hỏi?
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setQuestionToDelete(null)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={confirmDeleteQuestion}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold"
              >
                Xóa câu hỏi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA HÀNG LOẠT CÂU HỎI ĐÃ CHỌN */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">
                Xác nhận xóa {selectedIdsForBulk.length} câu hỏi đã chọn
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa vĩnh viễn{' '}
              <strong className="text-slate-900">{selectedIdsForBulk.length} câu hỏi</strong> đã chọn
              khỏi ngân hàng câu hỏi? Các câu hỏi này sẽ không còn xuất hiện trong phần sinh đề.
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                data-testid="btn-confirm-bulk-delete-questions"
                onClick={confirmBulkDeleteQuestions}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold"
              >
                Xóa {selectedIdsForBulk.length} câu hỏi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL THÊM / SỬA CÂU HỎI */}
      {isAddModalOpen && editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">
                {questions.some((q) => q.id === editingQuestion.id)
                  ? 'Chỉnh sửa câu hỏi'
                  : 'Thêm câu hỏi mới vào ngân hàng'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg text-xs font-medium">
                {modalError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* CHỌN 1 TRONG 3 DẠNG CÂU HỎI TRẮC NGHIỆM */}
              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700">
                  Dạng câu hỏi trắc nghiệm <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      key: 'multiple_choice' as QuestionType,
                      title: '1. Nhiều lựa chọn',
                      desc: '4 phương án A, B, C, D (chọn 1)',
                    },
                    {
                      key: 'true_false' as QuestionType,
                      title: '2. Đúng / Sai',
                      desc: 'Cấu trúc Bộ GD&ĐT (a, b, c, d)',
                    },
                    {
                      key: 'matching' as QuestionType,
                      title: '3. Ghép đôi',
                      desc: 'Nối Cột A (1-4) với Cột B (A-D)',
                    },
                  ].map((item) => {
                    const activeType = getQuestionType(editingQuestion);
                    const isSelected = activeType === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        data-testid={`modal-qtype-${item.key}`}
                        onClick={() => {
                          const now = Date.now();
                          const nextStatements: TrueFalseStatement[] =
                            editingQuestion.statements && editingQuestion.statements.length > 0
                              ? editingQuestion.statements
                              : [
                                  { id: `stmt_${now}_a`, label: 'a', content: '', isTrue: true },
                                  { id: `stmt_${now}_b`, label: 'b', content: '', isTrue: false },
                                  { id: `stmt_${now}_c`, label: 'c', content: '', isTrue: true },
                                  { id: `stmt_${now}_d`, label: 'd', content: '', isTrue: false },
                                ];
                          const nextPairs: MatchingPair[] =
                            editingQuestion.matchingPairs && editingQuestion.matchingPairs.length > 0
                              ? editingQuestion.matchingPairs
                              : [
                                  { id: `pair_${now}_1`, leftLabel: '1', leftContent: '', rightLabel: 'A', rightContent: '' },
                                  { id: `pair_${now}_2`, leftLabel: '2', leftContent: '', rightLabel: 'B', rightContent: '' },
                                  { id: `pair_${now}_3`, leftLabel: '3', leftContent: '', rightLabel: 'C', rightContent: '' },
                                  { id: `pair_${now}_4`, leftLabel: '4', leftContent: '', rightLabel: 'D', rightContent: '' },
                                ];
                          setEditingQuestion({
                            ...editingQuestion,
                            type: item.key,
                            statements: nextStatements,
                            matchingPairs: nextPairs,
                          });
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-blue-50 border-blue-600 text-blue-950 ring-1 ring-blue-500'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-extrabold text-xs">{item.title}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{item.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chủ đề bài học</label>
                  <select
                    value={editingQuestion.themeName}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, themeName: e.target.value })
                    }
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  >
                    {availableThemes
                      .filter((t) => t !== 'Tất cả chủ đề')
                      .map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tên bài học</label>
                  <input
                    type="text"
                    value={editingQuestion.lessonName || ''}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, lessonName: e.target.value })
                    }
                    placeholder="Ví dụ: Bài 1: Thiết bị vào – ra"
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mức độ nhận thức</label>
                <select
                  value={editingQuestion.cognitiveLevel}
                  onChange={(e) =>
                    setEditingQuestion({
                      ...editingQuestion,
                      cognitiveLevel: e.target.value as CognitiveLevel,
                    })
                  }
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="nhan_biet">Nhận biết</option>
                  <option value="thong_hieu">Thông hiểu</option>
                  <option value="van_dung">Vận dụng</option>
                  <option value="van_dung_cao">Vận dụng cao</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nội dung câu hỏi <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={editingQuestion.content}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, content: e.target.value })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                  placeholder="Nhập nội dung câu hỏi trắc nghiệm từ sách bài tập..."
                />
              </div>

              {/* HÌNH ẢNH MINH HỌA CÂU HỎI */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-semibold text-slate-700 flex items-center space-x-1.5">
                    <ImageIcon className="w-4 h-4 text-indigo-600" />
                    <span>Hình ảnh minh họa câu hỏi (Tùy chọn):</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="file"
                      ref={editQuestionImageInputRef}
                      accept="image/*"
                      onChange={handleEditQuestionImageUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => editQuestionImageInputRef.current?.click()}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-lg font-semibold text-[11px] flex items-center space-x-1"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Tải ảnh từ máy tính</span>
                    </button>
                    {editingQuestion.imageUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingQuestion({
                            ...editingQuestion,
                            imageUrl: undefined,
                            imageCaption: undefined,
                          })
                        }
                        className="text-red-600 hover:text-red-800 px-2 py-1 rounded-lg font-semibold text-[11px] bg-red-50 border border-red-200"
                      >
                        Xóa ảnh
                      </button>
                    )}
                  </div>
                </div>

                {/* Chọn nhanh hình minh họa từ Sách bài tập */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">Chọn nhanh hình SBT:</span>
                  {Object.entries(TEXTBOOK_FIGURE_MAP).map(([figKey, figInfo]) => (
                    <button
                      key={figKey}
                      type="button"
                      onClick={() =>
                        setEditingQuestion({
                          ...editingQuestion,
                          imageUrl: figInfo.imageUrl,
                          imageCaption: figInfo.imageCaption,
                        })
                      }
                      className={`px-2 py-0.5 rounded border text-[11px] font-medium transition-colors ${
                        editingQuestion.imageUrl === figInfo.imageUrl
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {figInfo.imageCaption}
                    </button>
                  ))}
                </div>

                {editingQuestion.imageUrl && (
                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                    <img
                      src={editingQuestion.imageUrl}
                      alt={editingQuestion.imageCaption || 'Hình minh họa'}
                      className="h-24 w-auto object-contain bg-white p-1.5 rounded-lg border border-slate-200"
                    />
                    <div className="flex-1 w-full space-y-1.5">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Chú thích dưới hình ảnh:
                      </label>
                      <input
                        type="text"
                        value={editingQuestion.imageCaption || ''}
                        onChange={(e) =>
                          setEditingQuestion({
                            ...editingQuestion,
                            imageCaption: e.target.value,
                          })
                        }
                        placeholder="Ví dụ: Hình 1.1. Máy quét"
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* NỘI DUNG PHƯƠNG ÁN THEO DẠNG CÂU HỎI */}
              {getQuestionType(editingQuestion) === 'true_false' ? (
                <div className="space-y-2.5 bg-emerald-50/50 border border-emerald-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-emerald-950">
                      Các phát biểu nhận định a), b), c), d) &amp; Chọn Đúng / Sai:
                    </label>
                    <span className="text-[10px] text-emerald-700 font-semibold">
                      Theo cấu trúc mới của Bộ GD&amp;ĐT
                    </span>
                  </div>
                  {(editingQuestion.statements || []).map((stmt, idx) => (
                    <div key={stmt.id} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded bg-emerald-100 text-emerald-900 font-extrabold text-xs flex items-center justify-center shrink-0">
                        {stmt.label})
                      </span>
                      <input
                        type="text"
                        value={stmt.content}
                        onChange={(e) => {
                          const next = [...(editingQuestion.statements || [])];
                          next[idx] = { ...next[idx], content: e.target.value };
                          setEditingQuestion({ ...editingQuestion, statements: next });
                        }}
                        placeholder={`Nội dung phát biểu ý ${stmt.label})...`}
                        className="flex-1 p-2 border border-slate-300 rounded-lg text-xs bg-white"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...(editingQuestion.statements || [])];
                            next[idx] = { ...next[idx], isTrue: true };
                            setEditingQuestion({ ...editingQuestion, statements: next });
                          }}
                          className={`px-2.5 py-1.5 rounded-lg font-extrabold text-[11px] border ${
                            stmt.isTrue
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Đúng
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...(editingQuestion.statements || [])];
                            next[idx] = { ...next[idx], isTrue: false };
                            setEditingQuestion({ ...editingQuestion, statements: next });
                          }}
                          className={`px-2.5 py-1.5 rounded-lg font-extrabold text-[11px] border ${
                            !stmt.isTrue
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Sai
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : getQuestionType(editingQuestion) === 'matching' ? (
                <div className="space-y-2.5 bg-purple-50/50 border border-purple-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-purple-950">
                      Các cặp nối Cột A (1, 2, 3, 4) tương ứng với Cột B (A, B, C, D):
                    </label>
                    <span className="text-[10px] text-purple-700 font-semibold">
                      Hệ thống tự động đảo thứ tự Cột B khi học sinh thi
                    </span>
                  </div>
                  {(editingQuestion.matchingPairs || []).map((pair, idx) => (
                    <div
                      key={pair.id}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-2 rounded-lg border border-purple-200"
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className="w-6 h-6 rounded bg-purple-100 text-purple-900 font-extrabold text-xs flex items-center justify-center shrink-0">
                          {pair.leftLabel}.
                        </span>
                        <input
                          type="text"
                          value={pair.leftContent}
                          onChange={(e) => {
                            const next = [...(editingQuestion.matchingPairs || [])];
                            next[idx] = { ...next[idx], leftContent: e.target.value };
                            setEditingQuestion({ ...editingQuestion, matchingPairs: next });
                          }}
                          placeholder={`Nội dung Cột A (Ý ${pair.leftLabel})...`}
                          className="w-full p-1.5 border border-slate-300 rounded text-xs"
                        />
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                          {pair.rightLabel}.
                        </span>
                        <input
                          type="text"
                          value={pair.rightContent}
                          onChange={(e) => {
                            const next = [...(editingQuestion.matchingPairs || [])];
                            next[idx] = { ...next[idx], rightContent: e.target.value };
                            setEditingQuestion({ ...editingQuestion, matchingPairs: next });
                          }}
                          placeholder={`Nội dung Cột B ghép với ý ${pair.leftLabel}...`}
                          className="w-full p-1.5 border border-slate-300 rounded text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* 4 phương án A, B, C, D */
                <div className="space-y-2">
                  <label className="block font-semibold text-slate-700">
                    Các phương án trả lời &amp; Chọn 1 đáp án đúng duy nhất:
                  </label>
                  {editingQuestion.options.map((opt, idx) => (
                    <div key={opt.id} className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingQuestion({ ...editingQuestion, correctOptionId: opt.id })
                        }
                        className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${
                          editingQuestion.correctOptionId === opt.id
                            ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                            : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        }`}
                        title="Bấm để chọn phương án này làm đáp án đúng"
                      >
                        {opt.label}
                      </button>
                      <input
                        type="text"
                        value={opt.content}
                        onChange={(e) => {
                          const newOptions = [...editingQuestion.options];
                          newOptions[idx].content = e.target.value;
                          setEditingQuestion({ ...editingQuestion, options: newOptions });
                        }}
                        placeholder={`Nội dung phương án ${opt.label}...`}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Hướng dẫn giải / Giải thích đáp án
                </label>
                <input
                  type="text"
                  value={editingQuestion.explanation || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, explanation: e.target.value })
                  }
                  placeholder="Giải thích ngắn gọn căn cứ từ sách bài tập..."
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                data-testid="btn-save-question-modal"
                onClick={() => {
                  if (!editingQuestion.content.trim()) {
                    setModalError('Vui lòng nhập nội dung câu hỏi.');
                    return;
                  }
                  const qType = getQuestionType(editingQuestion);
                  if (qType === 'multiple_choice' && !editingQuestion.correctOptionId) {
                    setModalError(
                      'Vui lòng chọn 1 phương án làm đáp án đúng bằng cách bấm vào chữ A, B, C, hoặc D.'
                    );
                    return;
                  }
                  if (
                    qType === 'true_false' &&
                    (!editingQuestion.statements ||
                      editingQuestion.statements.some((s) => !s.content.trim()))
                  ) {
                    setModalError(
                      'Vui lòng nhập đầy đủ nội dung cho cả 4 phát biểu a), b), c), d).'
                    );
                    return;
                  }
                  if (
                    qType === 'matching' &&
                    (!editingQuestion.matchingPairs ||
                      editingQuestion.matchingPairs.some(
                        (p) => !p.leftContent.trim() || !p.rightContent.trim()
                      ))
                  ) {
                    setModalError(
                      'Vui lòng nhập đầy đủ nội dung các cặp nối ở Cột A và Cột B.'
                    );
                    return;
                  }
                  const exists = questions.some((q) => q.id === editingQuestion.id);
                  const savedQuestion: Question = {
                    ...editingQuestion,
                    type: qType,
                    options: qType === 'multiple_choice' ? editingQuestion.options : [],
                    correctOptionId:
                      qType === 'multiple_choice' ? editingQuestion.correctOptionId : '',
                    statements: qType === 'true_false' ? editingQuestion.statements : undefined,
                    matchingPairs:
                      qType === 'matching' ? editingQuestion.matchingPairs : undefined,
                    updatedAt: new Date().toISOString(),
                  };
                  const updated = exists
                    ? questions.map((q) => (q.id === savedQuestion.id ? savedQuestion : q))
                    : [savedQuestion, ...questions];
                  onSaveQuestions(updated);
                  setIsAddModalOpen(false);
                  showToast(
                    exists
                      ? 'Đã cập nhật câu hỏi và đồng bộ ngay với phần sinh đề.'
                      : 'Đã thêm câu hỏi mới vào ngân hàng.'
                  );
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg"
              >
                Lưu câu hỏi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL UPLOAD & PHÂN TÍCH CÂU HỎI + HÌNH ẢNH TỪ PDF THEO CHỦ ĐỀ */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full p-6 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <span>
                    Đọc &amp; Phân tích tệp PDF Ngân hàng câu hỏi (Văn bản &amp; Hình ảnh) theo Chủ đề
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tự động nhận diện <strong>CHỦ ĐỀ</strong>, <strong>Bài học</strong>,{' '}
                  <strong>Câu X.Y</strong>, <strong>Hình ảnh minh họa (Hình X.Y)</strong>, phương án{' '}
                  <strong>A/B/C/D</strong>, <strong>• Đáp án</strong> và <strong>• Hướng dẫn giải</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPdfModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between mt-3 shrink-0">
                <span>{errorMessage}</span>
                <button type="button" onClick={() => setErrorMessage(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Chuyển đổi tab chế độ: Upload File PDF / Dán văn bản / Nạp file đính kèm */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setPdfImportMode('upload_file')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                  pdfImportMode === 'upload_file'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Tải tệp PDF lên (.pdf)</span>
              </button>

              <button
                type="button"
                onClick={() => setPdfImportMode('raw_text')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                  pdfImportMode === 'raw_text'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Dán văn bản / OCR trực tiếp</span>
              </button>

              <div className="ml-auto flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleLoadAttachedPdf}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Nạp file đính kèm (Cau_hoi_chu_de_1-3.pdf)</span>
                </button>

                <button
                  type="button"
                  onClick={handleLoadSamplePdfText}
                  className="text-indigo-600 hover:text-indigo-800 text-xs font-bold underline"
                >
                  Nạp đoạn mẫu có hình ảnh
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs flex-1 overflow-y-auto py-3 pr-1">
              {/* CỘT TRÁI (5 CỘT): KHUNG TẢI FILE HOẶC KHUNG DÁN VĂN BẢN */}
              <div className="lg:col-span-5 space-y-3 flex flex-col">
                {pdfImportMode === 'upload_file' ? (
                  <div className="space-y-3">
                    {/* Vùng Dropzone tải file PDF */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleProcessPdfFile(file);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                        isDragOver
                          ? 'border-indigo-500 bg-indigo-50/70'
                          : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70 hover:border-indigo-400'
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".pdf"
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                      <div className="w-11 h-11 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-2">
                        {isExtractingPdf ? (
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                      </div>
                      <p className="font-bold text-slate-800 text-xs">
                        {isExtractingPdf
                          ? pdfProgressText
                          : 'Kéo thả tệp PDF vào đây hoặc bấm để chọn tệp từ máy tính'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Hỗ trợ trích xuất cả văn bản và hình ảnh nhúng trong tệp <code>.pdf</code>
                      </p>
                    </div>

                    {/* Thông tin tệp PDF đã đọc */}
                    {uploadedPdfFileName && (
                      <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <FileCheck className="w-5 h-5 text-indigo-600 shrink-0" />
                          <div>
                            <p className="font-bold text-indigo-950 truncate max-w-[220px]">
                              {uploadedPdfFileName}
                            </p>
                            <p className="text-[11px] text-indigo-700">
                              Dung lượng: {uploadedPdfFileSize} • Số trang: {pdfPageCount} trang • Có ảnh:{' '}
                              <strong>{totalPreviewImages} câu</strong>
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs text-indigo-700 hover:text-indigo-900 font-bold underline"
                        >
                          Chọn tệp khác
                        </button>
                      </div>
                    )}

                    {/* Thống kê Chủ đề nhận diện được */}
                    {previewThemeBreakdown.length > 0 && (
                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-emerald-950 text-xs flex items-center space-x-1.5">
                            <Layers className="w-4 h-4 text-emerald-600" />
                            <span>
                              Phân tích thành công {parsedPreview.length} câu hỏi theo{' '}
                              {previewThemeBreakdown.length} chủ đề:
                            </span>
                          </p>
                          {totalPreviewImages > 0 && (
                            <span className="inline-flex items-center space-x-1 bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                              <ImageIcon className="w-3 h-3" />
                              <span>{totalPreviewImages} câu có ảnh</span>
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {previewThemeBreakdown.map((item) => (
                            <div
                              key={item.themeName}
                              onClick={() =>
                                setPreviewSelectedTheme((prev) =>
                                  prev === item.themeName ? 'all' : item.themeName
                                )
                              }
                              className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                                previewSelectedTheme === item.themeName
                                  ? 'bg-emerald-600 text-white border-emerald-700'
                                  : 'bg-white border-emerald-200 hover:bg-emerald-50 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between font-bold text-[11px]">
                                <span>{item.themeName}</span>
                                <div className="flex items-center space-x-1.5">
                                  {item.imageCount > 0 && (
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full text-[10px] flex items-center space-x-0.5 ${
                                        previewSelectedTheme === item.themeName
                                          ? 'bg-emerald-700 text-emerald-100'
                                          : 'bg-indigo-50 text-indigo-700'
                                      }`}
                                    >
                                      <ImageIcon className="w-2.5 h-2.5" />
                                      <span>{item.imageCount} ảnh</span>
                                    </span>
                                  )}
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] ${
                                      previewSelectedTheme === item.themeName
                                        ? 'bg-emerald-800 text-white'
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {item.count} câu
                                  </span>
                                </div>
                              </div>
                              {item.lessons.length > 0 && (
                                <p
                                  className={`text-[10px] mt-1 ${
                                    previewSelectedTheme === item.themeName
                                      ? 'text-emerald-100'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  Gồm: {item.lessons.join(' • ')}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Khung xem trước văn bản trích xuất được */}
                    {rawPdfText && (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="font-semibold text-slate-700 text-[11px]">
                            Văn bản trích xuất từ PDF:
                          </label>
                          <span className="text-[10px] text-slate-400">
                            Có thể chỉnh sửa trực tiếp
                          </span>
                        </div>
                        <textarea
                          rows={5}
                          value={rawPdfText}
                          onChange={(e) => handleParsePdfText(e.target.value)}
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-[11px] font-mono focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  /* TAB DÁN VĂN BẢN TRỰC TIẾP */
                  <div className="space-y-2 flex-1 flex flex-col">
                    <label className="font-semibold text-slate-700">
                      Dán nội dung câu hỏi từ PDF hoặc tài liệu scan:
                    </label>
                    <textarea
                      rows={14}
                      value={rawPdfText}
                      onChange={(e) => handleParsePdfText(e.target.value)}
                      placeholder="Dán nội dung sao chép từ PDF vào đây. Ví dụ:
CHỦ ĐỀ 1. MÁY TÍNH VÀ CỘNG ĐỒNG
Bài 1. Thiết bị vào – ra
Câu 1.1. Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?
Hình 1.1. Máy quét
A. Thiết bị vào.
B. Thiết bị ra.
C. Thiết bị vừa vào vừa ra.
D. Thiết bị lưu trữ.
• Đáp án: A
• Hướng dẫn giải: Máy quét đưa dữ liệu ảnh vào máy tính."
                      className="w-full p-3 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 flex-1"
                    />
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-[11px] text-slate-600 space-y-0.5">
                  <span className="font-bold text-slate-800 block">
                    Quy tắc phân tích tự động văn bản &amp; hình ảnh:
                  </span>
                  <p>
                    • Phân loại chủ đề &amp; bài: <code>CHỦ ĐỀ 1...</code>, <code>Bài 1...</code>
                  </p>
                  <p>
                    • Tự động cắt hình ảnh nhúng trong trang PDF hoặc nhận diện <code>Hình 1.1</code>,{' '}
                    <code>Hình 1.2</code>... và đặt ngay dưới câu hỏi tương ứng.
                  </p>
                  <p>
                    • Cho phép bấm <strong>Thêm/Đổi ảnh</strong> trên từng câu hỏi để bổ sung ảnh tùy ý.
                  </p>
                </div>
              </div>

              {/* CỘT PHẢI (7 CỘT): XEM TRƯỚC VÀ KIỂM DUYỆT CÂU HỎI KÈM HÌNH ẢNH */}
              <div className="lg:col-span-7 space-y-3 flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">
                    Danh sách câu hỏi nhận diện ({visiblePreviewQuestions.length} /{' '}
                    {parsedPreview.length} câu):
                  </span>
                  {previewSelectedTheme !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setPreviewSelectedTheme('all')}
                      className="text-xs text-indigo-600 hover:underline font-semibold"
                    >
                      Hiển thị tất cả chủ đề ({parsedPreview.length} câu)
                    </button>
                  )}
                </div>

                <div className="flex-1 border border-slate-200 rounded-xl p-3 overflow-y-auto max-h-[470px] bg-slate-50 space-y-3">
                  {visiblePreviewQuestions.length === 0 ? (
                    <div className="text-center py-20 text-slate-400 space-y-3">
                      <FileUp className="w-10 h-10 mx-auto text-slate-300" />
                      <p className="font-semibold text-slate-600">
                        Chưa có câu hỏi nào được bóc tách.
                      </p>
                      <p className="text-[11px]">
                        Tải tệp PDF ở khung bên trái hoặc bấm nút bên dưới để đọc trực tiếp tệp đính kèm:
                      </p>
                      <button
                        type="button"
                        onClick={handleLoadAttachedPdf}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 shadow-xs"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Đọc &amp; Phân tích tệp Cau_hoi_chu_de_1-3.pdf</span>
                      </button>
                    </div>
                  ) : (
                    visiblePreviewQuestions.map((pq, pidx) => (
                      <div
                        key={pq.id}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5 relative"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                              #{pidx + 1}
                            </span>
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">
                              {pq.themeName}
                            </span>
                            {pq.lessonName && (
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                {pq.lessonName}
                              </span>
                            )}
                            {pq.imageUrl && (
                              <span className="inline-flex items-center space-x-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">
                                <ImageIcon className="w-3 h-3" />
                                <span>Đã gắn hình</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewImageTargetId(pq.id);
                                previewImageInputRef.current?.click();
                              }}
                              className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded flex items-center space-x-1 transition-colors"
                              title="Tải ảnh minh họa cho câu hỏi này"
                            >
                              <ImageIcon className="w-3 h-3" />
                              <span>{pq.imageUrl ? 'Đổi ảnh' : 'Thêm ảnh'}</span>
                            </button>
                            {pq.imageUrl && (
                              <button
                                type="button"
                                onClick={() => handleRemovePreviewImage(pq.id)}
                                className="text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-1.5 py-0.5 rounded"
                                title="Xóa ảnh khỏi câu hỏi này"
                              >
                                Xóa ảnh
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemovePreviewQuestion(pq.id)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded"
                              title="Bỏ câu này"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="font-bold text-slate-800 text-xs leading-relaxed whitespace-pre-line">
                          {pq.content}
                        </p>

                        {/* Hiển thị Hình ảnh minh họa ngay dưới câu hỏi giống trong PDF */}
                        {pq.imageUrl && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center space-y-1.5">
                            <img
                              src={pq.imageUrl}
                              alt={pq.imageCaption || 'Hình minh họa'}
                              className="max-h-36 w-auto object-contain rounded-lg bg-white p-1.5 border border-slate-200 shadow-2xs"
                            />
                            {pq.imageCaption && (
                              <span className="text-[11px] italic font-medium text-slate-600">
                                {pq.imageCaption}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
                          {pq.options.map((po) => {
                            const isCorrect = po.id === pq.correctOptionId;
                            return (
                              <button
                                key={po.id}
                                type="button"
                                onClick={() => handleTogglePreviewAnswer(pq.id, po.id)}
                                className={`p-2 rounded-lg border text-left flex items-start space-x-1.5 transition-colors ${
                                  isCorrect
                                    ? 'bg-emerald-50 border-emerald-400 font-bold text-emerald-950 ring-1 ring-emerald-400'
                                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                                }`}
                                title="Bấm để chọn làm đáp án đúng"
                              >
                                <span
                                  className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 ${
                                    isCorrect
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  {po.label}
                                </span>
                                <span className="flex-1 break-words">{po.content}</span>
                              </button>
                            );
                          })}
                        </div>

                        {pq.explanation && (
                          <div className="text-[11px] bg-slate-50 border border-slate-200 p-2 rounded-lg text-slate-600">
                            <strong className="text-slate-700">Hướng dẫn giải:</strong>{' '}
                            {pq.explanation}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 shrink-0">
              <div className="text-xs text-slate-500">
                {parsedPreview.length > 0 && (
                  <span>
                    Đã sẵn sàng đưa <strong>{parsedPreview.length}</strong> câu hỏi (gồm{' '}
                    <strong className="text-indigo-700">{totalPreviewImages} câu có hình ảnh</strong>)
                    vào <strong>{previewThemeBreakdown.length}</strong> chủ đề.
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPdfModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>

                {previewSelectedTheme !== 'all' && (
                  <button
                    type="button"
                    onClick={() => handleSaveImportedQuestions(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm"
                  >
                    Chỉ lưu {visiblePreviewQuestions.length} câu của {previewSelectedTheme.split(':')[0]}
                  </button>
                )}

                <button
                  type="button"
                  disabled={parsedPreview.length === 0}
                  onClick={() => handleSaveImportedQuestions(false)}
                  className={`text-white text-xs font-bold px-5 py-2.5 rounded-lg flex items-center space-x-1.5 shadow-sm ${
                    parsedPreview.length > 0
                      ? 'bg-indigo-600 hover:bg-indigo-500'
                      : 'bg-slate-300 cursor-not-allowed'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Lưu toàn bộ {parsedPreview.length} câu vào ngân hàng theo chủ đề</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
