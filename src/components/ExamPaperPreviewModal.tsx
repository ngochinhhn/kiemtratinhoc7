import React, { useState, useMemo, useEffect } from 'react';
import {
  Printer,
  X,
  CheckCircle2,
  Sliders,
  FileText,
  Eye,
  Shuffle,
  Check,
  Edit3,
  RotateCcw,
  Download,
  Loader2,
  FileDown,
} from 'lucide-react';
import { Exam, ExamHeaderConfig, Question } from '../types';
import {
  OptionLayoutMode,
  buildPrintableExamVariant,
  exportExamPaperToDocxA4,
  exportExamPaperToPdfA4,
  getAntiOrphanTextStyle,
  getDefaultExamHeaderConfig,
  getDefaultExamHeaderTitleByType,
  paginateExamQuestionsForA4,
  preventOrphanWords,
  printExamPaperViaA4Frame,
} from '../utils/examPaperFormatter';

interface ExamPaperPreviewModalProps {
  exam: Exam | null;
  questions: Question[];
  onClose: () => void;
  onSaveExamHeader: (examId: string, headerConfig: ExamHeaderConfig) => void;
  onOpenEditQuestions?: (exam: Exam) => void;
  initialOpenPrintDialog?: boolean;
}

const VARIANT_CODES = [
  { code: 'GOC', label: 'Đề gốc (Chuẩn)' },
  { code: '701', label: 'Mã đề 701 (Đảo ngẫu nhiên)' },
  { code: '702', label: 'Mã đề 702 (Đảo ngẫu nhiên)' },
  { code: '703', label: 'Mã đề 703 (Đảo ngẫu nhiên)' },
  { code: '704', label: 'Mã đề 704 (Đảo ngẫu nhiên)' },
];

export const ExamPaperPreviewModal: React.FC<ExamPaperPreviewModalProps> = ({
  exam,
  questions,
  onClose,
  onSaveExamHeader,
  onOpenEditQuestions,
  initialOpenPrintDialog = false,
}) => {
  const [headerConfig, setHeaderConfig] = useState<ExamHeaderConfig>(() =>
    getDefaultExamHeaderConfig(exam || undefined)
  );
  const [variantCode, setVariantCode] = useState<string>('GOC');
  const [showAnswers, setShowAnswers] = useState<boolean>(false);
  const [showExplanations, setShowExplanations] = useState<boolean>(false);
  const [showScoreBox, setShowScoreBox] = useState<boolean>(false);
  const [optionLayout, setOptionLayout] = useState<OptionLayoutMode>('auto');
  const [fontSizePt, setFontSizePt] = useState<'12pt' | '13pt' | '14pt'>('13pt');
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState<boolean>(true);
  const [savedToast, setSavedToast] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(initialOpenPrintDialog);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingDocx, setIsExportingDocx] = useState<boolean>(false);
  const [printStatusMessage, setPrintStatusMessage] = useState<string | null>(null);
  const [toolbarExportToast, setToolbarExportToast] = useState<string | null>(null);

  useEffect(() => {
    if (exam) {
      setHeaderConfig(getDefaultExamHeaderConfig(exam));
    }
  }, [exam]);

  useEffect(() => {
    setIsPrintModalOpen(initialOpenPrintDialog);
  }, [initialOpenPrintDialog]);

  const printableItems = useMemo(() => {
    if (!exam) return [];
    return buildPrintableExamVariant(exam, questions, variantCode, optionLayout, fontSizePt);
  }, [exam, questions, variantCode, optionLayout, fontSizePt]);

  const paginatedPages = useMemo(() => {
    if (!exam) return [];
    return paginateExamQuestionsForA4({
      examTitle: exam.title,
      durationMinutes: exam.durationMinutes,
      headerConfig,
      printableItems,
      variantCode,
      fontSizePt,
      showAnswers,
      showExplanations,
      showScoreBox,
    });
  }, [
    exam,
    headerConfig,
    printableItems,
    variantCode,
    fontSizePt,
    showAnswers,
    showExplanations,
    showScoreBox,
  ]);

  if (!exam) return null;

  const getRenderOptions = () => ({
    examTitle: exam.title,
    durationMinutes: exam.durationMinutes,
    headerConfig,
    printableItems,
    variantCode,
    fontSizePt,
    showAnswers,
    showExplanations,
    showScoreBox,
  });

  const handleSaveHeader = () => {
    onSaveExamHeader(exam.id, headerConfig);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  // Khi bấm nút "In đề": Lưu tiêu đề, mở hộp thoại chọn Máy in / Xuất PDF / Xuất DOCX
  const handleOpenPrintDialog = () => {
    onSaveExamHeader(exam.id, headerConfig);
    setPrintStatusMessage(null);
    setIsPrintModalOpen(true);
  };

  // Kết nối trực tiếp với máy in (hoặc Save as PDF của trình duyệt) qua khung in A4 độc lập
  const handleConnectPrinterAndPrint = () => {
    onSaveExamHeader(exam.id, headerConfig);
    setPrintStatusMessage(
      'Đang mở hộp thoại Kết nối máy in (Khổ giấy A4)... Bạn có thể chọn máy in đã kết nối hoặc chọn "Save as PDF / Lưu dưới dạng PDF".'
    );
    printExamPaperViaA4Frame(getRenderOptions());
  };

  // Xuất và tải trực tiếp file .PDF chuẩn khổ giấy A4 về máy tính (giữ nguyên bảng biểu Đúng/Sai & đánh số trang)
  const handleExportPdfFile = async () => {
    try {
      setIsExportingPdf(true);
      setPrintStatusMessage('Đang khởi tạo tệp PDF khổ giấy A4 chuẩn (có bảng Đúng/Sai & số trang)...');
      onSaveExamHeader(exam.id, headerConfig);
      const filename = await exportExamPaperToPdfA4(getRenderOptions());
      setIsExportingPdf(false);
      setPrintStatusMessage(`Đã xuất và tải xuống thành công tệp PDF: ${filename}`);
      setToolbarExportToast(`Đã tải xuống tệp PDF: ${filename}`);
      setTimeout(() => setToolbarExportToast(null), 4000);
    } catch (err: any) {
      setIsExportingPdf(false);
      setPrintStatusMessage(
        `Không thể tạo file PDF trực tiếp (${err?.message || 'Lỗi kết xuất'}), đang chuyển sang chế độ Lưu PDF của trình duyệt...`
      );
      printExamPaperViaA4Frame(getRenderOptions());
    }
  };

  // Xuất bản và tải trực tiếp file Microsoft Word (.docx) chuẩn khổ giấy A4 về máy tính
  const handleExportDocxFile = async () => {
    try {
      setIsExportingDocx(true);
      setPrintStatusMessage('Đang khởi tạo tệp Microsoft Word (.docx) khổ giấy A4...');
      onSaveExamHeader(exam.id, headerConfig);
      const filename = await exportExamPaperToDocxA4(getRenderOptions());
      setIsExportingDocx(false);
      setPrintStatusMessage(`Đã xuất bản và tải xuống thành công tệp Word (.docx): ${filename}`);
      setToolbarExportToast(`Đã tải xuống tệp Word (.docx): ${filename}`);
      setTimeout(() => setToolbarExportToast(null), 4000);
    } catch (err: any) {
      setIsExportingDocx(false);
      setPrintStatusMessage(`Lỗi khi xuất tệp .docx: ${err?.message || 'Không xác định'}`);
    }
  };

  const handleResetDefaultHeader = () => {
    setHeaderConfig({
      schoolName: 'TRƯỜNG THCS THUỴ LÂM',
      schoolYear: 'Năm học 2025-2026',
      examHeaderTitle: getDefaultExamHeaderTitleByType(exam.type),
      subjectHeader: 'MÔN: TOÁN TIN HỌC 7',
      durationText: `(Thời gian: ${exam.durationMinutes} phút)`,
      showUnderline: true,
      showStudentInfo: true,
      showAnswerGrid: false,
    });
  };

  const scrollToPage = (pageNum: number) => {
    const el = document.getElementById(`a4-page-sheet-${pageNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const fontSizeStyle =
    fontSizePt === '12pt'
      ? 'text-[15.5px] leading-[1.48]'
      : fontSizePt === '14pt'
        ? 'text-[18.5px] leading-[1.48]'
        : 'text-[17px] leading-[1.48]';

  const stemLineCharCapacity = fontSizePt === '12pt' ? 88 : fontSizePt === '14pt' ? 74 : 82;

  return (
    <div
      data-testid="exam-paper-preview-modal"
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/85 overflow-hidden"
    >
      {/* THANH CÔNG CỤ TRÊN CÙNG (ẨN KHI IN A4) */}
      <div className="no-print bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-bold text-sm sm:text-base text-slate-900">
                Trình bày đề kiểm tra trên khổ giấy A4
              </h2>
              <span
                data-testid="badge-total-pages"
                className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
              >
                Chuẩn A4 (210 × 297 mm) • {paginatedPages.length} trang
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Đề thi: <strong>{exam.title}</strong> • Tổng số:{' '}
              <strong>{printableItems.length} câu hỏi</strong> • Thời gian:{' '}
              <strong>{exam.durationMinutes} phút</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Nút bật/tắt bảng tùy chỉnh tiêu đề & bố cục */}
          <button
            type="button"
            onClick={() => setIsConfigPanelOpen(!isConfigPanelOpen)}
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 border transition-colors ${
              isConfigPanelOpen
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isConfigPanelOpen ? 'Ẩn khung tùy chỉnh' : 'Tùy chỉnh tiêu đề & khổ A4'}</span>
          </button>

          {/* Nút chuyển đổi Đề học sinh / Đáp án giáo viên */}
          <button
            type="button"
            onClick={() => setShowAnswers(!showAnswers)}
            data-testid="btn-toggle-answer-key"
            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center space-x-1.5 border transition-colors ${
              showAnswers
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showAnswers ? 'Đang xem: Bản kèm đáp án' : 'Xem bản kèm đáp án'}</span>
          </button>

          {/* Nút chỉnh sửa lại danh sách câu hỏi */}
          {onOpenEditQuestions && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenEditQuestions(exam);
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 flex items-center space-x-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Đổi câu hỏi</span>
            </button>
          )}

          {/* Nút lưu tiêu đề */}
          <button
            type="button"
            onClick={handleSaveHeader}
            data-testid="btn-save-header-config"
            className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 flex items-center space-x-1.5 transition-colors"
          >
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>{savedToast ? 'Đã lưu tiêu đề!' : 'Lưu tiêu đề'}</span>
          </button>

          {/* NÚT XUẤT BẢN / IN RA FILE .DOCX ĐỂ TẢI VỀ */}
          <button
            type="button"
            disabled={isExportingDocx}
            onClick={handleExportDocxFile}
            data-testid="btn-export-docx-toolbar"
            className="px-3.5 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white shadow-sm flex items-center space-x-1.5 transition-colors cursor-pointer"
            title="Xuất bản hoặc tải đề kiểm tra ra file Microsoft Word (.docx)"
          >
            {isExportingDocx ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            <span>Xuất file .docx</span>
          </button>

          {/* NÚT "In đề" (Kết nối với máy in hoặc in ra file PDF / DOCX) */}
          <button
            type="button"
            onClick={handleOpenPrintDialog}
            data-testid="btn-print-a4"
            className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>In đề</span>
          </button>

          {/* Nút đóng */}
          <button
            type="button"
            onClick={onClose}
            data-testid="btn-close-preview-modal"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Đóng cửa sổ xem đề"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Thông báo nhanh khi tải file .docx hoặc .pdf */}
      {toolbarExportToast && (
        <div
          data-testid="toolbar-export-toast"
          className="no-print bg-emerald-600 text-white text-xs font-bold px-4 py-2 flex items-center justify-center space-x-2 shadow-sm shrink-0"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toolbarExportToast}</span>
        </div>
      )}

      {/* THÂN MODAL: BẢNG TÙY CHỈNH BÊN TRÁI + CÁC TRANG GIẤY A4 CÓ ĐÁNH SỐ TRANG BÊN PHẢI */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* CỘT TRÁI: BẢNG CHỈNH SỬA TIÊU ĐỀ & TRÌNH BÀY ĐỀ (ẨN KHI IN A4) */}
        {isConfigPanelOpen && (
          <div className="no-print w-full lg:w-96 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-4 overflow-y-auto space-y-4 shrink-0 max-h-[38vh] lg:max-h-none">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                1. Tiêu đề đề kiểm tra (Theo mẫu chuẩn)
              </span>
              <button
                type="button"
                onClick={handleResetDefaultHeader}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1"
                title="Khôi phục tiêu đề mặc định theo mẫu"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Mặc định mẫu</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên trường (Góc trên bên trái)
                </label>
                <input
                  type="text"
                  data-testid="input-header-school"
                  value={headerConfig.schoolName}
                  onChange={(e) =>
                    setHeaderConfig({ ...headerConfig, schoolName: e.target.value })
                  }
                  placeholder="TRƯỜNG THCS THUỴ LÂM"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Năm học (Dưới tên trường)
                </label>
                <input
                  type="text"
                  data-testid="input-header-year"
                  value={headerConfig.schoolYear}
                  onChange={(e) =>
                    setHeaderConfig({ ...headerConfig, schoolYear: e.target.value })
                  }
                  placeholder="Năm học 2025-2026"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tiêu đề bài kiểm tra (Góc trên bên phải)
                </label>
                <input
                  type="text"
                  data-testid="input-header-title"
                  value={headerConfig.examHeaderTitle}
                  onChange={(e) =>
                    setHeaderConfig({ ...headerConfig, examHeaderTitle: e.target.value })
                  }
                  placeholder="ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold uppercase"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[
                    'ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I',
                    'ĐỀ KIỂM TRA ĐÁNH GIÁ CUỐI HỌC KÌ I',
                    'ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ II',
                    'ĐỀ KIỂM TRA THƯỜNG XUYÊN (15 PHÚT)',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setHeaderConfig({ ...headerConfig, examHeaderTitle: preset })
                      }
                      className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded border border-slate-200 transition-colors"
                    >
                      {preset.replace('ĐỀ KIỂM TRA ĐÁNH GIÁ ', '').replace('ĐỀ KIỂM TRA ', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên môn học
                </label>
                <input
                  type="text"
                  data-testid="input-header-subject"
                  value={headerConfig.subjectHeader}
                  onChange={(e) =>
                    setHeaderConfig({ ...headerConfig, subjectHeader: e.target.value })
                  }
                  placeholder="MÔN: TOÁN TIN HỌC 7"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold uppercase"
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setHeaderConfig({ ...headerConfig, subjectHeader: 'MÔN: TOÁN TIN HỌC 7' })
                    }
                    className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded border border-slate-200"
                  >
                    MÔN: TOÁN TIN HỌC 7
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setHeaderConfig({ ...headerConfig, subjectHeader: 'MÔN: TIN HỌC 7' })
                    }
                    className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded border border-slate-200"
                  >
                    MÔN: TIN HỌC 7
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Dòng thời gian làm bài
                </label>
                <input
                  type="text"
                  data-testid="input-header-duration"
                  value={headerConfig.durationText || ''}
                  onChange={(e) =>
                    setHeaderConfig({ ...headerConfig, durationText: e.target.value })
                  }
                  placeholder="(Thời gian: 45 phút)"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs italic"
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setHeaderConfig({
                        ...headerConfig,
                        durationText: `(Thời gian: ${exam.durationMinutes} phút)`,
                      })
                    }
                    className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-600 rounded border border-slate-200"
                  >
                    ({exam.durationMinutes} phút)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setHeaderConfig({
                        ...headerConfig,
                        durationText: '(Thời gian: ... phút)',
                      })
                    }
                    className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-600 rounded border border-slate-200"
                  >
                    (Thời gian: ... phút)
                  </button>
                </div>
              </div>
            </div>

            {/* PHẦN 2: MÃ ĐỀ & TRÌNH BÀY TRANG A4 */}
            <div className="border-t border-slate-200 pt-3 space-y-3 text-xs">
              <span className="font-bold text-xs text-slate-800 uppercase tracking-wider block">
                2. Trình bày trang A4 & Chọn mã đề in
              </span>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Chọn mã đề cần xem / in ra giấy A4
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {VARIANT_CODES.map((v) => (
                    <button
                      key={v.code}
                      type="button"
                      onClick={() => setVariantCode(v.code)}
                      className={`px-3 py-1.5 rounded-lg border text-left font-semibold flex items-center justify-between transition-colors ${
                        variantCode === v.code
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center space-x-1.5">
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>{v.label}</span>
                      </span>
                      {variantCode === v.code && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cỡ chữ in A4</label>
                  <select
                    value={fontSizePt}
                    onChange={(e) => setFontSizePt(e.target.value as '12pt' | '13pt' | '14pt')}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="12pt">12pt (Nhỏ gọn)</option>
                    <option value="13pt">13pt (Chuẩn Bộ GD)</option>
                    <option value="14pt">14pt (Chữ lớn rõ)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Chia cột đáp án A,B,C,D
                  </label>
                  <select
                    value={optionLayout}
                    onChange={(e) => setOptionLayout(e.target.value as OptionLayoutMode)}
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="auto">Tự động (Chống lẻ từ)</option>
                    <option value="4_col">4 cột (1 hàng ngang)</option>
                    <option value="2_col">2 cột (2 hàng)</option>
                    <option value="1_col">1 cột (4 dòng dọc)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={headerConfig.showUnderline !== false}
                    onChange={(e) =>
                      setHeaderConfig({ ...headerConfig, showUnderline: e.target.checked })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Hiển thị đường kẻ ngang dưới Năm học</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={headerConfig.showStudentInfo !== false}
                    onChange={(e) =>
                      setHeaderConfig({ ...headerConfig, showStudentInfo: e.target.checked })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Hiển thị dòng &ldquo;Họ và tên: ... Lớp: ...&rdquo;</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showScoreBox}
                    onChange={(e) => setShowScoreBox(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Bổ sung khung Điểm &amp; Lời phê của giáo viên</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(headerConfig.showAnswerGrid)}
                    onChange={(e) =>
                      setHeaderConfig({ ...headerConfig, showAnswerGrid: e.target.checked })
                    }
                    className="rounded text-blue-600"
                  />
                  <span>Bổ sung bảng phiếu điền đáp án trắc nghiệm</span>
                </label>

                {showAnswers && (
                  <label className="flex items-center space-x-2 cursor-pointer text-emerald-800 font-semibold">
                    <input
                      type="checkbox"
                      checked={showExplanations}
                      onChange={(e) => setShowExplanations(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>Hiển thị kèm hướng dẫn giải chi tiết</span>
                  </label>
                )}
              </div>

              {/* Khối hành động nhanh Kết nối máy in, Xuất PDF và Xuất Word (.docx) ở cột trái */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <button
                  type="button"
                  onClick={handleConnectPrinterAndPrint}
                  className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Kết nối máy in (In khổ A4)</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={handleExportPdfFile}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-lg shadow-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer"
                >
                  {isExportingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>In ra file PDF (.pdf)</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingDocx}
                  onClick={handleExportDocxFile}
                  data-testid="btn-export-docx-sidebar"
                  className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold rounded-lg shadow-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer"
                >
                  {isExportingDocx ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4" />
                  )}
                  <span>Xuất bản file Word (.docx)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CỘT PHẢI: KHUNG XEM TRƯỚC CÁC TRANG GIẤY A4 ĐƯỢC PHÂN TRANG & ĐÁNH SỐ TRANG */}
        <div
          id="a4-scroll-viewport"
          className="flex-1 overflow-y-auto bg-slate-300/85 p-4 sm:p-8 block"
        >
          {/* Thanh điều hướng phân trang & thông tin khổ giấy A4 phía trên */}
          <div className="no-print max-w-[210mm] mx-auto mb-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700 bg-white/95 px-4 py-2 rounded-xl border border-slate-300 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-800">
                Phân trang A4 tự động ({paginatedPages.length} trang):
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {paginatedPages.map((p) => (
                  <button
                    key={p.pageNumber}
                    type="button"
                    onClick={() => scrollToPage(p.pageNumber)}
                    data-testid={`btn-jump-page-${p.pageNumber}`}
                    className="px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold border border-blue-200 transition-colors cursor-pointer"
                  >
                    Trang {p.pageNumber}/{p.totalPages}
                  </button>
                ))}
              </div>
            </div>
            <span className="font-semibold text-slate-600">
              Times New Roman ({fontSizePt}) • Cân bằng dòng chống rơi từ lẻ
            </span>
          </div>

          {/* DANH SÁCH CÁC TỜ GIẤY A4 ĐÃ PHÂN TRANG */}
          <div id="a4-printable-exam-container" className="space-y-8 pb-8">
            {paginatedPages.map((page) => (
              <div key={page.pageNumber} className="space-y-1.5">
                {/* Nhãn phân trang phía trên mỗi tờ giấy A4 khi xem trước */}
                <div className="no-print max-w-[210mm] mx-auto flex items-center justify-between px-2 text-[11px] font-bold text-slate-600">
                  <span>
                    Tờ giấy A4 số {page.pageNumber} ({page.items.length} câu hỏi)
                  </span>
                  <span className="bg-slate-800 text-white px-2.5 py-0.5 rounded-md shadow-2xs">
                    Trang {page.pageNumber} / {page.totalPages}
                  </span>
                </div>

                <div
                  id={`a4-page-sheet-${page.pageNumber}`}
                  data-testid={
                    page.pageNumber === 1
                      ? 'a4-printable-sheet'
                      : `a4-printable-sheet-page-${page.pageNumber}`
                  }
                  style={{
                    fontFamily: '"Times New Roman", Times, Georgia, serif',
                  }}
                  className={`bg-white text-black shadow-[0_12px_36px_rgba(15,23,42,0.22)] border border-slate-300 w-full max-w-[210mm] min-h-[297mm] px-[18mm] sm:px-[20mm] py-[15mm] sm:py-[16mm] mx-auto box-border flex flex-col justify-between ${fontSizeStyle}`}
                >
                {/* PHẦN THÂN TRANG A4 */}
                <div className="flex-1">
                  {page.isFirstPage ? (
                    <>
                      {/* TIÊU ĐỀ 2 CỘT CHUẨN NHƯ HÌNH GỬI (DÙNG BẢNG CỐ ĐỊNH TỶ LỆ 44% - 56%) */}
                      <table className="w-full border-collapse mb-4">
                        <tbody>
                          <tr>
                            {/* Cột trái: TRƯỜNG THCS THUỴ LÂM / Năm học 2025-2026 / Đường gạch ngang */}
                            <td className="w-[44%] align-top text-center pr-2">
                              <div
                                data-testid="a4-header-school"
                                className="font-bold uppercase tracking-tight leading-snug"
                              >
                                {headerConfig.schoolName}
                              </div>
                              <div
                                data-testid="a4-header-year"
                                className="font-bold leading-snug mt-0.5"
                              >
                                {headerConfig.schoolYear}
                              </div>
                              {headerConfig.showUnderline !== false && (
                                <div className="w-36 max-w-[75%] mx-auto border-b-[1.5px] border-[#4472c4] print:border-black mt-2.5" />
                              )}
                            </td>

                            {/* Cột phải: ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I / MÔN: TOÁN TIN HỌC 7 / (Thời gian: ... phút) */}
                            <td className="w-[56%] align-top text-center pl-2">
                              <div
                                data-testid="a4-header-title"
                                className="font-bold uppercase tracking-tight leading-snug"
                              >
                                {headerConfig.examHeaderTitle}
                              </div>
                              <div
                                data-testid="a4-header-subject"
                                className="font-bold uppercase leading-snug mt-0.5"
                              >
                                {headerConfig.subjectHeader}
                              </div>
                              <div
                                data-testid="a4-header-duration"
                                className="font-bold italic leading-snug mt-0.5"
                              >
                                {headerConfig.durationText ||
                                  `(Thời gian: ${exam.durationMinutes} phút)`}
                              </div>
                              {variantCode !== 'GOC' && (
                                <div className="mt-1.5 inline-block border border-black px-2.5 py-0.5 text-[13.5px] font-bold">
                                  Mã đề: {variantCode}
                                </div>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {/* DÒNG HỌ VÀ TÊN & LỚP (NHƯ HÌNH GỬI, DÙNG DOT LEADER SẮC NÉT) */}
                      {headerConfig.showStudentInfo !== false && (
                        <div
                          data-testid="a4-student-info-row"
                          className="flex items-baseline justify-between gap-6 mb-4 pt-1"
                          style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '14.5px' }}
                        >
                          <div className="flex-[1.65] flex items-baseline min-w-0">
                            <span className="font-bold shrink-0 mr-1.5">Họ và tên:</span>
                            <span className="flex-1 border-b border-dotted border-black h-[0.9em]" />
                          </div>
                          <div className="flex-1 flex items-baseline min-w-0">
                            <span className="font-bold shrink-0 mr-1.5">Lớp:</span>
                            <span className="flex-1 border-b border-dotted border-black h-[0.9em]" />
                          </div>
                        </div>
                      )}

                      {/* KHUNG ĐIỂM & LỜI PHÊ CỦA GIÁO VIÊN (TÙY CHỌN) */}
                      {showScoreBox && (
                        <table className="w-full border-collapse border border-black mb-4 text-[14px] print-avoid-break">
                          <thead>
                            <tr className="bg-slate-50 print:bg-transparent">
                              <th className="border border-black py-1 px-2 w-[28%] text-center font-bold">
                                ĐIỂM
                              </th>
                              <th className="border border-black py-1 px-2 text-center font-bold">
                                LỜI PHÊ CỦA THẦY, CÔ GIÁO
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="border border-black h-14" />
                              <td className="border border-black h-14" />
                            </tr>
                          </tbody>
                        </table>
                      )}

                      {/* BẢNG PHIẾU TRẢ LỜI TRẮC NGHIỆM (TÙY CHỌN) */}
                      {headerConfig.showAnswerGrid && printableItems.length > 0 && (
                        <div className="mb-4 print-avoid-break">
                          <div className="font-bold text-[14px] mb-1">
                            PHIẾU TRẢ LỜI TRẮC NGHIỆM:
                          </div>
                          <div className="grid grid-cols-5 sm:grid-cols-10 border-t border-l border-black text-center text-[12.5px]">
                            {printableItems.map((item) => (
                              <div
                                key={`grid_${item.index}`}
                                className="border-r border-b border-black"
                              >
                                <div className="font-bold border-b border-black bg-slate-50 py-0.5">
                                  Câu {item.index}
                                </div>
                                <div className="min-h-6 px-1 py-0.5 flex items-center justify-center font-bold text-emerald-700 print:text-black text-[11px] leading-tight">
                                  {showAnswers ? item.correctLabel : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* TIÊU ĐỀ PHỤ TRÊN CÁC TRANG TIẾP THEO (TRANG 2, 3...) */
                    <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-4 text-[13.5px] italic text-slate-700">
                      <span>
                        {headerConfig.examHeaderTitle} — {headerConfig.subjectHeader}
                      </span>
                      <span className="font-semibold not-italic">
                        {variantCode === 'GOC' ? 'Đề gốc' : `Mã đề: ${variantCode}`} • Trang{' '}
                        {page.pageNumber}/{page.totalPages}
                      </span>
                    </div>
                  )}

                  {/* PHẦN NỘI DUNG CÂU HỎI TRÊN TRANG HIỆN TẠI */}
                  <div className="space-y-4">
                    {page.items.map((item) => {
                      const gridColsClass =
                        item.recommendedColumns === 4
                          ? 'grid-cols-2 sm:grid-cols-4 print:grid-cols-4'
                          : item.recommendedColumns === 2
                            ? 'grid-cols-1 sm:grid-cols-2 print:grid-cols-2'
                            : 'grid-cols-1';

                      const stemAntiOrphanStyle = getAntiOrphanTextStyle(
                        `Câu ${item.index}. ${item.stem}`,
                        stemLineCharCapacity
                      );

                      return (
                        <div
                          key={item.questionId}
                          data-testid={`a4-question-${item.index}`}
                          className="print-avoid-break space-y-1.5"
                        >
                          {/* Dòng nội dung câu hỏi (tự động gắn non-breaking space & cân chỉnh chống rơi 1 từ xuống dòng) */}
                          <div
                            className="text-justify"
                            style={{
                              textWrap: 'pretty' as any,
                              ...stemAntiOrphanStyle,
                            }}
                          >
                            <span className="font-bold">Câu {item.index}. </span>
                            {item.questionType === 'true_false' && (
                              <span className="italic font-normal text-[0.94em] mr-1">
                                (Trắc nghiệm Đúng/Sai)
                              </span>
                            )}
                            {item.questionType === 'matching' && (
                              <span className="italic font-normal text-[0.94em] mr-1">
                                (Trắc nghiệm Ghép đôi)
                              </span>
                            )}
                            <span className="font-bold">{preventOrphanWords(item.stem)}</span>
                          </div>

                          {/* Hình ảnh minh họa của câu hỏi (nếu có) */}
                          {item.imageUrl && (
                            <div className="my-2 flex flex-col items-center justify-center">
                              <img
                                src={item.imageUrl}
                                alt={item.imageCaption || `Hình minh họa câu ${item.index}`}
                                className="max-h-40 w-auto object-contain"
                              />
                              {item.imageCaption &&
                                !item.imageUrl.includes('hinh_1_1') &&
                                !item.imageUrl.includes('hinh_1_2') && (
                                  <div className="italic text-[14px] mt-1 text-center">
                                    {preventOrphanWords(item.imageCaption)}
                                  </div>
                                )}
                            </div>
                          )}

                          {/* DẠNG 2: ĐÚNG / SAI (CẤU TRÚC MỚI BỘ GD&ĐT GỒM CÁC Ý a, b, c, d TRONG BẢNG BIỂU) */}
                          {item.questionType === 'true_false' &&
                          item.statements &&
                          item.statements.length > 0 ? (
                            <div className="pl-1 pt-0.5">
                              <table className="w-full border-collapse border border-black text-[0.94em]">
                                <thead>
                                  <tr className="bg-slate-50 print:bg-transparent">
                                    <th className="border border-black py-1 px-2.5 text-left font-bold">
                                      Phát biểu nhận định
                                    </th>
                                    <th className="border border-black py-1 px-2 w-16 text-center font-bold">
                                      Đúng
                                    </th>
                                    <th className="border border-black py-1 px-2 w-16 text-center font-bold">
                                      Sai
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.statements.map((st) => (
                                    <tr key={st.id}>
                                      <td
                                        className="border border-black py-1 px-2.5 text-justify"
                                        style={{ textWrap: 'pretty' as any }}
                                      >
                                        <span className="font-bold mr-1">{st.label})</span>
                                        <span>{preventOrphanWords(st.content)}</span>
                                      </td>
                                      <td className="border border-black py-1 px-2 text-center font-bold text-emerald-800 print:text-black">
                                        {showAnswers && st.isTrue ? '✓ Đúng' : '☐'}
                                      </td>
                                      <td className="border border-black py-1 px-2 text-center font-bold text-red-700 print:text-black">
                                        {showAnswers && !st.isTrue ? '✓ Sai' : '☐'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : item.questionType === 'matching' &&
                            item.matchingRows &&
                            item.matchingRows.length > 0 ? (
                            /* DẠNG 3: GHÉP ĐÔI (NỐI CỘT A VỚI CỘT B) */
                            <div className="pl-1 pt-0.5 space-y-1.5">
                              <table className="w-full border-collapse border border-black text-[0.94em]">
                                <thead>
                                  <tr className="bg-slate-50 print:bg-transparent">
                                    <th className="border border-black py-1 px-2.5 w-[46%] text-left font-bold">
                                      Cột A
                                    </th>
                                    <th className="border border-black py-1 px-2.5 w-[54%] text-left font-bold">
                                      Cột B
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.matchingRows.map((row) => (
                                    <tr key={row.leftId}>
                                      <td
                                        className="border border-black py-1 px-2.5 align-top"
                                        style={{ textWrap: 'pretty' as any }}
                                      >
                                        <span className="font-bold mr-1">{row.leftLabel}.</span>
                                        <span>{preventOrphanWords(row.leftContent)}</span>
                                      </td>
                                      <td
                                        className="border border-black py-1 px-2.5 align-top"
                                        style={{ textWrap: 'pretty' as any }}
                                      >
                                        <span className="font-bold mr-1">{row.rightLabel}.</span>
                                        <span>{preventOrphanWords(row.rightContent)}</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="text-[0.94em] pl-1 pt-0.5">
                                <span className="font-bold mr-2">Trả lời ghép đôi:</span>
                                {item.matchingRows.map((row, rIdx) => (
                                  <span key={row.leftId} className="inline-block mr-5">
                                    <span className="font-bold">{row.leftLabel}</span>
                                    <span> nối với </span>
                                    {showAnswers ? (
                                      <span className="font-bold underline text-emerald-800 print:text-black">
                                        {row.correctRightLabel}
                                      </span>
                                    ) : (
                                      <span>.........</span>
                                    )}
                                    {rIdx < item.matchingRows!.length - 1 ? ';' : '.'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            /* DẠNG 1: NHIỀU LỰA CHỌN (4 PHƯƠNG ÁN A, B, C, D) */
                            <div className={`grid ${gridColsClass} gap-x-5 gap-y-1 pl-2 pt-0.5`}>
                              {item.options.map((opt) => {
                                const highlightCorrect = showAnswers && opt.isCorrect;
                                return (
                                  <div
                                    key={opt.id}
                                    style={{ textWrap: 'pretty' as any }}
                                    className={`flex items-baseline space-x-1.5 ${
                                      highlightCorrect
                                        ? 'font-bold underline text-emerald-800 print:text-black'
                                        : ''
                                    }`}
                                  >
                                    <span
                                      className={`font-bold shrink-0 ${
                                        highlightCorrect
                                          ? 'inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-emerald-700 print:border-black text-center leading-none'
                                          : ''
                                      }`}
                                    >
                                      {opt.label}.
                                    </span>
                                    <span>{preventOrphanWords(opt.content)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Hướng dẫn giải (khi bật xem đáp án + giải thích) */}
                          {showAnswers && showExplanations && item.explanation && (
                            <div
                              style={{ textWrap: 'pretty' as any }}
                              className="pl-2 pt-1 text-[14px] italic text-slate-700 print:text-black"
                            >
                              <strong>• Đáp án: {item.correctLabel}.</strong>{' '}
                              <span>Hướng dẫn giải: {preventOrphanWords(item.explanation)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* KẾT THÚC ĐỀ THI */}
                  {page.showEndMark && (
                    <div className="mt-6 pt-2 text-center print-avoid-break">
                      <div className="font-bold tracking-widest text-[15px]">--- HẾT ---</div>
                      <div className="italic text-[13.5px] mt-0.5">
                        (Học sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm)
                      </div>
                    </div>
                  )}

                  {/* BẢNG ĐÁP ÁN TỔNG HỢP DÀNH CHO GIÁO VIÊN (KHI BẬT CHẾ ĐỘ XEM ĐÁP ÁN) */}
                  {page.showTeacherKey && showAnswers && printableItems.length > 0 && (
                    <div className="mt-6 pt-3 border-t-2 border-dashed border-slate-400 print-avoid-break">
                      <div className="font-bold text-center uppercase mb-2">
                        BẢNG ĐÁP ÁN CHẤM ĐIỂM (
                        {variantCode === 'GOC' ? 'ĐỀ GỐC' : `MÃ ĐỀ ${variantCode}`})
                      </div>
                      <div className="grid grid-cols-5 sm:grid-cols-10 border-t border-l border-black text-center text-[12.5px]">
                        {printableItems.map((item) => (
                          <div key={`ans_${item.index}`} className="border-r border-b border-black">
                            <div className="font-bold border-b border-black bg-slate-100 py-0.5">
                              Câu {item.index}
                            </div>
                            <div className="py-1 px-1 font-bold text-emerald-800 print:text-black text-[11px] leading-tight">
                              {item.correctLabel}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* CHÂN TRANG (FOOTER) & ĐÁNH SỐ TRANG TRÊN MỖI TỜ GIẤY A4 */}
                <div
                  data-testid={`a4-page-footer-${page.pageNumber}`}
                  className="mt-6 pt-2 border-t border-slate-400 print:border-black flex items-center justify-between text-[13px] text-slate-700 print:text-black shrink-0"
                >
                  <span>
                    {headerConfig.schoolName} •{' '}
                    {variantCode === 'GOC' ? 'Đề gốc' : `Mã đề ${variantCode}`}
                  </span>
                  <span className="font-bold">
                    Trang {page.pageNumber} / {page.totalPages}
                  </span>
                </div>
              </div>
            </div>
            ))}
          </div>
        </div>
      </div>

      {/* HỘP THOẠI TÙY CHỌN KẾT NỐI MÁY IN, IN RA FILE PDF HOẶC XUẤT FILE .DOCX */}
      {isPrintModalOpen && (
        <div
          data-testid="print-pdf-options-modal"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    In đề &amp; Xuất bản đề kiểm tra (Khổ giấy chuẩn A4)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kết nối với máy in vật lý, xuất tệp PDF (giữ nguyên bảng biểu Đúng/Sai) hoặc tải tệp Word (.docx)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thông tin tóm tắt bản in A4 */}
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tên đề kiểm tra:</span>
                <span className="font-bold text-slate-800">{exam.title}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Mã đề &amp; Phân trang:</span>
                <span className="font-bold text-blue-700">
                  {variantCode === 'GOC' ? 'Đề gốc' : `Mã đề ${variantCode}`} •{' '}
                  {printableItems.length} câu hỏi • {paginatedPages.length} trang A4
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Định dạng trình bày:</span>
                <span className="font-semibold text-slate-700">
                  Khổ A4 dọc • Đánh số trang tự động • Bảng biểu Đúng/Sai chuẩn
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Chế độ đáp án:</span>
                <span className="font-semibold text-slate-700">
                  {showAnswers ? 'Bản kèm đáp án giáo viên' : 'Bản đề thi phát cho học sinh'}
                </span>
              </div>
            </div>

            {printStatusMessage && (
              <div
                data-testid="print-status-banner"
                className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 text-xs flex items-start space-x-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-semibold break-all min-w-0">{printStatusMessage}</span>
              </div>
            )}

            {/* Ba lựa chọn chính: 1. Kết nối máy in | 2. In ra file PDF | 3. Xuất file .docx */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <button
                type="button"
                data-testid="btn-connect-printer"
                onClick={handleConnectPrinterAndPrint}
                className="p-4 rounded-xl border-2 border-blue-600 bg-blue-600 hover:bg-blue-500 text-white text-left space-y-2 shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                    <Printer className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                    Máy in USB / LAN
                  </span>
                </div>
                <div className="font-bold text-sm">Kết nối với máy in</div>
                <p className="text-[11px] text-blue-100 leading-snug">
                  Mở hộp thoại kết nối máy in để in trực tiếp đề thi trên khổ giấy A4
                </p>
              </button>

              <button
                type="button"
                data-testid="btn-export-pdf-a4"
                disabled={isExportingPdf}
                onClick={handleExportPdfFile}
                className="p-4 rounded-xl border-2 border-emerald-600 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-left space-y-2 shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                    {isExportingPdf ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <Download className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                    Tệp .PDF chuẩn A4
                  </span>
                </div>
                <div className="font-bold text-sm">
                  {isExportingPdf ? 'Đang xuất file PDF...' : 'In ra file PDF'}
                </div>
                <p className="text-[11px] text-emerald-100 leading-snug">
                  Tải tệp .PDF khổ A4 giữ nguyên bảng biểu Đúng/Sai và đánh số trang
                </p>
              </button>

              <button
                type="button"
                data-testid="btn-export-docx-modal"
                disabled={isExportingDocx}
                onClick={handleExportDocxFile}
                className="p-4 rounded-xl border-2 border-indigo-600 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-left space-y-2 shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                    {isExportingDocx ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <FileDown className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                    Microsoft Word
                  </span>
                </div>
                <div className="font-bold text-sm">
                  {isExportingDocx ? 'Đang xuất .docx...' : 'Xuất file .docx'}
                </div>
                <p className="text-[11px] text-indigo-100 leading-snug">
                  Tải tệp Word (.docx) chuẩn A4 để lưu trữ, chỉnh sửa hoặc in ấn
                </p>
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>
                Mẹo: Cả tệp <strong>.PDF</strong> và <strong>.DOCX</strong> đều giữ nguyên bảng biểu Đúng/Sai, chống rơi từ lẻ và có đánh số trang tự động.
              </span>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 shrink-0 ml-2"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
