import React, { useState, useRef } from 'react';
import {
  Users,
  FileSpreadsheet,
  Download,
  Upload,
  Search,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  X,
  Plus,
  Trash2,
  FolderPlus,
  FolderMinus,
  FolderUp,
  CheckSquare,
  Square,
  FileUp,
  Loader2,
  KeyRound,
  FolderOpen,
  Info,
  Check,
  FileText,
} from 'lucide-react';
import { Exam, Student, StudentExamSession } from '../types';
import {
  downloadSampleStudentExcel,
  downloadSampleClassListExcel,
  exportStudentAccountsExcel,
  parseStudentsFromExcelBuffer,
  parseClassesFromExcelBuffer,
  normalizeClassName,
  ParsedStudentFromExcel,
} from '../utils/excelExport';
import {
  DEFAULT_STUDENT_PASSWORD_HASH,
  generateUniqueLoginCodes,
} from '../utils/studentCode';

interface StudentManagementViewProps {
  students: Student[];
  classes: string[];
  exams?: Exam[];
  sessions?: Record<string, StudentExamSession>;
  schoolName: string;
  onSaveStudents: (students: Student[]) => void;
  onCreateClass: (className: string) => boolean;
  onAddClasses?: (classNames: string[]) => { added: string[]; skipped: string[] };
  onDeleteClass: (className: string, deleteStudents: boolean) => void;
  onBatchDeleteStudents: (studentIds: string[]) => void;
}

export const StudentManagementView: React.FC<StudentManagementViewProps> = ({
  students,
  classes,
  exams = [],
  sessions = {},
  schoolName,
  onSaveStudents,
  onCreateClass,
  onAddClasses,
  onDeleteClass,
  onBatchDeleteStudents,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showBanner = (message: string, type: 'success' | 'error' = 'success') => {
    setStatusBanner({ type, message });
  };

  // Chọn hàng loạt học sinh
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);

  // Modal 1: Tạo 1 lớp trống thủ công
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [newClassNameInput, setNewClassNameInput] = useState('');
  const [createClassError, setCreateClassError] = useState('');

  // Modal 2: Tạo danh sách lớp (Upload file Excel hoặc nhập nhanh danh sách)
  const [isBatchClassModalOpen, setIsBatchClassModalOpen] = useState(false);
  const [classImportTab, setClassImportTab] = useState<'excel' | 'text'>('excel');
  const [isParsingClassExcel, setIsParsingClassExcel] = useState(false);
  const [classExcelFileName, setClassExcelFileName] = useState<string | null>(null);
  const [classExcelFileSize, setClassExcelFileSize] = useState<string | null>(null);
  const [parsedClassNames, setParsedClassNames] = useState<string[]>([]);
  const [rawClassListText, setRawClassListText] = useState('');
  const [isDragOverClassExcel, setIsDragOverClassExcel] = useState(false);

  // Modal 3: Xóa lớp
  const [isDeleteClassModalOpen, setIsDeleteClassModalOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<string>('');
  const [deleteStudentsWithClass, setDeleteStudentsWithClass] = useState(true);

  // Modal 4: Upload danh sách học sinh từ file Excel cho lớp
  const [isExcelUploadModalOpen, setIsExcelUploadModalOpen] = useState(false);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [excelFileSize, setExcelFileSize] = useState<string | null>(null);
  const [targetClassForExcel, setTargetClassForExcel] = useState<string>('7A');
  const [assignAllToTargetClass, setAssignAllToTargetClass] = useState<boolean>(true);
  const [excelPreviewStudents, setExcelPreviewStudents] = useState<Student[]>([]);
  const [excelErrors, setExcelErrors] = useState<string[]>([]);
  const [isDragOverExcel, setIsDragOverExcel] = useState(false);

  // Modal 5: Thêm 1 học sinh thủ công
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newClassName, setNewClassName] = useState('7A');
  const [newStudentIdCode, setNewStudentIdCode] = useState('');

  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const classExcelFileInputRef = useRef<HTMLInputElement>(null);

  // Lọc danh sách học sinh
  const filteredStudents = students.filter((s) => {
    const matchSearch =
      s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.loginCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.studentIdCode && s.studentIdCode.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchClass = selectedClass === 'all' || s.className === selectedClass;
    return matchSearch && matchClass;
  });

  // Chọn / bỏ chọn 1 học sinh
  const handleToggleSelectStudent = (id: string) => {
    const next = new Set(selectedStudentIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedStudentIds(next);
  };

  // Chọn / bỏ chọn tất cả học sinh đang hiển thị
  const isAllSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedStudentIds.has(s.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedStudentIds(new Set());
    } else {
      const next = new Set(selectedStudentIds);
      filteredStudents.forEach((s) => next.add(s.id));
      setSelectedStudentIds(next);
    }
  };

  // Thực hiện xóa hàng loạt học sinh đã chọn
  const handleConfirmBatchDelete = () => {
    const ids = Array.from(selectedStudentIds);
    onBatchDeleteStudents(ids);
    setSelectedStudentIds(new Set());
    setIsBatchDeleteModalOpen(false);
    showBanner(`Đã xóa ${ids.length} học sinh khỏi danh sách.`);
  };

  // Đặt lại mật khẩu hàng loạt về 123456
  const handleBatchResetPassword = () => {
    if (selectedStudentIds.size === 0) return;
    const updated = students.map((s) =>
      selectedStudentIds.has(s.id)
        ? { ...s, passwordHash: DEFAULT_STUDENT_PASSWORD_HASH }
        : s
    );
    onSaveStudents(updated);
    showBanner(`Đã đặt lại mật khẩu về 123456 cho ${selectedStudentIds.size} học sinh thành công!`);
  };

  // Đặt lại mật khẩu 1 học sinh
  const handleResetPassword = (studentId: string, studentName: string) => {
    const updated = students.map((s) =>
      s.id === studentId ? { ...s, passwordHash: DEFAULT_STUDENT_PASSWORD_HASH } : s
    );
    onSaveStudents(updated);
    showBanner(`Đã đặt lại mật khẩu cho học sinh "${studentName}" thành: 123456`);
  };

  // Xóa 1 học sinh
  const handleDeleteStudent = (studentId: string) => {
    const updated = students.filter((s) => s.id !== studentId);
    onSaveStudents(updated);
    const nextSelected = new Set(selectedStudentIds);
    nextSelected.delete(studentId);
    setSelectedStudentIds(nextSelected);
    showBanner('Đã xóa học sinh khỏi danh sách lớp.');
  };

  // 1. Xử lý tạo 1 lớp trống thủ công
  const handleCreateClassSubmit = () => {
    const trimmed = normalizeClassName(newClassNameInput);
    if (!trimmed) {
      setCreateClassError('Vui lòng nhập tên lớp (Ví dụ: 7A1, 7B, 7C...)');
      return;
    }
    if (classes.includes(trimmed)) {
      setCreateClassError(`Lớp ${trimmed} đã tồn tại trong hệ thống!`);
      return;
    }

    const success = onCreateClass(trimmed);
    if (success) {
      setIsCreateClassModalOpen(false);
      setNewClassNameInput('');
      setCreateClassError('');
      setSelectedClass(trimmed);
      showBanner(
        `Đã tạo lớp trống "${trimmed}" thành công! Bạn có thể tải lên danh sách học sinh cho lớp này.`
      );
    }
  };

  // 2. Xử lý đọc file Excel danh sách lớp
  const handleProcessClassExcelFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      showBanner('Vui lòng chọn tệp bảng tính Excel (.xlsx hoặc .xls)!', 'error');
      return;
    }

    try {
      setIsParsingClassExcel(true);
      setClassExcelFileName(file.name);
      setClassExcelFileSize(`${(file.size / 1024).toFixed(1)} KB`);

      const buffer = await file.arrayBuffer();
      const result = await parseClassesFromExcelBuffer(buffer);

      if (result.classes.length === 0) {
        showBanner('Không tìm thấy tên lớp học hợp lệ trong tệp Excel.', 'error');
        setIsParsingClassExcel(false);
        return;
      }

      setParsedClassNames(result.classes);
      setIsParsingClassExcel(false);
    } catch (err: any) {
      console.error('Lỗi đọc tệp Excel danh sách lớp:', err);
      setIsParsingClassExcel(false);
      showBanner(
        `Lỗi khi đọc file Excel danh sách lớp: ${err.message || 'Không thể đọc tệp'}`,
        'error'
      );
    }
  };

  // Xử lý phân tích văn bản danh sách lớp nhập nhanh
  const handleParseTextClassList = () => {
    if (!rawClassListText.trim()) {
      showBanner('Vui lòng nhập hoặc dán danh sách các lớp học!', 'error');
      return;
    }
    const lines = rawClassListText
      .split(/[\n,;]+/)
      .map((l) => normalizeClassName(l))
      .filter((l) => l.length > 0);

    const unique = Array.from(new Set(lines)).sort();
    if (unique.length === 0) {
      showBanner('Không tìm thấy tên lớp hợp lệ.', 'error');
      return;
    }
    setParsedClassNames(unique);
  };

  // Xác nhận khởi tạo các lớp trống hàng loạt
  const handleSaveBatchClasses = () => {
    if (parsedClassNames.length === 0) return;

    if (onAddClasses) {
      const res = onAddClasses(parsedClassNames);
      setIsBatchClassModalOpen(false);
      const firstNew = res.added[0] || parsedClassNames[0];
      setSelectedClass(firstNew);
      showBanner(
        `Đã khởi tạo thành công ${res.added.length} lớp trống mới (${res.added.join(', ')}).${
          res.skipped.length > 0 ? ` Đã bỏ qua ${res.skipped.length} lớp đã có sẵn.` : ''
        }`
      );
    } else {
      let count = 0;
      parsedClassNames.forEach((c) => {
        if (!classes.includes(c)) {
          onCreateClass(c);
          count++;
        }
      });
      setIsBatchClassModalOpen(false);
      setSelectedClass(parsedClassNames[0]);
      showBanner(`Đã khởi tạo thành công ${count} lớp trống mới!`);
    }

    setParsedClassNames([]);
    setClassExcelFileName(null);
    setRawClassListText('');
  };

  // 3. Xử lý xác nhận xóa lớp
  const handleConfirmDeleteClass = () => {
    if (!classToDelete) return;
    onDeleteClass(classToDelete, deleteStudentsWithClass);
    setIsDeleteClassModalOpen(false);
    setClassToDelete('');
    if (selectedClass === classToDelete) {
      setSelectedClass('all');
    }
    showBanner(`Đã xóa lớp ${classToDelete}.`);
  };

  // 4. Mở modal tải học sinh cho lớp cụ thể
  const handleOpenStudentUploadForClass = (targetClass: string) => {
    const cls = targetClass !== 'all' ? targetClass : (classes[0] || '7A');
    setTargetClassForExcel(cls);
    setAssignAllToTargetClass(true);
    setExcelPreviewStudents([]);
    setExcelFileName(null);
    setExcelErrors([]);
    setIsExcelUploadModalOpen(true);
  };

  // Xử lý đọc tệp Excel danh sách học sinh
  const handleProcessExcelFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      showBanner('Vui lòng chọn tệp bảng tính Excel (.xlsx hoặc .xls)!', 'error');
      return;
    }

    try {
      setIsParsingExcel(true);
      setExcelFileName(file.name);
      setExcelFileSize(`${(file.size / 1024).toFixed(1)} KB`);

      const buffer = await file.arrayBuffer();
      const defaultCls = targetClassForExcel || (selectedClass !== 'all' ? selectedClass : '7A');
      const overrideCls = assignAllToTargetClass ? targetClassForExcel : null;

      const result = await parseStudentsFromExcelBuffer(buffer, defaultCls, overrideCls);
      setExcelErrors(result.errors);

      if (result.students.length === 0) {
        showBanner('Không tìm thấy dữ liệu học sinh hợp lệ trong tệp Excel.', 'error');
        setIsParsingExcel(false);
        return;
      }

      // Tự động tạo mã đăng nhập duy nhất
      const existingCodes = new Set(students.map((s) => s.loginCode));
      const generatedCodes = generateUniqueLoginCodes(result.students, existingCodes);

      const parsed: Student[] = result.students.map((r, idx) => ({
        id: `hs_excel_${Date.now()}_${idx}`,
        studentIdCode: r.studentIdCode,
        fullName: r.fullName,
        normalizedName: r.fullName,
        loginCode: generatedCodes[idx],
        passwordHash: DEFAULT_STUDENT_PASSWORD_HASH,
        className: r.className || defaultCls,
        workstationNumber: (idx % 60) + 1,
        createdAt: new Date().toISOString(),
      }));

      setExcelPreviewStudents(parsed);
      setIsParsingExcel(false);
    } catch (err: any) {
      console.error('Lỗi đọc tệp Excel học sinh:', err);
      setIsParsingExcel(false);
      showBanner(`Lỗi khi đọc file Excel: ${err.message || 'Không thể phân tích dữ liệu'}`, 'error');
    }
  };

  const handleExcelFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessExcelFile(file);
    }
    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = '';
    }
  };

  // Xác nhận nhập học sinh từ Excel vào danh sách
  const handleSaveExcelStudents = () => {
    if (excelPreviewStudents.length === 0) return;

    // Tự động bổ sung các lớp mới nếu có trong tệp Excel
    excelPreviewStudents.forEach((s) => {
      if (!classes.includes(s.className)) {
        onCreateClass(s.className);
      }
    });

    const updated = [...students, ...excelPreviewStudents];
    onSaveStudents(updated);
    setIsExcelUploadModalOpen(false);

    // Chuyển view sang lớp vừa nạp học sinh
    const importedClass = excelPreviewStudents[0]?.className;
    if (importedClass) {
      setSelectedClass(importedClass);
    }

    setExcelPreviewStudents([]);
    setExcelFileName(null);
    showBanner(
      `Đã nhập thành công ${excelPreviewStudents.length} học sinh vào lớp ${targetClassForExcel}!`
    );
  };

  // Thêm 1 học sinh thủ công
  const handleAddSingleStudent = () => {
    if (!newFullName.trim()) {
      showBanner('Vui lòng nhập họ và tên học sinh', 'error');
      return;
    }

    const cls = normalizeClassName(newClassName) || '7A';
    if (!classes.includes(cls)) {
      onCreateClass(cls);
    }

    const existingCodes = new Set(students.map((s) => s.loginCode));
    const singleCode = generateUniqueLoginCodes(
      [{ fullName: newFullName, studentIdCode: newStudentIdCode }],
      existingCodes
    )[0];

    const newStudent: Student = {
      id: `hs_${Date.now()}`,
      studentIdCode:
        newStudentIdCode || `HS${cls}${String(students.length + 1).padStart(2, '0')}`,
      fullName: newFullName.trim(),
      normalizedName: newFullName.trim(),
      loginCode: singleCode,
      passwordHash: DEFAULT_STUDENT_PASSWORD_HASH,
      className: cls,
      workstationNumber: (students.length % 60) + 1,
      createdAt: new Date().toISOString(),
    };

    onSaveStudents([...students, newStudent]);
    setIsAddStudentOpen(false);
    setNewFullName('');
    setNewStudentIdCode('');
    setSelectedClass(cls);
    showBanner(`Đã thêm học sinh "${newStudent.fullName}" vào lớp ${cls}.`);
  };

  // Helper lấy điểm thi mới nhất hoặc điểm theo phiên của học sinh
  const getStudentDisplayScore = (student: Student) => {
    if (student.latestScore !== undefined) {
      return {
        score: student.latestScore,
        examTitle: student.latestExamTitle || 'Đã nộp bài',
        recordsCount: Object.keys(student.examScores || {}).length,
      };
    }
    // Kiểm tra trong sessions nếu có phiên đã nộp bài
    const studentSubmittedSessions = Object.values(sessions).filter(
      (s) => s && s.studentId === student.id && s.status === 'da_nop_bai' && s.score !== undefined
    );
    if (studentSubmittedSessions.length > 0) {
      const latestSess = studentSubmittedSessions[studentSubmittedSessions.length - 1];
      const exTitle = exams.find((e) => e.id === latestSess.examId)?.title || 'Đã nộp bài';
      return {
        score: latestSess.score!,
        examTitle: exTitle,
        recordsCount: studentSubmittedSessions.length,
      };
    }
    return null;
  };

  const selectedClassStudentCount =
    selectedClass === 'all'
      ? students.length
      : students.filter((s) => s.className === selectedClass).length;

  return (
    <div className="space-y-6">
      {statusBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
            statusBanner.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusBanner.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{statusBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KHỐI TIÊU ĐỀ & CÁC NÚT TÁC VỤ CHÍNH */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>Quản lý danh sách lớp, Học sinh &amp; Điểm kiểm tra</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tổng cộng: <strong>{students.length}</strong> học sinh trong{' '}
            <strong>{classes.length}</strong> lớp học • Điểm thi sau khi nộp bài được lưu trực tiếp vào danh sách lớp
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tải tệp mẫu Excel học sinh */}
          <button
            onClick={downloadSampleStudentExcel}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors border border-slate-300 cursor-pointer"
            title="Tải tệp mẫu Excel danh sách học sinh"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải Excel mẫu</span>
          </button>

          {/* Xuất danh sách lớp kèm điểm ra file Excel */}
          <button
            data-testid="btn-export-class-scores-excel"
            onClick={() =>
              exportStudentAccountsExcel(students, schoolName, exams, sessions, selectedClass)
            }
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
            title="Xuất danh sách lớp kèm điểm số các kỳ thi ra file Excel (.xlsx)"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>
              {selectedClass !== 'all'
                ? `Xuất DS Lớp ${selectedClass} & Điểm (.xlsx)`
                : 'Xuất DS Lớp & Điểm (.xlsx)'}
            </span>
          </button>

          {/* Upload file học sinh cho lớp đang chọn */}
          <button
            onClick={() =>
              handleOpenStudentUploadForClass(
                selectedClass !== 'all' ? selectedClass : classes[0] || '7A'
              )
            }
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <FileUp className="w-4 h-4" />
            <span>
              {selectedClass !== 'all'
                ? `Upload học sinh cho lớp ${selectedClass}`
                : 'Upload học sinh từ Excel'}
            </span>
          </button>

          {/* Thêm 1 học sinh thủ công */}
          <button
            onClick={() => {
              setNewClassName(selectedClass !== 'all' ? selectedClass : '7A');
              setIsAddStudentOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm học sinh</span>
          </button>
        </div>
      </div>

      {/* THANH QUẢN LÝ LỚP HỌC (TẠO TỪNG LỚP TRỐNG, UPLOAD DANH SÁCH LỚP, XÓA LỚP) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Danh mục thẻ lớp */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700 mr-1 flex items-center space-x-1">
              <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>Danh mục lớp:</span>
            </span>

            {/* Nút "Tất cả các lớp" */}
            <button
              onClick={() => setSelectedClass('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedClass === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Tất cả ({students.length})
            </button>

            {/* Thẻ từng lớp */}
            {classes.map((cls) => {
              const count = students.filter((s) => s.className === cls).length;
              const isSelected = selectedClass === cls;
              const isEmpty = count === 0;

              return (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : isEmpty
                      ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  title={isEmpty ? `Lớp ${cls} là lớp trống (chưa có học sinh)` : `Lớp ${cls} (${count} học sinh)`}
                >
                  <span>Lớp {cls}</span>
                  {isEmpty ? (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                        isSelected ? 'bg-amber-500 text-white' : 'bg-amber-200 text-amber-900'
                      }`}
                    >
                      Lớp trống
                    </span>
                  ) : (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected ? 'bg-blue-800 text-blue-100' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Các nút Khởi tạo lớp & Xóa lớp */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* 1. Tạo 1 lớp trống */}
            <button
              onClick={() => {
                setNewClassNameInput('');
                setCreateClassError('');
                setIsCreateClassModalOpen(true);
              }}
              className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Tạo từng lớp trống mới"
            >
              <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
              <span>+ Tạo 1 lớp trống</span>
            </button>

            {/* 2. Upload danh sách lớp (Excel / File) */}
            <button
              onClick={() => {
                setParsedClassNames([]);
                setClassExcelFileName(null);
                setRawClassListText('');
                setIsBatchClassModalOpen(true);
              }}
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Upload danh sách lớp từ file Excel hoặc nhập nhanh nhiều lớp"
            >
              <FolderUp className="w-3.5 h-3.5 text-indigo-600" />
              <span>Tải danh sách lớp (Excel/File)</span>
            </button>

            {/* 3. Xóa lớp đang chọn */}
            {selectedClass !== 'all' && (
              <button
                onClick={() => {
                  setClassToDelete(selectedClass);
                  setDeleteStudentsWithClass(true);
                  setIsDeleteClassModalOpen(true);
                }}
                className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                title={`Xóa lớp ${selectedClass}`}
              >
                <FolderMinus className="w-3.5 h-3.5 text-red-600" />
                <span>Xóa lớp {selectedClass}</span>
              </button>
            )}
          </div>
        </div>

        {/* BANNER THÔNG TIN LỚP ĐANG CHỌN */}
        {selectedClass !== 'all' && (
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-700">Đang chọn:</span>
              <span className="bg-blue-100 text-blue-900 font-extrabold px-2.5 py-0.5 rounded-md text-xs">
                Lớp {selectedClass}
              </span>
              <span className="text-slate-500">
                ({selectedClassStudentCount} học sinh
                {selectedClassStudentCount === 0 ? ' - Lớp trống' : ''})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  exportStudentAccountsExcel(students, schoolName, exams, sessions, selectedClass)
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Xuất file danh sách &amp; điểm lớp {selectedClass} (.xlsx)</span>
              </button>
              <button
                onClick={() => handleOpenStudentUploadForClass(selectedClass)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Upload file danh sách học sinh cho lớp {selectedClass}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* THANH TÁC VỤ HÀNG LOẠT (BULK ACTION BAR) - KHI CÓ HỌC SINH ĐƯỢC CHỌN */}
      {selectedStudentIds.size > 0 && (
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-3.5 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center space-x-3 text-xs">
            <span className="font-extrabold bg-white/20 px-2.5 py-1 rounded-lg">
              Đã chọn: {selectedStudentIds.size} / {filteredStudents.length} học sinh
            </span>
            <button
              onClick={() => setSelectedStudentIds(new Set())}
              className="text-blue-200 hover:text-white underline font-semibold cursor-pointer"
            >
              Bỏ chọn tất cả
            </button>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            {/* Đặt lại mật khẩu hàng loạt */}
            <button
              onClick={handleBatchResetPassword}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-300" />
              <span>Đặt lại mật khẩu (123456)</span>
            </button>

            {/* Xóa hàng loạt học sinh */}
            <button
              onClick={() => setIsBatchDeleteModalOpen(true)}
              className="bg-red-500 hover:bg-red-600 text-white font-extrabold px-3.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa {selectedStudentIds.size} học sinh đã chọn</span>
            </button>
          </div>
        </div>
      )}

      {/* NẾU LỚP ĐANG XEM LÀ LỚP TRỐNG (0 HỌC SINH), HIỂN THỊ EMPTY STATE CARD TRỰC QUAN */}
      {selectedClass !== 'all' && selectedClassStudentCount === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-blue-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100">
            <FolderPlus className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-extrabold text-slate-800">
              Lớp {selectedClass} hiện là lớp trống (chưa có học sinh)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Hãy tải lên tệp Excel danh sách học sinh của lớp này. Hệ thống sẽ tự động gán toàn bộ
              học sinh vào <strong>Lớp {selectedClass}</strong> và tạo mã đăng nhập đồng bộ.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => handleOpenStudentUploadForClass(selectedClass)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center space-x-2 shadow-sm transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Upload file danh sách học sinh cho lớp {selectedClass} (.xlsx)</span>
            </button>
            <button
              onClick={downloadSampleStudentExcel}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-4 py-2.5 rounded-xl border border-slate-300 flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải file Excel mẫu học sinh</span>
            </button>
          </div>
        </div>
      ) : (
        /* DANH SÁCH BẢNG HỌC SINH KHI CÓ DỮ LIỆU */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Thanh tìm kiếm và bộ lọc nhanh */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Tìm theo họ tên, mã đăng nhập, mã HS..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Hiển thị: <strong>{filteredStudents.length}</strong> / {students.length} học sinh
            </div>
          </div>

          {/* Bảng học sinh */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="p-1 rounded text-slate-500 hover:text-blue-600"
                      title={isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3 w-12 text-center">STT</th>
                  <th className="py-3 px-3">Mã HS</th>
                  <th className="py-3 px-4">Họ và tên học sinh</th>
                  <th className="py-3 px-4 text-center">Lớp</th>
                  <th className="py-3 px-4">Mã đăng nhập</th>
                  <th className="py-3 px-4">Mật khẩu ban đầu</th>
                  <th className="py-3 px-4 text-center">Điểm thi đã lưu</th>
                  <th className="py-3 px-4 text-center">Tác vụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p>Không tìm thấy học sinh nào phù hợp.</p>
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student, idx) => {
                    const isSelected = selectedStudentIds.has(student.id);
                    const scoreInfo = getStudentDisplayScore(student);
                    return (
                      <tr
                        key={student.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectStudent(student.id)}
                            className="p-1 rounded text-slate-500 hover:text-blue-600"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-center text-slate-400 font-mono">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-700">
                          {student.studentIdCode || '-'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">{student.fullName}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">
                            {student.className}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <code className="bg-emerald-50 text-emerald-800 font-mono font-bold px-2 py-0.5 rounded border border-emerald-200">
                            {student.loginCode}
                          </code>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-slate-500 font-mono">123456</span>
                        </td>
                        <td
                          data-testid={`student-score-cell-${student.loginCode}`}
                          className="py-3 px-4 text-center"
                        >
                          {scoreInfo ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold px-2.5 py-0.5 rounded-full text-xs">
                                {scoreInfo.score} điểm
                              </span>
                              <span
                                className="text-[10px] text-slate-500 truncate max-w-[160px] mt-0.5"
                                title={scoreInfo.examTitle}
                              >
                                {scoreInfo.examTitle}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">Chưa có điểm</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => handleResetPassword(student.id, student.fullName)}
                              className="text-amber-600 hover:text-amber-700 p-1.5 rounded hover:bg-amber-50 cursor-pointer"
                              title="Đặt lại mật khẩu về 123456"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(student.id)}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 cursor-pointer"
                              title="Xóa học sinh"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: TẠO 1 LỚP TRỐNG THỦ CÔNG */}
      {isCreateClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center space-x-2">
                <FolderPlus className="w-5 h-5 text-blue-600" />
                <span>Tạo 1 lớp trống mới</span>
              </h3>
              <button
                onClick={() => setIsCreateClassModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên lớp học mới <span className="text-red-500">*</span>:
                </label>
                <input
                  type="text"
                  value={newClassNameInput}
                  onChange={(e) => setNewClassNameInput(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: 7A1, 7A2, 7C, 7D..."
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm font-bold uppercase focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Lớp mới sẽ được tạo dưới dạng lớp trống (0 học sinh). Sau khi tạo, bạn có thể tải
                  danh sách học sinh cho lớp này.
                </p>
              </div>

              {createClassError && (
                <div className="text-red-600 font-semibold bg-red-50 p-2 rounded-lg border border-red-200">
                  {createClassError}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t">
              <button
                onClick={() => setIsCreateClassModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateClassSubmit}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm"
              >
                Tạo lớp trống
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TẢI DANH SÁCH LỚP (UPLOAD EXCEL HOẶC NHẬP NHANH DANH SÁCH) */}
      {isBatchClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center space-x-2">
                  <FolderUp className="w-5 h-5 text-indigo-600" />
                  <span>Tải danh sách các lớp học (Khởi tạo hàng loạt lớp trống)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Khởi tạo sẵn tất cả các lớp của khối 7 trước khi nạp danh sách học sinh cho từng lớp
                </p>
              </div>
              <button
                onClick={() => setIsBatchClassModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chuyển đổi tab: Upload Excel hoặc Nhập nhanh văn bản */}
            <div className="flex border-b border-slate-200 text-xs font-bold">
              <button
                onClick={() => setClassImportTab('excel')}
                className={`pb-2.5 px-4 border-b-2 flex items-center space-x-1.5 transition-colors ${
                  classImportTab === 'excel'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Tải tệp Excel danh sách lớp (.xlsx)</span>
              </button>
              <button
                onClick={() => setClassImportTab('text')}
                className={`pb-2.5 px-4 border-b-2 flex items-center space-x-1.5 transition-colors ${
                  classImportTab === 'text'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Nhập nhanh danh sách lớp (Gõ / Dán)</span>
              </button>
            </div>

            {/* TAB 1: UPLOAD TỆP EXCEL DANH SÁCH LỚP */}
            {classImportTab === 'excel' ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Chọn hoặc kéo thả tệp Excel danh sách lớp:</span>
                  <button
                    type="button"
                    onClick={downloadSampleClassListExcel}
                    className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải file Excel mẫu danh sách lớp</span>
                  </button>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverClassExcel(true);
                  }}
                  onDragLeave={() => setIsDragOverClassExcel(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverClassExcel(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleProcessClassExcelFile(file);
                  }}
                  onClick={() => classExcelFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    isDragOverClassExcel
                      ? 'border-indigo-500 bg-indigo-50/70'
                      : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70 hover:border-indigo-400'
                  }`}
                >
                  <input
                    type="file"
                    ref={classExcelFileInputRef}
                    accept=".xlsx,.xls"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleProcessClassExcelFile(f);
                      if (classExcelFileInputRef.current) classExcelFileInputRef.current.value = '';
                    }}
                    className="hidden"
                  />
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    {isParsingClassExcel ? (
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    ) : (
                      <FolderUp className="w-6 h-6" />
                    )}
                  </div>
                  <p className="font-bold text-slate-800 text-sm">
                    {isParsingClassExcel
                      ? 'Đang phân tích tệp danh sách lớp...'
                      : 'Kéo thả tệp Excel danh sách lớp vào đây hoặc bấm để chọn tệp'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Hỗ trợ cột "Tên lớp", "Lớp", "Class" (Ví dụ: 7A1, 7A2, 7A3, 7B1...)
                  </p>
                </div>

                {classExcelFileName && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-indigo-950">{classExcelFileName}</p>
                      <p className="text-[11px] text-indigo-700">Dung lượng: {classExcelFileSize}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => classExcelFileInputRef.current?.click()}
                      className="text-xs text-indigo-700 hover:text-indigo-900 font-bold underline"
                    >
                      Đổi file khác
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* TAB 2: NHẬP NHANH VĂN BẢN DANH SÁCH LỚP */
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nhập hoặc dán danh sách các lớp học (mỗi lớp 1 dòng hoặc cách nhau bằng dấu phẩy):
                  </label>
                  <textarea
                    rows={5}
                    value={rawClassListText}
                    onChange={(e) => setRawClassListText(e.target.value)}
                    placeholder="Ví dụ:&#10;7A1&#10;7A2&#10;7A3&#10;7A4&#10;7A5&#10;hoặc 7A1, 7A2, 7B1, 7B2"
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleParseTextClassList}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Trích xuất danh sách lớp</span>
                </button>
              </div>
            )}

            {/* XEM TRƯỚC DANH SÁCH LỚP TRÍCH XUẤT ĐƯỢC */}
            {parsedClassNames.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    Danh sách các lớp sẽ khởi tạo ({parsedClassNames.length} lớp):
                  </span>
                  <span className="text-[11px] text-slate-500">
                    (Màu xanh: Lớp mới • Màu xám: Đã có sẵn)
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                  {parsedClassNames.map((cls) => {
                    const isExisting = classes.includes(cls);
                    return (
                      <span
                        key={cls}
                        className={`px-2.5 py-1 rounded-md font-bold text-xs flex items-center space-x-1 ${
                          isExisting
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        <span>Lớp {cls}</span>
                        {isExisting && <span className="text-[10px] font-normal">(Đã có)</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setIsBatchClassModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={parsedClassNames.length === 0}
                onClick={handleSaveBatchClasses}
                className={`text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm ${
                  parsedClassNames.length > 0
                    ? 'bg-indigo-600 hover:bg-indigo-500'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                Khởi tạo {parsedClassNames.length} lớp trống
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: XÁC NHẬN XÓA LỚP */}
      {isDeleteClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-fade-in">
            <div className="flex items-center space-x-3 text-red-600 border-b pb-3">
              <div className="p-2.5 bg-red-100 rounded-xl">
                <FolderMinus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">
                  Xác nhận xóa lớp {classToDelete}
                </h3>
                <p className="text-xs text-slate-500">
                  Hiện có {students.filter((s) => s.className === classToDelete).length} học sinh
                  trong lớp này
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-start space-x-2 cursor-pointer p-3 rounded-lg border border-red-200 bg-red-50 text-red-950">
                <input
                  type="checkbox"
                  checked={deleteStudentsWithClass}
                  onChange={(e) => setDeleteStudentsWithClass(e.target.checked)}
                  className="mt-0.5 rounded text-red-600 focus:ring-red-500"
                />
                <div>
                  <span className="font-bold block">
                    Xóa luôn toàn bộ {students.filter((s) => s.className === classToDelete).length}{' '}
                    học sinh thuộc lớp {classToDelete}
                  </span>
                  <span className="text-[11px] text-red-700">
                    (Nếu bỏ chọn, danh sách học sinh vẫn giữ nguyên nhưng chỉ xóa tên lớp)
                  </span>
                </div>
              </label>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t">
              <button
                onClick={() => setIsDeleteClassModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmDeleteClass}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm"
              >
                Xác nhận xóa lớp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: UPLOAD DANH SÁCH HỌC SINH TỪ TỆP EXCEL CHO LỚP */}
      {isExcelUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center space-x-2">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                  <span>
                    Upload danh sách học sinh từ file Excel (.xlsx, .xls)
                    {targetClassForExcel ? ` cho Lớp ${targetClassForExcel}` : ''}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tự động nhận diện Họ tên, Mã học sinh và tự sinh mã đăng nhập không dấu (mật khẩu mặc định 123456)
                </p>
              </div>
              <button
                onClick={() => setIsExcelUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {/* CỘT TRÁI: CẤU HÌNH LỚP & KHUNG KÉO THẢ EXCEL */}
              <div className="space-y-3">
                {/* Chọn lớp đích áp dụng */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800">Lớp học tiếp nhận danh sách:</label>
                    <select
                      value={targetClassForExcel}
                      onChange={(e) => setTargetClassForExcel(e.target.value)}
                      className="p-1.5 border border-slate-300 rounded-lg text-xs bg-white font-bold text-blue-700"
                    >
                      {classes.map((c) => (
                        <option key={c} value={c}>
                          Lớp {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tùy chọn gán toàn bộ vào lớp đích */}
                  <label className="flex items-start space-x-2 cursor-pointer pt-1 border-t border-slate-200">
                    <input
                      type="checkbox"
                      checked={assignAllToTargetClass}
                      onChange={(e) => setAssignAllToTargetClass(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-bold text-slate-800">
                        Gán TẤT CẢ học sinh trong file tải lên vào Lớp {targetClassForExcel}
                      </span>
                      <p className="text-[11px] text-slate-500">
                        (Khuyên dùng khi bạn tải file danh sách riêng của từng lớp - không cần quan
                        tâm cột Lớp trong file)
                      </p>
                    </div>
                  </label>
                </div>

                {/* Dropzone Excel */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverExcel(true);
                  }}
                  onDragLeave={() => setIsDragOverExcel(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverExcel(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleProcessExcelFile(file);
                  }}
                  onClick={() => excelFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    isDragOverExcel
                      ? 'border-indigo-500 bg-indigo-50/70'
                      : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70 hover:border-indigo-400'
                  }`}
                >
                  <input
                    type="file"
                    ref={excelFileInputRef}
                    accept=".xlsx,.xls"
                    onChange={handleExcelFileInputChange}
                    className="hidden"
                  />
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    {isParsingExcel ? (
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    ) : (
                      <FileUp className="w-6 h-6" />
                    )}
                  </div>
                  <p className="font-bold text-slate-800 text-sm">
                    {isParsingExcel
                      ? 'Đang phân tích bảng tính Excel...'
                      : 'Kéo thả tệp Excel học sinh vào đây hoặc bấm để chọn tệp'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Định dạng hỗ trợ: <code>.xlsx</code>, <code>.xls</code>
                  </p>
                </div>

                {/* File info */}
                {excelFileName && (
                  <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-indigo-950 truncate max-w-xs">{excelFileName}</p>
                      <p className="text-[11px] text-indigo-700">Dung lượng: {excelFileSize}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => excelFileInputRef.current?.click()}
                      className="text-xs text-indigo-700 hover:text-indigo-900 font-bold underline"
                    >
                      Đổi tệp khác
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-2.5 rounded-xl">
                  <div className="text-[11px] text-blue-900">
                    <p className="font-bold">Mật khẩu ban đầu: 123456</p>
                    <p>Mã đăng nhập tự sinh: không dấu, viết thường (vd: <code>nvan</code>)</p>
                  </div>
                  <button
                    type="button"
                    onClick={downloadSampleStudentExcel}
                    className="text-xs font-bold text-blue-700 hover:text-blue-900 underline flex items-center space-x-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải Excel mẫu</span>
                  </button>
                </div>
              </div>

              {/* CỘT PHẢI: BẢNG XEM TRƯỚC HỌC SINH TỪ EXCEL */}
              <div className="space-y-3 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    Xem trước kết quả ({excelPreviewStudents.length} học sinh):
                  </span>
                  <span className="text-[11px] text-emerald-600 font-bold">
                    Sẵn sàng tạo tài khoản
                  </span>
                </div>

                <div className="flex-1 border border-slate-200 rounded-xl p-2.5 overflow-y-auto max-h-[380px] bg-slate-50 space-y-1.5">
                  {excelPreviewStudents.length === 0 ? (
                    <div className="text-center py-20 text-slate-400 space-y-2">
                      <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300" />
                      <p>Chưa có dữ liệu học sinh từ Excel.</p>
                      <p className="text-[11px]">
                        Tải tệp Excel lên ở khung bên trái để xem trước danh sách tài khoản.
                      </p>
                    </div>
                  ) : (
                    excelPreviewStudents.map((p, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-400 w-5 text-center font-bold">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-slate-800">{p.fullName}</span>
                            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.2 rounded ml-2">
                              Lớp {p.className}
                            </span>
                            {p.studentIdCode && (
                              <span className="text-slate-400 ml-1.5">({p.studentIdCode})</span>
                            )}
                          </div>
                        </div>

                        <code className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold border border-emerald-200">
                          {p.loginCode}
                        </code>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setIsExcelUploadModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={excelPreviewStudents.length === 0}
                onClick={handleSaveExcelStudents}
                className={`text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm ${
                  excelPreviewStudents.length > 0
                    ? 'bg-indigo-600 hover:bg-indigo-500'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                Xác nhận lưu {excelPreviewStudents.length} học sinh vào Lớp {targetClassForExcel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: THÊM 1 HỌC SINH THỦ CÔNG */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">Thêm 1 học sinh mới</h3>
              <button
                onClick={() => setIsAddStudentOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Họ và tên học sinh <span className="text-red-500">*</span>:
                </label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lớp:</label>
                <select
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-bold bg-white text-blue-700"
                >
                  {classes.map((c) => (
                    <option key={c} value={c}>
                      Lớp {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mã học sinh (nếu có):
                </label>
                <input
                  type="text"
                  value={newStudentIdCode}
                  onChange={(e) => setNewStudentIdCode(e.target.value)}
                  placeholder="Ví dụ: HS7A31"
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 border-t pt-3">
              <button
                onClick={() => setIsAddStudentOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                onClick={handleAddSingleStudent}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg"
              >
                Thêm học sinh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA HÀNG LOẠT HỌC SINH */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-fade-in">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">
                  Xác nhận xóa hàng loạt học sinh
                </h3>
                <p className="text-xs text-slate-500">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed">
              Bạn có chắc chắn muốn xóa{' '}
              <strong className="text-red-600 text-sm">{selectedStudentIds.size}</strong> học sinh
              đã chọn khỏi hệ thống?
            </p>

            <div className="flex justify-end space-x-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setIsBatchDeleteModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm"
              >
                Xóa {selectedStudentIds.size} học sinh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
