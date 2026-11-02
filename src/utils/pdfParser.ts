import * as pdfjsLib from 'pdfjs-dist';
import { CognitiveLevel, Question, QuestionOption } from '../types';
import { normalizeQuestionStructure } from './grading';

// Cấu hình worker offline cho PDF.js trong môi trường trình duyệt Vite
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

/**
 * Bản đồ hình ảnh minh họa chuẩn trong Sách bài tập Tin học 7 - Kết nối tri thức
 * Tự động gắn hình ảnh khi câu hỏi tham chiếu đến "Hình 1.1", "Hình 1.2", "Hình 1.3", "Hình 1.4"
 * hoặc khi tệp PDF chỉ chứa văn bản tham chiếu hình mà không nhúng XObject binary.
 */
export const TEXTBOOK_FIGURE_MAP: Record<
  string,
  { imageUrl: string; imageCaption: string }
> = {
  '1.1': {
    imageUrl: '/assets/aistudio/hinh_1_1_may_quet.png',
    imageCaption: 'Hình 1.1. Máy quét',
  },
  '1.2': {
    imageUrl: '/assets/aistudio/hinh_1_2_tai_nghe.png',
    imageCaption: 'Hình 1.2. Tai nghe',
  },
  '1.3': {
    imageUrl: '/assets/aistudio/hinh_1_3_dia_cung.svg',
    imageCaption: 'Hình 1.3. Đĩa cứng',
  },
  '1.4': {
    imageUrl: '/assets/aistudio/hinh_1_4_tay_cam_game.svg',
    imageCaption: 'Hình 1.4. Bộ điều khiển game',
  },
};

export interface PageLineWithCoord {
  text: string;
  y: number;
}

export interface PdfImageBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  topY: number;
  bottomY: number;
}

/**
 * Nhân hai ma trận biến đổi 2D Affine 6 phần tử [a, b, c, d, e, f] của PDF
 */
export function multiplyTransform(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Quét OperatorList của một trang PDF để tìm tọa độ khung bao (bounding box)
 * của tất cả các hình ảnh nhúng (Image XObject / Inline Image) trên trang đó
 */
export function extractImageBoxesFromOperatorList(
  fnArray: number[],
  argsArray: any[][],
  pageWidth: number = 595,
  pageHeight: number = 842
): PdfImageBoundingBox[] {
  const OPS = pdfjsLib.OPS;
  const ctmStack: number[][] = [];
  let currentCtm: number[] = [1, 0, 0, 1, 0, 0];
  const boxes: PdfImageBoundingBox[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === OPS.save) {
      ctmStack.push([...currentCtm]);
    } else if (fn === OPS.restore) {
      if (ctmStack.length > 0) {
        currentCtm = ctmStack.pop()!;
      }
    } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
      currentCtm = multiplyTransform(currentCtm, args);
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageXObjectRepeat
    ) {
      // Hình ảnh đơn vị [0,1]x[0,1] biến đổi qua ma trận currentCtm
      const [a, b, c, d, e, f] = currentCtm;
      const xs = [e, e + a, e + c, e + a + c];
      const ys = [f, f + b, f + d, f + b + d];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = maxX - minX;
      const height = maxY - minY;

      // Bỏ qua các icon/đường kẻ quá nhỏ (< 24pt) hoặc ảnh nền toàn trang
      const isTooSmall = width < 24 || height < 24;
      const isFullPageBg = width > pageWidth * 0.94 && height > pageHeight * 0.94;

      if (!isTooSmall && !isFullPageBg) {
        // Kiểm tra trùng lặp khung bao gần tương đương
        const isDuplicate = boxes.some(
          (b) =>
            Math.abs(b.x - minX) < 5 &&
            Math.abs(b.y - minY) < 5 &&
            Math.abs(b.width - width) < 5 &&
            Math.abs(b.height - height) < 5
        );
        if (!isDuplicate) {
          boxes.push({
            x: minX,
            y: minY,
            width,
            height,
            topY: maxY,
            bottomY: minY,
          });
        }
      }
    }
  }

  // Sắp xếp từ trên xuống dưới theo hệ trục tọa độ PDF (y giảm dần)
  return boxes.sort((a, b) => b.topY - a.topY);
}

/**
 * Tái tạo các dòng văn bản kèm tọa độ Y từ danh sách TextItem của PDF.js
 */
export function extractLinesWithCoordsFromPageItems(items: any[]): PageLineWithCoord[] {
  const lines: PageLineWithCoord[] = [];
  let currentLine = '';
  let currentLineY = 0;
  let lastY: number | null = null;
  let lastRight: number | null = null;

  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue;
    const str = item.str;
    const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
    const x = typeof transform[4] === 'number' ? transform[4] : 0;
    const y = typeof transform[5] === 'number' ? transform[5] : 0;
    const w = typeof item.width === 'number' ? item.width : 0;

    if (lastY !== null && Math.abs(y - lastY) > 3) {
      if (currentLine.trim()) {
        lines.push({
          text: currentLine.replace(/\s+/g, ' ').trim(),
          y: currentLineY,
        });
      }
      currentLine = str;
      currentLineY = y;
    } else {
      if (!currentLine) {
        currentLineY = y;
      }
      if (
        lastRight !== null &&
        x - lastRight > 3 &&
        !currentLine.endsWith(' ') &&
        !str.startsWith(' ')
      ) {
        currentLine += ' ' + str;
      } else {
        currentLine += str;
      }
    }

    if (str.length > 0 || w > 0) {
      lastY = y;
      lastRight = x + w;
    }

    if (item.hasEOL) {
      if (currentLine.trim()) {
        lines.push({
          text: currentLine.replace(/\s+/g, ' ').trim(),
          y: currentLineY,
        });
      }
      currentLine = '';
      lastY = null;
      lastRight = null;
    }
  }

  if (currentLine.trim()) {
    lines.push({
      text: currentLine.replace(/\s+/g, ' ').trim(),
      y: currentLineY,
    });
  }

  return lines;
}

/**
 * Tái tạo danh sách chuỗi dòng văn bản từ danh sách TextItem của PDF.js
 */
export function extractLinesFromPageItems(items: any[]): string[] {
  return extractLinesWithCoordsFromPageItems(items).map((l) => l.text);
}

/**
 * Kết xuất trang PDF lên Canvas ẩn và cắt (crop) các vùng chứa hình ảnh minh họa thành Data URL
 */
async function renderAndCropPageImages(
  page: any,
  boxes: PdfImageBoundingBox[]
): Promise<{ y: number; dataUrl: string }[]> {
  if (typeof document === 'undefined' || boxes.length === 0) {
    return [];
  }

  try {
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);
    const ctx = pageCanvas.getContext('2d');
    if (!ctx) return [];

    await page.render({ canvasContext: ctx, viewport }).promise;

    const results: { y: number; dataUrl: string }[] = [];
    for (const box of boxes) {
      const rect = viewport.convertToViewportRectangle([
        box.x,
        box.y,
        box.x + box.width,
        box.y + box.height,
      ]);
      const pad = 6;
      const sx = Math.max(0, Math.floor(Math.min(rect[0], rect[2]) - pad));
      const sy = Math.max(0, Math.floor(Math.min(rect[1], rect[3]) - pad));
      const ex = Math.min(pageCanvas.width, Math.ceil(Math.max(rect[0], rect[2]) + pad));
      const ey = Math.min(pageCanvas.height, Math.ceil(Math.max(rect[1], rect[3]) + pad));
      const sw = ex - sx;
      const sh = ey - sy;

      if (sw > 20 && sh > 20) {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = sw;
        cropCanvas.height = sh;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.fillStyle = '#ffffff';
          cropCtx.fillRect(0, 0, sw, sh);
          cropCtx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
          results.push({
            y: box.topY,
            dataUrl: cropCanvas.toDataURL('image/jpeg', 0.85),
          });
        }
      }
    }

    return results;
  } catch (err) {
    console.warn('Không thể cắt hình ảnh từ trang PDF:', err);
    return [];
  }
}

/**
 * Trích xuất toàn bộ văn bản và hình ảnh nhúng từ dữ liệu nhị phân PDF (ArrayBuffer hoặc Uint8Array)
 */
export async function extractTextFromPdfData(
  data: ArrayBuffer | Uint8Array,
  onProgress?: (current: number, total: number) => void
): Promise<{ text: string; numPages: number; extractedImageCount: number }> {
  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const loadingTask = pdfjsLib.getDocument({ data: uint8 });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  let fullText = '';
  let extractedImageCount = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const linesWithCoords = extractLinesWithCoordsFromPageItems(textContent.items as any[]);

    // Kiểm tra xem trang PDF có chứa hình ảnh nhúng không
    let imageItems: { y: number; dataUrl: string }[] = [];
    try {
      const viewport = page.getViewport({ scale: 1.0 });
      const opList = await page.getOperatorList();
      const boxes = extractImageBoxesFromOperatorList(
        opList.fnArray,
        opList.argsArray,
        viewport.width,
        viewport.height
      );
      if (boxes.length > 0) {
        imageItems = await renderAndCropPageImages(page, boxes);
        extractedImageCount += imageItems.length;
      }
    } catch {
      // Nếu môi trường không hỗ trợ canvas (ví dụ Node CLI), bỏ qua bước render ảnh
    }

    // Trộn dòng văn bản và token [[IMAGE:...]] theo đúng thứ tự tọa độ Y từ trên xuống dưới
    const combined: { y: number; text: string }[] = [
      ...linesWithCoords.map((l) => ({ y: l.y, text: l.text })),
      ...imageItems.map((img) => ({ y: img.y, text: `[[IMAGE:${img.dataUrl}]]` })),
    ].sort((a, b) => b.y - a.y);

    fullText += `\n--- Trang ${pageNum} ---\n` + combined.map((c) => c.text).join('\n');
    if (onProgress) {
      onProgress(pageNum, numPages);
    }
  }

  return { text: fullText.trim(), numPages, extractedImageCount };
}

/**
 * Đọc và trích xuất toàn bộ văn bản + hình ảnh từ tệp PDF tải lên
 */
export async function extractTextFromPdfFile(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<{ text: string; numPages: number; extractedImageCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  return extractTextFromPdfData(arrayBuffer, onProgress);
}

/**
 * Tải và trích xuất văn bản + hình ảnh từ đường dẫn URL tệp PDF nội bộ (ví dụ: file đính kèm)
 */
export async function extractTextFromPdfUrl(
  url: string,
  onProgress?: (current: number, total: number) => void
): Promise<{
  text: string;
  numPages: number;
  fileSizeBytes: number;
  extractedImageCount: number;
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Không thể tải tệp PDF từ đường dẫn: ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const fileSizeBytes = arrayBuffer.byteLength;
  const { text, numPages, extractedImageCount } = await extractTextFromPdfData(
    arrayBuffer,
    onProgress
  );
  return { text, numPages, fileSizeBytes, extractedImageCount };
}

/**
 * Chuẩn hóa tên Chủ đề từ dòng tiêu đề in hoa trong PDF
 * Ví dụ: "CHỦ ĐỀ 1. MÁY TÍNH VÀ CỘNG ĐỒNG" -> "Chủ đề 1: Máy tính và cộng đồng"
 */
export function normalizeThemeHeader(
  themeNumber: string,
  rawTitle: string
): { themeId: string; themeName: string } {
  const cleaned = rawTitle.replace(/\s+/g, ' ').replace(/\.$/, '').trim();
  const lower = cleaned.toLowerCase();

  let sentenceCase = lower.charAt(0).toUpperCase() + lower.slice(1);
  sentenceCase = sentenceCase
    .replace(/\binternet\b/gi, 'Internet')
    .replace(/\bwindows\b/gi, 'Windows')
    .replace(/\bexcel\b/gi, 'Excel')
    .replace(/\bword\b/gi, 'Word')
    .replace(/\bpowerpoint\b/gi, 'PowerPoint')
    .replace(/\bscratch\b/gi, 'Scratch');

  return {
    themeId: `chu_de_${themeNumber}`,
    themeName: `Chủ đề ${themeNumber}: ${sentenceCase}`,
  };
}

/**
 * Sinh các phương án nhiễu hợp lý cho câu hỏi dạng ghép nối / sắp xếp / điền khuyết / Đúng-Sai
 * để chuyển đổi thành câu hỏi 4 lựa chọn A, B, C, D phục vụ thi trắc nghiệm
 */
function buildOptionsForCompoundAnswer(
  rawAnswer: string,
  seedIndex: number
): QuestionOption[] {
  const cleanAns = rawAnswer.trim() || 'Đáp án theo hướng dẫn của giáo viên';
  let distractors: string[] = [];

  if (cleanAns.includes('->')) {
    const parts = cleanAns
      .replace(/\.$/, '')
      .split('->')
      .map((s) => s.trim());
    if (parts.length >= 3) {
      distractors = [
        `${parts[1]} -> ${parts[0]} -> ${parts.slice(2).join(' -> ')}.`,
        `${parts[2]} -> ${parts[1]} -> ${parts[0]}.`,
        `${parts[0]} -> ${parts[2]} -> ${parts[1]}.`,
      ];
    }
  } else if (/1\s*-\s*[a-d]/i.test(cleanAns)) {
    distractors = [
      '1 - a; 2 - b; 3 - c.',
      '1 - c; 2 - a; 3 - b.',
      '1 - b; 2 - a; 3 - c.',
    ];
  } else if (/a\)\s*[^;]+;\s*b\)/i.test(cleanAns)) {
    const parts = cleanAns
      .replace(/\.$/, '')
      .split(';')
      .map((s) => s.replace(/^[a-d]\)\s*/i, '').trim());
    if (parts.length >= 3) {
      distractors = [
        `a) ${parts[1]}; b) ${parts[0]}; c) ${parts[2]}.`,
        `a) ${parts[2]}; b) ${parts[1]}; c) ${parts[0]}.`,
        `a) ${parts[0]}; b) ${parts[2]}; c) ${parts[1]}.`,
      ];
    }
  } else if (/Đúng/i.test(cleanAns) && /Sai/i.test(cleanAns)) {
    const swapped = cleanAns
      .replace(/Đúng/g, '__TEMP__')
      .replace(/Sai/g, 'Đúng')
      .replace(/__TEMP__/g, 'Sai');
    distractors = [
      swapped,
      'Tất cả các phát biểu đều Đúng.',
      'Tất cả các phát biểu đều Sai.',
    ];
  } else if (/Nên/i.test(cleanAns) && /Không nên/i.test(cleanAns)) {
    const swapped = cleanAns
      .replace(/Không nên/g, '__TEMP__')
      .replace(/Nên/g, 'Không nên')
      .replace(/__TEMP__/g, 'Nên');
    distractors = [
      swapped,
      'Tất cả các hành vi nêu trên đều Nên thực hiện.',
      'Tất cả các hành vi nêu trên đều Không nên thực hiện.',
    ];
  }

  if (distractors.length < 3) {
    distractors = [
      'Tất cả các phương án đều đúng tuyệt đối trong mọi trường hợp.',
      'Tất cả các phương án đều sai hoàn toàn.',
      'Không có phương án nào phù hợp với yêu cầu của câu hỏi.',
    ];
  }

  const uniqueDistractors = distractors.map((d, idx) =>
    d === cleanAns ? `${d} (Phương án khác ${idx + 1})` : d
  );

  const labels: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const allContents = [cleanAns, uniqueDistractors[0], uniqueDistractors[1], uniqueDistractors[2]];

  return labels.map((label, idx) => ({
    id: `opt_pdf_${seedIndex}_${label.toLowerCase()}`,
    label,
    content: allContents[idx],
  }));
}

/**
 * Trình phân tích cú pháp câu hỏi trắc nghiệm từ văn bản PDF / OCR
 * Hỗ trợ đầy đủ cấu trúc CHỦ ĐỀ, Bài, Câu X.Y., Hình ảnh minh họa, phương án A/B/C/D, Đáp án và Hướng dẫn giải
 */
export function parseRawQuestionsFromText(
  rawText: string,
  sourceBook: string = 'SBT Tin học 7 - Kết nối tri thức',
  defaultPage: number = 1
): Question[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsedQuestions: Question[] = [];

  let currentQuestionCode = '';
  let currentQuestionContent = '';
  let currentImageUrl = '';
  let currentImageCaption = '';
  let currentSubItems: string[] = [];
  let currentOptions: { id: string; label: 'A' | 'B' | 'C' | 'D' | 'E'; content: string }[] = [];
  let rawAnswerText = '';
  let currentExplanation = '';

  let currentThemeName = 'Chủ đề 1: Máy tính và cộng đồng';
  let currentThemeId = 'chu_de_1';
  let currentLessonName = 'Bài 1: Thiết bị vào – ra';
  let currentLessonId = 'bai_1';
  let hasExplicitStructure = false;
  let currentPage = defaultPage;
  let questionStartPage = defaultPage;

  let parserState: 'idle' | 'stem' | 'subitem' | 'option' | 'answer' | 'explanation' = 'idle';

  function inferThemeFromKeywords(content: string) {
    const lower = content.toLowerCase();
    if (
      lower.includes('bảng tính') ||
      lower.includes('excel') ||
      lower.includes('ô tính') ||
      lower.includes('hàm')
    ) {
      currentThemeName = 'Chủ đề 4: Ứng dụng tin học';
      currentThemeId = 'chu_de_4';
      currentLessonName = 'Bài 7: Phần mềm bảng tính';
      currentLessonId = 'bai_7';
    } else if (
      lower.includes('tìm kiếm tuần tự') ||
      lower.includes('tìm kiếm nhị phân') ||
      lower.includes('sắp xếp nổi bọt') ||
      lower.includes('sắp xếp chọn') ||
      lower.includes('thuật toán')
    ) {
      currentThemeName = 'Chủ đề 5: Giải quyết vấn đề với sự trợ giúp của máy tính';
      currentThemeId = 'chu_de_5';
      currentLessonName = 'Bài 14: Thuật toán tìm kiếm và sắp xếp';
      currentLessonId = 'bai_14';
    } else if (
      lower.includes('mạng xã hội') ||
      lower.includes('kênh trao đổi thông tin') ||
      lower.includes('thư điện tử')
    ) {
      currentThemeName = 'Chủ đề 2: Tổ chức lưu trữ, tìm kiếm và trao đổi thông tin';
      currentThemeId = 'chu_de_2';
      currentLessonName = 'Bài 4: Mạng xã hội và một số kênh trao đổi thông tin trên Internet';
      currentLessonId = 'bai_4';
    } else if (
      lower.includes('ứng xử') ||
      lower.includes('nghiện internet') ||
      lower.includes('bản quyền') ||
      lower.includes('pháp luật') ||
      lower.includes('văn hóa') ||
      lower.includes('văn hoá')
    ) {
      currentThemeName = 'Chủ đề 3: Đạo đức, pháp luật và văn hoá trong môi trường số';
      currentThemeId = 'chu_de_3';
      currentLessonName = 'Bài 5: Ứng xử trên mạng';
      currentLessonId = 'bai_5';
    } else {
      currentThemeName = 'Chủ đề 1: Máy tính và cộng đồng';
      currentThemeId = 'chu_de_1';
      currentLessonName = 'Bài 1: Thiết bị vào – ra';
      currentLessonId = 'bai_1';
    }
  }

  function flushCurrentQuestion() {
    const trimmedStem = currentQuestionContent.trim();
    if (!trimmedStem) {
      resetQuestionBuffer();
      return;
    }

    if (!hasExplicitStructure) {
      inferThemeFromKeywords(trimmedStem);
    }

    const seqNum = parsedQuestions.length + 1;
    const qId = `pdf_import_${Date.now()}_${seqNum}`;

    let fullQuestionContent = trimmedStem;
    if (currentSubItems.length > 0) {
      fullQuestionContent = `${trimmedStem}\n${currentSubItems.join('\n')}`;
    }

    // Tự động nhận diện tham chiếu "Hình X.Y" trong câu hỏi (ví dụ: "Hình 1.1", "Hình 1.2", "Hình 1.3", "Hình 1.4")
    // nếu tệp PDF chưa nhúng binary ảnh riêng cho câu hỏi đó
    let resolvedImageUrl = currentImageUrl;
    let resolvedImageCaption = currentImageCaption;

    const figRefMatch =
      fullQuestionContent.match(/Hình\s*(\d+\.\d+)/i) ||
      currentImageCaption.match(/Hình\s*(\d+\.\d+)/i);

    if (figRefMatch) {
      const figKey = figRefMatch[1];
      const knownFigure = TEXTBOOK_FIGURE_MAP[figKey];
      if (knownFigure) {
        if (!resolvedImageUrl) {
          resolvedImageUrl = knownFigure.imageUrl;
        }
        if (!resolvedImageCaption) {
          resolvedImageCaption = knownFigure.imageCaption;
        }
      }
    }

    let finalOptions: QuestionOption[] = [];
    let correctOptionId = '';
    let hasClearAnswer = false;

    if (currentOptions.length >= 2) {
      const fourOpts = currentOptions.slice(0, 4);
      finalOptions = fourOpts.map((opt) => ({
        id: opt.id,
        label: opt.label as 'A' | 'B' | 'C' | 'D',
        content: opt.content.trim(),
      }));

      if (currentOptions.length > 4 && finalOptions.length === 4) {
        const extraContent = currentOptions
          .slice(4)
          .map((o) => `${o.label}. ${o.content.trim()}`)
          .join(' ');
        finalOptions[3].content = `${finalOptions[3].content} (${extraContent})`;
      }

      const matchedLetters = rawAnswerText
        ? Array.from(rawAnswerText.matchAll(/\b([A-D])\b/gi)).map((m) =>
            m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D'
          )
        : [];

      const primaryLetter = matchedLetters[0] || null;
      const foundOpt = primaryLetter
        ? finalOptions.find((o) => o.label === primaryLetter)
        : undefined;

      if (foundOpt) {
        correctOptionId = foundOpt.id;
        hasClearAnswer = true;
      } else {
        correctOptionId = finalOptions[0].id;
      }
    } else if (rawAnswerText || currentSubItems.length > 0) {
      finalOptions = buildOptionsForCompoundAnswer(rawAnswerText, seqNum);
      correctOptionId = finalOptions[0].id;
      hasClearAnswer = Boolean(rawAnswerText.trim());
    } else {
      resetQuestionBuffer();
      return;
    }

    const lower = fullQuestionContent.toLowerCase();
    let cognitiveLevel: CognitiveLevel = 'nhan_biet';
    if (
      lower.includes('tại sao') ||
      lower.includes('giải thích') ||
      lower.includes('phân biệt') ||
      lower.includes('quan hệ phụ thuộc') ||
      lower.includes('ưu điểm') ||
      lower.includes('nhược điểm') ||
      lower.includes('không phải') ||
      lower.includes('ghép sai')
    ) {
      cognitiveLevel = 'thong_hieu';
    } else if (
      lower.includes('tính') ||
      lower.includes('công thức') ||
      lower.includes('kết quả là') ||
      lower.includes('giải quyết vấn đề') ||
      lower.includes('sắp xếp') ||
      lower.includes('điền các từ') ||
      lower.includes('phòng tránh')
    ) {
      cognitiveLevel = 'van_dung';
    }

    const explanationParts: string[] = [];
    if (
      rawAnswerText &&
      (!/^[A-D]\.?$/i.test(rawAnswerText.trim()) || currentOptions.length < 2)
    ) {
      explanationParts.push(`Đáp án gốc: ${rawAnswerText.trim()}`);
    }
    if (currentExplanation.trim()) {
      explanationParts.push(currentExplanation.trim());
    }

    const finalExplanation =
      explanationParts.length > 0
        ? explanationParts.join(' | ')
        : `Trích xuất từ ${currentLessonName} (${sourceBook}).`;

    parsedQuestions.push(
      normalizeQuestionStructure({
        id: qId,
        themeId: currentThemeId,
        themeName: currentThemeName,
        lessonId: currentLessonId,
        lessonName: currentLessonName,
        content: currentQuestionCode
          ? `${currentQuestionCode}. ${fullQuestionContent}`
          : fullQuestionContent,
        ...(resolvedImageUrl ? { imageUrl: resolvedImageUrl } : {}),
        ...(resolvedImageCaption ? { imageCaption: resolvedImageCaption } : {}),
        options: finalOptions,
        correctOptionId,
        cognitiveLevel,
        reviewStatus: hasClearAnswer ? 'da_kiem_duyet' : 'chua_kiem_duyet',
        sourcePage: questionStartPage,
        sourceBook,
        explanation: finalExplanation,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );

    resetQuestionBuffer();
  }

  function resetQuestionBuffer() {
    currentQuestionCode = '';
    currentQuestionContent = '';
    currentImageUrl = '';
    currentImageCaption = '';
    currentSubItems = [];
    currentOptions = [];
    rawAnswerText = '';
    currentExplanation = '';
    parserState = 'idle';
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Phát hiện số trang từ PDF separator
    const pageMatch = line.match(/^---\s*Trang\s*(\d+)\s*---$/i);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      continue;
    }

    // 2. Phát hiện token hình ảnh nhúng từ PDF: [[IMAGE:data:image/png;base64,...]]
    const imageTokenMatch = line.match(/^\[\[IMAGE:(.+)\]\]$/);
    if (imageTokenMatch) {
      if (!currentImageUrl) {
        currentImageUrl = imageTokenMatch[1].trim();
      }
      continue;
    }

    // 3. Phát hiện tiêu đề CHỦ ĐỀ (ví dụ: "CHỦ ĐỀ 1. MÁY TÍNH VÀ CỘNG ĐỒNG")
    const themeMatch = line.match(/^CHỦ\s*ĐỀ\s*(\d+)[\.:\s-]+(.+)/i);
    if (themeMatch) {
      flushCurrentQuestion();
      const themeNum = themeMatch[1];
      let rawThemeTitle = themeMatch[2].trim();

      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const isNextLineHeader =
          /^(?:Bài\s*\d+|Câu\s*\d+|---\s*Trang|\[\[IMAGE:|[A-E][\.:\)]|[•\-\*])/i.test(nextLine);
        const isAllCapsShort =
          nextLine.length <= 30 &&
          nextLine === nextLine.toUpperCase() &&
          /[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(
            nextLine
          );
        if (!isNextLineHeader && isAllCapsShort) {
          rawThemeTitle += ' ' + nextLine.trim();
          i += 1;
        }
      }

      const normalized = normalizeThemeHeader(themeNum, rawThemeTitle);
      currentThemeId = normalized.themeId;
      currentThemeName = normalized.themeName;
      hasExplicitStructure = true;
      continue;
    }

    // 4. Phát hiện tiêu đề Bài học (ví dụ: "Bài 1. Thiết bị vào – ra")
    const lessonMatch = line.match(/^Bài\s*(\d+)[\.:\s-]+(.+)/i);
    if (lessonMatch) {
      flushCurrentQuestion();
      const lessonNum = lessonMatch[1];
      const lessonTitle = lessonMatch[2].replace(/\.$/, '').trim();
      currentLessonId = `bai_${lessonNum}`;
      currentLessonName = `Bài ${lessonNum}: ${lessonTitle}`;
      hasExplicitStructure = true;
      continue;
    }

    // 5. Phát hiện dòng Đáp án (ví dụ: "• Đáp án: A", "Đáp án: B, C, D.")
    const answerMatch = line.match(/^[•\-\*]?\s*(?:Đáp án|ĐA|Key|Đáp án đúng)\s*[:\-]\s*(.*)/i);
    if (answerMatch) {
      parserState = 'answer';
      rawAnswerText = answerMatch[1].trim();
      continue;
    }

    // 6. Phát hiện dòng Hướng dẫn giải / Giải thích
    const explanationMatch = line.match(
      /^[•\-\*]?\s*(?:Hướng dẫn giải|Giải thích|Lời giải)\s*[:\-]\s*(.*)/i
    );
    if (explanationMatch) {
      parserState = 'explanation';
      currentExplanation = explanationMatch[1].trim();
      continue;
    }

    // 7. Phát hiện bắt đầu câu hỏi: "Câu 1.1.", "Câu 1:", "Câu 2.", hoặc "1."
    const cauMatch = line.match(/^Câu\s*(\d+(?:\.\d+)?)[\.:\)\s]+(.*)/i);
    const numQuestionMatch =
      !cauMatch &&
      (parserState === 'idle' || parserState === 'answer' || parserState === 'explanation')
        ? line.match(/^(\d+)[\.:\s]+(.*)/)
        : null;

    if (cauMatch || numQuestionMatch) {
      flushCurrentQuestion();
      questionStartPage = currentPage;
      if (cauMatch) {
        currentQuestionCode = `Câu ${cauMatch[1]}`;
        currentQuestionContent = cauMatch[2].trim();
      } else if (numQuestionMatch) {
        currentQuestionCode = `Câu ${numQuestionMatch[1]}`;
        currentQuestionContent = numQuestionMatch[2].trim();
      }
      parserState = 'stem';
      continue;
    }

    if (!currentQuestionContent && parserState === 'idle') {
      continue;
    }

    // 8. Phát hiện dòng chú thích hình ảnh đứng riêng dưới ảnh (ví dụ: "Hình 1.1. Máy quét", "Hình 1.2. Tai nghe")
    const figureCaptionMatch = line.match(/^Hình\s*(\d+(?:\.\d+)?)[\.:\s-]+(.+)$/i);
    if (figureCaptionMatch && (parserState === 'stem' || parserState === 'subitem')) {
      currentImageCaption = `Hình ${figureCaptionMatch[1]}. ${figureCaptionMatch[2].trim()}`;
      continue;
    }

    // 9. Phát hiện phương án lựa chọn in hoa A., B., C., D., E.
    const optionMatch = line.match(/^([A-E])[\.:\)]\s*(.*)/);
    if (optionMatch && parserState !== 'explanation' && parserState !== 'answer') {
      const label = optionMatch[1] as 'A' | 'B' | 'C' | 'D' | 'E';
      const content = optionMatch[2].trim();
      currentOptions.push({
        id: `opt_${Date.now()}_${parsedQuestions.length + 1}_${label.toLowerCase()}_${currentOptions.length}`,
        label,
        content,
      });
      parserState = 'option';
      continue;
    }

    // 10. Phát hiện các mệnh đề con a), b), c)... hoặc 1), 2), 3)... trong câu hỏi ghép nối / Đúng-Sai
    const subItemMatch = line.match(/^([a-k]\)|[1-9]\))\s*(.*)/);
    if (subItemMatch && (parserState === 'stem' || parserState === 'subitem')) {
      const cleanedSub = line.replace(/\s+(Đúng|Sai|Nên|Không nên)$/i, '').trim();
      currentSubItems.push(cleanedSub);
      parserState = 'subitem';
      continue;
    }

    if (
      (parserState === 'stem' || parserState === 'subitem') &&
      /^(?:Phát biểu\s+Đáp án|Nội dung\s+Đáp án|Phần mở rộng\s+Loại tệp|Đúng|Sai|Nên|Không nên)$/i.test(
        line
      )
    ) {
      continue;
    }

    // 11. Dòng nối tiếp (continuation line) theo trạng thái hiện tại
    if (parserState === 'explanation') {
      currentExplanation = currentExplanation ? `${currentExplanation} ${line}` : line;
    } else if (parserState === 'answer') {
      rawAnswerText = rawAnswerText ? `${rawAnswerText} ${line}` : line;
    } else if (parserState === 'option' && currentOptions.length > 0) {
      currentOptions[currentOptions.length - 1].content += ' ' + line;
    } else if (parserState === 'subitem' && currentSubItems.length > 0) {
      const cleanedContinuation = line.replace(/\s+(Đúng|Sai|Nên|Không nên)$/i, '').trim();
      if (cleanedContinuation) {
        currentSubItems[currentSubItems.length - 1] += ' ' + cleanedContinuation;
      }
    } else if (parserState === 'stem') {
      currentQuestionContent += ' ' + line;
    }
  }

  flushCurrentQuestion();
  return parsedQuestions;
}

export const ATTACHED_PDF_ASSET_URL = '/assets/aistudio/Cau_hoi_chu_de_1-3_49e93ef8.pdf';
export const ATTACHED_PDF_FILE_NAME = 'Cau_hoi_chu_de_1-3.pdf';

export const SAMPLE_PDF_TEXT_TIN7 = `CHỦ ĐỀ 1. MÁY TÍNH VÀ CỘNG ĐỒNG
Bài 1. Thiết bị vào – ra
Câu 1.1. Máy quét ảnh trong Hình 1.1 là loại thiết bị nào?
Hình 1.1. Máy quét
A. Thiết bị vào.
B. Thiết bị ra.
C. Thiết bị vừa vào vừa ra.
D. Thiết bị lưu trữ.
• Đáp án: A
• Hướng dẫn giải: Máy quét là thiết bị đưa dữ liệu dạng ảnh vào máy tính.

Câu 1.2. Tai nghe trong Hình 1.2 là loại thiết bị nào?
Hình 1.2. Tai nghe
A. Thiết bị vào.
B. Thiết bị ra.
C. Thiết bị vừa vào vừa ra.
D. Thiết bị lưu trữ.
• Đáp án: B
• Hướng dẫn giải: Tai nghe là thiết bị ra, làm việc với dữ liệu dạng âm thanh.

CHỦ ĐỀ 2. TỔ CHỨC LƯU TRỮ, TÌM KIẾM VÀ TRAO ĐỔI THÔNG TIN
Bài 4. Mạng xã hội và một số kênh trao đổi thông tin trên Internet
Câu 4.2. Chọn phương án ghép sai. Ưu điểm của mạng xã hội là:
A. Giúp người sử dụng kết nối với người thân, bạn bè.
B. Hỗ trợ người sử dụng giảng dạy và học tập.
C. Tăng khả năng giao tiếp trực tiếp.
D. Là nguồn cung cấp thông tin và cập nhật thông tin nhanh chóng, hiệu quả.
• Đáp án: C
• Hướng dẫn giải: Mạng xã hội không giúp người sử dụng tăng khả năng giao tiếp trực tiếp.

CHỦ ĐỀ 3. ĐẠO ĐỨC, PHÁP LUẬT VÀ VĂN HOÁ TRONG MÔI TRƯỜNG SỐ
Bài 5. Ứng xử trên mạng
Câu 5.2. Mục tiêu của giao tiếp qua mạng là gì?
A. Giúp người khác hiểu em một cách rõ ràng.
B. Hiểu người khác một cách rõ ràng.
C. Giữ mối quan hệ tốt để có thể tiếp tục giao tiếp.
D. Tất cả những điều trên.
• Đáp án: D`;
