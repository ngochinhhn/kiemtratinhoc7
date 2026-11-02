import React, { useState } from 'react';
import {
  BarChart3,
  FileDown,
  Users,
  Award,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Printer,
  ChevronDown,
} from 'lucide-react';
import { Exam, ExamResultSummary, Question, Student, StudentExamPaper, StudentExamSession } from '../types';
import { calculateExamResultSummary } from '../utils/grading';
import { exportExamResultsExcel } from '../utils/excelExport';

interface ResultsViewProps {
  exam: Exam | null;
  exams: Exam[];
  students: Student[];
  papers: Record<string, StudentExamPaper>;
  sessions: Record<string, StudentExamSession>;
  questions: Question[];
  onSelectExam: (examId: string) => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  exam,
  exams,
  students,
  papers,
  sessions,
  questions,
  onSelectExam,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

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

  // Danh sách các session của bài thi này
  const examSessions = Object.values(sessions).filter((s) => s.examId === exam.id);
  const examQuestions = questions.filter((q) => exam.questionIds.includes(q.id));

  // Tính toán chỉ số thống kê tổng hợp
  const summary: ExamResultSummary = calculateExamResultSummary(
    exam.id,
    exam.title,
    exam.classes.join(', '),
    examSessions,
    examQuestions
  );

  const studentMap = new Map(students.map((s) => [s.id, s]));

  // Xuất file Excel
  const handleExportExcel = () => {
    exportExamResultsExcel(
      exam.title,
      summary,
      examSessions,
      students,
      papers,
      questions
    );
  };

  // Chi tiết bài làm của học sinh đang được chọn xem
  const activeDetailStudent = selectedStudentId ? studentMap.get(selectedStudentId) : null;
  const activeDetailSession = selectedStudentId
    ? sessions[`${selectedStudentId}_${exam.id}`]
    : null;
  const activeDetailPaper = selectedStudentId
    ? papers[`${selectedStudentId}_${exam.id}`]
    : null;

  return (
    <div className="space-y-6">
      {/* Tiêu đề & Chọn bài kiểm tra & Xuất Excel */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-800">
              Bảng điểm & Thống kê kết quả kiểm tra
            </h1>
          </div>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs text-slate-500">Bài kiểm tra:</span>
            <select
              value={exam.id}
              onChange={(e) => onSelectExam(e.target.value)}
              className="py-1 px-2.5 text-xs font-bold text-blue-900 border border-slate-300 rounded-lg bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} ({e.classes.join(', ')})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportExcel}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <FileDown className="w-4 h-4" />
            <span>Xuất báo cáo Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Thẻ chỉ số điểm số tổng quan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Điểm trung bình</p>
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
            <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">Thủ khoa bài thi</p>
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
            <p className="text-[11px] font-semibold uppercase text-slate-500">Học lực Giỏi & Khá</p>
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
              % toàn lớp
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
          <h3 className="font-bold text-slate-800 text-sm">Phân bố xếp loại học lực</h3>
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

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-red-700">Chưa đạt (&lt; 5.0 điểm):</span>
                <span>{summary.weakCount} HS</span>
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
            Tỷ lệ trả lời đúng từng câu hỏi (Đánh giá mức độ tiếp thu)
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

      {/* Bảng điểm chi tiết toàn bộ học sinh */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">
            Bảng kết quả kiểm tra chi tiết theo học sinh
          </h3>
          <span className="text-xs text-slate-500">
            Bấm vào dòng của học sinh để xem chi tiết bài làm
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
                <th className="py-3 px-4 text-center">Chi tiết bài làm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {examSessions.map((session, idx) => {
                const student = studentMap.get(session.studentId);
                const isSelected = selectedStudentId === session.studentId;

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
                      ) : (
                        <span className="text-slate-400">Chưa nộp</span>
                      )}
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

            <div className="flex items-center space-x-3">
              <span className="text-xs text-slate-600">
                Đúng:{' '}
                <strong className="text-emerald-700">{activeDetailSession.correctCount}</strong> / Sai:{' '}
                <strong className="text-red-700">{activeDetailSession.wrongCount}</strong>
              </span>
              <span className="text-base font-black bg-blue-700 text-white px-3 py-1 rounded-lg shadow-sm">
                {activeDetailSession.score} điểm
              </span>
              <button
                onClick={() => setSelectedStudentId(null)}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border font-semibold"
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
    </div>
  );
};
