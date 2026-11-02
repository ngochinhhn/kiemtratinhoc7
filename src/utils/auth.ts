import { Exam, Student } from '../types';

export interface TeacherAuthResult {
  ok: boolean;
  username?: string;
  error?: string;
}

export interface StudentAuthResult {
  ok: boolean;
  student?: Student;
  error?: string;
}

/**
 * Tìm kỳ thi đang thực sự diễn ra (status === 'dang_dien_ra').
 * Nếu không có kỳ thi nào đang mở, trả về null (tuyệt đối không fallback sang đề thi đã đóng/tạm dừng).
 */
export function getActiveRunningExam(
  exams: Exam[],
  activeExamId?: string | null
): Exam | null {
  if (!Array.isArray(exams) || exams.length === 0) return null;
  if (activeExamId) {
    const matched = exams.find(
      (e) => e.id === activeExamId && e.status === 'dang_dien_ra'
    );
    if (matched) return matched;
  }
  return exams.find((e) => e.status === 'dang_dien_ra') || null;
}

/**
 * Lấy danh sách gợi ý chọn nhanh học sinh (mặc định 4 học sinh đầu tiên)
 * của đúng lớp được phân công trong kỳ thi đang mở.
 */
export function getQuickSelectStudentsForExam(
  students: Student[],
  activeExam: Exam | null,
  limit: number = 4
): Student[] {
  if (!activeExam || activeExam.status !== 'dang_dien_ra') {
    return [];
  }
  const assignedClasses = Array.isArray(activeExam.classes)
    ? activeExam.classes.map((c) => c.trim().toLowerCase())
    : [];

  if (assignedClasses.length === 0) {
    return students.slice(0, limit);
  }

  return students
    .filter((s) => assignedClasses.includes(s.className.trim().toLowerCase()))
    .slice(0, limit);
}

/**
 * Xác thực tài khoản Giáo viên (Tài khoản: Admin, Mật khẩu: admin123)
 */
export function authenticateTeacher(username: string, password: string): TeacherAuthResult {
  const trimmedUser = username.trim();
  if (!trimmedUser) {
    return {
      ok: false,
      error: 'Vui lòng nhập tên tài khoản giáo viên (Admin).',
    };
  }
  if (!password) {
    return {
      ok: false,
      error: 'Vui lòng nhập mật khẩu giáo viên.',
    };
  }
  if (trimmedUser.toLowerCase() !== 'admin' || password !== 'admin123') {
    return {
      ok: false,
      error: 'Tài khoản hoặc mật khẩu không chính xác. (Mặc định: Admin / admin123)',
    };
  }
  return {
    ok: true,
    username: 'Admin',
  };
}

/**
 * Xác thực tài khoản Học sinh theo mã đăng nhập và mật khẩu mặc định (123456).
 * Kiểm tra kỳ thi đang mở và lớp được phân công (nếu truyền activeExam).
 */
export function authenticateStudent(
  loginCode: string,
  password: string,
  students: Student[],
  activeExam?: Exam | null
): StudentAuthResult {
  if (activeExam === null) {
    return {
      ok: false,
      error:
        'Hiện tại không có kỳ thi nào đang diễn ra. Em vui lòng quay lại sau khi có kỳ thi.',
    };
  }

  const code = loginCode.trim().toLowerCase();
  if (!code) {
    return {
      ok: false,
      error: 'Vui lòng nhập mã đăng nhập học sinh.',
    };
  }
  const student = students.find((s) => s.loginCode.toLowerCase() === code);
  if (!student) {
    return {
      ok: false,
      error: 'Mã đăng nhập không tồn tại trong danh sách lớp.',
    };
  }

  if (
    activeExam &&
    Array.isArray(activeExam.classes) &&
    activeExam.classes.length > 0
  ) {
    const allowedClasses = activeExam.classes.map((c) => c.trim().toLowerCase());
    if (!allowedClasses.includes(student.className.trim().toLowerCase())) {
      return {
        ok: false,
        error: `Học sinh ${student.fullName} (Lớp ${student.className}) không thuộc lớp tham gia kỳ thi này (Lớp ${activeExam.classes.join(', ')}).`,
      };
    }
  }

  const expectedPassword = student.passwordHash || '123456';
  if (password !== expectedPassword && password !== '123456') {
    return {
      ok: false,
      error: 'Mật khẩu không chính xác. Mật khẩu mặc định là: 123456',
    };
  }
  return {
    ok: true,
    student,
  };
}
