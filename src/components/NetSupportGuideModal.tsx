import React, { useState } from 'react';
import {
  HelpCircle,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Wifi,
  Laptop,
  Monitor,
  Terminal,
  Lock,
  X,
  Play,
  Share2,
} from 'lucide-react';

interface NetSupportGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverIp: string;
  serverPort: number;
}

export const NetSupportGuideModal: React.FC<NetSupportGuideModalProps> = ({
  isOpen,
  onClose,
  serverIp,
  serverPort,
}) => {
  const [copied, setCopied] = useState(false);
  const examUrl = `http://${serverIp}:${serverPort}`;

  if (!isOpen) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(examUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header modal */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">
                Quy trình triển khai SMART TEST 7 qua NetSupport School
              </h2>
              <p className="text-xs text-slate-500">
                Phối hợp mạng LAN phòng thực hành Tin học với phần mềm quản lý lớp học
              </p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Khung địa chỉ phòng thi LAN */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-blue-700 font-semibold uppercase text-[10px] tracking-wider block">
              ĐỊA CHỈ TRUY CẬP PHÒNG THI MẠNG NỘI BỘ (LAN):
            </span>
            <span className="font-mono text-base font-black text-blue-950 select-all">{examUrl}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyUrl}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Đã sao chép' : 'Sao chép địa chỉ'}</span>
            </button>
            <a
              href={examUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-3 py-2 rounded-lg flex items-center space-x-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Mở thử</span>
            </a>
          </div>
        </div>

        {/* 6 Bước triển khai thực tế bằng NetSupport School */}
        <div className="space-y-3 text-xs text-slate-700">
          <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
            <span>Các bước thao tác dành cho giáo viên tại phòng máy:</span>
          </h3>

          <div className="space-y-3">
            {/* Bước 1 */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  1
                </span>
                <span className="font-bold text-slate-900">
                  Khởi động máy chủ SMART TEST 7 trên máy giáo viên
                </span>
              </div>
              <p className="text-slate-600 pl-7">
                Máy giáo viên kết nối vào mạng mạng LAN phòng thực hành. Mở SMART TEST 7 trên Google Chrome hoặc Microsoft Edge. Hệ thống hoạt động hoàn toàn cục bộ, không cần mạng Internet.
              </p>
            </div>

            {/* Bước 2 */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  2
                </span>
                <span className="font-bold text-slate-900">
                  Khóa chuột và bàn phím máy học sinh trước giờ thi
                </span>
              </div>
              <p className="text-slate-600 pl-7">
                Trên giao diện NetSupport School Teacher, chọn toàn bộ lớp học và bấm chức năng <strong>"Lock" (Khóa chuột/bàn phím)</strong> hoặc <strong>"Blank Screen"</strong> để ổn định trật tự và phổ biến quy chế thi.
              </p>
            </div>

            {/* Bước 3 */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  3
                </span>
                <span className="font-bold text-slate-900">
                  Gửi đồng loạt liên kết thi tới 60 máy học sinh
                </span>
              </div>
              <p className="text-slate-600 pl-7">
                Tại thanh công cụ NetSupport School: chọn <strong>"Web / Gửi URL"</strong> (hoặc <strong>Launch Application</strong>), dán địa chỉ <code>{examUrl}</code> và bấm <strong>Send</strong>. Tất cả 60 máy trạm sẽ tự động bật trình duyệt và chuyển thẳng tới trang đăng nhập thi của SMART TEST 7.
              </p>
            </div>

            {/* Bước 4 */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  4
                </span>
                <span className="font-bold text-slate-900">
                  Học sinh đăng nhập và nhận mã đề thi riêng biệt
                </span>
              </div>
              <p className="text-slate-600 pl-7">
                Mở khóa chuột/bàn phím để học sinh nhập <strong>Mã đăng nhập</strong> (ví dụ: <code>nvan</code>) và <strong>Mật khẩu 123456</strong>. Mỗi học sinh tự động nhận một mã đề riêng (MD701, MD702...) với thứ tự câu hỏi và phương án được xáo trộn.
              </p>
            </div>

            {/* Bước 5 */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  5
                </span>
                <span className="font-bold text-slate-900">
                  Giám sát song song qua NetSupport School và SMART TEST 7
                </span>
              </div>
              <p className="text-slate-600 pl-7">
                Giáo viên theo dõi tiến độ số câu đã làm và đồng hồ đếm ngược trên bảng giám sát 60 máy của SMART TEST 7, kết hợp tính năng <strong>Monitor Mode / Thumbnail View</strong> của NetSupport School để ngăn ngừa học sinh mở tab khác.
              </p>
            </div>

            {/* Bước 6 */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                  6
                </span>
                <span className="font-bold text-slate-900">
                  Thu bài, khóa máy và xuất báo cáo điểm số Excel
                </span>
              </div>
              <p className="text-slate-600 pl-7">
                Khi hết giờ, hệ thống tự động khóa bài và nộp về máy chủ. Giáo viên bấm <strong>"Thu bài cả phòng"</strong>, sau đó dùng NetSupport School để đóng trình duyệt học sinh hoặc tắt máy đồng loạt. Tải ngay file Excel kết quả 3 sheet.
              </p>
            </div>
          </div>
        </div>

        {/* Lưu ý tường lửa Windows 10 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start space-x-2.5">
          <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Lưu ý cấu hình Tường lửa Windows 10 (Firewall):</span>
            <p>
              Nếu máy học sinh không mở được địa chỉ IP của máy giáo viên, vui lòng vào Windows Defender Firewall trên máy giáo viên ➔ Chọn <strong>"Allow an app through firewall"</strong> ➔ Cho phép cổng <strong>{serverPort}</strong> hoặc ứng dụng Node.js trong mạng Private Network.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs"
          >
            Đã hiểu hướng dẫn
          </button>
        </div>
      </div>
    </div>
  );
};
