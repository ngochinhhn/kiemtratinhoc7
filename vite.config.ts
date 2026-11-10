import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { SEED_EXAMS, SEED_CONFIG, SEED_SYNC_ID, SEED_UPDATED_AT } from './src/data/seedExams';
import { SEED_QUESTIONS } from './src/data/seedQuestions';
import { SEED_CLASSES, SEED_STUDENTS } from './src/data/seedStudents';

/**
 * Plugin tự động lưu và cập nhật trực tiếp phần src/data/ (seedQuestions.ts, seedStudents.ts, seedExams.ts, liveSubmissions.json)
 * và cung cấp API đồng bộ thời gian thực trực tiếp trên máy chủ (/api/sync-repo-data & /api/live-submissions)
 * để đảm bảo ứng dụng luôn hoạt động 100% ngay cả khi Firebase Firestore hết hạn mức đọc miễn phí trong ngày (Quota Exceeded).
 */
function repoDataSyncPlugin(): Plugin {
  const rootDir = import.meta.dirname || process.cwd();
  const dataDir = path.resolve(rootDir, 'src/data');
  const seedQuestionsFile = path.join(dataDir, 'seedQuestions.ts');
  const seedStudentsFile = path.join(dataDir, 'seedStudents.ts');
  const seedExamsFile = path.join(dataDir, 'seedExams.ts');
  const liveSubmissionsFile = path.join(dataDir, 'liveSubmissions.json');

  // Bộ nhớ đệm trực tiếp trên máy chủ (khởi tạo từ dữ liệu seed hiện có)
  let serverSyncId = SEED_SYNC_ID || `sync_${Date.now()}`;
  let serverUpdatedAt = SEED_UPDATED_AT || new Date().toISOString();
  let serverConfig: Record<string, any> = { ...(SEED_CONFIG || {}) };
  let serverClasses: string[] = Array.isArray(SEED_CLASSES) ? [...SEED_CLASSES] : [];
  let serverQuestions: any[] = Array.isArray(SEED_QUESTIONS) ? [...SEED_QUESTIONS] : [];
  let serverStudents: any[] = Array.isArray(SEED_STUDENTS) ? [...SEED_STUDENTS] : [];
  let serverExams: any[] = Array.isArray(SEED_EXAMS) ? [...SEED_EXAMS] : [];
  const serverSubmissionsMap = new Map<string, any>();

  // Đọc danh sách bài nộp đã lưu trên đĩa (nếu có)
  try {
    if (fs.existsSync(liveSubmissionsFile)) {
      const raw = fs.readFileSync(liveSubmissionsFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((sub) => {
          if (sub && sub.id) {
            serverSubmissionsMap.set(String(sub.id), sub);
          }
        });
      }
    }
  } catch {
    // ignore
  }

  const persistStudentsToDisk = (nowIso: string) => {
    try {
      const nextStudentsBody = `export const SEED_CLASSES: string[] = ${JSON.stringify(
        serverClasses,
        null,
        2
      )};\n\nexport const SEED_STUDENTS: Student[] = ${JSON.stringify(
        serverStudents,
        null,
        2
      )};\n\nexport function buildSeedStudents(): Student[] {\n  return SEED_STUDENTS.map((s) => ({ ...s }));\n}\n`;
      const existingStudentsContent = fs.existsSync(seedStudentsFile)
        ? fs.readFileSync(seedStudentsFile, 'utf-8')
        : '';
      if (!existingStudentsContent.includes(nextStudentsBody)) {
        const seedStudentsContent = `import { Student } from '../types';\n\n// Tự động cập nhật từ phiên làm việc lúc: ${nowIso}\n${nextStudentsBody}`;
        fs.writeFileSync(seedStudentsFile, seedStudentsContent, 'utf-8');
      }
    } catch {
      // ignore read-only fs errors in restricted containers
    }
  };

  const persistSubmissionsToDisk = () => {
    try {
      const allSubs = Array.from(serverSubmissionsMap.values());
      fs.writeFileSync(liveSubmissionsFile, JSON.stringify(allSubs, null, 2), 'utf-8');
    } catch {
      // ignore read-only fs errors
    }
  };

  const attachMiddlewares = (middlewares: any) => {
    // 1. Endpoint lấy/cập nhật bài nộp độc lập của học sinh (/api/live-submissions)
    middlewares.use('/api/live-submissions', (req: any, res: any, next: any) => {
      if (req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            ok: true,
            updatedAt: serverUpdatedAt,
            submissions: Array.from(serverSubmissionsMap.values()),
          })
        );
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const sub = JSON.parse(body);
            if (!sub || !sub.id || !sub.examId) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: 'Invalid submission payload' }));
              return;
            }

            const nowIso = new Date().toISOString();
            const submissionId = String(sub.id);
            const record = {
              ...sub,
              id: submissionId,
              submittedAt: sub.submittedAt || nowIso,
            };
            serverSubmissionsMap.set(submissionId, record);
            serverUpdatedAt = nowIso;

            // Cập nhật điểm trực tiếp vào danh sách học sinh trên server
            const studentCodeLower = String(sub.studentCode || '').toLowerCase();
            const classNameUpper = String(sub.className || '').toUpperCase();
            serverStudents = serverStudents.map((st: any) => {
              const matchById = st.id === sub.studentId;
              const matchByCodeAndClass =
                String(st.loginCode || '').toLowerCase() === studentCodeLower &&
                String(st.className || '').toUpperCase() === classNameUpper;
              const matchByCodeOnly =
                String(st.loginCode || '').toLowerCase() === studentCodeLower;

              if (!matchById && !matchByCodeAndClass && !matchByCodeOnly) {
                return st;
              }

              const existingScores =
                st.examScores && typeof st.examScores === 'object' ? st.examScores : {};
              const updatedExamScores = {
                ...existingScores,
                [sub.examId]: {
                  examId: sub.examId,
                  examTitle: sub.examTitle || 'Đề kiểm tra Tin học 7',
                  score: Number(sub.score ?? 0),
                  correctCount: Number(sub.correctCount ?? 0),
                  wrongCount: Number(sub.wrongCount ?? 0),
                  unansweredCount: Number(sub.unansweredCount ?? 0),
                  paperCode: sub.paperCode || 'MD701',
                  submittedAt: record.submittedAt,
                },
              };

              return {
                ...st,
                latestScore: Number(sub.score ?? 0),
                latestExamId: sub.examId,
                latestExamTitle: sub.examTitle || st.latestExamTitle || 'Đề kiểm tra Tin học 7',
                latestSubmittedAt: record.submittedAt,
                examScores: updatedExamScores,
              };
            });

            persistSubmissionsToDisk();
            persistStudentsToDisk(nowIso);

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                ok: true,
                submissionId,
                updatedAt: nowIso,
              })
            );
          } catch (err) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : 'Submission save error',
              })
            );
          }
        });
        return;
      }

      next();
    });

    // 2. Endpoint đồng bộ toàn bộ dữ liệu đề thi, câu hỏi, học sinh, bài nộp (/api/sync-repo-data)
    middlewares.use('/api/sync-repo-data', (req: any, res: any, next: any) => {
      if (req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            ok: true,
            syncId: serverSyncId,
            updatedAt: serverUpdatedAt,
            config: serverConfig,
            classes: serverClasses,
            questions: serverQuestions,
            students: serverStudents,
            exams: serverExams,
            submissions: Array.from(serverSubmissionsMap.values()),
            files: [
              'src/data/seedQuestions.ts',
              'src/data/seedStudents.ts',
              'src/data/seedExams.ts',
            ],
          })
        );
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (
              parsed &&
              Array.isArray(parsed.questions) &&
              Array.isArray(parsed.students) &&
              Array.isArray(parsed.exams)
            ) {
              const nowIso = new Date().toISOString();
              const syncId = `sync_${Date.now()}`;
              const classes: string[] = Array.isArray(parsed.classes)
                ? parsed.classes
                : Array.from(
                    new Set(
                      parsed.students
                        .map((s: { className?: string }) => s.className)
                        .filter(Boolean)
                    )
                  );

              // Bảo toàn điểm thi của học sinh đã nộp trên server khi Giáo viên cập nhật danh sách
              const existingStudentsById = new Map(
                serverStudents.map((s: any) => [String(s.id), s])
              );
              const mergedStudents = parsed.students.map((incomingSt: any) => {
                const prevSt = existingStudentsById.get(String(incomingSt.id));
                const combinedScores = {
                  ...(prevSt?.examScores || {}),
                  ...(incomingSt.examScores || {}),
                };
                const sorted = Object.values(combinedScores).sort((a: any, b: any) =>
                  String(b?.submittedAt || '').localeCompare(String(a?.submittedAt || ''))
                ) as any[];
                const latest = sorted[0];
                return {
                  ...incomingSt,
                  examScores: combinedScores,
                  ...(latest
                    ? {
                        latestScore: latest.score,
                        latestExamId: latest.examId,
                        latestExamTitle: latest.examTitle,
                        latestSubmittedAt: latest.submittedAt,
                      }
                    : {}),
                };
              });

              serverSyncId = syncId;
              serverUpdatedAt = nowIso;
              serverConfig = parsed.config || serverConfig;
              serverClasses = classes;
              serverQuestions = parsed.questions;
              serverStudents = mergedStudents;
              serverExams = parsed.exams;

              // 1. Cập nhật trực tiếp src/data/seedQuestions.ts (chỉ ghi xuống đĩa khi nội dung câu hỏi thay đổi)
              try {
                const nextQuestionsBody = `export const SEED_QUESTIONS: Question[] = ${JSON.stringify(
                  serverQuestions,
                  null,
                  2
                )};\n`;
                const existingQuestionsContent = fs.existsSync(seedQuestionsFile)
                  ? fs.readFileSync(seedQuestionsFile, 'utf-8')
                  : '';
                if (!existingQuestionsContent.includes(nextQuestionsBody)) {
                  const seedQuestionsContent = `import { Question } from '../types';\n\n// Tự động cập nhật từ phiên làm việc của Giáo viên lúc: ${nowIso}\n${nextQuestionsBody}`;
                  fs.writeFileSync(seedQuestionsFile, seedQuestionsContent, 'utf-8');
                }
              } catch {
                // ignore read-only fs errors
              }

              // 2. Cập nhật trực tiếp src/data/seedStudents.ts
              persistStudentsToDisk(nowIso);

              // 3. Cập nhật trực tiếp src/data/seedExams.ts
              try {
                const nextExamsBody = `export const SEED_CONFIG: Partial<SystemConfig> = ${JSON.stringify(
                  serverConfig || {},
                  null,
                  2
                )};\n\nexport const SEED_EXAMS: Exam[] = ${JSON.stringify(
                  serverExams,
                  null,
                  2
                )};\n`;
                const existingExamsContent = fs.existsSync(seedExamsFile)
                  ? fs.readFileSync(seedExamsFile, 'utf-8')
                  : '';
                if (!existingExamsContent.includes(nextExamsBody)) {
                  const seedExamsContent = `import { Exam, SystemConfig } from '../types';\n\n// Tự động cập nhật từ phiên làm việc của Giáo viên lúc: ${nowIso}\nexport const SEED_SYNC_ID = ${JSON.stringify(
                    syncId
                  )};\nexport const SEED_UPDATED_AT = ${JSON.stringify(
                    nowIso
                  )};\n\n${nextExamsBody}`;
                  fs.writeFileSync(seedExamsFile, seedExamsContent, 'utf-8');
                }
              } catch {
                // ignore read-only fs errors
              }

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  ok: true,
                  syncId,
                  updatedAt: nowIso,
                  filesUpdated: [
                    'src/data/seedQuestions.ts',
                    'src/data/seedStudents.ts',
                    'src/data/seedExams.ts',
                  ],
                  counts: {
                    questions: serverQuestions.length,
                    classes: serverClasses.length,
                    students: serverStudents.length,
                    exams: serverExams.length,
                  },
                })
              );
              return;
            }
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: 'Invalid payload' }));
          } catch (err) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : 'Write error',
              })
            );
          }
        });
        return;
      }

      next();
    });
  };

  return {
    name: 'smarttest7-repo-data-sync',
    configureServer(server) {
      attachMiddlewares(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddlewares(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), repoDataSyncPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      'firebase/app': path.resolve(
        import.meta.dirname || process.cwd(),
        'src/vendor/firebase/app.js'
      ),
      'firebase/auth': path.resolve(
        import.meta.dirname || process.cwd(),
        'src/vendor/firebase/auth.js'
      ),
      'firebase/firestore': path.resolve(
        import.meta.dirname || process.cwd(),
        'src/vendor/firebase/firestore.js'
      ),
      'pdfjs-dist/legacy/build/pdf.mjs': path.resolve(
        import.meta.dirname || process.cwd(),
        'src/vendor/pdf.min.mjs'
      ),
      'pdfjs-dist': path.resolve(
        import.meta.dirname || process.cwd(),
        'src/vendor/pdf.min.mjs'
      ),
      'canvas-confetti': path.resolve(
        import.meta.dirname || process.cwd(),
        'src/vendor/confetti.mjs'
      ),
      'lucide-react': path.resolve(
        import.meta.dirname || process.cwd(),
        'src/vendor/lucide-react.js'
      ),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
    watch:
      process.env.DISABLE_HMR === 'true'
        ? null
        : {
            ignored: [
              '**/src/data/seedQuestions.ts',
              '**/src/data/seedStudents.ts',
              '**/src/data/seedExams.ts',
              '**/src/data/liveSubmissions.json',
            ],
          },
  },
});
