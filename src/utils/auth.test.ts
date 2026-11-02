import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateTeacher,
  authenticateStudent,
  getActiveRunningExam,
  getQuickSelectStudentsForExam,
} from './auth';
import { Exam, Student } from '../types';

const MOCK_STUDENTS: Student[] = [
  {
    id: 'hs_1',
    studentIdCode: 'HS7001',
    fullName: 'Nguyễn Văn An',
    normalizedName: 'nguyen van an',
    loginCode: 'nvan',
    passwordHash: '123456',
    className: '7A',
    workstationNumber: 1,
    createdAt: '2025-09-01T00:00:00.000Z',
  },
  {
    id: 'hs_2',
    studentIdCode: 'HS7002',
    fullName: 'Trần Thị Bình',
    normalizedName: 'tran thi binh',
    loginCode: 'ttbinh',
    passwordHash: '123456',
    className: '7A',
    workstationNumber: 2,
    createdAt: '2025-09-01T00:00:00.000Z',
  },
  {
    id: 'hs_3',
    studentIdCode: 'HS7031',
    fullName: 'Lê Minh Châu',
    normalizedName: 'le minh chau',
    loginCode: 'lmchau',
    passwordHash: '123456',
    className: '7B',
    workstationNumber: 1,
    createdAt: '2025-09-01T00:00:00.000Z',
  },
  {
    id: 'hs_4',
    studentIdCode: 'HS7032',
    fullName: 'Phạm Quốc Dũng',
    normalizedName: 'pham quoc dung',
    loginCode: 'pqdung',
    passwordHash: '123456',
    className: '7B',
    workstationNumber: 2,
    createdAt: '2025-09-01T00:00:00.000Z',
  },
  {
    id: 'hs_5',
    studentIdCode: 'HS7033',
    fullName: 'Hoàng Thu Hà',
    normalizedName: 'hoang thu ha',
    loginCode: 'htha',
    passwordHash: '123456',
    className: '7B',
    workstationNumber: 3,
    createdAt: '2025-09-01T00:00:00.000Z',
  },
  {
    id: 'hs_6',
    studentIdCode: 'HS7034',
    fullName: 'Vũ Gia Huy',
    normalizedName: 'vu gia huy',
    loginCode: 'vghuy',
    passwordHash: '123456',
    className: '7B',
    workstationNumber: 4,
    createdAt: '2025-09-01T00:00:00.000Z',
  },
  {
    id: 'hs_7',
    studentIdCode: 'HS7035',
    fullName: 'Đỗ Khánh Linh',
    normalizedName: 'do khanh linh',
    loginCode: 'dklinh',
    passwordHash: '123456',
    className: '7B',
    workstationNumber: 5,
    createdAt: '2025-09-01T00:00:00.000Z',
  },
];

const MOCK_EXAMS: Exam[] = [
  {
    id: 'exam_1',
    title: 'Kiểm tra 15 phút - Lớp 7A',
    type: '15_phut',
    classes: ['7A'],
    durationMinutes: 15,
    totalQuestions: 6,
    maxScore: 10,
    questionIds: ['q1'],
    status: 'tam_dung',
    allowReviewAfterSubmit: true,
    shuffleQuestions: true,
    shuffleOptions: true,
    createdAt: '2025-10-01T00:00:00.000Z',
  },
  {
    id: 'exam_2',
    title: 'Kiểm tra 45 phút - Lớp 7B',
    type: '45_phut',
    classes: ['7B'],
    durationMinutes: 45,
    totalQuestions: 10,
    maxScore: 10,
    questionIds: ['q1'],
    status: 'dang_dien_ra',
    allowReviewAfterSubmit: true,
    shuffleQuestions: true,
    shuffleOptions: true,
    createdAt: '2025-10-02T00:00:00.000Z',
  },
];

test('authenticateTeacher accepts Admin / admin123', () => {
  const res1 = authenticateTeacher('Admin', 'admin123');
  assert.equal(res1.ok, true);
  assert.equal(res1.username, 'Admin');

  const res2 = authenticateTeacher('  admin ', 'admin123');
  assert.equal(res2.ok, true);
});

test('authenticateTeacher rejects invalid credentials', () => {
  assert.equal(authenticateTeacher('', 'admin123').ok, false);
  assert.equal(authenticateTeacher('Admin', '').ok, false);
  assert.equal(authenticateTeacher('Admin', 'wrong').ok, false);
  assert.equal(authenticateTeacher('teacher', 'admin123').ok, false);
});

test('authenticateStudent accepts valid loginCode and default password 123456', () => {
  const res = authenticateStudent('nvan', '123456', MOCK_STUDENTS);
  assert.equal(res.ok, true);
  assert.equal(res.student?.fullName, 'Nguyễn Văn An');

  const resUpper = authenticateStudent(' NVAN ', '123456', MOCK_STUDENTS);
  assert.equal(resUpper.ok, true);
});

test('authenticateStudent rejects unknown loginCode, wrong password, no active exam, or wrong class', () => {
  assert.equal(authenticateStudent('', '123456', MOCK_STUDENTS).ok, false);
  assert.equal(authenticateStudent('unknown', '123456', MOCK_STUDENTS).ok, false);
  assert.equal(authenticateStudent('nvan', '000000', MOCK_STUDENTS).ok, false);

  // When activeExam is explicitly null (no exam open)
  const noExamRes = authenticateStudent('nvan', '123456', MOCK_STUDENTS, null);
  assert.equal(noExamRes.ok, false);

  // When activeExam is for class 7B only, student from 7A cannot enter
  const wrongClassRes = authenticateStudent('nvan', '123456', MOCK_STUDENTS, MOCK_EXAMS[1]);
  assert.equal(wrongClassRes.ok, false);

  // Student from 7B can enter exam for 7B
  const rightClassRes = authenticateStudent('lmchau', '123456', MOCK_STUDENTS, MOCK_EXAMS[1]);
  assert.equal(rightClassRes.ok, true);
});

test('getActiveRunningExam returns null when no exam has status dang_dien_ra', () => {
  const pausedExams: Exam[] = MOCK_EXAMS.map((e) => ({ ...e, status: 'tam_dung' }));
  assert.equal(getActiveRunningExam(pausedExams, 'exam_1'), null);
  assert.equal(getActiveRunningExam(MOCK_EXAMS, 'exam_1')?.id, 'exam_2');
});

test('getQuickSelectStudentsForExam returns first 4 students of the specific class assigned to active exam', () => {
  const quick7B = getQuickSelectStudentsForExam(MOCK_STUDENTS, MOCK_EXAMS[1], 4);
  assert.equal(quick7B.length, 4);
  assert.deepEqual(
    quick7B.map((s) => s.loginCode),
    ['lmchau', 'pqdung', 'htha', 'vghuy']
  );
  assert.ok(quick7B.every((s) => s.className === '7B'));

  // When no active exam
  assert.equal(getQuickSelectStudentsForExam(MOCK_STUDENTS, null).length, 0);
});
