import {
  Exam,
  Question,
  Student,
  StudentExamPaper,
  StudentExamSession,
  SystemConfig,
} from '../types';
import { SEED_QUESTIONS } from '../data/seedQuestions';
import { SEED_CLASSES, buildSeedStudents } from '../data/seedStudents';
import {
  SEED_EXAMS,
  SEED_CONFIG,
  SEED_SYNC_ID,
  SEED_UPDATED_AT,
} from '../data/seedExams';
import { createStudentExamPaper } from './examShuffler';
import { gradeStudentExam, normalizeQuestionStructure } from './grading';

const KEYS = {
  QUESTIONS: 'smarttest7_questions_v1',
  DELETED_QUESTION_IDS: 'smarttest7_deleted_qids_v1',
  CLEANED_AUTO_SEED: 'smarttest7_cleaned_auto_seed_v1',
  STUDENTS: 'smarttest7_students_v1',
  CLASSES: 'smarttest7_classes_v1',
  EXAMS: 'smarttest7_exams_v1',
  PAPERS: 'smarttest7_papers_v1',
  SESSIONS: 'smarttest7_sessions_v1',
  CONFIG: 'smarttest7_config_v1',
  APPLIED_PUBLISH_ID: 'smarttest7_applied_publish_id_v1',
  HAS_LOCAL_EDITS: 'smarttest7_has_local_edits_v1',
  LAST_REPO_SYNC_AT: 'smarttest7_last_repo_sync_at_v1',
};

const SEED_QUESTION_MAP = new Map<string, Question>(
  SEED_QUESTIONS.map((sq) => [sq.id, sq])
);

const DEFAULT_CONFIG: SystemConfig = {
  serverIp: '192.168.1.15',
  serverPort: 3000,
  schoolName: 'Trường TH & THCS Thụy Lâm',
  subjectName: 'Tin học 7 - Bộ sách Kết nối tri thức với cuộc sống',
  activeExamId: SEED_CONFIG?.activeExamId ?? (SEED_EXAMS[0]?.id || null),
  autoSaveIntervalSeconds: 5,
  ...SEED_CONFIG,
};

const memoryStore = new Map<string, string>();

/**
 * Thu gọn dữ liệu mã đề của học sinh trước khi lưu vào localStorage:
 * Không nhân bản toàn bộ mảng questionSnapshots (và ảnh base64 nặng) cho từng học sinh.
 * Khi đọc ra bằng hydratePapersFromStorage, questionSnapshots sẽ được khôi phục từ ngân hàng câu hỏi.
 */
export function compactPapersForStorage(
  papers: Record<string, StudentExamPaper>,
  knownQuestionIds?: Set<string>
): Record<string, StudentExamPaper> {
  const compacted: Record<string, StudentExamPaper> = {};
  for (const [key, paper] of Object.entries(papers)) {
    if (!paper) continue;
    // Chỉ giữ lại các câu hỏi ngoại lai (không nằm trong ngân hàng câu hỏi hiện tại) và lược bỏ ảnh base64 nặng
    const fallbackSnapshots =
      knownQuestionIds && Array.isArray(paper.questionSnapshots)
        ? paper.questionSnapshots
            .filter((q) => q && !knownQuestionIds.has(q.id))
            .map((q) => {
              const { imageUrl, ...rest } = q;
              return imageUrl && imageUrl.startsWith('data:') && imageUrl.length > 2048
                ? (rest as Question)
                : q;
            })
        : [];

    compacted[key] = {
      studentId: paper.studentId,
      examId: paper.examId,
      paperCode: paper.paperCode,
      questionOrder: Array.isArray(paper.questionOrder) ? paper.questionOrder : [],
      optionOrders: paper.optionOrders || {},
      questionSnapshots: fallbackSnapshots,
    };
  }
  return compacted;
}

/**
 * Khôi phục đầy đủ questionSnapshots (bao gồm cả hình ảnh minh họa) cho từng mã đề học sinh
 * từ ngân hàng câu hỏi hiện hành.
 */
export function hydratePapersFromStorage(
  rawPapers: Record<string, StudentExamPaper>,
  questions: Question[]
): Record<string, StudentExamPaper> {
  const questionMap = new Map<string, Question>();
  for (const q of questions) {
    if (q && q.id) {
      questionMap.set(q.id, q);
    }
  }

  const hydrated: Record<string, StudentExamPaper> = {};
  for (const [key, paper] of Object.entries(rawPapers)) {
    if (!paper) continue;
    const snapshotMap = new Map<string, Question>();
    if (Array.isArray(paper.questionSnapshots)) {
      for (const snap of paper.questionSnapshots) {
        if (snap && snap.id) {
          snapshotMap.set(snap.id, snap);
        }
      }
    }

    const orderIds = Array.isArray(paper.questionOrder) ? paper.questionOrder : [];
    const hydratedSnapshots: Question[] = [];
    const seenIds = new Set<string>();

    for (const qId of orderIds) {
      const fromBank = questionMap.get(qId);
      const fromSnap = snapshotMap.get(qId);
      const resolved = fromBank ? (fromSnap ? { ...fromSnap, ...fromBank } : fromBank) : fromSnap;
      if (resolved) {
        hydratedSnapshots.push(resolved);
        seenIds.add(qId);
      }
    }

    // Bổ sung các câu hỏi có trong snapshot cũ nhưng chưa liệt kê trong questionOrder (nếu có)
    for (const [qId, snap] of snapshotMap.entries()) {
      if (!seenIds.has(qId)) {
        const fromBank = questionMap.get(qId);
        hydratedSnapshots.push(fromBank ? { ...snap, ...fromBank } : snap);
      }
    }

    hydrated[key] = {
      ...paper,
      questionOrder: orderIds,
      optionOrders: paper.optionOrders || {},
      questionSnapshots: hydratedSnapshots,
    };
  }

  return hydrated;
}

function safeGetItem<T>(key: string, defaultValue: T): T {
  try {
    if (memoryStore.has(key)) {
      const cached = memoryStore.get(key);
      if (cached) return JSON.parse(cached) as T;
    }
    if (typeof localStorage === 'undefined') return defaultValue;
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch (e) {
    console.warn(`Lỗi khi đọc ${key} từ localStorage:`, e);
    return defaultValue;
  }
}

function safeSetItem<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  memoryStore.set(key, serialized);

  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(key, serialized);
  } catch {
    // Tự động thu gọn dữ liệu đề thi học sinh (KEYS.PAPERS) trong localStorage để giải phóng bộ nhớ
    try {
      const rawPapersStr = localStorage.getItem(KEYS.PAPERS);
      if (rawPapersStr) {
        const parsedPapers = JSON.parse(rawPapersStr) as Record<string, StudentExamPaper>;
        const compactedPapers = compactPapersForStorage(parsedPapers);
        localStorage.setItem(KEYS.PAPERS, JSON.stringify(compactedPapers));
      }
      localStorage.setItem(key, serialized);
    } catch {
      try {
        if (key !== KEYS.PAPERS) {
          localStorage.removeItem(KEYS.PAPERS);
          localStorage.setItem(key, serialized);
        } else {
          localStorage.setItem(
            key,
            JSON.stringify(
              compactPapersForStorage(value as unknown as Record<string, StudentExamPaper>)
            )
          );
        }
      } catch {
        // Giữ nguyên trong memoryStore mà không ném lỗi ra console
      }
    }
  }
}

export class AppStorage {
  private static instance: AppStorage;

  private constructor() {
    this.ensureInitialized();
  }

  public static getInstance(): AppStorage {
    if (!AppStorage.instance) {
      AppStorage.instance = new AppStorage();
    }
    return AppStorage.instance;
  }

  public getDeletedQuestionIds(): Set<string> {
    const arr = safeGetItem<string[]>(KEYS.DELETED_QUESTION_IDS, []);
    return new Set(Array.isArray(arr) ? arr : []);
  }

  private addDeletedQuestionIds(ids: string[]): void {
    if (ids.length === 0) return;
    const current = this.getDeletedQuestionIds();
    ids.forEach((id) => current.add(id));
    safeSetItem(KEYS.DELETED_QUESTION_IDS, Array.from(current));
  }

  private removeDeletedQuestionIds(ids: string[]): void {
    if (ids.length === 0) return;
    const current = this.getDeletedQuestionIds();
    let changed = false;
    ids.forEach((id) => {
      if (current.delete(id)) changed = true;
    });
    if (changed) {
      safeSetItem(KEYS.DELETED_QUESTION_IDS, Array.from(current));
    }
  }

  public ensureInitialized(): void {
    if (typeof localStorage === 'undefined') return;

    // 1. Nén ngay dữ liệu KEYS.PAPERS cũ nếu đang chứa bản sao questionSnapshots cồng kềnh
    try {
      const existingPapersRaw = localStorage.getItem(KEYS.PAPERS);
      if (existingPapersRaw && existingPapersRaw.length > 50_000) {
        const parsed = JSON.parse(existingPapersRaw) as Record<string, StudentExamPaper>;
        const compacted = compactPapersForStorage(parsed);
        const compactedStr = JSON.stringify(compacted);
        memoryStore.set(KEYS.PAPERS, compactedStr);
        localStorage.setItem(KEYS.PAPERS, compactedStr);
      }
    } catch {
      try {
        localStorage.removeItem(KEYS.PAPERS);
      } catch {
        // ignore
      }
    }

    const isBrowserEnv =
      typeof window !== 'undefined' && typeof window.document !== 'undefined';
    const appliedPublishId = localStorage.getItem(KEYS.APPLIED_PUBLISH_ID);
    const hasLocalEdits = localStorage.getItem(KEYS.HAS_LOCAL_EDITS) === 'true';
    const hasExistingQuestions =
      Boolean(localStorage.getItem(KEYS.QUESTIONS)) || memoryStore.has(KEYS.QUESTIONS);

    if (
      isBrowserEnv &&
      SEED_QUESTIONS.length > 0 &&
      (!hasExistingQuestions ||
        (SEED_SYNC_ID && appliedPublishId !== SEED_SYNC_ID && !hasLocalEdits))
    ) {
      let shouldHydrateFromSeed = !hasExistingQuestions;
      if (hasExistingQuestions && !appliedPublishId) {
        const currentQs = safeGetItem<Question[]>(KEYS.QUESTIONS, []);
        const currentSts = safeGetItem<Student[]>(KEYS.STUDENTS, []);
        const isLegacyDefault =
          currentQs.length === 28 &&
          currentQs.every((q) => q.id.startsWith('kntt_')) &&
          currentSts.length === 60;
        if (isLegacyDefault) {
          shouldHydrateFromSeed = true;
        } else {
          try {
            localStorage.setItem(KEYS.HAS_LOCAL_EDITS, 'true');
            if (SEED_SYNC_ID) {
              localStorage.setItem(KEYS.APPLIED_PUBLISH_ID, SEED_SYNC_ID);
            }
          } catch {
            // ignore
          }
          shouldHydrateFromSeed = false;
        }
      } else if (
        hasExistingQuestions &&
        SEED_SYNC_ID &&
        appliedPublishId !== SEED_SYNC_ID &&
        !hasLocalEdits
      ) {
        shouldHydrateFromSeed = true;
      }

      if (shouldHydrateFromSeed) {
        safeSetItem(KEYS.QUESTIONS, SEED_QUESTIONS);
        safeSetItem(KEYS.STUDENTS, buildSeedStudents());
        safeSetItem(KEYS.CLASSES, SEED_CLASSES);
        safeSetItem(KEYS.EXAMS, SEED_EXAMS);
        safeSetItem(KEYS.CONFIG, DEFAULT_CONFIG);
        try {
          if (SEED_SYNC_ID) {
            localStorage.setItem(KEYS.APPLIED_PUBLISH_ID, SEED_SYNC_ID);
          }
          if (SEED_UPDATED_AT) {
            localStorage.setItem(KEYS.LAST_REPO_SYNC_AT, SEED_UPDATED_AT);
          }
        } catch {
          // ignore
        }
      }
    }

    // 2. Chỉ khởi tạo SEED_QUESTIONS khi ngân hàng câu hỏi hoàn toàn chưa tồn tại.
    if (!localStorage.getItem(KEYS.QUESTIONS) && !memoryStore.has(KEYS.QUESTIONS)) {
      safeSetItem(KEYS.QUESTIONS, SEED_QUESTIONS);
    } else if (!localStorage.getItem(KEYS.CLEANED_AUTO_SEED)) {
      // Khắc phục dữ liệu cho người dùng đã nạp PDF riêng nhưng bị phiên bản cũ nối thêm 28 câu mẫu kntt_*
      const rawQuestions = safeGetItem<Question[]>(KEYS.QUESTIONS, []);
      const hasCustomOrPdfQuestions = rawQuestions.some((q) => !q.id.startsWith('kntt_'));
      const hasLegacyKnttQuestions = rawQuestions.some((q) => q.id.startsWith('kntt_'));
      if (hasCustomOrPdfQuestions && hasLegacyKnttQuestions) {
        const removedSeedIds: string[] = [];
        const cleanedQuestions = rawQuestions.filter((q) => {
          if (!q.id.startsWith('kntt_')) return true;
          const seedQ = SEED_QUESTION_MAP.get(q.id);
          const wasEditedByUser =
            seedQ &&
            (q.content !== seedQ.content ||
              (q.updatedAt && q.updatedAt !== seedQ.updatedAt && q.updatedAt > '2026-10-30'));
          if (!wasEditedByUser) {
            removedSeedIds.push(q.id);
            return false;
          }
          return true;
        });

        if (removedSeedIds.length > 0) {
          this.addDeletedQuestionIds(removedSeedIds);
          safeSetItem(KEYS.QUESTIONS, cleanedQuestions);
          this.syncExamsAndPapersWithQuestionBank(cleanedQuestions, new Set(removedSeedIds));
        }
      }
      try {
        localStorage.setItem(KEYS.CLEANED_AUTO_SEED, 'true');
      } catch {
        // ignore
      }
    }

    if (!localStorage.getItem(KEYS.STUDENTS) && !memoryStore.has(KEYS.STUDENTS)) {
      safeSetItem(KEYS.STUDENTS, buildSeedStudents());
    }
    if (!localStorage.getItem(KEYS.CLASSES) && !memoryStore.has(KEYS.CLASSES)) {
      safeSetItem(KEYS.CLASSES, SEED_CLASSES);
    }
    if (!localStorage.getItem(KEYS.EXAMS) && !memoryStore.has(KEYS.EXAMS)) {
      safeSetItem(KEYS.EXAMS, SEED_EXAMS);
    }
    if (!localStorage.getItem(KEYS.CONFIG) && !memoryStore.has(KEYS.CONFIG)) {
      safeSetItem(KEYS.CONFIG, DEFAULT_CONFIG);
    }

    // Tự sinh cấu hình đề và phiên thi cho đề thi đang diễn ra mặc định (để học sinh vào thi được ngay)
    const exams = this.getExams();
    const activeExam = exams.find((e) => e.status === 'dang_dien_ra') || exams[0];
    if (activeExam) {
      const papers = this.getPapers();
      const students = this.getStudents();
      const eligibleStudents = students.filter((s) => activeExam.classes.includes(s.className));
      const questions = this.getQuestions();
      const questionMap = new Map(questions.map((q) => [q.id, q]));
      const examQuestions = activeExam.questionIds
        .map((id) => questionMap.get(id))
        .filter((q): q is Question => Boolean(q));

      if (eligibleStudents.length > 0 && examQuestions.length > 0) {
        let hasChanges = false;
        const sessions = this.getSessions();

        eligibleStudents.forEach((student, idx) => {
          const key = `${student.id}_${activeExam.id}`;
          const existingPaper = papers[key];
          const needsRebuildPaper =
            !existingPaper ||
            existingPaper.questionOrder.length !== examQuestions.length ||
            !examQuestions.every((eq) => existingPaper.questionOrder.includes(eq.id));

          if (needsRebuildPaper) {
            const paper = createStudentExamPaper(
              student.id,
              activeExam.id,
              idx,
              examQuestions,
              activeExam.shuffleQuestions,
              activeExam.shuffleOptions
            );
            papers[key] = paper;
            hasChanges = true;
          }

          if (!sessions[key]) {
            sessions[key] = {
              id: `sess_${student.id}_${activeExam.id}`,
              examId: activeExam.id,
              studentId: student.id,
              paperCode: papers[key].paperCode,
              status: idx === 0 ? 'da_dang_nhap' : 'chua_dang_nhap',
              timeRemainingSeconds: activeExam.durationMinutes * 60,
              answers: {},
              lastHeartbeat: new Date().toISOString(),
              workstationIp: `192.168.1.${100 + idx}`,
            };
            hasChanges = true;
          }
        });

        if (hasChanges) {
          this.savePapers(papers);
          this.saveSessions(sessions);
        }
      }
    }
  }

  /**
   * Đồng bộ lại các đề thi và phiếu bài làm khi câu hỏi trong ngân hàng bị xóa hoặc chỉnh sửa
   */
  private syncExamsAndPapersWithQuestionBank(
    questions: Question[],
    removedIds: Set<string>
  ): void {
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // 1. Loại bỏ các ID câu hỏi đã bị xóa khỏi danh sách câu hỏi của các đề thi
    if (removedIds.size > 0) {
      const exams = this.getExams();
      let examsChanged = false;
      const updatedExams = exams.map((ex) => {
        if (!Array.isArray(ex.questionIds)) return ex;
        const nextIds = ex.questionIds.filter(
          (id) => !removedIds.has(id) && (questionMap.has(id) || !SEED_QUESTION_MAP.has(id))
        );
        if (nextIds.length !== ex.questionIds.length) {
          examsChanged = true;
          return {
            ...ex,
            questionIds: nextIds,
            totalQuestions: nextIds.length,
          };
        }
        return ex;
      });
      if (examsChanged) {
        safeSetItem(KEYS.EXAMS, updatedExams);
      }
    }

    // 2. Cập nhật lại papers để không còn giữ snapshot của câu hỏi đã xóa và luôn phản ánh nội dung vừa sửa
    const rawPapers = safeGetItem<Record<string, StudentExamPaper>>(KEYS.PAPERS, {});
    let papersChanged = false;
    const updatedPapers: Record<string, StudentExamPaper> = {};

    for (const [key, paper] of Object.entries(rawPapers)) {
      if (!paper) continue;
      const prevOrder = Array.isArray(paper.questionOrder) ? paper.questionOrder : [];
      const nextOrder = prevOrder.filter((id) => !removedIds.has(id));
      const prevSnaps = Array.isArray(paper.questionSnapshots) ? paper.questionSnapshots : [];
      const nextSnaps = prevSnaps
        .filter((sq) => sq && !removedIds.has(sq.id))
        .map((sq) => questionMap.get(sq.id) || sq);

      if (nextOrder.length !== prevOrder.length || nextSnaps.length !== prevSnaps.length) {
        papersChanged = true;
      }

      const nextOptionOrders = { ...(paper.optionOrders || {}) };
      for (const remId of removedIds) {
        if (remId in nextOptionOrders) {
          delete nextOptionOrders[remId];
          papersChanged = true;
        }
      }

      updatedPapers[key] = {
        ...paper,
        questionOrder: nextOrder,
        optionOrders: nextOptionOrders,
        questionSnapshots: nextSnaps,
      };
    }

    if (papersChanged) {
      this.savePapers(updatedPapers);
    }
  }

  // --- QUESTIONS ---
  public getQuestions(): Question[] {
    const raw = safeGetItem<Question[]>(KEYS.QUESTIONS, SEED_QUESTIONS);
    const deletedIds = this.getDeletedQuestionIds();
    const filtered = deletedIds.size === 0 ? raw : raw.filter((q) => q && !deletedIds.has(q.id));
    return filtered.map((q) => normalizeQuestionStructure(q));
  }

  public saveQuestions(questions: Question[]): void {
    const normalizedQuestions = questions.map((q) => normalizeQuestionStructure(q));
    const previousQuestions = safeGetItem<Question[]>(KEYS.QUESTIONS, []);
    const newIdSet = new Set(normalizedQuestions.map((q) => q.id));
    const removedIds = previousQuestions
      .filter((q) => q && !newIdSet.has(q.id))
      .map((q) => q.id);

    // Ghi nhận các câu hỏi đã xóa để không bao giờ tự động xuất hiện lại
    if (removedIds.length > 0) {
      this.addDeletedQuestionIds(removedIds);
    }
    // Nếu người dùng chủ động nạp lại hoặc thêm câu hỏi có ID nằm trong danh sách xóa trước đó thì gỡ khỏi danh sách xóa
    this.removeDeletedQuestionIds(Array.from(newIdSet));

    safeSetItem(KEYS.QUESTIONS, normalizedQuestions);
    this.syncExamsAndPapersWithQuestionBank(normalizedQuestions, new Set(removedIds));
    this.markLocalEditAndSync();
  }

  // --- STUDENTS ---
  public getStudents(): Student[] {
    return safeGetItem<Student[]>(KEYS.STUDENTS, []);
  }

  public saveStudents(students: Student[]): void {
    safeSetItem(KEYS.STUDENTS, students);
    this.markLocalEditAndSync();
  }

  public batchDeleteStudents(studentIds: string[]): void {
    const idSet = new Set(studentIds);
    const students = this.getStudents().filter((s) => !idSet.has(s.id));
    this.saveStudents(students);
  }

  // --- CLASSES ---
  public getClasses(): string[] {
    const customClasses = safeGetItem<string[]>(KEYS.CLASSES, SEED_CLASSES);
    const students = this.getStudents();
    const studentClasses = students.map((s) => s.className);
    const union = Array.from(new Set([...customClasses, ...studentClasses])).filter(Boolean);
    return union.sort();
  }

  public saveClasses(classes: string[]): void {
    safeSetItem(KEYS.CLASSES, classes);
    this.markLocalEditAndSync();
  }

  public addClass(className: string): boolean {
    const trimmed = className.trim().toUpperCase();
    if (!trimmed) return false;
    const current = this.getClasses();
    if (!current.includes(trimmed)) {
      this.saveClasses([...current, trimmed].sort());
      return true;
    }
    return false;
  }

  public addClasses(classNames: string[]): { added: string[]; skipped: string[] } {
    const current = new Set(this.getClasses());
    const added: string[] = [];
    const skipped: string[] = [];

    classNames.forEach((raw) => {
      const trimmed = raw.trim().toUpperCase();
      if (!trimmed) return;
      if (current.has(trimmed)) {
        skipped.push(trimmed);
      } else {
        current.add(trimmed);
        added.push(trimmed);
      }
    });

    if (added.length > 0) {
      this.saveClasses(Array.from(current).sort());
    }

    return { added, skipped };
  }

  public deleteClass(className: string, removeStudents: boolean = false): void {
    const trimmed = className.trim().toUpperCase();
    const current = this.getClasses().filter((c) => c !== trimmed);
    this.saveClasses(current);

    if (removeStudents) {
      const students = this.getStudents().filter((s) => s.className !== trimmed);
      this.saveStudents(students);
    }
  }

  // --- EXAMS ---
  public getExams(): Exam[] {
    return safeGetItem<Exam[]>(KEYS.EXAMS, []);
  }

  public saveExams(exams: Exam[]): void {
    safeSetItem(KEYS.EXAMS, exams);

    // Đồng bộ lại papers của các đề thi nếu danh sách câu hỏi (questionIds) của đề vừa được giáo viên chỉnh sửa
    const papers = this.getPapers();
    const questions = this.getQuestions();
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const allStudents = this.getStudents();
    let papersChanged = false;

    for (const exam of exams) {
      const examQuestions = (exam.questionIds || [])
        .map((id) => questionMap.get(id))
        .filter((q): q is Question => Boolean(q));
      if (examQuestions.length === 0) continue;

      const eligibleStudents = allStudents.filter((s) => exam.classes.includes(s.className));
      eligibleStudents.forEach((student, idx) => {
        const key = `${student.id}_${exam.id}`;
        const existingPaper = papers[key];
        if (!existingPaper) return;

        const needsRebuild =
          existingPaper.questionOrder.length !== examQuestions.length ||
          !examQuestions.every((eq) => existingPaper.questionOrder.includes(eq.id));

        if (needsRebuild) {
          papers[key] = createStudentExamPaper(
            student.id,
            exam.id,
            idx,
            examQuestions,
            exam.shuffleQuestions,
            exam.shuffleOptions
          );
          papersChanged = true;
        }
      });
    }

    if (papersChanged) {
      this.savePapers(papers);
    }
    this.markLocalEditAndSync();
  }

  public deleteExam(examId: string): void {
    const exams = this.getExams().filter((e) => e.id !== examId);
    this.saveExams(exams);

    // Xóa các papers và sessions liên quan đến kỳ thi này
    const papers = this.getPapers();
    let papersChanged = false;
    for (const key of Object.keys(papers)) {
      if (key.endsWith(`_${examId}`) || papers[key]?.examId === examId) {
        delete papers[key];
        papersChanged = true;
      }
    }
    if (papersChanged) this.savePapers(papers);

    const sessions = this.getSessions();
    let sessionsChanged = false;
    for (const key of Object.keys(sessions)) {
      if (key.endsWith(`_${examId}`) || sessions[key]?.examId === examId) {
        delete sessions[key];
        sessionsChanged = true;
      }
    }
    if (sessionsChanged) this.saveSessions(sessions);

    // Cập nhật cấu hình nếu đề thi này đang là activeExamId
    const config = this.getConfig();
    if (config.activeExamId === examId) {
      config.activeExamId = exams.length > 0 ? exams[0].id : '';
      this.saveConfig(config);
    }
  }

  public updateExam(exam: Exam): void {
    const exams = this.getExams();
    const idx = exams.findIndex((e) => e.id === exam.id);
    if (idx >= 0) {
      exams[idx] = exam;
      this.saveExams(exams);
    } else {
      this.saveExams([exam, ...exams]);
    }
  }

  // --- PAPERS & SESSIONS ---
  public getPapers(): Record<string, StudentExamPaper> {
    const rawPapers = safeGetItem<Record<string, StudentExamPaper>>(KEYS.PAPERS, {});
    return hydratePapersFromStorage(rawPapers, this.getQuestions());
  }

  public savePapers(papers: Record<string, StudentExamPaper>): void {
    const knownQuestionIds = new Set(this.getQuestions().map((q) => q.id));
    const compacted = compactPapersForStorage(papers, knownQuestionIds);
    safeSetItem(KEYS.PAPERS, compacted);
  }

  public getSessions(): Record<string, StudentExamSession> {
    return safeGetItem<Record<string, StudentExamSession>>(KEYS.SESSIONS, {});
  }

  public saveSessions(sessions: Record<string, StudentExamSession>): void {
    safeSetItem(KEYS.SESSIONS, sessions);
  }

  public getSession(studentId: string, examId: string): StudentExamSession | null {
    const sessions = this.getSessions();
    return sessions[`${studentId}_${examId}`] || null;
  }

  public saveSession(session: StudentExamSession): void {
    const sessions = this.getSessions();
    sessions[`${session.studentId}_${session.examId}`] = session;
    this.saveSessions(sessions);
  }

  public getPaper(studentId: string, examId: string): StudentExamPaper | null {
    const papers = this.getPapers();
    return papers[`${studentId}_${examId}`] || null;
  }

  // --- CONFIG ---
  public getConfig(): SystemConfig {
    const cfg = safeGetItem<SystemConfig>(KEYS.CONFIG, DEFAULT_CONFIG);
    if (!cfg.schoolName || cfg.schoolName === 'Trường THCS Lê Quý Đôn') {
      cfg.schoolName = 'Trường TH & THCS Thụy Lâm';
      safeSetItem(KEYS.CONFIG, cfg);
    }
    return cfg;
  }

  public saveConfig(config: SystemConfig): void {
    safeSetItem(KEYS.CONFIG, config);
    this.markLocalEditAndSync();
  }

  // --- ACTIONS ---
  /**
   * Mở kỳ thi: Khởi tạo mã đề và phiên thi riêng cho tất cả học sinh thuộc lớp được chỉ định
   */
  public activateExam(examId: string): void {
    const exams = this.getExams();
    const exam = exams.find((e) => e.id === examId);
    if (!exam) throw new Error('Không tìm thấy đề thi');

    // Đảm bảo chỉ có 1 kỳ thi đang mở tại một thời điểm trong phòng máy
    exams.forEach((e) => {
      if (e.id !== examId && e.status === 'dang_dien_ra') {
        e.status = 'tam_dung';
      }
    });

    exam.status = 'dang_dien_ra';
    exam.startTime = new Date().toISOString();
    this.saveExams(exams);

    const questions = this.getQuestions();
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const examQuestions = exam.questionIds
      .map((id) => questionMap.get(id))
      .filter((q): q is Question => Boolean(q));
    const allStudents = this.getStudents();
    const eligibleStudents = allStudents.filter((s) => exam.classes.includes(s.className));

    const papers = this.getPapers();
    const sessions = this.getSessions();

    eligibleStudents.forEach((student, idx) => {
      const key = `${student.id}_${exam.id}`;
      const existingPaper = papers[key];
      const needsRebuildPaper =
        !existingPaper ||
        existingPaper.questionOrder.length !== examQuestions.length ||
        !examQuestions.every((eq) => existingPaper.questionOrder.includes(eq.id));

      if (needsRebuildPaper) {
        papers[key] = createStudentExamPaper(
          student.id,
          exam.id,
          idx,
          examQuestions,
          exam.shuffleQuestions,
          exam.shuffleOptions
        );
      }

      if (!sessions[key]) {
        sessions[key] = {
          id: `sess_${student.id}_${exam.id}`,
          examId: exam.id,
          studentId: student.id,
          paperCode: papers[key].paperCode,
          status: 'chua_dang_nhap',
          timeRemainingSeconds: exam.durationMinutes * 60,
          answers: {},
          lastHeartbeat: new Date().toISOString(),
          workstationIp: `192.168.1.${100 + (student.workstationNumber || idx + 1)}`,
        };
      }
    });

    this.savePapers(papers);
    this.saveSessions(sessions);

    const config = this.getConfig();
    config.activeExamId = exam.id;
    this.saveConfig(config);
  }

  /**
   * Tạm dừng kỳ thi
   */
  public pauseExam(examId: string): void {
    const exams = this.getExams();
    const exam = exams.find((e) => e.id === examId);
    if (exam) {
      exam.status = 'tam_dung';
      this.saveExams(exams);
    }
    const config = this.getConfig();
    if (config.activeExamId === examId) {
      const nextRunning = exams.find((e) => e.status === 'dang_dien_ra');
      config.activeExamId = nextRunning ? nextRunning.id : null;
      this.saveConfig(config);
    }
  }

  /**
   * Kết thúc kỳ thi và tự động chấm điểm cho các học sinh chưa nộp
   */
  public finishExam(examId: string): void {
    const exams = this.getExams();
    const exam = exams.find((e) => e.id === examId);
    if (!exam) return;

    exam.status = 'da_ket_thuc';
    exam.endTime = new Date().toISOString();
    this.saveExams(exams);

    const config = this.getConfig();
    if (config.activeExamId === examId) {
      const nextRunning = exams.find((e) => e.status === 'dang_dien_ra');
      config.activeExamId = nextRunning ? nextRunning.id : null;
      this.saveConfig(config);
    }

    const papers = this.getPapers();
    const sessions = this.getSessions();

    Object.values(sessions).forEach((session) => {
      if (session.examId === examId && session.status !== 'da_nop_bai') {
        session.status = 'da_nop_bai';
        session.submittedAt = new Date().toISOString();
        session.timeRemainingSeconds = 0;

        const paper = papers[`${session.studentId}_${examId}`];
        if (paper) {
          const graded = gradeStudentExam(
            session.answers,
            paper.questionSnapshots,
            exam.maxScore
          );
          session.score = graded.score;
          session.correctCount = graded.correctCount;
          session.wrongCount = graded.wrongCount;
          session.unansweredCount = graded.unansweredCount;
        }
      }
    });

    this.saveSessions(sessions);
  }

  /**
   * Sao lưu toàn bộ cơ sở dữ liệu hệ thống thành chuỗi JSON
   */
  public exportBackup(): string {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      schoolName: this.getConfig().schoolName,
      questions: this.getQuestions(),
      students: this.getStudents(),
      exams: this.getExams(),
      papers: this.getPapers(),
      sessions: this.getSessions(),
      config: this.getConfig(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Phục hồi cơ sở dữ liệu từ chuỗi JSON sao lưu
   */
  public importBackup(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (!data.questions || !data.students || !data.exams) {
        throw new Error('Định dạng tệp sao lưu không hợp lệ');
      }
      safeSetItem(KEYS.QUESTIONS, data.questions);
      safeSetItem(KEYS.STUDENTS, data.students);
      safeSetItem(KEYS.EXAMS, data.exams);
      if (data.classes) safeSetItem(KEYS.CLASSES, data.classes);
      if (data.papers) this.savePapers(data.papers);
      if (data.sessions) safeSetItem(KEYS.SESSIONS, data.sessions);
      if (data.config) safeSetItem(KEYS.CONFIG, data.config);
      this.markLocalEditAndSync();
      return true;
    } catch (e) {
      console.error('Lỗi phục hồi bản sao lưu:', e);
      return false;
    }
  }

  private repoSyncTimer: ReturnType<typeof setTimeout> | null = null;

  private markLocalEditAndSync(): void {
    if (typeof window === 'undefined' || typeof window.document === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(KEYS.HAS_LOCAL_EDITS, 'true');
    } catch {
      // ignore
    }
    if (this.repoSyncTimer) {
      clearTimeout(this.repoSyncTimer);
    }
    this.repoSyncTimer = setTimeout(() => {
      void this.syncToSourceRepo();
    }, 100);
  }

  /**
   * Thực thi lưu và cập nhật ngay lập tức toàn bộ Data vào src/data/ (seedQuestions.ts, seedStudents.ts, seedExams.ts)
   * trước khi Giáo viên đăng xuất khỏi tài khoản.
   */
  public async flushRepoSyncBeforeLogout(): Promise<{
    ok: boolean;
    updatedAt?: string;
    counts?: { questions: number; classes: number; students: number; exams: number };
  }> {
    if (this.repoSyncTimer) {
      clearTimeout(this.repoSyncTimer);
      this.repoSyncTimer = null;
    }
    return await this.syncToSourceRepo();
  }

  /**
   * Đồng bộ khẩn cấp qua sendBeacon / keepalive khi Giáo viên đóng tab trình duyệt đột ngột
   */
  public syncViaBeacon(): void {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({
        config: this.getConfig(),
        classes: this.getClasses(),
        questions: this.getQuestions(),
        students: this.getStudents(),
        exams: this.getExams(),
      });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/sync-repo-data', blob);
      } else if (typeof fetch === 'function') {
        void fetch('/api/sync-repo-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Đồng bộ toàn bộ dữ liệu hiện hành trên trình duyệt Preview (câu hỏi, lớp, học sinh, đề thi, cấu hình...)
   * vào trực tiếp các file trong src/data/ (seedQuestions.ts, seedStudents.ts, seedExams.ts) để khi đóng gói / Publish lên GitHub
   * luôn có 100% dữ liệu mới nhất.
   */
  public async syncToSourceRepo(): Promise<{
    ok: boolean;
    updatedAt?: string;
    counts?: { questions: number; classes: number; students: number; exams: number };
  }> {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      return { ok: false };
    }
    try {
      const questions = this.getQuestions();
      const classes = this.getClasses();
      const students = this.getStudents();
      const exams = this.getExams();
      const config = this.getConfig();

      const response = await fetch('/api/sync-repo-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config,
          classes,
          questions,
          students,
          exams,
        }),
      });

      if (!response.ok) {
        return { ok: false };
      }
      const resData = await response.json();
      if (resData && resData.ok) {
        try {
          if (resData.syncId) {
            localStorage.setItem(KEYS.APPLIED_PUBLISH_ID, resData.syncId);
          }
          if (resData.updatedAt) {
            localStorage.setItem(KEYS.LAST_REPO_SYNC_AT, resData.updatedAt);
          }
        } catch {
          // ignore
        }
        return {
          ok: true,
          updatedAt: resData.updatedAt,
          counts: resData.counts,
        };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }

  public getLastRepoSyncAt(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(KEYS.LAST_REPO_SYNC_AT) || SEED_UPDATED_AT || null;
  }

  /**
   * Khôi phục toàn bộ dữ liệu mẫu ban đầu
   */
  public resetToDefaults(): void {
    memoryStore.clear();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(KEYS.QUESTIONS);
      localStorage.removeItem(KEYS.DELETED_QUESTION_IDS);
      localStorage.removeItem(KEYS.CLEANED_AUTO_SEED);
      localStorage.removeItem(KEYS.STUDENTS);
      localStorage.removeItem(KEYS.CLASSES);
      localStorage.removeItem(KEYS.EXAMS);
      localStorage.removeItem(KEYS.PAPERS);
      localStorage.removeItem(KEYS.SESSIONS);
      localStorage.removeItem(KEYS.CONFIG);
      localStorage.removeItem(KEYS.APPLIED_PUBLISH_ID);
      localStorage.removeItem(KEYS.HAS_LOCAL_EDITS);
    }
    this.ensureInitialized();
  }
}

export const appStorage = AppStorage.getInstance();
