# Bộ tài liệu quản lý GA CRM

Điểm bắt đầu cho mọi phiên làm việc. Mở theo thứ tự ở bảng dưới.

| Tệp | Trả lời câu hỏi | Ai cập nhật |
|---|---|---|
| [HANDOFF.md](HANDOFF.md) | Dự án đang ở đâu, việc gì kế tiếp, có cạm bẫy gì | Cuối mỗi phiên |
| [ROADMAP.md](ROADMAP.md) | 8 lát cắt phát hành, cái nào xong, cái nào còn thiếu | Khi xong một hạng mục |
| [viec-con-lai.md](viec-con-lai.md) | Còn việc gì chưa làm, làm việc nào trước | Khi xong hoặc thêm một việc |
| [decisions.md](decisions.md) | Dự án khác đặc tả ở đâu và vì sao | Khi có quyết định mới |
| [open-questions.md](open-questions.md) | Việc nào đang chờ Product Owner hoặc DLVN trả lời | Khi có câu hỏi hoặc câu trả lời |
| [thiet-ke-he-thong.md](thiet-ke-he-thong.md) | Thiết kế hệ thống đích: PostgreSQL, Redis, BullMQ, worker, WebSocket; công nghệ cho từng chức năng; nhất quán và bảo mật dữ liệu | Khi đổi kiến trúc hoặc có số đo mới |
| [kien-truc-backend.md](kien-truc-backend.md) | Bản đánh giá cũ trên MongoDB, chỉ còn giá trị tham khảo về điểm nghẽn của code hiện tại | Không cập nhật nữa |
| [requirements/INDEX.md](requirements/INDEX.md) | Quy tắc nào nằm ở đâu, đã làm tới đâu | Sinh tự động |
| [requirements/rules/](requirements/rules/) | Nguyên văn quy tắc theo từng miền (LEAD, USER, IMP...) | Sinh tự động |

## Nguồn gốc của từng loại thông tin

- **[requirement/](../requirement/README.md)** là đặc tả gốc, chỉ đọc. Khi đặc tả đổi thì sửa ở đó rồi sinh lại chỉ mục.
- **[requirement/desigin/desigin.md](../requirement/desigin/desigin.md)** là design system của giao diện.
- **`docs/requirements/`** được sinh từ đặc tả và code, không sửa tay.
- **[.claude/skills/](../.claude/skills/)** là quy trình làm việc cho AI, được nạp tự động trong các phiên sau.
- **[CLAUDE.md](../CLAUDE.md)** là các nguyên tắc không được vi phạm.

Sinh lại chỉ mục sau khi đổi đặc tả hoặc thêm code có trích dẫn mã quy tắc:

```bash
npm run docs:rules
```

Kiểm tra chỉ mục còn khớp không, không ghi đè gì:

```bash
npm run docs:rules:check
```

## Skill của dự án

| Skill | Dùng khi |
|---|---|
| `ga-crm-context` | Bắt đầu hoặc kết thúc phiên, tra cứu đặc tả |
| `ga-crm-feature` | Xây một tính năng hoặc lát cắt mới |
| `ga-crm-ui` | Sửa hoặc thêm màn hình, thành phần giao diện |
| `ga-crm-verify` | Chạy app, test, kiểm tra trên trình duyệt |
