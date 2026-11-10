import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
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
import { LoginView } from './components/LoginView';
import { HelpView } from './components/HelpView';
import { getActiveRunningExam, getActiveRunningExams } from './utils/auth';
import {
  ensureStudentAnonymousAuth,
  FIRESTORE_PRICING_URL,
  FIRESTORE_QUOTA_UPGRADE_URL,
  resetFirestoreQuotaCircuitBreaker,
  signInTeacherWithGoogle,
  signOutFirebase,
  subscribeAllFirestoreData,
  subscribeFirebaseAuth,
  syncAppDataToFirestore,
  syncSessionToFirestore,
} from './utils/firebaseSync';

const ACTIVE_STUDENT_STORAGE_KEY = 'smarttest7_active_student_v1';
const ACTIVE_STUDENT_EXAM_ID_KEY = 'smarttest7_active_student_exam_id_v1';

export default function App() {
  // Đọc phiên học sinh đang thi trực tuyến nếu trình duyệt bị tải lại khi rớt mạng
  const initialSavedStudent = (() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.sessionStorage.getItem(ACTIVE_STUDENT_STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw) as Student;
        }
      } catch (_e) {
        // ignore
      }
    }
    return null;
  })();

  const initialSavedStudentExamId = (() => {
    if (typeof window !== 'undefined') {
      try {
        return window.sessionStorage.getItem(ACTIVE_STUDENT_EXAM_ID_KEY) || null;
      } catch (_e) {
        // ignore
      }
    }
    return null;
  })();

  // Kiểm tra trạng thái đăng nhập ban đầu (hỗ trợ ?autostart=1 hoặc khôi phục phiên học sinh đang thi)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return true;
      if (initialSavedStudent) return true;
    }
    return false;
  });

  // Vai trò: 'giaovien' (Giáo viên quản lý) hoặc 'hocsinh' (Học sinh làm bài)
  const [currentRole, setCurrentRole] = useState<Role>(() =>
    initialSavedStudent ? 'hocsinh' : 'giaovien'
  );
  const [authenticatedStudent, setAuthenticatedStudent] = useState<Student | null>(
    initialSavedStudent
  );
  const [studentChosenExamId, setStudentChosenExamId] = useState<string | null>(
    initialSavedStudentExamId
  );
  const [activeTab, setActiveTab] = useState<string>('tongquan');

  // Dữ liệu ứng dụng
  const [questions, setQuestions] = useState<Question[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [papers, setPapers] = useState<Record<string, StudentExamPaper>>({});
  const [sessions, setSessions] = useState<Record<string, StudentExamSession>>({});
  const [config, setConfig] = useState<SystemConfig>(appStorage.getConfig());

  // Modal Trợ giúp
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Trạng thái đồng bộ trực tiếp vào thư mục src/data/ (seedQuestions.ts, seedStudents.ts, seedExams.ts)
  const [lastRepoSyncAt, setLastRepoSyncAt] = useState<string | null>(() =>
    appStorage.getLastRepoSyncAt()
  );
  const [firebaseUserEmail, setFirebaseUserEmail] = useState<string | null>(null);
  const [lastFirestoreSyncAt, setLastFirestoreSyncAt] = useState<string | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [isQuotaFallbackActive, setIsQuotaFallbackActive] = useState<boolean>(false);
  const [isQuotaBannerDismissed, setIsQuotaBannerDismissed] = useState<boolean>(false);
  const [isSyncingData, setIsSyncingData] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Đề thi đang chọn để giám sát / xem kết quả
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  const isTeacherRef = useRef<boolean>(isAuthenticated && currentRole === 'giaovien');
  const hasSeededEmptyFirestoreRef = useRef<boolean>(false);
  const hasInitialFirestoreSnapshotArrivedRef = useRef<boolean>(false);
  const pendingTeacherSyncAfterInitRef = useRef<boolean>(false);
  const isWritingToFirestoreRef = useRef<boolean>(false);

  useEffect(() => {
    isTeacherRef.current = isAuthenticated && currentRole === 'giaovien';
  }, [isAuthenticated, currentRole]);

  // Đồng bộ toàn bộ dữ liệu của Giáo viên lên Cloud Firestore (hoặc tự động dùng Server Sync nếu Firestore hết Quota trong ngày)
  const syncTeacherDataToFirestore = async () => {
    isWritingToFirestoreRef.current = true;
    try {
      const res = await syncAppDataToFirestore({
        questions: appStorage.getQuestions(),
        students: appStorage.getStudents(),
        exams: appStorage.getExams(),
        sessions: appStorage.getSessions(),
        config: appStorage.getConfig(),
        onError: (errMsg) => setFirestoreError(errMsg),
        onQuotaExceeded: () => {
          setIsQuotaFallbackActive(true);
          setFirestoreError(null);
        },
      });
      if (res.ok && res.syncedAt) {
        setLastFirestoreSyncAt(res.syncedAt);
        setFirestoreError(null);
        if (res.quotaFallback) {
          setIsQuotaFallbackActive(true);
        }
      } else if (!res.ok && res.error) {
        setFirestoreError(res.error);
      }
      return res;
    } finally {
      isWritingToFirestoreRef.current = false;
    }
  };

  // Hàm lưu & đồng bộ trực tiếp toàn bộ dữ liệu hiện hành vào src/data/ VÀ lên Cloud Firestore
  const syncTeacherDataToRepo = async () => {
    setIsSyncingData(true);
    try {
      const [repoRes] = await Promise.all([
        appStorage.flushRepoSyncBeforeLogout(),
        syncTeacherDataToFirestore(),
      ]);
      if (repoRes.ok && repoRes.updatedAt) {
        setLastRepoSyncAt(repoRes.updatedAt);
      } else {
        setLastRepoSyncAt(appStorage.getLastRepoSyncAt());
      }
      return repoRes;
    } finally {
      setIsSyncingData(false);
    }
  };

  // Nạp dữ liệu từ bộ nhớ ứng dụng vào React state
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

  // Khởi chạy ứng dụng: Lắng nghe dữ liệu thời gian thực (onSnapshot) từ Firebase Firestore
  // ở CẢ chế độ Giáo viên và Học sinh đối với exams, questions, students và submissions.
  useEffect(() => {
    reloadData();

    const unsubAuth = subscribeFirebaseAuth((user) => {
      setFirebaseUserEmail(user && !user.isAnonymous ? user.email || null : null);
    });

    const unsubFirestore = subscribeAllFirestoreData({
      onExams: (remoteExams, isEmpty) => {
        if (isWritingToFirestoreRef.current) return;
        const wasFirstSnapshot = !hasInitialFirestoreSnapshotArrivedRef.current;
        hasInitialFirestoreSnapshotArrivedRef.current = true;

        if (!isEmpty && remoteExams.length > 0) {
          // Khi trên Firebase đã có dữ liệu, tuyệt đối ưu tiên hiển thị dữ liệu từ Firebase,
          // ghi đè lên localStorage và bỏ qua dữ liệu cũ trong seedExams.ts
          appStorage.applyRemoteExamsFromFirestore(remoteExams);
          const updatedExams = appStorage.getExams();
          setExams(updatedExams);
          setPapers(appStorage.getPapers());
          setSessions(appStorage.getSessions());
          setConfig(appStorage.getConfig());
          setLastFirestoreSyncAt(new Date().toISOString());
          setFirestoreError(null);
          setSelectedExamId((prev) => {
            if (prev && updatedExams.some((e) => e.id === prev)) return prev;
            const active = updatedExams.find((e) => e.status === 'dang_dien_ra') || updatedExams[0];
            return active ? active.id : null;
          });
          if (wasFirstSnapshot && pendingTeacherSyncAfterInitRef.current) {
            pendingTeacherSyncAfterInitRef.current = false;
            void syncTeacherDataToFirestore();
          }
        } else if (
          isEmpty &&
          (isTeacherRef.current || pendingTeacherSyncAfterInitRef.current) &&
          !hasSeededEmptyFirestoreRef.current
        ) {
          hasSeededEmptyFirestoreRef.current = true;
          pendingTeacherSyncAfterInitRef.current = false;
          void syncTeacherDataToFirestore();
        }
      },
      onQuestions: (remoteQuestions, isEmpty) => {
        if (isWritingToFirestoreRef.current) return;
        if (!isEmpty && remoteQuestions.length > 0) {
          appStorage.applyRemoteQuestionsFromFirestore(remoteQuestions);
          setQuestions(appStorage.getQuestions());
          setPapers(appStorage.getPapers());
          setLastFirestoreSyncAt(new Date().toISOString());
        }
      },
      onStudents: (remoteStudents, isEmpty) => {
        if (isWritingToFirestoreRef.current) return;
        if (!isEmpty && remoteStudents.length > 0) {
          appStorage.applyRemoteStudentsFromFirestore(remoteStudents);
          setStudents(appStorage.getStudents());
          setClasses(appStorage.getClasses());
          setPapers(appStorage.getPapers());
          setSessions(appStorage.getSessions());
          setLastFirestoreSyncAt(new Date().toISOString());
        }
      },
      onSubmissions: (remoteSubmissions) => {
        if (remoteSubmissions.length > 0) {
          appStorage.mergeRemoteSubmissionsFromFirestore(
            remoteSubmissions,
            isTeacherRef.current
          );
          setSessions(appStorage.getSessions());
          setStudents(appStorage.getStudents());
          setLastFirestoreSyncAt(new Date().toISOString());
        }
      },
      onError: (errMsg) => {
        setFirestoreError(errMsg);
      },
      onQuotaExceeded: () => {
        setIsQuotaFallbackActive(true);
        setFirestoreError(null);
        setLastFirestoreSyncAt(new Date().toISOString());
      },
    });

    return () => {
      unsubAuth();
      unsubFirestore();
    };
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

  // Xử lý đăng nhập Giáo viên (bằng tài khoản admin nội bộ hoặc Google):
  // Tự động kết nối và đọc/ghi trực tiếp lên Firebase Firestore giống hệt như đăng nhập Google
  const handleLoginTeacher = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(ACTIVE_STUDENT_STORAGE_KEY);
      window.sessionStorage.removeItem(ACTIVE_STUDENT_EXAM_ID_KEY);
    }
    void ensureStudentAnonymousAuth();
    isTeacherRef.current = true;
    setCurrentRole('giaovien');
    setAuthenticatedStudent(null);
    setStudentChosenExamId(null);
    setActiveTab('tongquan');
    setIsAuthenticated(true);
    setFirestoreError(null);
    if (hasInitialFirestoreSnapshotArrivedRef.current) {
      void syncTeacherDataToFirestore();
    } else {
      pendingTeacherSyncAfterInitRef.current = true;
    }
  };

  // Đăng nhập Giáo viên qua Google Firebase Auth
  const handleLoginTeacherGoogle = async () => {
    const user = await signInTeacherWithGoogle();
    setFirebaseUserEmail(user.email || null);
    handleLoginTeacher();
  };

  // Xử lý đăng nhập Học sinh (kèm kỳ thi mà học sinh chọn tham dự & tự động xác thực ẩn danh Firebase)
  const handleLoginStudent = (student: Student, chosenExamId?: string) => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(ACTIVE_STUDENT_STORAGE_KEY, JSON.stringify(student));
        if (chosenExamId) {
          window.sessionStorage.setItem(ACTIVE_STUDENT_EXAM_ID_KEY, chosenExamId);
        }
      } catch (_e) {
        // ignore
      }
    }
    void ensureStudentAnonymousAuth();
    isTeacherRef.current = false;
    setCurrentRole('hocsinh');
    setAuthenticatedStudent(student);
    if (chosenExamId) {
      setStudentChosenExamId(chosenExamId);
    }
    setIsAuthenticated(true);
  };

  // Đăng xuất về cửa sổ đăng nhập ban đầu:
  // Nếu đang ở vai trò Giáo viên, bắt buộc thực hiện lưu & cập nhật toàn bộ Data vào src/data/ TRƯỚC KHI thoát tài khoản
  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(ACTIVE_STUDENT_STORAGE_KEY);
      window.sessionStorage.removeItem(ACTIVE_STUDENT_EXAM_ID_KEY);
    }
    if (currentRole === 'giaovien') {
      setIsLoggingOut(true);
      try {
        await syncTeacherDataToRepo();
        if (firebaseUserEmail) {
          await signOutFirebase();
          setFirebaseUserEmail(null);
        }
      } finally {
        setIsLoggingOut(false);
      }
    }
    setIsAuthenticated(false);
    setAuthenticatedStudent(null);
    setStudentChosenExamId(null);
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

  // Cập nhật các session (từ giám sát hoặc mô phỏng) và đồng bộ điểm học sinh vào danh sách lớp
  const handleUpdateSessions = (newSessions: Record<string, StudentExamSession>) => {
    appStorage.saveSessions(newSessions);
    setSessions(newSessions);
    setStudents(appStorage.getStudents());
  };

  // Cập nhật 1 session (từ học sinh làm bài) và đồng bộ điểm vào danh sách lớp khi nộp bài
  const handleUpdateSingleSession = (session: StudentExamSession) => {
    appStorage.saveSession(session);
    setSessions((prev) => ({
      ...prev,
      [`${session.studentId}_${session.examId}`]: session,
    }));
    if (session.status === 'da_nop_bai' && session.score !== undefined) {
      setStudents(appStorage.getStudents());
    }
    void syncSessionToFirestore(session);
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

  // Danh sách tất cả các kỳ thi đang thực sự diễn ra (status === 'dang_dien_ra')
  const openStudentExams = getActiveRunningExams(exams, studentChosenExamId || config.activeExamId);
  const openStudentExam = getActiveRunningExam(exams, studentChosenExamId || config.activeExamId);

  // Đề thi đang chọn trong màn hình Giám sát / Bảng điểm của Giáo viên
  const activeExam =
    exams.find((e) => e.id === selectedExamId) ||
    openStudentExam ||
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

      {/* THÔNG BÁO CHẾ ĐỘ ĐỒNG BỘ DỰ PHÒNG TỰ ĐỘNG KHI FIREBASE FIRESTORE HẾT HẠN MỨC ĐỌC MIỄN PHÍ TRONG NGÀY (CHỈ HIỂN THỊ CHO GIÁO VIÊN) */}
      {isQuotaFallbackActive && !isQuotaBannerDismissed && isAuthenticated && currentRole === 'giaovien' && (
        <div
          data-testid="firestore-quota-fallback-banner"
          className="bg-amber-50 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs shadow-xs"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-extrabold text-amber-900">
                  Đã kích hoạt Chế độ Đồng bộ Máy chủ Trực tiếp (Do Firestore tạm hết hạn mức đọc miễn phí trong ngày):
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Hạn mức <code>Free daily read units</code> của cơ sở dữ liệu Firestore miền phí sẽ tự động làm mới vào ngày hôm sau. Hiện tại ứng dụng <strong>đang hoạt động bình thường 100%</strong> qua kênh đồng bộ trực tiếp của máy chủ &amp; tệp dữ liệu hệ thống (Học sinh làm bài, nộp bài và Giáo viên xuất điểm Excel không bị gián đoạn).{' '}
                  <a
                    href={FIRESTORE_QUOTA_UPGRADE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-bold text-blue-700 hover:text-blue-900"
                  >
                    Mở trang quản lý/nâng cấp Database trên Firebase Console
                  </a>{' '}
                  |{' '}
                  <a
                    href={FIRESTORE_PRICING_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold text-amber-900 hover:text-amber-700"
                  >
                    Chi tiết hạn mức Spark
                  </a>
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => {
                  resetFirestoreQuotaCircuitBreaker();
                  setIsQuotaFallbackActive(false);
                  void syncTeacherDataToFirestore();
                }}
                className="bg-amber-700 hover:bg-amber-800 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Thử kết nối lại Firestore</span>
              </button>
              <button
                type="button"
                onClick={() => setIsQuotaBannerDismissed(true)}
                className="p-1.5 text-amber-800 hover:bg-amber-100 rounded-lg cursor-pointer"
                title="Ẩn thông báo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BANNER HIỂN THỊ CHI TIẾT LỖI ĐỒNG BỘ FIREBASE FIRESTORE (NẾU BỊ CHẶN BỞI SECURITY RULES HOẶC LỖI MẠNG) */}
      {firestoreError && !isQuotaFallbackActive && (
        <div
          data-testid="firestore-error-banner"
          className="bg-red-50 border-b border-red-300 text-red-900 px-4 py-3 text-xs shadow-xs"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-extrabold text-red-800">
                  Cảnh báo lỗi đồng bộ Firebase Firestore:
                </p>
                <p className="font-mono text-[11px] text-red-700 break-all">
                  {firestoreError}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
              {currentRole === 'giaovien' && isAuthenticated && (
                <button
                  type="button"
                  onClick={() => void syncTeacherDataToFirestore()}
                  className="bg-red-700 hover:bg-red-800 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Thử ghi lại lên Firebase</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setFirestoreError(null)}
                className="p-1.5 text-red-700 hover:bg-red-100 rounded-lg cursor-pointer"
                title="Đóng thông báo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thân ứng dụng */}
      {!isAuthenticated ? (
        <LoginView
          students={students}
          activeExam={openStudentExam}
          activeExams={openStudentExams}
          schoolName={config.schoolName}
          onLoginTeacher={handleLoginTeacher}
          onLoginTeacherGoogle={handleLoginTeacherGoogle}
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
              activeExamId={studentChosenExamId || openStudentExam?.id || null}
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
                  activeExams={openStudentExams}
                  serverIp={config.serverIp}
                  serverPort={config.serverPort}
                  onNavigate={(tab) => {
                    setActiveTab(tab);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
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
                  exams={exams}
                  sessions={sessions}
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
                  firebaseUserEmail={firebaseUserEmail}
                  lastFirestoreSyncAt={lastFirestoreSyncAt}
                  onConnectFirebaseGoogle={async () => {
                    const user = await signInTeacherWithGoogle();
                    setFirebaseUserEmail(user.email || null);
                    await syncTeacherDataToFirestore();
                  }}
                  onSyncFirestoreCloud={syncTeacherDataToFirestore}
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
            Thiết kế bởi thầy giáo: Ngô Văn Chinh. Trường TH &amp; THCS Thụy Lâm - Xã Thư Lâm - TP Hà Nội
          </span>
        </div>
      </footer>

      {/* Modal Trợ giúp & Thông tin tác giả (khi mở từ màn hình đăng nhập hoặc chế độ Học sinh) */}
      {isHelpModalOpen && (
        <HelpView isModal={true} onClose={() => setIsHelpModalOpen(false)} />
      )}
    </div>
  );
}
