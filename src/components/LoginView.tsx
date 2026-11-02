import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  GraduationCap,
  Lock,
  User,
  ArrowRight,
  AlertTriangle,
  HelpCircle,
  Clock,
  FileSpreadsheet,
  Users,
  Eye,
  EyeOff,
  CheckCircle2,
  CalendarClock,
} from 'lucide-react';
import { Exam, Role, Student } from '../types';
import {
  authenticateStudent,
  authenticateTeacher,
  getQuickSelectStudentsForExam,
} from '../utils/auth';

interface LoginViewProps {
  students: Student[];
  activeExam: Exam | null;
  schoolName: string;
  onLoginTeacher: () => void;
  onLoginStudent: (student: Student) => void;
  onOpenHelp: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  students,
  activeExam,
  onLoginTeacher,
  onLoginStudent,
  onOpenHelp,
}) => {
  const [loginMode, setLoginMode] = useState<Role>('giaovien');

  // State đăng nhập Giáo viên
  const [teacherUsername, setTeacherUsername] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);
  const [teacherError, setTeacherError] = useState('');

  // State đăng nhập Học sinh
  const [studentCode, setStudentCode] = useState('');
  const [studentPassword, setStudentPassword] = useState('123456');
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [studentError, setStudentError] = useState('');

  // Lấy đúng 4 học sinh đầu tiên của lớp được phân công trong kỳ thi đang mở
  const quickSelectStudents = useMemo(
    () => getQuickSelectStudentsForExam(students, activeExam, 4),
    [students, activeExam]
  );

  const handleTeacherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = authenticateTeacher(teacherUsername, teacherPassword);
    if (!res.ok) {
      setTeacherError(res.error || 'Đăng nhập không thành công.');
      return;
    }
    setTeacherError('');
    onLoginTeacher();
  };

  const handleStudentSubmit = (
    e?: React.FormEvent,
    overrideCode?: string,
    overridePass?: string
  ) => {
    if (e) e.preventDefault();
    const codeToCheck = overrideCode !== undefined ? overrideCode : studentCode;
    const passToCheck = overridePass !== undefined ? overridePass : studentPassword;

    const res = authenticateStudent(codeToCheck, passToCheck, students, activeExam);
    if (!res.ok || !res.student) {
      setStudentError(res.error || 'Đăng nhập học sinh không thành công.');
      return;
    }
    setStudentError('');
    onLoginStudent(res.student);
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-6 px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Banner đầu cửa sổ đăng nhập */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-800 text-white p-6 text-center space-y-2 relative">
          <div className="w-14 h-14 bg-white/15 backdrop-blur-xs border border-white/25 rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-black tracking-tight">
            HỆ THỐNG THI TRẮC NGHIỆM SMART TEST 7
          </h1>
          <p className="text-xs text-blue-100 font-medium">
            Môn Tin học 7 – Bộ sách Kết nối tri thức với cuộc sống
          </p>
          <p className="text-[11px] text-amber-300 font-semibold">
            Trường TH &amp; THCS Thụy Lâm - Thư Lâm
          </p>
        </div>

        {/* Bộ chuyển đổi 2 chế độ: Giáo viên / Học sinh */}
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center mb-2.5">
            Chọn chế độ đăng nhập hệ thống
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="login-mode-teacher"
              onClick={() => {
                setLoginMode('giaovien');
                setTeacherError('');
              }}
              className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 border cursor-pointer ${
                loginMode === 'giaovien'
                  ? 'bg-blue-700 text-white border-blue-700 shadow-md'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:bg-blue-50/40'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Chế độ Giáo viên</span>
            </button>

            <button
              type="button"
              data-testid="login-mode-student"
              onClick={() => {
                setLoginMode('hocsinh');
                setStudentError('');
              }}
              className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 border cursor-pointer ${
                loginMode === 'hocsinh'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/40'
              }`}
            >
              <GraduationCap className="w-4 h-4 shrink-0" />
              <span>Chế độ Học sinh</span>
            </button>
          </div>
        </div>

        {/* Nội dung form theo chế độ */}
        <div className="p-6">
          {loginMode === 'giaovien' ? (
            /* FORM ĐĂNG NHẬP GIÁO VIÊN */
            <form onSubmit={handleTeacherSubmit} className="space-y-4">
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 space-y-1">
                <p className="font-bold flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>Đăng nhập Quản trị &amp; Tổ chức thi dành cho Giáo viên</span>
                </p>
                <p className="text-[11px] text-blue-700">
                  Quản lý ngân hàng câu hỏi, tạo &amp; in đề chuẩn A4, xuất Word (.docx), mở kỳ thi và giám sát phòng máy.
                </p>
              </div>

              {teacherError && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center space-x-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{teacherError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="teacher-username"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Tài khoản Giáo viên:
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="teacher-username"
                    data-testid="input-teacher-username"
                    type="text"
                    value={teacherUsername}
                    onChange={(e) => setTeacherUsername(e.target.value)}
                    placeholder="Nhập tài khoản (Admin)"
                    autoComplete="username"
                    className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="teacher-password"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Mật khẩu:
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="teacher-password"
                    data-testid="input-teacher-password"
                    type={showTeacherPassword ? 'text' : 'password'}
                    value={teacherPassword}
                    onChange={(e) => setTeacherPassword(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={showTeacherPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    onClick={() => setShowTeacherPassword(!showTeacherPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showTeacherPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                data-testid="btn-submit-teacher-login"
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all text-sm flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>Đăng nhập Giáo viên</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : !activeExam ? (
            /* THÔNG BÁO KHI KHÔNG CÓ KỲ THI NÀO ĐANG MỞ */
            <div
              data-testid="student-login-no-exam"
              className="bg-amber-50/90 border border-amber-200 rounded-2xl p-6 text-center space-y-3"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-2xs">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-extrabold text-amber-950">
                  Hiện không có kỳ thi nào đang diễn ra
                </h2>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Hiện tại Giáo viên chưa mở kỳ thi nào trên hệ thống. Em vui lòng quay lại sau khi có kỳ thi được Giáo viên kích hoạt!
                </p>
              </div>
              <div className="pt-2">
                <span className="inline-flex items-center space-x-1.5 bg-white border border-amber-300 text-amber-900 text-[11px] font-bold px-3.5 py-1.5 rounded-full">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Trạng thái phòng thi: Chưa mở thi</span>
                </span>
              </div>
            </div>
          ) : (
            /* FORM ĐĂNG NHẬP HỌC SINH + HIỂN THỊ KỲ THI ĐANG MỞ */
            <div className="space-y-4">
              {/* Thông tin kỳ thi mà Giáo viên đang mở thi */}
              <div
                data-testid="student-login-active-exam"
                className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center space-x-1.5 bg-emerald-600 text-white text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Kỳ thi Giáo viên đang mở</span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-800">
                    Thang điểm {activeExam.maxScore}
                  </span>
                </div>
                <h2 className="text-sm font-extrabold text-slate-900 leading-snug">
                  {activeExam.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 pt-0.5">
                  <span className="inline-flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-700" />
                    <span>
                      Thời gian: <strong>{activeExam.durationMinutes} phút</strong>
                    </span>
                  </span>
                  <span className="inline-flex items-center space-x-1">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    <span>
                      Số câu: <strong>{activeExam.totalQuestions} câu</strong>
                    </span>
                  </span>
                  <span className="inline-flex items-center space-x-1">
                    <Users className="w-3.5 h-3.5 text-emerald-700" />
                    <span>
                      Lớp: <strong>{activeExam.classes.join(', ')}</strong>
                    </span>
                  </span>
                </div>
              </div>

              {studentError && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center space-x-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{studentError}</span>
                </div>
              )}

              <form onSubmit={(e) => handleStudentSubmit(e)} className="space-y-3.5">
                <div>
                  <label
                    htmlFor="student-login-code"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Mã đăng nhập của học sinh:
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="student-login-code"
                      data-testid="input-student-code"
                      type="text"
                      value={studentCode}
                      onChange={(e) => setStudentCode(e.target.value)}
                      placeholder="Ví dụ: nvan, ttmanh, lhphuc..."
                      className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nhập mã đăng nhập do Giáo viên cấp trong danh sách lớp {activeExam.classes.join(', ')}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="student-login-password"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Mật khẩu mặc định:
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="student-login-password"
                      data-testid="input-student-password"
                      type={showStudentPassword ? 'text' : 'password'}
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      placeholder="Mật khẩu mặc định: 123456"
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl font-mono text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label={showStudentPassword ? 'Ẩn mật khẩu học sinh' : 'Hiện mật khẩu học sinh'}
                      onClick={() => setShowStudentPassword(!showStudentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    >
                      {showStudentPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  data-testid="btn-submit-student-login"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all text-sm flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <span>Đăng nhập vào kỳ thi</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Gợi ý chọn nhanh 4 học sinh đầu tiên trong danh sách của đúng lớp được mở thi */}
              {quickSelectStudents.length > 0 && (
                <div
                  data-testid="quick-select-students-section"
                  className="pt-3 border-t border-slate-100 space-y-2"
                >
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block text-center">
                    Gợi ý chọn nhanh 4 học sinh Lớp {activeExam.classes.join(', ')} (Mật khẩu: 123456):
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {quickSelectStudents.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        data-testid={`demo-student-${s.loginCode}`}
                        onClick={() => {
                          setStudentCode(s.loginCode);
                          setStudentPassword('123456');
                          handleStudentSubmit(undefined, s.loginCode, '123456');
                        }}
                        className="p-2 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg text-left transition-colors cursor-pointer"
                      >
                        <p className="font-bold text-slate-800 truncate">{s.fullName}</p>
                        <p className="text-[10px] text-emerald-700 font-mono">
                          Lớp {s.className} • Mã: {s.loginCode}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chân cửa sổ đăng nhập: Nút mở Trợ giúp & Thông tin tác giả */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-600 font-medium truncate">
            Tác giả: <strong>Thầy giáo Ngô Văn Chinh</strong>
          </span>
          <button
            type="button"
            data-testid="btn-login-open-help"
            onClick={onOpenHelp}
            className="text-blue-700 hover:text-blue-900 font-bold flex items-center space-x-1 hover:underline cursor-pointer shrink-0"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Trợ giúp &amp; Tác giả</span>
          </button>
        </div>
      </div>
    </div>
  );
};
