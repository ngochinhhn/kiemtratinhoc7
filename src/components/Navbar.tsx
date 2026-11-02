import React from 'react';
import {
  Monitor,
  GraduationCap,
  ShieldCheck,
  Wifi,
  BookOpen,
  Users,
  FileSpreadsheet,
  BarChart3,
  Settings,
  HelpCircle,
  PlayCircle,
  LogOut,
  Info,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Role, Student } from '../types';

interface NavbarProps {
  currentRole: Role;
  setCurrentRole: (role: Role) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  serverIp: string;
  serverPort: number;
  schoolName: string;
  loggedInStudent?: Student | null;
  onOpenNetSupportGuide: () => void;
  onOpenHelpModal: () => void;
  onLogout: () => void | Promise<void>;
  onSyncData?: () => void | Promise<void>;
  isSyncingData?: boolean;
  isLoggingOut?: boolean;
  lastRepoSyncAt?: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  activeTab,
  setActiveTab,
  serverIp,
  serverPort,
  schoolName,
  loggedInStudent,
  onOpenNetSupportGuide,
  onOpenHelpModal,
  onLogout,
  onSyncData,
  isSyncingData = false,
  isLoggingOut = false,
  lastRepoSyncAt,
}) => {
  return (
    <header className="bg-blue-800 text-white shadow-md sticky top-0 z-40 border-b border-blue-900">
      {/* Top bar: Tên hệ thống, trường học, IP LAN, Trợ giúp và Đăng xuất */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between min-h-14 py-2 gap-2">
          {/* Logo & Tên ứng dụng */}
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="bg-white text-blue-800 p-1.5 rounded-lg shadow-sm font-black flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-blue-700" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white whitespace-nowrap">
                  SMART TEST 7
                </span>
                <span className="bg-blue-600 text-blue-100 text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase whitespace-nowrap">
                  Tin học 7 KNTT
                </span>
              </div>
              <p className="text-[11px] text-blue-200 font-medium truncate">
                {schoolName} • LAN
              </p>
            </div>
          </div>

          {/* Địa chỉ truy cập LAN phòng máy & Nút mở NetSupport (hiển thị trên màn hình lớn cho Giáo viên) */}
          {currentRole === 'giaovien' && (
            <div className="hidden xl:flex items-center space-x-2">
              <div className="bg-blue-900/80 border border-blue-700/60 rounded-md px-2.5 py-1 flex items-center space-x-1.5 text-xs">
                <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
                <span className="text-blue-200 whitespace-nowrap">Địa chỉ thi LAN:</span>
                <code className="bg-blue-950 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold select-all whitespace-nowrap">
                  http://{serverIp}:{serverPort}
                </code>
              </div>

              <button
                onClick={onOpenNetSupportGuide}
                className="bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium px-2.5 py-1.5 rounded-md flex items-center space-x-1.5 transition-colors border border-blue-500 shadow-sm cursor-pointer whitespace-nowrap"
                title="Hướng dẫn triển khai qua phần mềm NetSupport School"
              >
                <Monitor className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>NetSupport School</span>
              </button>
            </div>
          )}

          {/* Thông tin phiên đăng nhập, trạng thái tự động lưu Data, nút Trợ giúp & Đăng xuất */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {/* Nút / Trạng thái tự động lưu Data vào thư mục src/data/ cho Giáo viên */}
            {currentRole === 'giaovien' && onSyncData && (
              <button
                type="button"
                data-testid="navbar-btn-sync-data"
                onClick={onSyncData}
                disabled={isSyncingData || isLoggingOut}
                className="bg-emerald-700/90 hover:bg-emerald-600 disabled:opacity-75 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center space-x-1 border border-emerald-500/80 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
                title={
                  lastRepoSyncAt
                    ? `Tự động lưu vào Data (seedQuestions.ts, seedStudents.ts, seedExams.ts) • Lần cuối: ${new Date(
                        lastRepoSyncAt
                      ).toLocaleTimeString('vi-VN')}`
                    : 'Lưu và cập nhật toàn bộ dữ liệu vào thư mục Data'
                }
              >
                {isSyncingData ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-200 animate-spin shrink-0" />
                    <span>Đang lưu Data...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                    <span>Đã lưu Data</span>
                  </>
                )}
              </button>
            )}

            {/* Nút Trợ giúp nhanh trên thanh tiêu đề */}
            <button
              type="button"
              data-testid="navbar-btn-help"
              onClick={() => {
                if (currentRole === 'giaovien') {
                  setActiveTab('trogiup');
                } else {
                  onOpenHelpModal();
                }
              }}
              className="bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center space-x-1 border border-blue-500 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
              title="Xem Hướng dẫn sử dụng và Thông tin tác giả"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Trợ giúp</span>
            </button>

            {/* Hiển thị vai trò đang đăng nhập */}
            <div className="hidden sm:flex bg-blue-950/70 px-2.5 py-1.5 rounded-lg border border-blue-700 items-center space-x-1.5 text-xs whitespace-nowrap">
              {currentRole === 'giaovien' ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span className="font-bold text-white">Giáo viên: Admin</span>
                </>
              ) : (
                <>
                  <Monitor className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-bold text-white truncate max-w-[140px]">
                    {loggedInStudent ? `HS: ${loggedInStudent.fullName}` : 'Chế độ Học sinh'}
                  </span>
                </>
              )}
            </div>

            {/* Nút Đăng xuất về cửa sổ đăng nhập (Tự động lưu Data trước khi thoát tài khoản Giáo viên) */}
            <button
              type="button"
              data-testid="navbar-btn-logout"
              onClick={onLogout}
              disabled={isLoggingOut}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-75 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center space-x-1 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
              title="Tự động lưu cập nhật vào Data và đăng xuất khỏi phiên làm việc"
            >
              {isLoggingOut ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Đang lưu Data &amp; thoát...</span>
                </>
              ) : (
                <>
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>Đăng xuất</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Menu chức năng giáo viên: Thu gọn để toàn bộ 8 mục (kể cả Trợ giúp) nằm trên cùng 1 dòng từ màn hình md trở lên */}
      {currentRole === 'giaovien' && (
        <nav className="bg-blue-900 border-t border-blue-800" aria-label="Menu chức năng giáo viên">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
            <div
              data-testid="teacher-nav-row"
              className="grid grid-cols-2 sm:grid-cols-4 md:flex md:flex-nowrap md:items-center md:justify-between gap-1 py-1"
            >
              <button
                data-testid="tab-tongquan"
                onClick={() => setActiveTab('tongquan')}
                title="Tổng quan hệ thống"
                className={`px-2 lg:px-2.5 py-1.5 rounded-md text-[11px] xl:text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'tongquan'
                    ? 'bg-blue-600 text-white shadow-inner'
                    : 'text-blue-100 hover:bg-blue-800'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0 hidden lg:inline-block" />
                <span>Tổng quan</span>
              </button>

              <button
                data-testid="tab-nganhang"
                onClick={() => setActiveTab('nganhang')}
                title="Ngân hàng câu hỏi & PDF"
                className={`px-2 lg:px-2.5 py-1.5 rounded-md text-[11px] xl:text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'nganhang'
                    ? 'bg-blue-600 text-white shadow-inner'
                    : 'text-blue-100 hover:bg-blue-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0 hidden lg:inline-block" />
                <span className="hidden xl:inline">Ngân hàng câu hỏi &amp; PDF</span>
                <span className="xl:hidden">Ngân hàng &amp; PDF</span>
              </button>

              <button
                data-testid="tab-hocsinh"
                onClick={() => setActiveTab('hocsinh')}
                title="Quản lý học sinh & Excel"
                className={`px-2 lg:px-2.5 py-1.5 rounded-md text-[11px] xl:text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'hocsinh'
                    ? 'bg-blue-600 text-white shadow-inner'
                    : 'text-blue-100 hover:bg-blue-800'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0 hidden lg:inline-block" />
                <span className="hidden xl:inline">Quản lý học sinh &amp; Excel</span>
                <span className="xl:hidden">Học sinh &amp; Excel</span>
              </button>

              <button
                data-testid="tab-dethi"
                onClick={() => setActiveTab('dethi')}
                title="Tạo đề & Đảo đề"
                className={`px-2 lg:px-2.5 py-1.5 rounded-md text-[11px] xl:text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'dethi'
                    ? 'bg-blue-600 text-white shadow-inner'
                    : 'text-blue-100 hover:bg-blue-800'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 hidden lg:inline-block" />
                <span>Tạo đề &amp; Đảo đề</span>
              </button>

              <button
                data-testid="tab-giamsat"
                onClick={() => setActiveTab('giamsat')}
                title="Giám sát phòng thi (60 máy)"
                className={`px-2 lg:px-2.5 py-1.5 rounded-md text-[11px] xl:text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'giamsat'
                    ? 'bg-blue-600 text-white shadow-inner'
                    : 'text-blue-100 hover:bg-blue-800'
                }`}
              >
                <PlayCircle className="w-3.5 h-3.5 text-emerald-300 shrink-0 hidden lg:inline-block" />
                <span className="hidden 2xl:inline">Giám sát phòng thi (60 máy)</span>
                <span className="2xl:hidden">Giám sát phòng thi</span>
              </button>

              <button
                data-testid="tab-ketqua"
                onClick={() => setActiveTab('ketqua')}
                title="Bảng điểm & Xuất Excel"
                className={`px-2 lg:px-2.5 py-1.5 rounded-md text-[11px] xl:text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'ketqua'
                    ? 'bg-blue-600 text-white shadow-inner'
                    : 'text-blue-100 hover:bg-blue-800'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0 hidden lg:inline-block" />
                <span className="hidden xl:inline">Bảng điểm &amp; Xuất Excel</span>
                <span className="xl:hidden">Bảng điểm &amp; Excel</span>
              </button>

              <button
                data-testid="tab-caidat"
                onClick={() => setActiveTab('caidat')}
                title="Cài đặt & Sao lưu"
                className={`px-2 lg:px-2.5 py-1.5 rounded-md text-[11px] xl:text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'caidat'
                    ? 'bg-blue-600 text-white shadow-inner'
                    : 'text-blue-100 hover:bg-blue-800'
                }`}
              >
                <Settings className="w-3.5 h-3.5 shrink-0 hidden lg:inline-block" />
                <span>Cài đặt &amp; Sao lưu</span>
              </button>

              <button
                data-testid="tab-trogiup"
                onClick={() => setActiveTab('trogiup')}
                title="Trợ giúp & Thông tin tác giả"
                className={`px-2 lg:px-2.5 py-1.5 rounded-md text-[11px] xl:text-xs font-semibold flex items-center justify-center space-x-1 whitespace-nowrap transition-colors cursor-pointer ${
                  activeTab === 'trogiup'
                    ? 'bg-blue-600 text-white shadow-inner'
                    : 'text-blue-100 hover:bg-blue-800'
                }`}
              >
                <Info className="w-3.5 h-3.5 text-amber-300 shrink-0 hidden lg:inline-block" />
                <span>Trợ giúp</span>
              </button>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
};
