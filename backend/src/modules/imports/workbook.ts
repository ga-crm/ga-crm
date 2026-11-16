import ExcelJS from 'exceljs';
import type { ImportKind } from './infrastructure/import.entities.js';
import {
  LEAD_LOOKUPS,
  LOOKUPS,
  LOOKUPS_SHEET,
  README_SHEET,
  TEMPLATES_BY_KIND,
} from './templates.js';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEBF8FF' },
};
const TEXT_FORMAT = '@';
const VALIDATED_ROWS = 5000;

const toBuffer = async (workbook: ExcelJS.Workbook): Promise<Buffer> =>
  Buffer.from(await workbook.xlsx.writeBuffer());

const columnLetter = (index: number): string =>
  String.fromCharCode('A'.charCodeAt(0) + index);

/**
 * IMP-11: generated from the same column definitions the validation reads, so the two cannot drift.
 * Every column is formatted as text: this is what stops Excel removing leading zeros (IMP-6).
 */
export async function buildTemplate(kind: ImportKind): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const templates = TEMPLATES_BY_KIND[kind];
  const lookupValues = kind === 'LEADS' ? LEAD_LOOKUPS : LOOKUPS;

  const readme = workbook.addWorksheet(README_SHEET);
  readme.columns = [{ width: 28 }, { width: 28 }, { width: 12 }, { width: 80 }];
  const addTitle = (text: string) => {
    readme.addRow([text]).font = { bold: true, size: 12 };
  };
  addTitle('Hướng dẫn điền file');
  for (const line of [
    '1. Mỗi đại lý một dòng trong sheet dữ liệu. Giữ nguyên tiêu đề cột.',
    '2. Các dòng mẫu chỉ để tham khảo: hãy xóa chúng trước khi điền dữ liệu thật.',
    '3. Tải file lên màn hình Nhập dữ liệu. Hệ thống chỉ ghi dữ liệu sau khi bạn xem trước và bấm xác nhận.',
    '4. Không thêm cột CCCD/CMND, tài khoản ngân hàng hoặc thông tin sức khỏe.',
  ]) {
    readme.addRow([line]);
  }
  for (const sheet of templates) {
    readme.addRow([]);
    addTitle(`Các cột của sheet ${sheet.name}`);
    const header = readme.addRow(['Tiêu đề cột', 'Bắt buộc', '', 'Cách điền']);
    header.font = { bold: true };
    for (const column of sheet.columns) {
      readme.addRow([
        column.header,
        column.requiredColumn ? 'Có' : 'Không',
        '',
        column.note,
      ]);
    }
  }

  for (const sheet of templates) {
    const worksheet = workbook.addWorksheet(sheet.name, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      key: column.field,
      width: Math.max(18, column.header.length + 6),
      style: { numFmt: TEXT_FORMAT },
    }));
    const header = worksheet.getRow(1);
    header.font = { bold: true };
    sheet.columns.forEach((column, index) => {
      const cell = header.getCell(index + 1);
      cell.fill = HEADER_FILL;
      cell.note = column.note;
    });
    for (const example of sheet.examples) worksheet.addRow([...example]);

    sheet.columns.forEach((column, index) => {
      if (!column.list) return;
      const lookup = Object.values(lookupValues).findIndex(
        (values) => values === column.list,
      );
      const letter = columnLetter(lookup);
      const formula = `'${LOOKUPS_SHEET}'!$${letter}$2:$${letter}$${column.list.length + 1}`;
      const target = columnLetter(index);
      for (let row = 2; row <= VALIDATED_ROWS; row++) {
        worksheet.getCell(`${target}${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [formula],
          showErrorMessage: true,
          errorTitle: 'Giá trị không hợp lệ',
          error: column.note,
        };
      }
    });
  }

  const lookups = workbook.addWorksheet(LOOKUPS_SHEET);
  Object.entries(lookupValues).forEach(([title, values], index) => {
    const column = lookups.getColumn(index + 1);
    column.width = 24;
    column.values = [title, ...values];
    lookups.getCell(1, index + 1).font = { bold: true };
  });

  workbook.views = [{ activeTab: 1 } as ExcelJS.WorkbookView];
  return toBuffer(workbook);
}

export interface ReportRow {
  sheet: string;
  row: number;
  column?: string;
  recordKey?: string;
  severity: string;
  messageVi: string;
}

/** IMP-10. Values from the uploaded file are written as plain strings, so Excel never runs them as formulas. */
export async function buildErrorReport(rows: ReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Bao_cao_loi', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Sheet', key: 'sheet', width: 18 },
    { header: 'Dòng', key: 'row', width: 8 },
    { header: 'Cột', key: 'column', width: 26 },
    { header: 'Mã bản ghi', key: 'recordKey', width: 22 },
    { header: 'Mức độ', key: 'severity', width: 12 },
    { header: 'Lý do', key: 'messageVi', width: 90 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow({
      ...row,
      severity: row.severity === 'error' ? 'Lỗi' : 'Cảnh báo',
    });
  }
  return toBuffer(workbook);
}
