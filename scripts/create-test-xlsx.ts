import { mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const output = process.argv[2] ?? ".tmp/ramtha-test.xlsx";
const absolute = path.resolve(output);
await mkdir(path.dirname(absolute), { recursive: true });

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("هيثم");

const locations: Array<string | number> = [
  "امين الصندوق",
  "المطبخ",
  "المدير",
  "العلاقات",
  "الباحث",
  "غرفة الحاسوب",
  "المستودع",
  "القاعة والصالة",
  "السائق",
  "إدارة أساس",
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  "السطح",
];

sheet.addRow(["رقم المادة", "المادة", "الرصيد", "رقم الصفحة", "الموجود", ...locations]);

const row1 = new Array(29).fill(null);
row1[0] = "TEST-001";
row1[1] = "مادة اختبار أولى";
row1[2] = 5;
row1[3] = 10;
row1[4] = 5;
row1[5] = 3;  // أمين الصندوق
row1[15] = 2; // غرفة 1
sheet.addRow(row1);

const row2 = new Array(29).fill(null);
row2[0] = "TEST-002";
row2[1] = "مادة اختبار برصيد دفتري مختلف";
row2[2] = 10;
row2[3] = 11;
row2[4] = 7;
row2[11] = 7; // المستودع
sheet.addRow(row2);

const row3 = new Array(29).fill(null);
row3[1] = "مادة اختبار بلا رقم";
row3[2] = 1;
row3[4] = 1;
row3[16] = 1; // غرفة 2
sheet.addRow(row3);

await workbook.xlsx.writeFile(absolute);
console.log(`تم إنشاء ملف اختبار الاستيراد: ${absolute}`);
