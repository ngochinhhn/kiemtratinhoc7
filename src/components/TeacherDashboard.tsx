import React from 'react';
import {
  Users,
  BookOpen,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Play,
  FileDown,
  ArrowRight,
  ShieldCheck,
  Laptop,
} from 'lucide-react';
import { Exam, Question, Student } from '../types';

interface TeacherDashboardProps {
  students: Student[];
  questions: Question[];
  exams: Exam[];
  activeExam: Exam | null;
  activeExams?: Exam[];
  serverIp?: string;
  serverPort?: number;
  onNavigate: (tab: string) => void;
  onOpenNetSupportGuide?: () => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  students,
  questions,
  exams,
  activeExam,
  activeExams = [],
  onNavigate,
}) => {
  const verifiedQuestions = questions.filter((q) => q.reviewStatus === 'da_kiem_duyet').length;
  const classes = Array.from(new Set(students.map((s) => s.className)));
  const runningExams =
    activeExams.length > 0
      ? activeExams
      : activeExam && activeExam.status === 'dang_dien_ra'
      ? [activeExam]
      : [];

  return (
    <div className="space-y-6">
      {/* Banner thông báo trực tuyến */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-800 rounded-xl text-white p-6 shadow-md border border-blue-600">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 bg-blue-600/80 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-blue-100">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>Hệ thống thi và kiểm tra trắc nghiệm trực tuyến môn Tin học 7</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Bảng điều khiển giáo viên môn Tin học 7
            </h1>
            <p className="text-blue-200 text-sm max-w-2xl">
              Nguồn câu hỏi chuẩn hóa từ Sách bài tập Tin học 7 – Kết nối tri thức với cuộc sống.
              Hỗ trợ mở nhiều kỳ thi diễn ra đồng thời và tự động lưu điểm vào danh sách lớp.
            </p>
          </div>

          <div className="bg-blue-950/70 p-4 rounded-xl border border-blue-500/40 flex flex-col sm:flex-row lg:flex-col justify-between gap-3 text-sm">
            <div>
              <span className="text-blue-300 text-xs font-medium block">TRẠNG THÁI KỲ THI TRỰC TUYẾN:</span>
              <span className="font-bold text-emerald-300 text-sm">
                {runningExams.length > 0
                  ? `Đang mở ${runningExams.length} kỳ thi (${Array.from(
                      new Set(runningExams.flatMap((e) => e.classes))
                    ).join(', ')})`
                  : 'Chưa mở kỳ thi'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onNavigate('dethi')}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
                <span>Quản lý đề thi</span>
              </button>
              <button
                onClick={() => onNavigate('giamsat')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Vào phòng thi</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Thẻ chỉ số tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Số lượng học sinh */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tổng số học sinh
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1">{students.length}</p>
            <p className="text-xs text-blue-600 mt-1 font-medium">
              {classes.length} lớp: {classes.join(', ')}
            </p>
          </div>
          <div className="bg-blue-100 text-blue-700 p-3 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Ngân hàng câu hỏi */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Ngân hàng câu hỏi
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1">{questions.length}</p>
            <p className="text-xs text-emerald-600 mt-1 font-medium flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3 inline" />
              <span>{verifiedQuestions} câu đã duyệt</span>
            </p>
          </div>
          <div className="bg-indigo-100 text-indigo-700 p-3 rounded-xl">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>

        {/* Số đề thi */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Đề thi trong hệ thống
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1">{exams.length}</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Đang mở đồng thời: {runningExams.length} kỳ thi
            </p>
          </div>
          <div className="bg-amber-100 text-amber-700 p-3 rounded-xl">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
        </div>

        {/* Chế độ thi trực tuyến */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Hình thức tổ chức
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1">Trực tuyến</p>
            <p className="text-xs text-emerald-600 mt-1 font-medium">
              Lưu điểm tự động vào DS lớp
            </p>
          </div>
          <div className="bg-emerald-100 text-emerald-700 p-3 rounded-xl">
            <Laptop className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Kỳ thi đang hoạt động hoặc thông báo chưa mở kỳ thi */}
      <div
        data-testid="dashboard-active-exam-card"
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span>
                Kỳ thi đang kích hoạt trên hệ thống ({runningExams.length} kỳ thi đang mở)
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {runningExams.length > 0
                ? 'Học sinh khi đăng nhập có thể chọn kỳ thi tham dự và nhận ngay mã đề tương ứng'
                : 'Trạng thái thời gian thực của kỳ thi trực tuyến'}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onNavigate('dethi')}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 cursor-pointer"
            >
              <span>Xem danh sách tất cả đề thi ({exams.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {runningExams.length > 0 ? (
          <div data-testid="dashboard-running-exam-info" className="space-y-3">
            {runningExams.map((ex) => (
              <div
                key={ex.id}
                className="bg-blue-50/70 border border-blue-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-emerald-600 text-white text-xs px-2.5 py-0.5 rounded font-bold uppercase tracking-wider">
                      Đang diễn ra
                    </span>
                    <span className="bg-blue-200 text-blue-800 text-xs px-2 py-0.5 rounded font-semibold">
                      {ex.durationMinutes} phút
                    </span>
                    <span className="text-xs font-semibold text-blue-900 bg-white border border-blue-200 px-2.5 py-0.5 rounded">
                      Phân công: Lớp {ex.classes.join(', ')}
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-blue-950">{ex.title}</h3>
                  <p className="text-xs text-slate-600">
                    Gồm {ex.questionIds.length} câu hỏi • Thang điểm {ex.maxScore} • Tự động đảo đề và lưu điểm vào danh sách lớp
                  </p>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <button
                    onClick={() => onNavigate('giamsat')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-4 py-2.5 rounded-lg flex items-center space-x-2 shadow-sm transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Giám sát phòng thi</span>
                  </button>
                  <button
                    onClick={() => onNavigate('ketqua')}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-sm px-4 py-2.5 rounded-lg flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <FileDown className="w-4 h-4 text-slate-500" />
                    <span>Xem điểm</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            data-testid="dashboard-no-running-exam"
            className="text-center py-8 px-4 bg-amber-50/60 rounded-xl border border-dashed border-amber-300 space-y-2"
          >
            <div className="inline-flex items-center space-x-1.5 bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Không có kỳ thi nào đang diễn ra</span>
            </div>
            <p className="text-sm font-bold text-slate-800">
              Hiện tại chưa có kỳ thi nào đang được kích hoạt trên hệ thống.
            </p>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              Khi học sinh chuyển sang chế độ Học sinh lúc này, hệ thống sẽ thông báo không có kỳ thi nào đang diễn ra và đề nghị học sinh quay lại sau.
            </p>
            <div className="pt-1">
              <button
                onClick={() => onNavigate('dethi')}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors inline-flex items-center space-x-1.5 cursor-pointer shadow-xs"
              >
                <span>Vào mục Tạo đề &amp; Mở kỳ thi ngay</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lối tắt thao tác nhanh dành cho giáo viên */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('nganhang')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <BookOpen className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">Nhập câu hỏi từ PDF / OCR</h4>
          <p className="text-xs text-slate-500">
            Tải lên tài liệu PDF Sách bài tập Tin học 7, hệ thống tự động bóc tách câu hỏi và phương án để giáo viên kiểm duyệt.
          </p>
        </div>

        <div
          onClick={() => onNavigate('hocsinh')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">Nhập học sinh từ Excel</h4>
          <p className="text-xs text-slate-500">
            Tải danh sách học sinh theo mẫu Excel, tự động sinh mã đăng nhập không dấu theo lớp và cấp mật khẩu ban đầu 123456.
          </p>
        </div>

        <div
          onClick={() => onNavigate('dethi')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow cursor-pointer transition-all space-y-2 group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">Tạo đề, In A4 &amp; Xuất Word</h4>
          <p className="text-xs text-slate-500">
            Tạo đề kiểm tra theo ma trận hoặc chọn thủ công từng câu, xem trước bản in chuẩn A4 và tải file Word (.docx).
          </p>
        </div>
      </div>
    </div>
  );
};
