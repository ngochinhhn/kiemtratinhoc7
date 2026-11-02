import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  parseStudentsFromExcelBuffer,
  parseClassesFromExcelBuffer,
  normalizeClassName,
} from './excelExport';

test('parseStudentsFromExcelBuffer parses valid student rows and auto detects columns', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('DanhSach');

  // Add header row
  worksheet.addRow(['STT', 'Mã học sinh', 'Họ và tên học sinh', 'Lớp']);
  // Add data rows
  worksheet.addRow([1, 'HS7C01', 'Nguyễn Văn Minh', '7C']);
  worksheet.addRow([2, 'HS7C02', 'Trần Thu Trang', '7C']);
  worksheet.addRow([3, '', 'Lê Quốc Bảo', '7C']);

  const buffer = await workbook.xlsx.writeBuffer();
  const result = await parseStudentsFromExcelBuffer(buffer as ArrayBuffer, '7C');

  assert.equal(result.students.length, 3);
  assert.equal(result.students[0].fullName, 'Nguyễn Văn Minh');
  assert.equal(result.students[0].studentIdCode, 'HS7C01');
  assert.equal(result.students[0].className, '7C');

  assert.equal(result.students[1].fullName, 'Trần Thu Trang');
  assert.equal(result.students[1].studentIdCode, 'HS7C02');

  assert.equal(result.students[2].fullName, 'Lê Quốc Bảo');
  assert.equal(result.detectedClassNames.includes('7C'), true);
});

test('parseStudentsFromExcelBuffer correctly enforces overrideClass when uploading for a specific class', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('HocSinhLop7A1');

  worksheet.addRow(['STT', 'Họ và tên', 'Ghi chú']);
  worksheet.addRow([1, 'Phạm Gia Huy', '']);
  worksheet.addRow([2, 'Vũ Hải Yến', '']);

  const buffer = await workbook.xlsx.writeBuffer();
  const result = await parseStudentsFromExcelBuffer(buffer as ArrayBuffer, '7A', '7A1');

  assert.equal(result.students.length, 2);
  assert.equal(result.students[0].className, '7A1');
  assert.equal(result.students[1].className, '7A1');
  assert.equal(result.detectedClassNames.includes('7A1'), true);
});

test('parseStudentsFromExcelBuffer succeeds when docProps/app.xml has namespaced Properties tag that crashes raw ExcelJS with company error', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('DanhSach');
  worksheet.addRow(['STT', 'Mã HS', 'Họ và tên', 'Lớp']);
  worksheet.addRow([1, 'HS7A1_01', 'Đặng Minh Khôi', '7A1']);
  worksheet.addRow([2, 'HS7A1_02', 'Ngô Bảo Châu', '7A1']);

  const rawBuffer = await workbook.xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(rawBuffer);
  // Inject namespaced docProps/app.xml that causes raw ExcelJS AppXform to return undefined (reading 'company')
  zip.file(
    'docProps/app.xml',
    '<?xml version="1.0" encoding="UTF-8"?><ep:Properties xmlns:ep="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><ep:Company>VNEDU</ep:Company></ep:Properties>'
  );
  const brokenAppXmlBuffer = await zip.generateAsync({ type: 'arraybuffer' });

  const result = await parseStudentsFromExcelBuffer(brokenAppXmlBuffer, '7A1');
  assert.equal(result.students.length, 2);
  assert.equal(result.students[0].fullName, 'Đặng Minh Khôi');
  assert.equal(result.students[1].fullName, 'Ngô Bảo Châu');
});

test('parseStudentsFromExcelBuffer parses HTML table .xls files exported from school management systems', async () => {
  const htmlXls = `
    <html>
      <body>
        <table>
          <tr><th>STT</th><th>Mã học sinh</th><th>Họ và tên</th><th>Lớp</th></tr>
          <tr><td>1</td><td>HS7B01</td><td>Hoàng Gia Bảo</td><td>7B</td></tr>
          <tr><td>2</td><td>HS7B02</td><td>Lý Thanh Thảo</td><td>7B</td></tr>
        </table>
      </body>
    </html>
  `;
  const buffer = new TextEncoder().encode(htmlXls).buffer;
  const result = await parseStudentsFromExcelBuffer(buffer, '7B');
  assert.equal(result.students.length, 2);
  assert.equal(result.students[0].fullName, 'Hoàng Gia Bảo');
  assert.equal(result.students[1].fullName, 'Lý Thanh Thảo');
  assert.equal(result.students[0].className, '7B');
});

test('parseClassesFromExcelBuffer extracts unique class names from Excel file', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('DanhSachLop');

  worksheet.addRow(['STT', 'Tên lớp', 'Khối', 'Ghi chú']);
  worksheet.addRow([1, '7A1', '7', 'Phòng 101']);
  worksheet.addRow([2, '7A2', '7', 'Phòng 102']);
  worksheet.addRow([3, 'Lớp 7A3', '7', 'Phòng 103']);
  worksheet.addRow([4, '7A1', '7', 'Trùng']);

  const buffer = await workbook.xlsx.writeBuffer();
  const result = await parseClassesFromExcelBuffer(buffer as ArrayBuffer);

  assert.equal(result.classes.length, 3);
  assert.deepEqual(result.classes, ['7A1', '7A2', '7A3']);
});

test('normalizeClassName cleans up class names', () => {
  assert.equal(normalizeClassName('Lớp 7A1'), '7A1');
  assert.equal(normalizeClassName('lop 7B'), '7B');
  assert.equal(normalizeClassName('Class 7C'), '7C');
  assert.equal(normalizeClassName('  7d  '), '7D');
});

