import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  FileDown,
  Users,
  Award,
  TrendingUp,
  TrendingDown,
  Filter,
  ExternalLink,
  Copy,
  Check,
  FileSpreadsheet,
  RotateCcw,
  AlertTriangle,
  Printer,
  X,
} from 'lucide-react';
import {
  Exam,
  ExamResultSummary,
  Question,
  Student,
  StudentExamPaper,
  StudentExamSession,
} from '../types';
import { calculateExamResultSummary } from '../utils/grading';
import {
  buildExamReportSheetData,
  copyTextToClipboardSync,
  exportExamResultsExcel,
  ExportedExcelResult,
} from '../utils/excelExport';

interface ResultsViewProps {
  exam: Exam | null;
  exams: Exam[];
  students: Student[];
  papers: Record<string, StudentExamPaper>;
  sessions: Record<string, StudentExamSession>;
  questions: Question[];
  onSelectExam: (examId: string) => void;
  onAllowRetake?: (examId: string, studentIds: string[]) => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  exam,
  exams,
  students,
  papers,
  sessions,
  questions,
  onSelectExam,
  onAllowRetake,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [exportClassTarget, setExportClassTarget] = useState<string>('all');
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [lastExportedReport, setLastExportedReport] = useState<ExportedExcelResult | null>(null);
  const [copiedToSheetsClipboard, setCopiedToSheetsClipboard] = useState<boolean>(false);
  const [isGoogleSheetModalOpen, setIsGoogleSheetModalOpen] = useState<boolean>(false);
  const [activeSheetTab, setActiveSheetTab] = useState<'sheet1' | 'sheet2' | 'sheet3'>('sheet1');
  const [retakeNotification, setRetakeNotification] = useState<string | null>(null);
  const [exportStatusBanner, setExportStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Khi đổi kỳ thi, đặt lại bộ lọc lớp về mặc định "Tất cả các lớp" ('all')
  useEffect(() => {
    setSelectedClassFilter('all');
    setExportClassTarget('all');
    setSelectedStudentId(null);
    setLastExportedReport(null);
    setExportStatusBanner(null);
    setRetakeNotification(null);
  }, [exam?.id]);

  if (!exam) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-slate-200">
        <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-700">Chưa chọn bài kiểm tra</h3>
        <p className="text-xs text-slate-500 mt-1">
          Chọn một bài kiểm tra trong danh sách để xem bảng điểm và thống kê.
        </p>
      </div>
    );
  }

  // Hợp nhất danh sách các session của bài thi này với danh sách học sinh thuộc lớp dự thi (và điểm lưu trong student.examScores)
  const existingSessionsMap = new Map<string, StudentExamSession>();
  Object.values(sessions).forEach((s) => {
    if (s && s.examId === exam.id) {
      existingSessionsMap.set(s.studentId, s);
    }
  });

  const allEligibleStudents = students.filter(
    (st) =>
      exam.classes.includes(st.className) ||
      existingSessionsMap.has(st.id) ||
      st.examScores?.[exam.id] !== undefined
  );

  // Danh sách các lớp tham gia kỳ thi
  const availableExamClasses = Array.from(
    new Set([
      ...exam.classes,
      ...allEligibleStudents.map((st) => st.className).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b, 'vi'));

  const studentMap = new Map(students.map((s) => [s.id, s]));

  // Hàm tạo danh sách phiên thi từ danh sách học sinh mục tiêu
  const buildSessionsForStudents = (targetStudents: Student[]): StudentExamSession[] =>
    targetStudents.map((st, idx) => {
      const existing = existingSessionsMap.get(st.id);
      const savedRecord = st.examScores?.[exam.id];

      // Nếu học sinh đã được cấp quyền Thi lại lần 2 (retakeGrantedAt) và chưa nộp bài lần 2,
      // giữ nguyên trạng thái phiên thi lại (không lấy lại điểm cũ < 5.0 từ savedRecord trước đó)
      if (existing) {
        const isRetakeWaiting =
          Boolean(existing.retakeGrantedAt) &&
          existing.status !== 'da_nop_bai' &&
          (!savedRecord?.submittedAt ||
            String(savedRecord.submittedAt) < String(existing.retakeGrantedAt));

        if (!isRetakeWaiting && existing.status !== 'da_nop_bai' && savedRecord?.score !== undefined) {
          return {
            ...existing,
            status: 'da_nop_bai',
            score: savedRecord.score,
            correctCount: savedRecord.correctCount ?? existing.correctCount ?? 0,
            wrongCount: savedRecord.wrongCount ?? existing.wrongCount ?? 0,
            unansweredCount: savedRecord.unansweredCount ?? existing.unansweredCount ?? 0,
            submittedAt: savedRecord.submittedAt || existing.submittedAt,
          };
        }
        return existing;
      }

      if (savedRecord) {
        return {
          id: `sess_${st.id}_${exam.id}`,
          examId: exam.id,
          studentId: st.id,
          paperCode: savedRecord.paperCode || `MD7${String((idx % 24) + 1).padStart(2, '0')}`,
          status: 'da_nop_bai',
          timeRemainingSeconds: 0,
          answers: {},
          score: savedRecord.score,
          correctCount: savedRecord.correctCount ?? 0,
          wrongCount: savedRecord.wrongCount ?? 0,
          unansweredCount: savedRecord.unansweredCount ?? 0,
          submittedAt: savedRecord.submittedAt,
          attemptCount: savedRecord.attemptCount || 1,
          previousScore: savedRecord.previousScore,
          lastHeartbeat: savedRecord.submittedAt || new Date().toISOString(),
        };
      }

      const paper = papers[`${st.id}_${exam.id}`];
      return {
        id: `sess_${st.id}_${exam.id}`,
        examId: exam.id,
        studentId: st.id,
        paperCode: paper?.paperCode || `MD7${String((idx % 24) + 1).padStart(2, '0')}`,
        status: 'chua_dang_nhap',
        timeRemainingSeconds: exam.durationMinutes * 60,
        answers: {},
        lastHeartbeat: new Date().toISOString(),
      };
    });

  // Lọc học sinh theo lớp đang chọn xem thống kê (mặc định: 'all' = tất cả các lớp)
  const filteredEligibleStudents =
    selectedClassFilter === 'all'
      ? allEligibleStudents
      : allEligibleStudents.filter((st) => st.className === selectedClassFilter);

  const examSessions: StudentExamSession[] = buildSessionsForStudents(filteredEligibleStudents);
  const examQuestions = questions.filter((q) => exam.questionIds.includes(q.id));

  const activeClassDisplayLabel =
    selectedClassFilter === 'all'
      ? availableExamClasses.join(', ')
      : selectedClassFilter;

  // Tính toán chỉ số thống kê tổng hợp theo lớp đang chọn (hoặc tất cả các lớp)
  const summary: ExamResultSummary = calculateExamResultSummary(
    exam.id,
    exam.title,
    activeClassDisplayLabel,
    examSessions,
    examQuestions
  );

  // Danh sách học sinh đã nộp bài có điểm < 5.0 (cần thi lại lần 2) trong phạm vi lớp đang xem
  const weakSubmittedSessions = examSessions.filter(
    (s) => s.score !== undefined && s.score < 5.0
  );

  // Chuẩn bị sẵn dữ liệu 3 Sheet đồng bộ theo lớp đang chọn trong ô "Phạm vi xuất"
  // để khi bấm "Liên kết trực tiếp sang Google Sheet", dữ liệu được chép tức thì vào Clipboard mà không bị chặn bởi iframe
  const exportTargetStudents = useMemo(
    () =>
      exportClassTarget === 'all'
        ? allEligibleStudents
        : allEligibleStudents.filter((st) => st.className === exportClassTarget),
    [exportClassTarget, allEligibleStudents]
  );

  const exportTargetSessions = useMemo(
    () => buildSessionsForStudents(exportTargetStudents),
    [exportTargetStudents, sessions, papers, exam.id]
  );

  const exportTargetSummary = useMemo(() => {
    const clsLabel =
      exportClassTarget === 'all' ? availableExamClasses.join(', ') : exportClassTarget;
    return calculateExamResultSummary(
      exam.id,
      exam.title,
      clsLabel,
      exportTargetSessions,
      examQuestions
    );
  }, [exam.id, exam.title, exportClassTarget, availableExamClasses, exportTargetSessions, examQuestions]);

  const liveSheetData = useMemo(
    () =>
      buildExamReportSheetData(
        exam.title,
        exportTargetSummary,
        exportTargetSessions,
        students,
        papers,
        questions,
        exportClassTarget
      ),
    [
      exam.title,
      exportTargetSummary,
      exportTargetSessions,
      students,
      papers,
      questions,
      exportClassTarget,
    ]
  );

  // Xử lý khi bấm "Mở trực tiếp với Google Sheet" (Hoạt động đồng bộ trong sự kiện click của thẻ <a>)
  const handleDirectGoogleSheetsClick = () => {
    const ok = copyTextToClipboardSync(liveSheetData.tsvAll);
    setCopiedToSheetsClipboard(ok);
    setIsGoogleSheetModalOpen(true);
    const scopeDesc =
      exportClassTarget === 'all'
        ? `Tất cả các lớp (${availableExamClasses.join(', ')})`
        : `Lớp ${exportClassTarget}`;
    setExportStatusBanner({
      type: 'success',
      message: `Đã sao chép toàn bộ bảng điểm (${scopeDesc} - ${exportTargetSessions.length} học sinh) và mở liên kết Google Sheet! Tại tab Google Sheet vừa mở, Thầy/Cô chỉ cần nhấn Ctrl + V để dán ngay bảng điểm.`,
    });
  };

  // Mở bảng tính Google Sheet trực tuyến ngay trên màn hình + tạo file Excel
  const handleExportExcel = async (overrideClassTarget?: string) => {
    const targetCls = overrideClassTarget ?? exportClassTarget;
    try {
      setIsExportingExcel(true);
      setExportStatusBanner(null);

      // Sao chép ngay lập tức dữ liệu TSV vào clipboard trong luồng sự kiện click của người dùng
      const syncCopied = copyTextToClipboardSync(liveSheetData.tsvAll);
      setCopiedToSheetsClipboard(syncCopied);
      setIsGoogleSheetModalOpen(true);

      const exportStudents =
        targetCls === 'all'
          ? allEligibleStudents
          : allEligibleStudents.filter((st) => st.className === targetCls);
      const exportSessions = buildSessionsForStudents(exportStudents);
      const exportClassLabel =
        targetCls === 'all' ? availableExamClasses.join(', ') : targetCls;
      const exportSummary = calculateExamResultSummary(
        exam.id,
        exam.title,
        exportClassLabel,
        exportSessions,
        examQuestions
      );

      const result = await exportExamResultsExcel(
        exam.title,
        exportSummary,
        exportSessions,
        students,
        papers,
        questions,
        targetCls
      );

      setLastExportedReport(result);

      const scopeDesc =
        targetCls === 'all'
          ? `Tất cả các lớp (${availableExamClasses.join(', ')})`
          : `Lớp ${targetCls}`;

      setExportStatusBanner({
        type: 'success',
        message: `Đã chuẩn bị xong Báo cáo Bảng điểm (${scopeDesc} - ${exportSessions.length} học sinh)! Bấm "Mở trực tiếp với Google Sheet" bên dưới (và nhấn Ctrl + V trong Google Sheet) để làm việc ngay trên Google Sheet.`,
      });
    } catch (err: any) {
      console.error('Lỗi khi xuất báo cáo:', err);
      setExportStatusBanner({
        type: 'error',
        message: `Không thể tạo báo cáo: ${err?.message || 'Lỗi không xác định'}`,
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Cấp quyền thi lại lần 2 cho 1 học sinh hoặc tất cả học sinh có điểm < 5.0
  const triggerStudentRetake = (targetStudentIds: string[], description: string) => {
    if (!onAllowRetake || targetStudentIds.length === 0) return;
    onAllowRetake(exam.id, targetStudentIds);
    if (selectedStudentId && targetStudentIds.includes(selectedStudentId)) {
      setSelectedStudentId(null);
    }
    const msg = `Đã mở quyền Thi lại (Lần 2) cho ${description}! Học sinh có thể đăng nhập bằng mã học sinh của mình để làm lại bài thi ngay.`;
    setRetakeNotification(msg);
    setTimeout(() => {
      setRetakeNotification((prev) => (prev === msg ? null : prev));
    }, 7000);
  };

  // Chi tiết bài làm của học sinh đang được chọn xem
  const activeDetailStudent = selectedStudentId ? studentMap.get(selectedStudentId) : null;
  const activeDetailSession = selectedStudentId
    ? examSessions.find((s) => s.studentId === selectedStudentId) ||
      sessions[`${selectedStudentId}_${exam.id}`]
    : null;
  const activeDetailPaper = selectedStudentId
    ? papers[`${selectedStudentId}_${exam.id}`]
    : null;

  return (
    <div className="space-y-6">
      {/* THÔNG BÁO ĐÃ CẤP QUYỀN THI LẠI LẦN 2 CHO HỌC SINH ĐIỂM < 5.0 */}
      {retakeNotification && (
        <div
          data-testid="retake-granted-banner"
          className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs font-bold flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center space-x-2.5">
            <RotateCcw className="w-5 h-5 text-amber-600 shrink-0" />
            <span>{retakeNotification}</span>
          </div>
          <button
            type="button"
            onClick={() => setRetakeNotification(null)}
            className="text-amber-700 hover:text-amber-950 px-2 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {exportStatusBanner && (
        <div
          data-testid="excel-export-status-banner"
          className={`p-4 rounded-xl border text-xs space-y-3 ${
            exportStatusBanner.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start space-x-2.5">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-sm">{exportStatusBanner.message}</p>
                {exportStatusBanner.type === 'success' && (
                  <p className="text-[11px] text-emerald-800">
                    • <strong>Cách mở trong Google Sheet nhanh nhất:</strong> Nhấp nút{' '}
                    <strong>&ldquo;Mở trực tiếp với Google Sheet&rdquo;</strong> bên dưới, trang tính Google Sheet mới sẽ mở ra ở tab mới và toàn bộ bảng điểm đã được chép sẵn — chỉ cần nhấn{' '}
                    <kbd className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded font-mono font-bold">
                      Ctrl + V
                    </kbd>{' '}
                    để dán ngay bảng điểm!
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExportStatusBanner(null)}
              className="text-slate-400 hover:text-slate-600 px-2 font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          {exportStatusBanner.type === 'success' && (
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-emerald-200/80">
              <a
                href="https://docs.google.com/spreadsheets/create"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="btn-open-google-sheets"
                onClick={handleDirectGoogleSheetsClick}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Mở trực tiếp với Google Sheet (Nhấn Ctrl+V để dán)</span>
              </a>

              <button
                type="button"
                data-testid="btn-open-live-sheet-modal"
                onClick={() => setIsGoogleSheetModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3.5 py-2 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Xem Bảng tính Báo cáo (3 Sheet) trên màn hình</span>
              </button>

              <button
                type="button"
                data-testid="btn-copy-sheets-data"
                onClick={() => {
                  const ok = copyTextToClipboardSync(liveSheetData.tsvAll);
                  setCopiedToSheetsClipboard(ok);
                }}
                className="bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                {copiedToSheetsClipboard ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Đã sao chép bảng điểm (Sẵn sàng Ctrl+V vào Google Sheet)</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Sao chép bảng điểm cho Google Sheet</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tiêu đề & Chọn bài kiểm tra & Lọc lớp & Liên kết trực tiếp Google Sheet */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-800">
              Bảng điểm &amp; Thống kê kết quả kiểm tra
            </h1>

            <div className="flex flex-wrap items-center gap-3">
              {/* Chọn bài kiểm tra */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-600">Bài kiểm tra:</span>
                <select
                  data-testid="select-results-exam"
                  value={exam.id}
                  onChange={(e) => onSelectExam(e.target.value)}
                  className="py-1.5 px-3 text-xs font-bold text-blue-900 border border-slate-300 rounded-lg bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {exams.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({e.classes.join(', ')})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ô chọn lớp để xem thống kê (mặc định: Xem tất cả các lớp) */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-600 flex items-center space-x-1">
                  <Filter className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Xem thống kê lớp:</span>
                </span>
                <select
                  data-testid="select-results-class-filter"
                  value={selectedClassFilter}
                  onChange={(e) => {
                    const nextClass = e.target.value;
                    setSelectedClassFilter(nextClass);
                    setExportClassTarget(nextClass);
                    setSelectedStudentId(null);
                  }}
                  className="py-1.5 px-3 text-xs font-bold text-indigo-900 border border-indigo-300 rounded-lg bg-indigo-50/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">
                    Tất cả các lớp ({availableExamClasses.join(', ') || 'Toàn trường'}) -{' '}
                    {allEligibleStudents.length} HS
                  </option>
                  {availableExamClasses.map((cls) => {
                    const countInCls = allEligibleStudents.filter(
                      (st) => st.className === cls
                    ).length;
                    return (
                      <option key={cls} value={cls}>
                        Lớp {cls} ({countInCls} học sinh)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Khu vực chọn lớp cần xuất & Liên kết trực tiếp sang Google Sheet */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] font-bold text-slate-600 pl-1">Phạm vi xuất:</span>
              <select
                data-testid="select-export-excel-class"
                value={exportClassTarget}
                onChange={(e) => setExportClassTarget(e.target.value)}
                className="py-1.5 px-2.5 text-xs font-bold text-emerald-900 border border-emerald-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">
                  Xuất tất cả các lớp ({availableExamClasses.join(', ')})
                </option>
                {availableExamClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    Chỉ xuất Lớp {cls}
                  </option>
                ))}
              </select>
            </div>

            {/* Liên kết trực tiếp sang Google Sheet (hoạt động 100% không bị chặn bởi trình duyệt / iframe) */}
            <a
              href="https://docs.google.com/spreadsheets/create"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="btn-direct-link-google-sheets"
              onClick={handleDirectGoogleSheetsClick}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>
                {exportClassTarget === 'all'
                  ? 'Liên kết trực tiếp Google Sheet (Tất cả lớp)'
                  : `Liên kết Google Sheet (Lớp ${exportClassTarget})`}
              </span>
            </a>

            {/* Nút mở Bảng tính Báo cáo 3 Sheet ngay trên ứng dụng */}
            <button
              type="button"
              data-testid="btn-export-exam-results-excel"
              disabled={isExportingExcel}
              onClick={() => void handleExportExcel()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                {isExportingExcel ? 'Đang tạo báo cáo...' : 'Xem & Xuất Báo cáo (3 Sheet)'}
              </span>
            </button>
          </div>
        </div>

        {/* Thanh chọn nhanh từng lớp nếu kỳ thi có nhiều lớp tham gia */}
        {availableExamClasses.length > 1 && (
          <div
            data-testid="multi-class-quick-tabs"
            className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2"
          >
            <span className="text-[11px] font-bold text-slate-500 mr-1">
              Chuyển nhanh thống kê theo lớp:
            </span>
            <button
              type="button"
              data-testid="tab-class-all"
              onClick={() => {
                setSelectedClassFilter('all');
                setExportClassTarget('all');
                setSelectedStudentId(null);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                selectedClassFilter === 'all'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Tất cả các lớp ({allEligibleStudents.length} HS)
            </button>
            {availableExamClasses.map((cls) => {
              const clsStudents = allEligibleStudents.filter((st) => st.className === cls);
              const clsSessions = buildSessionsForStudents(clsStudents);
              const clsSubmitted = clsSessions.filter((s) => s.score !== undefined).length;
              const isSelected = selectedClassFilter === cls;
              return (
                <button
                  key={cls}
                  type="button"
                  data-testid={`tab-class-${cls}`}
                  onClick={() => {
                    setSelectedClassFilter(cls);
                    setExportClassTarget(cls);
                    setSelectedStudentId(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Lớp {cls} ({clsSubmitted}/{clsStudents.length} đã nộp)
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* KHUNG QUẢN LÝ THI LẠI LẦN 2 CHO HỌC SINH ĐÃ NỘP BÀI CÓ ĐIỂM < 5.0 NGAY TRONG PHẦN THỐNG KÊ */}
      {weakSubmittedSessions.length > 0 && (
        <div
          data-testid="weak-students-retake-panel"
          className="bg-rose-50/90 border border-rose-200 rounded-xl p-4 shadow-xs space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start space-x-2.5">
              <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-rose-950">
                  Danh sách học sinh có điểm &lt; 5.0 cần Thi lại (Lần 2):{' '}
                  <span className="text-rose-700">{weakSubmittedSessions.length} học sinh</span>
                </h3>
                <p className="text-xs text-rose-800 mt-0.5">
                  Thầy/Cô có thể bấm <strong>&ldquo;Cho phép tất cả thi lại (Lần 2)&rdquo;</strong> hoặc cấp quyền thi lại cho từng học sinh bên dưới để học sinh làm lại bài thi lần thứ 2 với mã đề đảo mới.
                </p>
              </div>
            </div>

            {onAllowRetake && (
              <button
                type="button"
                data-testid="btn-retake-all-weak-students"
                onClick={() =>
                  triggerStudentRetake(
                    weakSubmittedSessions.map((s) => s.studentId),
                    `tất cả ${weakSubmittedSessions.length} học sinh có điểm < 5.0`
                  )
                }
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-sm transition-colors shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>
                  Cho phép tất cả {weakSubmittedSessions.length} HS điểm &lt; 5.0 thi lại (Lần 2)
                </span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-rose-200/70">
            {weakSubmittedSessions.map((sess) => {
              const st = studentMap.get(sess.studentId);
              if (!st) return null;
              return (
                <div
                  key={sess.id}
                  className="bg-white border border-rose-200 rounded-lg p-3 flex items-center justify-between gap-2 shadow-2xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-slate-900 truncate">{st.fullName}</p>
                    <p className="text-[11px] text-slate-500">
                      Lớp <strong>{st.className}</strong> • Mã: <code>{st.loginCode}</code> • Điểm:{' '}
                      <strong className="text-rose-600">{sess.score} điểm</strong>
                    </p>
                  </div>
                  {onAllowRetake && (
                    <button
                      type="button"
                      data-testid={`btn-retake-card-${st.id}`}
                      onClick={() =>
                        triggerStudentRetake(
                          [st.id],
                          `học sinh ${st.fullName} (Lớp ${st.className})`
                        )
                      }
                      className="bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-extrabold px-2.5 py-1.5 rounded-lg flex items-center space-x-1 shrink-0 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Thi lại (Lần 2)</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Thẻ chỉ số điểm số tổng quan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">
              Điểm trung bình {selectedClassFilter !== 'all' ? `(Lớp ${selectedClassFilter})` : ''}
            </p>
            <p className="text-2xl font-black text-blue-700 mt-1">
              {summary.averageScore > 0 ? summary.averageScore : '-'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {summary.submittedCount} / {summary.totalStudents} HS đã nộp
            </p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Điểm cao nhất</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">
              {summary.highestScore > 0 ? summary.highestScore : '-'}
            </p>
            <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">
              {selectedClassFilter === 'all' ? 'Thủ khoa kỳ thi' : `Cao nhất Lớp ${selectedClassFilter}`}
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Award className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Điểm thấp nhất</p>
            <p className="text-2xl font-black text-amber-700 mt-1">
              {summary.submittedCount > 0 ? summary.lowestScore : '-'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Cần phụ đạo thêm</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Học lực Giỏi &amp; Khá</p>
            <p className="text-2xl font-black text-indigo-700 mt-1">
              {summary.excellentCount + summary.goodCount} HS
            </p>
            <p className="text-[11px] text-indigo-600 mt-0.5 font-medium">
              Đạt{' '}
              {summary.submittedCount > 0
                ? Math.round(
                    ((summary.excellentCount + summary.goodCount) / summary.submittedCount) * 100
                  )
                : 0}
              % {selectedClassFilter === 'all' ? 'toàn kỳ thi' : `Lớp ${selectedClassFilter}`}
            </p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Phân phối phổ điểm & Thống kê câu hỏi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Phổ điểm */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">
            Phân bố xếp loại học lực{' '}
            {selectedClassFilter === 'all' ? '(Tất cả các lớp)' : `(Lớp ${selectedClassFilter})`}
          </h3>
          <div className="space-y-2 text-xs">
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-emerald-700">Giỏi (8.0 - 10.0 điểm):</span>
                <span>{summary.excellentCount} HS</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${
                      summary.submittedCount > 0
                        ? (summary.excellentCount / summary.submittedCount) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-blue-700">Khá (6.5 - 7.9 điểm):</span>
                <span>{summary.goodCount} HS</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${
                      summary.submittedCount > 0
                        ? (summary.goodCount / summary.submittedCount) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-amber-700">Đạt (5.0 - 6.4 điểm):</span>
                <span>{summary.averageCount} HS</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${
                      summary.submittedCount > 0
                        ? (summary.averageCount / summary.submittedCount) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center font-semibold">
                <span className="text-red-700">Chưa đạt (&lt; 5.0 điểm):</span>
                <div className="flex items-center space-x-2">
                  <span>{summary.weakCount} HS</span>
                  {weakSubmittedSessions.length > 0 && onAllowRetake && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerStudentRetake(
                          weakSubmittedSessions.map((s) => s.studentId),
                          `tất cả ${weakSubmittedSessions.length} học sinh điểm < 5.0`
                        )
                      }
                      className="text-[10px] bg-rose-100 hover:bg-rose-200 text-rose-800 px-2 py-0.5 rounded font-bold flex items-center space-x-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Cho thi lại Lần 2</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-red-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${
                      summary.submittedCount > 0
                        ? (summary.weakCount / summary.submittedCount) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tỷ lệ đúng từng câu hỏi trong ngân hàng */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 lg:col-span-2">
          <h3 className="font-bold text-slate-800 text-sm">
            Tỷ lệ trả lời đúng từng câu hỏi{' '}
            {selectedClassFilter === 'all' ? '(Tất cả các lớp)' : `(Lớp ${selectedClassFilter})`}
          </h3>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1 text-xs">
            {summary.questionStats.map((qs) => (
              <div key={qs.questionId} className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-slate-700">Câu {qs.questionIndex}</span>
                  <span
                    className={`font-bold ${
                      qs.correctPercent >= 70
                        ? 'text-emerald-700'
                        : qs.correctPercent >= 50
                        ? 'text-amber-700'
                        : 'text-red-700'
                    }`}
                  >
                    {qs.correctPercent}% đúng ({qs.totalAttempts} lượt trả lời)
                  </span>
                </div>
                <p className="text-slate-600 truncate text-[11px]">{qs.questionContent}</p>
                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      qs.correctPercent >= 70
                        ? 'bg-emerald-500'
                        : qs.correctPercent >= 50
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${qs.correctPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bảng điểm chi tiết theo học sinh */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="font-bold text-slate-800 text-sm">
            Bảng kết quả kiểm tra chi tiết theo học sinh{' '}
            <span className="text-indigo-700">
              ({selectedClassFilter === 'all' ? 'Tất cả các lớp' : `Lớp ${selectedClassFilter}`} –{' '}
              {examSessions.length} học sinh)
            </span>
          </h3>
          <span className="text-xs text-slate-500">
            Học sinh có điểm &lt; 5.0 có nút <strong>&ldquo;Cho thi lại (Lần 2)&rdquo;</strong> trực tiếp trên dòng
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-12 text-center">STT</th>
                <th className="py-3 px-4">Mã học sinh</th>
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-4 text-center">Lớp</th>
                <th className="py-3 px-4 text-center">Mã đề</th>
                <th className="py-3 px-4 text-center text-emerald-700">Số câu đúng</th>
                <th className="py-3 px-4 text-center text-red-700">Số câu sai</th>
                <th className="py-3 px-4 text-center text-slate-500">Bỏ trống</th>
                <th className="py-3 px-4 text-center font-bold text-blue-900">Điểm số</th>
                <th className="py-3 px-4 text-center">Lượt thi / Thi lại</th>
                <th className="py-3 px-4 text-center">Chi tiết bài làm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {examSessions.map((session, idx) => {
                const student = studentMap.get(session.studentId);
                const isSelected = selectedStudentId === session.studentId;
                const isWeakScore = session.score !== undefined && session.score < 5.0;
                const attemptNum = session.attemptCount || 1;

                return (
                  <tr
                    key={session.id}
                    onClick={() =>
                      setSelectedStudentId(
                        selectedStudentId === session.studentId ? null : session.studentId
                      )
                    }
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 font-medium' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4 text-center text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-600">
                      {student?.studentIdCode || '-'}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">{student?.fullName}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold">
                        {student?.className}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="bg-blue-100 text-blue-800 font-mono font-bold px-2 py-0.5 rounded">
                        {session.paperCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-emerald-700">
                      {session.correctCount ?? 0}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-red-700">
                      {session.wrongCount ?? 0}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-400">
                      {session.unansweredCount ?? 0}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {session.score !== undefined ? (
                        <span
                          className={`font-black text-sm px-2 py-0.5 rounded ${
                            session.score >= 8.0
                              ? 'bg-emerald-100 text-emerald-800'
                              : session.score >= 5.0
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {session.score}
                        </span>
                      ) : attemptNum >= 2 ? (
                        <span className="text-amber-700 font-bold text-[11px] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          Chờ thi lại Lần {attemptNum}
                        </span>
                      ) : (
                        <span className="text-slate-400">Chưa nộp</span>
                      )}
                    </td>
                    <td
                      className="py-3 px-4 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        {attemptNum >= 2 && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            Lần {attemptNum}
                            {session.previousScore !== undefined
                              ? ` (Lần 1: ${session.previousScore}đ)`
                              : ''}
                          </span>
                        )}
                        {isWeakScore && onAllowRetake ? (
                          <button
                            type="button"
                            data-testid={`btn-allow-retake-${session.studentId}`}
                            onClick={() =>
                              triggerStudentRetake(
                                [session.studentId],
                                `học sinh ${student?.fullName || session.studentId}`
                              )
                            }
                            className="bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center space-x-1 shadow-2xs transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Cho thi lại (Lần 2)</span>
                          </button>
                        ) : attemptNum === 1 ? (
                          <span className="text-slate-400 text-[11px]">Lần 1</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button className="text-blue-600 hover:text-blue-800 font-semibold underline text-xs">
                        {isSelected ? 'Đóng xem' : 'Xem bài làm'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CHI TIẾT BÀI LÀM CỦA 1 HỌC SINH */}
      {activeDetailStudent && activeDetailSession && activeDetailPaper && (
        <div className="bg-white rounded-xl border border-blue-300 shadow-md p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 gap-2">
            <div>
              <h3 className="text-base font-bold text-blue-950 flex items-center space-x-2">
                <span>Chi tiết bài thi của học sinh:</span>
                <span className="text-blue-700">{activeDetailStudent.fullName}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Lớp {activeDetailStudent.className} • Mã đăng nhập:{' '}
                <code>{activeDetailStudent.loginCode}</code> • Mã đề:{' '}
                <strong className="text-blue-700">{activeDetailPaper.paperCode}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600">
                Đúng:{' '}
                <strong className="text-emerald-700">{activeDetailSession.correctCount}</strong> / Sai:{' '}
                <strong className="text-red-700">{activeDetailSession.wrongCount}</strong>
              </span>
              <span className="text-base font-black bg-blue-700 text-white px-3 py-1 rounded-lg shadow-sm">
                {activeDetailSession.score ?? 0} điểm
              </span>
              {activeDetailSession.score !== undefined &&
                activeDetailSession.score < 5.0 &&
                onAllowRetake && (
                  <button
                    type="button"
                    data-testid="btn-detail-allow-retake"
                    onClick={() =>
                      triggerStudentRetake(
                        [activeDetailStudent.id],
                        `học sinh ${activeDetailStudent.fullName}`
                      )
                    }
                    className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold px-3 py-1.5 rounded-lg flex items-center space-x-1 shadow-xs cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Cho phép Thi lại (Lần 2)</span>
                  </button>
                )}
              <button
                onClick={() => setSelectedStudentId(null)}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border font-semibold cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>

          {/* Danh sách từng câu hỏi và phương án học sinh chọn */}
          <div className="space-y-4">
            {activeDetailPaper.questionOrder.map((qId, qIdx) => {
              const q = questions.find((item) => item.id === qId);
              if (!q) return null;

              const ans = activeDetailSession.answers[qId];
              const selectedOptId = ans?.selectedOptionId;
              const isCorrect = selectedOptId === q.correctOptionId;

              return (
                <div
                  key={qId}
                  className={`p-4 rounded-xl border text-xs space-y-2 ${
                    !selectedOptId
                      ? 'bg-slate-50 border-slate-200'
                      : isCorrect
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-red-50/50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-blue-900">Câu {qIdx + 1}:</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                        !selectedOptId
                          ? 'bg-slate-200 text-slate-700'
                          : isCorrect
                          ? 'bg-emerald-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {!selectedOptId ? 'Chưa trả lời' : isCorrect ? 'Trả lời đúng' : 'Trả lời sai'}
                    </span>
                  </div>

                  <p className="font-bold text-slate-800">{q.content}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {q.options.map((opt) => {
                      const isChosen = opt.id === selectedOptId;
                      const isRightAns = opt.id === q.correctOptionId;

                      let optClass = 'bg-white border-slate-200 text-slate-700';
                      if (isRightAns) {
                        optClass =
                          'bg-emerald-100 border-emerald-400 text-emerald-950 font-bold ring-1 ring-emerald-500';
                      } else if (isChosen && !isRightAns) {
                        optClass = 'bg-red-100 border-red-300 text-red-950 line-through';
                      }

                      return (
                        <div
                          key={opt.id}
                          className={`p-2 rounded-lg border flex items-center justify-between text-xs ${optClass}`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="font-bold">{opt.label}.</span>
                            <span>{opt.content}</span>
                          </div>
                          {isChosen && (
                            <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-semibold ml-2">
                              HS chọn
                            </span>
                          )}
                          {isRightAns && (
                            <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-semibold ml-2">
                              Đáp án đúng
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL BẢNG TÍNH BÁO CÁO TRỰC TUYẾN CHUẨN GOOGLE SHEET (3 SHEET) */}
      {isGoogleSheetModalOpen && (
        <div
          data-testid="google-sheet-live-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-3 sm:p-6"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
            {/* Thanh tiêu đề kiểu Google Sheets */}
            <div className="bg-emerald-700 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    BÁO CÁO KẾT QUẢ GOOGLE SHEET – {exam.title} ({liveSheetData.classScopeTitle})
                  </h3>
                  <p className="text-[11px] text-emerald-100">
                    Đã tự động chép dữ liệu vào bộ nhớ tạm • Khi mở Google Sheet mới chỉ cần nhấn{' '}
                    <strong>Ctrl + V</strong> là toàn bộ bảng điểm hiển thị đầy đủ
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="https://docs.google.com/spreadsheets/create"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="modal-btn-open-google-sheets"
                  onClick={() => {
                    const textToCopy =
                      activeSheetTab === 'sheet1'
                        ? liveSheetData.tsvSheet1
                        : activeSheetTab === 'sheet2'
                        ? liveSheetData.tsvSheet2
                        : liveSheetData.tsvSheet3;
                    const ok = copyTextToClipboardSync(textToCopy);
                    setCopiedToSheetsClipboard(ok);
                  }}
                  className="bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold text-xs px-3.5 py-2 rounded-lg flex items-center space-x-1.5 shadow-xs cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Mở Google Sheet mới &amp; Dán (Ctrl+V)</span>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    const textToCopy =
                      activeSheetTab === 'sheet1'
                        ? liveSheetData.tsvSheet1
                        : activeSheetTab === 'sheet2'
                        ? liveSheetData.tsvSheet2
                        : liveSheetData.tsvSheet3;
                    const ok = copyTextToClipboardSync(textToCopy);
                    setCopiedToSheetsClipboard(ok);
                  }}
                  className="bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center space-x-1.5 cursor-pointer"
                >
                  {copiedToSheetsClipboard ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>Đã chép Sheet này</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Sao chép Sheet này</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center space-x-1 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>In / Lưu PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsGoogleSheetModalOpen(false)}
                  className="text-emerald-100 hover:text-white p-1.5 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Thanh chọn 3 Sheet giống Google Sheets */}
            <div className="bg-slate-100 px-5 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setActiveSheetTab('sheet1')}
                  className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    activeSheetTab === 'sheet1'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Sheet 1: Bảng tổng hợp điểm ({liveSheetData.sheet1Rows.length} dòng)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSheetTab('sheet2')}
                  className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    activeSheetTab === 'sheet2'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Sheet 2: Chi tiết câu trả lời ({liveSheetData.sheet2Rows.length} dòng)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSheetTab('sheet3')}
                  className={`px-3.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    activeSheetTab === 'sheet3'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Sheet 3: Thống kê phổ điểm
                </button>
              </div>

              <span className="text-[11px] text-slate-600">
                Mẹo: Bấm <strong>&ldquo;Mở Google Sheet mới &amp; Dán (Ctrl+V)&rdquo;</strong> để mở trang tính Google Sheet trực tuyến và nhấn <code>Ctrl + V</code> tại ô A1.
              </span>
            </div>

            {/* Nội dung lưới bảng tính (Spreadsheet Grid) */}
            <div className="flex-1 overflow-auto p-4 bg-white">
              {activeSheetTab === 'sheet1' && (
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-emerald-700 text-white">
                      {liveSheetData.sheet1Headers.map((h, i) => (
                        <th
                          key={i}
                          className="border border-emerald-800 px-3 py-2 text-left font-bold whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {liveSheetData.sheet1Rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="border border-slate-300 px-3 py-1.5 text-slate-800 whitespace-nowrap"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeSheetTab === 'sheet2' && (
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-emerald-700 text-white">
                      {liveSheetData.sheet2Headers.map((h, i) => (
                        <th
                          key={i}
                          className="border border-emerald-800 px-3 py-2 text-left font-bold whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {liveSheetData.sheet2Rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="border border-slate-300 px-3 py-1.5 text-slate-800"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeSheetTab === 'sheet3' && (
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <tbody>
                    {liveSheetData.sheet3Rows.map((row, rIdx) => {
                      const isHeaderRow = rIdx === 0 || rIdx === 12;
                      return (
                        <tr
                          key={rIdx}
                          className={
                            isHeaderRow
                              ? 'bg-emerald-700 text-white font-bold'
                              : rIdx % 2 === 0
                              ? 'bg-white'
                              : 'bg-slate-50'
                          }
                        >
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="border border-slate-300 px-3 py-2"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
