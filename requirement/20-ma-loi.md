# 20. Danh mục mã lỗi (API → tiếng Việt)

## 20.1 Chung và xác thực
| Mã | HTTP | Thông báo |
|---|---|---|
| network | - | Không kết nối được máy chủ. Vui lòng thử lại. |
| internal | 500 | Đã có lỗi xảy ra. Vui lòng thử lại. |
| invalid_credentials | 401 | Email hoặc mật khẩu không đúng. |
| unauthenticated | 401 | Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại. |
| forbidden | 403 | Bạn không có quyền thực hiện thao tác này. |
| not_found | 404 | Không tìm thấy dữ liệu. |
| invalid_input | 400 | Có ô chưa hợp lệ. Xem dòng chữ đỏ ngay dưới ô cần sửa. |
| rate_limited **NEW** | 429 | Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút. |
| stale_settings **NEW** | 409 | Dữ liệu đã được người khác cập nhật. Hãy tải lại trang rồi sửa tiếp. |

Thông báo dưới từng ô theo `issues[].code` [Cooked]:
| code (Zod) | Thông báo |
|---|---|
| invalid_type | Hãy điền thông tin này. |
| too_small | Chưa điền, hoặc giá trị nhỏ hơn mức cho phép. |
| too_big | Giá trị lớn hơn mức cho phép. |
| invalid_format | Định dạng chưa đúng. |
| invalid_value | Hãy chọn một giá trị có trong danh sách. |
| invalid_union | Thông tin này chưa hợp lệ. |
| not_multiple_of | Hãy nhập số nguyên. |
| (khác) | Thông tin này chưa hợp lệ. |
Thông báo riêng theo trường khi cần (ví dụ mã khách hàng: "Mã khách hàng gồm đúng 10 chữ số.").

## 20.2 Người dùng, tenant, đại lý
| Mã | HTTP | Thông báo |
|---|---|---|
| email_taken | 409 | Email này đã được sử dụng. |
| agent_code_taken | 409 | Mã đại lý này đã được gắn với người dùng khác. |
| agent_code_required | 400 | Vai trò đại lý (FC, UM, BM, GAD) cần có mã đại lý. |
| last_ga_head | 409 | GA phải có ít nhất một Chủ GA đang hoạt động. |
| cannot_disable_self | 409 | Bạn không thể tự khóa hoặc lưu trữ tài khoản của mình. |
| invite_pending | 409 | Người dùng chưa kích hoạt tài khoản từ link mời. Hãy thu hồi lời mời thay vì khóa. |
| not_invited | 409 | Người dùng này đã kích hoạt tài khoản. |
| user_has_history **NEW** | 409 | Người dùng đã có dữ liệu trong hệ thống nên không xóa được. Hãy khóa hoặc lưu trữ tài khoản. |
| invite_invalid | 404 | Link mời không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ người đã mời bạn. |
| ga_code_taken | 409 | Mã GA này đã tồn tại. |
| manager_not_found | 400 | Không tìm thấy quản lý với mã này. |
| manager_cycle | 409 | Không thể chọn chính đại lý này hoặc cấp dưới của họ làm quản lý. |
| agent_not_found | 400 | Không tìm thấy tư vấn viên này trong GA. |
| agent_required [Cooked] | 400 | Hãy chọn tư vấn viên sẽ phụ trách khách hàng này. |

(Mã `cannot_delete_self` và `has_imports` của bản Cooked không còn dùng vì không xóa cứng người dùng đã có dữ liệu.)

## 20.3 Danh mục [Cooked]
| Mã | HTTP | Thông báo |
|---|---|---|
| unknown_option | 400 | Giá trị này không có trong danh mục của GA, hoặc đã bị ẩn. |
| option_exists | 409 | Danh mục đã có giá trị này. |
| option_built_in | 409 | Đây là giá trị mặc định của hệ thống nên không xóa được. Hãy ẩn nó đi. |
| option_in_use | 409 | Đang có lead dùng giá trị này nên không xóa được. Hãy ẩn nó đi. |
| unknown_program | 400 | Chương trình này không có trong danh mục của GA, hoặc đã bị ẩn. |
| program_exists | 409 | Danh mục đã có chương trình này. |
| program_in_use | 409 | Đang có hợp đồng dùng chương trình này nên không xóa được. Hãy ẩn nó đi. |

## 20.4 Lead và khách hàng
| Mã | HTTP | Thông báo |
|---|---|---|
| campaign_not_found | 400 | Không tìm thấy chiến dịch. |
| invalid_phone | 400 | Số điện thoại không hợp lệ. |
| phone_exists | 409 | Đã có lead với số điện thoại này. |
| interest_locked | 409 | Tình trạng đã được phân loại và không đổi được nữa. Liên hệ Marketing nếu cần sửa. |
| lost_reason_required | 400 | Hãy nhập lý do chốt xịt. |
| own_lead_locked | 409 | Đây là lead tự khai thác của tư vấn viên đang làm việc tại GA nên không thể giao cho người khác. |
| won_needs_numbers | 400 | Khi chọn Đã chốt, hãy nhập số hồ sơ hoặc số hợp đồng. |
| invalid_application_no | 400 | Số hồ sơ chỉ gồm chữ và số, từ 4 đến 20 ký tự. |
| invalid_policy_no | 400 | Số hợp đồng gồm đúng 9 chữ số. |
| invalid_client_code **NEW** | 400 | Mã khách hàng gồm đúng 10 chữ số. |
| lead_not_yours | 403 | Chỉ tư vấn viên được giao lead (và người quản lý lead) cập nhật lead này. Bạn có thể để lại góp ý. |
| client_not_yours | 403 | Chỉ tư vấn viên phục vụ khách hàng này (hoặc Chủ GA) cập nhật thông tin, gia đình, ghi chú và hợp đồng. |
| same_client | 400 | Không thể chọn chính khách hàng này. |
| already_client | 409 | Người này đã là khách hàng. |
| client_exists [Cooked] | 409 | Mã khách hàng này đã có trong GA. |
| policy_exists [Cooked] | 409 | Số HĐBH này đã có trong GA. |
| program_repeated [Cooked] | 409 | Một chương trình chỉ ghi được một lần cho mỗi người được bảo hiểm trong cùng hợp đồng. |
| client_already_linked **NEW** | 409 | Khách hàng này đã được liên kết với một lead khác. |

## 20.5 Nhập dữ liệu (mức request và mức dòng)
| Mã | Mức | Thông báo |
|---|---|---|
| import_not_open | request 409 | Lần nhập này đã đóng. Vui lòng tải lại file. |
| import_not_validated | request 409 | File chưa được kiểm tra xong. Vui lòng tải lại file. |
| sheet_not_ready | request 409 | Sheet này không thể nhập. |
| missing_required_column | sheet | Thiếu cột bắt buộc "{cột}". Sheet này chưa được nhập. |
| banned_column | sheet | Cột "{cột}" có thể chứa dữ liệu không được phép lưu (CCCD/CMND, tài khoản ngân hàng, sức khỏe). Cột này đã bị bỏ qua và file gốc không được lưu lại. |
| sheet_not_allowed | sheet | Bạn không có quyền nhập sheet này. |
| required | dòng | Thiếu giá trị bắt buộc. |
| too_long | dòng | Nội dung quá dài (tối đa 500 ký tự). |
| invalid_key_client | dòng | Mã khách hàng "{v}" không hợp lệ. Mã phải gồm đúng 10 chữ số. |
| invalid_key_policy | dòng | Số HĐBH "{v}" không hợp lệ. Số HĐBH phải gồm đúng 9 chữ số. |
| invalid_key_agent | dòng | Mã đại lý "{v}" không hợp lệ. Mã chỉ gồm chữ số. |
| invalid_key_application | dòng | Số HSYCBH "{v}" không hợp lệ. Chỉ gồm chữ và số, từ 4 đến 20 ký tự. |
| invalid_key_product | dòng | Mã sản phẩm "{v}" không hợp lệ. |
| padded_key | cảnh báo | Excel đã chuyển mã thành số và làm mất số 0 ở đầu. Hệ thống đã thêm lại thành "{v}". Hãy định dạng cột này là Text. |
| invalid_agent_ref | dòng | "{v}" sai định dạng. Định dạng đúng: "RANK: mã-Họ tên", ví dụ "FC: 9000001-Nguyễn Thị A". RANK là SUM, BM, UM, SA hoặc FC. |
| self_manager | dòng | Đại lý không thể là quản lý của chính mình. |
| invalid_date | dòng | Ngày "{v}" không hợp lệ. Định dạng đúng: dd/mm/yyyy. |
| invalid_datetime | dòng | Thời gian "{v}" không hợp lệ. Định dạng đúng: dd/mm/yyyy hh:mm. |
| invalid_day_month | dòng | "{v}" không hợp lệ. Định dạng đúng: dd/mm. |
| invalid_number | dòng | "{v}" không phải là số nguyên không âm. |
| invalid_percent | dòng | "{v}" không phải là tỉ lệ hợp lệ (0% đến 100%). |
| invalid_list | dòng | Giá trị "{v}" không có trong danh mục (xem sheet 12_Lookups). |
| invalid_yes_no | dòng | Giá trị "{v}" không hợp lệ. Chỉ nhận "Có" hoặc "Chưa". |
| invalid_phone | dòng | Số điện thoại "{v}" không hợp lệ. |
| agent_not_found | dòng | Không tìm thấy tư vấn viên với mã này trong GA. Hãy ghép đúng tư vấn viên rồi nhập lại. |
| lead_exists | cảnh báo | Đã có lead với số điện thoại này. Dòng này mới hơn nên lead được cập nhật theo file. |
| own_lead_locked | dòng | Lead tự khai thác của tư vấn viên đang làm việc tại GA, không giao cho người khác được. |
| lead_not_newer | bỏ qua | Ngày cập nhật của dòng này không sau lần cập nhật gần nhất trên CRM (hoặc để trống), nên giữ nguyên dữ liệu CRM. Bản ghi mới hơn được giữ. |
| duplicate_key | dòng | Trùng khóa với một dòng phía trên trong cùng sheet. Chỉ dòng đầu tiên được nhập. |
| out_of_scope | dòng | Đại lý của dòng này không thuộc phạm vi của bạn. Bạn chỉ được nhập dữ liệu của mình và của cấp dưới. |
| owned_by_other | dòng | Bản ghi này đang thuộc một đại lý ngoài phạm vi của bạn nên không thể ghi đè. |
| policy_not_found | dòng | Không tìm thấy hợp đồng này trong file hoặc trong phạm vi của bạn. |
| client_out_of_scope | dòng | Khách hàng này đang thuộc đại lý khác và file không có hợp đồng hay hồ sơ nào của bạn cho khách hàng này. |
| invalid_activity | dòng | Hoạt động phải có mã hoạt động và thời điểm bắt đầu hợp lệ. |
| manager_fixed_kept | cảnh báo | Quản lý trong file khác với liên kết Chủ GA đã sửa tay. Hệ thống giữ nguyên liên kết đã sửa. |
| split_total | dòng | Tỉ lệ chia của hợp đồng không hợp lệ: dữ liệu GA phải có đủ các đại lý của hợp đồng với tổng tỉ lệ chia 100%, và tổng không được vượt quá 100%. |
| servicing_changed | cảnh báo | Đại lý phục vụ của hợp đồng sẽ thay đổi. Thay đổi được ghi vào lịch sử hợp đồng. |

## 20.6 AI
| Mã | HTTP | Thông báo |
|---|---|---|
| ai_disabled | 403 | Trợ lý AI đang tắt cho GA này. |
| ai_budget_exceeded | 429 | GA đã dùng hết hạn mức AI của tháng này. Liên hệ Chủ GA. |
| ai_provider_missing | 503 | Nhà cung cấp AI chưa được cấu hình khóa truy cập. Liên hệ quản trị. |
| ai_provider_error | 502 | Dịch vụ AI đang gặp lỗi. Vui lòng thử lại sau. |
| ai_rate_limited | 429 | Dịch vụ AI đang quá tải. Vui lòng thử lại sau ít phút. |
| ai_key_invalid | 400 | Khóa API của nhà cung cấp AI không hợp lệ hoặc đã hết hạn. Liên hệ Chủ GA. |
| ai_model_unavailable | 400 | Mô hình AI đã chọn không còn được nhà cung cấp hỗ trợ. Chủ GA cần chọn mô hình khác ở Trợ lý AI > Mô hình và hạn mức. |
| ai_agent_unavailable | 400 | Trợ lý này không dùng được ở đây. |
| ai_practice_finished | 409 | Buổi luyện tập đã kết thúc. Bắt đầu buổi mới để luyện tiếp. |
| ai_practice_too_short | 400 | Hãy trò chuyện thêm vài lượt trước khi chấm điểm. |
| ai_bad_output | 502 | AI trả kết quả không hợp lệ. Vui lòng thử lại. |
