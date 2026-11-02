import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flag,
  ArrowLeft,
  ArrowRight,
  Send,
  LogOut,
  GraduationCap,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Exam, Student, StudentAnswer, StudentExamPaper, StudentExamSession } from '../types';
import { getDisplayQuestionsForStudent } from '../utils/examShuffler';
import {
  gradeStudentExam,
  isQuestionAnswered,
  isQuestionFullyAnswered,
} from '../utils/grading';
import {
  formatQuestionStemForPrint,
  getAntiOrphanTextStyle,
  preventOrphanWords,
} from '../utils/examPaperFormatter';
import {
  getActiveRunningExam,
  getQuickSelectStudentsForExam,
} from '../utils/auth';

interface StudentExamViewProps {
  students: Student[];
  exams: Exam[];
  papers: Record<string, StudentExamPaper>;
  sessions: Record<string, StudentExamSession>;
  activeExamId: string | null;
  serverIp: string;
  initialStudent?: Student | null;
  onUpdateSession: (session: StudentExamSession) => void;
  onStudentExit: () => void;
}

export const StudentExamView: React.FC<StudentExamViewProps> = ({
  students,
  exams,
  papers,
  sessions,
  activeExamId,
  initialStudent = null,
  onUpdateSession,
  onStudentExit,
}) => {
  // Trạng thái đăng nhập học sinh
  const [loggedInStudent, setLoggedInStudent] = useState<Student | null>(initialStudent);
  const [loginCodeInput, setLoginCodeInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('123456');
  const [loginError, setLoginError] = useState('');

  // Trạng thái làm bài (hiển thị từng câu tập trung)
  const [isTakingExam, setIsTakingExam] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({});
  const answersRef = useRef<Record<string, StudentAnswer>>({});
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>('');
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Tìm kỳ thi đang thực sự diễn ra (status === 'dang_dien_ra')
  const activeExam = useMemo(
    () => getActiveRunningExam(exams, activeExamId),
    [exams, activeExamId]
  );

  // Danh sách 4 học sinh đầu tiên của đúng lớp tham gia kỳ thi đang mở
  const quickSelectStudents = useMemo(
    () => getQuickSelectStudentsForExam(students, activeExam, 4),
    [students, activeExam]
  );

  // Tìm phiên thi và mã đề của học sinh
  const sessionKey = loggedInStudent && activeExam ? `${loggedInStudent.id}_${activeExam.id}` : '';
  const currentSession = sessionKey ? sessions[sessionKey] : null;
  const currentPaper = sessionKey ? papers[sessionKey] : null;

  // Lấy danh sách câu hỏi đã đảo riêng cho học sinh này
  const displayQuestions = useMemo(
    () => (currentPaper ? getDisplayQuestionsForStudent(currentPaper) : []),
    [currentPaper]
  );

  // Đồng hồ đếm ngược thời gian làm bài
  const [secondsLeft, setSecondsLeft] = useState<number>(
    currentSession?.timeRemainingSeconds ?? (activeExam?.durationMinutes || 15) * 60
  );

  // Đồng bộ trạng thái khi học sinh đăng nhập từ cửa sổ đăng nhập chính (initialStudent)
  useEffect(() => {
    if (initialStudent) {
      setLoggedInStudent(initialStudent);
      setCurrentQuestionIndex(0);
      if (activeExam) {
        const sKey = `${initialStudent.id}_${activeExam.id}`;
        const sess = sessions[sKey];
        if (sess && sess.status === 'da_nop_bai') {
          setIsSubmitted(true);
          setIsTakingExam(false);
          answersRef.current = sess.answers || {};
          setAnswers(sess.answers || {});
        } else if (sess && sess.status === 'dang_lam_bai') {
          setIsSubmitted(false);
          setIsTakingExam(true);
          answersRef.current = sess.answers || {};
          setAnswers(sess.answers || {});
          setSecondsLeft(sess.timeRemainingSeconds);
        } else {
          setIsSubmitted(false);
          setIsTakingExam(false);
          answersRef.current = {};
          setAnswers({});
        }
      }
    }
  }, [initialStudent, activeExam?.id]);

  // Xử lý đăng nhập học sinh
  const handleLogin = (codeToUse?: string) => {
    const code = (codeToUse || loginCodeInput).trim().toLowerCase();
    const student = students.find((s) => s.loginCode.toLowerCase() === code);

    if (!student) {
      setLoginError('Mã đăng nhập không tồn tại trong danh sách lớp.');
      return;
    }

    if (passwordInput !== '123456') {
      setLoginError('Mật khẩu không chính xác. Mật khẩu ban đầu là: 123456');
      return;
    }

    setLoggedInStudent(student);
    setLoginError('');
    setCurrentQuestionIndex(0);

    // Kiểm tra xem đã nộp bài trước đó chưa
    if (activeExam) {
      const sKey = `${student.id}_${activeExam.id}`;
      const sess = sessions[sKey];
      if (sess && sess.status === 'da_nop_bai') {
        setIsSubmitted(true);
        answersRef.current = sess.answers || {};
        setAnswers(sess.answers || {});
      } else if (sess && sess.status === 'dang_lam_bai') {
        setIsTakingExam(true);
        answersRef.current = sess.answers || {};
        setAnswers(sess.answers || {});
        setSecondsLeft(sess.timeRemainingSeconds);
      } else {
        answersRef.current = {};
        setAnswers({});
      }
    }
  };

  // Bắt đầu làm bài
  const handleStartExam = () => {
    if (!loggedInStudent || !activeExam || !currentSession) return;

    const updatedSession: StudentExamSession = {
      ...currentSession,
      status: 'dang_lam_bai',
      startedAt: currentSession.startedAt || new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    };
    onUpdateSession(updatedSession);
    setIsTakingExam(true);
    setCurrentQuestionIndex(0);
  };

  // Lưu và đồng bộ câu trả lời nguyên tử (không mất dữ liệu khi chọn nhanh)
  const updateAnswersAtomically = (
    updater: (prev: Record<string, StudentAnswer>) => Record<string, StudentAnswer>
  ) => {
    const timeStr = new Date().toLocaleTimeString('vi-VN');
    setLastAutoSaveTime(timeStr);

    const next = updater(answersRef.current);
    answersRef.current = next;
    setAnswers(next);

    if (currentSession) {
      onUpdateSession({
        ...currentSession,
        status: 'dang_lam_bai',
        answers: next,
        lastHeartbeat: new Date().toISOString(),
      });
    }
  };

  // 1. Chọn phương án trả lời dạng Nhiều lựa chọn (A, B, C, D)
  const handleSelectOption = (questionId: string, optionId: string) => {
    if (isSubmitted) return;

    updateAnswersAtomically((prev) => {
      const existing = prev[questionId];
      return {
        ...prev,
        [questionId]: {
          ...existing,
          questionId,
          selectedOptionId: optionId,
          isFlaggedForReview: existing?.isFlaggedForReview || false,
          answeredAt: new Date().toISOString(),
        },
      };
    });
  };

  // 2. Chọn Đúng / Sai cho từng ý nhỏ a, b, c, d trong bảng Đúng/Sai
  const handleSelectStatementAnswer = (
    questionId: string,
    statementId: string,
    isTrue: boolean
  ) => {
    if (isSubmitted) return;

    updateAnswersAtomically((prev) => {
      const existing = prev[questionId];
      const prevStmtAnswers = existing?.statementAnswers || {};
      return {
        ...prev,
        [questionId]: {
          ...existing,
          questionId,
          selectedOptionId: existing?.selectedOptionId || null,
          statementAnswers: {
            ...prevStmtAnswers,
            [statementId]: isTrue,
          },
          isFlaggedForReview: existing?.isFlaggedForReview || false,
          answeredAt: new Date().toISOString(),
        },
      };
    });
  };

  // 3. Chọn cặp ghép nối Cột A -> Cột B cho câu hỏi Ghép đôi
  const handleSelectMatchingAnswer = (
    questionId: string,
    leftPairId: string,
    rightPairId: string
  ) => {
    if (isSubmitted) return;

    updateAnswersAtomically((prev) => {
      const existing = prev[questionId];
      const prevMatching = existing?.matchingAnswers || {};
      return {
        ...prev,
        [questionId]: {
          ...existing,
          questionId,
          selectedOptionId: existing?.selectedOptionId || null,
          matchingAnswers: {
            ...prevMatching,
            [leftPairId]: rightPairId,
          },
          isFlaggedForReview: existing?.isFlaggedForReview || false,
          answeredAt: new Date().toISOString(),
        },
      };
    });
  };

  // Đánh dấu xem lại
  const handleToggleFlag = (questionId: string) => {
    updateAnswersAtomically((prev) => {
      const existing = prev[questionId] || {
        questionId,
        selectedOptionId: null,
        isFlaggedForReview: false,
      };
      return {
        ...prev,
        [questionId]: {
          ...existing,
          isFlaggedForReview: !existing.isFlaggedForReview,
        },
      };
    });
  };

  // Đếm ngược đồng hồ
  useEffect(() => {
    if (!isTakingExam || isSubmitted) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam(true); // Hết giờ tự động nộp
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTakingExam, isSubmitted]);

  // Nộp bài thi
  const handleSubmitExam = (_isAutoSubmit: boolean = false) => {
    if (!currentSession || !currentPaper || !activeExam) return;

    const graded = gradeStudentExam(
      answersRef.current,
      currentPaper.questionSnapshots,
      activeExam.maxScore
    );

    const submittedSession: StudentExamSession = {
      ...currentSession,
      status: 'da_nop_bai',
      submittedAt: new Date().toISOString(),
      timeRemainingSeconds: 0,
      answers: answersRef.current,
      score: graded.score,
      correctCount: graded.correctCount,
      wrongCount: graded.wrongCount,
      unansweredCount: graded.unansweredCount,
      lastHeartbeat: new Date().toISOString(),
    };

    onUpdateSession(submittedSession);
    setIsTakingExam(false);
    setIsSubmitted(true);
    setShowConfirmSubmit(false);

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (_e) {
      // ignore
    }
  };

  // Format thời gian MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 1. MÀN HÌNH ĐĂNG NHẬP
  if (!loggedInStudent) {
    return (
      <div className="max-w-md mx-auto my-8 space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-blue-700 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
              <GraduationCap className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              Đăng nhập phòng thi trắc nghiệm
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Tin học 7 – Bộ sách Kết nối tri thức với cuộc sống
            </p>
          </div>

          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {!activeExam ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center space-y-2 text-xs text-amber-900">
              <p className="font-extrabold text-sm">
                Hiện không có kỳ thi nào đang diễn ra
              </p>
              <p className="text-amber-800">
                Hiện tại Giáo viên chưa mở kỳ thi nào trên hệ thống. Em vui lòng quay lại sau khi có kỳ thi!
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Mã đăng nhập của học sinh:
                  </label>
                  <input
                    type="text"
                    value={loginCodeInput}
                    onChange={(e) => setLoginCodeInput(e.target.value)}
                    placeholder="Ví dụ: nvan, ttmanh, lhphuc..."
                    className="w-full p-3 border border-slate-300 rounded-xl font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    (Chữ cái đầu họ tên viết liền, không dấu do giáo viên cấp)
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Mật khẩu:</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Mật khẩu mặc định: 123456"
                    className="w-full p-3 border border-slate-300 rounded-xl font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={() => handleLogin()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all text-sm flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <span>Đăng nhập vào phòng thi</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Gợi ý 4 học sinh đầu tiên của đúng lớp được mở thi */}
              {quickSelectStudents.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block text-center">
                    Gợi ý chọn nhanh 4 học sinh Lớp {activeExam.classes.join(', ')}:
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {quickSelectStudents.map((s) => (
                      <button
                        key={s.id}
                        data-testid={`demo-student-${s.loginCode}`}
                        onClick={() => {
                          setLoginCodeInput(s.loginCode);
                          setPasswordInput('123456');
                          handleLogin(s.loginCode);
                        }}
                        className="p-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-left transition-colors cursor-pointer"
                      >
                        <p className="font-bold text-slate-800 truncate">{s.fullName}</p>
                        <p className="text-[10px] text-blue-600 font-mono">
                          Lớp {s.className} • Mã: {s.loginCode}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // 2. MÀN HÌNH ĐÃ NỘP BÀI THÀNH CÔNG
  if (isSubmitted) {
    const finalSession = sessionKey ? sessions[sessionKey] : null;

    return (
      <div className="max-w-2xl mx-auto my-8 space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-800">
              ĐÃ NỘP BÀI THI THÀNH CÔNG!
            </h2>
            <p className="text-xs text-slate-500">
              Hệ thống đã ghi nhận toàn bộ câu trả lời của em vào cơ sở dữ liệu phòng thi.
            </p>
          </div>

          {/* Thông tin học sinh và kết quả */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-left text-xs space-y-2">
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Họ và tên học sinh:</span>
              <strong className="text-slate-800 text-sm">{loggedInStudent.fullName}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Lớp:</span>
              <strong className="text-slate-800">{loggedInStudent.className}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Mã đề thi của em:</span>
              <strong className="text-blue-700 font-mono">{currentSession?.paperCode}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200">
              <span className="text-slate-500">Bài kiểm tra:</span>
              <strong className="text-slate-800">{activeExam?.title}</strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Thời điểm nộp:</span>
              <strong className="text-slate-800">
                {finalSession?.submittedAt
                  ? new Date(finalSession.submittedAt).toLocaleTimeString('vi-VN')
                  : new Date().toLocaleTimeString('vi-VN')}
              </strong>
            </div>
          </div>

          {/* Hiển thị điểm số nếu giáo viên cho phép */}
          {activeExam?.allowReviewAfterSubmit && finalSession?.score !== undefined && (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl p-6 shadow-md space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                Kết quả bài làm của em
              </p>
              <div className="text-5xl font-black text-amber-300 tracking-tight">
                {finalSession.score}{' '}
                <span className="text-2xl font-bold text-white">/ 10 điểm</span>
              </div>
              <p className="text-xs text-blue-100">
                Đúng: <strong>{finalSession.correctCount}</strong> câu • Sai:{' '}
                <strong>{finalSession.wrongCount}</strong> câu
              </p>
            </div>
          )}

          <div className="flex justify-center space-x-3 pt-2">
            <button
              onClick={() => {
                setLoggedInStudent(null);
                setIsTakingExam(false);
                setIsSubmitted(false);
                onStudentExit();
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-5 py-2.5 rounded-xl border border-slate-300 transition-colors cursor-pointer"
            >
              Đăng xuất khỏi máy thi
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. MÀN HÌNH CHỜ BẮT ĐẦU (NẾU CHƯA BẤM VÀO THI)
  if (!isTakingExam) {
    return (
      <div className="max-w-xl mx-auto my-8 space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <span className="text-[11px] font-bold text-blue-600 uppercase">
                Thông tin thí sinh
              </span>
              <h2 className="text-xl font-black text-slate-800">{loggedInStudent.fullName}</h2>
              <p className="text-xs text-slate-500">
                Lớp {loggedInStudent.className} • Mã đăng nhập:{' '}
                <code>{loggedInStudent.loginCode}</code>
              </p>
            </div>
            <button
              onClick={() => {
                setLoggedInStudent(null);
                onStudentExit();
              }}
              className="text-xs text-slate-500 hover:text-red-600 p-2 rounded-lg hover:bg-slate-100 flex items-center space-x-1 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>

          {activeExam ? (
            <div className="space-y-4 text-xs">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <span className="text-blue-600 font-bold block uppercase text-[10px]">
                  Bài kiểm tra được phân công:
                </span>
                <h3 className="text-base font-extrabold text-blue-950">{activeExam.title}</h3>
                <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1">
                  <div>
                    • Thời gian làm bài: <strong>{activeExam.durationMinutes} phút</strong>
                  </div>
                  <div>
                    • Số lượng câu hỏi: <strong>{displayQuestions.length} câu</strong>
                  </div>
                  <div>
                    • Thang điểm: <strong>10.0 điểm</strong>
                  </div>
                  <div>
                    • Mã đề riêng của em:{' '}
                    <strong className="text-blue-700 font-mono">
                      {currentPaper?.paperCode || 'MD701'}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-slate-600 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800">Quy định và hướng dẫn làm bài:</p>
                <p>1. Chọn phương án trả lời bằng cách nhấp chuột vào ô A, B, C, D hoặc ô Đúng / Sai trong bảng.</p>
                <p>2. Hệ thống tự động lưu câu trả lời ngay khi em vừa chọn phương án.</p>
                <p>3. Em có thể bấm "Đánh dấu câu này" để quay lại kiểm tra câu hỏi khó.</p>
                <p>4. Khi hết giờ, bài làm sẽ tự động được nộp về máy chủ giáo viên.</p>
              </div>

              <button
                onClick={handleStartExam}
                data-testid="btn-start-student-exam"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-md transition-all text-sm flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>Bắt đầu làm bài thi</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center space-y-2 text-xs text-amber-900">
              <p className="font-extrabold text-sm">
                Hiện không có kỳ thi nào đang diễn ra
              </p>
              <p className="text-amber-800">
                Hiện tại Giáo viên chưa mở kỳ thi nào trên hệ thống. Em vui lòng quay lại sau khi có kỳ thi!
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 4. MÀN HÌNH LÀM BÀI CHÍNH THỨC: HIỂN THỊ TỪNG CÂU TẬP TRUNG, TRÌNH BÀY ĐÚNG CÁC DẠNG TRẮC NGHIỆM (NHIỀU LỰA CHỌN, BẢNG BIỂU ĐÚNG/SAI, BẢNG GHÉP ĐÔI) & CHỐNG RƠI 1 TỪ XUỐNG DÒNG
  const currentQ = displayQuestions[currentQuestionIndex];
  const answeredCount = (currentPaper?.questionSnapshots || []).filter((q) =>
    isQuestionFullyAnswered(q, answers[q.id])
  ).length;

  const cleanStem = currentQ ? formatQuestionStemForPrint(currentQ.content) : '';
  const stemAntiOrphanStyle = currentQ
    ? getAntiOrphanTextStyle(cleanStem, 82)
    : {};

  return (
    <div className="max-w-5xl mx-auto my-4 space-y-4">
      {/* THANH ĐIỀU HƯỚNG TRÊN: THÔNG TIN HỌC SINH + ĐỒNG HỒ ĐẾM NGƯỢC + NỘP BÀI */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-16 z-30">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 text-blue-800 font-black px-2.5 py-1.5 rounded-lg text-xs font-mono">
            {currentPaper?.paperCode}
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">{loggedInStudent.fullName}</h3>
            <p className="text-[11px] text-slate-500">
              Lớp {loggedInStudent.className} • Tiến độ: {answeredCount}/{displayQuestions.length} câu
            </p>
          </div>
        </div>

        {/* Đồng hồ đếm ngược & Nút nộp bài */}
        <div className="flex items-center space-x-4 self-center sm:self-auto">
          <div
            className={`px-4 py-2 rounded-xl flex items-center space-x-2 font-mono font-black text-base shadow-xs ${
              secondsLeft <= 120
                ? 'bg-red-50 text-red-600 border border-red-300 animate-pulse'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            <Clock className="w-5 h-5 text-blue-600" />
            <span>{formatTime(secondsLeft)}</span>
          </div>

          <button
            onClick={() => setShowConfirmSubmit(true)}
            data-testid="student-btn-submit-exam"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Nộp bài</span>
          </button>
        </div>
      </div>

      {/* BỐ CỤC: BẢNG SỐ CÂU HỎI (BÊN TRÁI) + NỘI DUNG TỪNG CÂU HỎI (BÊN PHẢI) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Bảng số thứ tự câu hỏi */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 lg:col-span-1">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="font-bold text-slate-700 text-xs">Danh sách câu hỏi:</span>
            <span className="text-[11px] text-blue-600 font-bold">
              {answeredCount}/{displayQuestions.length}
            </span>
          </div>

          {/* Lưới các nút số câu hỏi */}
          <div className="grid grid-cols-5 gap-2">
            {displayQuestions.map((q, idx) => {
              const ans = answers[q.id];
              const origQ = currentPaper?.questionSnapshots.find((item) => item.id === q.id);
              const isFullyDone = origQ
                ? isQuestionFullyAnswered(origQ, ans)
                : Boolean(ans?.selectedOptionId);
              const isPartial =
                !isFullyDone && (origQ ? isQuestionAnswered(origQ, ans) : false);
              const isFlagged = ans && ans.isFlaggedForReview;
              const isCurrent = idx === currentQuestionIndex;

              let btnStyle = 'bg-slate-50 text-slate-700 border-slate-200';
              if (isFullyDone) {
                btnStyle = 'bg-blue-600 text-white font-bold border-blue-600';
              } else if (isPartial) {
                btnStyle = 'bg-sky-100 text-sky-900 font-bold border-sky-400';
              }
              if (isFlagged) {
                btnStyle = 'bg-amber-400 text-amber-950 font-bold border-amber-500';
              }
              if (isCurrent) {
                btnStyle += ' ring-2 ring-blue-500 ring-offset-1 scale-105';
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  data-testid={`nav-question-${idx + 1}`}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={`h-9 rounded-lg border text-xs flex items-center justify-center font-bold transition-all relative cursor-pointer ${btnStyle}`}
                >
                  {idx + 1}
                  {isFlagged && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-600 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Chú giải trạng thái */}
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded bg-blue-600" />
              <span>Đã trả lời</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded bg-sky-200 border border-sky-400" />
              <span>Đang trả lời một phần</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded bg-amber-400" />
              <span>Đánh dấu xem lại</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300" />
              <span>Chưa làm</span>
            </div>
          </div>

          {/* Thông báo tự động lưu */}
          {lastAutoSaveTime && (
            <div className="text-[10px] text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>Đã tự động lưu lúc {lastAutoSaveTime}</span>
            </div>
          )}
        </div>

        {/* Khung nội dung từng câu hỏi hiện tại */}
        {currentQ && (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 lg:col-span-3">
            {/* Header câu hỏi */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-blue-900 text-sm">
                  Câu {currentQuestionIndex + 1} / {displayQuestions.length}
                </span>
                {currentQ.type === 'true_false' ? (
                  <span className="text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                    Dạng Đúng / Sai (Cấu trúc Bộ GD&amp;ĐT)
                  </span>
                ) : currentQ.type === 'matching' ? (
                  <span className="text-[11px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300 px-2.5 py-0.5 rounded-full">
                    Dạng Ghép đôi (Nối Cột A với Cột B)
                  </span>
                ) : (
                  <span className="text-[11px] font-extrabold bg-blue-100 text-blue-900 border border-blue-300 px-2.5 py-0.5 rounded-full">
                    Dạng Nhiều lựa chọn (Chọn 1 đáp án A, B, C, D)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleToggleFlag(currentQ.id)}
                className={`text-xs px-3 py-1.5 rounded-lg flex items-center space-x-1 font-semibold transition-colors cursor-pointer ${
                  answers[currentQ.id]?.isFlaggedForReview
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>
                  {answers[currentQ.id]?.isFlaggedForReview ? 'Đã đánh dấu' : 'Đánh dấu câu này'}
                </span>
              </button>
            </div>

            {/* Nội dung câu hỏi (đã chuẩn hóa tiền tố và chống rơi 1 từ xuống dòng) */}
            <div className="space-y-3">
              <p
                style={{
                  textWrap: 'pretty' as any,
                  ...stemAntiOrphanStyle,
                }}
                className="text-base font-bold text-slate-800 leading-relaxed whitespace-pre-line text-justify"
              >
                {preventOrphanWords(cleanStem)}
              </p>

              {currentQ.imageUrl && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center space-y-2">
                  <img
                    src={currentQ.imageUrl}
                    alt={currentQ.imageCaption || 'Hình minh họa câu hỏi'}
                    className="max-h-56 w-auto object-contain rounded-lg border border-slate-200 bg-white p-2 shadow-2xs"
                  />
                  {currentQ.imageCaption &&
                    !currentQ.imageUrl.includes('hinh_1_1') &&
                    !currentQ.imageUrl.includes('hinh_1_2') && (
                      <span className="text-xs italic font-medium text-slate-600">
                        {preventOrphanWords(currentQ.imageCaption)}
                      </span>
                    )}
                </div>
              )}
            </div>

            {/* PHẦN TRẢ LỜI TƯƠNG TÁC THEO TỪNG DẠNG CÂU HỎI */}
            {currentQ.type === 'true_false' && currentQ.statements.length > 0 ? (
              /* DẠNG 2: ĐÚNG / SAI TRÌNH BÀY DẠNG BẢNG BIỂU CHUẨN */
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 text-xs text-emerald-950 font-semibold">
                  Trong mỗi ý <strong>a), b), c), d)</strong> dưới đây, em hãy chọn{' '}
                  <strong>Đúng</strong> hoặc <strong>Sai</strong> trong bảng:
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-2xs">
                  <table
                    data-testid="student-tf-table"
                    className="w-full border-collapse text-sm bg-white"
                  >
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                        <th className="py-2.5 px-3.5 text-left font-extrabold border-r border-slate-300">
                          Phát biểu nhận định
                        </th>
                        <th className="py-2.5 px-3 w-28 text-center font-extrabold border-r border-slate-300">
                          Đúng
                        </th>
                        <th className="py-2.5 px-3 w-28 text-center font-extrabold">
                          Sai
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {currentQ.statements.map((stmt) => {
                        const selectedVal = answers[currentQ.id]?.statementAnswers?.[stmt.id];
                        return (
                          <tr
                            key={stmt.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td
                              style={{ textWrap: 'pretty' as any }}
                              className="py-3 px-3.5 text-slate-800 leading-relaxed text-justify border-r border-slate-300"
                            >
                              <span className="font-extrabold text-emerald-900 mr-1.5">
                                {stmt.label})
                              </span>
                              <span>{preventOrphanWords(stmt.content)}</span>
                            </td>
                            <td className="py-2.5 px-2.5 text-center align-middle border-r border-slate-300">
                              <button
                                type="button"
                                data-testid={`tf-btn-true-${stmt.label}`}
                                onClick={() =>
                                  handleSelectStatementAnswer(currentQ.id, stmt.id, true)
                                }
                                className={`w-full py-2 px-3 rounded-lg font-extrabold text-xs border-2 transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                                  selectedVal === true
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40'
                                }`}
                              >
                                <span>{selectedVal === true ? '☑' : '☐'}</span>
                                <span>Đúng</span>
                              </button>
                            </td>
                            <td className="py-2.5 px-2.5 text-center align-middle">
                              <button
                                type="button"
                                data-testid={`tf-btn-false-${stmt.label}`}
                                onClick={() =>
                                  handleSelectStatementAnswer(currentQ.id, stmt.id, false)
                                }
                                className={`w-full py-2 px-3 rounded-lg font-extrabold text-xs border-2 transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                                  selectedVal === false
                                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-rose-400 hover:bg-rose-50/40'
                                }`}
                              >
                                <span>{selectedVal === false ? '☑' : '☐'}</span>
                                <span>Sai</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : currentQ.type === 'matching' && currentQ.matchingLeftItems.length > 0 ? (
              /* DẠNG 3: GHÉP ĐÔI (BẢNG CỘT A - CỘT B & CHỌN PHƯƠNG ÁN GHÉP NỐI) */
              <div className="space-y-4">
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-3.5 py-2 text-xs text-purple-950 font-semibold">
                  Hãy nối mỗi ý ở <strong>Cột A (1, 2, 3, 4)</strong> với một ý tương thích ở{' '}
                  <strong>Cột B (A, B, C, D)</strong>:
                </div>

                {/* Bảng biểu 2 cột Cột A và Cột B */}
                <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-2xs">
                  <table
                    data-testid="student-matching-table"
                    className="w-full border-collapse text-sm bg-white"
                  >
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                        <th className="py-2.5 px-3.5 w-[46%] text-left font-extrabold border-r border-slate-300 text-purple-950">
                          CỘT A
                        </th>
                        <th className="py-2.5 px-3.5 w-[54%] text-left font-extrabold text-indigo-950">
                          CỘT B
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {currentQ.matchingLeftItems.map((leftItem, idx) => {
                        const rightOpt = currentQ.matchingRightOptions[idx];
                        return (
                          <tr key={leftItem.id} className="hover:bg-slate-50/70">
                            <td
                              style={{ textWrap: 'pretty' as any }}
                              className="py-3 px-3.5 align-top border-r border-slate-300 text-slate-800 leading-relaxed"
                            >
                              <span className="font-extrabold text-purple-900 mr-1.5">
                                {leftItem.label}.
                              </span>
                              <span>{preventOrphanWords(leftItem.content)}</span>
                            </td>
                            <td
                              style={{ textWrap: 'pretty' as any }}
                              className="py-3 px-3.5 align-top text-slate-800 leading-relaxed"
                            >
                              {rightOpt && (
                                <>
                                  <span className="font-extrabold text-indigo-900 mr-1.5">
                                    {rightOpt.displayLabel}.
                                  </span>
                                  <span>{preventOrphanWords(rightOpt.content)}</span>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Khu vực chọn đáp án ghép đôi cho từng ý ở Cột A */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <span className="text-xs font-extrabold text-slate-800 block">
                    Chọn phương án ghép đôi của em:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {currentQ.matchingLeftItems.map((leftItem) => {
                      const chosenRightId =
                        answers[currentQ.id]?.matchingAnswers?.[leftItem.id] || '';
                      return (
                        <div
                          key={leftItem.id}
                          className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2"
                        >
                          <span className="text-xs font-bold text-purple-950">
                            Ý {leftItem.label} nối với:
                          </span>
                          <div className="flex items-center space-x-1.5">
                            {currentQ.matchingRightOptions.map((rightOpt) => {
                              const isSelected = chosenRightId === rightOpt.id;
                              return (
                                <button
                                  key={rightOpt.id}
                                  type="button"
                                  data-testid={`match-btn-${leftItem.label}-${rightOpt.displayLabel}`}
                                  onClick={() =>
                                    handleSelectMatchingAnswer(
                                      currentQ.id,
                                      leftItem.id,
                                      rightOpt.id
                                    )
                                  }
                                  className={`w-8 h-8 rounded-lg font-extrabold text-xs border transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-purple-50 hover:border-purple-300'
                                  }`}
                                >
                                  {rightOpt.displayLabel}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* DẠNG 1: NHIỀU LỰA CHỌN (4 PHƯƠNG ÁN A, B, C, D) */
              <div className="space-y-3">
                {currentQ.options.map((opt) => {
                  const isSelected = answers[currentQ.id]?.selectedOptionId === opt.id;

                  return (
                    <div
                      key={opt.id}
                      data-testid={`mc-opt-${opt.label}`}
                      onClick={() => handleSelectOption(currentQ.id, opt.id)}
                      style={{ textWrap: 'pretty' as any }}
                      className={`p-3.5 rounded-xl border-2 text-sm cursor-pointer flex items-center space-x-3 transition-all ${
                        isSelected
                          ? 'bg-blue-50 border-blue-600 text-blue-950 font-bold shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="flex-1">{preventOrphanWords(opt.content)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Các nút chuyển câu Trước / Sau */}
            <div className="flex items-center justify-between pt-4 border-t">
              <button
                type="button"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 border ${
                  currentQuestionIndex === 0
                    ? 'text-slate-300 border-slate-200 cursor-not-allowed'
                    : 'text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Câu trước</span>
              </button>

              <button
                type="button"
                disabled={currentQuestionIndex === displayQuestions.length - 1}
                onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 ${
                  currentQuestionIndex === displayQuestions.length - 1
                    ? 'text-slate-300 border border-slate-200 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs cursor-pointer'
                }`}
              >
                <span>Câu tiếp theo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL XÁC NHẬN NỘP BÀI */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-slate-800">Xác nhận nộp bài thi?</h3>
              <p className="text-xs text-slate-600">
                Em đã trả lời{' '}
                <strong className="text-blue-700 font-bold">
                  {answeredCount} / {displayQuestions.length}
                </strong>{' '}
                câu hỏi.
              </p>
            </div>

            {displayQuestions.length - answeredCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                <strong>Cảnh báo:</strong> Em vẫn còn{' '}
                <strong>{displayQuestions.length - answeredCount}</strong> câu chưa chọn phương án.
                Sau khi nộp, em sẽ không thể sửa lại bài làm.
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Kiểm tra lại
              </button>
              <button
                type="button"
                onClick={() => handleSubmitExam(false)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-md cursor-pointer"
              >
                Xác nhận nộp bài
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
