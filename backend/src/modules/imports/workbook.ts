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

/** A, B, ..., Z, AA, AB, ...: a lead sheet has more than 26 columns. */
const columnLetter = (index: number): string => {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
};

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
    // A sheet with groups has two header rows: the group over its columns, their names below
    const headerRows = sheet.groups ? 2 : 1;
    const worksheet = workbook.addWorksheet(sheet.name, {
      views: [{ state: 'frozen', ySplit: headerRows }],
    });
    sheet.columns.forEach((column, index) => {
      worksheet.getColumn(index + 1).width = Math.max(
        18,
        column.header.length + 6,
      );
      worksheet.getColumn(index + 1).numFmt = TEXT_FORMAT;
    });
    const groupOf = (field: string) =>
      sheet.groups?.find((group) => group.fields.includes(field));
    sheet.columns.forEach((column, index) => {
      const group = groupOf(column.field);
      const top = worksheet.getCell(1, index + 1);
      const named = worksheet.getCell(headerRows, index + 1);
      if (group) {
        named.value = column.subHeader ?? column.header;
        // The group's title sits once, over its first column
        if (group.fields[0] === column.field) top.value = group.title;
      } else {
        top.value = column.header;
      }
      for (const cell of headerRows === 2 ? [top, named] : [top]) {
        cell.font = { bold: true };
        cell.fill = HEADER_FILL;
        cell.alignment = { vertical: 'middle', wrapText: true };
      }
      named.note = column.note;
    });
    if (sheet.groups) {
      for (const group of sheet.groups) {
        const first = sheet.columns.findIndex(
          (column) => column.field === group.fields[0],
        );
        worksheet.mergeCells(1, first + 1, 1, first + group.fields.length);
        worksheet.getCell(1, first + 1).alignment = { horizontal: 'center' };
      }
      // A column outside a group keeps one name over both header rows
      sheet.columns.forEach((column, index) => {
        if (!groupOf(column.field))
          worksheet.mergeCells(1, index + 1, 2, index + 1);
      });
    }
    for (const example of sheet.examples) worksheet.addRow([...example]);

    sheet.columns.forEach((column, index) => {
      const values =
        column.list ??
        (column.suggest
          ? (lookupValues as Record<string, readonly string[]>)[column.suggest]
          : undefined);
      if (!values) return;
      const lookup = Object.values(lookupValues).findIndex(
        (list) => list === values,
      );
      const letter = columnLetter(lookup);
      const formula = `'${LOOKUPS_SHEET}'!$${letter}$2:$${letter}$${values.length + 1}`;
      const target = columnLetter(index);
      // A suggestion leaves room for the GA's own labels; a list refuses anything else
      const strict = !!column.list;
      for (let row = headerRows + 1; row <= VALIDATED_ROWS; row++) {
        worksheet.getCell(`${target}${row}`).dataValidation = {
          type: 'list',
          allowBlank: !strict,
          formulae: [formula],
          showErrorMessage: strict,
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
