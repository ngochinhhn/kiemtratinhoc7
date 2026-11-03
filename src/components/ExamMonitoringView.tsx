import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Play,
  Pause,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Filter,
  PlusCircle,
  Wifi,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Exam, Student, StudentExamPaper, StudentExamSession } from '../types';
import { gradeStudentExam } from '../utils/grading';

interface ExamMonitoringViewProps {
  exam: Exam | null;
  students: Student[];
  papers: Record<string, StudentExamPaper>;
  sessions: Record<string, StudentExamSession>;
  serverIp: string;
  serverPort: number;
  onUpdateSessions: (sessions: Record<string, StudentExamSession>) => void;
  onFinishExam: (examId: string) => void;
  onPauseExam: (examId: string) => void;
  onResumeExam: (examId: string) => void;
}

export const ExamMonitoringView: React.FC<ExamMonitoringViewProps> = ({
  exam,
  students,
  papers,
  sessions,
  serverIp,
  serverPort,
  onUpdateSessions,
  onFinishExam,
  onPauseExam,
  onResumeExam,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isSimulating, setIsSimulating] = useState(false);

  if (!exam) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-sm">
        <Monitor className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-700">Chưa chọn kỳ thi nào để giám sát</h3>
        <p className="text-xs text-slate-500 mt-1">
          Vui lòng vào tab "Tạo đề & Đảo đề" và bấm nút "Mở thi & Giám sát".
        </p>
      </div>
    );
  }

  // Danh sách học sinh thuộc các lớp được phân công thi
  const eligibleStudents = students.filter((s) => exam.classes.includes(s.className));

  // Ghép nối thông tin học sinh với session và paper
  const studentMonitorList = eligibleStudents.map((student, index) => {
    const key = `${student.id}_${exam.id}`;
    const session = sessions[key] || {
      id: `sess_${student.id}_${exam.id}`,
      examId: exam.id,
      studentId: student.id,
      paperCode: papers[key]?.paperCode || `MD${701 + index}`,
      status: 'chua_dang_nhap',
      timeRemainingSeconds: exam.durationMinutes * 60,
      answers: {},
      lastHeartbeat: new Date().toISOString(),
      workstationIp: `192.168.1.${100 + (student.workstationNumber || index + 1)}`,
    };

    const paper = papers[key];
    const answeredCount = Object.values(session.answers).filter((a) => a.selectedOptionId).length;

    return {
      student,
      session,
      paper,
      answeredCount,
      totalQuestions: exam.questionIds.length,
      workstationNumber: student.workstationNumber || index + 1,
    };
  });

  // Lọc danh sách giám sát
  const filteredList = studentMonitorList.filter((item) => {
    const matchSearch =
      item.student.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.student.loginCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.session.paperCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || item.session.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Thống kê nhanh trạng thái phòng thi
  const totalCount = studentMonitorList.length;
  const loggedInCount = studentMonitorList.filter(
    (i) => i.session.status === 'da_dang_nhap' || i.session.status === 'dang_lam_bai'
  ).length;
  const inProgressCount = studentMonitorList.filter((i) => i.session.status === 'dang_lam_bai').length;
  const disconnectedCount = studentMonitorList.filter((i) => i.session.status === 'mat_ket_noi').length;
  const submittedCount = studentMonitorList.filter((i) => i.session.status === 'da_nop_bai').length;
  const offlineCount = studentMonitorList.filter((i) => i.session.status === 'chua_dang_nhap').length;

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Thao tác: Thêm 5 phút cho toàn bộ phòng máy
  const handleAdd5Minutes = () => {
    const updated = { ...sessions };
    studentMonitorList.forEach((item) => {
      const key = `${item.student.id}_${exam.id}`;
      if (updated[key]) {
        updated[key].timeRemainingSeconds += 300;
      }
    });
    onUpdateSessions(updated);
    showToast('Đã cộng thêm 5 phút thời gian làm bài cho tất cả học sinh!');
  };

  // Thao tác: Thu bài toàn bộ phòng máy
  const handleCollectAllExams = () => {
    onFinishExam(exam.id);
    showToast('Đã thu bài và chấm điểm xong cho toàn bộ phòng thi!');
  };

  // Mô phỏng kiểm thử tải 60 học sinh đồng loạt
  const handleSimulate60Students = () => {
    setIsSimulating(true);
    const updated = { ...sessions };

    // Mô phỏng từng đợt: đăng nhập -> trả lời câu hỏi -> nộp bài
    studentMonitorList.forEach((item, idx) => {
      const key = `${item.student.id}_${exam.id}`;
      const paper = papers[key];
      const qSnapshots = paper?.questionSnapshots || [];

      // Sinh ngẫu nhiên câu trả lời hợp lý
      const simulatedAnswers: Record<string, any> = {};
      let correctSimulated = 0;

      qSnapshots.forEach((q) => {
        // Tỷ lệ học sinh làm đúng khoảng 75%
        const isCorrect = Math.random() < 0.78;
        const selectedId = isCorrect
          ? q.correctOptionId
          : q.options[Math.floor(Math.random() * q.options.length)].id;
        simulatedAnswers[q.id] = {
          questionId: q.id,
          selectedOptionId: selectedId,
          answeredAt: new Date().toISOString(),
        };
        if (selectedId === q.correctOptionId) correctSimulated++;
      });

      const rawScore = (correctSimulated / (qSnapshots.length || 1)) * exam.maxScore;
      const score = Math.round(rawScore * 100) / 100;

      updated[key] = {
        id: `sess_${item.student.id}_${exam.id}`,
        examId: exam.id,
        studentId: item.student.id,
        paperCode: paper?.paperCode || `MD${701 + idx}`,
        status: 'da_nop_bai',
        timeRemainingSeconds: 0,
        answers: simulatedAnswers,
        score,
        correctCount: correctSimulated,
        wrongCount: qSnapshots.length - correctSimulated,
        unansweredCount: 0,
        startedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        submittedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
      };
    });

    onUpdateSessions(updated);
    setTimeout(() => {
      setIsSimulating(false);
      showToast('Đã hoàn tất mô phỏng kiểm thử tải 60 máy học sinh! Hệ thống đã tự động chấm điểm xong.');
    }, 400);
  };

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="bg-emerald-600 text-white font-bold p-3.5 rounded-xl text-xs shadow-md flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}
      {/* Tiêu đề & Thông số kỳ thi đang giám sát */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-xl font-bold text-slate-800">
              Giám sát phòng thi trực tuyến: {exam.title}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Lớp: <strong>{exam.classes.join(', ')}</strong> • Thời gian:{' '}
            <strong>{exam.durationMinutes} phút</strong> • Số câu:{' '}
            <strong>{exam.questionIds.length}</strong> • Sĩ số dự thi:{' '}
            <strong>{eligibleStudents.length} học sinh</strong>
          </p>
        </div>

        {/* Nút điều khiển phòng thi */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Thêm 5 phút */}
          <button
            onClick={handleAdd5Minutes}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 text-xs font-bold px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors"
          >
            <PlusCircle className="w-4 h-4 text-blue-600" />
            <span>Thêm 5 phút</span>
          </button>

          {/* Thu bài tất cả */}
          <button
            onClick={handleCollectAllExams}
            className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Thu bài cả phòng</span>
          </button>

          {/* Mô phỏng tải 60 máy */}
          <button
            disabled={isSimulating}
            onClick={handleSimulate60Students}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm"
            title="Tự động mô phỏng 60 máy đồng loạt đăng nhập, làm bài và nộp bài để kiểm tra hiệu năng hệ thống"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>{isSimulating ? 'Đang mô phỏng...' : 'Mô phỏng 60 máy (Thử tải)'}</span>
          </button>
        </div>
      </div>

      {/* Thẻ chỉ số trạng thái phòng thi thời gian thực */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Sĩ số dự thi</p>
          <p className="text-xl font-black text-slate-800 mt-0.5">{totalCount}</p>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-xs">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase">Đã nộp bài</p>
          <p className="text-xl font-black text-emerald-800 mt-0.5">{submittedCount}</p>
        </div>
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-xs">
          <p className="text-[11px] font-semibold text-blue-700 uppercase">Đang làm bài</p>
          <p className="text-xl font-black text-blue-800 mt-0.5">{inProgressCount}</p>
        </div>
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-xs">
          <p className="text-[11px] font-semibold text-amber-700 uppercase">Tạm thoát / Mất mạng</p>
          <p className="text-xl font-black text-amber-800 mt-0.5">{disconnectedCount}</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">Chưa vào thi</p>
          <p className="text-xl font-black text-slate-700 mt-0.5">{offlineCount}</p>
        </div>
      </div>

      {/* Bộ lọc và thanh công cụ tìm kiếm máy */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Tìm theo tên, mã đăng nhập, mã đề..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
          />
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* Lọc theo trạng thái */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tất cả trạng thái ({studentMonitorList.length})</option>
            <option value="dang_lam_bai">Đang làm bài ({inProgressCount})</option>
            <option value="mat_ket_noi">Tạm thoát / Mất mạng ({disconnectedCount})</option>
            <option value="da_nop_bai">Đã nộp bài ({submittedCount})</option>
            <option value="da_dang_nhap">Đã đăng nhập ({loggedInCount})</option>
            <option value="chua_dang_nhap">Chưa vào ({offlineCount})</option>
          </select>

          {/* Chuyển chế độ xem: Lưới phòng máy / Bảng danh sách */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Lưới 60 máy
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Bảng chi tiết
            </button>
          </div>
        </div>
      </div>

      {/* HIỂN THỊ DẠNG LƯỚI PHÒNG THỰC HÀNH (60 MÁY TÍNH) */}
      {viewMode === 'grid' ? (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b">
            <span className="font-bold text-slate-700">Sơ đồ vị trí các máy trong phòng thi:</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-emerald-500" />
                <span>Đã nộp bài</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-blue-500" />
                <span>Đang làm bài</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-amber-400" />
                <span>Tạm thoát / Đã lưu</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-slate-200" />
                <span>Chưa vào</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-2.5">
            {filteredList.map((item) => {
              const isSubmitted = item.session.status === 'da_nop_bai';
              const isInProgress = item.session.status === 'dang_lam_bai';
              const isDisconnected = item.session.status === 'mat_ket_noi';
              const isLoggedIn = item.session.status === 'da_dang_nhap';

              let cardBg = 'bg-slate-50 border-slate-200 text-slate-600';

              if (isSubmitted) {
                cardBg = 'bg-emerald-50 border-emerald-300 text-emerald-950 ring-1 ring-emerald-400/30';
              } else if (isInProgress) {
                cardBg = 'bg-blue-50 border-blue-300 text-blue-950 ring-1 ring-blue-400/30';
              } else if (isDisconnected || isLoggedIn) {
                cardBg = 'bg-amber-50 border-amber-300 text-amber-950';
              }

              return (
                <div
                  key={item.student.id}
                  className={`p-2.5 rounded-xl border flex flex-col justify-between text-xs space-y-1.5 transition-all hover:scale-[1.02] shadow-xs ${cardBg}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[11px] text-slate-700">
                      Máy {String(item.workstationNumber).padStart(2, '0')}
                    </span>
                    <span className="font-mono text-[10px] font-bold bg-white/80 px-1 py-0.5 rounded border border-slate-200 text-slate-700">
                      {item.session.paperCode}
                    </span>
                  </div>

                  <div>
                    <p className="font-bold truncate text-[11px] text-slate-900" title={item.student.fullName}>
                      {item.student.fullName}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Lớp {item.student.className} • <code>{item.student.loginCode}</code>
                    </p>
                  </div>

                  <div className="pt-1 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                    {isSubmitted ? (
                      <span className="text-emerald-700 font-extrabold">
                        {item.session.score !== undefined ? `${item.session.score} điểm` : 'Đã nộp'}
                      </span>
                    ) : isInProgress ? (
                      <span className="text-blue-700 font-bold">
                        {item.answeredCount}/{item.totalQuestions} câu
                      </span>
                    ) : isDisconnected ? (
                      <span className="text-amber-800 font-bold">
                        Câu {(item.session.currentQuestionIndex ?? 0) + 1} (Đã lưu)
                      </span>
                    ) : isLoggedIn ? (
                      <span className="text-amber-700 font-medium">Đang chờ</span>
                    ) : (
                      <span className="text-slate-400">Chưa vào</span>
                    )}

                    <span className={`w-2 h-2 rounded-full ${isSubmitted ? 'bg-emerald-500' : isInProgress ? 'bg-blue-500 animate-ping' : isDisconnected || isLoggedIn ? 'bg-amber-400' : 'bg-slate-300'}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* HIỂN THỊ DẠNG BẢNG CHI TIẾT */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 text-center w-12">Máy</th>
                  <th className="py-3 px-4">Họ và tên</th>
                  <th className="py-3 px-4 text-center">Lớp</th>
                  <th className="py-3 px-4">Mã đăng nhập</th>
                  <th className="py-3 px-4 text-center">Mã đề riêng</th>
                  <th className="py-3 px-4 text-center">Tiến độ làm bài</th>
                  <th className="py-3 px-4 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-center">Điểm số</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map((item) => (
                  <tr key={item.student.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-center font-extrabold text-blue-900">
                      Máy {String(item.workstationNumber).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">{item.student.fullName}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-600">
                      {item.student.className}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-600">
                      {item.student.loginCode}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-bold">
                        {item.session.paperCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-700">
                      {item.answeredCount} / {item.totalQuestions} câu
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.session.status === 'da_nop_bai' ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                          Đã nộp bài
                        </span>
                      ) : item.session.status === 'dang_lam_bai' ? (
                        <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                          Đang làm bài
                        </span>
                      ) : item.session.status === 'mat_ket_noi' ? (
                        <span className="bg-amber-100 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-full">
                          Tạm thoát (Câu {(item.session.currentQuestionIndex ?? 0) + 1})
                        </span>
                      ) : item.session.status === 'da_dang_nhap' ? (
                        <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                          Đã đăng nhập
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-500 text-[11px] font-medium px-2 py-0.5 rounded-full">
                          Chưa vào
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-extrabold text-sm">
                      {item.session.score !== undefined ? (
                        <span className="text-emerald-700">{item.session.score}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
