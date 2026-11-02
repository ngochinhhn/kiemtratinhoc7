import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  extractLinesFromPageItems,
  extractImageBoxesFromOperatorList,
  normalizeThemeHeader,
  parseRawQuestionsFromText,
} from './pdfParser';

describe('pdfParser utilities', () => {
  it('normalizeThemeHeader should format uppercase Vietnamese theme titles cleanly', () => {
    const t1 = normalizeThemeHeader('1', 'MÁY TÍNH VÀ CỘNG ĐỒNG');
    assert.strictEqual(t1.themeId, 'chu_de_1');
    assert.strictEqual(t1.themeName, 'Chủ đề 1: Máy tính và cộng đồng');

    const t2 = normalizeThemeHeader('2', 'TỔ CHỨC LƯU TRỮ, TÌM KIẾM VÀ TRAO ĐỔI THÔNG TIN');
    assert.strictEqual(t2.themeId, 'chu_de_2');
    assert.strictEqual(t2.themeName, 'Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin');

    const t3 = normalizeThemeHeader('3', 'ĐẠO ĐỨC, PHÁP LUẬT VÀ VĂN HOÁ TRONG MÔI TRƯỜNG SỐ');
    assert.strictEqual(t3.themeId, 'chu_de_3');
    assert.strictEqual(t3.themeName, 'Chủ đề 3: Đạo đức, pháp luật và văn hoá trong môi trường số');
  });

  it('extractImageBoxesFromOperatorList should extract valid image bounding boxes from PDF operators', () => {
    const OPS = pdfjsLib.OPS;
    const fnArray = [
      OPS.save,
      OPS.transform,
      OPS.paintImageXObject,
      OPS.restore,
      OPS.save,
      OPS.transform,
      OPS.paintImageXObject,
      OPS.restore,
      // Tiny icon (should be ignored)
      OPS.save,
      OPS.transform,
      OPS.paintImageXObject,
      OPS.restore,
    ];
    const argsArray = [
      [],
      [180, 0, 0, 120, 80, 500], // Image 1 at x=80, y=500, w=180, h=120 (topY=620)
      ['img_scanner'],
      [],
      [],
      [150, 0, 0, 110, 90, 220], // Image 2 at x=90, y=220, w=150, h=110 (topY=330)
      ['img_headphones'],
      [],
      [],
      [10, 0, 0, 10, 50, 50], // Tiny 10x10 icon -> filtered out
      ['img_tiny'],
      [],
    ];

    const boxes = extractImageBoxesFromOperatorList(fnArray, argsArray, 595, 842);
    assert.strictEqual(boxes.length, 2);
    assert.strictEqual(boxes[0].width, 180);
    assert.strictEqual(boxes[0].height, 120);
    assert.strictEqual(boxes[0].topY, 620);
    assert.strictEqual(boxes[1].width, 150);
    assert.strictEqual(boxes[1].topY, 330);
  });

  it('parseRawQuestionsFromText should parse embedded [[IMAGE:...]] tokens and figure captions accurately', () => {
    const sample = `
--- Trang 1 ---
CHỦ ĐỀ 1. MÁY TÍNH VÀ CỘNG ĐỒNG
Bài 1. Thiết bị vào – ra
Câu 1.1. Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?
[[IMAGE:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==]]
Hình 1.1. Máy quét
A. Thiết bị vào.
B. Thiết bị ra.
C. Thiết bị vừa vào vừa ra.
D. Thiết bị lưu trữ.
• Đáp án: A
• Hướng dẫn giải: Máy quét là thiết bị đưa dữ liệu dạng ảnh vào máy tính.
--- Trang 11 ---
CHỦ ĐỀ 3. ĐẠO ĐỨC, PHÁP LUẬT VÀ VĂN HOÁ TRONG MÔI TRƯỜNG
SỐ
Bài 5. Ứng xử trên mạng
Câu 5.2. Mục tiêu của giao tiếp qua mạng là gì?
A. Giúp người khác hiểu em một cách rõ ràng.
B. Hiểu người khác một cách rõ ràng.
C. Giữ mối quan hệ tốt để có thể tiếp tục giao tiếp.
D. Tất cả những điều trên.
• Đáp án: D
`;

    const questions = parseRawQuestionsFromText(sample, 'Cau_hoi_chu_de_1-3.pdf');
    assert.strictEqual(questions.length, 2);

    const q1 = questions[0];
    assert.strictEqual(q1.themeId, 'chu_de_1');
    assert.ok(q1.imageUrl?.startsWith('data:image/png;base64,'));
    assert.strictEqual(q1.imageCaption, 'Hình 1.1. Máy quét');
    // Caption không bị trộn lẫn vào câu hỏi
    assert.strictEqual(
      q1.content,
      'Câu 1.1. Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?'
    );
    assert.strictEqual(q1.options[3].content, 'Thiết bị lưu trữ.');

    const q2 = questions[1];
    assert.strictEqual(q2.imageUrl, undefined);
  });

  it('should accurately extract and categorize all 46 questions and attach textbook figures for Hình 1.1-1.4 from public/assets/aistudio/Cau_hoi_chu_de_1-3_49e93ef8.pdf', async () => {
    const pdfPath = 'public/assets/aistudio/Cau_hoi_chu_de_1-3_49e93ef8.pdf';
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    assert.strictEqual(pdfDoc.numPages, 14);

    let fullText = '';
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const tc = await page.getTextContent();
      const lines = extractLinesFromPageItems(tc.items as any[]);
      fullText += `\n--- Trang ${pageNum} ---\n` + lines.join('\n');
    }

    const parsed = parseRawQuestionsFromText(fullText, 'Cau_hoi_chu_de_1-3.pdf');
    assert.strictEqual(parsed.length, 46);

    // Kiểm tra 4 câu đầu tiên (Câu 1.1 -> 1.4) đều được gắn hình ảnh minh họa Hình 1.1 -> Hình 1.4
    assert.strictEqual(parsed[0].imageUrl, '/assets/aistudio/hinh_1_1_may_quet.png');
    assert.strictEqual(parsed[0].imageCaption, 'Hình 1.1. Máy quét');
    assert.strictEqual(parsed[1].imageUrl, '/assets/aistudio/hinh_1_2_tai_nghe.png');
    assert.strictEqual(parsed[1].imageCaption, 'Hình 1.2. Tai nghe');
    assert.strictEqual(parsed[2].imageUrl, '/assets/aistudio/hinh_1_3_dia_cung.svg');
    assert.strictEqual(parsed[3].imageUrl, '/assets/aistudio/hinh_1_4_tay_cam_game.svg');
  });
});
