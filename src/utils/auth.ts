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
 * Lấy danh sách tất cả các kỳ thi đang thực sự diễn ra (status === 'dang_dien_ra').
 * Cho phép nhiều kỳ thi diễn ra đồng thời để học sinh lựa chọn kỳ thi tham dự lúc đăng nhập.
 */
export function getActiveRunningExams(
  exams: Exam[],
  preferredExamId?: string | null
): Exam[] {
  if (!Array.isArray(exams) || exams.length === 0) return [];
  const running = exams.filter((e) => e && e.status === 'dang_dien_ra');
  if (running.length <= 1 || !preferredExamId) return running;

  const preferredIdx = running.findIndex((e) => e.id === preferredExamId);
  if (preferredIdx > 0) {
    const [preferred] = running.splice(preferredIdx, 1);
    return [preferred, ...running];
  }
  return running;
}

/**
 * Tìm kỳ thi đang thực sự diễn ra (status === 'dang_dien_ra').
 * Nếu không có kỳ thi nào đang mở, trả về null (tuyệt đối không fallback sang đề thi đã đóng/tạm dừng).
 */
export function getActiveRunningExam(
  exams: Exam[],
  activeExamId?: string | null
): Exam | null {
  const running = getActiveRunningExams(exams, activeExamId);
  return running[0] || null;
}

/**
 * Lấy danh sách gợi ý chọn nhanh học sinh (mặc định 4 học sinh đầu tiên)
 * của đúng lớp được chọn hoặc lớp được phân công trong kỳ thi đang mở.
 */
export function getQuickSelectStudentsForExam(
  students: Student[],
  activeExam: Exam | null,
  limit: number = 4,
  selectedClass?: string
): Student[] {
  if (!activeExam || activeExam.status !== 'dang_dien_ra') {
    return [];
  }
  const assignedClasses = Array.isArray(activeExam.classes)
    ? activeExam.classes.map((c) => c.trim().toLowerCase())
    : [];

  const targetClass = selectedClass?.trim().toLowerCase();
  if (targetClass && (assignedClasses.length === 0 || assignedClasses.includes(targetClass))) {
    return students
      .filter((s) => s.className.trim().toLowerCase() === targetClass)
      .slice(0, limit);
  }

  if (assignedClasses.length === 0) {
    return students.slice(0, limit);
  }

  return students
    .filter((s) => assignedClasses.includes(s.className.trim().toLowerCase()))
    .slice(0, limit);
}

/**
 * Xác thực tài khoản Giáo viên.
 * Tuyệt đối không hiển thị tên tài khoản hoặc mật khẩu mặc định khi nhập sai.
 */
export function authenticateTeacher(username: string, password: string): TeacherAuthResult {
  const trimmedUser = username.trim();
  if (!trimmedUser) {
    return {
      ok: false,
      error: 'Vui lòng nhập tên đăng nhập giáo viên.',
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
      error: 'Tên đăng nhập hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!',
    };
  }
  return {
    ok: true,
    username: 'Admin',
  };
}

/**
 * Xác thực tài khoản Học sinh theo Lớp học, Mã đăng nhập và mật khẩu mặc định (123456).
 * Việc kết hợp Lớp học + Mã đăng nhập giúp tránh trùng mã đăng nhập khi nhiều lớp thi chung một đề.
 */
export function authenticateStudent(
  loginCode: string,
  password: string,
  students: Student[],
  activeExam?: Exam | null,
  selectedClass?: string
): StudentAuthResult {
  if (activeExam === null) {
    return {
      ok: false,
      error:
        'Hiện tại không có kỳ thi nào đang diễn ra. Em vui lòng quay lại sau khi có kỳ thi.',
    };
  }

  const normalizedClass = selectedClass ? selectedClass.trim() : '';
  if (
    activeExam &&
    Array.isArray(activeExam.classes) &&
    activeExam.classes.length > 0 &&
    normalizedClass
  ) {
    const allowedClasses = activeExam.classes.map((c) => c.trim().toLowerCase());
    if (!allowedClasses.includes(normalizedClass.toLowerCase())) {
      return {
        ok: false,
        error: `Lớp ${normalizedClass} không thuộc danh sách lớp tham gia kỳ thi này (Lớp ${activeExam.classes.join(', ')}).`,
      };
    }
  }

  const code = loginCode.trim().toLowerCase();
  if (!code) {
    return {
      ok: false,
      error: 'Vui lòng nhập mã đăng nhập học sinh.',
    };
  }

  // Nếu có chọn lớp cụ thể, tìm chính xác học sinh thuộc lớp đó để tránh trùng mã giữa các lớp
  const student = normalizedClass
    ? students.find(
        (s) =>
          s.loginCode.toLowerCase() === code &&
          s.className.trim().toLowerCase() === normalizedClass.toLowerCase()
      )
    : students.find((s) => s.loginCode.toLowerCase() === code);

  if (!student) {
    const existsInOtherClass = normalizedClass
      ? students.find((s) => s.loginCode.toLowerCase() === code)
      : undefined;
    if (existsInOtherClass) {
      return {
        ok: false,
        error: `Mã đăng nhập "${loginCode.trim()}" không thuộc Lớp ${normalizedClass}. Em vui lòng chọn đúng lớp của mình!`,
      };
    }
    return {
      ok: false,
      error: normalizedClass
        ? `Mã đăng nhập "${loginCode.trim()}" không tồn tại trong danh sách Lớp ${normalizedClass}.`
        : 'Mã đăng nhập không tồn tại trong danh sách lớp.',
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
      error: 'Mật khẩu không chính xác. Vui lòng kiểm tra lại!',
    };
  }
  return {
    ok: true,
    student,
  };
}
