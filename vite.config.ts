import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

/**
 * Plugin tự động lưu và cập nhật trực tiếp phần src/data/ (seedQuestions.ts, seedStudents.ts, seedExams.ts, publishedData.json)
 * mỗi khi Giáo viên cập nhật ngân hàng câu hỏi, danh sách lớp, danh sách học sinh, tạo/chỉnh sửa đề thi, cấu hình
 * và trước khi Giáo viên đăng xuất khỏi tài khoản.
 */
function repoDataSyncPlugin(): Plugin {
  const dataDir = path.resolve(__dirname, 'src/data');
  const seedQuestionsFile = path.join(dataDir, 'seedQuestions.ts');
  const seedStudentsFile = path.join(dataDir, 'seedStudents.ts');
  const seedExamsFile = path.join(dataDir, 'seedExams.ts');

  return {
    name: 'smarttest7-repo-data-sync',
    configureServer(server) {
      server.middlewares.use('/api/sync-repo-data', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              ok: true,
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
          req.on('data', (chunk) => {
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

                // 1. Cập nhật trực tiếp src/data/seedQuestions.ts
                const seedQuestionsContent = `import { Question } from '../types';\n\n// Tự động cập nhật từ phiên làm việc của Giáo viên lúc: ${nowIso}\nexport const SEED_QUESTIONS: Question[] = ${JSON.stringify(
                  parsed.questions,
                  null,
                  2
                )};\n`;
                fs.writeFileSync(seedQuestionsFile, seedQuestionsContent, 'utf-8');

                // 2. Cập nhật trực tiếp src/data/seedStudents.ts (bao gồm danh sách lớp SEED_CLASSES và danh sách học sinh)
                const seedStudentsContent = `import { Student } from '../types';\n\n// Tự động cập nhật từ phiên làm việc của Giáo viên lúc: ${nowIso}\nexport const SEED_CLASSES: string[] = ${JSON.stringify(
                  classes,
                  null,
                  2
                )};\n\nexport const SEED_STUDENTS: Student[] = ${JSON.stringify(
                  parsed.students,
                  null,
                  2
                )};\n\nexport function buildSeedStudents(): Student[] {\n  return SEED_STUDENTS.map((s) => ({ ...s }));\n}\n`;
                fs.writeFileSync(seedStudentsFile, seedStudentsContent, 'utf-8');

                // 3. Cập nhật trực tiếp src/data/seedExams.ts (bao gồm đề thi, cấu hình hệ thống và mốc đồng bộ)
                const seedExamsContent = `import { Exam, SystemConfig } from '../types';\n\n// Tự động cập nhật từ phiên làm việc của Giáo viên lúc: ${nowIso}\nexport const SEED_SYNC_ID = ${JSON.stringify(
                  syncId
                )};\nexport const SEED_UPDATED_AT = ${JSON.stringify(
                  nowIso
                )};\n\nexport const SEED_CONFIG: Partial<SystemConfig> = ${JSON.stringify(
                  parsed.config || {},
                  null,
                  2
                )};\n\nexport const SEED_EXAMS: Exam[] = ${JSON.stringify(
                  parsed.exams,
                  null,
                  2
                )};\n`;
                fs.writeFileSync(seedExamsFile, seedExamsContent, 'utf-8');

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
                      questions: parsed.questions.length,
                      classes: classes.length,
                      students: parsed.students.length,
                      exams: parsed.exams.length,
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
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), repoDataSyncPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
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
              ],
            },
    },
  };
});
