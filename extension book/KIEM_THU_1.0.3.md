# Kết quả bản 1.0.3 (Cập nhật Sửa lỗi Hiển thị Thời gian & Thêm Hàng đợi Tải nhiều truyện)

- Bộ kiểm thử hiện có: 294/294 đạt (mô phỏng Chrome/DOM), 0 lỗi.
- batch-and-timer-regression.js: đạt; tính toán tốc độ chính xác cho crawl chậm (0.04 ch/s không bị làm tròn thành 0.0), tính toán ETA đầy đủ và định dạng cả phút và giây (Xm Ys / Xh Ym Zs), cơ chế đếm ngược thời gian chờ (Chờ: 01m 24s -> 01m 23s) với callback onWaitTick và đồng hồ tick 1s độc lập trên DOM mà không spam nhật ký hoạt động, xử lý hàng đợi nhiều truyện (Batch Queue) với giới hạn đồng thời và tự động xuất EPUB.
- durable-progress-regression.js: đạt; lưu 4 chương ở tiến trình thứ nhất, đọc lại trong tiến trình mới, khôi phục giao diện không gọi mạng, chỉ lấy chương 5–6 đã chọn và giữ chương 7–8 chưa chọn; nhập lại tệp JSON sau khi bộ nhớ trống; tệp hỏng không ghi đè phiên; báo thất bại khi không có bộ nhớ bền vững hoặc ghi lỗi.
- crawl-lifecycle-regression.js: đạt; thời gian nghỉ, tạm dừng/tiếp tục, hủy, lưu nội dung và thứ tự ghi điểm dừng.
- cloudflare-recovery-regression.js và slow-scroll-regression.js: đạt trong phiên sửa này.
- Gói cài kiểm tra manifest.json ngay gốc, phiên bản 1.0.3, tài nguyên khai báo tồn tại và ZIP đọc không lỗi.

## Các cải tiến và sửa lỗi chính trong lần cập nhật này:

1. **Khắc phục lỗi không hiện thời gian còn lại (Thời gian còn lại: --:--)**:
   - Nguyên nhân trước đây: Khi tốc độ tải chậm (dưới 0.05 ch/s do có delay đọc hoặc Cloudflare), công thức làm tròn 1 chữ số thập phân đã ép tốc độ về 0.0 ch/s, dẫn đến ETA = 0 và hiển thị mặc định `--:--`.
   - Khắc phục: Giữ độ chính xác thập phân phù hợp (`rawSpeed`), tính toán ETA thực tế (`remaining / rawSpeed`), hiển thị cả giờ, phút và giây (`Xh Ym Zs` hoặc `Ym Zs`).
   - Có cơ chế đếm ngược ETA trực tiếp mỗi giây trong lúc tải.

2. **Cơ chế đếm ngược thời gian chờ (Chờ giữa các chương / Anti-bot / WPM Delay)**:
   - Hiển thị đầy đủ cả phút và giây: ví dụ `⏳ Đang chờ: 01m 24s`, `⏳ Đang chờ: 00m 45s`.
   - Có cơ chế đếm ngược tự động mỗi giây (1s ticker) trên giao diện thanh tiến độ (`#progress-wait-timer`).
   - Hoàn toàn KHÔNG chạy trong nhật ký hoạt động (activity log): Nhật ký chỉ ghi một dòng thông báo trạng thái khi bắt đầu khoảng chờ, không bị spam từng giây một, giữ cho bảng log luôn sạch sẽ, rõ ràng.
   - Khi bấm Tạm dừng, thời gian chờ còn lại được giữ nguyên (`⏸ Tạm dừng chờ: 01m 24s`) và đếm tiếp khi bấm Tiếp tục.

3. **Cơ chế tải nhiều truyện đồng thời (Batch / Multi-Novel Crawler)**:
   - Tab mới trên thanh điều hướng: **Tải nhiều truyện**.
   - Hỗ trợ dán danh sách nhiều URL truyện cùng lúc (mỗi dòng một liên kết).
   - Tự động phát hiện parser và nạp mục lục chạy ngầm cho từng truyện.
   - Cho phép tùy chọn số truyện tải đồng thời (1, 2, 3, 4 truyện cùng lúc).
   - Tự động đóng gói và tải về file EPUB khi mỗi truyện hoàn thành (`batchAutoExport`).
   - Quản lý hàng đợi độc lập: Bắt đầu tất cả, Tạm dừng tất cả, Dừng tất cả, Xóa truyện đã xong.
   - Lưu trữ tiến trình và nội dung tải độc lập cho từng truyện trong hàng đợi (`vtpate_batch_story_${id}`), không lo bị ghi đè.
   - Hỗ trợ nút "Mở truyện" để nạp ngay truyện từ hàng đợi vào giao diện quản lý chi tiết bất kỳ lúc nào.

4. **Bổ sung ô tìm kiếm & lọc nhanh danh sách chương**:
   - Thêm ô lọc theo từ khóa tiêu đề chương ngay trên thanh công cụ chọn khoảng chương, giúp người dùng dễ dàng tìm kiếm ngoại truyện, chương đặc biệt khi danh sách có hàng ngàn chương.
