# VTPATE — Tải truyện và tạo EPUB

## Cài đặt và cập nhật

1. Mở trang tiện ích của Cốc Cốc bằng coccoc://extensions hoặc Chrome bằng chrome://extensions.
2. Bật Chế độ dành cho nhà phát triển.
3. Chọn **Tải tiện ích đã giải nén (Load unpacked)** và chọn thư mục chứa tệp này.
4. Khi cập nhật mã, bấm **Tải lại** tiện ích, đóng trang quản lý cũ rồi mở lại.
5. Xem hướng dẫn các tùy chọn trong HUONG_DAN_CAI_DAT.txt.

## Kiểm thử tự động

Chạy từ thư mục dự án D:\vtpate bằng PowerShell:

```powershell
$env:VTPATE_TEST_ROOT = 'D:/vtpate/extension book'
node tests/test-runner.js
```

Bộ kiểm thử dùng dữ liệu và API trình duyệt mô phỏng. Kết quả tự động cần được bổ sung bằng các bước kiểm thử thủ công bên dưới trên Cốc Cốc. Những nhóm có trong bộ kiểm thử gồm tải trực tiếp, tải qua thẻ, thử lại, lưu cấu hình, điểm dừng, phân tích nội dung và cấu trúc EPUB.

## Kiểm thử thủ công trên Cốc Cốc

Dùng một truyện có ít nhất ba chương mà tài khoản hiện tại đọc được. Mỗi lần kiểm thử chỉ chọn ba chương để dễ đối chiếu.

### Inkitt

Trang bắt đầu: https://www.inkitt.com/
1. Mở một truyện đọc được và sao chép địa chỉ trang truyện.
2. Dán vào tiện ích, trích xuất thông tin và đối chiếu tên truyện, tác giả, mục lục với trang gốc.
3. Chọn ba chương, tải rồi xuất EPUB.
4. Mở EPUB bằng trình đọc sách và đối chiếu thứ tự, tiêu đề, nội dung của ba chương.
Kết quả cần đạt: thông tin đúng, ba chương đủ nội dung và đúng thứ tự.

### Wattpad

Trang bắt đầu: https://www.wattpad.com/
1. Đăng nhập nếu trang yêu cầu, chọn một truyện có chương miễn phí đọc được.
2. Lấy thông tin, chọn ba chương miễn phí, tải và xuất EPUB.
3. Kiểm tra dấu tiếng Việt, đoạn văn và hình ảnh nếu chương có ảnh.
4. Nếu gặp chương khóa, kiểm tra thông báo hoặc dấu đánh dấu chương khóa trong kết quả.
Kết quả cần đạt: các chương đọc được xuất đúng nội dung và dấu tiếng Việt, trạng thái chương khóa được thể hiện.

### Chờ, tạm dừng và dừng hẳn

1. Bật nghỉ theo độ dài chương và tải ba chương.
2. Quan sát nhật ký: mỗi khoảng nghỉ chỉ có một dòng ghi số giây cần chờ.
3. Bấm Tạm dừng trong thời gian nghỉ, chờ một lúc rồi bấm Tiếp tục.
4. Kiểm tra chương tiếp theo chỉ bắt đầu sau khi hết phần thời gian chờ còn lại.
5. Bấm Dừng hẳn khi đang nghỉ và kiểm tra không có chương mới bắt đầu.
6. Cuộn lên trong nhật ký khi chương tiếp theo hoàn tất.
Kết quả cần đạt: nút điều khiển hoạt động, nhật ký giữ vị trí khi đang đọc dòng cũ.

### Xác minh trang web

1. Nếu trang tải chương hiện xác minh Cloudflare, quan sát nhật ký.
2. Hoàn thành xác minh trực tiếp trên thẻ trình duyệt.
3. Kiểm tra tiện ích tiếp tục lấy đúng chương sau xác minh.
4. Kiểm tra nút Dừng hẳn trong một lần đang chờ xác minh.
Kết quả cần đạt: giữ nguyên chương trong thời gian xác minh và dừng được khi người dùng yêu cầu.

### Điểm dừng và tải lại từ đầu

1. Tải một chương, tạm dừng và bấm Lưu điểm dừng.
2. Dừng phiên tải, đóng rồi mở lại trang quản lý.
3. Khôi phục điểm dừng, bấm Xem chương đã tải và kiểm tra chương vừa lưu.
4. Tải tiếp, xuất EPUB và kiểm tra cả chương trước lẫn sau khi khôi phục.
5. Dừng phiên tải rồi bấm Xóa điểm dừng và tải lại từ đầu.
Kết quả cần đạt: nội dung đã lưu được khôi phục; sau khi xóa, danh sách đã tải trống và toàn bộ chương được chọn lại.
Điểm dừng từ phiên bản cũ chỉ lưu số chương cần được tải lại nội dung.

### Lỗi mạng và tải lại chương lỗi

1. Ngắt mạng trong một lần tải thử rồi kết nối lại.
2. Kiểm tra chương lỗi có thông báo và xuất hiện trong bảng chương thất bại.
3. Bấm Tải lại chương lỗi.
Kết quả cần đạt: chương khôi phục thành công rời khỏi danh sách lỗi; nội dung chương đã tải trước đó được giữ lại.

### Kiểm tra EPUB và chuyển truyện

1. Bấm Xem chương đã tải, đối chiếu số chương với những chương vừa tải thành công.
2. Xuất EPUB, dùng Mở EPUB để kiểm tra và đối chiếu các mục theo thứ tự đọc.
3. Mở tệp bằng trình đọc EPUB để kiểm tra định dạng thực tế.
4. Nạp một truyện khác và kiểm tra danh sách chương đã tải được làm trống.
Kết quả cần đạt: EPUB có đủ chương đã tải và không lẫn nội dung giữa hai truyện.
Danh sách đọc từ EPUB có thể bao gồm bìa, giới thiệu và mục lục.

## Ghi nhận kết quả

Với mỗi lần kiểm thử thủ công, ghi phiên bản tiện ích, trình duyệt, địa chỉ truyện, cấu hình tải, bước thực hiện, kết quả thực tế và đoạn nhật ký liên quan. Phân biệt kết quả đã kiểm tra trên trang thật với kết quả mô phỏng tự động.


## Lưu nội dung và điều khiển phiên tải

- Nội dung được tự lưu vào điểm dừng sau mỗi chương tải thành công. Phiên hoàn tất vẫn giữ điểm dừng để khôi phục.
- Tạm dừng giữ lại thời gian chờ còn lại. Tiếp tục mới tính tiếp khoảng chờ đó.
- Dừng hẳn chặn việc bắt đầu chương mới. Nếu yêu cầu đang chạy trả về nội dung hợp lệ, nội dung đó được lưu trước khi phiên kết thúc.
- Lỗi ghi bộ nhớ được báo trong nhật ký. Khi đó nên xuất EPUB trước khi đóng trang.
- Xuất EPUB tạo tệp và gửi yêu cầu lưu cho trình duyệt. Kiểm tra danh sách tải xuống để xác nhận tệp đã lưu xong.
- Chạy bài kiểm thử bổ sung từ thư mục gốc bằng lệnh `node tests/crawl-lifecycle-regression.js`.


## Bản 1.0.2: nhận diện xác minh và xử lý thẻ đang chờ

- Không coi script nền `challenge-platform`, chuỗi trong JavaScript hoặc lời thoại trong truyện là trang xác minh Cloudflare.
- Khi trang đang hiển thị xác minh thật, giữ chương hiện tại để người dùng xác minh. Nội dung xuất hiện thì trích xuất ngay; việc cuộn và nghỉ vẫn tiếp tục sau khi lưu.
- Với Gia Tộc Vương Tài, đợi vùng `div.reader-demo-body` có chữ (hoặc bộ chọn nội dung tùy chỉnh), tránh lưu nhầm giao diện SPA chưa tải xong. Hết thời gian chờ nội dung sẽ báo lỗi nội dung, không báo nhầm Cloudflare.
- **Tải lại thẻ**: lưu điểm dừng, tạm dừng và mở lại đúng địa chỉ của thẻ tải chương. Vẫn tạm dừng sau khi tải lại, không chuyển chương tự động.
- **Kiểm tra và tiếp tục**: tiếp tục lấy chương đang chờ khi đã có nội dung; nếu chương đã lưu và đang nghỉ thì tiếp tục thời gian còn lại. Không khởi động lại danh sách, không xóa chương đã lưu.
- Các nút xử lý thẻ dùng trong chế độ tải qua thẻ trình duyệt; có thể dùng cả khi tải lại danh sách chương lỗi.
- **Dừng hẳn** hủy chờ xác minh, kể cả khi đang tạm dừng.

Cập nhật an toàn: trước khi tải lại tiện ích trên `coccoc://extensions`, bấm Dừng hẳn và chờ lưu điểm dừng (có thể xuất EPUB để giữ thêm bản sao). Sau đó tải lại tiện ích, mở lại trang quản lý, khôi phục điểm dừng của truyện và tải tiếp các chương còn thiếu. Nút “Tải lại thẻ” trong phiên đã cập nhật không cần làm lại các bước này.

Kiểm thử bổ sung: `node tests/cloudflare-recovery-regression.js`. Kiểm tra mô phỏng nhận diện Cloudflare thật/giả, nội dung SPA, tạm dừng/tải lại/tiếp tục, loại bỏ kết quả cũ khi tải lại, dừng khi đang xác minh và bảo toàn chương đã lưu. Các kiểm thử tự động không thay thế xác nhận trên Cốc Cốc với phiên đăng nhập thật.


## Bản 1.0.3 — Lưu đầy đủ và khôi phục phiên

- Tự ghi mục lục, thông tin truyện, cấu hình tải, phông chữ tùy chỉnh, nội dung đã tải và danh sách chương chờ. Không cần quét lại mục lục khi mở phiên đã lưu theo định dạng mới.
- Mở giao diện tự khôi phục phiên gần nhất; bấm Tải tiếp để chạy những chương đã chọn còn thiếu. Việc mở giao diện không tự phát sinh lượt tải chương.
- Nút Lưu tiến trình ngay, Tải tệp tiến trình và Nhập tệp tiến trình nằm trong Tải và nhật ký. Tệp JSON chứa nội dung chương, dùng khi chuyển máy hoặc cài lại tiện ích.
- Quyền unlimitedStorage giảm nguy cơ chạm hạn mức mặc định khi lưu truyện dài. Lỗi ghi thực tế vẫn được báo và làm tạm dừng; bộ nhớ RAM không được báo là đã lưu bền vững.
- Dữ liệu thuộc hồ sơ trình duyệt và lần cài tiện ích. Cập nhật bằng cách giải nén đè vào cùng thư mục, không gỡ tiện ích. Tệp tiến trình cần được giữ nếu xóa dữ liệu hoặc đổi lần cài.
- Bản ZIP đặt manifest.json ngay gốc. Đọc HUONG_DAN_CAI_DAT.txt trước khi cập nhật.

Kiểm thử bổ sung từ mã nguồn: `node tests/durable-progress-regression.js`. Bài này dùng các tiến trình Node riêng với bộ nhớ mô phỏng ghi xuống đĩa, khôi phục giao diện không truy cập web, tải tiếp từ chương 5 sau bốn chương đã lưu, xuất/nhập JSON và kiểm tra tệp hỏng/lỗi ghi. Chưa chạy trên phiên Cốc Cốc thật của người dùng.
