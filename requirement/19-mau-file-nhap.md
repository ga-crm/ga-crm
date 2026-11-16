# 19. Mẫu file Excel nhập dữ liệu

## 19.1 Chung
- Nguồn: `DLVN_BDM_CRM_Import_Template_v1.1.xlsx` (sheet `00_README` là từ điển dữ liệu; `12_Lookups` chứa giá trị danh mục). Giữ file mẫu trong repo (`samples/`, dữ liệu test đã che) và test nhập 0 lỗi.
- So khớp tiêu đề: chuẩn hóa NFC, gộp khoảng trắng, không phân biệt hoa thường; mỗi cột có thể có tên gọi khác.
- "BB" = cột bắt buộc phải có và mỗi ô phải có giá trị (trừ chỗ ghi khác). Kiểu: text (tối đa 500 trừ khi ghi khác), key (định dạng DATA-1), date `dd/mm/yyyy`, datetime `dd/mm/yyyy hh:mm`, timestamp (ISO có múi giờ hoặc `dd/mm/yyyy hh:mm` giờ VN), dayMonth `dd/mm`, int (≥ 0, cho phép dấu phân cách nghìn), percent, list (12_Lookups), yesNo (Có / Chưa), agentRef (`RANK: mã-Họ tên`), phone.
- Các trường GA tự quản lý (số điện thoại khách hàng; tên / ngày sinh / giới tính người được bảo hiểm và thời hạn bảo hiểm trên dòng chương trình) **không có trong mẫu** và không bao giờ bị nhập file ghi đè.

## 19.2 01_Agents → agents (khóa: mã đại lý; chủ sở hữu: chính nó)
| Tiêu đề | Trường | Kiểu | BB |
|---|---|---|---|
| Quản lý | managerCode (+ managerName, managerRank) | agentRef | Có (trống = cấp cao nhất) |
| Tư vấn tài chính | agentCode (+ name, rank) | agentRef | Có |
| Giới tính | gender | text | |
| Ngày sinh | dob | date | |
| Trạng thái | status | list agentStatus | Có |
| Điện thoại | phone | text | |
| Ngày bắt đầu hoạt động | startDate | date | Có |
| Ngày chấm dứt hoạt động | endDate | date | |
| office_code | officeCode | text | |

## 19.3 02_Clients → clients (khóa: mã khách hàng, 10 chữ số)
| Tiêu đề | Trường | Kiểu | BB |
|---|---|---|---|
| Mã Khách Hàng | clientCode | key client | Có |
| Bên Mua BH | name (+ nameNorm) | text | Có |
| Nhóm Khách Hàng | tier | list clientTier | |
| Tổng HĐ còn hiệu lực | activePolicies | int | |
| Tổng HĐ mất hiệu lực | lapsedPolicies | int | |
| Ngày Sinh | dob | date | |
| Giới Tính | gender | text | |
| Tình Trạng Hôn Nhân | maritalStatus | list maritalStatus | |
| Điểm Thưởng | loyaltyPoints | int | |
| Sử dụng D-Connect | usesDconnect | yesNo | |
| Thời gian đăng nhập D-Connect gần nhất | dconnectLastLoginAt | datetime | |
| Đã cập nhật Căn cước | idUpdated | yesNo (chỉ cờ) | |
| Đăng ký eKYC | ekycRegistered | yesNo | |
| Thời gian đăng ký eKYC | ekycRegisteredAt | datetime | |
| birth_day_month | birthDayMonth | dayMonth | |
| age_band | ageBand | list ageBand | |

## 19.4 03_Policies → policies (khóa: số HĐBH; khóa dòng: số HĐBH + mã đại lý; chủ sở hữu: mã đại lý)
| Tiêu đề | Trường | Kiểu | BB |
|---|---|---|---|
| Số HĐBH | policyNo | key policy | Có |
| Mã KH BMBH (hoặc: Mã KH) | holderClientCode (PO) | key client | Có |
| Mã NĐBH chính | insuredClientCode (LI) | key client | |
| Mã đại lý | agentCode | key agent | Có |
| Bên mua BH | holderName (+ norm) | text | Có |
| NĐBH chính | insuredName (+ norm) | text | Có |
| Tình trạng | status | text | Có |
| Ngày hiệu lực | effectiveDate | date | Có |
| Ngày đáo hạn | maturityDate | date | Có |
| Tỉ lệ chia | splitPercent | percent | |
| Định kỳ đóng phí | premiumFrequency | list premiumFrequency | Có |
| Ngày đến hạn đóng phí | premiumDueDate | date | |
| Phí dự tính định kỳ | plannedPremiumVnd | int | |
| Phí định kỳ/cơ bản định kỳ | basePremiumVnd | int | Có |
| Phí cơ bản các kỳ trước chưa đóng | unpaidPremiumVnd | int | |
| Nợ APL(Vay đóng phí + Lãi) | aplDebtVnd | int | |
| Đã có người thụ hưởng | hasBeneficiary | yesNo | |

## 19.5 04_Policy_Products và 05_Applications
04_Policy_Products → policies.products (khóa: số HĐBH + mã sản phẩm + mã NĐBH; trống = ""):
| Tiêu đề | Trường | Kiểu | BB |
|---|---|---|---|
| Số HĐBH | policyNo | key policy | Có |
| product_code | productCode | key product | Có |
| Tên sản phẩm | productName | text | |
| product_role | productRole | list productRole | Có |
| Mã NĐBH | insuredCode (LI) | key client | (trống = LI chính) |
| Số tiền bảo hiểm | sumAssuredVnd | int | |
| Phí năm | annualPremiumVnd | int | |
| Chương trình | plan | text | |
| Ngày bắt đầu | startDate | date | |
| Tình trạng | status | text | |

Dòng chương trình nhập tay khớp với dòng file khi `productCode` (mã DLVN của chương trình, PRG-6) và `insuredCode` trùng.

05_Applications → applications (khóa: số HSYCBH; chủ sở hữu: mã đại lý):
| Tiêu đề | Trường | Kiểu | BB |
|---|---|---|---|
| Số HSYCBH | applicationNo | key application | Có |
| Số HĐBH | policyNo | key policy | |
| Mã đại lý | agentCode | key agent | Có |
| Mã KH | clientCode | key client | |
| Bên mua BH | holderName (+ norm) | text | Có |
| Ngày tạo hồ sơ | createdDate | date | Có |
| Ngày nhận HSYCBH | receivedDate | date | |
| Tình trạng | status | list applicationStatus | Có |
| Ngày phát hành | issuedDate | date | |
| product_code | productCode | key product | |
| Phí dự kiến (APE) | apeVnd | int | |

## 19.6 07_Activities → successActivities (khóa: activity_id; chủ sở hữu: agent_code)
| Tiêu đề | Trường | Kiểu | BB |
|---|---|---|---|
| activity_id | activityId | text ≤ 64 | Có |
| agent_code | agentCode | key agent | Có |
| leader_code | leaderCode | key agent | |
| office_code | officeCode | text | |
| program_code | programCode | text | |
| program_month | programMonth | int | |
| activity_type_id | activityType | mã (1-7 hoặc nhãn) | Có |
| sub_activity_title | subActivityTitle | text | |
| record_mode | recordMode | text | |
| started_at | startedAt | timestamp | Có |
| ended_at | endedAt | timestamp | |
| duration_seconds | durationSeconds | int | |
| status | status | list (draft, submitted, approved, returned, rejected, locked) | Có |
| customer_id | customerId | text | |
| customer_name | customerName | text | |
| customer_phone (mới, đã đề nghị) | customerPhone | phone | |
| activity_method | activityMethod | text | |
| call_type | callType | text | |
| call_outcome | callOutcome | text | |
| call_phone_hash | callPhoneHash | text | |
| content_note | contentNote | text ≤ 4000 | |
| location_name | locationName | text | |

## 19.7 13_Leads (file lead của GA) → leads (khóa: số điện thoại; chủ sở hữu: người được giao)
| Tiêu đề (sheet "Chia Lead") | Trường | Kiểu | BB |
|---|---|---|---|
| LEAD ID | externalId | text | |
| Mã đại lý (hoặc cột tên đại lý, được ghép) | assignedAgentCode | key agent | |
| NGÀY CẬP NHẬT LEAD | leadDate / ngày của dòng | date | |
| TÊN KHÁCH HÀNG | fullName (+ norm) | text | Có |
| SỐ ĐIỆN THOẠI | phone | phone | Có |
| NGUỒN SĐT | phoneSource | text | |
| KHU VỰC KHÁCH HÀNG | region | text | |
| Nguồn | source | text (thêm vào Danh mục Nguồn nếu mới) | Có |
| Tình Trạng TVV | interest | mã (từ đồng nghĩa LEAD-10 + nhãn Danh mục của GA) | |
| Trạng Thái Hiện Tại TVV | careStatus | mã (từ đồng nghĩa LEAD-11 + nhãn Danh mục của GA) | |
| Chiến Dịch | campaignName | text (tạo chiến dịch) | |
| TIẾN ĐỘ TƯ VẤN TVV | progressNote | text ≤ 4000 | |
| LÝ DO CHỐT XỊT/ DỪNG TÌM HIỂU | lostReason | text | |
| TRẠNG THÁI GỬI TIN NHẮN | messageStatus | text | |
| NGÀY ĐĂNG KÝ | registeredAt | date | |
| GIỚI TÍNH | gender | text | |
| EMAIL | email | text | |
| TUỔI | age | int | |
| TỈNH/TP | province | text | |
| GIÁ TRỊ | valueVnd | int | |
| THÔNG TIN THÊM | extraInfo | text ≤ 2000 | |
| LINK THAM KHẢO | refLink | text | |
| SẢN PHẨM | productInterest | text | |
| SẢN PHẨM PHỤ | productSecondary | text | |
| ĐỒNG Ý LIÊN HỆ | consentMarketing | yesNo | |

## 19.8 Tên gọi khác của tiêu đề lead (tự ghép)
| Trường | Tiêu đề được nhận |
|---|---|
| externalId | LEAD ID |
| assignedAgentCode | TƯ VẤN TÀI CHÍNH, TƯ VẤN, TÊN TVV, FC, Mã đại lý, Mã TVV |
| leadDate | NGÀY CẬP NHẬT LEAD, Ngày, Ngày nhận lead |
| fullName | TÊN KHÁCH HÀNG, TÊN KH, Họ tên |
| phone | SỐ ĐIỆN THOẠI, Sđt, Điện thoại |
| phoneSource | NGUỒN SĐT |
| region | KHU VỰC KHÁCH HÀNG, KHU VỰC |
| source | Nguồn, Kênh |
| interest | Tình Trạng TVV, Tình Trạng, Tình Trang |
| careStatus | Trạng Thái Hiện Tại TVV, Trạng Thái Hiện Tại, Trạng thái mới |
| campaignName | Chiến Dịch |
| progressNote | TIẾN ĐỘ TƯ VẤN TVV, TIẾN ĐỘ TƯ VẤN, Note mới |
| lostReason | LÝ DO CHỐT XỊT/ DỪNG TÌM HIỂU, LÝ DO DỪNG TƯ VẤN |

## 19.9 11_Products (Platform Admin)
Cột: `product_code` (khóa), `product_name`, `product_role`, `category` (quyết định nhóm quyền lợi), `min_entry_age`, `max_entry_age`, `max_cover_age`, `gender`, `waiting_period`, `key_benefits`, `fit_rule`, `trigger_event`, `rule_status` (DRAFT / APPROVED). Quy tắc phù hợp và sự kiện kích hoạt được lưu, chưa dùng cho đến khi duyệt (**OPEN**).

## 19.10 Tiêu đề bị cấm theo PDP (không bao giờ đọc)
Tiêu đề ngoài mẫu bị cấm khi dạng chuẩn hóa chứa: CCCD, CMND, CAN CUOC, CHUNG MINH, HO CHIEU, PASSPORT, TAI KHOAN, NGAN HANG, BANK; trong file Success thêm BENH, SUC KHOE, HEALTH (được phép trong file lead).
