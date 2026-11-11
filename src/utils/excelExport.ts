import {
  Exam,
  ExamResultSummary,
  Question,
  Student,
  StudentExamPaper,
  StudentExamSession,
} from '../types';

export interface XlsxSheetSpec {
  name: string;
  title?: string;
  headers?: (string | number)[];
  rows: (string | number | null | undefined)[][];
  columnWidths?: number[];
}

export interface ParsedStudentFromExcel {
  studentIdCode: string;
  fullName: string;
  className: string;
}

// Bảng tra CRC-32 chuẩn IEEE 802.3 cho định dạng ZIP (.xlsx)
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRawBytes(input: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    return input;
  }
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  await writer.write(new Uint8Array(input));
  await writer.close();
  const res = new Response(cs.readable);
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

async function inflateRawBytes(input: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const writePromise = writer
    .write(new Uint8Array(input))
    .then(() => writer.close())
    .catch(() => {});
  const res = new Response(ds.readable);
  const ab = await res.arrayBuffer();
  await writePromise;
  return new Uint8Array(ab);
}

/**
 * Đóng gói danh sách tệp XML thành bộ đệm ZIP (.xlsx) chuẩn OpenXML
 */
export async function createZipBuffer(
  files: Record<string, string | Uint8Array>
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const useDeflate = typeof CompressionStream !== 'undefined';

  interface PreparedEntry {
    nameBytes: Uint8Array;
    uncompressedSize: number;
    compressedData: Uint8Array;
    crc: number;
    method: number;
    localHeaderOffset: number;
  }

  const entries: PreparedEntry[] = [];
  let offset = 0;

  for (const [rawPath, content] of Object.entries(files)) {
    const cleanPath = rawPath.replace(/^\/+/, '');
    const nameBytes = encoder.encode(cleanPath);
    const rawBytes =
      typeof content === 'string' ? encoder.encode(content) : content;
    const fileCrc = crc32(rawBytes);
    const compressedData = useDeflate
      ? await deflateRawBytes(rawBytes)
      : rawBytes;
    const method = useDeflate ? 8 : 0;

    entries.push({
      nameBytes,
      uncompressedSize: rawBytes.length,
      compressedData,
      crc: fileCrc,
      method,
      localHeaderOffset: offset,
    });

    offset += 30 + nameBytes.length + compressedData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const entry of entries) {
    centralDirSize += 46 + entry.nameBytes.length;
  }

  const totalSize = centralDirOffset + centralDirSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  let pos = 0;

  // 1. Local File Headers + Data
  for (const entry of entries) {
    view.setUint32(pos, 0x04034b50, true); // Local file header signature
    view.setUint16(pos + 4, 20, true); // Version needed to extract (2.0)
    view.setUint16(pos + 6, 0x0800, true); // General purpose bit flag (UTF-8)
    view.setUint16(pos + 8, entry.method, true); // Compression method
    view.setUint16(pos + 10, 0, true); // Last mod file time
    view.setUint16(pos + 12, 0x5421, true); // Last mod file date
    view.setUint32(pos + 14, entry.crc, true); // CRC-32
    view.setUint32(pos + 18, entry.compressedData.length, true); // Compressed size
    view.setUint32(pos + 22, entry.uncompressedSize, true); // Uncompressed size
    view.setUint16(pos + 26, entry.nameBytes.length, true); // File name length
    view.setUint16(pos + 28, 0, true); // Extra field length
    out.set(entry.nameBytes, pos + 30);
    pos += 30 + entry.nameBytes.length;
    out.set(entry.compressedData, pos);
    pos += entry.compressedData.length;
  }

  // 2. Central Directory File Headers
  for (const entry of entries) {
    view.setUint32(pos, 0x02014b50, true); // Central directory signature
    view.setUint16(pos + 4, 20, true); // Version made by
    view.setUint16(pos + 6, 20, true); // Version needed to extract
    view.setUint16(pos + 8, 0x0800, true); // General purpose bit flag (UTF-8)
    view.setUint16(pos + 10, entry.method, true); // Compression method
    view.setUint16(pos + 12, 0, true); // Last mod file time
    view.setUint16(pos + 14, 0x5421, true); // Last mod file date
    view.setUint32(pos + 16, entry.crc, true); // CRC-32
    view.setUint32(pos + 20, entry.compressedData.length, true); // Compressed size
    view.setUint32(pos + 24, entry.uncompressedSize, true); // Uncompressed size
    view.setUint16(pos + 28, entry.nameBytes.length, true); // File name length
    view.setUint16(pos + 30, 0, true); // Extra field length
    view.setUint16(pos + 32, 0, true); // File comment length
    view.setUint16(pos + 34, 0, true); // Disk number start
    view.setUint16(pos + 36, 0, true); // Internal file attributes
    view.setUint32(pos + 38, 0, true); // External file attributes
    view.setUint32(pos + 42, entry.localHeaderOffset, true); // Relative offset of local header
    out.set(entry.nameBytes, pos + 46);
    pos += 46 + entry.nameBytes.length;
  }

  // 3. End of Central Directory Record (EOCD)
  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true); // Number of this disk
  view.setUint16(pos + 6, 0, true); // Disk where central directory starts
  view.setUint16(pos + 8, entries.length, true); // Number of central directory records on this disk
  view.setUint16(pos + 10, entries.length, true); // Total number of central directory records
  view.setUint32(pos + 12, centralDirSize, true); // Size of central directory
  view.setUint32(pos + 16, centralDirOffset, true); // Offset of start of central directory
  view.setUint16(pos + 20, 0, true); // Comment length

  return out.buffer;
}

/**
 * Giải nén và đọc các tệp XML văn bản từ bộ đệm ZIP (.xlsx)
 */
export async function readZipTextFiles(
  arrayBuffer: ArrayBuffer
): Promise<Record<string, string>> {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );
  const decoder = new TextDecoder('utf-8');
  const files: Record<string, string> = {};

  // Tìm End of Central Directory (0x06054b50) từ cuối tệp
  let eocdOffset = -1;
  const minEocdSearch = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minEocdSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    let cdPos = view.getUint32(eocdOffset + 16, true);

    for (let idx = 0; idx < totalEntries; idx++) {
      if (cdPos + 46 > bytes.length) break;
      const sig = view.getUint32(cdPos, true);
      if (sig !== 0x02014b50) break;

      const method = view.getUint16(cdPos + 10, true);
      const compressedSize = view.getUint32(cdPos + 20, true);
      const nameLen = view.getUint16(cdPos + 28, true);
      const extraLen = view.getUint16(cdPos + 30, true);
      const commentLen = view.getUint16(cdPos + 32, true);
      const localHeaderOffset = view.getUint32(cdPos + 42, true);

      const fileName = decoder
        .decode(bytes.subarray(cdPos + 46, cdPos + 46 + nameLen))
        .replace(/^\/+/, '');

      cdPos += 46 + nameLen + extraLen + commentLen;

      if (!fileName.endsWith('.xml') && !fileName.endsWith('.rels')) {
        continue;
      }

      if (localHeaderOffset + 30 > bytes.length) continue;
      const localSig = view.getUint32(localHeaderOffset, true);
      if (localSig !== 0x04034b50) continue;

      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const dataEnd = Math.min(bytes.length, dataStart + compressedSize);
      const rawSlice = bytes.subarray(dataStart, dataEnd);

      try {
        if (method === 0) {
          files[fileName] = decoder.decode(rawSlice);
        } else if (method === 8) {
          const inflated = await inflateRawBytes(rawSlice);
          files[fileName] = decoder.decode(inflated);
        }
      } catch {
        // Bỏ qua tệp XML không đọc được
      }
    }
  }

  // Dự phòng quét tuần tự Local File Header nếu chưa lấy được tệp nào
  if (Object.keys(files).length === 0) {
    let pos = 0;
    while (pos + 30 <= bytes.length) {
      if (view.getUint32(pos, true) !== 0x04034b50) break;
      const flags = view.getUint16(pos + 6, true);
      const method = view.getUint16(pos + 8, true);
      const compressedSize = view.getUint32(pos + 18, true);
      const nameLen = view.getUint16(pos + 26, true);
      const extraLen = view.getUint16(pos + 28, true);
      const fileName = decoder
        .decode(bytes.subarray(pos + 30, pos + 30 + nameLen))
        .replace(/^\/+/, '');
      const dataStart = pos + 30 + nameLen + extraLen;

      if ((flags & 0x08) !== 0 && compressedSize === 0) {
        break;
      }

      const rawSlice = bytes.subarray(dataStart, dataStart + compressedSize);
      if (fileName.endsWith('.xml') || fileName.endsWith('.rels')) {
        try {
          if (method === 0) {
            files[fileName] = decoder.decode(rawSlice);
          } else if (method === 8) {
            const inflated = await inflateRawBytes(rawSlice);
            files[fileName] = decoder.decode(inflated);
          }
        } catch {
          // Bỏ qua lỗi
        }
      }
      pos = dataStart + compressedSize;
    }
  }

  return files;
}

function escapeXml(val: string): string {
  return String(val)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = (name || `Sheet${index + 1}`)
    .replace(/[\\/?*[\]:]/g, '_')
    .trim()
    .slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
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

function renderCellXml(
  colIdx1Based: number,
  rowIdx1Based: number,
  value: string | number | null | undefined,
  styleIndex: number
): string {
  const ref = `${indexToExcelColLetters(colIdx1Based)}${rowIdx1Based}`;
  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}" s="${styleIndex}" t="inlineStr"><is><t></t></is></c>`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${styleIndex}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" s="${styleIndex}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    String(value)
  )}</t></is></c>`;
}

/**
 * Xây dựng bộ đệm tệp Excel (.xlsx) chuẩn OpenXML hỗ trợ nhiều trang tính, tiêu đề gộp ô và định dạng bảng
 */
export async function buildXlsxBuffer(
  sheets: XlsxSheetSpec[]
): Promise<ArrayBuffer> {
  const validSheets =
    sheets.length > 0
      ? sheets
      : [{ name: 'Sheet1', rows: [['Không có dữ liệu']] }];

  const zipFiles: Record<string, string> = {};

  const sheetOverrides = validSheets
    .map(
      (_s, idx) =>
        `<Override PartName="/xl/worksheets/sheet${
          idx + 1
        }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  zipFiles['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`;

  zipFiles['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookSheetsXml = validSheets
    .map((s, idx) => {
      const safeName = escapeXml(sanitizeSheetName(s.name, idx));
      return `<sheet name="${safeName}" sheetId="${idx + 1}" r:id="rId${
        idx + 1
      }"/>`;
    })
    .join('');

  zipFiles['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheetsXml}</sheets>
</workbook>`;

  const workbookRelsXml = validSheets
    .map(
      (_s, idx) =>
        `<Relationship Id="rId${
          idx + 1
        }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
          idx + 1
        }.xml"/>`
    )
    .join('');

  const stylesRelId = `rId${validSheets.length + 1}`;
  zipFiles['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRelsXml}
  <Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  zipFiles['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="FF1E3A8A"/><name val="Arial"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E40AF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  validSheets.forEach((sheet, idx) => {
    const colCount = Math.max(
      sheet.headers?.length || 0,
      sheet.columnWidths?.length || 0,
      ...sheet.rows.map((r) => r.length),
      1
    );

    let colsXml = '';
    if (sheet.columnWidths && sheet.columnWidths.length > 0) {
      const colItems = sheet.columnWidths
        .map(
          (w, cIdx) =>
            `<col min="${cIdx + 1}" max="${
              cIdx + 1
            }" width="${w}" customWidth="1"/>`
        )
        .join('');
      colsXml = `<cols>${colItems}</cols>`;
    }

    const rowXmlParts: string[] = [];
    let currentRowNum = 1;
    let mergeCellsXml = '';

    if (sheet.title) {
      const titleCells: string[] = [];
      for (let c = 1; c <= colCount; c++) {
        titleCells.push(
          renderCellXml(c, currentRowNum, c === 1 ? sheet.title : '', 1)
        );
      }
      rowXmlParts.push(
        `<row r="${currentRowNum}" ht="32" customHeight="1">${titleCells.join(
          ''
        )}</row>`
      );
      if (colCount > 1) {
        const lastCol = indexToExcelColLetters(colCount);
        mergeCellsXml = `<mergeCells count="1"><mergeCell ref="A1:${lastCol}1"/></mergeCells>`;
      }
      currentRowNum++;
    }

    if (sheet.headers && sheet.headers.length > 0) {
      const headerCells = sheet.headers.map((h, cIdx) =>
        renderCellXml(cIdx + 1, currentRowNum, h, 2)
      );
      rowXmlParts.push(
        `<row r="${currentRowNum}" ht="26" customHeight="1">${headerCells.join(
          ''
        )}</row>`
      );
      currentRowNum++;
    }

    for (const row of sheet.rows) {
      const cells = row.map((cellVal, cIdx) =>
        renderCellXml(cIdx + 1, currentRowNum, cellVal, 3)
      );
      rowXmlParts.push(
        `<row r="${currentRowNum}" ht="22">${cells.join('')}</row>`
      );
      currentRowNum++;
    }

    zipFiles[`xl/worksheets/sheet${idx + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${rowXmlParts.join('')}</sheetData>
  ${mergeCellsXml}
</worksheet>`;
  });

  return createZipBuffer(zipFiles);
}

/**
 * Tải tệp Excel mẫu danh sách học sinh
 */
export async function downloadSampleStudentExcel(): Promise<void> {
  const buffer = await buildXlsxBuffer([
    {
      name: 'DanhSachHocSinh',
      title: 'DANH SÁCH HỌC SINH MẪU - SMART TEST 7',
      headers: ['STT', 'Mã học sinh', 'Họ và tên học sinh', 'Lớp'],
      rows: [
        [1, 'HS7A01', 'Nguyễn Văn An', '7A'],
        [2, 'HS7A02', 'Trần Thị Minh Anh', '7A'],
        [3, 'HS7A03', 'Lê Hoàng Phúc', '7A'],
        [4, 'HS7A04', 'Phạm Đức Duy', '7A'],
        [5, 'HS7A05', 'Hoàng Thùy Dương', '7A'],
        [6, 'HS7B01', 'Đỗ Mai Hương', '7B'],
        [7, 'HS7B02', 'Vũ Quốc Bảo', '7B'],
      ],
      columnWidths: [8, 16, 30, 12],
    },
  ]);
  triggerDownload(buffer, 'Mau_Danh_Sach_Hoc_Sinh_Tin7.xlsx');
}

/**
 * Tải tệp Excel mẫu danh sách lớp học để khởi tạo lớp trống hàng loạt
 */
export async function downloadSampleClassListExcel(): Promise<void> {
  const buffer = await buildXlsxBuffer([
    {
      name: 'DanhSachLop',
      title: 'DANH SÁCH LỚP HỌC MẪU - SMART TEST 7',
      headers: ['STT', 'Tên lớp', 'Khối', 'Giáo viên chủ nhiệm / Ghi chú'],
      rows: [
        [1, '7A1', 'Khối 7', 'Phòng máy 01'],
        [2, '7A2', 'Khối 7', 'Phòng máy 01'],
        [3, '7A3', 'Khối 7', 'Phòng máy 02'],
        [4, '7A4', 'Khối 7', 'Phòng máy 02'],
        [5, '7A5', 'Khối 7', 'Phòng máy 01'],
        [6, '7B1', 'Khối 7', ''],
        [7, '7B2', 'Khối 7', ''],
      ],
      columnWidths: [8, 16, 14, 30],
    },
  ]);
  triggerDownload(buffer, 'Mau_Danh_Sach_Lop_Tin7.xlsx');
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
    classFilter && classFilter !== 'all'
      ? `DanhSach_Lop_${classFilter}`
      : 'DanhSachLop_DiemThi';

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

  const classTitlePart =
    classFilter && classFilter !== 'all'
      ? `LỚP ${classFilter.toUpperCase()}`
      : 'TOÀN TRƯỜNG';
  const titleText = `${schoolName.toUpperCase()} - DANH SÁCH HỌC SINH & BẢNG ĐIỂM MÔN TIN HỌC 7 (${classTitlePart})`;

  const rows: (string | number)[][] = targetStudents.map((student, idx) => {
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

    return [
      idx + 1,
      student.studentIdCode || `HS7${String(idx + 1).padStart(3, '0')}`,
      student.fullName,
      student.className,
      student.loginCode,
      '123456',
      latestScoreVal !== '' ? latestScoreVal : 'Chưa thi',
      latestExamTitleVal || '-',
      ...perExamScores,
    ];
  });

  const buffer = await buildXlsxBuffer([
    {
      name: sheetName,
      title: titleText,
      headers: allHeaders,
      rows,
      columnWidths: [
        7,
        15,
        28,
        10,
        16,
        16,
        16,
        32,
        ...relevantExams.map(() => 22),
      ],
    },
  ]);

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
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  // SHEET 1: BẢNG TỔNG HỢP KẾT QUẢ
  const sheet1Rows: (string | number)[][] =
    sessions.length > 0
      ? sessions.map((sess, idx) => {
          const student = studentMap.get(sess.studentId);
          const savedScore = student?.examScores?.[sess.examId];
          const finalScore =
            sess.score !== undefined
              ? sess.score
              : savedScore?.score !== undefined
              ? savedScore.score
              : 'Chưa nộp';
          const submittedAtIso = sess.submittedAt || savedScore?.submittedAt;
          return [
            idx + 1,
            student?.studentIdCode || `HS7${String(idx + 1).padStart(3, '0')}`,
            student?.fullName || 'Học sinh',
            student?.className || '',
            sess.paperCode || savedScore?.paperCode || 'MD701',
            sess.correctCount ?? savedScore?.correctCount ?? 0,
            sess.wrongCount ?? savedScore?.wrongCount ?? 0,
            sess.unansweredCount ?? savedScore?.unansweredCount ?? 0,
            finalScore,
            submittedAtIso
              ? new Date(submittedAtIso).toLocaleTimeString('vi-VN')
              : sess.status === 'dang_lam_bai'
              ? 'Đang làm'
              : 'Chưa thi',
          ];
        })
      : [['-', '-', 'Chưa có học sinh dự thi', '-', '-', 0, 0, 0, 'Chưa nộp', '-']];

  // SHEET 2: BẢNG CHI TIẾT CÂU TRẢ LỜI (Hỗ trợ đầy đủ 3 dạng: Nhiều lựa chọn, Đúng/Sai, Ghép đôi)
  const sheet2Rows: (string | number)[][] = [];
  const defaultQuestionOrder = summary.questionStats.map((qs) => qs.questionId);

  sessions.forEach((sess) => {
    const student = studentMap.get(sess.studentId);
    const paper = papers[`${sess.studentId}_${sess.examId}`];
    const qOrder =
      paper && Array.isArray(paper.questionOrder) && paper.questionOrder.length > 0
        ? paper.questionOrder
        : defaultQuestionOrder;
    const answersMap = sess.answers || {};

    qOrder.forEach((qId, qIdx) => {
      const q = questionMap.get(qId);
      const ans = answersMap[qId];
      const qType =
        q?.type ||
        (Array.isArray(q?.statements) && q.statements.length > 0
          ? 'true_false'
          : Array.isArray(q?.matchingPairs) && q.matchingPairs.length > 0
          ? 'matching'
          : 'multiple_choice');

      let selectedText = 'Bỏ trống';
      let correctText = '';
      let statusText = 'Chưa trả lời';

      if (qType === 'true_false' && Array.isArray(q?.statements)) {
        const tfMap = ans?.statementAnswers || {};
        const hasAny = q.statements.some((st) => typeof tfMap[st.id] === 'boolean');
        selectedText = hasAny
          ? q.statements
              .map((st) => `${st.label}) ${tfMap[st.id] === true ? 'Đ' : tfMap[st.id] === false ? 'S' : '-'}`)
              .join('; ')
          : 'Bỏ trống';
        correctText = q.statements
          .map((st) => `${st.label}) ${st.isTrue ? 'Đ' : 'S'}`)
          .join('; ');
        const allRight =
          q.statements.length > 0 && q.statements.every((st) => tfMap[st.id] === st.isTrue);
        statusText = !hasAny ? 'Chưa trả lời' : allRight ? 'ĐÚNG' : 'SAI';
      } else if (qType === 'matching' && Array.isArray(q?.matchingPairs)) {
        const mMap = ans?.matchingAnswers || {};
        const hasAny = q.matchingPairs.some((p) => Boolean(mMap[p.id]));
        selectedText = hasAny
          ? q.matchingPairs.map((p) => `${p.leftLabel}-${mMap[p.id] || '?'}`).join('; ')
          : 'Bỏ trống';
        correctText = q.matchingPairs.map((p) => `${p.leftLabel}-${p.rightLabel}`).join('; ');
        const allRight =
          q.matchingPairs.length > 0 &&
          q.matchingPairs.every((p) => mMap[p.id] === p.rightLabel);
        statusText = !hasAny ? 'Chưa trả lời' : allRight ? 'ĐÚNG' : 'SAI';
      } else {
        const selectedOptId = ans?.selectedOptionId;
        const isCorrect = Boolean(selectedOptId && q && selectedOptId === q.correctOptionId);
        const optionsList = Array.isArray(q?.options) ? q.options : [];
        const optMap = new Map(optionsList.map((o) => [o.id, o]));
        selectedText = selectedOptId
          ? optMap.get(selectedOptId)?.content || selectedOptId
          : 'Bỏ trống';
        correctText = q ? optMap.get(q.correctOptionId)?.content || q.correctOptionId : '';
        statusText = !selectedOptId ? 'Chưa trả lời' : isCorrect ? 'ĐÚNG' : 'SAI';
      }

      sheet2Rows.push([
        student?.fullName || 'Học sinh',
        student?.className || '',
        sess.paperCode || 'MD701',
        `Câu ${qIdx + 1}: ${(q?.content || '').substring(0, 45)}...`,
        selectedText,
        correctText,
        statusText,
      ]);
    });
  });

  if (sheet2Rows.length === 0) {
    sheet2Rows.push([
      'Chưa có dữ liệu trả lời chi tiết',
      '-',
      '-',
      '-',
      '-',
      '-',
      '-',
    ]);
  }

  // SHEET 3: THỐNG KÊ KỲ THI
  const sheet3Rows: (string | number)[][] = [
    ['Chỉ số tổng hợp', 'Giá trị', '', ''],
    ['Tổng số học sinh dự thi', summary.totalStudents, '', ''],
    ['Số học sinh đã nộp bài', summary.submittedCount, '', ''],
    ['Điểm trung bình toàn lớp', summary.averageScore, '', ''],
    ['Điểm cao nhất', summary.highestScore, '', ''],
    ['Điểm thấp nhất', summary.lowestScore, '', ''],
    ['Học lực Giỏi (8.0 - 10.0)', `${summary.excellentCount} học sinh`, '', ''],
    ['Học lực Khá (6.5 - 7.9)', `${summary.goodCount} học sinh`, '', ''],
    ['Học lực Đạt (5.0 - 6.4)', `${summary.averageCount} học sinh`, '', ''],
    ['Học lực Chưa đạt (< 5.0)', `${summary.weakCount} học sinh`, '', ''],
    ['', '', '', ''],
    [
      'STT Câu',
      'Nội dung câu hỏi',
      'Tỷ lệ trả lời đúng (%)',
      'Đánh giá độ khó',
    ],
  ];

  summary.questionStats.forEach((qs) => {
    let diff = 'Vừa sức';
    if (qs.correctPercent < 40) diff = 'Khó / Hay sai';
    if (qs.correctPercent > 80) diff = 'Dễ / Nắm vững';
    sheet3Rows.push([
      `Câu ${qs.questionIndex}`,
      qs.questionContent,
      `${qs.correctPercent}%`,
      diff,
    ]);
  });

  const buffer = await buildXlsxBuffer([
    {
      name: 'BangTongHopDiem',
      title: `BÁO CÁO KẾT QUẢ KỲ THI: ${examTitle.toUpperCase()}`,
      headers: [
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
      ],
      rows: sheet1Rows,
      columnWidths: [8, 14, 26, 10, 12, 14, 14, 16, 18, 18],
    },
    {
      name: 'ChiTietCauTraLoi',
      title: `CHI TIẾT PHƯƠNG ÁN CHỌN CỦA TỪNG HỌC SINH - ${examTitle}`,
      headers: [
        'Học sinh',
        'Lớp',
        'Mã đề',
        'Câu hỏi',
        'Phương án đã chọn',
        'Đáp án đúng',
        'Kết quả',
      ],
      rows: sheet2Rows,
      columnWidths: [24, 10, 12, 35, 26, 26, 14],
    },
    {
      name: 'ThongKePhoDiem',
      title: 'BẢNG THỐNG KÊ PHỔ ĐIỂM VÀ TỶ LỆ CÂU ĐÚNG',
      rows: sheet3Rows,
      columnWidths: [26, 45, 22, 18],
    },
  ]);

  triggerDownload(buffer, `Ket_Qua_${examTitle}.xlsx`);
}

function sanitizeDownloadFilename(rawName: string): string {
  const cleaned = String(rawName || 'Bao_Cao_Ket_Qua.xlsx')
    .replace(/[\\/:*?"<>|()[\]]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.toLowerCase().endsWith('.xlsx') ? cleaned : `${cleaned}.xlsx`;
}

function triggerDownload(buffer: ArrayBuffer, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const safeFilename = sanitizeDownloadFilename(filename);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = url;
  anchor.download = safeFilename;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    try {
      if (anchor.parentNode) {
        anchor.parentNode.removeChild(anchor);
      }
      window.URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 15000);
}

/**
 * Chuẩn hóa tên lớp (Ví dụ: "Lớp 7A1" -> "7A1", " 7b " -> "7B")
 */
export function normalizeClassName(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim();
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
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
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
 * Trích xuất trực tiếp bảng dữ liệu từ XML bên trong tệp .xlsx
 */
async function parseRowsDirectlyFromXlsxBuffer(
  arrayBuffer: ArrayBuffer
): Promise<string[][]> {
  const zipFiles = await readZipTextFiles(arrayBuffer);
  const sharedStrings: string[] = [];

  const ssXml =
    zipFiles['xl/sharedStrings.xml'] ||
    Object.entries(zipFiles).find(([k]) =>
      /sharedStrings\.xml$/i.test(k)
    )?.[1];

  if (ssXml) {
    const siMatches =
      ssXml.match(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/gi) || [];
    for (const si of siMatches) {
      const tMatches =
        si.match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi) || [];
      const text = tMatches
        .map((tTag) =>
          decodeXmlEntities(tTag.replace(/<\/?(?:\w+:)?t\b[^>]*>/gi, ''))
        )
        .join('');
      sharedStrings.push(text);
    }
  }

  let sheetXml = zipFiles['xl/worksheets/sheet1.xml'];
  if (!sheetXml) {
    const allSheetKeys = Object.keys(zipFiles)
      .filter((name) => /xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort();
    if (allSheetKeys.length > 0) {
      sheetXml = zipFiles[allSheetKeys[0]];
    }
  }
  if (!sheetXml) {
    return [];
  }

  const rowMatches =
    sheetXml.match(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/gi) || [];
  const rows: string[][] = [];

  for (const rowXml of rowMatches) {
    const cellMatches =
      rowXml.match(/<(?:\w+:)?c\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?c>)/gi) ||
      [];
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
        const tMatches =
          cellXml.match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/gi) || [];
        cellValue = tMatches
          .map((tTag) =>
            decodeXmlEntities(tTag.replace(/<\/?(?:\w+:)?t\b[^>]*>/gi, ''))
          )
          .join('');
      } else {
        const vMatch = cellXml.match(
          /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/i
        );
        const rawV = vMatch ? decodeXmlEntities(vMatch[1].trim()) : '';
        if (cellType === 's') {
          const ssIdx = parseInt(rawV, 10);
          cellValue =
            !isNaN(ssIdx) && sharedStrings[ssIdx] !== undefined
              ? sharedStrings[ssIdx]
              : rawV;
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
      trimmed.match(
        /<(?:\w+:)?(?:tr|row)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:tr|row)>/gi
      ) || [];
    for (const tr of trMatches) {
      const tdMatches =
        tr.match(
          /<(?:\w+:)?(?:td|th|cell|data)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:td|th|cell|data)>/gi
        ) || [];
      if (tdMatches.length === 0) continue;
      const cells = tdMatches.map((td) =>
        decodeXmlEntities(
          td.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        )
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
    const delimiter = line.includes('\t')
      ? '\t'
      : line.includes(';')
      ? ';'
      : ',';
    const cells = line
      .split(delimiter)
      .map((c) => c.replace(/^["']|["']$/g, '').trim());
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * Trích xuất hàng dữ liệu an toàn từ ArrayBuffer (.xlsx, .xls, HTML-table .xls, CSV)
 */
export async function extractRowsFromExcelBuffer(
  arrayBuffer: ArrayBuffer
): Promise<string[][]> {
  const bytes = new Uint8Array(arrayBuffer);
  const isZipArchive =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);

  if (isZipArchive) {
    const xmlRows = await parseRowsDirectlyFromXlsxBuffer(arrayBuffer);
    if (xmlRows.length > 0) {
      return xmlRows;
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
  } catch {
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
      } else if (
        /^tên$|^tên\s*hs$/i.test(val) &&
        nameCol !== -1 &&
        colIdx === nameCol + 1
      ) {
        lastNameCol = colIdx;
      } else if (
        /mã\s*hs|mã\s*học\s*sinh|mã\s*số|mã\s*định\s*danh/i.test(val)
      ) {
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

  const targetOverride = overrideClass
    ? normalizeClassName(overrideClass)
    : null;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const firstPart = String(row[nameCol] || '').trim();
    const secondPart =
      lastNameCol !== -1 ? String(row[lastNameCol] || '').trim() : '';
    const cleanName = [firstPart, secondPart]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

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

    const rawCode =
      codeCol >= 0 && codeCol < row.length
        ? String(row[codeCol] || '').trim()
        : '';
    const cleanCode =
      /^\d+$/.test(rawCode) && rawCode.length <= 3 ? '' : rawCode;

    const rawClass =
      classCol >= 0 && classCol < row.length
        ? String(row[classCol] || '').trim()
        : '';
    const parsedRowClass = normalizeClassName(rawClass);
    const validRowClass =
      parsedRowClass && parsedRowClass.length <= 10 && /\d/.test(parsedRowClass)
        ? parsedRowClass
        : '';

    const cleanClass =
      targetOverride ||
      validRowClass ||
      normalizeClassName(defaultClass) ||
      '7A';

    if (cleanClass) {
      detectedClassesSet.add(cleanClass);
    }

    students.push({
      fullName: cleanName,
      studentIdCode:
        cleanCode ||
        `HS${cleanClass}${String(students.length + 1).padStart(2, '0')}`,
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

    if (
      /^(stt|tên lớp|khối|ghi chú|giáo viên|tổng cộng|số thứ tự|danh sách)/i.test(
        norm
      )
    ) {
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
