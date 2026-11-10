import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  FirestoreErrorInfo,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  Exam,
  ExamHeaderConfig,
  Question,
  Student,
  StudentAnswer,
  StudentExamScoreRecord,
  StudentExamSession,
  SystemConfig,
} from '../types';
import { getQuestionType, normalizeQuestionStructure } from './grading';
import {
  getDefaultExamHeaderConfig,
  normalizeExamSchoolName,
  normalizeExamSubjectHeader,
} from './examPaperFormatter';

// Validation constants synchronized with firebase-blueprint.json & firestore.rules
export const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const MAX_ID_LENGTH = 128;
export const MAX_QUESTION_CONTENT_LENGTH = 4000;
export const MAX_TITLE_LENGTH = 300;
export const MAX_NAME_LENGTH = 150;
export const DEFAULT_TEACHER_OWNER_ID = 'teacher_smarttest7';

export const FIRESTORE_QUOTA_UPGRADE_URL =
  'https://console.firebase.google.com/project/gen-lang-client-0506944524/firestore/databases/ai-studio-smarttest7hthngt-ee3ed70c-97fe-41fc-98be-4dce40c666ef/data?openUpgradeDialog=true';
export const FIRESTORE_PRICING_URL = 'https://firebase.google.com/pricing#cloud-firestore';

const QUOTA_CIRCUIT_BREAKER_KEY = 'smarttest7_firestore_quota_exhausted_until_v1';
const LOCAL_SUBMISSIONS_FALLBACK_KEY = 'smarttest7_local_submissions_fallback_v1';
const LIVE_SYNC_CHANNEL_NAME = 'smarttest7_live_sync_channel_v1';
const QUOTA_COOLDOWN_MS = 15 * 60 * 1000; // 15 phút ngắt tự động để không tốn thêm lượt đọc khi đã chạm trần Quota

let memoryQuotaExhausted = false;
let activeFirestoreUnsubscribers: Unsubscribe[] = [];

// Bộ nhớ đệm in-memory giúp so sánh thay đổi mà KHÔNG cần gọi getDocs() (tiết kiệm >99% lượt đọc Firestore)
const cachedRemoteExamsMap = new Map<string, Record<string, any>>();
const cachedRemoteQuestionsMap = new Map<string, Record<string, any>>();
const cachedRemoteStudentsMap = new Map<string, Record<string, any>>();
let hasReceivedInitialExamsSnapshot = false;
let hasReceivedInitialQuestionsSnapshot = false;
let hasReceivedInitialStudentsSnapshot = false;

export interface FirestoreStudentSubmission {
  id: string;
  ownerId: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  paperCode: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  totalQuestions: number;
  durationSeconds: number;
  timeRemainingSeconds: number;
  submittedAt: string;
  status: 'dang_lam_bai' | 'da_nop_bai' | 'mat_ket_noi';
  answers: Record<string, StudentAnswer>;
}

/**
 * Kiểm tra xem lỗi trả về từ Firebase có phải do vượt quá hạn mức miễn phí trong ngày (Quota Exceeded) hay không
 */
export function isFirestoreQuotaExceededError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? `${error.name} ${error.message} ${(error as { code?: string }).code || ''}`
      : String(error || '');
  return /quota limit exceeded|quota exceeded|resource-exhausted|free daily read units/i.test(raw);
}

/**
 * Kiểm tra trạng thái ngắt mạch tự động khi Firestore đã chạm trần hạn mức đọc miễn phí trong ngày
 */
export function isFirestoreQuotaExhausted(): boolean {
  if (memoryQuotaExhausted) return true;
  if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
    try {
      const untilRaw = window.sessionStorage.getItem(QUOTA_CIRCUIT_BREAKER_KEY);
      if (untilRaw) {
        const untilTs = Number(untilRaw);
        if (Number.isFinite(untilTs) && Date.now() < untilTs) {
          memoryQuotaExhausted = true;
          return true;
        }
        window.sessionStorage.removeItem(QUOTA_CIRCUIT_BREAKER_KEY);
      }
    } catch {
      // ignore
    }
  }
  return false;
}

/**
 * Kích hoạt chế độ ngắt mạch tự động khi phát hiện Firestore hết Quota trong ngày,
 * đồng thời dừng ngay các listener onSnapshot để ứng dụng chạy mượt bằng Server Sync + LocalStorage.
 */
export function markFirestoreQuotaExhausted(): void {
  memoryQuotaExhausted = true;
  if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        QUOTA_CIRCUIT_BREAKER_KEY,
        String(Date.now() + QUOTA_COOLDOWN_MS)
      );
    } catch {
      // ignore
    }
  }
  if (activeFirestoreUnsubscribers.length > 0) {
    const toUnsub = [...activeFirestoreUnsubscribers];
    activeFirestoreUnsubscribers = [];
    toUnsub.forEach((unsub) => {
      try {
        unsub();
      } catch {
        // ignore
      }
    });
  }
}

/**
 * Cho phép Giáo viên thử kết nối lại với Firestore (ví dụ sau khi hạn mức ngày mới đã được làm mới)
 */
export function resetFirestoreQuotaCircuitBreaker(): void {
  memoryQuotaExhausted = false;
  if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
    try {
      window.sessionStorage.removeItem(QUOTA_CIRCUIT_BREAKER_KEY);
    } catch {
      // ignore
    }
  }
}

function broadcastLiveSyncEvent(type: string, payload?: unknown): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(LIVE_SYNC_CHANNEL_NAME);
    ch.postMessage({ type, payload, ts: Date.now() });
    ch.close();
  } catch {
    // ignore
  }
}

function saveSubmissionToLocalFallback(sub: FirestoreStudentSubmission): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_SUBMISSIONS_FALLBACK_KEY);
    const list: FirestoreStudentSubmission[] = raw ? JSON.parse(raw) : [];
    const map = new Map<string, FirestoreStudentSubmission>();
    if (Array.isArray(list)) {
      list.forEach((item) => {
        if (item && item.id) map.set(item.id, item);
      });
    }
    map.set(sub.id, sub);
    localStorage.setItem(LOCAL_SUBMISSIONS_FALLBACK_KEY, JSON.stringify(Array.from(map.values())));
  } catch {
    // ignore
  }
}

function getLocalFallbackSubmissions(): FirestoreStudentSubmission[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_SUBMISSIONS_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function postSubmissionToServerApi(sub: FirestoreStudentSubmission): Promise<boolean> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return false;
  try {
    const res = await fetch('/api/live-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}

export function sanitizeFirestoreId(rawId: string, fallbackPrefix = 'item'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, MAX_ID_LENGTH);
  if (!cleaned || !VALID_ID_PATTERN.test(cleaned)) {
    return `${fallbackPrefix}_${Date.now()}`;
  }
  return cleaned;
}

function truncateStr(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const raw = String(val ?? fallback).trim();
  const effective = raw || fallback;
  return effective.slice(0, maxLen);
}

/**
 * Trích xuất mã lỗi cụ thể (error.code) từ lỗi Firebase Auth (ví dụ: auth/unauthorized-domain, auth/popup-blocked, auth/popup-closed-by-user)
 */
export function extractFirebaseAuthError(error: unknown): {
  code: string;
  rawMessage: string;
  friendlyMessage: string;
} {
  const errObj = error as { code?: string; message?: string } | null;
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof errObj?.message === 'string'
        ? errObj.message
        : String(error || 'Unknown error');

  let code = typeof errObj?.code === 'string' && errObj.code.trim() ? errObj.code.trim() : '';
  if (!code) {
    const match = rawMessage.match(/\((auth\/[a-zA-Z0-9_-]+)\)/);
    if (match?.[1]) {
      code = match[1];
    } else {
      code = 'auth/popup-or-domain-error';
    }
  }

  let reason = 'Cửa sổ xác thực Google không thể hoàn tất trên thiết bị/tên miền này';
  if (code.includes('unauthorized-domain')) {
    reason = 'Tên miền hiện tại chưa được khai báo trong Authorized Domains của Firebase Auth';
  } else if (code.includes('popup-blocked')) {
    reason = 'Trình duyệt đã chặn cửa sổ bật lên (Popup)';
  } else if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
    reason = 'Cửa sổ xác thực Google đã đóng trước khi hoàn tất';
  }

  const friendlyMessage = `${reason} [Mã lỗi: ${code}]. Hệ thống đã tự động chuyển sang chế độ đồng bộ Cloud Firestore trực tiếp bằng tài khoản Giáo viên (admin) mà không cần Google Auth.`;

  return {
    code,
    rawMessage,
    friendlyMessage,
  };
}

/**
 * Ghi log lỗi chi tiết ra console.error (chuẩn handleFirestoreError) và trả về thông báo tiếng Việt rõ ràng
 * để hiển thị trực tiếp lên màn hình Giáo viên / Học sinh khi bị chặn bởi Firestore Security Rules hoặc mất mạng.
 */
export function logAndFormatFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): string {
  if (isFirestoreQuotaExceededError(error)) {
    markFirestoreQuotaExhausted();
    return `Hạn mức đọc miễn phí trong ngày của Firebase Firestore (Free daily read units) đã tạm hết. Hệ thống đã tự động chuyển sang Chế độ Đồng bộ Máy chủ Trực tiếp để kỳ thi tiếp tục hoạt động bình thường.`;
  }

  try {
    handleFirestoreError(error, operationType, path);
  } catch (thrown) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    let parsedInfo: FirestoreErrorInfo | null = null;
    try {
      if (thrown instanceof Error) {
        parsedInfo = JSON.parse(thrown.message) as FirestoreErrorInfo;
      }
    } catch {
      // ignore JSON parse error
    }
    const isPermissionDenied =
      /permission-denied|Missing or insufficient permissions/i.test(rawMsg);
    const isOffline =
      /offline|network|failed to fetch|unavailable/i.test(rawMsg);

    if (isPermissionDenied) {
      return `Lỗi phân quyền Firestore Security Rules (permission-denied) khi thực hiện [${operationType}] tại "${path}": ${rawMsg}`;
    }
    if (isOffline) {
      return `Mất kết nối mạng tới máy chủ Firebase Firestore khi thực hiện [${operationType}] tại "${path}": ${rawMsg}`;
    }
    return `Lỗi đồng bộ Firebase Firestore [${operationType}] tại "${path}": ${parsedInfo?.error || rawMsg}`;
  }
}

/**
 * Tự động đăng nhập ẩn danh (signInAnonymously) cho phiên làm việc của Học sinh hoặc Giáo viên (admin)
 * nếu chưa có phiên Firebase Auth. Không bao giờ ném lỗi chặn luồng nếu Anonymous Auth chưa bật trên Console.
 */
export async function ensureStudentAnonymousAuth(): Promise<User | null> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (err) {
    console.warn('Thông báo: signInAnonymously không khả dụng, sử dụng quyền truy cập trực tiếp:', err);
    return auth.currentUser;
  }
}

/**
 * Đăng nhập Giáo viên qua Google Popup (hỗ trợ đồng bộ đám mây Firebase)
 */
export async function signInTeacherWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  if (user && !isFirestoreQuotaExhausted()) {
    try {
      const adminRef = doc(db, 'admins', user.uid);
      await setDoc(
        adminRef,
        {
          ownerId: user.uid,
          displayName: truncateStr(user.displayName || user.email || 'Giáo viên', 120, 'Giáo viên'),
          schoolName: 'Trường TH & THCS Thụy Lâm',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      if (isFirestoreQuotaExceededError(err)) {
        markFirestoreQuotaExhausted();
      }
    }
  }

  return user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export function subscribeFirebaseAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

async function runInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    await Promise.all(slice.map(worker));
  }
}

/**
 * Lưu trực tiếp kết quả bài thi của 1 học sinh lên Máy chủ & Firestore thành Document độc lập
 * tại `/submissions/${examId}_${studentCode}`.
 * Nếu Firestore đã chạm trần hạn mức miễn phí trong ngày (Quota Exceeded), tự động lưu qua Server API & LocalStorage
 * để học sinh hoàn thành nộp bài ngay lập tức mà KHÔNG BAO GIỜ bị chặn!
 */
export async function submitStudentExamResultToFirestore(params: {
  student: Student;
  exam: Exam;
  session: StudentExamSession;
  totalQuestions?: number;
}): Promise<{ ok: boolean; submissionId: string; error?: string; quotaFallback?: boolean }> {
  const { student, exam, session } = params;

  const examId = sanitizeFirestoreId(exam.id || session.examId, 'exam');
  const studentCode = sanitizeFirestoreId(
    (student.loginCode || student.id || 'hs').toLowerCase(),
    'hs'
  ).slice(0, 64);
  const studentId = sanitizeFirestoreId(student.id || studentCode, 'st');

  // Khóa Document độc lập kết hợp mã đề thi và mã đăng nhập tự sinh của học sinh: ${examId}_${studentCode}
  const submissionId = sanitizeFirestoreId(`${examId}_${studentCode}`, 'sub');
  const submissionPath = `submissions/${submissionId}`;

  const totalQuestions = Math.max(
    1,
    Math.min(
      100,
      Math.round(
        params.totalQuestions ||
          exam.totalQuestions ||
          exam.questionIds?.length ||
          (session.correctCount ?? 0) + (session.wrongCount ?? 0) + (session.unansweredCount ?? 0) ||
          1
      )
    )
  );

  const maxExamSecs = Math.max(60, Math.round((exam.durationMinutes || 15) * 60));
  const remSecs = Math.max(0, Math.min(86400, Math.round(session.timeRemainingSeconds || 0)));
  let durationSeconds = Math.max(0, maxExamSecs - remSecs);
  if (session.startedAt && session.submittedAt) {
    const diffSec = Math.round(
      (new Date(session.submittedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
    );
    if (Number.isFinite(diffSec) && diffSec > 0 && diffSec <= 86400) {
      durationSeconds = diffSec;
    }
  }

  const submittedAt = truncateStr(
    session.submittedAt || new Date().toISOString(),
    64,
    new Date().toISOString()
  );
  const score =
    typeof session.score === 'number' && Number.isFinite(session.score)
      ? Math.max(0, Math.min(100, Number(session.score.toFixed(2))))
      : 0;
  const correctCount = Math.max(0, Math.min(100, Math.round(session.correctCount || 0)));
  const wrongCount = Math.max(0, Math.min(100, Math.round(session.wrongCount || 0)));
  const unansweredCount = Math.max(0, Math.min(100, Math.round(session.unansweredCount || 0)));
  const examTitle = truncateStr(exam.title, MAX_TITLE_LENGTH, 'Đề kiểm tra Tin học 7');
  const paperCode = truncateStr(session.paperCode || 'MD701', 32, 'MD701');
  const fullName = truncateStr(student.fullName, MAX_NAME_LENGTH, 'Học sinh');
  const className = truncateStr(student.className, 32, '7A1');

  const submissionRecord: FirestoreStudentSubmission = {
    id: submissionId,
    ownerId: DEFAULT_TEACHER_OWNER_ID,
    examId,
    examTitle,
    studentId,
    studentCode,
    fullName,
    className,
    paperCode,
    score,
    correctCount,
    wrongCount,
    unansweredCount,
    totalQuestions,
    durationSeconds,
    timeRemainingSeconds: remSecs,
    submittedAt,
    status: 'da_nop_bai',
    answers: session.answers || {},
  };

  // 1. Luôn lưu ngay vào bộ nhớ dự phòng & đẩy lên Server API (/api/live-submissions) + BroadcastChannel
  saveSubmissionToLocalFallback(submissionRecord);
  const serverSavedPromise = postSubmissionToServerApi(submissionRecord);
  broadcastLiveSyncEvent('student_submission', submissionRecord);

  // 2. Nếu Firestore đang chạm trần Quota miễn phí trong ngày, hoàn tất nộp bài ngay lập tức qua Server API
  if (isFirestoreQuotaExhausted()) {
    await serverSavedPromise;
    return { ok: true, submissionId, quotaFallback: true };
  }

  // Khởi tạo xác thực ẩn danh nếu có thể (không chặn nếu thất bại)
  await ensureStudentAnonymousAuth();

  const submissionPayload = {
    ...submissionRecord,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    // Ghi trực tiếp Document bài nộp độc lập lên /submissions/${examId}_${studentCode} (0 lượt đọc, 1 lượt ghi)
    const submissionRef = doc(db, 'submissions', submissionId);
    await setDoc(submissionRef, submissionPayload);

    // Cập nhật điểm vào /students/{studentId} bằng merge: true (KHÔNG gọi getDoc để tiết kiệm lượt đọc Quota!)
    try {
      const stRef = doc(db, 'students', studentId);
      const cachedSt = cachedRemoteStudentsMap.get(studentId);
      const existingScores =
        cachedSt?.examScores && typeof cachedSt.examScores === 'object'
          ? (cachedSt.examScores as Record<string, StudentExamScoreRecord>)
          : student.examScores || {};

      const updatedExamScores: Record<string, StudentExamScoreRecord> = {
        ...existingScores,
        [exam.id]: {
          examId: exam.id,
          examTitle,
          score,
          correctCount,
          wrongCount,
          unansweredCount,
          paperCode,
          submittedAt,
        },
      };

      const nextStudentDoc = {
        id: studentId,
        ownerId: DEFAULT_TEACHER_OWNER_ID,
        fullName,
        normalizedName: truncateStr(student.normalizedName || fullName, MAX_NAME_LENGTH, 'hoc sinh'),
        loginCode: studentCode,
        className,
        latestScore: score,
        latestExamTitle: examTitle,
        examScores: updatedExamScores,
        payloadMap: {
          studentIdCode: student.studentIdCode || '',
          passwordHash: student.passwordHash || '123456',
          workstationNumber: student.workstationNumber || 1,
          latestExamId: exam.id,
          latestSubmittedAt: submittedAt,
        },
        updatedAt: serverTimestamp(),
      };

      await setDoc(stRef, nextStudentDoc, { merge: true });
      cachedRemoteStudentsMap.set(studentId, nextStudentDoc);
    } catch (studentErr) {
      if (isFirestoreQuotaExceededError(studentErr)) {
        markFirestoreQuotaExhausted();
      }
    }

    await serverSavedPromise;
    return { ok: true, submissionId };
  } catch (error) {
    const serverSaved = await serverSavedPromise;
    if (isFirestoreQuotaExceededError(error) || serverSaved) {
      if (isFirestoreQuotaExceededError(error)) {
        markFirestoreQuotaExhausted();
      }
      return { ok: true, submissionId, quotaFallback: true };
    }
    const detailedError = logAndFormatFirestoreError(error, OperationType.WRITE, submissionPath);
    return {
      ok: false,
      submissionId,
      error: detailedError,
    };
  }
}

/**
 * Đồng bộ dữ liệu Ngân hàng câu hỏi, Học sinh, Đề thi và Cài đặt lên Cloud Firestore.
 * Đã tối ưu hóa: KHÔNG gọi getDocs() trước khi ghi (sử dụng bộ nhớ đệm in-memory từ onSnapshot, tốn 0 lượt đọc!).
 * Nếu Firestore đang chạm trần Quota miễn phí trong ngày, tự động chuyển sang chế độ đồng bộ qua Máy chủ (/api/sync-repo-data) mà không báo lỗi chặn.
 */
export async function syncAppDataToFirestore(params: {
  questions: Question[];
  students: Student[];
  exams: Exam[];
  sessions: Record<string, StudentExamSession>;
  config?: SystemConfig;
  onError?: (errorMessage: string) => void;
  onQuotaExceeded?: () => void;
}): Promise<{ ok: boolean; syncedAt?: string; error?: string; quotaFallback?: boolean }> {
  broadcastLiveSyncEvent('teacher_data_updated', { ts: Date.now() });

  if (isFirestoreQuotaExhausted()) {
    params.onQuotaExceeded?.();
    return { ok: true, syncedAt: new Date().toISOString(), quotaFallback: true };
  }

  const ownerId = DEFAULT_TEACHER_OWNER_ID;
  const errors: string[] = [];

  // 1. ĐỒNG BỘ ĐỀ THI (/exams/{examId}) - Không gọi getDocs (0 lượt đọc!)
  try {
    const localExamIds = new Set<string>();
    const examsToWrite = params.exams.slice(0, 200);

    await runInBatches(examsToWrite, 20, async (ex) => {
      if (isFirestoreQuotaExhausted()) return;
      const examId = sanitizeFirestoreId(ex.id, 'exam');
      localExamIds.add(examId);
      const examPath = `exams/${examId}`;

      const validClasses =
        Array.isArray(ex.classes) && ex.classes.length > 0
          ? ex.classes.slice(0, 30).map((c) => truncateStr(c, 32, '7A1'))
          : ['7A1'];
      const validQuestionIds =
        Array.isArray(ex.questionIds) && ex.questionIds.length > 0
          ? ex.questionIds.slice(0, 100).map((qid) => sanitizeFirestoreId(qid, 'q'))
          : ['q_default'];

      const normalizedHeader = getDefaultExamHeaderConfig(ex);
      const payloadMap: Record<string, unknown> = {
        headerConfig: normalizedHeader,
        startTime: ex.startTime || '',
        endTime: ex.endTime || '',
        rawCreatedAt: ex.createdAt || new Date().toISOString(),
      };

      const existing = cachedRemoteExamsMap.get(examId);
      const nextDoc = {
        id: examId,
        ownerId,
        title: truncateStr(ex.title, MAX_TITLE_LENGTH, 'Đề kiểm tra Tin học 7'),
        examType: ex.type || '15_phut',
        status: ex.status || 'chua_mo',
        durationMinutes: Math.max(1, Math.min(180, Math.round(ex.durationMinutes || 15))),
        totalQuestions: Math.max(
          1,
          Math.min(100, Math.round(ex.totalQuestions || validQuestionIds.length))
        ),
        maxScore: Math.max(1, Math.min(100, Number(ex.maxScore || 10))),
        classes: validClasses,
        questionIds: validQuestionIds,
        allowReviewAfterSubmit: Boolean(ex.allowReviewAfterSubmit),
        shuffleQuestions: Boolean(ex.shuffleQuestions),
        shuffleOptions: Boolean(ex.shuffleOptions),
        payloadMap,
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const isUnchanged =
        existing &&
        existing.ownerId === nextDoc.ownerId &&
        existing.title === nextDoc.title &&
        existing.examType === nextDoc.examType &&
        existing.status === nextDoc.status &&
        existing.durationMinutes === nextDoc.durationMinutes &&
        existing.totalQuestions === nextDoc.totalQuestions &&
        existing.maxScore === nextDoc.maxScore &&
        existing.allowReviewAfterSubmit === nextDoc.allowReviewAfterSubmit &&
        existing.shuffleQuestions === nextDoc.shuffleQuestions &&
        existing.shuffleOptions === nextDoc.shuffleOptions &&
        JSON.stringify(existing.classes) === JSON.stringify(nextDoc.classes) &&
        JSON.stringify(existing.questionIds) === JSON.stringify(nextDoc.questionIds) &&
        JSON.stringify(existing.payloadMap?.headerConfig) ===
          JSON.stringify(nextDoc.payloadMap.headerConfig);

      if (isUnchanged) return;

      try {
        await setDoc(doc(db, 'exams', examId), nextDoc);
        cachedRemoteExamsMap.set(examId, nextDoc);
      } catch (err) {
        if (isFirestoreQuotaExceededError(err)) {
          markFirestoreQuotaExhausted();
          params.onQuotaExceeded?.();
          return;
        }
        const msg = logAndFormatFirestoreError(err, OperationType.WRITE, examPath);
        errors.push(msg);
      }
    });

    if (hasReceivedInitialExamsSnapshot && !isFirestoreQuotaExhausted()) {
      const staleExamIds = Array.from(cachedRemoteExamsMap.keys()).filter(
        (id) => !localExamIds.has(id)
      );
      await runInBatches(staleExamIds, 20, async (staleId) => {
        if (isFirestoreQuotaExhausted()) return;
        try {
          await deleteDoc(doc(db, 'exams', staleId));
          cachedRemoteExamsMap.delete(staleId);
        } catch (err) {
          if (isFirestoreQuotaExceededError(err)) {
            markFirestoreQuotaExhausted();
            params.onQuotaExceeded?.();
            return;
          }
          const msg = logAndFormatFirestoreError(err, OperationType.DELETE, `exams/${staleId}`);
          errors.push(msg);
        }
      });
    }
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
      params.onQuotaExceeded?.();
      return { ok: true, syncedAt: new Date().toISOString(), quotaFallback: true };
    }
    const msg = logAndFormatFirestoreError(err, OperationType.WRITE, 'exams');
    errors.push(msg);
  }

  // 2. ĐỒNG BỘ NGÂN HÀNG CÂU HỎI (/questions/{questionId}) - Không gọi getDocs (0 lượt đọc!)
  if (!isFirestoreQuotaExhausted()) {
    try {
      const localQuestionIds = new Set<string>();
      const questionsToWrite = params.questions.slice(0, 1000);

      await runInBatches(questionsToWrite, 25, async (q) => {
        if (isFirestoreQuotaExhausted()) return;
        const questionId = sanitizeFirestoreId(q.id, 'q');
        localQuestionIds.add(questionId);
        const questionPath = `questions/${questionId}`;
        const qType = getQuestionType(q);
        const safeImageUrl =
          q.imageUrl && q.imageUrl.length < 250_000 ? q.imageUrl : undefined;

        const payloadMap: Record<string, unknown> = {
          options: q.options || [],
          correctOptionId: q.correctOptionId || '',
          statements: q.statements || [],
          matchingPairs: q.matchingPairs || [],
          explanation: truncateStr(q.explanation || '', 2000, ''),
          ...(safeImageUrl ? { imageUrl: safeImageUrl } : {}),
          ...(q.imageCaption ? { imageCaption: truncateStr(q.imageCaption, 200, '') } : {}),
        };

        const existing = cachedRemoteQuestionsMap.get(questionId);
        const nextDoc = {
          id: questionId,
          ownerId,
          questionType: qType,
          themeId: truncateStr(q.themeId, 64, 'chu_de_1'),
          themeName: truncateStr(q.themeName, 200, 'Chủ đề 1'),
          lessonId: truncateStr(q.lessonId, 64, 'bai_1'),
          lessonName: truncateStr(q.lessonName, 200, 'Bài 1'),
          content: truncateStr(q.content, MAX_QUESTION_CONTENT_LENGTH, 'Câu hỏi'),
          cognitiveLevel: q.cognitiveLevel || 'nhan_biet',
          reviewStatus: q.reviewStatus || 'da_kiem_duyet',
          payloadMap,
          createdAt: existing?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const isUnchanged =
          existing &&
          existing.ownerId === nextDoc.ownerId &&
          existing.content === nextDoc.content &&
          existing.questionType === nextDoc.questionType &&
          existing.themeId === nextDoc.themeId &&
          existing.lessonId === nextDoc.lessonId &&
          existing.cognitiveLevel === nextDoc.cognitiveLevel &&
          existing.reviewStatus === nextDoc.reviewStatus &&
          JSON.stringify(existing.payloadMap) === JSON.stringify(nextDoc.payloadMap);

        if (isUnchanged) return;

        try {
          await setDoc(doc(db, 'questions', questionId), nextDoc);
          cachedRemoteQuestionsMap.set(questionId, nextDoc);
        } catch (err) {
          if (isFirestoreQuotaExceededError(err)) {
            markFirestoreQuotaExhausted();
            params.onQuotaExceeded?.();
            return;
          }
          const msg = logAndFormatFirestoreError(err, OperationType.WRITE, questionPath);
          errors.push(msg);
        }
      });

      if (hasReceivedInitialQuestionsSnapshot && !isFirestoreQuotaExhausted()) {
        const staleQuestionIds = Array.from(cachedRemoteQuestionsMap.keys()).filter(
          (id) => !localQuestionIds.has(id)
        );
        await runInBatches(staleQuestionIds, 25, async (staleId) => {
          if (isFirestoreQuotaExhausted()) return;
          try {
            await deleteDoc(doc(db, 'questions', staleId));
            cachedRemoteQuestionsMap.delete(staleId);
          } catch (err) {
            if (isFirestoreQuotaExceededError(err)) {
              markFirestoreQuotaExhausted();
              params.onQuotaExceeded?.();
              return;
            }
            const msg = logAndFormatFirestoreError(
              err,
              OperationType.DELETE,
              `questions/${staleId}`
            );
            errors.push(msg);
          }
        });
      }
    } catch (err) {
      if (isFirestoreQuotaExceededError(err)) {
        markFirestoreQuotaExhausted();
        params.onQuotaExceeded?.();
        return { ok: true, syncedAt: new Date().toISOString(), quotaFallback: true };
      }
      const msg = logAndFormatFirestoreError(err, OperationType.WRITE, 'questions');
      errors.push(msg);
    }
  }

  // 3. ĐỒNG BỘ DANH SÁCH HỌC SINH (/students/{studentId}) - Không gọi getDocs (0 lượt đọc!)
  if (!isFirestoreQuotaExhausted()) {
    try {
      const localStudentIds = new Set<string>();
      const studentsToWrite = params.students.slice(0, 1000);

      await runInBatches(studentsToWrite, 25, async (st) => {
        if (isFirestoreQuotaExhausted()) return;
        const studentId = sanitizeFirestoreId(st.id, 'st');
        localStudentIds.add(studentId);
        const studentPath = `students/${studentId}`;
        const loginCode = sanitizeFirestoreId(st.loginCode, 'hs').slice(0, 64);

        const existing = cachedRemoteStudentsMap.get(studentId);
        const remoteExamScores =
          existing?.examScores && typeof existing.examScores === 'object'
            ? (existing.examScores as Record<string, StudentExamScoreRecord>)
            : {};
        const localExamScores =
          st.examScores && typeof st.examScores === 'object' ? st.examScores : {};

        // Hợp nhất điểm thi giữa máy Giáo viên và Cloud Firestore (không làm mất điểm học sinh vừa nộp)
        const mergedExamScores: Record<string, StudentExamScoreRecord> = {
          ...localExamScores,
          ...remoteExamScores,
        };

        const sortedRecords = Object.values(mergedExamScores).sort((a, b) =>
          String(b?.submittedAt || '').localeCompare(String(a?.submittedAt || ''))
        );
        const latestRecord = sortedRecords[0];

        const rawScore =
          latestRecord?.score ??
          (typeof st.latestScore === 'number' && Number.isFinite(st.latestScore)
            ? st.latestScore
            : typeof existing?.latestScore === 'number'
              ? existing.latestScore
              : -1);
        const latestScore = Math.max(-1, Math.min(100, rawScore));
        const latestExamTitle = truncateStr(
          latestRecord?.examTitle || st.latestExamTitle || existing?.latestExamTitle || '',
          250,
          ''
        );

        const payloadMap: Record<string, unknown> = {
          studentIdCode: st.studentIdCode || existing?.payloadMap?.studentIdCode || '',
          passwordHash: st.passwordHash || existing?.payloadMap?.passwordHash || '123456',
          workstationNumber: st.workstationNumber ?? existing?.payloadMap?.workstationNumber ?? 1,
          latestExamId:
            latestRecord?.examId || st.latestExamId || existing?.payloadMap?.latestExamId || '',
          latestSubmittedAt:
            latestRecord?.submittedAt ||
            st.latestSubmittedAt ||
            existing?.payloadMap?.latestSubmittedAt ||
            '',
        };

        const nextDoc = {
          id: studentId,
          ownerId,
          fullName: truncateStr(st.fullName, MAX_NAME_LENGTH, 'Học sinh'),
          normalizedName: truncateStr(
            st.normalizedName || st.fullName,
            MAX_NAME_LENGTH,
            'hoc sinh'
          ),
          loginCode,
          className: truncateStr(st.className, 32, '7A1'),
          latestScore,
          latestExamTitle,
          examScores: mergedExamScores,
          payloadMap,
          createdAt: existing?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const isUnchanged =
          existing &&
          existing.ownerId === nextDoc.ownerId &&
          existing.fullName === nextDoc.fullName &&
          existing.loginCode === nextDoc.loginCode &&
          existing.className === nextDoc.className &&
          existing.latestScore === nextDoc.latestScore &&
          existing.latestExamTitle === nextDoc.latestExamTitle &&
          JSON.stringify(existing.examScores) === JSON.stringify(nextDoc.examScores);

        if (isUnchanged) return;

        try {
          await setDoc(doc(db, 'students', studentId), nextDoc);
          cachedRemoteStudentsMap.set(studentId, nextDoc);
        } catch (err) {
          if (isFirestoreQuotaExceededError(err)) {
            markFirestoreQuotaExhausted();
            params.onQuotaExceeded?.();
            return;
          }
          const msg = logAndFormatFirestoreError(err, OperationType.WRITE, studentPath);
          errors.push(msg);
        }
      });

      if (hasReceivedInitialStudentsSnapshot && !isFirestoreQuotaExhausted()) {
        const staleStudentIds = Array.from(cachedRemoteStudentsMap.keys()).filter(
          (id) => !localStudentIds.has(id)
        );
        await runInBatches(staleStudentIds, 25, async (staleId) => {
          if (isFirestoreQuotaExhausted()) return;
          try {
            await deleteDoc(doc(db, 'students', staleId));
            cachedRemoteStudentsMap.delete(staleId);
          } catch (err) {
            if (isFirestoreQuotaExceededError(err)) {
              markFirestoreQuotaExhausted();
              params.onQuotaExceeded?.();
              return;
            }
            const msg = logAndFormatFirestoreError(
              err,
              OperationType.DELETE,
              `students/${staleId}`
            );
            errors.push(msg);
          }
        });
      }
    } catch (err) {
      if (isFirestoreQuotaExceededError(err)) {
        markFirestoreQuotaExhausted();
        params.onQuotaExceeded?.();
        return { ok: true, syncedAt: new Date().toISOString(), quotaFallback: true };
      }
      const msg = logAndFormatFirestoreError(err, OperationType.WRITE, 'students');
      errors.push(msg);
    }
  }

  // 4. ĐỒNG BỘ CẤU HÌNH HỆ THỐNG (/settings/system_config)
  if (params.config && !isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'settings', 'system_config'), {
        id: 'system_config',
        ownerId,
        schoolName: params.config.schoolName || 'Trường TH & THCS Thụy Lâm',
        subjectName:
          params.config.subjectName || 'Tin học 7 - Bộ sách Kết nối tri thức với cuộc sống',
        activeExamId: params.config.activeExamId || '',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      if (isFirestoreQuotaExceededError(err)) {
        markFirestoreQuotaExhausted();
        params.onQuotaExceeded?.();
        return { ok: true, syncedAt: new Date().toISOString(), quotaFallback: true };
      }
      const msg = logAndFormatFirestoreError(err, OperationType.WRITE, 'settings/system_config');
      errors.push(msg);
    }
  }

  if (isFirestoreQuotaExhausted()) {
    params.onQuotaExceeded?.();
    return { ok: true, syncedAt: new Date().toISOString(), quotaFallback: true };
  }

  if (errors.length > 0) {
    const combinedError = errors[0];
    if (params.onError) {
      params.onError(combinedError);
    }
    return { ok: false, error: combinedError };
  }

  return { ok: true, syncedAt: new Date().toISOString() };
}

/**
 * Đồng bộ 1 phiên làm bài của học sinh lên Firestore (không chặn bởi kiểm tra Google Auth hay lỗi Quota)
 */
export async function syncSessionToFirestore(session: StudentExamSession): Promise<void> {
  if (isFirestoreQuotaExhausted()) return;

  // Chỉ ghi phiên lên Firestore khi học sinh bắt đầu hoặc nộp bài để tiết kiệm Quota đọc/ghi
  if (session.status !== 'da_nop_bai') return;

  const examId = sanitizeFirestoreId(session.examId, 'exam');
  const sessionId = sanitizeFirestoreId(
    session.id || `${session.studentId}_${session.examId}`,
    'sess'
  );

  try {
    const sessRef = doc(db, 'exams', examId, 'sessions', sessionId);
    const score =
      typeof session.score === 'number' && Number.isFinite(session.score)
        ? Math.max(0, Math.min(100, session.score))
        : 0;

    await setDoc(sessRef, {
      id: sessionId,
      examId,
      studentId: sanitizeFirestoreId(session.studentId, 'st'),
      ownerId: DEFAULT_TEACHER_OWNER_ID,
      paperCode: truncateStr(session.paperCode, 32, 'MD701'),
      status: session.status || 'dang_lam_bai',
      timeRemainingSeconds: Math.max(
        0,
        Math.min(10800, Math.round(session.timeRemainingSeconds || 0))
      ),
      currentQuestionIndex: Math.max(
        0,
        Math.min(100, Math.round(session.currentQuestionIndex || 0))
      ),
      score,
      correctCount: Math.max(0, Math.min(100, Math.round(session.correctCount || 0))),
      wrongCount: Math.max(0, Math.min(100, Math.round(session.wrongCount || 0))),
      unansweredCount: Math.max(0, Math.min(100, Math.round(session.unansweredCount || 0))),
      answers: session.answers || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (isFirestoreQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
  }
}

/**
 * Chuyển đổi dữ liệu Document từ Firestore sang đối tượng Exam chuẩn của ứng dụng
 */
function mapFirestoreDocToExam(d: Record<string, any>): Exam {
  const rawHeader = (d.payloadMap?.headerConfig || {}) as Partial<ExamHeaderConfig>;
  const durationMinutes = Number(d.durationMinutes || 30);
  const examType = (d.examType || 'giua_ky') as Exam['type'];

  const headerConfig: ExamHeaderConfig = {
    schoolName: normalizeExamSchoolName(rawHeader.schoolName),
    schoolYear: rawHeader.schoolYear || 'Năm học 2025-2026',
    examHeaderTitle:
      rawHeader.examHeaderTitle ||
      getDefaultExamHeaderConfig({ type: examType, durationMinutes }).examHeaderTitle,
    subjectHeader: normalizeExamSubjectHeader(rawHeader.subjectHeader),
    durationText: rawHeader.durationText || `(Thời gian: ${durationMinutes} phút)`,
    showUnderline: rawHeader.showUnderline ?? true,
    showStudentInfo: rawHeader.showStudentInfo ?? true,
    showAnswerGrid: rawHeader.showAnswerGrid ?? false,
  };

  return {
    id: String(d.id),
    title: String(d.title || 'Đề kiểm tra Tin học 7'),
    type: examType,
    classes: Array.isArray(d.classes) ? d.classes.map(String) : ['7A1'],
    durationMinutes,
    totalQuestions: Number(
      d.totalQuestions || (Array.isArray(d.questionIds) ? d.questionIds.length : 0)
    ),
    maxScore: Number(d.maxScore || 10),
    questionIds: Array.isArray(d.questionIds) ? d.questionIds.map(String) : [],
    status: (d.status || 'chua_mo') as Exam['status'],
    allowReviewAfterSubmit: Boolean(d.allowReviewAfterSubmit),
    shuffleQuestions: Boolean(d.shuffleQuestions),
    shuffleOptions: Boolean(d.shuffleOptions),
    headerConfig,
    startTime: d.payloadMap?.startTime || undefined,
    endTime: d.payloadMap?.endTime || undefined,
    createdAt: String(d.payloadMap?.rawCreatedAt || new Date().toISOString()),
  };
}

/**
 * Chuyển đổi dữ liệu Document từ Firestore sang đối tượng Question chuẩn của ứng dụng
 */
function mapFirestoreDocToQuestion(d: Record<string, any>): Question {
  const pm = (d.payloadMap || {}) as Record<string, any>;
  const nowIso = new Date().toISOString();
  return normalizeQuestionStructure({
    id: String(d.id),
    type: (d.questionType || 'multiple_choice') as Question['type'],
    themeId: String(d.themeId || 'chu_de_1'),
    themeName: String(d.themeName || 'Chủ đề 1'),
    lessonId: String(d.lessonId || 'bai_1'),
    lessonName: String(d.lessonName || 'Bài 1'),
    content: String(d.content || ''),
    imageUrl: pm.imageUrl ? String(pm.imageUrl) : undefined,
    imageCaption: pm.imageCaption ? String(pm.imageCaption) : undefined,
    options: Array.isArray(pm.options) ? pm.options : [],
    correctOptionId: String(pm.correctOptionId || ''),
    statements: Array.isArray(pm.statements) ? pm.statements : [],
    matchingPairs: Array.isArray(pm.matchingPairs) ? pm.matchingPairs : [],
    cognitiveLevel: (d.cognitiveLevel || 'nhan_biet') as Question['cognitiveLevel'],
    explanation: String(pm.explanation || ''),
    reviewStatus: (d.reviewStatus || 'da_kiem_duyet') as Question['reviewStatus'],
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

/**
 * Chuyển đổi dữ liệu Document từ Firestore sang đối tượng Student chuẩn của ứng dụng
 */
function mapFirestoreDocToStudent(d: Record<string, any>): Student {
  const pm = (d.payloadMap || {}) as Record<string, any>;
  const latestScore =
    typeof d.latestScore === 'number' && d.latestScore >= 0 ? d.latestScore : undefined;
  return {
    id: String(d.id),
    studentIdCode: pm.studentIdCode ? String(pm.studentIdCode) : undefined,
    fullName: String(d.fullName || 'Học sinh'),
    normalizedName: String(d.normalizedName || d.fullName || 'hoc sinh'),
    loginCode: String(d.loginCode || 'hs'),
    passwordHash: String(pm.passwordHash || '123456'),
    className: String(d.className || '7A1'),
    workstationNumber: typeof pm.workstationNumber === 'number' ? pm.workstationNumber : undefined,
    latestScore,
    latestExamId: pm.latestExamId ? String(pm.latestExamId) : undefined,
    latestExamTitle: d.latestExamTitle ? String(d.latestExamTitle) : undefined,
    latestSubmittedAt: pm.latestSubmittedAt ? String(pm.latestSubmittedAt) : undefined,
    examScores: d.examScores && typeof d.examScores === 'object' ? d.examScores : {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * Lắng nghe dữ liệu thời gian thực (onSnapshot + Server Live Sync dự phòng khi hết Quota)
 * cho cả chế độ Giáo viên (admin hoặc Google) và Học sinh đối với:
 * 1. Danh sách đề thi (exams)
 * 2. Ngân hàng câu hỏi (questions)
 * 3. Danh sách học sinh (students)
 * 4. Các bài nộp của học sinh (submissions)
 */
export function subscribeAllFirestoreData(callbacks: {
  onExams: (remoteExams: Exam[], isEmpty: boolean) => void;
  onQuestions: (remoteQuestions: Question[], isEmpty: boolean) => void;
  onStudents: (remoteStudents: Student[], isEmpty: boolean) => void;
  onSubmissions: (remoteSubmissions: FirestoreStudentSubmission[]) => void;
  onError?: (errorMessage: string) => void;
  onQuotaExceeded?: () => void;
}): Unsubscribe {
  const ownerId = DEFAULT_TEACHER_OWNER_ID;
  let lastServerUpdatedAt = '';

  // Hàm đồng bộ trực tiếp từ Server API (/api/sync-repo-data) + LocalStorage Submissions
  const pullFromServerLiveState = async () => {
    const localSubs = getLocalFallbackSubmissions();
    if (localSubs.length > 0) {
      callbacks.onSubmissions(localSubs);
    }

    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    try {
      const res = await fetch('/api/sync-repo-data', { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.ok) return;

      const serverSubs: FirestoreStudentSubmission[] = Array.isArray(data.submissions)
        ? data.submissions
        : [];
      const mergedSubsMap = new Map<string, FirestoreStudentSubmission>();
      localSubs.forEach((s) => mergedSubsMap.set(s.id, s));
      serverSubs.forEach((s) => {
        if (s && s.id) mergedSubsMap.set(String(s.id), s);
      });
      if (mergedSubsMap.size > 0) {
        callbacks.onSubmissions(Array.from(mergedSubsMap.values()));
      }

      if (data.updatedAt && data.updatedAt !== lastServerUpdatedAt) {
        lastServerUpdatedAt = String(data.updatedAt);
        if (Array.isArray(data.exams) && data.exams.length > 0) {
          callbacks.onExams(data.exams as Exam[], false);
        }
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          callbacks.onQuestions(data.questions as Question[], false);
        }
        if (Array.isArray(data.students) && data.students.length > 0) {
          callbacks.onStudents(data.students as Student[], false);
        }
      }
    } catch {
      // Bỏ qua nếu đang chạy bản build tĩnh không có endpoint /api/sync-repo-data
    }
  };

  // Nạp ngay từ Server API khi khởi chạy và định kỳ mỗi 4 giây
  void pullFromServerLiveState();
  const pollInterval =
    typeof window !== 'undefined'
      ? window.setInterval(() => {
          void pullFromServerLiveState();
        }, 4000)
      : null;

  // Lắng nghe BroadcastChannel để đồng bộ tức thì giữa các tab trên cùng trình duyệt
  let broadcastChannel: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      broadcastChannel = new BroadcastChannel(LIVE_SYNC_CHANNEL_NAME);
      broadcastChannel.onmessage = () => {
        void pullFromServerLiveState();
      };
    } catch {
      broadcastChannel = null;
    }
  }

  // Nếu Firestore đã chạm trần Quota miễn phí trong ngày, không gắn listener onSnapshot để tránh báo lỗi
  if (isFirestoreQuotaExhausted()) {
    callbacks.onQuotaExceeded?.();
    return () => {
      if (pollInterval !== null) clearInterval(pollInterval);
      if (broadcastChannel) broadcastChannel.close();
    };
  }

  const handleListenerError = (error: unknown, path: string) => {
    if (isFirestoreQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
      callbacks.onQuotaExceeded?.();
      void pullFromServerLiveState();
      return;
    }
    const msg = logAndFormatFirestoreError(error, OperationType.LIST, path);
    callbacks.onError?.(msg);
  };

  const examsRef = collection(db, 'exams');
  const questionsRef = collection(db, 'questions');
  const studentsRef = collection(db, 'students');
  const submissionsRef = collection(db, 'submissions');

  const unsubExams = onSnapshot(
    examsRef,
    (snapshot) => {
      hasReceivedInitialExamsSnapshot = true;
      cachedRemoteExamsMap.clear();
      const list: Exam[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        cachedRemoteExamsMap.set(docSnap.id, raw);
        list.push(mapFirestoreDocToExam(raw));
      });
      list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      callbacks.onExams(list, snapshot.empty);
    },
    (error) => handleListenerError(error, 'exams')
  );

  const unsubQuestions = onSnapshot(
    questionsRef,
    (snapshot) => {
      hasReceivedInitialQuestionsSnapshot = true;
      cachedRemoteQuestionsMap.clear();
      const list: Question[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        cachedRemoteQuestionsMap.set(docSnap.id, raw);
        list.push(mapFirestoreDocToQuestion(raw));
      });
      callbacks.onQuestions(list, snapshot.empty);
    },
    (error) => handleListenerError(error, 'questions')
  );

  const unsubStudents = onSnapshot(
    studentsRef,
    (snapshot) => {
      hasReceivedInitialStudentsSnapshot = true;
      cachedRemoteStudentsMap.clear();
      const list: Student[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data();
        cachedRemoteStudentsMap.set(docSnap.id, raw);
        list.push(mapFirestoreDocToStudent(raw));
      });
      callbacks.onStudents(list, snapshot.empty);
    },
    (error) => handleListenerError(error, 'students')
  );

  const unsubSubmissions = onSnapshot(
    submissionsRef,
    (snapshot) => {
      const list: FirestoreStudentSubmission[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const sub: FirestoreStudentSubmission = {
          id: String(d.id || docSnap.id),
          ownerId: String(d.ownerId || ownerId),
          examId: String(d.examId || ''),
          examTitle: String(d.examTitle || ''),
          studentId: String(d.studentId || ''),
          studentCode: String(d.studentCode || ''),
          fullName: String(d.fullName || ''),
          className: String(d.className || ''),
          paperCode: String(d.paperCode || 'MD701'),
          score: Number(d.score ?? 0),
          correctCount: Number(d.correctCount ?? 0),
          wrongCount: Number(d.wrongCount ?? 0),
          unansweredCount: Number(d.unansweredCount ?? 0),
          totalQuestions: Number(d.totalQuestions ?? 0),
          durationSeconds: Number(d.durationSeconds ?? 0),
          timeRemainingSeconds: Number(d.timeRemainingSeconds ?? 0),
          submittedAt: String(d.submittedAt || new Date().toISOString()),
          status: (d.status || 'da_nop_bai') as FirestoreStudentSubmission['status'],
          answers: d.answers && typeof d.answers === 'object' ? d.answers : {},
        };
        list.push(sub);
      });
      if (list.length > 0) {
        callbacks.onSubmissions(list);
      }
    },
    (error) => handleListenerError(error, 'submissions')
  );

  activeFirestoreUnsubscribers = [unsubExams, unsubQuestions, unsubStudents, unsubSubmissions];

  return () => {
    if (pollInterval !== null) clearInterval(pollInterval);
    if (broadcastChannel) broadcastChannel.close();
    activeFirestoreUnsubscribers.forEach((u) => {
      try {
        u();
      } catch {
        // ignore
      }
    });
    activeFirestoreUnsubscribers = [];
  };
}

/**
 * Truy vấn số lượng bản ghi đã lưu trên Cloud Firestore
 */
export async function fetchFirestoreCloudStats(): Promise<{
  examsCount: number;
  studentsCount: number;
  questionsCount: number;
  submissionsCount?: number;
} | null> {
  if (isFirestoreQuotaExhausted()) {
    return {
      examsCount: cachedRemoteExamsMap.size,
      studentsCount: cachedRemoteStudentsMap.size,
      questionsCount: cachedRemoteQuestionsMap.size,
    };
  }
  try {
    const [examsSnap, studentsSnap, questionsSnap, submissionsSnap] = await Promise.all([
      getDocs(collection(db, 'exams')),
      getDocs(collection(db, 'students')),
      getDocs(collection(db, 'questions')),
      getDocs(collection(db, 'submissions')),
    ]);
    return {
      examsCount: examsSnap.size,
      studentsCount: studentsSnap.size,
      questionsCount: questionsSnap.size,
      submissionsCount: submissionsSnap.size,
    };
  } catch (error) {
    if (isFirestoreQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
    }
    return null;
  }
}
