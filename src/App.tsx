import React, { useState, useEffect } from 'react';
import {
  Exam,
  Question,
  Role,
  Student,
  StudentExamPaper,
  StudentExamSession,
  SystemConfig,
} from './types';
import { appStorage } from './utils/storage';
import { Navbar } from './components/Navbar';
import { TeacherDashboard } from './components/TeacherDashboard';
import { QuestionBankView } from './components/QuestionBankView';
import { StudentManagementView } from './components/StudentManagementView';
import { ExamManagementView } from './components/ExamManagementView';
import { ExamMonitoringView } from './components/ExamMonitoringView';
import { ResultsView } from './components/ResultsView';
import { SystemSettingsView } from './components/SystemSettingsView';
import { StudentExamView } from './components/StudentExamView';
import { NetSupportGuideModal } from './components/NetSupportGuideModal';
import { LoginView } from './components/LoginView';
import { HelpView } from './components/HelpView';
import { getActiveRunningExam } from './utils/auth';

export default function App() {
  // Kiểm tra trạng thái đăng nhập ban đầu (hỗ trợ ?autostart=1 nếu cần kiểm thử nhanh)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('autostart') === '1';
    }
    return false;
  });

  // Vai trò: 'giaovien' (Giáo viên quản lý) hoặc 'hocsinh' (Học sinh làm bài)
  const [currentRole, setCurrentRole] = useState<Role>('giaovien');
  const [authenticatedStudent, setAuthenticatedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<string>('tongquan');

  // Dữ liệu ứng dụng
  const [questions, setQuestions] = useState<Question[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [papers, setPapers] = useState<Record<string, StudentExamPaper>>({});
  const [sessions, setSessions] = useState<Record<string, StudentExamSession>>({});
  const [config, setConfig] = useState<SystemConfig>(appStorage.getConfig());

  // Modal hướng dẫn NetSupport School & Modal Trợ giúp
  const [isNetSupportOpen, setIsNetSupportOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Trạng thái đồng bộ trực tiếp vào thư mục src/data/ (seedQuestions.ts, seedStudents.ts, seedExams.ts)
  const [lastRepoSyncAt, setLastRepoSyncAt] = useState<string | null>(() =>
    appStorage.getLastRepoSyncAt()
  );
  const [isSyncingData, setIsSyncingData] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Đề thi đang chọn để giám sát / xem kết quả
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  // Hàm lưu & đồng bộ trực tiếp toàn bộ dữ liệu hiện hành vào src/data/
  const syncTeacherDataToRepo = async () => {
    setIsSyncingData(true);
    try {
      const res = await appStorage.flushRepoSyncBeforeLogout();
      if (res.ok && res.updatedAt) {
        setLastRepoSyncAt(res.updatedAt);
      } else {
        setLastRepoSyncAt(appStorage.getLastRepoSyncAt());
      }
      return res;
    } finally {
      setIsSyncingData(false);
    }
  };

  // Nạp dữ liệu ban đầu
  const reloadData = () => {
    appStorage.ensureInitialized();
    setQuestions(appStorage.getQuestions());
    setStudents(appStorage.getStudents());
    setClasses(appStorage.getClasses());
    const exList = appStorage.getExams();
    setExams(exList);
    setPapers(appStorage.getPapers());
    setSessions(appStorage.getSessions());
    const cfg = appStorage.getConfig();
    setConfig(cfg);
    setLastRepoSyncAt(appStorage.getLastRepoSyncAt());

    if (!selectedExamId) {
      const active = exList.find((e) => e.status === 'dang_dien_ra') || exList[0];
      if (active) setSelectedExamId(active.id);
    }
  };

  useEffect(() => {
    reloadData();
    void syncTeacherDataToRepo();
  }, []);

  // Đảm bảo tự động lưu vào src/data/ trước khi Giáo viên đóng tab hoặc tải lại trang
  useEffect(() => {
    if (!isAuthenticated || currentRole !== 'giaovien') return;
    const handleBeforeUnload = () => {
      appStorage.syncViaBeacon();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAuthenticated, currentRole]);

  // Xử lý đăng nhập Giáo viên (Tự động đồng bộ dữ liệu ngay khi đăng nhập với vai trò Giáo viên)
  const handleLoginTeacher = () => {
    setCurrentRole('giaovien');
    setAuthenticatedStudent(null);
    setActiveTab('tongquan');
    setIsAuthenticated(true);
    void syncTeacherDataToRepo();
  };

  // Xử lý đăng nhập Học sinh
  const handleLoginStudent = (student: Student) => {
    setCurrentRole('hocsinh');
    setAuthenticatedStudent(student);
    setIsAuthenticated(true);
  };

  // Đăng xuất về cửa sổ đăng nhập ban đầu:
  // Nếu đang ở vai trò Giáo viên, bắt buộc thực hiện lưu & cập nhật toàn bộ Data vào src/data/ TRƯỚC KHI thoát tài khoản
  const handleLogout = async () => {
    if (currentRole === 'giaovien') {
      setIsLoggingOut(true);
      try {
        await syncTeacherDataToRepo();
      } finally {
        setIsLoggingOut(false);
      }
    }
    setIsAuthenticated(false);
    setAuthenticatedStudent(null);
  };

  // Xử lý cập nhật ngân hàng câu hỏi (đồng bộ cả đề thi, phiếu bài làm và tự động lưu vào src/data/)
  const handleSaveQuestions = (newQuestions: Question[]) => {
    appStorage.saveQuestions(newQuestions);
    reloadData();
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Xử lý cập nhật danh sách học sinh (tự động lưu vào src/data/)
  const handleSaveStudents = (newStudents: Student[]) => {
    appStorage.saveStudents(newStudents);
    setStudents(newStudents);
    setClasses(appStorage.getClasses());
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Tạo lớp mới
  const handleCreateClass = (className: string) => {
    const ok = appStorage.addClass(className);
    reloadData();
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
    return ok;
  };

  // Thêm nhiều lớp cùng lúc (từ Excel hoặc danh sách)
  const handleAddClasses = (classNames: string[]) => {
    const result = appStorage.addClasses(classNames);
    reloadData();
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
    return result;
  };

  // Xóa lớp
  const handleDeleteClass = (className: string, deleteStudents: boolean) => {
    appStorage.deleteClass(className, deleteStudents);
    reloadData();
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Xóa hàng loạt học sinh
  const handleBatchDeleteStudents = (studentIds: string[]) => {
    appStorage.batchDeleteStudents(studentIds);
    reloadData();
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Xử lý cập nhật đề thi
  const handleSaveExams = (newExams: Exam[]) => {
    appStorage.saveExams(newExams);
    setExams(newExams);
    setPapers(appStorage.getPapers());
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Xóa đề thi
  const handleDeleteExam = (examId: string) => {
    appStorage.deleteExam(examId);
    reloadData();
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Mở kỳ thi
  const handleActivateExam = (examId: string) => {
    appStorage.activateExam(examId);
    reloadData();
    setSelectedExamId(examId);
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Tạm dừng kỳ thi
  const handlePauseExam = (examId: string) => {
    appStorage.pauseExam(examId);
    reloadData();
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Kết thúc kỳ thi
  const handleFinishExam = (examId: string) => {
    appStorage.finishExam(examId);
    reloadData();
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Cập nhật các session (từ giám sát hoặc mô phỏng)
  const handleUpdateSessions = (newSessions: Record<string, StudentExamSession>) => {
    appStorage.saveSessions(newSessions);
    setSessions(newSessions);
  };

  // Cập nhật 1 session (từ học sinh làm bài)
  const handleUpdateSingleSession = (session: StudentExamSession) => {
    appStorage.saveSession(session);
    setSessions((prev) => ({
      ...prev,
      [`${session.studentId}_${session.examId}`]: session,
    }));
  };

  // Cập nhật cấu hình hệ thống
  const handleSaveConfig = (newConfig: SystemConfig) => {
    appStorage.saveConfig(newConfig);
    setConfig(newConfig);
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Sao lưu JSON
  const handleExportBackup = () => {
    const json = appStorage.exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Sao_Luu_SMART_TEST_7_${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Phục hồi JSON
  const handleImportBackup = (jsonString: string) => {
    const success = appStorage.importBackup(jsonString);
    if (success) {
      reloadData();
      if (currentRole === 'giaovien') {
        void syncTeacherDataToRepo();
      }
    }
    return success;
  };

  // Nạp lại mặc định
  const handleResetDefaults = () => {
    appStorage.resetToDefaults();
    reloadData();
    if (currentRole === 'giaovien') {
      void syncTeacherDataToRepo();
    }
  };

  // Kỳ thi đang thực sự diễn ra (status === 'dang_dien_ra') cho học sinh và mục Tổng quan
  const openStudentExam = getActiveRunningExam(exams, config.activeExamId);

  // Đề thi đang chọn trong màn hình Giám sát / Bảng điểm của Giáo viên
  const activeExam =
    openStudentExam ||
    exams.find((e) => e.id === selectedExamId) ||
    exams[0] ||
    null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white">
      {/* Thanh điều hướng chính (hiển thị sau khi đăng nhập) */}
      {isAuthenticated && (
        <Navbar
          currentRole={currentRole}
          setCurrentRole={setCurrentRole}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          serverIp={config.serverIp}
          serverPort={config.serverPort}
          schoolName={config.schoolName}
          loggedInStudent={authenticatedStudent}
          onOpenNetSupportGuide={() => setIsNetSupportOpen(true)}
          onOpenHelpModal={() => setIsHelpModalOpen(true)}
          onLogout={handleLogout}
          onSyncData={() => {
            void syncTeacherDataToRepo();
          }}
          isSyncingData={isSyncingData}
          isLoggingOut={isLoggingOut}
          lastRepoSyncAt={lastRepoSyncAt}
        />
      )}

      {/* Thân ứng dụng */}
      {!isAuthenticated ? (
        <LoginView
          students={students}
          activeExam={openStudentExam}
          schoolName={config.schoolName}
          onLoginTeacher={handleLoginTeacher}
          onLoginStudent={handleLoginStudent}
          onOpenHelp={() => setIsHelpModalOpen(true)}
        />
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {currentRole === 'hocsinh' ? (
            /* GIAO DIỆN HỌC SINH THCS (RẤT ĐƠN GIẢN, TẬP TRUNG LÀM BÀI) */
            <StudentExamView
              students={students}
              exams={exams}
              papers={papers}
              sessions={sessions}
              activeExamId={openStudentExam?.id || null}
              serverIp={config.serverIp}
              initialStudent={authenticatedStudent}
              onUpdateSession={handleUpdateSingleSession}
              onStudentExit={handleLogout}
            />
          ) : (
            /* GIAO DIỆN GIÁO VIÊN */
            <div>
              {activeTab === 'tongquan' && (
                <TeacherDashboard
                  students={students}
                  questions={questions}
                  exams={exams}
                  activeExam={openStudentExam}
                  serverIp={config.serverIp}
                  serverPort={config.serverPort}
                  onNavigate={(tab) => {
                    setActiveTab(tab);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onOpenNetSupportGuide={() => setIsNetSupportOpen(true)}
                />
              )}

              {activeTab === 'nganhang' && (
                <QuestionBankView
                  questions={questions}
                  onSaveQuestions={handleSaveQuestions}
                />
              )}

              {activeTab === 'hocsinh' && (
                <StudentManagementView
                  students={students}
                  classes={classes}
                  schoolName={config.schoolName}
                  onSaveStudents={handleSaveStudents}
                  onCreateClass={handleCreateClass}
                  onAddClasses={handleAddClasses}
                  onDeleteClass={handleDeleteClass}
                  onBatchDeleteStudents={handleBatchDeleteStudents}
                />
              )}

              {activeTab === 'dethi' && (
                <ExamManagementView
                  exams={exams}
                  questions={questions}
                  students={students}
                  onSaveExams={handleSaveExams}
                  onDeleteExam={handleDeleteExam}
                  onActivateExam={handleActivateExam}
                  onPauseExam={handlePauseExam}
                  onFinishExam={handleFinishExam}
                  onNavigateToMonitoring={(examId) => {
                    setSelectedExamId(examId);
                    setActiveTab('giamsat');
                  }}
                  onNavigateToResults={(examId) => {
                    setSelectedExamId(examId);
                    setActiveTab('ketqua');
                  }}
                />
              )}

              {activeTab === 'giamsat' && (
                <ExamMonitoringView
                  exam={activeExam}
                  students={students}
                  papers={papers}
                  sessions={sessions}
                  serverIp={config.serverIp}
                  serverPort={config.serverPort}
                  onUpdateSessions={handleUpdateSessions}
                  onFinishExam={handleFinishExam}
                  onPauseExam={handlePauseExam}
                  onResumeExam={handleActivateExam}
                />
              )}

              {activeTab === 'ketqua' && (
                <ResultsView
                  exam={activeExam}
                  exams={exams}
                  students={students}
                  papers={papers}
                  sessions={sessions}
                  questions={questions}
                  onSelectExam={(id) => setSelectedExamId(id)}
                />
              )}

              {activeTab === 'caidat' && (
                <SystemSettingsView
                  config={config}
                  stats={{
                    questionsCount: questions.length,
                    classesCount: classes.length,
                    studentsCount: students.length,
                    examsCount: exams.length,
                  }}
                  lastRepoSyncAt={lastRepoSyncAt}
                  onSaveConfig={handleSaveConfig}
                  onSyncToRepo={syncTeacherDataToRepo}
                  onExportBackup={handleExportBackup}
                  onImportBackup={handleImportBackup}
                  onResetDefaults={handleResetDefaults}
                />
              )}

              {activeTab === 'trogiup' && <HelpView />}
            </div>
          )}
        </main>
      )}

      {/* Footer hệ thống */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            SMART TEST 7 – Hệ thống thi trắc nghiệm trực tuyến môn Tin học 7 (Bộ sách Kết nối tri thức với cuộc sống)
          </span>
          <span className="font-semibold text-blue-800">
            Thiết kế bởi thầy giáo: Ngô Văn Chinh. Trường TH &amp; THCS Thụy Lâm - Thư Lâm
          </span>
        </div>
      </footer>

      {/* Modal Hướng dẫn NetSupport School */}
      <NetSupportGuideModal
        isOpen={isNetSupportOpen}
        onClose={() => setIsNetSupportOpen(false)}
        serverIp={config.serverIp}
        serverPort={config.serverPort}
      />

      {/* Modal Trợ giúp & Thông tin tác giả (khi mở từ màn hình đăng nhập hoặc chế độ Học sinh) */}
      {isHelpModalOpen && (
        <HelpView isModal={true} onClose={() => setIsHelpModalOpen(false)} />
      )}
    </div>
  );
}
