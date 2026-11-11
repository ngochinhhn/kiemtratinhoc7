import React from 'react';
import {
  HelpCircle,
  BookOpen,
  Users,
  FileSpreadsheet,
  PlayCircle,
  BarChart3,
  GraduationCap,
  ShieldCheck,
  Phone,
  Mail,
  School,
  UserCheck,
  Printer,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';

interface HelpViewProps {
  isModal?: boolean;
  onClose?: () => void;
}

export const HelpView: React.FC<HelpViewProps> = ({ isModal = false, onClose }) => {
  const content = (
    <div className="space-y-6">
      {/* Header giới thiệu Trợ giúp & Tác giả */}
      <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-800 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 bg-white/15 backdrop-blur-xs px-3 py-1 rounded-full text-xs font-semibold text-blue-100">
              <HelpCircle className="w-4 h-4 text-amber-300" />
              <span>Trung tâm Trợ giúp & Thông tin bản quyền</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">
              HƯỚNG DẪN SỬ DỤNG & THÔNG TIN TÁC GIẢ
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 max-w-2xl">
              Hệ thống thi và kiểm tra trắc nghiệm môn Tin học 7 (Bộ sách Kết nối tri thức với cuộc sống)
              dành cho phòng máy thực hành THCS.
            </p>
          </div>

          {isModal && onClose && (
            <button
              onClick={onClose}
              aria-label="Đóng cửa sổ trợ giúp"
              className="self-start md:self-center bg-white/15 hover:bg-white/25 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Đóng</span>
            </button>
          )}
        </div>
      </div>

      {/* THÔNG TIN VỀ TÁC GIẢ (NỔI BẬT) */}
      <section
        aria-label="Thông tin về tác giả"
        className="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden"
      >
        <div className="bg-blue-50/80 border-b border-blue-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                Thông tin về tác giả phần mềm
              </h2>
              <p className="text-xs text-slate-500">
                Thiết kế và phát triển phần mềm phục vụ giảng dạy &amp; kiểm tra đánh giá môn Tin học THCS
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center space-x-1 bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold px-3 py-1 rounded-full">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Tác giả phần mềm</span>
          </span>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Họ tên & Đơn vị công tác */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
              <School className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Tác giả &amp; Đơn vị công tác
              </span>
              <p className="text-sm font-extrabold text-slate-900">
                Tác giả: Cô giáo Hoàng Thị Thùy Trang
              </p>
              <p className="text-xs text-slate-600 font-medium">
                Trường TH &amp; THCS Thụy Lâm - Xã Thư Lâm - TP Hà Nội
              </p>
            </div>
          </div>

          {/* Số điện thoại */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <Phone className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Điện thoại liên hệ
              </span>
              <p className="text-base font-black text-emerald-700 font-mono">
                Điện thoại: 0339104040
              </p>
              <p className="text-xs text-slate-500">
                Liên hệ tác giả &amp; trao đổi chuyên môn
              </p>
            </div>
          </div>

          {/* Email */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
              <Mail className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Địa chỉ thư điện tử
              </span>
              <p className="text-sm font-extrabold text-indigo-700 font-mono break-all">
                Email: hoangthuytrang206@gmail.com
              </p>
              <p className="text-xs text-slate-500">
                Gửi góp ý &amp; chia sẻ tài liệu giảng dạy
              </p>
            </div>
          </div>
        </div>

        {/* HỖ TRỢ KĨ THUẬT (CHỈ HIỂN THỊ TRONG PHẦN TRỢ GIÚP) */}
        <div
          data-testid="help-technical-support-section"
          className="px-6 py-4 bg-indigo-50/70 border-t border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 text-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 block">
                Hỗ trợ kĩ thuật
              </span>
              <p className="font-extrabold text-slate-900 text-sm">
                Thầy giáo Ngô Văn Chinh - Trường TH &amp; THCS Thụy Lâm
              </p>
              <p className="text-[11px] text-slate-600">
                Trường TH &amp; THCS Thụy Lâm - Xã Thư Lâm - TP Hà Nội
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
            <span className="bg-white text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg shadow-2xs">
              Điện thoại: 0983460604
            </span>
            <span className="bg-white text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg shadow-2xs">
              Email: nvchinh@moet.edu.vn
            </span>
          </div>
        </div>
      </section>

      {/* HƯỚNG DẪN SỬ DỤNG ỨNG DỤNG */}
      <section
        aria-label="Hướng dẫn sử dụng ứng dụng"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Cột 1: Hướng dẫn dành cho Giáo viên */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                1. Hướng dẫn sử dụng cho Giáo viên
              </h2>
              <p className="text-xs text-slate-500">
                Đăng nhập bằng tài khoản quản trị dành riêng cho Giáo viên bộ môn
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs text-slate-600">
            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 font-extrabold flex items-center justify-center shrink-0 border border-blue-200">
                B1
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 flex items-center space-x-1.5">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>Quản lý Ngân hàng câu hỏi &amp; Nhập từ PDF</span>
                </h3>
                <p>
                  Vào mục <strong>Ngân hàng câu hỏi &amp; PDF</strong> để thêm, sửa, xóa câu hỏi hoặc tải lên
                  file PDF câu hỏi ôn tập. Hệ thống hỗ trợ đầy đủ 3 dạng thức trắc nghiệm theo cấu trúc mới:
                  <strong> Nhiều lựa chọn (A, B, C, D)</strong>, <strong>Đúng/Sai (a, b, c, d)</strong> và{' '}
                  <strong>Ghép đôi (Cột A ↔ Cột B)</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 font-extrabold flex items-center justify-center shrink-0 border border-blue-200">
                B2
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 flex items-center space-x-1.5">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Quản lý Học sinh &amp; Nhập từ Excel</span>
                </h3>
                <p>
                  Vào mục <strong>Quản lý học sinh &amp; Excel</strong> để tạo lớp học, nhập danh sách học sinh
                  từ file Excel. Hệ thống tự động tạo <strong>Mã đăng nhập</strong> không dấu theo từng lớp (ví dụ:{' '}
                  <code>nvan</code>) và cấp mật khẩu mặc định <code>123456</code>.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 font-extrabold flex items-center justify-center shrink-0 border border-blue-200">
                B3
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 flex items-center space-x-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  <span>Tạo đề kiểm tra, Đảo đề, In A4 &amp; Xuất file Word (.docx)</span>
                </h3>
                <p>
                  Vào mục <strong>Tạo đề &amp; Đảo đề</strong>, chọn tạo đề theo chủ đề ngẫu nhiên hoặc{' '}
                  <strong>Chọn từng câu hỏi thủ công</strong> (lọc theo từng dạng câu hỏi). Nhấn{' '}
                  <strong>Xem đề chuẩn A4</strong> để xem phân trang, nhấn nút{' '}
                  <strong className="inline-flex items-center space-x-1">
                    <Printer className="w-3 h-3 inline" /> <span>In đề</span>
                  </strong>{' '}
                  để in ra máy in/PDF hoặc nhấn <strong>Xuất file .docx</strong> để tải đề thi về máy tính.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 font-extrabold flex items-center justify-center shrink-0 border border-blue-200">
                B4
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 flex items-center space-x-1.5">
                  <PlayCircle className="w-4 h-4 text-emerald-600" />
                  <span>Mở kỳ thi trực tuyến, Giám sát &amp; Xuất bảng điểm</span>
                </h3>
                <p>
                  Nhấn <strong>Mở kỳ thi</strong> trên đề thi cần tổ chức. Theo dõi tiến độ làm bài trực tiếp
                  tại mục <strong>Giám sát phòng thi</strong> và xuất kết quả ra file Excel tại
                  mục <strong>Bảng điểm &amp; Xuất Excel</strong>. Mọi chỉnh sửa dữ liệu được tự động cập nhật vào thư mục Data.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Cột 2: Hướng dẫn dành cho Học sinh */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                2. Hướng dẫn làm bài cho Học sinh
              </h2>
              <p className="text-xs text-slate-500">
                Chọn <strong>Lớp học</strong> + <strong>Mã đăng nhập</strong> • Mật khẩu mặc định:{' '}
                <code className="font-bold text-emerald-700">123456</code>
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs text-slate-600">
            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 font-extrabold flex items-center justify-center shrink-0 border border-emerald-200">
                1
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800">Chọn lớp học &amp; Nhập mã đăng nhập</h3>
                <p>
                  Chọn chế độ <strong>Học sinh</strong> tại cửa sổ đăng nhập, chọn đúng <strong>Lớp học</strong> của em bên cạnh ô <strong>Mã đăng nhập</strong> (giúp phân biệt chính xác khi nhiều lớp cùng thi chung một đề), rồi nhập mật khẩu mặc định <code>123456</code>.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 font-extrabold flex items-center justify-center shrink-0 border border-emerald-200">
                2
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800">Kiểm tra thông tin &amp; Nhận mã đề riêng</h3>
                <p>
                  Sau khi đăng nhập, kiểm tra đúng Họ và tên, Lớp và Mã đề riêng (<code>MD701</code>,{' '}
                  <code>MD702</code>...) rồi nhấn nút <strong>Bắt đầu làm bài thi</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 font-extrabold flex items-center justify-center shrink-0 border border-emerald-200">
                3
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800">Cách trả lời 3 dạng câu hỏi trắc nghiệm</h3>
                <ul className="space-y-1 list-disc list-inside text-slate-600">
                  <li>
                    <strong>Dạng Nhiều lựa chọn:</strong> Nhấp chuột chọn 1 đáp án đúng nhất trong 4 phương án A, B, C, D.
                  </li>
                  <li>
                    <strong>Dạng Đúng/Sai:</strong> Đánh giá từng phát biểu <code>a), b), c), d)</code> trong bảng và tích chọn <strong>Đúng</strong> hoặc <strong>Sai</strong> cho mỗi ý.
                  </li>
                  <li>
                    <strong>Dạng Ghép đôi:</strong> Chọn ý tương ứng ở <strong>Cột B</strong> để ghép nối chính xác với từng mục ở <strong>Cột A</strong>.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 font-extrabold flex items-center justify-center shrink-0 border border-emerald-200">
                4
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Tự động ghi lại trạng thái khi mất mạng hoặc thoát ra</span>
                </h3>
                <p>
                  Trong lúc đang thi trực tuyến, nếu bị mất mạng hoặc thoát ra ngoài, hệ thống tự động ghi lại <strong>câu hỏi đang làm, thời gian còn lại và toàn bộ đáp án đã chọn</strong>. Khi đăng nhập trở lại, em sẽ tiếp tục làm bài ngay tại đúng trạng thái lúc thoát ra.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  if (isModal) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Trợ giúp và Thông tin tác giả"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      >
        <div className="bg-slate-50 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 border border-slate-200">
          {content}
        </div>
      </div>
    );
  }

  return content;
};
