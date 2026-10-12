# Hướng dẫn vận hành và kiểm thử dự án phòng khám

Mở **Huong-dan-van-hanh-va-bao-ve-du-an.docx** để đọc hướng dẫn theo vai trò, các bước đặt lịch đến thu tiền, vấn đề còn tồn tại và câu trả lời C1–C10. Phần 14 của tài liệu hướng dẫn thực hành Postman; phần 16 dành cho bảo vệ.

## Import Postman

1. Chạy `Clinic - Run All` trong IntelliJ. Gateway cần hoạt động tại `http://127.0.0.1:18090`.
2. Trong Postman chọn **Import → files**, chọn `Clinic-Identity-Gateway-Auth-Account.postman_collection.json` và `Clinic-Local.postman_environment.json`.
3. Chọn environment **Clinic Local**, kiểm tra các biến cổng và email. Collection tự lấy token và ID; không cần dán token.
4. **Run toàn bộ collection theo thứ tự 00–08**, một iteration. Tiếp tục sau assertion lỗi để thực thi cleanup.
5. Mở `Ket-qua-kiem-thu.html` để so kết quả đã chạy; CSV có HTTP mong đợi, thực tế và assertion chưa đạt từng ca.

Collection tạo ba tài khoản riêng có tiền tố `postman.` mỗi lần chạy, chỉ thay đổi các fixture này, rồi thu hồi membership và chuyển chúng sang INACTIVE. Các tài khoản được cấp trước chỉ dùng đăng nhập và đọc. Không thay ID fixture bằng ID tài khoản đang sử dụng. Nếu dừng giữa chừng, kiểm tra các fixture trước khi chạy bước cleanup.

Environment được tạo trên máy từ `.runtime/main/config.json` hoặc biến môi trường `CLINIC_TEST_PASSWORD` và được loại khỏi Git vì chứa mật khẩu local. Báo cáo HTML/JSON và nhật ký đã loại token, password hash và nội dung bệnh án. Không đưa environment lên workspace công khai.

Cách import được mô tả trong [tài liệu chính thức Postman](https://learning.postman.com/v11/docs/getting-started/importing-and-exporting/importing-data). Cách chạy file collection cục bộ bằng CLI được đối chiếu với [Postman CLI collection commands](https://learning.postman.com/docs/postman-cli/postman-cli-collections).

## Kết quả đã thực thi

- **Postman CLI 1.70.0 chính thức và Newman**: 132 ca, 134 yêu cầu HTTP, 288 assertions; 121 ca đạt, 11 ca chưa đạt; 276 assertions đạt, 12 chưa đạt. Không dùng Postman desktop để tạo bằng chứng chạy tự động.
- **Maven**: 166 test thực thi đạt, 184 test bị skip; 180 ca chưa bật flag tích hợp, ba ca thiếu Docker, một ca thiếu CLINIC_SECURITY_TEST_DB. Không có failure/error trong các ca đã thực thi.
- **Frontend**: build đạt. Lượt chạy toàn bộ có 188/195 test đạt và bảy ca lỗi thời gian chờ; chạy lại tuần tự ba file liên quan với timeout test 20 giây đạt 46/46. Tổng hợp các lượt kiểm tra bao phủ 195 ca hiện tại; bộ test còn nhạy với thời gian.
- **Runtime**: Gateway và năm core đều UP; 10 tài khoản yêu cầu ACTIVE; database `clinic_team_current` ở PostgreSQL cổng 5433.

Năm vấn đề API **chưa sửa backend** trong đợt rà soát:

| Mức ưu tiên | Ca liên quan | Vấn đề |
| --- | --- | --- |
| Cao | DI01 DI02 | Thu hồi phiên IAM chưa chặn access và refresh ở Authentication |
| Vừa | AC03 AC04 AC05 AC25 GW04 | Người đã đăng nhập nhưng thiếu quyền Account Admin nhận 401 thay vì 403 |
| Vừa | DI03 | Role JSON không hợp lệ trả 500 thay vì 400 |
| Vừa | RG01 RG02 | accountCode null trong response đăng ký, có mã khi đọc lại |
| Thấp | DI04 | Email chữ hoa không đăng nhập được tài khoản email chữ thường |

Không đổi assertion sang hành vi lỗi hiện tại chỉ để báo cáo toàn bộ xanh. `Ket-qua-kiem-thu.json` là báo cáo đã lọc bí mật; không phát hành `newman-raw.json` trong runtime vì có token.

## Chạy bằng dòng lệnh

Từ thư mục gốc dự án, dùng công cụ đã cài tại `.runtime/main/qa-tools`:

```powershell
$env:Path='D:/nodejs;'+$env:Path
& '.\.runtime\main\qa-tools\node_modules\.bin\postman.cmd' collection run `
  '.\docs\kiem-thu-va-huong-dan-2026-10-08\Clinic-Identity-Gateway-Auth-Account.postman_collection.json' `
  -e '.\docs\kiem-thu-va-huong-dan-2026-10-08\Clinic-Local.postman_environment.json' `
  --no-report-events --timeout-request 20000 --timeout-script 30000 --delay-request 20
```

Exit code 1 là đúng khi còn assertion thất bại. File cục bộ chạy không cần đăng nhập cloud; thông báo yêu cầu credential để xuất lên Postman cloud không phủ định kết quả thực thi local. Kết quả gốc đã được lưu và lọc trong báo cáo đi kèm.

## Phạm vi và giới hạn

Đã rà 17 trang workspace và 17 trang public/tài khoản ở desktop. Chưa xác minh đầy đủ mobile, tải lớn, provider callback, mất mạng hay một vòng khám và thu tiền mới trên database đang sử dụng. Hai tài khoản bác sĩ nội bộ chưa công bố trên danh sách bác sĩ công khai; xem phần 3 của DOCX để chuẩn bị đúng bác sĩ cho vòng thực hành.

Các sửa giao diện gồm kiểm duyệt nền tảng, hồ sơ phòng khám dạng tab, dọn component/CSS không dùng và đổi nội dung hiển thị demo/minh họa thành câu ngắn thích hợp. Không xóa schema hay bảng nghiệp vụ cùng việc dọn giao diện.
