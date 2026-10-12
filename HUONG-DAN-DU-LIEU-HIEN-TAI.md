# Dữ liệu hiện tại của Clinic Management

**Trên máy này:** đã khôi phục vào PostgreSQL 17 native cổng **5433**, database **clinic_team_current**. Script đã được bổ sung nhánh native; không cần Docker. Mười tài khoản kiểm thử của máy này đã được gắn vào snapshot. Xem [HUONG-DAN-LOCAL.md](HUONG-DAN-LOCAL.md) để chạy đúng cấu hình hiện tại; các bước Docker bên dưới là hướng dẫn gốc của gói gửi.

Đây là snapshot mới xuất từ database **clinic_db**, PostgreSQL **16.15**, lúc **21:46 ngày 07/10/2026 (UTC+7)**. Có đầy đủ **143 bảng** và đối tượng database, dữ liệu tài khoản, bệnh nhân, phòng khám, bác sĩ, lịch hẹn, thu phí, nội dung web và lịch sử migration đang có tại thời điểm xuất.

## Áp dụng vào gói IntelliJ đã gửi

1. Giải nén ZIP mã nguồn `Clinic-management-IntelliJ-2026-10-07.zip`. Chép bản sửa `Clinic-management-bo-sung-public-content.zip` vào cùng thư mục gốc.
2. Giải nén ZIP dữ liệu này vào **đúng thư mục gốc dự án**, nơi có `backend`, `frontend`, `setup`. Sau đó sẽ có `database/clinic_db-current.dump` và `setup/restore-current-data.ps1`.
3. Mở Docker Desktop. Trong Terminal IntelliJ ở thư mục gốc, chạy:

```powershell
# Chỉ cần nếu chưa setup gói IntelliJ trên máy này:
pwsh -NoProfile -File setup/setup-dev.ps1

# Dừng ứng dụng nếu đang chạy, rồi khôi phục dữ liệu:
pwsh -NoProfile -File setup/stop-dev.ps1
pwsh -NoProfile -File setup/restore-current-data.ps1

# Build nếu chưa có hoặc vừa cập nhật mã nguồn, rồi khởi động:
pwsh -NoProfile -File setup/build-dev.ps1
pwsh -NoProfile -File setup/start-dev.ps1
```

**Không chạy seed-demo.ps1 sau khi khôi phục dữ liệu này.** Nội dung web của database hiện tại đã nằm trong snapshot.

Script tạo database mới **clinic_team_current** trong PostgreSQL của gói development, kiểm tra SHA256 của dump và đối chiếu số bản ghi của tất cả 143 bảng. Database cũ được giữ nguyên. Sau khi kiểm tra thành công, script lưu bản sao cấu hình trước đó và chuyển cấu hình ứng dụng sang database vừa khôi phục; clinic/branch ID được lấy đúng từ máy nguồn.

Nếu đã có `clinic_team_current`, script từ chối ghi đè. Muốn thêm một bản sao khác, dùng tên mới:

```powershell
pwsh -NoProfile -File setup/restore-current-data.ps1 -DatabaseName clinic_team_current_copy2
```

Website mặc định: http://127.0.0.1:4176/public và http://127.0.0.1:4176/workspace (hoặc cổng bạn đã chọn khi setup).

## Đăng nhập

Dùng **tài khoản và mật khẩu ứng dụng hiện tại**. Hash mật khẩu của tài khoản được giữ trong database; mật khẩu tài khoản demo của gói cũ không áp dụng cho snapshot này. Cấu hình kết nối database và khóa ký token được tạo riêng trên máy người nhận, không dùng bí mật từ máy nguồn. Phiên đăng nhập/token từ máy nguồn không dùng lại trên máy mới.

## File trong gói

- `database/clinic_db-current.dump`: toàn bộ snapshot PostgreSQL custom format, dùng PostgreSQL 16 trở lên để khôi phục.
- `database/snapshot.json`: thời điểm xuất, clinic/branch ID và checksum.
- `database/roles.json`, `role-memberships.json`: định nghĩa tên role và quan hệ quyền để khôi phục; không chứa mật khẩu role gốc.
- `database/table-counts.json`: số bản ghi từng bảng để đối chiếu.
- `setup/restore-current-data.ps1`: khôi phục vào database mới và cấu hình ứng dụng.

## Kiểm chứng

Đã khôi phục file dump này vào một PostgreSQL 16 riêng qua Docker; số bản ghi **143/143 bảng** trùng nguồn. Đã kiểm tra script từ chối database trùng tên và giữ nguyên cấu hình khi từ chối. Không reset hay ghi dữ liệu nghiệp vụ vào database nguồn trong quá trình xuất và kiểm tra.
