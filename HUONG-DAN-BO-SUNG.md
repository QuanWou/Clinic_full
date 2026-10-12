# Bản bổ sung sửa nội dung web công khai

**Trên máy này:** bản sửa đã được tích hợp; `seed-demo.mjs` giữ hỗ trợ PostgreSQL native và email tài khoản kiểm thử đã cấu hình. Database hiện tại đã khôi phục snapshot đầy đủ, nên không chạy seed demo. Xem [HUONG-DAN-LOCAL.md](HUONG-DAN-LOCAL.md) cho hướng dẫn chạy hiện tại.

Áp dụng cho Clinic-management-IntelliJ-2026-10-07.zip đã gửi trước đó.

## Cài bản bổ sung

1. Dừng ứng dụng ở Terminal trong thư mục dự án cũ:

```powershell
pwsh -NoProfile -File setup/stop-dev.ps1
```

2. Giải nén ZIP bổ sung vào đúng thư mục gốc dự án cũ, nơi có `frontend` và `setup`. Đồng ý chép đè các file trùng tên. Không tạo thêm tầng thư mục bên trong dự án.

3. Docker/database cần đang chạy. Build frontend, khởi động và bổ sung dữ liệu:

```powershell
npm --prefix frontend run build
pwsh -NoProfile -File setup/start-dev.ps1
pwsh -NoProfile -File setup/seed-demo.ps1
```

4. Seed báo `Public content endpoint verified: HTTP 200.` thì tải lại trang `/public`.

Nếu bạn đã có database demo từ gói cũ, chạy lại seed theo bước trên; không chạy reset/xóa volume hoặc tạo database mới. Seed giữ tài khoản và dữ liệu đã có, chỉ thêm nội dung web nếu bản ghi còn thiếu. Nếu đang setup lần đầu, chép bản bổ sung trước rồi theo HUONG-DAN-INTELLIJ.md của gói gốc.

## Nội dung sửa

- `setup/seed-demo.mjs`: chờ phòng khám được đồng bộ sang search, tạo bản ghi `search_v2.public_web_content` còn thiếu với hồ sơ bác sĩ/dịch vụ/chuyên khoa demo; xác minh endpoint `/content` trả HTTP 200. Nội dung web đã có sẽ được giữ.
- `frontend/src/api/booking.ts`: HTTP 404 của nội dung biên tập trả `null` để giao diện dùng thông tin cơ bản; lỗi 401/403/500 và lỗi kết nối vẫn được báo để khôi phục.
- `frontend/src/shells/PublicShell.tsx`: dùng cùng cách xử lý nội dung tùy chọn cho tải ban đầu, chọn phòng khám và đồng bộ nền.
- Hai file kiểm thử bổ sung các ca nội dung vắng mặt và lỗi thật.

Không kèm cấu hình riêng, dependency tải về hoặc backup database. Bản bổ sung không thay backend hay SQL migration.

## Kiểm chứng bản sửa

- 23 test liên quan đến public site và booking: pass.
- TypeScript/Vite build: pass.
- Seed trên database PostgreSQL 17 riêng: endpoint `/content` trả 200; seed lặp lại không trùng bản ghi.
- Trình duyệt Chromium: tải trang và đồng bộ nền với dữ liệu thật, thử nội dung trả 404, không xuất hiện banner lỗi hoặc JavaScript error.

Docker Desktop không khởi động được tại phiên kiểm tra này. Phần seed được kiểm tra với PostgreSQL riêng bằng adapter chỉ thay transport thực thi SQL Docker thành psql; adapter không nằm trong ZIP. Hướng dẫn chạy Docker của gói cũ vẫn áp dụng.
