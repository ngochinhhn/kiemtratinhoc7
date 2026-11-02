import React, { useState, useRef } from 'react';
import {
  Settings,
  Database,
  Download,
  Upload,
  RotateCcw,
  Wifi,
  Building,
  CheckCircle2,
  AlertTriangle,
  CloudUpload,
  RefreshCw,
} from 'lucide-react';
import { SystemConfig } from '../types';

interface SystemSettingsViewProps {
  config: SystemConfig;
  stats: {
    questionsCount: number;
    classesCount: number;
    studentsCount: number;
    examsCount: number;
  };
  lastRepoSyncAt: string | null;
  onSaveConfig: (config: SystemConfig) => void;
  onSyncToRepo: () => Promise<boolean>;
  onExportBackup: () => void;
  onImportBackup: (jsonString: string) => boolean;
  onResetDefaults: () => void;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({
  config,
  stats,
  lastRepoSyncAt,
  onSaveConfig,
  onSyncToRepo,
  onExportBackup,
  onImportBackup,
  onResetDefaults,
}) => {
  const [serverIp, setServerIp] = useState(config.serverIp);
  const [serverPort, setServerPort] = useState(config.serverPort);
  const [schoolName, setSchoolName] = useState(config.schoolName);
  const [subjectName, setSubjectName] = useState(config.subjectName);
  const [autoSaveInterval, setAutoSaveInterval] = useState(config.autoSaveIntervalSeconds);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSyncingRepo, setIsSyncingRepo] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setStatusBanner({ type, message });
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const handleSaveSettings = () => {
    onSaveConfig({
      ...config,
      serverIp: serverIp.trim(),
      serverPort: Number(serverPort),
      schoolName: schoolName.trim(),
      subjectName: subjectName.trim(),
      autoSaveIntervalSeconds: Number(autoSaveInterval),
    });
    showBanner(
      'success',
      'Đã lưu thành công cấu hình hệ thống và đồng bộ vào gói Publish GitHub!'
    );
  };

  const handleSyncGithubClick = async () => {
    setIsSyncingRepo(true);
    const ok = await onSyncToRepo();
    setIsSyncingRepo(false);
    if (ok) {
      showBanner(
        'success',
        `Đã đóng gói toàn bộ dữ liệu hiện tại (${stats.questionsCount} câu hỏi, ${stats.classesCount} lớp, ${stats.studentsCount} học sinh, ${stats.examsCount} đề thi) vào mã nguồn để sẵn sàng Publish lên GitHub!`
      );
    } else {
      showBanner(
        'error',
        'Đang chạy ở môi trường tĩnh (chỉ đọc). Bạn có thể tải tệp sao lưu (.json) bên dưới.'
      );
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = onImportBackup(content);
        if (success) {
          showBanner(
            'success',
            'Phục hồi dữ liệu từ bản sao lưu thành công và đã đồng bộ vào gói đóng gói GitHub!'
          );
        } else {
          showBanner('error', 'Tệp sao lưu không hợp lệ hoặc bị lỗi định dạng!');
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Tiêu đề */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <span>Cài đặt hệ thống, Đóng gói GitHub &amp; Sao lưu phục hồi</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tự động đồng bộ toàn bộ dữ liệu đã chỉnh sửa trên Preview vào gói mã nguồn để Publish lên GitHub
          </p>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 border ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {statusBanner.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span className="font-semibold">{statusBanner.message}</span>
        </div>
      )}

      {/* ĐỒNG BỘ DỮ LIỆU ĐÓNG GÓI LÊN GITHUB (QUAN TRỌNG) */}
      <div
        data-testid="github-sync-card"
        className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 p-6 rounded-xl border border-emerald-300 shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/80 pb-3">
          <div className="space-y-1">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
              <CloudUpload className="w-5 h-5 text-emerald-700" />
              <span>Đồng bộ dữ liệu Preview vào bản đóng gói Publish GitHub</span>
            </h2>
            <p className="text-xs text-slate-600">
              Mọi thay đổi về <strong>Câu hỏi, Lớp, Học sinh, Đề thi</strong> trên chế độ Preview đều được tự động lưu vào file mã nguồn <code>src/data/publishedData.json</code> để khi Publish lên GitHub sẽ giữ nguyên 100% dữ liệu mới nhất của thầy.
            </p>
          </div>

          <button
            type="button"
            data-testid="btn-sync-github-package"
            disabled={isSyncingRepo}
            onClick={handleSyncGithubClick}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm flex items-center space-x-1.5 shrink-0 cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingRepo ? 'animate-spin' : ''}`} />
            <span>
              {isSyncingRepo
                ? 'Đang đóng gói dữ liệu...'
                : 'Cập nhật gói Publish GitHub ngay'}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/90 border border-emerald-200 rounded-lg p-3">
            <span className="text-slate-500 block text-[11px]">Ngân hàng câu hỏi</span>
            <strong className="text-base font-black text-slate-800">
              {stats.questionsCount} câu
            </strong>
          </div>
          <div className="bg-white/90 border border-emerald-200 rounded-lg p-3">
            <span className="text-slate-500 block text-[11px]">Danh sách lớp học</span>
            <strong className="text-base font-black text-slate-800">
              {stats.classesCount} lớp
            </strong>
          </div>
          <div className="bg-white/90 border border-emerald-200 rounded-lg p-3">
            <span className="text-slate-500 block text-[11px]">Danh sách học sinh</span>
            <strong className="text-base font-black text-slate-800">
              {stats.studentsCount} học sinh
            </strong>
          </div>
          <div className="bg-white/90 border border-emerald-200 rounded-lg p-3">
            <span className="text-slate-500 block text-[11px]">Đề kiểm tra</span>
            <strong className="text-base font-black text-slate-800">
              {stats.examsCount} đề thi
            </strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-900 bg-emerald-100/70 px-3.5 py-2 rounded-lg border border-emerald-200">
          <span className="font-semibold flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>
              Trạng thái mã nguồn đóng gói (<code>src/data/publishedData.json</code>): Đã đồng bộ tự động
            </span>
          </span>
          {lastRepoSyncAt && (
            <span className="font-mono text-emerald-800">
              Cập nhật lúc: {new Date(lastRepoSyncAt).toLocaleString('vi-VN')}
            </span>
          )}
        </div>
      </div>

      {/* Cấu hình địa chỉ mạng LAN */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2 border-b pb-3">
          <Wifi className="w-4 h-4 text-blue-600" />
          <span>Cấu hình địa chỉ truy cập phòng máy LAN</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Địa chỉ IP máy chủ giáo viên (IPv4):
            </label>
            <input
              type="text"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
              placeholder="Ví dụ: 192.168.1.10"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Mở <code>cmd</code> gõ lệnh <code>ipconfig</code> trên máy giáo viên để xem địa chỉ IP
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Cổng dịch vụ (Port):
            </label>
            <input
              type="number"
              value={serverPort}
              onChange={(e) => setServerPort(Number(e.target.value))}
              placeholder="3000"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Mặc định cổng 3000 cho máy chủ nội bộ Node.js
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-900">
          Địa chỉ đầy đủ học sinh truy cập:{' '}
          <code className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-blue-300 text-blue-700">
            http://{serverIp}:{serverPort}
          </code>
        </div>
      </div>

      {/* Cấu hình trường học & môn học */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2 border-b pb-3">
          <Building className="w-4 h-4 text-blue-600" />
          <span>Thông tin đơn vị và môn học</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Tên trường THCS:
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="Ví dụ: Trường TH & THCS Thụy Lâm"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Tên môn học:
            </label>
            <input
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="Tin học 7 - Bộ sách Kết nối tri thức với cuộc sống"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSaveSettings}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Lưu thay đổi cài đặt
          </button>
        </div>
      </div>

      {/* Sao lưu và phục hồi dữ liệu */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2 border-b pb-3">
          <Database className="w-4 h-4 text-blue-600" />
          <span>Sao lưu và phục hồi cơ sở dữ liệu</span>
        </h2>

        <p className="text-xs text-slate-600">
          Xuất toàn bộ ngân hàng câu hỏi, danh sách học sinh, cấu hình đề thi và bảng điểm ra tệp JSON sao lưu an toàn để lưu trữ vào USB hoặc ổ cứng ngoài.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Nút Sao lưu */}
          <button
            onClick={onExportBackup}
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/50 flex flex-col items-center justify-center text-center space-y-2 transition-all cursor-pointer"
          >
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
              <Download className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-slate-800">Tải tệp sao lưu (.json)</span>
            <span className="text-[11px] text-slate-500">Sao lưu an toàn hệ thống</span>
          </button>

          {/* Nút Phục hồi */}
          <label className="p-4 rounded-xl border border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/50 flex flex-col items-center justify-center text-center space-y-2 cursor-pointer transition-all">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
              <Upload className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-slate-800">Phục hồi từ bản sao lưu</span>
            <span className="text-[11px] text-slate-500">Tải file .json đã lưu</span>
          </label>

          {/* Nút Khôi phục dữ liệu mẫu */}
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="p-4 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 flex flex-col items-center justify-center text-center space-y-2 transition-all cursor-pointer"
            >
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
                <RotateCcw className="w-5 h-5" />
              </div>
              <span className="font-bold text-xs text-slate-800">Nạp lại dữ liệu gốc</span>
              <span className="text-[11px] text-slate-500">Khôi phục bản chuẩn</span>
            </button>
          ) : (
            <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 flex flex-col items-center justify-center text-center space-y-2">
              <span className="font-bold text-xs text-amber-900">
                Xác nhận nạp lại dữ liệu gốc?
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    onResetDefaults();
                    setConfirmReset(false);
                    showBanner('success', 'Đã khôi phục dữ liệu gốc thành công!');
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  Đồng ý
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
