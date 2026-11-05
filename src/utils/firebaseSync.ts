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
  query,
  serverTimestamp,
  setDoc,
  where,
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

// Validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
export const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const MAX_ID_LENGTH = 128;
export const MAX_QUESTION_CONTENT_LENGTH = 4000;
export const MAX_TITLE_LENGTH = 300;
export const MAX_NAME_LENGTH = 150;
export const DEFAULT_TEACHER_OWNER_ID = 'teacher_smarttest7';

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
 * Ghi log lỗi chi tiết ra console.error (chuẩn handleFirestoreError) và trả về thông báo tiếng Việt rõ ràng
 * để hiển thị trực tiếp lên màn hình Giáo viên / Học sinh khi bị chặn bởi Firestore Security Rules hoặc mất mạng.
 */
export function logAndFormatFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): string {
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
 * Tự động đăng nhập ẩn danh (signInAnonymously) cho phiên làm việc của Học sinh (hoặc Giáo viên dùng mật khẩu nội bộ)
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

  if (user && user.emailVerified) {
    try {
      const adminRef = doc(db, 'admins', user.uid);
      const snap = await getDoc(adminRef);
      if (!snap.exists()) {
        await setDoc(adminRef, {
          ownerId: user.uid,
          displayName: truncateStr(user.displayName || user.email || 'Giáo viên', 120, 'Giáo viên'),
          schoolName: 'Trường TH & THCS Thụy Lâm',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Nếu tài khoản Google không phải bootstrapped admin thì bỏ qua tạo hồ sơ /admins
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
 * Lưu trực tiếp kết quả bài thi của 1 học sinh lên Firestore thành Document độc lập
 * tại `/submissions/${examId}_${studentCode}` (tuyệt đối không kiểm tra Google Auth và không ghi đè danh sách chung).
 */
export async function submitStudentExamResultToFirestore(params: {
  student: Student;
  exam: Exam;
  session: StudentExamSession;
  totalQuestions?: number;
}): Promise<{ ok: boolean; submissionId: string; error?: string }> {
  const { student, exam, session } = params;

  // Khởi tạo xác thực ẩn danh nếu có thể (không chặn nếu thất bại)
  await ensureStudentAnonymousAuth();

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

  const submissionPayload = {
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
    status: 'da_nop_bai' as const,
    answers: session.answers || {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    // 1. Ghi trực tiếp Document bài nộp độc lập lên /submissions/${examId}_${studentCode}
    const submissionRef = doc(db, 'submissions', submissionId);
    await setDoc(submissionRef, submissionPayload);

    // 2. Đồng bộ bổ sung vào bản ghi của riêng học sinh này trên /students/{studentId} (không chạm tới học sinh khác)
    try {
      const stRef = doc(db, 'students', studentId);
      const stSnap = await getDoc(stRef);
      const existingScores =
        stSnap.exists() && stSnap.data().examScores && typeof stSnap.data().examScores === 'object'
          ? (stSnap.data().examScores as Record<string, StudentExamScoreRecord>)
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

      await setDoc(stRef, {
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
        createdAt: stSnap.exists() && stSnap.data().createdAt ? stSnap.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (studentErr) {
      console.warn('Không thể cập nhật phụ trợ /students/{id}, nhưng /submissions đã lưu thành công:', studentErr);
    }

    return { ok: true, submissionId };
  } catch (error) {
    const detailedError = logAndFormatFirestoreError(error, OperationType.WRITE, submissionPath);
    return {
      ok: false,
      submissionId,
      error: detailedError,
    };
  }
}

/**
 * Đồng bộ dữ liệu Ngân hàng câu hỏi, Học sinh, Đề thi lên Cloud Firestore
 * Hoạt động cho Giáo viên cả khi đăng nhập bằng tài khoản nội bộ (admin) lẫn Google Auth.
 */
export async function syncAppDataToFirestore(params: {
  questions: Question[];
  students: Student[];
  exams: Exam[];
  sessions: Record<string, StudentExamSession>;
  config?: SystemConfig;
  onError?: (errorMessage: string) => void;
}): Promise<{ ok: boolean; syncedAt?: string; error?: string }> {
  const ownerId = DEFAULT_TEACHER_OWNER_ID;
  const errors: string[] = [];

  // 1. ĐỒNG BỘ ĐỀ THI (/exams/{examId})
  try {
    const existingExamsSnap = await getDocs(
      query(collection(db, 'exams'), where('ownerId', '==', ownerId))
    );
    const remoteExamsMap = new Map<string, Record<string, any>>();
    existingExamsSnap.forEach((docSnap) => {
      remoteExamsMap.set(docSnap.id, docSnap.data());
    });

    const localExamIds = new Set<string>();
    const examsToWrite = params.exams.slice(0, 100);

    await runInBatches(examsToWrite, 20, async (ex) => {
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

      const existing = remoteExamsMap.get(examId);
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
      } catch (err) {
        const msg = logAndFormatFirestoreError(err, OperationType.WRITE, examPath);
        errors.push(msg);
      }
    });

    // Xóa các đề thi đã bị Giáo viên xóa khỏi danh sách
    const staleExamIds = Array.from(remoteExamsMap.keys()).filter((id) => !localExamIds.has(id));
    await runInBatches(staleExamIds, 20, async (staleId) => {
      try {
        await deleteDoc(doc(db, 'exams', staleId));
      } catch (err) {
        const msg = logAndFormatFirestoreError(err, OperationType.DELETE, `exams/${staleId}`);
        errors.push(msg);
      }
    });
  } catch (err) {
    const msg = logAndFormatFirestoreError(err, OperationType.LIST, 'exams');
    errors.push(msg);
  }

  // 2. ĐỒNG BỘ NGÂN HÀNG CÂU HỎI (/questions/{questionId})
  try {
    const existingQuestionsSnap = await getDocs(
      query(collection(db, 'questions'), where('ownerId', '==', ownerId))
    );
    const remoteQuestionsMap = new Map<string, Record<string, any>>();
    existingQuestionsSnap.forEach((docSnap) => {
      remoteQuestionsMap.set(docSnap.id, docSnap.data());
    });

    const localQuestionIds = new Set<string>();
    const questionsToWrite = params.questions.slice(0, 300);

    await runInBatches(questionsToWrite, 25, async (q) => {
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

      const existing = remoteQuestionsMap.get(questionId);
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
      } catch (err) {
        const msg = logAndFormatFirestoreError(err, OperationType.WRITE, questionPath);
        errors.push(msg);
      }
    });

    const staleQuestionIds = Array.from(remoteQuestionsMap.keys()).filter(
      (id) => !localQuestionIds.has(id)
    );
    await runInBatches(staleQuestionIds, 25, async (staleId) => {
      try {
        await deleteDoc(doc(db, 'questions', staleId));
      } catch (err) {
        const msg = logAndFormatFirestoreError(err, OperationType.DELETE, `questions/${staleId}`);
        errors.push(msg);
      }
    });
  } catch (err) {
    const msg = logAndFormatFirestoreError(err, OperationType.LIST, 'questions');
    errors.push(msg);
  }

  // 3. ĐỒNG BỘ DANH SÁCH HỌC SINH (/students/{studentId}) - Bảo toàn điểm thi đã nộp trên Cloud
  try {
    const existingStudentsSnap = await getDocs(
      query(collection(db, 'students'), where('ownerId', '==', ownerId))
    );
    const remoteStudentsMap = new Map<string, Record<string, any>>();
    existingStudentsSnap.forEach((docSnap) => {
      remoteStudentsMap.set(docSnap.id, docSnap.data());
    });

    const localStudentIds = new Set<string>();
    const studentsToWrite = params.students.slice(0, 500);

    await runInBatches(studentsToWrite, 25, async (st) => {
      const studentId = sanitizeFirestoreId(st.id, 'st');
      localStudentIds.add(studentId);
      const studentPath = `students/${studentId}`;
      const loginCode = sanitizeFirestoreId(st.loginCode, 'hs').slice(0, 64);

      const existing = remoteStudentsMap.get(studentId);
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
        normalizedName: truncateStr(st.normalizedName || st.fullName, MAX_NAME_LENGTH, 'hoc sinh'),
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
        existing.fullName === nextDoc.fullName &&
        existing.loginCode === nextDoc.loginCode &&
        existing.className === nextDoc.className &&
        existing.latestScore === nextDoc.latestScore &&
        existing.latestExamTitle === nextDoc.latestExamTitle &&
        JSON.stringify(existing.examScores) === JSON.stringify(nextDoc.examScores);

      if (isUnchanged) return;

      try {
        await setDoc(doc(db, 'students', studentId), nextDoc);
      } catch (err) {
        const msg = logAndFormatFirestoreError(err, OperationType.WRITE, studentPath);
        errors.push(msg);
      }
    });

    const staleStudentIds = Array.from(remoteStudentsMap.keys()).filter(
      (id) => !localStudentIds.has(id)
    );
    await runInBatches(staleStudentIds, 25, async (staleId) => {
      try {
        await deleteDoc(doc(db, 'students', staleId));
      } catch (err) {
        const msg = logAndFormatFirestoreError(err, OperationType.DELETE, `students/${staleId}`);
        errors.push(msg);
      }
    });
  } catch (err) {
    const msg = logAndFormatFirestoreError(err, OperationType.LIST, 'students');
    errors.push(msg);
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
 * Đồng bộ 1 phiên làm bài của học sinh lên Firestore (không chặn bởi kiểm tra Google Auth)
 */
export async function syncSessionToFirestore(session: StudentExamSession): Promise<void> {
  const examId = sanitizeFirestoreId(session.examId, 'exam');
  const sessionId = sanitizeFirestoreId(
    session.id || `${session.studentId}_${session.examId}`,
    'sess'
  );
  const sessionPath = `exams/${examId}/sessions/${sessionId}`;

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
  } catch {
    // Phiên nháp đang làm có thể bỏ qua nếu đề thi chưa tồn tại trên /exams; khi nộp bài sẽ dùng submitStudentExamResultToFirestore
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
    totalQuestions: Number(d.totalQuestions || (Array.isArray(d.questionIds) ? d.questionIds.length : 0)),
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
 * Lắng nghe dữ liệu thời gian thực (onSnapshot) trực tiếp từ Firebase Firestore
 * cho cả chế độ Giáo viên và Học sinh đối với:
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
}): Unsubscribe {
  const ownerId = DEFAULT_TEACHER_OWNER_ID;

  const examsQuery = query(collection(db, 'exams'), where('ownerId', '==', ownerId));
  const questionsQuery = query(collection(db, 'questions'), where('ownerId', '==', ownerId));
  const studentsQuery = query(collection(db, 'students'), where('ownerId', '==', ownerId));
  const submissionsQuery = query(collection(db, 'submissions'), where('ownerId', '==', ownerId));

  const unsubExams = onSnapshot(
    examsQuery,
    (snapshot) => {
      const list: Exam[] = [];
      snapshot.forEach((docSnap) => {
        list.push(mapFirestoreDocToExam(docSnap.data()));
      });
      // Sắp xếp đề mới tạo lên đầu
      list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      callbacks.onExams(list, snapshot.empty);
    },
    (error) => {
      const msg = logAndFormatFirestoreError(error, OperationType.LIST, 'exams');
      callbacks.onError?.(msg);
    }
  );

  const unsubQuestions = onSnapshot(
    questionsQuery,
    (snapshot) => {
      const list: Question[] = [];
      snapshot.forEach((docSnap) => {
        list.push(mapFirestoreDocToQuestion(docSnap.data()));
      });
      callbacks.onQuestions(list, snapshot.empty);
    },
    (error) => {
      const msg = logAndFormatFirestoreError(error, OperationType.LIST, 'questions');
      callbacks.onError?.(msg);
    }
  );

  const unsubStudents = onSnapshot(
    studentsQuery,
    (snapshot) => {
      const list: Student[] = [];
      snapshot.forEach((docSnap) => {
        list.push(mapFirestoreDocToStudent(docSnap.data()));
      });
      callbacks.onStudents(list, snapshot.empty);
    },
    (error) => {
      const msg = logAndFormatFirestoreError(error, OperationType.LIST, 'students');
      callbacks.onError?.(msg);
    }
  );

  const unsubSubmissions = onSnapshot(
    submissionsQuery,
    (snapshot) => {
      const list: FirestoreStudentSubmission[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
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
        });
      });
      callbacks.onSubmissions(list);
    },
    (error) => {
      const msg = logAndFormatFirestoreError(error, OperationType.LIST, 'submissions');
      callbacks.onError?.(msg);
    }
  );

  return () => {
    unsubExams();
    unsubQuestions();
    unsubStudents();
    unsubSubmissions();
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
  try {
    const ownerId = DEFAULT_TEACHER_OWNER_ID;
    const [examsSnap, studentsSnap, questionsSnap, submissionsSnap] = await Promise.all([
      getDocs(query(collection(db, 'exams'), where('ownerId', '==', ownerId))),
      getDocs(query(collection(db, 'students'), where('ownerId', '==', ownerId))),
      getDocs(query(collection(db, 'questions'), where('ownerId', '==', ownerId))),
      getDocs(query(collection(db, 'submissions'), where('ownerId', '==', ownerId))),
    ]);
    return {
      examsCount: examsSnap.size,
      studentsCount: studentsSnap.size,
      questionsCount: questionsSnap.size,
      submissionsCount: submissionsSnap.size,
    };
  } catch (error) {
    logAndFormatFirestoreError(error, OperationType.LIST, 'exams');
    return null;
  }
}
