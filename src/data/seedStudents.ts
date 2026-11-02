import { Student } from '../types';
import { generateUniqueLoginCodes, DEFAULT_STUDENT_PASSWORD_HASH } from '../utils/studentCode';

const rawStudents7A = [
  { fullName: 'Nguyễn Văn An', studentIdCode: 'HS7A01' },
  { fullName: 'Trần Thị Minh Anh', studentIdCode: 'HS7A02' },
  { fullName: 'Lê Hoàng Phúc', studentIdCode: 'HS7A03' },
  { fullName: 'Phạm Đức Duy', studentIdCode: 'HS7A04' },
  { fullName: 'Hoàng Thùy Dương', studentIdCode: 'HS7A05' },
  { fullName: 'Vũ Quốc Bảo', studentIdCode: 'HS7A06' },
  { fullName: 'Đỗ Thị Ngọc Mai', studentIdCode: 'HS7A07' },
  { fullName: 'Bùi Tuấn Kiệt', studentIdCode: 'HS7A08' },
  { fullName: 'Ngô Thanh Hà', studentIdCode: 'HS7A09' },
  { fullName: 'Đặng Đình Đồng', studentIdCode: 'HS7A10' },
  { fullName: 'Dương Gia Huy', studentIdCode: 'HS7A11' },
  { fullName: 'Lý Diệu Linh', studentIdCode: 'HS7A12' },
  { fullName: 'Mai Văn Nam', studentIdCode: 'HS7A13' },
  { fullName: 'Phan Khánh Huyền', studentIdCode: 'HS7A14' },
  { fullName: 'Hồ Quang Dũng', studentIdCode: 'HS7A15' },
  { fullName: 'Trịnh Ngọc Trâm', studentIdCode: 'HS7A16' },
  { fullName: 'Lương Bảo Long', studentIdCode: 'HS7A17' },
  { fullName: 'Đinh Thị Thu Trang', studentIdCode: 'HS7A18' },
  { fullName: 'Nguyễn Thành Đạt', studentIdCode: 'HS7A19' },
  { fullName: 'Tạ Minh Khang', studentIdCode: 'HS7A20' },
  { fullName: 'Đào Thu Thảo', studentIdCode: 'HS7A21' },
  { fullName: 'Võ Minh Quân', studentIdCode: 'HS7A22' },
  { fullName: 'Chu Đức Huy', studentIdCode: 'HS7A23' },
  { fullName: 'Cao Phương Linh', studentIdCode: 'HS7A24' },
  { fullName: 'Lê Nguyễn Quỳnh Anh', studentIdCode: 'HS7A25' },
  { fullName: 'Nguyễn Hoàng Bách', studentIdCode: 'HS7A26' },
  { fullName: 'Trần Nhật Minh', studentIdCode: 'HS7A27' },
  { fullName: 'Phạm Hải Đăng', studentIdCode: 'HS7A28' },
  { fullName: 'Nguyễn Văn An', studentIdCode: 'HS7A29' }, // Trùng tên kiểm thử collision
  { fullName: 'Vũ Thảo Vy', studentIdCode: 'HS7A30' },
];

const rawStudents7B = [
  { fullName: 'Nguyễn Hữu Thắng', studentIdCode: 'HS7B01' },
  { fullName: 'Trần Bảo Ngọc', studentIdCode: 'HS7B02' },
  { fullName: 'Lê Văn Khải', studentIdCode: 'HS7B03' },
  { fullName: 'Phạm Yến Nhi', studentIdCode: 'HS7B04' },
  { fullName: 'Hoàng Minh Khôi', studentIdCode: 'HS7B05' },
  { fullName: 'Vũ Mai Hương', studentIdCode: 'HS7B06' },
  { fullName: 'Đỗ Tuấn Anh', studentIdCode: 'HS7B07' },
  { fullName: 'Bùi Kim Ngân', studentIdCode: 'HS7B08' },
  { fullName: 'Ngô Việt Hoàng', studentIdCode: 'HS7B09' },
  { fullName: 'Đặng Thùy Trang', studentIdCode: 'HS7B10' },
  { fullName: 'Dương Gia Bảo', studentIdCode: 'HS7B11' },
  { fullName: 'Lý Lan Anh', studentIdCode: 'HS7B12' },
  { fullName: 'Mai Trọng Tấn', studentIdCode: 'HS7B13' },
  { fullName: 'Phan Cẩm Tú', studentIdCode: 'HS7B14' },
  { fullName: 'Hồ Đăng Khoa', studentIdCode: 'HS7B15' },
  { fullName: 'Trịnh Mỹ Duyên', studentIdCode: 'HS7B16' },
  { fullName: 'Lương Minh Tú', studentIdCode: 'HS7B17' },
  { fullName: 'Đinh Tiến Đạt', studentIdCode: 'HS7B18' },
  { fullName: 'Nguyễn Ngọc Hân', studentIdCode: 'HS7B19' },
  { fullName: 'Tạ Minh Triết', studentIdCode: 'HS7B20' },
  { fullName: 'Đào Khánh Vân', studentIdCode: 'HS7B21' },
  { fullName: 'Võ Đình Phong', studentIdCode: 'HS7B22' },
  { fullName: 'Chu Bảo Châu', studentIdCode: 'HS7B23' },
  { fullName: 'Cao Tuấn Minh', studentIdCode: 'HS7B24' },
  { fullName: 'Lê Thảo My', studentIdCode: 'HS7B25' },
  { fullName: 'Nguyễn Đức Trọng', studentIdCode: 'HS7B26' },
  { fullName: 'Trần Gia Linh', studentIdCode: 'HS7B27' },
  { fullName: 'Phạm Xuân Trường', studentIdCode: 'HS7B28' },
  { fullName: 'Nguyễn Hữu Thắng', studentIdCode: 'HS7B29' }, // Trùng tên kiểm thử
  { fullName: 'Vũ Như Quỳnh', studentIdCode: 'HS7B30' },
];

export function buildSeedStudents(): Student[] {
  const allRaw = [
    ...rawStudents7A.map((s) => ({ ...s, className: '7A' })),
    ...rawStudents7B.map((s) => ({ ...s, className: '7B' })),
  ];

  const uniqueCodes = generateUniqueLoginCodes(allRaw);

  return allRaw.map((raw, idx) => ({
    id: `hs_${idx + 1}`,
    studentIdCode: raw.studentIdCode,
    fullName: raw.fullName,
    normalizedName: raw.fullName,
    loginCode: uniqueCodes[idx],
    passwordHash: DEFAULT_STUDENT_PASSWORD_HASH,
    className: raw.className,
    workstationNumber: (idx % 60) + 1, // Máy 01 -> Máy 60
    createdAt: '2026-10-29',
  }));
}
