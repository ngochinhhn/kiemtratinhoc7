import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Exam, ExamResultSummary, Question, Student, StudentExamPaper, StudentExamSession } from '../types';

/**
 * Tải tệp Excel mẫu danh sách học sinh
 */
export async function downloadSampleStudentExcel(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('DanhSachHocSinh');

  // Tiêu đề bảng
  worksheet.mergeCells('A1:D1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'DANH SÁCH HỌC SINH MẪU - SMART TEST 7';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' }, // Blue 700
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 30;

  // Dòng tiêu đề cột
  worksheet.getRow(2).values = ['STT', 'Mã học sinh', 'Họ và tên học sinh', 'Lớp'];
  worksheet.getRow(2).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getRow(2).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' }, // Blue 100
  };
  worksheet.getRow(2).height = 24;

  // Dữ liệu mẫu
  const sampleRows = [
    [1, 'HS7A01', 'Nguyễn Văn An', '7A'],
    [2, 'HS7A02', 'Trần Thị Minh Anh', '7A'],
    [3, 'HS7A03', 'Lê Hoàng Phúc', '7A'],
    [4, 'HS7A04', 'Phạm Đức Duy', '7A'],
    [5, 'HS7A05', 'Hoàng Thùy Dương', '7A'],
    [6, 'HS7B01', 'Đỗ Mai Hương', '7B'],
    [7, 'HS7B02', 'Vũ Quốc Bảo', '7B'],
  ];

  sampleRows.forEach((row) => worksheet.addRow(row));

  // Định dạng viền và căn chỉnh
  worksheet.columns = [
    { width: 8 },
    { width: 16 },
    { width: 30 },
    { width: 12 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, 'Mau_Danh_Sach_Hoc_Sinh_Tin7.xlsx');
}

/**
 * Tải tệp Excel mẫu danh sách lớp học để khởi tạo lớp trống hàng loạt
 */
export async function downloadSampleClassListExcel(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('DanhSachLop');

  worksheet.mergeCells('A1:D1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'DANH SÁCH LỚP HỌC MẪU - SMART TEST 7';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 30;

  worksheet.getRow(2).values = ['STT', 'Tên lớp', 'Khối', 'Giáo viên chủ nhiệm / Ghi chú'];
  worksheet.getRow(2).font = { name: 'Arial', size: 11, bold: true };
  worksheet.getRow(2).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' },
  };
  worksheet.getRow(2).height = 24;

  const sampleRows = [
    [1, '7A1', 'Khối 7', 'Phòng máy 01'],
    [2, '7A2', 'Khối 7', 'Phòng máy 01'],
    [3, '7A3', 'Khối 7', 'Phòng máy 02'],
    [4, '7A4', 'Khối 7', 'Phòng máy 02'],
    [5, '7A5', 'Khối 7', 'Phòng máy 01'],
    [6, '7B1', 'Khối 7', ''],
    [7, '7B2', 'Khối 7', ''],
  ];

  sampleRows.forEach((row) => worksheet.addRow(row));

  worksheet.columns = [
    { width: 8 },
    { width: 16 },
    { width: 14 },
    { width: 30 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, 'Mau_Danh_Sach_Lop_Tin7.xlsx');
}

/**
 * Chuyển số chỉ mục cột (1-based) sang ký tự cột Excel (A, B, ..., Z, AA, AB...)
 */
function indexToExcelColLetters(colIndex: number): string {
  let num = colIndex;
  let letters = '';
  while (num > 0) {
    const rem = (num - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    num = Math.floor((num - 1) / 26);
  }
  return letters || 'A';
}

/**
 * Xuất danh sách lớp học sinh kèm điểm số các kỳ thi và tài khoản đăng nhập ra tệp Excel (.xlsx)
 */
export async function exportStudentAccountsExcel(
  students: Student[],
  schoolName: string,
  exams: Exam[] = [],
  sessions: Record<string, StudentExamSession> = {},
  classFilter?: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const targetStudents =
    classFilter && classFilter !== 'all'
      ? students.filter((s) => s.className === classFilter)
      : students;

  const targetClasses = new Set(targetStudents.map((s) => s.className));

  // Xác định các kỳ thi liên quan đến danh sách lớp đang xuất (hoặc có điểm của học sinh)
  const relevantExams = exams.filter((ex) => {
    const assignedToClass = ex.classes.some((c) => targetClasses.has(c));
    const hasScore = targetStudents.some(
      (st) =>
        st.examScores?.[ex.id]?.score !== undefined ||
        sessions[`${st.id}_${ex.id}`]?.score !== undefined
    );
    return assignedToClass || hasScore;
  });

  const sheetName =
    classFilter && classFilter !== 'all' ? `DanhSach_Lop_${classFilter}` : 'DanhSachLop_DiemThi';
  const worksheet = workbook.addWorksheet(sheetName);

  const baseHeaders = [
    'STT',
    'Mã học sinh',
    'Họ và tên học sinh',
    'Lớp',
    'Mã đăng nhập',
    'Mật khẩu mặc định',
    'Điểm thi mới nhất',
    'Kỳ thi gần nhất',
  ];
  const examHeaders = relevantExams.map((ex) => `Điểm: ${ex.title}`);
  const allHeaders = [...baseHeaders, ...examHeaders];
  const lastColLetter = indexToExcelColLetters(allHeaders.length);

  worksheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = worksheet.getCell('A1');
  const classTitlePart =
    classFilter && classFilter !== 'all' ? `LỚP ${classFilter.toUpperCase()}` : 'TOÀN TRƯỜNG';
  titleCell.value = `${schoolName.toUpperCase()} - DANH SÁCH HỌC SINH & BẢNG ĐIỂM MÔN TIN HỌC 7 (${classTitlePart})`;
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 32;

  worksheet.getRow(2).values = allHeaders;
  worksheet.getRow(2).font = { name: 'Arial', size: 10, bold: true };
  worksheet.getRow(2).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  worksheet.getRow(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFF6FF' },
  };
  worksheet.getRow(2).height = 28;

  targetStudents.forEach((student, idx) => {
    // Tính điểm mới nhất từ student.latestScore hoặc từ sessions
    let latestScoreVal: number | string =
      student.latestScore !== undefined ? student.latestScore : '';
    let latestExamTitleVal = student.latestExamTitle || '';

    const perExamScores = relevantExams.map((ex) => {
      const savedScore = student.examScores?.[ex.id]?.score;
      const sessionScore = sessions[`${student.id}_${ex.id}`]?.score;
      const finalScore = savedScore !== undefined ? savedScore : sessionScore;
      if (finalScore !== undefined && latestScoreVal === '') {
        latestScoreVal = finalScore;
        latestExamTitleVal = ex.title;
      }
      return finalScore !== undefined ? finalScore : '';
    });

    worksheet.addRow([
      idx + 1,
      student.studentIdCode || `HS7${String(idx + 1).padStart(3, '0')}`,
      student.fullName,
      student.className,
      student.loginCode,
      '123456',
      latestScoreVal !== '' ? latestScoreVal : 'Chưa thi',
      latestExamTitleVal || '-',
      ...perExamScores,
    ]);
  });

  worksheet.columns = [
    { width: 7 },
    { width: 15 },
    { width: 28 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 32 },
    ...relevantExams.map(() => ({ width: 22 })),
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const fileSuffix =
    classFilter && classFilter !== 'all' ? `Lop_${classFilter}` : 'Toan_Truong';
  triggerDownload(buffer, `Danh_Sach_Lop_Va_Diem_Tin7_${fileSuffix}.xlsx`);
}

/**
 * Xuất báo cáo kết quả thi hoàn chỉnh 3 Sheet
 */
export async function exportExamResultsExcel(
  examTitle: string,
  summary: ExamResultSummary,
  sessions: StudentExamSession[],
  students: Student[],
  papers: Record<string, StudentExamPaper>,
  questions: Question[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  // SHEET 1: BẢNG TỔNG HỢP KẾT QUẢ
  const sheet1 = workbook.addWorksheet('BangTongHopDiem');
  sheet1.mergeCells('A1:J1');
  const s1Title = sheet1.getCell('A1');
  s1Title.value = `BÁO CÁO KẾT QUẢ KỲ THI: ${examTitle.toUpperCase()}`;
  s1Title.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  s1Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  s1Title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getRow(1).height = 32;

  sheet1.getRow(2).values = [
    'STT',
    'Mã học sinh',
    'Họ và tên',
    'Lớp',
    'Mã đề',
    'Số câu đúng',
    'Số câu sai',
    'Số câu bỏ trống',
    'Điểm số (thang 10)',
    'Thời gian nộp',
  ];
  sheet1.getRow(2).font = { name: 'Arial', size: 10, bold: true };
  sheet1.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  sheet1.getRow(2).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getRow(2).height = 24;

  sessions.forEach((sess, idx) => {
    const student = studentMap.get(sess.studentId);
    sheet1.addRow([
      idx + 1,
      student?.studentIdCode || '',
      student?.fullName || 'Học sinh',
      student?.className || '',
      sess.paperCode,
      sess.correctCount ?? 0,
      sess.wrongCount ?? 0,
      sess.unansweredCount ?? 0,
      sess.score !== undefined ? sess.score : 'Chưa nộp',
      sess.submittedAt ? new Date(sess.submittedAt).toLocaleTimeString('vi-VN') : 'Đang làm',
    ]);
  });

  sheet1.columns = [
    { width: 8 },
    { width: 14 },
    { width: 26 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
  ];

  // SHEET 2: BẢNG CHI TIẾT CÂU TRẢ LỜI
  const sheet2 = workbook.addWorksheet('ChiTietCauTraLoi');
  sheet2.mergeCells('A1:G1');
  const s2Title = sheet2.getCell('A1');
  s2Title.value = `CHI TIẾT PHƯƠNG ÁN CHỌN CỦA TỪNG HỌC SINH - ${examTitle}`;
  s2Title.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  s2Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  s2Title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet2.getRow(1).height = 30;

  sheet2.getRow(2).values = [
    'Học sinh',
    'Lớp',
    'Mã đề',
    'Câu hỏi',
    'Phương án đã chọn',
    'Đáp án đúng',
    'Kết quả',
  ];
  sheet2.getRow(2).font = { name: 'Arial', size: 10, bold: true };
  sheet2.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  sheet2.getRow(2).alignment = { horizontal: 'center', vertical: 'middle' };

  sessions.forEach((sess) => {
    const student = studentMap.get(sess.studentId);
    const paper = papers[`${sess.studentId}_${sess.examId}`];
    if (paper) {
      paper.questionOrder.forEach((qId, qIdx) => {
        const q = questionMap.get(qId);
        const ans = sess.answers[qId];
        const selectedOptId = ans?.selectedOptionId;
        const isCorrect = selectedOptId === q?.correctOptionId;

        const optMap = new Map(q?.options.map((o) => [o.id, o]));
        const selectedOpt = selectedOptId ? optMap.get(selectedOptId)?.content : 'Bỏ trống';
        const correctOpt = q ? optMap.get(q.correctOptionId)?.content : '';

        sheet2.addRow([
          student?.fullName || '',
          student?.className || '',
          sess.paperCode,
          `Câu ${qIdx + 1}: ${q?.content.substring(0, 40)}...`,
          selectedOpt,
          correctOpt,
          !selectedOptId ? 'Chưa trả lời' : isCorrect ? 'ĐÚNG' : 'SAI',
        ]);
      });
    }
  });

  sheet2.columns = [
    { width: 24 },
    { width: 10 },
    { width: 12 },
    { width: 35 },
    { width: 26 },
    { width: 26 },
    { width: 14 },
  ];

  // SHEET 3: THỐNG KÊ KỲ THI
  const sheet3 = workbook.addWorksheet('ThongKePhoDiem');
  sheet3.mergeCells('A1:D1');
  const s3Title = sheet3.getCell('A1');
  s3Title.value = `BẢNG THỐNG KÊ PHỔ ĐIỂM VÀ TỶ LỆ CÂU ĐÚNG`;
  s3Title.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  s3Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  s3Title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet3.getRow(1).height = 30;

  sheet3.addRow(['Chỉ số tổng hợp', 'Giá trị']);
  sheet3.addRow(['Tổng số học sinh dự thi', summary.totalStudents]);
  sheet3.addRow(['Số học sinh đã nộp bài', summary.submittedCount]);
  sheet3.addRow(['Điểm trung bình toàn lớp', summary.averageScore]);
  sheet3.addRow(['Điểm cao nhất', summary.highestScore]);
  sheet3.addRow(['Điểm thấp nhất', summary.lowestScore]);
  sheet3.addRow(['Học lực Giỏi (8.0 - 10.0)', `${summary.excellentCount} học sinh`]);
  sheet3.addRow(['Học lực Khá (6.5 - 7.9)', `${summary.goodCount} học sinh`]);
  sheet3.addRow(['Học lực Đạt (5.0 - 6.4)', `${summary.averageCount} học sinh`]);
  sheet3.addRow(['Học lực Chưa đạt (< 5.0)', `${summary.weakCount} học sinh`]);

  sheet3.addRow([]);
  sheet3.addRow(['STT Câu', 'Nội dung câu hỏi', 'Tỷ lệ trả lời đúng (%)', 'Đánh giá độ khó']);
  summary.questionStats.forEach((qs) => {
    let diff = 'Vừa sức';
    if (qs.correctPercent < 40) diff = 'Khó / Hay sai';
    if (qs.correctPercent > 80) diff = 'Dễ / Nắm vững';
    sheet3.addRow([
      `Câu ${qs.questionIndex}`,
      qs.questionContent,
      `${qs.correctPercent}%`,
      diff,
    ]);
  });

  sheet3.columns = [{ width: 26 }, { width: 45 }, { width: 22 }, { width: 18 }];

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, `Ket_Qua_${examTitle.replace(/\s+/g, '_')}.xlsx`);
}

function triggerDownload(buffer: ExcelJS.Buffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

export interface ParsedStudentFromExcel {
  studentIdCode: string;
  fullName: string;
  className: string;
}

/**
 * Chuẩn hóa tên lớp (Ví dụ: "Lớp 7A1" -> "7A1", " 7b " -> "7B")
 */
export function normalizeClassName(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim();
  // Loại bỏ tiền tố "Lớp ", "Lop ", "Class " nếu có
  cleaned = cleaned.replace(/^(lớp|lop|class)\s*:?\s*/i, '');
  return cleaned.trim().toUpperCase();
}

/**
 * Giải mã thực thể XML/HTML cơ bản
 */
function decodeXmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Chuyển ký hiệu cột Excel (A, B, C, ..., AA) sang chỉ số cột 1-based
 */
function excelColLettersToIndex(letters: string): number {
  let col = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    col = col * 26 + (upper.charCodeAt(i) - 64);
  }
  return col;
}

/**
 * Trích xuất trực tiếp bảng dữ liệu từ XML bên trong tệp .xlsx (dự phòng khi ExcelJS gặp lỗi định dạng)
 */
async function parseRowsDirectlyFromXlsxZip(zip: JSZip): Promise<string[][]> {
  const sharedStrings: string[] = [];
  const ssFile = zip.file('xl/sharedStrings.xml') || zip.file('/xl/sharedStrings.xml');
  if (ssFile) {
    const ssXml = await ssFile.async('string');
    const siMatches = ssXml.match(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/gi) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi) || [];
      const text = tMatches
        .map((tTag) => decodeXmlEntities(tTag.replace(/<\/?(?:\w+:)?t\b[^>]*>/gi, '')))
        .join('');
      sharedStrings.push(text);
    }
  }

  let sheetFile = zip.file('xl/worksheets/sheet1.xml') || zip.file('/xl/worksheets/sheet1.xml');
  if (!sheetFile) {
    const allSheetKeys = Object.keys(zip.files)
      .filter((name) => /xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort();
    if (allSheetKeys.length > 0) {
      sheetFile = zip.file(allSheetKeys[0]);
    }
  }
  if (!sheetFile) {
    return [];
  }

  const sheetXml = await sheetFile.async('string');
  const rowMatches = sheetXml.match(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/gi) || [];
  const rows: string[][] = [];

  for (const rowXml of rowMatches) {
    const cellMatches =
      rowXml.match(/<(?:\w+:)?c\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?c>)/gi) || [];
    if (cellMatches.length === 0) continue;

    const rowCells: string[] = [];
    let nextCol = 1;

    for (const cellXml of cellMatches) {
      const openTagMatch = cellXml.match(/^<(?:\w+:)?c\b([^>]*)/i);
      const attrs = openTagMatch ? openTagMatch[1] : '';
      const rMatch = attrs.match(/\br=["']([A-Za-z]+)\d+["']/i);
      const tMatch = attrs.match(/\bt=["']([^"']+)["']/i);
      const colIndex = rMatch ? excelColLettersToIndex(rMatch[1]) : nextCol;
      nextCol = colIndex + 1;
      const cellType = tMatch ? tMatch[1] : '';

      let cellValue = '';
      if (cellType === 'inlineStr') {
        const tMatches = cellXml.match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi) || [];
        cellValue = tMatches
          .map((tTag) => decodeXmlEntities(tTag.replace(/<\/?(?:\w+:)?t\b[^>]*>/gi, '')))
          .join('');
      } else {
        const vMatch = cellXml.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/i);
        const rawV = vMatch ? decodeXmlEntities(vMatch[1].trim()) : '';
        if (cellType === 's') {
          const ssIdx = parseInt(rawV, 10);
          cellValue = !isNaN(ssIdx) && sharedStrings[ssIdx] !== undefined ? sharedStrings[ssIdx] : rawV;
        } else {
          cellValue = rawV;
        }
      }

      while (rowCells.length < colIndex) {
        rowCells.push('');
      }
      rowCells[colIndex - 1] = cellValue.trim();
    }

    if (rowCells.some((c) => c.length > 0)) {
      rows.push(rowCells);
    }
  }

  return rows;
}

/**
 * Trích xuất các hàng dữ liệu từ tệp HTML Table (.xls xuất từ VNEDU/SMAS) hoặc CSV/TSV
 */
function parseRowsFromTextOrHtmlTable(text: string): string[][] {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];

  // 1. Định dạng bảng HTML (.xls từ VNEDU / SMAS) hoặc XML Spreadsheet 2003
  if (/<tr\b/i.test(trimmed) || /<row\b/i.test(trimmed)) {
    const rows: string[][] = [];
    const trMatches =
      trimmed.match(/<(?:\w+:)?(?:tr|row)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:tr|row)>/gi) || [];
    for (const tr of trMatches) {
      const tdMatches =
        tr.match(/<(?:\w+:)?(?:td|th|cell|data)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:td|th|cell|data)>/gi) ||
        [];
      if (tdMatches.length === 0) continue;
      const cells = tdMatches.map((td) =>
        decodeXmlEntities(td.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      );
      if (cells.some((c) => c.length > 0)) {
        rows.push(cells);
      }
    }
    if (rows.length > 0) return rows;
  }

  // 2. Định dạng CSV / TSV
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: string[][] = [];
  for (const line of lines) {
    const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
    const cells = line.split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim());
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * Chuyển đổi Worksheet của ExcelJS sang mảng 2 chiều các chuỗi (1-based col chuyển về 0-based)
 */
function extractRowsFromWorksheet(worksheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  for (let r = 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const maxCol = Math.max(row.cellCount, worksheet.columnCount, 6);
    const cells: string[] = [];
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      let val = '';
      if (cell.text) {
        val = String(cell.text);
      } else if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === 'object' && 'richText' in cell.value && Array.isArray(cell.value.richText)) {
          val = cell.value.richText.map((rt) => rt.text || '').join('');
        } else if (typeof cell.value === 'object' && 'result' in cell.value) {
          val = String(cell.value.result ?? '');
        } else {
          val = String(cell.value);
        }
      }
      cells.push(val.trim());
    }
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * Trích xuất hàng dữ liệu an toàn từ ArrayBuffer (.xlsx, .xls, HTML-table .xls, CSV)
 * Loại bỏ hoàn toàn lỗi `Cannot read properties of undefined (reading 'company')` của ExcelJS khi gặp docProps/app.xml khác chuẩn
 */
export async function extractRowsFromExcelBuffer(arrayBuffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(arrayBuffer);
  const isZipArchive =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);

  if (isZipArchive) {
    // Mở gói ZIP và dọn sạch docProps/app.xml + docProps/core.xml trước khi đưa vào ExcelJS
    let zip: JSZip | null = null;
    try {
      zip = await JSZip.loadAsync(arrayBuffer);
      // Loại bỏ docProps/app.xml và docProps/core.xml để ngăn lỗi AppXform / CoreXform (company undefined)
      zip.remove('docProps/app.xml');
      zip.remove('/docProps/app.xml');
      zip.remove('docProps/core.xml');
      zip.remove('/docProps/core.xml');

      const sanitizedBuffer = await zip.generateAsync({ type: 'arraybuffer' });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(sanitizedBuffer);
      const worksheet = workbook.worksheets[0];
      if (worksheet) {
        const wsRows = extractRowsFromWorksheet(worksheet);
        if (wsRows.length > 0) {
          return wsRows;
        }
      }
    } catch (_excelJsErr) {
      // Nếu ExcelJS vẫn gặp lỗi (ví dụ styles.xml hoặc drawing khác chuẩn), đọc trực tiếp từ XML trong ZIP
    }

    if (zip) {
      const xmlRows = await parseRowsDirectlyFromXlsxZip(zip);
      if (xmlRows.length > 0) {
        return xmlRows;
      }
    }
  }

  // Trường hợp tệp .xls dạng bảng HTML (VNEDU / SMAS), XML Spreadsheet 2003 hoặc CSV/TSV
  try {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(arrayBuffer);
    const textRows = parseRowsFromTextOrHtmlTable(text);
    if (textRows.length > 0) {
      return textRows;
    }
  } catch (_textErr) {
    // Bỏ qua lỗi giải mã văn bản
  }

  throw new Error(
    'Không thể đọc dữ liệu từ tệp này. Vui lòng sử dụng tệp Excel chuẩn (.xlsx) hoặc tải tệp mẫu của hệ thống.'
  );
}

/**
 * Đọc và phân tích cú pháp tệp Excel danh sách học sinh (.xlsx / .xls)
 * Tự động nhận dạng các cột Họ và tên, Mã học sinh, Lớp
 * Nếu có overrideClass, toàn bộ học sinh được nhập sẽ được gán trực tiếp vào lớp đó
 */
export async function parseStudentsFromExcelBuffer(
  arrayBuffer: ArrayBuffer,
  defaultClass: string = '7A',
  overrideClass?: string | null
): Promise<{
  students: ParsedStudentFromExcel[];
  detectedClassNames: string[];
  errors: string[];
  totalRows: number;
}> {
  const rows = await extractRowsFromExcelBuffer(arrayBuffer);
  if (rows.length === 0) {
    throw new Error('Tệp Excel không có dữ liệu học sinh nào!');
  }

  let headerRowIndex = -1;
  let nameCol = -1; // 0-based index
  let lastNameCol = -1; // Cột "Tên" riêng nếu bảng tách cột "Họ đệm" và "Tên"
  let codeCol = -1;
  let classCol = -1;

  // Quét 12 dòng đầu để tìm dòng tiêu đề
  for (let r = 0; r < Math.min(12, rows.length); r++) {
    const row = rows[r];
    let foundName = false;
    row.forEach((cellVal, colIdx) => {
      const val = String(cellVal || '').trim().toLowerCase();
      if (/họ.*tên|họ\s*và\s*tên|tên\s*học\s*sinh|họ\s*đệm/i.test(val)) {
        if (nameCol === -1) {
          nameCol = colIdx;
          foundName = true;
        }
      } else if (/^tên$|^tên\s*hs$/i.test(val) && nameCol !== -1 && colIdx === nameCol + 1) {
        lastNameCol = colIdx;
      } else if (/mã\s*hs|mã\s*học\s*sinh|mã\s*số|mã\s*định\s*danh/i.test(val)) {
        codeCol = colIdx;
      } else if (/^lớp$|tên\s*lớp|khối\s*lớp/i.test(val)) {
        classCol = colIdx;
      }
    });

    if (foundName) {
      headerRowIndex = r;
      break;
    }
  }

  // Nếu không thấy hàng tiêu đề rõ ràng, tự động suy đoán vị trí cột phổ biến
  if (headerRowIndex === -1) {
    headerRowIndex = 0;
    const sampleRow = rows[Math.min(1, rows.length - 1)] || [];
    if (sampleRow.length >= 3) {
      nameCol = 2;
      codeCol = 1;
      classCol = 3;
    } else if (sampleRow.length === 2) {
      nameCol = 1;
      codeCol = 0;
      classCol = -1;
    } else {
      nameCol = 0;
      codeCol = -1;
      classCol = -1;
    }
  } else {
    if (codeCol === -1 && nameCol >= 2) codeCol = nameCol - 1;
    if (classCol === -1) {
      const afterName = lastNameCol !== -1 ? lastNameCol + 1 : nameCol + 1;
      classCol = afterName;
    }
  }

  const students: ParsedStudentFromExcel[] = [];
  const errors: string[] = [];
  const detectedClassesSet = new Set<string>();

  const targetOverride = overrideClass ? normalizeClassName(overrideClass) : null;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const firstPart = String(row[nameCol] || '').trim();
    const secondPart = lastNameCol !== -1 ? String(row[lastNameCol] || '').trim() : '';
    const cleanName = [firstPart, secondPart].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    if (!cleanName || /^họ\s*(và)?\s*tên/i.test(cleanName)) {
      continue;
    }

    // Bỏ qua dòng ghi chú, tiêu đề phụ hoặc tổng kết
    if (
      cleanName.length < 2 ||
      /^(tổng\s*số|giáo\s*viên|danh\s*sách|stt)$/i.test(cleanName) ||
      cleanName.toLowerCase().startsWith('tổng số') ||
      cleanName.toLowerCase().startsWith('giáo viên')
    ) {
      continue;
    }

    const rawCode = codeCol >= 0 && codeCol < row.length ? String(row[codeCol] || '').trim() : '';
    const cleanCode = /^\d+$/.test(rawCode) && rawCode.length <= 3 ? '' : rawCode;

    const rawClass =
      classCol >= 0 && classCol < row.length ? String(row[classCol] || '').trim() : '';
    const parsedRowClass = normalizeClassName(rawClass);
    const validRowClass =
      parsedRowClass && parsedRowClass.length <= 10 && /\d/.test(parsedRowClass)
        ? parsedRowClass
        : '';

    const cleanClass =
      targetOverride || validRowClass || normalizeClassName(defaultClass) || '7A';

    if (cleanClass) {
      detectedClassesSet.add(cleanClass);
    }

    students.push({
      fullName: cleanName,
      studentIdCode:
        cleanCode || `HS${cleanClass}${String(students.length + 1).padStart(2, '0')}`,
      className: cleanClass,
    });
  }

  return {
    students,
    detectedClassNames: Array.from(detectedClassesSet),
    errors,
    totalRows: rows.length,
  };
}

/**
 * Đọc và phân tích cú pháp tệp Excel danh sách các lớp học (.xlsx / .xls)
 * Trích xuất danh sách tên các lớp trống để khởi tạo hàng loạt
 */
export async function parseClassesFromExcelBuffer(
  arrayBuffer: ArrayBuffer
): Promise<{
  classes: string[];
  totalRows: number;
  errors: string[];
}> {
  const rows = await extractRowsFromExcelBuffer(arrayBuffer);
  if (rows.length === 0) {
    throw new Error('Tệp Excel không có trang tính hoặc dữ liệu nào!');
  }

  let classCol = -1; // 0-based
  let headerRowIndex = -1;

  for (let r = 0; r < Math.min(12, rows.length); r++) {
    const row = rows[r];
    row.forEach((cellVal, colIdx) => {
      const val = String(cellVal || '').trim().toLowerCase();
      if (/tên\s*lớp|mã\s*lớp|danh\s*sách\s*lớp|^lớp$|^class$/i.test(val)) {
        classCol = colIdx;
        headerRowIndex = r;
      }
    });
    if (classCol >= 0) break;
  }

  if (classCol === -1) {
    const sampleRow = rows[Math.min(1, rows.length - 1)] || [];
    if (sampleRow.length >= 2) {
      classCol = 1;
      headerRowIndex = 0;
    } else {
      classCol = 0;
      headerRowIndex = 0;
    }
  }

  const detectedClasses = new Set<string>();
  const errors: string[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const rawVal = String(row[classCol] || '').trim();
    const norm = normalizeClassName(rawVal);
    if (!norm) continue;

    if (/^(stt|tên lớp|khối|ghi chú|giáo viên|tổng cộng|số thứ tự|danh sách)/i.test(norm)) {
      continue;
    }
    if (norm.length > 20) continue;

    detectedClasses.add(norm);
  }

  return {
    classes: Array.from(detectedClasses).sort(),
    totalRows: rows.length,
    errors,
  };
}

