# Kiểm thử bản 1.0.2 — 19/11/2026

## Kết quả tự động

- Bộ kiểm thử hiện có: 294 đạt, 0 lỗi; chạy với VTPATE_TEST_ROOT trỏ vào thư mục extension book.
- cloudflare-recovery-regression.js: đạt. Kiểm tra script Cloudflare nền, lời thoại chứa chuỗi nhận diện, trang xác minh thật, đợi nội dung SPA, trang rỗng, lỗi điều hướng tạm thời, tạm dừng/tải lại/tiếp tục, loại kết quả cũ, dừng khi đang xác minh và nút giao diện giữ nội dung đã lưu.
- crawl-lifecycle-regression.js: đạt. Chờ 492 giây, đóng băng thời gian khi tạm dừng, bộ hẹn giờ thẻ nền, hủy, lưu nội dung đang tải và tuần tự ghi điểm dừng.
- slow-scroll-regression.js: đạt. Lưu nội dung ngay, cuộn trải theo 249 giây nghỉ, không cộng thêm thời gian cuộn.
- Kiểm tra cú pháp JavaScript, phiên bản manifest, mã nút không trùng và tham chiếu tệp script: đạt.

Các bài trên dùng mô phỏng Chrome/DOM/đồng hồ. Chưa kiểm thử trực tiếp trang giatocvuongtai.com trong Cốc Cốc với tài khoản của người dùng.

## Kiểm tra trực tiếp sau khi cập nhật

1. Dừng hẳn phiên cũ, chờ lưu điểm dừng; có thể xuất EPUB dự phòng.
2. Tải lại tiện ích trong coccoc://extensions, mở lại trang quản lý và xác nhận phiên bản 1.0.2. Khôi phục điểm dừng, kiểm tra danh sách chương đã lưu rồi tải tiếp.
3. Khi nội dung chương đã xuất hiện, xác nhận chương được lưu và không báo xác minh chỉ vì có script Cloudflare nền.
4. Khi đang tải hoặc đang chờ xác minh, bấm Tải lại thẻ. Xác nhận vẫn tạm dừng sau tải lại, các chương đã lưu không mất.
5. Kiểm tra hoặc tự xác minh trên thẻ truyện. Bấm Kiểm tra và tiếp tục; xác nhận không tải lại từ chương đầu, chương mới chỉ lưu một lần.
6. Nếu đang nghỉ sau chương đã lưu, tạm dừng/tải lại/tiếp tục phải giữ phần nghỉ còn lại. Dừng hẳn phải hủy được chờ xác minh.
7. Xuất EPUB và đối chiếu danh sách chương đã lưu.
