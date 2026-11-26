import {
  AGENT_RANKS,
  AGENT_STATUSES,
} from '../agents/infrastructure/agent.entity.js';
import {
  AGE_BANDS,
  APPLICATION_STATUSES,
  CLIENT_TIERS,
  MARITAL_STATUSES,
  PREMIUM_FREQUENCIES,
  PRODUCT_ROLES,
} from '../clients/client.constants.js';
import { SUCCESS_ACTIVITY_STATUSES } from './infrastructure/import.entities.js';

export type CellType =
  | 'agentRef'
  | 'date'
  | 'list'
  | 'text'
  | 'phone'
  | 'int'
  | 'yesNo'
  | 'interest'
  | 'care'
  // Section 19.3-19.5, IMP-6 to IMP-8
  | 'clientKey'
  | 'policyKey'
  | 'agentKey'
  | 'applicationKey'
  | 'productKey'
  | 'percent'
  | 'datetime'
  | 'dayMonth'
  // IMP-31
  | 'activityType';

export interface TemplateColumn {
  header: string;
  field: string;
  type: CellType;
  /** Section 19.1 "Req": the column must exist in the file. */
  requiredColumn: boolean;
  /** Req columns where a blank cell has a meaning, such as a top-level agent with no manager. */
  allowBlank?: boolean;
  list?: readonly string[];
  aliases?: readonly string[];
  /** Section 19.1: 500 unless a column says otherwise. */
  maxLength?: number;
  note: string;
  /** The name the downloaded template writes under a group, when shorter than `header` (an alias). */
  subHeader?: string;
  /** A list in the lookups sheet the template offers as a dropdown, without refusing other values. */
  suggest?: string;
}

export interface SheetTemplate {
  name: string;
  columns: readonly TemplateColumn[];
  /**
   * Groups of adjacent columns the downloaded template heads with one merged cell, the columns'
   * names in the row below (a GA's "Chia Lead" file, decided 25/11/2026).
   */
  groups?: readonly { title: string; fields: readonly string[] }[];
  /** Masked sample rows, in column order. The template must import with no errors (section 19.1). */
  examples: readonly (readonly string[])[];
}

/** Section 19.2. The API, the validation and the downloadable template all read this one definition (IMP-11). */
export const AGENTS_SHEET: SheetTemplate = {
  name: '01_Agents',
  columns: [
    {
      header: 'Quản lý',
      field: 'manager',
      type: 'agentRef',
      requiredColumn: true,
      allowBlank: true,
      aliases: ['Manager'],
      note: 'Dạng "RANK: mã-Họ tên", ví dụ "BM: 9000002-Trần Văn B". Để trống nếu là đại lý cấp cao nhất.',
    },
    {
      header: 'Tư vấn tài chính',
      field: 'agent',
      type: 'agentRef',
      requiredColumn: true,
      aliases: ['Đại lý', 'Agent'],
      note: 'Dạng "RANK: mã-Họ tên", ví dụ "FC: 9000001-Nguyễn Thị A". RANK là SUM, BM, UM, SA hoặc FC.',
    },
    {
      header: 'Giới tính',
      field: 'gender',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'Ngày sinh',
      field: 'dob',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy. Không bắt buộc.',
    },
    {
      header: 'Trạng thái',
      field: 'status',
      type: 'list',
      requiredColumn: true,
      list: AGENT_STATUSES,
      note: 'Chọn trong danh sách: Đang hoạt động hoặc Ngưng hoạt động.',
    },
    {
      header: 'Điện thoại',
      field: 'phone',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'Ngày bắt đầu hoạt động',
      field: 'startDate',
      type: 'date',
      requiredColumn: true,
      note: 'Định dạng dd/mm/yyyy.',
    },
    {
      header: 'Ngày chấm dứt hoạt động',
      field: 'endDate',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy. Không bắt buộc.',
    },
    {
      header: 'office_code',
      field: 'officeCode',
      type: 'text',
      requiredColumn: false,
      note: 'Mã văn phòng. Không bắt buộc.',
    },
  ],
  examples: [
    [
      '',
      'SUM: 9000000-Lê Văn C',
      'Nam',
      '20/03/1980',
      'Đang hoạt động',
      '0900000000',
      '01/01/2020',
      '',
      'HN01',
    ],
    [
      'SUM: 9000000-Lê Văn C',
      'BM: 9000002-Trần Văn B',
      'Nam',
      '10/07/1985',
      'Đang hoạt động',
      '0900000002',
      '15/06/2021',
      '',
      'HN01',
    ],
    [
      'BM: 9000002-Trần Văn B',
      'FC: 9000001-Nguyễn Thị A',
      'Nữ',
      '15/01/1990',
      'Đang hoạt động',
      '0900000001',
      '01/02/2024',
      '',
      'HN01',
    ],
  ],
};

/** Section 19.7 and 19.8: the sheet name in a GA's own file is free, so columns are mapped on screen. */
export const LEADS_SHEET: SheetTemplate = {
  name: '13_Leads',
  columns: [
    {
      header: 'TÊN TVV',
      field: 'agentValue',
      type: 'text',
      requiredColumn: false,
      aliases: ['Mã đại lý', 'TƯ VẤN TÀI CHÍNH', 'TƯ VẤN', 'FC', 'Mã TVV'],
      note: 'Tên hoặc mã đại lý của tư vấn viên. Không bắt buộc; để trống nếu chưa phân công.',
    },
    {
      header: 'NGÀY CẬP NHẬT LEAD',
      field: 'rowDate',
      type: 'date',
      requiredColumn: false,
      aliases: ['Ngày', 'Ngày nhận lead'],
      note: 'Định dạng dd/mm/yyyy. Dòng có ngày mới hơn CRM mới được cập nhật.',
    },
    {
      header: 'TÊN KHÁCH HÀNG',
      field: 'fullName',
      type: 'text',
      requiredColumn: true,
      aliases: ['TÊN KH', 'Họ tên'],
      note: 'Bắt buộc.',
    },
    {
      header: 'SỐ ĐIỆN THOẠI',
      field: 'phone',
      type: 'phone',
      requiredColumn: true,
      aliases: ['Sđt', 'Điện thoại'],
      note: 'Bắt buộc. Mỗi số điện thoại chỉ một lead.',
    },
    {
      header: 'NGUỒN SĐT',
      field: 'phoneSource',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'KHU VỰC KHÁCH HÀNG',
      field: 'region',
      type: 'text',
      requiredColumn: false,
      aliases: ['KHU VỰC'],
      note: 'Không bắt buộc.',
    },
    {
      header: 'Nguồn',
      field: 'source',
      type: 'text',
      requiredColumn: false,
      aliases: ['Kênh'],
      note: 'Ví dụ Page BHN, Facebook, Giới thiệu. Không bắt buộc; để trống thì ghi "Chưa rõ nguồn".',
    },
    {
      header: 'Tình Trạng TVV',
      field: 'interest',
      type: 'interest',
      requiredColumn: false,
      aliases: ['Tình Trạng', 'Tình Trang'],
      suggest: 'Tình trạng',
      note: 'Chưa nghe máy, Chưa xác định, Không quan tâm, Quan tâm nhân thọ hoặc Quan tâm thẻ rời.',
    },
    {
      header: 'Trạng Thái Hiện Tại TVV',
      field: 'careStatus',
      type: 'care',
      requiredColumn: false,
      aliases: ['Trạng Thái Hiện Tại', 'Trạng thái mới'],
      suggest: 'Trạng thái hiện tại',
      note: 'Đang chăm sóc, Đã chốt, Chốt xịt hoặc Không quan tâm.',
    },
    {
      header: 'Chiến Dịch',
      field: 'campaignName',
      type: 'text',
      requiredColumn: false,
      note: 'Chiến dịch chưa có sẽ được tạo mới theo tên.',
    },
    {
      header: 'TIẾN ĐỘ TƯ VẤN TVV',
      field: 'progressNote',
      type: 'text',
      maxLength: 4000,
      requiredColumn: false,
      aliases: ['TIẾN ĐỘ TƯ VẤN', 'Note mới'],
      note: 'Tối đa 4000 ký tự. Nội dung thay đổi sẽ thành một ghi chú mới.',
    },
    {
      header: 'TRẠNG THÁI GỬI TIN NHẮN',
      field: 'messageStatus',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'LÝ DO CHỐT XỊT/ DỪNG TÌM HIỂU',
      field: 'lostReason',
      type: 'text',
      requiredColumn: false,
      aliases: ['LÝ DO DỪNG TƯ VẤN'],
      note: 'Không bắt buộc.',
    },
    {
      header: 'XỬ LÝ SAU 10 NGÀY',
      field: 'followUp10d',
      type: 'text',
      maxLength: 2000,
      requiredColumn: false,
      aliases: ['10 NGÀY'],
      subHeader: '10 NGÀY',
      note: 'Việc đã làm sau 10 ngày. Không bắt buộc.',
    },
    {
      header: 'XỬ LÝ SAU 15 NGÀY',
      field: 'followUp15d',
      type: 'text',
      maxLength: 2000,
      requiredColumn: false,
      aliases: ['15 NGÀY'],
      subHeader: '15 NGÀY',
      note: 'Việc đã làm sau 15 ngày. Không bắt buộc.',
    },
    {
      header: 'XỬ LÝ SAU 20 NGÀY',
      field: 'followUp20d',
      type: 'text',
      maxLength: 2000,
      requiredColumn: false,
      aliases: ['20 NGÀY'],
      subHeader: '20 NGÀY',
      note: 'Việc đã làm sau 20 ngày. Không bắt buộc.',
    },
    {
      header: 'GHI CHÚ XỬ LÝ',
      field: 'handlingNote',
      type: 'text',
      maxLength: 4000,
      requiredColumn: false,
      note: 'Tối đa 4000 ký tự. Không bắt buộc.',
    },
    {
      header: 'NGÀY ĐĂNG KÝ',
      field: 'registeredAt',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy.',
    },
    {
      header: 'GIỚI TÍNH',
      field: 'gender',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'EMAIL',
      field: 'email',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'TUỔI',
      field: 'age',
      type: 'int',
      requiredColumn: false,
      note: 'Số nguyên.',
    },
    {
      header: 'TỈNH/TP',
      field: 'province',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'GIÁ TRỊ',
      field: 'valueVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền, chấp nhận 13000000 hoặc 13.000.000.',
    },
    {
      header: 'THÔNG TIN THÊM',
      field: 'extraInfo',
      type: 'text',
      maxLength: 2000,
      requiredColumn: false,
      note: 'Tối đa 2000 ký tự.',
    },
    {
      header: 'LINK THAM KHẢO',
      field: 'refLink',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'SẢN PHẨM',
      field: 'productInterest',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'SẢN PHẨM PHỤ',
      field: 'productSecondary',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'CDYT - THỐNG KÊ',
      field: 'cdytStats',
      type: 'text',
      maxLength: 2000,
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'CDYT - TRANG CÁ NHÂN',
      field: 'cdytProfile',
      type: 'text',
      maxLength: 2000,
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'ĐỒNG Ý LIÊN HỆ',
      field: 'consent',
      type: 'yesNo',
      requiredColumn: false,
      note: 'Có hoặc Chưa. File chỉ cấp thêm, không hủy sự đồng ý đã có.',
    },
    {
      header: 'LEAD ID',
      field: 'externalId',
      type: 'text',
      requiredColumn: false,
      note: 'Mã lead của GA. Không bắt buộc.',
    },
  ],
  groups: [
    {
      title: 'XỬ LÝ SAU',
      fields: ['followUp10d', 'followUp15d', 'followUp20d', 'handlingNote'],
    },
    {
      title: 'THÔNG TIN THÊM',
      fields: [
        'registeredAt',
        'gender',
        'email',
        'age',
        'province',
        'valueVnd',
        'extraInfo',
        'refLink',
        'productInterest',
        'productSecondary',
        'cdytStats',
        'cdytProfile',
      ],
    },
  ],
  examples: [
    [
      '',
      '01/11/2026',
      'Nguyễn Văn Mẫu',
      '0900000101',
      'Quảng cáo',
      'Miền Bắc',
      'Facebook',
      'Chưa xác định',
      'Đang chăm sóc',
      'Chiến dịch mẫu',
      'Đã gọi lần đầu, hẹn gọi lại.',
      '',
      '',
      'Đã gọi nhắc lần 2.',
      '',
      '',
      'Khách hẹn tuần sau.',
      '01/11/2026',
      'Nam',
      'mau@example.com',
      '35',
      'Hà Nội',
      '13.000.000',
      '',
      '',
      'Nhân thọ',
      '',
      '',
      '',
      'Có',
      'L-001',
    ],
    [
      '',
      '02/11/2026',
      'Trần Thị Mẫu',
      '0900000102',
      'Giới thiệu',
      'Miền Nam',
      'Giới thiệu',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Nữ',
      '',
      '',
      'TP.HCM',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Chưa',
      'L-002',
    ],
  ],
};

/** Section 19.3: 02_Clients → clients (key: client code, 10 digits). */
export const CLIENTS_SHEET: SheetTemplate = {
  name: '02_Clients',
  columns: [
    {
      header: 'Mã Khách Hàng',
      field: 'clientCode',
      type: 'clientKey',
      requiredColumn: true,
      note: 'Đúng 10 chữ số, giữ số 0 ở đầu.',
    },
    {
      header: 'Bên Mua BH',
      field: 'name',
      type: 'text',
      requiredColumn: true,
      note: 'Họ tên khách hàng.',
    },
    {
      header: 'Nhóm Khách Hàng',
      field: 'tier',
      type: 'list',
      requiredColumn: false,
      list: CLIENT_TIERS,
      note: 'Thân thiết, Bạc, Vàng hoặc Kim Cương. Không bắt buộc.',
    },
    {
      header: 'Tổng HĐ còn hiệu lực',
      field: 'activePolicies',
      type: 'int',
      requiredColumn: false,
      note: 'Số nguyên. Không bắt buộc.',
    },
    {
      header: 'Tổng HĐ mất hiệu lực',
      field: 'lapsedPolicies',
      type: 'int',
      requiredColumn: false,
      note: 'Số nguyên. Không bắt buộc.',
    },
    {
      header: 'Ngày Sinh',
      field: 'dob',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy. Không bắt buộc.',
    },
    {
      header: 'Giới Tính',
      field: 'gender',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'Tình Trạng Hôn Nhân',
      field: 'maritalStatus',
      type: 'list',
      requiredColumn: false,
      list: MARITAL_STATUSES,
      note: 'Độc thân, Đã kết hôn hoặc Ly hôn. Không bắt buộc.',
    },
    {
      header: 'Điểm Thưởng',
      field: 'loyaltyPoints',
      type: 'int',
      requiredColumn: false,
      note: 'Số nguyên. Không bắt buộc.',
    },
    {
      header: 'Sử dụng D-Connect',
      field: 'usesDconnect',
      type: 'yesNo',
      requiredColumn: false,
      note: 'Có hoặc Chưa. Không bắt buộc.',
    },
    {
      header: 'Thời gian đăng nhập D-Connect gần nhất',
      field: 'dconnectLastLoginAt',
      type: 'datetime',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy hh:mm. Không bắt buộc.',
    },
    {
      header: 'Đã cập nhật Căn cước',
      field: 'idUpdated',
      type: 'yesNo',
      requiredColumn: false,
      note: 'Chỉ ghi Có hoặc Chưa. Hệ thống không lưu số căn cước.',
    },
    {
      header: 'Đăng ký eKYC',
      field: 'ekycRegistered',
      type: 'yesNo',
      requiredColumn: false,
      note: 'Có hoặc Chưa. Không bắt buộc.',
    },
    {
      header: 'Thời gian đăng ký eKYC',
      field: 'ekycRegisteredAt',
      type: 'datetime',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy hh:mm. Không bắt buộc.',
    },
    {
      header: 'birth_day_month',
      field: 'birthDayMonth',
      type: 'dayMonth',
      requiredColumn: false,
      note: 'Ngày-tháng sinh dạng dd/mm. Không bắt buộc.',
    },
    {
      header: 'age_band',
      field: 'ageBand',
      type: 'list',
      requiredColumn: false,
      list: AGE_BANDS,
      note: '<18, 18-29, 30-39, 40-49, 50-59 hoặc 60+. Không bắt buộc.',
    },
  ],
  examples: [
    [
      '0000000001',
      'Nguyễn Văn Khách',
      'Vàng',
      '1',
      '0',
      '12/05/1985',
      'Nam',
      'Đã kết hôn',
      '1200',
      'Có',
      '01/11/2026 08:30',
      'Có',
      'Có',
      '15/03/2024 10:00',
      '12/05',
      '40-49',
    ],
  ],
};

/** Section 19.4: 03_Policies → policies (key: policy number; row key: policy number + agent code). */
export const POLICIES_SHEET: SheetTemplate = {
  name: '03_Policies',
  columns: [
    {
      header: 'Số HĐBH',
      field: 'policyNo',
      type: 'policyKey',
      requiredColumn: true,
      note: 'Đúng 9 chữ số, giữ số 0 ở đầu.',
    },
    {
      header: 'Mã KH BMBH',
      field: 'holderClientCode',
      type: 'clientKey',
      requiredColumn: true,
      aliases: ['Mã KH'],
      note: 'Mã khách hàng của bên mua bảo hiểm (10 chữ số).',
    },
    {
      header: 'Mã NĐBH chính',
      field: 'insuredClientCode',
      type: 'clientKey',
      requiredColumn: false,
      note: 'Mã khách hàng của người được bảo hiểm chính. Không bắt buộc.',
    },
    {
      header: 'Mã đại lý',
      field: 'agentCode',
      type: 'agentKey',
      requiredColumn: true,
      note: 'Chỉ gồm chữ số.',
    },
    {
      header: 'Bên mua BH',
      field: 'holderName',
      type: 'text',
      requiredColumn: true,
      note: 'Họ tên bên mua bảo hiểm.',
    },
    {
      header: 'NĐBH chính',
      field: 'insuredName',
      type: 'text',
      requiredColumn: true,
      note: 'Họ tên người được bảo hiểm chính.',
    },
    {
      header: 'Tình trạng',
      field: 'status',
      type: 'text',
      requiredColumn: true,
      note: 'Ghi như trên Success, ví dụ Đang hiệu lực.',
    },
    {
      header: 'Ngày hiệu lực',
      field: 'effectiveDate',
      type: 'date',
      requiredColumn: true,
      note: 'Định dạng dd/mm/yyyy.',
    },
    {
      header: 'Ngày đáo hạn',
      field: 'maturityDate',
      type: 'date',
      requiredColumn: true,
      note: 'Định dạng dd/mm/yyyy.',
    },
    {
      header: 'Tỉ lệ chia',
      field: 'splitPercent',
      type: 'percent',
      requiredColumn: false,
      note: 'Ví dụ 60%, 60 hoặc 0.6. Để trống nếu chỉ một đại lý.',
    },
    {
      header: 'Định kỳ đóng phí',
      field: 'premiumFrequency',
      type: 'list',
      requiredColumn: true,
      list: PREMIUM_FREQUENCIES,
      note: 'Năm, Nửa năm, Quý hoặc Tháng.',
    },
    {
      header: 'Ngày đến hạn đóng phí',
      field: 'premiumDueDate',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy. Không bắt buộc.',
    },
    {
      header: 'Phí dự tính định kỳ',
      field: 'plannedPremiumVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
    {
      header: 'Phí định kỳ/cơ bản định kỳ',
      field: 'basePremiumVnd',
      type: 'int',
      requiredColumn: true,
      note: 'Số tiền VND.',
    },
    {
      header: 'Phí cơ bản các kỳ trước chưa đóng',
      field: 'unpaidPremiumVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
    {
      header: 'Nợ APL(Vay đóng phí + Lãi)',
      field: 'aplDebtVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
    {
      header: 'Đã có người thụ hưởng',
      field: 'hasBeneficiary',
      type: 'yesNo',
      requiredColumn: false,
      note: 'Có hoặc Chưa. Không bắt buộc.',
    },
    {
      header: 'Địa chỉ liên hệ',
      field: 'contactAddress',
      type: 'text',
      requiredColumn: false,
      maxLength: 300,
      note: 'Địa chỉ liên hệ của hợp đồng. Không bắt buộc; CRM che ô này, chỉ hiện khi bấm xem.',
    },
    {
      header: 'Số tiền bảo hiểm',
      field: 'sumAssuredVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc; CRM ưu tiên số tiền của sản phẩm chính trong 04_Policy_Products.',
    },
    {
      header: 'Ngày kết thúc thời gian gia hạn đóng phí',
      field: 'graceEndDate',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy. Không bắt buộc.',
    },
    {
      header: 'Hình thức phân công',
      field: 'assignmentType',
      type: 'text',
      requiredColumn: false,
      maxLength: 100,
      note: 'Ghi như trên Success. Không bắt buộc.',
    },
    {
      header: 'Ngày phân công',
      field: 'assignmentDate',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy. Không bắt buộc.',
    },
    {
      header: 'Phí đóng trước cho kỳ tới',
      field: 'advancePremiumVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
    {
      header: 'Tổng phí bảo hiểm đã đóng',
      field: 'totalPaidPremiumVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
    {
      header: 'Phí bảo hiểm cơ bản',
      field: 'basicPremiumVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
    {
      header: 'Phí bảo hiểm đóng thêm',
      field: 'topUpPremiumVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
  ],
  examples: [
    [
      '000000001',
      '0000000001',
      '0000000001',
      '9000001',
      'Nguyễn Văn Khách',
      'Nguyễn Văn Khách',
      'Đang hiệu lực',
      '01/06/2024',
      '01/06/2044',
      '100%',
      'Năm',
      '01/06/2027',
      '12000000',
      '12000000',
      '0',
      '0',
      'Có',
      '1 Đường Mẫu, Phường Mẫu, TP.HCM',
      '500000000',
      '01/08/2027',
      'Đại lý khai thác',
      '01/06/2024',
      '0',
      '12000000',
      '12000000',
      '0',
    ],
  ],
};

/** Section 19.5: 04_Policy_Products → policies.products (key: policy number + product code + insured code). */
export const PRODUCTS_SHEET: SheetTemplate = {
  name: '04_Policy_Products',
  columns: [
    {
      header: 'Số HĐBH',
      field: 'policyNo',
      type: 'policyKey',
      requiredColumn: true,
      note: 'Đúng 9 chữ số. Hợp đồng phải có trong sheet 03_Policies hoặc đã được nhập trước.',
    },
    {
      header: 'product_code',
      field: 'productCode',
      type: 'productKey',
      requiredColumn: true,
      note: 'Mã sản phẩm Dai-ichi.',
    },
    {
      header: 'Tên sản phẩm',
      field: 'productName',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'product_role',
      field: 'productRole',
      type: 'list',
      requiredColumn: true,
      list: PRODUCT_ROLES,
      note: 'Chính hoặc Bổ trợ.',
    },
    {
      header: 'Mã NĐBH',
      field: 'insuredCode',
      type: 'clientKey',
      requiredColumn: false,
      note: 'Mã khách hàng của người được bảo hiểm của sản phẩm. Để trống nếu là người được bảo hiểm chính.',
    },
    {
      header: 'Số tiền bảo hiểm',
      field: 'sumAssuredVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
    {
      header: 'Phí năm',
      field: 'annualPremiumVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
    {
      header: 'Chương trình',
      field: 'plan',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'Ngày bắt đầu',
      field: 'startDate',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy. Không bắt buộc.',
    },
    {
      header: 'Tình trạng',
      field: 'status',
      type: 'text',
      requiredColumn: false,
      note: 'Ghi như trên Success. Không bắt buộc.',
    },
  ],
  examples: [
    [
      '000000001',
      'P001',
      'An Tâm Song Hành',
      'Chính',
      '',
      '500000000',
      '10000000',
      'Cơ bản',
      '01/06/2024',
      'Đang hiệu lực',
    ],
    [
      '000000001',
      'R002',
      'BH Chăm Sóc Sức Khoẻ',
      'Bổ trợ',
      '',
      '100000000',
      '2000000',
      '',
      '01/06/2024',
      'Đang hiệu lực',
    ],
  ],
};

/** Section 19.5: 05_Applications → applications (key: application number). */
export const APPLICATIONS_SHEET: SheetTemplate = {
  name: '05_Applications',
  columns: [
    {
      header: 'Số HSYCBH',
      field: 'applicationNo',
      type: 'applicationKey',
      requiredColumn: true,
      note: 'Chữ và số, từ 4 đến 20 ký tự.',
    },
    {
      header: 'Số HĐBH',
      field: 'policyNo',
      type: 'policyKey',
      requiredColumn: false,
      note: 'Đúng 9 chữ số. Không bắt buộc.',
    },
    {
      header: 'Mã đại lý',
      field: 'agentCode',
      type: 'agentKey',
      requiredColumn: true,
      note: 'Chỉ gồm chữ số.',
    },
    {
      header: 'Mã KH',
      field: 'clientCode',
      type: 'clientKey',
      requiredColumn: false,
      note: 'Mã khách hàng (10 chữ số). Không bắt buộc.',
    },
    {
      header: 'Bên mua BH',
      field: 'holderName',
      type: 'text',
      requiredColumn: true,
      note: 'Họ tên bên mua bảo hiểm.',
    },
    {
      header: 'Ngày tạo hồ sơ',
      field: 'createdDate',
      type: 'date',
      requiredColumn: true,
      note: 'Định dạng dd/mm/yyyy.',
    },
    {
      header: 'Ngày nhận HSYCBH',
      field: 'receivedDate',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy. Không bắt buộc.',
    },
    {
      header: 'Tình trạng',
      field: 'status',
      type: 'list',
      requiredColumn: true,
      list: APPLICATION_STATUSES,
      note: 'Chọn trong danh sách ở sheet 12_Lookups.',
    },
    {
      header: 'Ngày phát hành',
      field: 'issuedDate',
      type: 'date',
      requiredColumn: false,
      note: 'Định dạng dd/mm/yyyy. Không bắt buộc.',
    },
    {
      header: 'product_code',
      field: 'productCode',
      type: 'productKey',
      requiredColumn: false,
      note: 'Mã sản phẩm. Không bắt buộc.',
    },
    {
      header: 'Phí dự kiến (APE)',
      field: 'apeVnd',
      type: 'int',
      requiredColumn: false,
      note: 'Số tiền VND. Không bắt buộc.',
    },
  ],
  examples: [
    [
      'A0001',
      '000000001',
      '9000001',
      '0000000001',
      'Nguyễn Văn Khách',
      '10/05/2024',
      '12/05/2024',
      'Đã phát hành hợp đồng',
      '01/06/2024',
      'P001',
      '12000000',
    ],
  ],
};

/** Section 19.6: 07_Activities → successActivities (key: activity_id; owner: agent_code). */
export const ACTIVITIES_SHEET: SheetTemplate = {
  name: '07_Activities',
  columns: [
    {
      header: 'activity_id',
      field: 'activityId',
      type: 'text',
      requiredColumn: true,
      maxLength: 64,
      note: 'Mã hoạt động trên Success, tối đa 64 ký tự.',
    },
    {
      header: 'agent_code',
      field: 'agentCode',
      type: 'agentKey',
      requiredColumn: true,
      note: 'Mã đại lý thực hiện. Chỉ gồm chữ số.',
    },
    {
      header: 'leader_code',
      field: 'leaderCode',
      type: 'agentKey',
      requiredColumn: false,
      note: 'Mã quản lý. Không bắt buộc.',
    },
    {
      header: 'office_code',
      field: 'officeCode',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'program_code',
      field: 'programCode',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'program_month',
      field: 'programMonth',
      type: 'int',
      requiredColumn: false,
      note: 'Số nguyên. Không bắt buộc.',
    },
    {
      header: 'activity_type_id',
      field: 'activityType',
      type: 'activityType',
      requiredColumn: true,
      note: '1 Check-in, 2 Gọi điện (Calls), 3 Đăng mạng xã hội, 4 Gặp mặt, 5 Kèm cặp, 6 Khác, 7 Đề xuất. Nhận số, hoặc số kèm tên như "2 Calls".',
    },
    {
      header: 'sub_activity_title',
      field: 'subActivityTitle',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'record_mode',
      field: 'recordMode',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'started_at',
      field: 'startedAt',
      type: 'datetime',
      requiredColumn: true,
      note: 'dd/mm/yyyy hh:mm giờ Việt Nam, hoặc ISO có múi giờ.',
    },
    {
      header: 'ended_at',
      field: 'endedAt',
      type: 'datetime',
      requiredColumn: false,
      note: 'dd/mm/yyyy hh:mm giờ Việt Nam, hoặc ISO có múi giờ. Không bắt buộc.',
    },
    {
      header: 'duration_seconds',
      field: 'durationSeconds',
      type: 'int',
      requiredColumn: false,
      note: 'Số giây. Không bắt buộc.',
    },
    {
      header: 'status',
      field: 'status',
      type: 'list',
      requiredColumn: true,
      list: SUCCESS_ACTIVITY_STATUSES,
      note: 'draft, submitted, approved, returned, rejected hoặc locked.',
    },
    {
      header: 'customer_id',
      field: 'customerId',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'customer_name',
      field: 'customerName',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'customer_phone',
      field: 'customerPhone',
      type: 'phone',
      requiredColumn: false,
      note: 'Số điện thoại khách. Cột mới, không bắt buộc.',
    },
    {
      header: 'activity_method',
      field: 'activityMethod',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'call_type',
      field: 'callType',
      type: 'text',
      requiredColumn: false,
      note: 'Ví dụ: zalo. Không bắt buộc.',
    },
    {
      header: 'call_outcome',
      field: 'callOutcome',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'call_phone_hash',
      field: 'callPhoneHash',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
    {
      header: 'content_note',
      field: 'contentNote',
      type: 'text',
      requiredColumn: false,
      maxLength: 4000,
      note: 'Tối đa 4000 ký tự. Không bắt buộc.',
    },
    {
      header: 'location_name',
      field: 'locationName',
      type: 'text',
      requiredColumn: false,
      note: 'Không bắt buộc.',
    },
  ],
  examples: [
    [
      'ACT-0001',
      '9000001',
      '',
      'HCM01',
      '',
      '',
      '2 Calls',
      '',
      'manual',
      '05/06/2024 09:30',
      '05/06/2024 09:45',
      '900',
      'approved',
      '',
      'Nguyễn Văn Khách',
      '0912345678',
      '',
      'zalo',
      'Hẹn gặp',
      '',
      'Tư vấn bổ sung quyền lợi sức khỏe',
      '',
    ],
  ],
};

export const TEMPLATES_BY_KIND = {
  SUCCESS: [
    AGENTS_SHEET,
    CLIENTS_SHEET,
    POLICIES_SHEET,
    PRODUCTS_SHEET,
    APPLICATIONS_SHEET,
    ACTIVITIES_SHEET,
  ],
  LEADS: [LEADS_SHEET],
} as const;

export const LOOKUPS_SHEET = '12_Lookups';
export const README_SHEET = '00_README';
export const LEAD_LOOKUPS = {
  'Tình trạng': [
    'Chưa nghe máy',
    'Chưa xác định',
    'Không quan tâm',
    'Quan tâm nhân thọ',
    'Quan tâm thẻ rời',
  ],
  'Trạng thái hiện tại': [
    'Đang chăm sóc',
    'Đã chốt',
    'Chốt xịt',
    'Không quan tâm',
  ],
};
export const LOOKUPS = {
  'Trạng thái đại lý': AGENT_STATUSES,
  'Cấp bậc (RANK)': AGENT_RANKS,
  'Nhóm khách hàng': CLIENT_TIERS,
  'Tình trạng hôn nhân': MARITAL_STATUSES,
  'Nhóm tuổi': AGE_BANDS,
  'Định kỳ đóng phí': PREMIUM_FREQUENCIES,
  'Vai trò sản phẩm': PRODUCT_ROLES,
  'Tình trạng hồ sơ YCBH': APPLICATION_STATUSES,
  'Trạng thái hoạt động': SUCCESS_ACTIVITY_STATUSES,
};

/** Reference sheets of the DLVN template carry no records. */
const REFERENCE_SHEET = /^(00_|11_|12_)/i;
/** IMP-3 + IMP-33: 06 and 08-10 come later; 13 is the lead file, imported on its own. */
const LATER_SHEET = /^(06|0[89]|10|13)_/i;

export function classifySheet(
  name: string,
): SheetTemplate | 'LATER' | 'IGNORED' {
  const normalized = name.trim().toLowerCase();
  const template = TEMPLATES_BY_KIND.SUCCESS.find(
    (sheet) => sheet.name.toLowerCase() === normalized,
  );
  if (template) return template;
  if (REFERENCE_SHEET.test(normalized)) return 'IGNORED';
  return LATER_SHEET.test(normalized) ? 'LATER' : 'IGNORED';
}
