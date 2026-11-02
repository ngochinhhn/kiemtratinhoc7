import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

/**
 * Plugin đồng bộ dữ liệu trực tiếp từ trình duyệt Preview vào file mã nguồn src/data/publishedData.json
 * để khi giáo viên đóng gói (Build) hoặc Publish lên GitHub, bản đóng gói luôn chứa 100% dữ liệu mới nhất
 * (câu hỏi, lớp, danh sách học sinh, đề thi, cấu hình...) đã thao tác trên Preview.
 */
function repoDataSyncPlugin(): Plugin {
  const targetFile = path.resolve(__dirname, 'src/data/publishedData.json');

  return {
    name: 'smarttest7-repo-data-sync',
    configureServer(server) {
      server.middlewares.use('/api/sync-repo-data', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            if (fs.existsSync(targetFile)) {
              const raw = fs.readFileSync(targetFile, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(raw);
              return;
            }
          } catch (_err) {
            // ignore
          }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: false }));
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
                const snapshot = {
                  isPublishedSnapshot: true,
                  syncId,
                  updatedAt: nowIso,
                  config: parsed.config || {},
                  classes: Array.isArray(parsed.classes) ? parsed.classes : [],
                  questions: parsed.questions,
                  students: parsed.students,
                  exams: parsed.exams,
                  papers: parsed.papers || {},
                  sessions: parsed.sessions || {},
                };
                fs.writeFileSync(
                  targetFile,
                  JSON.stringify(snapshot, null, 2),
                  'utf-8'
                );
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(
                  JSON.stringify({
                    ok: true,
                    syncId,
                    updatedAt: nowIso,
                    counts: {
                      questions: snapshot.questions.length,
                      classes: snapshot.classes.length,
                      students: snapshot.students.length,
                      exams: snapshot.exams.length,
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
              ignored: ['**/src/data/publishedData.json'],
            },
    },
  };
});
