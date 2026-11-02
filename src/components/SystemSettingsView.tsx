import React, { useState, useRef } from 'react';
import {
  Settings,
  Database,
  Download,
  Upload,
  RotateCcw,
  Wifi,
  Building,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Server,
} from 'lucide-react';
import { SystemConfig } from '../types';

interface SystemSettingsViewProps {
  config: SystemConfig;
  onSaveConfig: (config: SystemConfig) => void;
  onExportBackup: () => void;
  onImportBackup: (jsonString: string) => boolean;
  onResetDefaults: () => void;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({
  config,
  onSaveConfig,
  onExportBackup,
  onImportBackup,
  onResetDefaults,
}) => {
  const [serverIp, setServerIp] = useState(config.serverIp);
  const [serverPort, setServerPort] = useState(config.serverPort);
  const [schoolName, setSchoolName] = useState(config.schoolName);
  const [subjectName, setSubjectName] = useState(config.subjectName);
  const [autoSaveInterval, setAutoSaveInterval] = useState(config.autoSaveIntervalSeconds);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveSettings = () => {
    onSaveConfig({
      ...config,
      serverIp: serverIp.trim(),
      serverPort: Number(serverPort),
      schoolName: schoolName.trim(),
      subjectName: subjectName.trim(),
      autoSaveIntervalSeconds: Number(autoSaveInterval),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
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
          alert('Phục hồi dữ liệu từ bản sao lưu thành công!');
        } else {
          alert('Tệp sao lưu không hợp lệ hoặc bị lỗi định dạng!');
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
            <span>Cài đặt hệ thống, Mạng LAN & Sao lưu phục hồi</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tùy biến địa chỉ máy chủ, thông tin trường học và toàn vẹn cơ sở dữ liệu
          </p>
        </div>
      </div>

      {savedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Đã lưu thành công cấu hình hệ thống!</span>
        </div>
      )}

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
              placeholder="Ví dụ: Trường THCS Nguyễn Du"
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
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors"
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
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-blue-50/50 flex flex-col items-center justify-center text-center space-y-2 transition-all"
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
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Bạn có chắc chắn muốn nạp lại bộ dữ liệu mẫu ban đầu (60 học sinh lớp 7A, 7B và ngân hàng câu hỏi chuẩn Sách bài tập Tin học 7)?'
                )
              ) {
                onResetDefaults();
                alert('Đã khôi phục dữ liệu mẫu kiểm thử thành công!');
              }
            }}
            className="p-4 rounded-xl border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/50 flex flex-col items-center justify-center text-center space-y-2 transition-all"
          >
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
              <RotateCcw className="w-5 h-5" />
            </div>
            <span className="font-bold text-xs text-slate-800">Nạp lại dữ liệu mẫu 60 HS</span>
            <span className="text-[11px] text-slate-500">Dữ liệu kiểm thử chuẩn</span>
          </button>
        </div>
      </div>
    </div>
  );
};
