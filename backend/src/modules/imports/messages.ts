/**
 * Section 20.5. Unlike API errors, these messages are stored with each row and written into the
 * downloadable report, so they live on the server (see docs/decisions.md).
 */
const MESSAGES: Record<string, string> = {
  missing_required_column:
    'Thiếu cột bắt buộc "{col}". Sheet này chưa được nhập.',
  banned_column:
    'Cột "{col}" có thể chứa dữ liệu không được phép lưu (CCCD/CMND, tài khoản ngân hàng, sức khỏe). Cột này đã bị bỏ qua và file gốc không được lưu lại.',
  sheet_not_allowed: 'Bạn không có quyền nhập sheet này.',
  required: 'Thiếu giá trị bắt buộc.',
  // Columns differ (64 for activity_id, 500 by default, 4000 for notes); the template notes say which
  too_long:
    'Nội dung quá dài so với giới hạn của cột (xem ghi chú của cột trong file mẫu).',
  invalid_key_client:
    'Mã khách hàng "{v}" không hợp lệ. Mã phải gồm đúng 10 chữ số.',
  invalid_key_policy:
    'Số HĐBH "{v}" không hợp lệ. Số HĐBH phải gồm đúng 9 chữ số.',
  invalid_key_application:
    'Số HSYCBH "{v}" không hợp lệ. Chỉ gồm chữ và số, từ 4 đến 20 ký tự.',
  invalid_key_product: 'Mã sản phẩm "{v}" không hợp lệ.',
  invalid_datetime:
    'Thời gian "{v}" không hợp lệ. Định dạng đúng: dd/mm/yyyy hh:mm.',
  invalid_day_month: '"{v}" không hợp lệ. Định dạng đúng: dd/mm.',
  invalid_percent: '"{v}" không phải là tỉ lệ hợp lệ (0% đến 100%).',
  owned_by_other:
    'Bản ghi này đang thuộc một đại lý ngoài phạm vi của bạn nên không thể ghi đè.',
  policy_not_found:
    'Không tìm thấy hợp đồng này trong file hoặc trong phạm vi của bạn.',
  client_out_of_scope:
    'Khách hàng này đang thuộc đại lý khác và file không có hợp đồng hay hồ sơ nào của bạn cho khách hàng này.',
  split_total:
    'Tỉ lệ chia của hợp đồng không hợp lệ: dữ liệu GA phải có đủ các đại lý của hợp đồng với tổng tỉ lệ chia 100%, và tổng không được vượt quá 100%.',
  servicing_changed:
    'Đại lý phục vụ của hợp đồng sẽ thay đổi. Thay đổi được ghi vào lịch sử hợp đồng.',
  invalid_key_agent: 'Mã đại lý "{v}" không hợp lệ. Mã chỉ gồm chữ số.',
  invalid_agent_ref:
    '"{v}" sai định dạng. Định dạng đúng: "RANK: mã-Họ tên", ví dụ "FC: 9000001-Nguyễn Thị A". RANK là SUM, BM, UM, SA hoặc FC.',
  self_manager: 'Đại lý không thể là quản lý của chính mình.',
  invalid_date: 'Ngày "{v}" không hợp lệ. Định dạng đúng: dd/mm/yyyy.',
  invalid_list: 'Giá trị "{v}" không có trong danh mục (xem sheet 12_Lookups).',
  duplicate_key:
    'Trùng khóa với một dòng phía trên trong cùng sheet. Chỉ dòng đầu tiên được nhập.',
  out_of_scope:
    'Đại lý của dòng này không thuộc phạm vi của bạn. Bạn chỉ được nhập dữ liệu của mình và của cấp dưới.',
  invalid_phone: 'Số điện thoại "{v}" không hợp lệ.',
  invalid_activity_type:
    'Loại hoạt động "{v}" không hợp lệ. Nhận 1 đến 7 (1 Check-in, 2 Gọi điện, 3 Đăng mạng xã hội, 4 Gặp mặt, 5 Kèm cặp, 6 Khác, 7 Đề xuất), có thể kèm tên như "2 Calls".',
  invalid_number: '"{v}" không phải là số nguyên không âm.',
  invalid_yes_no: 'Giá trị "{v}" không hợp lệ. Chỉ nhận "Có" hoặc "Chưa".',
  padded_key:
    'Excel đã chuyển mã thành số và làm mất số 0 ở đầu. Hệ thống đã thêm lại thành "{v}". Hãy định dạng cột này là Text.',
  agent_not_found:
    'Không tìm thấy tư vấn viên với mã này trong GA. Hãy ghép đúng tư vấn viên rồi nhập lại.',
  lead_exists:
    'Đã có lead với số điện thoại này. Dòng này mới hơn nên lead được cập nhật theo file.',
  own_lead_locked:
    'Lead tự khai thác của tư vấn viên đang làm việc tại GA, không giao cho người khác được.',
  lead_not_newer:
    'Ngày cập nhật của dòng này không sau lần cập nhật gần nhất trên CRM (hoặc để trống), nên giữ nguyên dữ liệu CRM. Bản ghi mới hơn được giữ.',
  manager_fixed_kept:
    'Quản lý trong file khác với liên kết đã sửa tay. Hệ thống giữ nguyên liên kết đã sửa.',
  manager_change_ignored:
    'Quản lý trong file khác với cây hiện tại, nhưng bạn không có quyền đổi quản lý. Hệ thống giữ nguyên quản lý hiện tại.',
  batch_failed:
    'Lô ghi chứa dòng này gặp lỗi khi lưu nên dòng này chưa được ghi. Các lô khác vẫn được ghi. Hãy nhập lại các dòng này.',
  import_interrupted:
    'Quá trình ghi bị gián đoạn (máy chủ khởi động lại). Phần đã ghi được giữ; hãy tải file lên lại để ghi nốt phần còn lại.',
  manager_cycle_split:
    'Đại lý này nằm trong một vòng lặp quản lý nên tạm được coi là cấp cao nhất. Hãy kiểm tra lại cột Quản lý.',
};

export function importMessage(
  code: string,
  values: { v?: string; col?: string } = {},
): string {
  return (MESSAGES[code] ?? code)
    .replace('{v}', values.v ?? '')
    .replace('{col}', values.col ?? '');
}
