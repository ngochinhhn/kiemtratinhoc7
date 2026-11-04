import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
   Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  Exam,
  Question,
  Student,
  StudentExamSession,
  SystemConfig,
} from '../types';
import { getQuestionType } from './grading';

// Validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
export const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const MAX_ID_LENGTH = 128;
export const MAX_QUESTION_CONTENT_LENGTH = 4000;
export const MAX_TITLE_LENGTH = 300;
export const MAX_NAME_LENGTH = 150;

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
  return raw.slice(0, maxLen);
}

/**
 * Đăng nhập Giáo viên qua Google Popup (hỗ trợ đồng bộ đám mây Firebase)
 */
export async function signInTeacherWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  if (user && user.emailVerified) {
    const adminPath = `admins/${user.uid}`;
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

/**
 * Đồng bộ dữ liệu Ngân hàng câu hỏi, Học sinh, Đề thi và Phiên làm bài lên Cloud Firestore
 * (Thực thi khi Giáo viên đã xác thực qua Firebase Auth)
 */
export async function syncAppDataToFirestore(params: {
  questions: Question[];
  students: Student[];
  exams: Exam[];
  sessions: Record<string, StudentExamSession>;
  config?: SystemConfig;
}): Promise<{ ok: boolean; syncedAt?: string; error?: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return { ok: false, error: 'Chưa đăng nhập tài khoản Google xác thực' };
  }

  const uid = sanitizeFirestoreId(currentUser.uid, 'user');

  // 1. Đồng bộ Đề thi (/exams/{examId})
  for (const ex of params.exams.slice(0, 30)) {
    const examId = sanitizeFirestoreId(ex.id, 'exam');
    const examPath = `exams/${examId}`;
    const validClasses =
      Array.isArray(ex.classes) && ex.classes.length > 0
        ? ex.classes.slice(0, 30).map((c) => truncateStr(c, 32, '7A1'))
        : ['7A1'];
    const validQuestionIds =
      Array.isArray(ex.questionIds) && ex.questionIds.length > 0
        ? ex.questionIds.slice(0, 100).map((qid) => sanitizeFirestoreId(qid, 'q'))
        : ['q_default'];

    try {
      const examRef = doc(db, 'exams', examId);
      const existingSnap = await getDoc(examRef);
      if (!existingSnap.exists()) {
        await setDoc(examRef, {
          id: examId,
          ownerId: uid,
          title: truncateStr(ex.title, MAX_TITLE_LENGTH, 'Đề kiểm tra Tin học 7'),
          examType: ex.type || '15_phut',
          status: ex.status || 'chua_mo',
          durationMinutes: Math.max(1, Math.min(180, Math.round(ex.durationMinutes || 15))),
          totalQuestions: Math.max(1, Math.min(100, Math.round(ex.totalQuestions || validQuestionIds.length))),
          maxScore: Math.max(1, Math.min(100, Number(ex.maxScore || 10))),
          classes: validClasses,
          questionIds: validQuestionIds,
          allowReviewAfterSubmit: Boolean(ex.allowReviewAfterSubmit),
          shuffleQuestions: Boolean(ex.shuffleQuestions),
          shuffleOptions: Boolean(ex.shuffleOptions),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (existingSnap.data().status !== 'da_ket_thuc') {
        const existingData = existingSnap.data();
        await updateDoc(examRef, {
          id: examId,
          ownerId: existingData.ownerId,
          title: truncateStr(ex.title, MAX_TITLE_LENGTH, 'Đề kiểm tra Tin học 7'),
          examType: ex.type || '15_phut',
          status: ex.status || 'chua_mo',
          durationMinutes: Math.max(1, Math.min(180, Math.round(ex.durationMinutes || 15))),
          totalQuestions: Math.max(1, Math.min(100, Math.round(ex.totalQuestions || validQuestionIds.length))),
          maxScore: Math.max(1, Math.min(100, Number(ex.maxScore || 10))),
          classes: validClasses,
          questionIds: validQuestionIds,
          allowReviewAfterSubmit: Boolean(ex.allowReviewAfterSubmit),
          shuffleQuestions: Boolean(ex.shuffleQuestions),
          shuffleOptions: Boolean(ex.shuffleOptions),
          createdAt: existingData.createdAt,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, examPath);
    }
  }

  // 2. Đồng bộ Học sinh và điểm số (/students/{studentId})
  for (const st of params.students.slice(0, 60)) {
    const studentId = sanitizeFirestoreId(st.id, 'st');
    const studentPath = `students/${studentId}`;
    const loginCode = sanitizeFirestoreId(st.loginCode, 'hs');
    try {
      const stRef = doc(db, 'students', studentId);
      const existingSnap = await getDoc(stRef);
      const latestScore =
        typeof st.latestScore === 'number' && Number.isFinite(st.latestScore)
          ? Math.max(-1, Math.min(10, st.latestScore))
          : -1;
      const latestExamTitle = truncateStr(st.latestExamTitle || '', 250, '');
      const examScores = st.examScores && typeof st.examScores === 'object' ? st.examScores : {};

      if (!existingSnap.exists()) {
        await setDoc(stRef, {
          id: studentId,
          ownerId: uid,
          fullName: truncateStr(st.fullName, MAX_NAME_LENGTH, 'Học sinh'),
          normalizedName: truncateStr(st.normalizedName || st.fullName, MAX_NAME_LENGTH, 'hoc sinh'),
          loginCode,
          className: truncateStr(st.className, 32, '7A1'),
          latestScore,
          latestExamTitle,
          examScores,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingData = existingSnap.data();
        await updateDoc(stRef, {
          id: studentId,
          ownerId: existingData.ownerId,
          fullName: truncateStr(st.fullName, MAX_NAME_LENGTH, 'Học sinh'),
          normalizedName: truncateStr(st.normalizedName || st.fullName, MAX_NAME_LENGTH, 'hoc sinh'),
          loginCode,
          className: truncateStr(st.className, 32, '7A1'),
          latestScore,
          latestExamTitle,
          examScores,
          createdAt: existingData.createdAt,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, studentPath);
    }
  }

  // 3. Đồng bộ Câu hỏi (/questions/{questionId}) - ưu tiên các câu hỏi không chứa ảnh base64 quá 500KB
  for (const q of params.questions.slice(0, 50)) {
    const questionId = sanitizeFirestoreId(q.id, 'q');
    const questionPath = `questions/${questionId}`;
    const qType = getQuestionType(q);
    const safeImageUrl =
      q.imageUrl && q.imageUrl.length < 200_000 ? q.imageUrl : undefined;

    const payloadMap: Record<string, unknown> = {
      options: q.options || [],
      correctOptionId: q.correctOptionId || '',
      statements: q.statements || [],
      matchingPairs: q.matchingPairs || [],
      explanation: truncateStr(q.explanation || '', 2000, ''),
      ...(safeImageUrl ? { imageUrl: safeImageUrl } : {}),
      ...(q.imageCaption ? { imageCaption: truncateStr(q.imageCaption, 200, '') } : {}),
    };

    try {
      const qRef = doc(db, 'questions', questionId);
      const existingSnap = await getDoc(qRef);
      if (!existingSnap.exists()) {
        await setDoc(qRef, {
          id: questionId,
          ownerId: uid,
          questionType: qType,
          themeId: truncateStr(q.themeId, 64, 'chu_de_1'),
          themeName: truncateStr(q.themeName, 200, 'Chủ đề 1'),
          lessonId: truncateStr(q.lessonId, 64, 'bai_1'),
          lessonName: truncateStr(q.lessonName, 200, 'Bài 1'),
          content: truncateStr(q.content, MAX_QUESTION_CONTENT_LENGTH, 'Câu hỏi'),
          cognitiveLevel: q.cognitiveLevel || 'nhan_biet',
          reviewStatus: q.reviewStatus || 'da_kiem_duyet',
          payloadMap,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingData = existingSnap.data();
        await updateDoc(qRef, {
          id: questionId,
          ownerId: existingData.ownerId,
          questionType: qType,
          themeId: truncateStr(q.themeId, 64, 'chu_de_1'),
          themeName: truncateStr(q.themeName, 200, 'Chủ đề 1'),
          lessonId: truncateStr(q.lessonId, 64, 'bai_1'),
          lessonName: truncateStr(q.lessonName, 200, 'Bài 1'),
          content: truncateStr(q.content, MAX_QUESTION_CONTENT_LENGTH, 'Câu hỏi'),
          cognitiveLevel: q.cognitiveLevel || 'nhan_biet',
          reviewStatus: q.reviewStatus || 'da_kiem_duyet',
          payloadMap,
          createdAt: existingData.createdAt,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, questionPath);
    }
  }

  return { ok: true, syncedAt: new Date().toISOString() };
}

/**
 * Đồng bộ 1 phiên làm bài của học sinh lên subcollection /exams/{examId}/sessions/{sessionId}
 */
export async function syncSessionToFirestore(
  session: StudentExamSession
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;

  const uid = sanitizeFirestoreId(currentUser.uid, 'user');
  const examId = sanitizeFirestoreId(session.examId, 'exam');
  const sessionId = sanitizeFirestoreId(session.id || `${session.studentId}_${session.examId}`, 'sess');
  const sessionPath = `exams/${examId}/sessions/${sessionId}`;

  try {
    const sessRef = doc(db, 'exams', examId, 'sessions', sessionId);
    const existingSnap = await getDoc(sessRef);
    const score =
      typeof session.score === 'number' && Number.isFinite(session.score)
        ? Math.max(0, Math.min(100, session.score))
        : 0;

    if (!existingSnap.exists()) {
      await setDoc(sessRef, {
        id: sessionId,
        examId,
        studentId: sanitizeFirestoreId(session.studentId, 'st'),
        ownerId: uid,
        paperCode: truncateStr(session.paperCode, 32, 'MD701'),
        status: session.status || 'dang_lam_bai',
        timeRemainingSeconds: Math.max(0, Math.min(10800, Math.round(session.timeRemainingSeconds || 0))),
        currentQuestionIndex: Math.max(0, Math.min(100, Math.round(session.currentQuestionIndex || 0))),
        score,
        correctCount: Math.max(0, Math.min(100, Math.round(session.correctCount || 0))),
        wrongCount: Math.max(0, Math.min(100, Math.round(session.wrongCount || 0))),
        unansweredCount: Math.max(0, Math.min(100, Math.round(session.unansweredCount || 0))),
        answers: session.answers || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (existingSnap.data().status !== 'da_nop_bai') {
      const existingData = existingSnap.data();
      await updateDoc(sessRef, {
        id: sessionId,
        examId: existingData.examId,
        studentId: existingData.studentId,
        ownerId: existingData.ownerId,
        paperCode: existingData.paperCode,
        status: session.status || 'dang_lam_bai',
        timeRemainingSeconds: Math.max(0, Math.min(10800, Math.round(session.timeRemainingSeconds || 0))),
        currentQuestionIndex: Math.max(0, Math.min(100, Math.round(session.currentQuestionIndex || 0))),
        score,
        correctCount: Math.max(0, Math.min(100, Math.round(session.correctCount || 0))),
        wrongCount: Math.max(0, Math.min(100, Math.round(session.wrongCount || 0))),
        unansweredCount: Math.max(0, Math.min(100, Math.round(session.unansweredCount || 0))),
        answers: session.answers || {},
        createdAt: existingData.createdAt,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, sessionPath);
  }
}

/**
 * Lắng nghe danh sách các kỳ thi của Giáo viên trên Firestore theo thời gian thực
 */
export function subscribeTeacherExamsFromFirestore(
  onExamsSnapshot: (remoteExams: Partial<Exam>[]) => void
): Unsubscribe | null {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;

  const examsPath = 'exams';
  const q = query(collection(db, examsPath), where('ownerId', '==', currentUser.uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Partial<Exam>[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: d.id,
          title: d.title,
          type: d.examType,
          status: d.status,
          durationMinutes: d.durationMinutes,
          totalQuestions: d.totalQuestions,
          maxScore: d.maxScore,
          classes: d.classes,
          questionIds: d.questionIds,
          allowReviewAfterSubmit: d.allowReviewAfterSubmit,
          shuffleQuestions: d.shuffleQuestions,
          shuffleOptions: d.shuffleOptions,
        });
      });
      onExamsSnapshot(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, examsPath);
    }
  );
}

/**
 * Truy vấn số lượng bản ghi đã lưu trên Cloud Firestore của Giáo viên
 */
export async function fetchFirestoreCloudStats(): Promise<{
  examsCount: number;
  studentsCount: number;
  questionsCount: number;
} | null> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;

  try {
    const [examsSnap, studentsSnap, questionsSnap] = await Promise.all([
      getDocs(query(collection(db, 'exams'), where('ownerId', '==', currentUser.uid))),
      getDocs(query(collection(db, 'students'), where('ownerId', '==', currentUser.uid))),
      getDocs(query(collection(db, 'questions'), where('ownerId', '==', currentUser.uid))),
    ]);
    return {
      examsCount: examsSnap.size,
      studentsCount: studentsSnap.size,
      questionsCount: questionsSnap.size,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'exams');
  }
}
