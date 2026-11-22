# VTPATE — Chrome Extension Web Novel Scraper & EPUB Packaging Studio

Hệ thống Chrome Extension (Manifest V3) tải truyện web novel, tự động crawl đa chế độ (Direct Fetch song song hoặc Browser-Tab Assisted vượt anti-bot), và đóng gói file EPUB chuẩn xuất bản quốc tế. Hoạt động offline 100%, không phụ thuộc máy chủ ngoài hay bất kỳ CDN nào.

---

## 🚀 Hướng Dẫn Cài Đặt (Chrome Unpacked Extension)

Để cài đặt extension vào trình duyệt Chrome:

1. Mở trình duyệt Google Chrome hoặc trình duyệt dựa trên Chromium (Edge, Brave, Cốc Cốc).
2. Truy cập vào trang quản trị tiện ích: [Chrome Extensions](chrome://extensions).
3. Bật công tắc **Chế độ dành cho nhà phát triển** (**Developer mode**) ở góc trên bên phải màn hình.
4. Bấm vào nút **Tải tiện ích đã giải nén** (**Load unpacked**).
5. Điều hướng và chọn thư mục gốc dự án: `d:\vtpate`.
6. Tiện ích **VTPATE Studio** sẽ xuất hiện trên thanh công cụ với đầy đủ tính năng.

---

## 📖 Kịch Bản Kiểm Thử Nhanh (Test Scenarios)

Hệ thống cung cấp 4 kịch bản kiểm thử toàn diện mô phỏng các tình huống thực tế:

### Kịch bản 1 — Inkitt Novel (Web & Mobile Deep Links)
- **Mục tiêu**: Kiểm tra parser chuyên biệt cho Inkitt, trích xuất metadata và nội dung chương qua internal API `/api/2/stories/` và SSR data.
- **URL mẫu**: `https://www.inkitt.com/stories/romance/123456` hoặc deep link `https://www.inkitt.com/stories/fantasy/789101`
- **Các bước thực hiện**:
  1. Dán URL truyện Inkitt vào ô nhập liệu tại `manager.html` (hoặc mở popup khi đang duyệt trang Inkitt).
  2. Bấm nút **Trích xuất Thông tin**. Hệ thống tự động nhận diện badge `Inkitt Specialized Parser`.
  3. Kiểm tra thông tin tác phẩm: Tên truyện, Tác giả, Giới thiệu và Ảnh bìa (Cover Image).
  4. Lựa chọn các chương cần tải và bấm **Bắt đầu Tải Truyện**.
  5. Đảm bảo toàn bộ các chương kể cả chương chỉ định dạng mobile đều được trích xuất đầy đủ.

### Kịch bản 2 — Wattpad Novel (Mature, Paid Stories & Images)
- **Mục tiêu**: Kiểm tra parser chuyên biệt cho Wattpad, xử lý cả Story URL và Part URL, tải ảnh inline từ `img.wattpad.com` và cơ chế an toàn cho Paid Story.
- **URL mẫu**: `https://www.wattpad.com/story/98765432-sample-wattpad-novel` hoặc URL chương lẻ `https://www.wattpad.com/12345678-chapter-1`
- **Các bước thực hiện**:
  1. Nhập URL truyện hoặc URL một part vào ô nhập URL.
  2. Parser tự động resolve `part_id` sang `story_id` thông qua internal API v3.
  3. Bấm **Trích xuất Thông tin**: xem trước ảnh bìa HD (`-k512`) và danh sách parts đã lọc bỏ draft/ad.
  4. Bấm **Bắt đầu Tải Truyện**: kiểm tra quá trình sanitize thẻ `<p data-p-id>` và nhúng ảnh minh họa vào `OEBPS/images/`.
  5. Với các chương Paid Story (Wattpad Originals), hệ thống tự động ghi nhận thông báo `[Chương trả phí - Chưa mở khóa]` mà không làm gián đoạn tiến trình crawl.

### Kịch bản 3 — Generic Novel Site (Heuristic TOC & Readability)
- **Mục tiêu**: Kiểm tra thuật toán Heuristic fallback tự động nhận diện mục lục (TOC) và lọc văn bản chính theo mật độ text cho trang web lạ.
- **URL mẫu**: `https://example-novel-site.org/truyen-kiem-hiep/101`
- **Các bước thực hiện**:
  1. Nhập URL bất kỳ của một trang web truyện chưa có parser riêng.
  2. Hệ thống chuyển sang `Generic Heuristic Parser`.
  3. Thuật toán tự động quét cây DOM, gom cụm liên kết (link clustering) và chuẩn hóa toàn bộ relative URL thành absolute URL.
  4. Bấm **Trích xuất Thông tin** và kiểm tra danh sách chương được tự động lọc.
  5. Bấm **Bắt đầu Tải Truyện**: thuật toán Readability lọc bỏ header, sidebar, footer và quảng cáo.

### Kịch bản 4 — Xử Lý Lỗi, Retry & Đóng Gói EPUB
- **Mục tiêu**: Kiểm tra cơ chế tự động thử lại (Auto-Retry), bảng quản lý chương lỗi, nút "Tải lại các chương lỗi" và xuất file EPUB chuẩn.
- **Các bước thực hiện**:
  1. Giả lập lỗi mạng hoặc HTTP 429 (Rate Limit) trong quá trình tải chương.
  2. Hệ thống tự động retry với backoff tối đa 3 lần. Nếu vẫn thất bại, chương sẽ được ghi nhận vào bảng **Chương tải thất bại** (`#failed-chapters`) kèm mã lỗi HTTP và ISO timestamp.
  3. Bấm nút **Tải lại các chương lỗi** (`btn-retry-failed`): hệ thống tải bù duy nhất các chương bị lỗi mà không tải lại các chương đã thành công.
  4. Khi các chương lỗi được khắc phục thành công, chúng tự động được loại bỏ khỏi bảng lỗi và patch nội dung vào bộ sưu tập chương.
  5. Bấm nút **Xuất file EPUB** (`btn-export`): hệ thống đóng gói file `.epub` chuẩn IDPF OCF/OPS với uncompressed `mimetype` đầu tiên trong zip (STORE), file XHTML hợp lệ XML, và nạp thử trên Calibre / KOReader.

---

## 💻 Kiểm Thử Tự Động (Automated Test Suite)

Dự án tích hợp bộ kiểm thử toàn diện 100% offline, có thể thực thi trực tiếp bằng Node.js:

```bash
# Chạy toàn bộ test runner E2E
node tests/test-runner.js

# Chạy kiểm thử cho Milestone M5 (UI Studio, Error Management & Docs)
node tests/test-runner.js --milestone M5

# Chạy kiểm toán Codebase sạch (Zero TODOs, no empty stubs)
node tests/test-runner.js --feature 3
```

---

## 🛡️ Tiêu Chuẩn Kỹ Thuật & Khả Năng Offline
- **100% Offline**: Không sử dụng CDN hay tải tài nguyên từ xa. Mọi thư viện (`jszip.min.js`, `lucide.min.js`) đều được lưu trữ cục bộ.
- **Chuẩn Chrome MV3 CSP**: Tuân thủ tuyệt đối chính sách Content Security Policy của Manifest V3 (zero inline script, zero inline handlers, zero `eval`).
- **Chuẩn EPUB 3 / EPUB 2**: File `mimetype` uncompressed 20 bytes ở vị trí đầu tiên (STORE), `content.opf`, `toc.ncx`, `nav.xhtml`, font chữ UTF-8 hỗ trợ tiếng Việt có dấu.
