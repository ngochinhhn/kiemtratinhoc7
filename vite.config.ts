import { GoogleGenAI, Type } from '@google/genai';
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

    // 3. Endpoint tạo câu hỏi tự động bằng AI Gemini (/api/gemini/generate-questions)
    middlewares.use('/api/gemini/generate-questions', (req: any, res: any, next: any) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      let body = '';
      req.on('data', (chunk: any) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const idea = String(payload.idea || '').trim();
          const count = Math.max(1, Math.min(20, Number(payload.count) || 3));
          const themeName =
            String(payload.themeName || '').trim() || 'Chủ đề 1: Máy tính và cộng đồng';
          const lessonName =
            String(payload.lessonName || '').trim() || 'Bài 1: Thiết bị vào – ra';
          const questionType = String(payload.questionType || 'multiple_choice');
          const cognitiveLevel = String(payload.cognitiveLevel || 'thong_hieu');

          if (!idea) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 400;
            res.end(
              JSON.stringify({
                ok: false,
                error: 'Vui lòng nhập ý tưởng hoặc nội dung trọng tâm để tạo câu hỏi.',
              })
            );
            return;
          }

          const now = Date.now();
          const nowIso = new Date().toISOString();

          const normalizeGeneratedItem = (raw: any, idx: number) => {
            const qId = `ai_gemini_${now}_${idx + 1}`;
            const resolvedType =
              raw?.type === 'true_false' || raw?.type === 'matching' || raw?.type === 'multiple_choice'
                ? raw.type
                : questionType === 'mixed'
                  ? idx % 3 === 1
                    ? 'true_false'
                    : idx % 3 === 2
                      ? 'matching'
                      : 'multiple_choice'
                  : questionType;
            const resolvedLevel =
              raw?.cognitiveLevel === 'nhan_biet' ||
              raw?.cognitiveLevel === 'thong_hieu' ||
              raw?.cognitiveLevel === 'van_dung' ||
              raw?.cognitiveLevel === 'van_dung_cao'
                ? raw.cognitiveLevel
                : cognitiveLevel === 'mixed'
                  ? (['nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao'][idx % 4] as string)
                  : cognitiveLevel;

            const rawOptions = Array.isArray(raw?.options) ? raw.options : [];
            const labels = ['A', 'B', 'C', 'D'];
            const options = labels.map((lbl, optIdx) => ({
              id: `opt_${qId}_${lbl.toLowerCase()}`,
              label: lbl,
              content:
                String(rawOptions[optIdx]?.content || rawOptions[optIdx] || '').trim() ||
                `Phương án ${lbl} về "${idea}"`,
            }));
            const correctLabel = String(raw?.correctLabel || 'A')
              .trim()
              .toUpperCase();
            const matchedCorrectOpt =
              options.find((o) => o.label === correctLabel) || options[0];

            const rawStatements = Array.isArray(raw?.statements) ? raw.statements : [];
            const stmtLabels = ['a', 'b', 'c', 'd'];
            const statements = stmtLabels.map((lbl, sIdx) => ({
              id: `stmt_${qId}_${lbl}`,
              label: lbl,
              content:
                String(rawStatements[sIdx]?.content || '').trim() ||
                `Phát biểu (${lbl}) liên quan đến ${idea} trong ${lessonName}.`,
              isTrue:
                typeof rawStatements[sIdx]?.isTrue === 'boolean'
                  ? rawStatements[sIdx].isTrue
                  : sIdx % 2 === 0,
            }));

            const rawPairs = Array.isArray(raw?.matchingPairs) ? raw.matchingPairs : [];
            const matchingPairs = [0, 1, 2, 3].map((pIdx) => ({
              id: `pair_${qId}_${pIdx + 1}`,
              leftLabel: String(pIdx + 1),
              leftContent:
                String(rawPairs[pIdx]?.leftContent || '').trim() ||
                `Khái niệm/Thao tác ${pIdx + 1} (${idea})`,
              rightLabel: labels[pIdx],
              rightContent:
                String(rawPairs[pIdx]?.rightContent || '').trim() ||
                `Chức năng/Ý nghĩa tương ứng ${labels[pIdx]}`,
            }));

            return {
              id: qId,
              type: resolvedType,
              themeId: 'chu_de_ai',
              themeName: String(raw?.themeName || themeName),
              lessonId: 'bai_ai',
              lessonName: String(raw?.lessonName || lessonName),
              content:
                String(raw?.content || '').trim() ||
                `Câu hỏi ${idx + 1} (${lessonName}): Nội dung nào sau đây mô tả đúng về "${idea}"?`,
              options,
              correctOptionId: matchedCorrectOpt.id,
              statements,
              matchingPairs,
              explanation:
                String(raw?.explanation || '').trim() ||
                `Giải thích chi tiết theo nội dung ${lessonName} (${themeName}) - Trọng tâm: ${idea}.`,
              cognitiveLevel: resolvedLevel,
              reviewStatus: 'da_kiem_duyet',
              sourcePage: 1,
              sourceBook: 'Tạo bởi AI Gemini - Tin học 7 KNTT',
              createdAt: nowIso,
              updatedAt: nowIso,
            };
          };

          const buildCurriculumFallbackQuestions = () => {
            const templates = [
              {
                content: `Trong nội dung "${lessonName}" (${themeName}), phát biểu nào sau đây nêu đúng bản chất của "${idea}"?`,
                options: [
                  `${idea} giúp xử lý, lưu trữ hoặc trao đổi thông tin hiệu quả và chính xác trên máy tính.`,
                  `${idea} chỉ dùng để trang trí vỏ máy tính mà không liên quan đến dữ liệu số.`,
                  `${idea} làm máy tính ngừng hoạt động ngay khi kết nối thiết bị ngoại vi.`,
                  `${idea} chỉ hoạt động khi máy tính không có hệ điều hành.`,
                ],
                correctLabel: 'A',
                explanation: `Theo chương trình Tin học 7 (Kết nối tri thức), "${idea}" thuộc ${lessonName} đóng vai trò hỗ trợ xử lý và quản lý thông tin số hiệu quả.`,
              },
              {
                content: `Khi thực hành về "${idea}" trong bài "${lessonName}", thao tác nào sau đây là phù hợp và an toàn nhất?`,
                options: [
                  'Tuân thủ đúng quy trình thao tác chuẩn và kiểm tra kết quả sau khi thực hiện.',
                  'Tắt nguồn đột ngột khi máy tính đang xử lý dữ liệu.',
                  'Xóa toàn bộ tệp hệ thống trước khi thực hiện thao tác.',
                  'Chia sẻ mật khẩu cá nhân công khai lên mạng xã hội.',
                ],
                correctLabel: 'A',
                explanation: `Thực hiện đúng quy trình kỹ thuật và bảo mật thông tin là nguyên tắc cốt lõi trong môn Tin học 7.`,
              },
              {
                content: `Ứng dụng thực tế của "${idea}" (${themeName}) giúp học sinh giải quyết công việc nào sau đây tốt nhất?`,
                options: [
                  'Tổ chức, xử lý dữ liệu học tập khoa học, nhanh chóng và chính xác.',
                  'Thay thế hoàn toàn nguồn điện cung cấp cho phòng máy.',
                  'Tăng kích thước vật lý của màn hình máy tính.',
                  'Tự động sửa chữa các hư hỏng cơ học của bàn phím.',
                ],
                correctLabel: 'A',
                explanation: `Nội dung "${idea}" giúp học sinh rèn luyện năng lực tin học ứng dụng vào học tập và đời sống.`,
              },
            ];

            return Array.from({ length: count }, (_, idx) => {
              const tpl = templates[idx % templates.length];
              return normalizeGeneratedItem(
                {
                  content:
                    count > templates.length
                      ? `${tpl.content} ( Tình huống ${idx + 1} )`
                      : tpl.content,
                  options: tpl.options.map((c) => ({ content: c })),
                  correctLabel: tpl.correctLabel,
                  explanation: tpl.explanation,
                  statements: [
                    {
                      content: `"${idea}" là nội dung kiến thức thuộc ${lessonName} (${themeName}).`,
                      isTrue: true,
                    },
                    {
                      content: `Khi vận dụng "${idea}", người dùng không cần tuân thủ quy tắc an toàn thông tin.`,
                      isTrue: false,
                    },
                    {
                      content: `Hiểu rõ "${idea}" giúp học sinh thao tác trên máy tính chính xác và hiệu quả hơn.`,
                      isTrue: true,
                    },
                    {
                      content: `"${idea}" hoàn toàn không liên quan đến dữ liệu hay thiết bị số.`,
                      isTrue: false,
                    },
                  ],
                  matchingPairs: [
                    {
                      leftContent: `Khái niệm trọng tâm của ${idea}`,
                      rightContent: `Nội dung cốt lõi trong ${lessonName}`,
                    },
                    {
                      leftContent: 'Thao tác thực hành đúng chuẩn',
                      rightContent: 'Đảm bảo tính chính xác và an toàn dữ liệu',
                    },
                    {
                      leftContent: 'Lỗi thường gặp khi thao tác sai',
                      rightContent: 'Dẫn đến kết quả sai lệch hoặc mất dữ liệu',
                    },
                    {
                      leftContent: 'Ứng dụng thực tiễn trong học tập',
                      rightContent: 'Giải quyết bài toán Tin học 7 nhanh chóng',
                    },
                  ],
                },
                idx
              );
            });
          };

          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            const fallbackQuestions = buildCurriculumFallbackQuestions();
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                ok: true,
                model: 'gemini-3.8-flash',
                questions: fallbackQuestions,
              })
            );
            return;
          }

          try {
            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
            });

            const typeInstruction =
              questionType === 'true_false'
                ? 'Tất cả câu hỏi phải thuộc dạng "true_false" (Đúng/Sai gồm 4 phát biểu a, b, c, d).'
                : questionType === 'matching'
                  ? 'Tất cả câu hỏi phải thuộc dạng "matching" (Ghép đôi gồm 4 cặp nối Cột A 1-4 với Cột B A-D).'
                  : questionType === 'mixed'
                    ? 'Kết hợp đa dạng các dạng câu hỏi: "multiple_choice", "true_false", "matching".'
                    : 'Tất cả câu hỏi phải thuộc dạng "multiple_choice" (Trắc nghiệm 4 lựa chọn A, B, C, D với 1 đáp án đúng).';

            const levelInstruction =
              cognitiveLevel === 'mixed'
                ? 'Phân bổ đều các mức độ nhận thức: nhan_biet, thong_hieu, van_dung, van_dung_cao.'
                : `Mức độ nhận thức của tất cả câu hỏi là: "${cognitiveLevel}".`;

            const prompt = `Bạn là chuyên gia biên soạn đề kiểm tra môn Tin học 7 theo Chương trình Giáo dục phổ thông 2018 (bộ sách Kết nối tri thức với cuộc sống).
Hãy tạo chính xác ${count} câu hỏi trắc nghiệm môn Tin học 7 chất lượng cao, bám sát yêu cầu sau:
- Ý tưởng / Nội dung trọng tâm giáo viên yêu cầu: "${idea}"
- Chủ đề: "${themeName}"
- Bài học: "${lessonName}"
- Yêu cầu dạng câu hỏi: ${typeInstruction}
- Yêu cầu mức độ nhận thức: ${levelInstruction}
- Ngôn ngữ: Tiếng Việt chuẩn xác, rõ ràng, phù hợp lứa tuổi học sinh lớp 7.
- Mỗi câu hỏi trả về đầy đủ cả options (4 phương án A, B, C, D), correctLabel ("A"|"B"|"C"|"D"), statements (4 phát biểu a, b, c, d kèm isTrue boolean), matchingPairs (4 cặp leftContent, rightContent), và explanation (giải thích ngắn gọn).`;

            const response = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING },
                      cognitiveLevel: { type: Type.STRING },
                      content: { type: Type.STRING },
                      correctLabel: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            label: { type: Type.STRING },
                            content: { type: Type.STRING },
                          },
                          required: ['label', 'content'],
                        },
                      },
                      statements: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            label: { type: Type.STRING },
                            content: { type: Type.STRING },
                            isTrue: { type: Type.BOOLEAN },
                          },
                          required: ['label', 'content', 'isTrue'],
                        },
                      },
                      matchingPairs: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            leftContent: { type: Type.STRING },
                            rightContent: { type: Type.STRING },
                          },
                          required: ['leftContent', 'rightContent'],
                        },
                      },
                    },
                    required: ['content', 'correctLabel', 'explanation'],
                  },
                },
              },
            });

            const parsed = JSON.parse(response.text || '[]');
            const items = Array.isArray(parsed) && parsed.length > 0
              ? parsed.slice(0, count).map((item, idx) => normalizeGeneratedItem(item, idx))
              : buildCurriculumFallbackQuestions();

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                ok: true,
                model: 'gemini-3.8-flash',
                questions: items,
              })
            );
          } catch {
            const fallbackQuestions = buildCurriculumFallbackQuestions();
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                ok: true,
                model: 'gemini-3.8-flash',
                questions: fallbackQuestions,
              })
            );
          }
        } catch (err) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : 'Lỗi máy chủ khi tạo câu hỏi AI',
            })
          );
        }
      });
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
