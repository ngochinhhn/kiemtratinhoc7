/**
 * SMART TEST 7 - Hệ thống thi trắc nghiệm trực tuyến môn Tin học 7
 * Định nghĩa kiểu dữ liệu chuẩn toàn hệ thống
 */

export type Role = 'giaovien' | 'hocsinh';

export type CognitiveLevel = 'nhan_biet' | 'thong_hieu' | 'van_dung' | 'van_dung_cao';

export type ReviewStatus = 'chua_kiem_duyet' | 'da_kiem_duyet' | 'can_chinh_sua';

export type ExamType = '15_phut' | '45_phut' | 'giua_ky' | 'cuoi_ky' | 'tu_chon';

export type ExamStatus = 'chua_mo' | 'dang_dien_ra' | 'tam_dung' | 'da_ket_thuc';

export type StudentExamStatus = 'chua_dang_nhap' | 'da_dang_nhap' | 'dang_lam_bai' | 'da_nop_bai' | 'mat_ket_noi';

/**
 * 3 dạng câu hỏi trắc nghiệm cơ bản trong đề thi:
 * - 'multiple_choice': Nhiều lựa chọn (4 phương án A, B, C, D - chọn 1 đáp án đúng duy nhất)
 * - 'true_false': Đúng/Sai (Theo cấu trúc mới của Bộ GD&ĐT: câu hỏi lớn gồm các ý nhỏ a, b, c, d Đúng/Sai kết hợp)
 * - 'matching': Ghép đôi (Nối các ý ở Cột A với Cột B sao cho tương thích về mặt nội dung)
 */
export type QuestionType = 'multiple_choice' | 'true_false' | 'matching';

export interface QuestionOption {
  id: string; // ID duy nhất e.g. "opt_1_a"
  label: 'A' | 'B' | 'C' | 'D';
  content: string;
}

export interface TrueFalseStatement {
  id: string; // ID duy nhất e.g. "tf_1_a"
  label: string; // Nhãn ý phát biểu: 'a', 'b', 'c', 'd'...
  content: string; // Nội dung phát biểu
  isTrue: boolean; // true = Đúng, false = Sai
}

export interface MatchingPair {
  id: string; // ID duy nhất e.g. "mp_1_1"
  leftLabel: string; // Nhãn cột A: "1", "2", "3", "4"
  leftContent: string; // Nội dung ở Cột A
  rightLabel: string; // Nhãn cột B gốc: "A", "B", "C", "D"
  rightContent: string; // Nội dung tương thích ở Cột B
}

export interface Question {
  id: string;
  type?: QuestionType; // Mặc định là 'multiple_choice' nếu không khai báo
  themeId: string; // Mã chủ đề e.g. "chu_de_1"
  themeName: string; // Tên chủ đề e.g. "Chủ đề 1: Máy tính và cộng đồng"
  lessonId: string; // Mã bài e.g. "bai_1"
  lessonName: string; // Tên bài e.g. "Bài 1: Thiết bị vào - ra"
  content: string; // Nội dung câu hỏi (hoặc câu dẫn cho Đúng/Sai, Ghép đôi)
  imageUrl?: string; // Đường dẫn hoặc Data URL hình ảnh minh họa trong câu hỏi (nếu có)
  imageCaption?: string; // Chú thích hình ảnh (ví dụ: "Hình 1.1. Máy quét")
  options: QuestionOption[];
  correctOptionId: string; // ID phương án đúng (cho dạng multiple_choice)
  statements?: TrueFalseStatement[]; // Danh sách các phát biểu a, b, c, d (cho dạng true_false)
  matchingPairs?: MatchingPair[]; // Danh sách các cặp ghép đôi Cột A - Cột B (cho dạng matching)
  cognitiveLevel: CognitiveLevel; // Mức độ nhận thức
  reviewStatus: ReviewStatus; // Trạng thái kiểm duyệt
  sourcePage?: number; // Trang trong Sách bài tập Tin học 7
  sourceBook?: string; // Tên tài liệu nguồn (Sách bài tập Tin học 7 - KNTT)
  explanation?: string; // Hướng dẫn giải / Giải thích chi tiết
  createdAt: string;
  updatedAt: string;
}

export interface StudentExamScoreRecord {
  examId: string;
  examTitle: string;
  score: number;
  correctCount?: number;
  wrongCount?: number;
  unansweredCount?: number;
  paperCode?: string;
  submittedAt: string;
  attemptCount?: number;
  previousScore?: number;
}

export interface Student {
  id: string;
  studentIdCode?: string; // Mã học sinh của trường e.g. "HS7001"
  fullName: string; // Họ và tên e.g. "Nguyễn Văn An"
  normalizedName: string; // Dạng chuẩn hóa không dấu
  loginCode: string; // Mã đăng nhập tự sinh e.g. "nvan", "nvan_01"
  passwordHash: string; // Mã băm mật khẩu (mặc định: "123456")
  className: string; // Lớp e.g. "7A", "7B"
  workstationNumber?: number; // Số máy tính trong phòng máy (1 đến 60)
  latestScore?: number; // Điểm kỳ thi gần nhất đã nộp
  latestExamId?: string; // Mã kỳ thi gần nhất đã nộp
  latestExamTitle?: string; // Tên kỳ thi gần nhất đã nộp
  latestSubmittedAt?: string; // Thời điểm nộp bài gần nhất
  examScores?: Record<string, StudentExamScoreRecord>; // Lưu điểm theo từng kỳ thi (examId -> StudentExamScoreRecord)
  createdAt: string;
}

export interface ExamHeaderConfig {
  schoolName: string; // e.g. "TRƯỜNG TH & THCS THỤY LÂM"
  schoolYear: string; // e.g. "Năm học 2025-2026"
  examHeaderTitle: string; // e.g. "ĐỀ KIỂM TRA ĐÁNH GIÁ GIỮA HỌC KÌ I"
  subjectHeader: string; // e.g. "MÔN: TIN HỌC 7"
  durationText?: string; // e.g. "(Thời gian: 45 phút)"
  showUnderline?: boolean; // Đường kẻ ngang dưới Năm học
  showStudentInfo?: boolean; // Dòng Họ và tên: ... Lớp: ...
  showAnswerGrid?: boolean; // Bảng điền đáp án trắc nghiệm
}

export interface Exam {
  id: string;
  title: string; // Tên bài kiểm tra e.g. "Kiểm tra 15 phút - Chủ đề 1: Máy tính và cộng đồng"
  type: ExamType;
  classes: string[]; // Các lớp được phân công thi e.g. ["7A", "7B"]
  durationMinutes: number; // Thời gian làm bài (phút) e.g. 15 hoặc 45
  totalQuestions: number; // Số lượng câu hỏi
  maxScore: number; // Thang điểm e.g. 10
  questionIds: string[]; // Danh sách ID câu hỏi được chọn
  status: ExamStatus;
  allowReviewAfterSubmit: boolean; // Cho phép xem đáp án sau khi nộp
  shuffleQuestions: boolean; // Đảo thứ tự câu hỏi cho từng học sinh
  shuffleOptions: boolean; // Đảo thứ tự phương án trả lời cho từng học sinh
  headerConfig?: ExamHeaderConfig; // Cấu hình tiêu đề bản in trang A4
  startTime?: string;
  endTime?: string;
  createdAt: string;
  updatedAt?: string;
}

// Cấu hình mã đề riêng của từng học sinh trong một kỳ thi
export interface StudentExamPaper {
  studentId: string;
  examId: string;
  paperCode: string; // Mã đề e.g. "MD701", "MD702"
  questionOrder: string[]; // Thứ tự ID câu hỏi đã đảo riêng cho học sinh này
  optionOrders: Record<string, string[]>; // Map questionId -> mảng ID phương án (hoặc ID cặp cột B) đã đảo cho câu hỏi đó
  questionSnapshots: Question[]; // Snapshot câu hỏi tại thời điểm mở thi (đảm bảo không bị ảnh hưởng nếu ngân hàng bị sửa)
}

export interface StudentAnswer {
  questionId: string;
  selectedOptionId: string | null; // Dùng cho dạng Nhiều lựa chọn (multiple_choice)
  statementAnswers?: Record<string, boolean | null>; // Dùng cho dạng Đúng/Sai: statementId -> true (Đúng) / false (Sai)
  matchingAnswers?: Record<string, string>; // Dùng cho dạng Ghép đôi: leftPairId (Cột A) -> selectedPairId (Cột B)
  isFlaggedForReview?: boolean; // Đánh dấu cần xem lại
  answeredAt?: string;
}

export interface StudentExamSession {
  id: string;
  examId: string;
  studentId: string;
  paperCode: string;
  status: StudentExamStatus;
  startedAt?: string;
  submittedAt?: string;
  timeRemainingSeconds: number;
  currentQuestionIndex?: number; // Vị trí câu hỏi đang làm lúc thoát ra / mất mạng (0-based)
  lastDisconnectedAt?: string; // Thời điểm bị mất mạng hoặc thoát ra giữa chừng
  disconnectReason?: 'mat_mang' | 'thoat_ra';
  answers: Record<string, StudentAnswer>; // questionId -> StudentAnswer
  score?: number;
  correctCount?: number;
  wrongCount?: number;
  unansweredCount?: number;
  attemptCount?: number; // Số lần thi (1 = lần đầu, 2 = thi lại lần 2 cho HS điểm < 5.0)
  previousScore?: number; // Điểm lần 1 trước khi được cấp quyền thi lại lần 2
  retakeGrantedAt?: string; // Thời điểm giáo viên cấp quyền thi lại
  lastHeartbeat: string;
  workstationIp?: string;
}

export interface ExamResultSummary {
  examId: string;
  examTitle: string;
  className: string;
  totalStudents: number;
  submittedCount: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  excellentCount: number; // Giỏi: 8.0 - 10.0
  goodCount: number; // Khá: 6.5 - 7.9
  averageCount: number; // Đạt: 5.0 - 6.4
  weakCount: number; // Chưa đạt: < 5.0
  questionStats: {
    questionId: string;
    questionIndex: number;
    questionContent: string;
    correctPercent: number;
    totalAttempts: number;
  }[];
}

export interface SystemConfig {
  serverIp: string; // IP máy chủ giáo viên LAN e.g. "192.168.1.10"
  serverPort: number; // Cổng dịch vụ e.g. 3000
  schoolName: string; // Tên trường THCS
  subjectName: string; // Môn học: Tin học 7
  activeExamId: string | null;
  autoSaveIntervalSeconds: number; // Chu kỳ tự động lưu bài (mặc định 5s)
}
