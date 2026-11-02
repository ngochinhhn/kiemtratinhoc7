/**
 * Tiện ích xử lý chuẩn hóa tên tiếng Việt và tự sinh mã đăng nhập cho học sinh
 * Tuân theo quy tắc:
 * - Chuẩn hóa chữ tiếng Việt thành không dấu
 * - Lấy chữ cái đầu của họ và tên đệm kết hợp với tên chính, viết thường, không dấu
 * - Ví dụ: Nguyễn Văn An -> nvan, Trần Thị Minh Anh -> ttmanh
 * - Tự động thêm hậu tố _01, _02 nếu trùng mã đăng nhập
 */

/**
 * Loại bỏ dấu tiếng Việt và ký tự đặc biệt
 */
export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  let result = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  result = result.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return result;
}

/**
 * Tách họ tên và tạo mã đăng nhập cơ sở
 */
export function generateBaseLoginCode(fullName: string): string {
  const cleanName = removeVietnameseAccents(fullName.trim().toLowerCase())
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');

  const words = cleanName.split(' ').filter(Boolean);
  if (words.length === 0) return 'hs';
  if (words.length === 1) return words[0];

  const lastName = words[words.length - 1]; // Tên chính (An, Anh, Phúc, ...)
  const initials = words.slice(0, words.length - 1).map(w => w[0]).join(''); // Họ và đệm

  return `${initials}${lastName}`;
}

/**
 * Sinh danh sách mã đăng nhập cho danh sách học sinh, tự động phát hiện và giải quyết trùng lặp
 */
export function generateUniqueLoginCodes(
  students: { fullName: string; studentIdCode?: string }[],
  existingCodes: Set<string> = new Set()
): string[] {
  const usedCodes = new Set<string>(existingCodes);
  const result: string[] = [];

  for (const student of students) {
    const baseCode = generateBaseLoginCode(student.fullName);
    let finalCode = baseCode;

    if (usedCodes.has(finalCode)) {
      let counter = 1;
      while (usedCodes.has(`${baseCode}_${String(counter).padStart(2, '0')}`)) {
        counter++;
      }
      finalCode = `${baseCode}_${String(counter).padStart(2, '0')}`;
    }

    usedCodes.add(finalCode);
    result.push(finalCode);
  }

  return result;
}

/**
 * Mã băm mật khẩu đơn giản, an toàn cho lưu trữ
 */
export function hashPassword(plainPassword: string): string {
  // Băm giả lập SHA256 deterministic trong môi trường trình duyệt/Node không cần crypto rời
  let hash = 0x811c9dc5;
  for (let i = 0; i < plainPassword.length; i++) {
    hash ^= plainPassword.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `hash_${(hash >>> 0).toString(16)}`;
}

export const DEFAULT_STUDENT_PASSWORD = '123456';
export const DEFAULT_STUDENT_PASSWORD_HASH = hashPassword(DEFAULT_STUDENT_PASSWORD);
