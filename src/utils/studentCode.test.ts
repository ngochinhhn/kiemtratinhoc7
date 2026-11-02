import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateBaseLoginCode,
  generateUniqueLoginCodes,
  removeVietnameseAccents,
  hashPassword,
} from './studentCode';

test('removeVietnameseAccents removes accents properly', () => {
  assert.equal(removeVietnameseAccents('Nguyễn Văn An'), 'Nguyen Van An');
  assert.equal(removeVietnameseAccents('Đặng Đình Đồng'), 'Dang Dinh Dong');
  assert.equal(removeVietnameseAccents('Trần Thị Minh Anh'), 'Tran Thi Minh Anh');
});

test('generateBaseLoginCode follows Ministry of Education THCS student code guidelines', () => {
  // Nguyễn Văn An -> nvan
  assert.equal(generateBaseLoginCode('Nguyễn Văn An'), 'nvan');
  // Trần Thị Minh Anh -> ttmanh
  assert.equal(generateBaseLoginCode('Trần Thị Minh Anh'), 'ttmanh');
  // Lê Hoàng Phúc -> lhphuc
  assert.equal(generateBaseLoginCode('Lê Hoàng Phúc'), 'lhphuc');
  // Đỗ Mai -> dmai
  assert.equal(generateBaseLoginCode('Đỗ Mai'), 'dmai');
});

test('generateUniqueLoginCodes avoids duplicates with suffix _01, _02', () => {
  const students = [
    { fullName: 'Nguyễn Văn An' },
    { fullName: 'Nguyễn Văn An' }, // Trùng tên
    { fullName: 'Nguyễn Văn An' }, // Trùng tên tiếp
    { fullName: 'Trần Thị Minh Anh' },
  ];

  const codes = generateUniqueLoginCodes(students);
  assert.deepEqual(codes, ['nvan', 'nvan_01', 'nvan_02', 'ttmanh']);
});

test('hashPassword produces stable hash for password', () => {
  const hash1 = hashPassword('123456');
  const hash2 = hashPassword('123456');
  const hashOther = hashPassword('abcdef');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hashOther);
  assert.ok(hash1.startsWith('hash_'));
});
