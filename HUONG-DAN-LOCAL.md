# Dự án đã setup trên máy này

Thư mục mở trong IntelliJ:
`D:\Clinic-managementfinal\Clinic-management-IntelliJ-2026-10-07`

## Truy cập

- Bệnh nhân và đặt lịch: http://127.0.0.1:4176/public
- Đăng nhập nhân viên, bác sĩ, quản trị và kiểm duyệt: http://127.0.0.1:4176/workspace

## Tài khoản kiểm thử

Mật khẩu của các tài khoản được lưu riêng trong `.runtime/main/config.json`. Khi chạy kiểm thử, đặt biến môi trường `CLINIC_TEST_PASSWORD` theo cấu hình trên máy.

| Vai trò | Tài khoản 1 | Tài khoản 2 | Màn hình |
| --- | --- | --- | --- |
| Quản trị (ADMIN) | quantri1@gmail.com | quantri2@gmail.com | Tổng quan, nhân sự, cấu hình, tài chính |
| Nhân viên (STAFF) | nhanvien1@gmail.com | nhanvien2@gmail.com | Tiếp nhận, hàng đợi, thu phí, ca thu |
| Bác sĩ (DOCTOR) | bacsi1@gmail.com | bacsi2@gmail.com | Hàng đợi khám, hồ sơ, kết quả xét nghiệm |
| Bệnh nhân (PATIENT) | benhnhan1@gmail.com | benhnhan2@gmail.com | Đặt lịch, hồ sơ, hóa đơn, thông báo |
| Kiểm duyệt nền tảng | kiemduyet1@gmail.com | kiemduyet2@gmail.com | Kiểm duyệt và công bố phòng khám |

Nhân viên trong phiên bản này gộp chức năng lễ tân và thu ngân. Bác sĩ có cả màn hình kết quả xét nghiệm. Hai tài khoản quản trị có quyền ADMIN tại Phòng khám An Nhiên; chủ phòng khám trong snapshot được giữ nguyên.

Đã tích hợp hai ZIP được gửi bổ sung ngày 07/10/2026. Database đang dùng là snapshot Phòng khám An Nhiên, có đầy đủ 143 bảng được đối chiếu số bản ghi trước khi bổ sung tài khoản kiểm thử. Snapshot có 2.506 lịch hẹn ở bảng cũ và 63 lịch hẹn V2, cùng dữ liệu bệnh nhân, lượt khám, thu phí và nội dung public. Mã nguồn public đã được bổ sung cách xử lý nội dung biên tập vắng mặt.

Mười tài khoản kiểm thử ở bảng trên được thêm vào snapshot và giữ mật khẩu cũ. Các tài khoản có sẵn trong snapshot giữ mật khẩu gốc. Hai bác sĩ kiểm thử có lịch 08:00–17:00 và được gắn với chi nhánh hiện tại; hồ sơ này không đưa vào danh sách public để giữ nội dung phòng khám từ snapshot.

## Chạy từ IntelliJ

Project SDK dùng JDK **21**. Annotation processing đã bật. Maven reactor là `backend/pom.xml`. Các cấu hình chạy và build dưới đây tự lấy JDK 21 và Maven 3.9.9 đã có trên máy.

Trong danh sách Run Configuration ở góc trên, chọn:

- **Clinic - Run All**: khởi động cả năm service, API Gateway và frontend. Chạy lại khi hệ thống đã chạy sẽ kiểm tra tình trạng và giữ các tiến trình đang chạy.
- **Clinic - Stop All**: dừng các tiến trình ứng dụng của dự án.
- **Clinic - Build All**: tự dừng các tiến trình ứng dụng của dự án để giải phóng file JAR trên Windows, rồi build toàn backend và frontend.

Các cấu hình này dùng PowerShell 7 đã có trên máy và tự lấy đúng đường dẫn Java/Maven/Node đã lưu. Log nằm trong `.runtime/main/*.log` và `*.stderr`.

Launcher khởi động ứng dụng ở nền rồi kết thúc. Dùng **Clinic - Stop All** để dừng ứng dụng. PostgreSQL là Windows service riêng và không bị dừng bởi cấu hình này.

Sau khi sửa backend: **Build All → Run All**. Không cần bấm Stop All trước khi build; Build All tự dừng đúng các tiến trình do launcher của dự án quản lý, đồng thời giữ PostgreSQL và dữ liệu. Frontend đang dùng Vite dev server nên tự cập nhật khi sửa mã nguồn.

## PostgreSQL

Kết nối snapshot đã cấu hình trong IntelliJ với tên **Clinic Current PostgreSQL**. Chọn database **clinic_team_current** để xem dữ liệu mới; các kết nối cũ trỏ `clinic_final_dev` vẫn là bản demo trước khi nhập hai ZIP. Nếu IntelliJ chưa tải thay đổi kết nối từ file, mở lại dự án hoặc tạo Data Source PostgreSQL bằng JDBC URL trong bảng dưới.

| Thuộc tính | Giá trị |
| --- | --- |
| Server | PostgreSQL 17 cài sẵn trên máy |
| Host | 127.0.0.1 |
| Port | 5433 |
| Database | clinic_team_current |
| User quản lý | postgres |
| JDBC URL | jdbc:postgresql://127.0.0.1:5433/clinic_team_current |

PostgreSQL hiện có trên máy cho phép kết nối loopback bằng phương thức `trust`, nên kết nối `postgres` trên địa chỉ này không cần mật khẩu. Setup không thay đổi cấu hình xác thực PostgreSQL. Từng module ứng dụng dùng tài khoản runtime riêng với quyền theo SQL migration.

Database đã khôi phục cả schema V2 và schema cũ từ snapshot, cùng lịch sử migration, index, sequence, RLS và quyền runtime. Database demo trước đó `clinic_final_dev` vẫn được giữ trên cùng PostgreSQL. Bản sao cấu hình trước khi chuyển database nằm trong `.runtime/main/config-before-data-*.json`.

## Công cụ đang dùng

| Công cụ | Phiên bản / đường dẫn |
| --- | --- |
| JDK | Temurin 21.0.11 — `C:\Users\trung\.local\tools\jdk-21` |
| Maven | 3.9.9 — `C:\Users\trung\.local\tools\apache-maven` |
| Node.js | 24.12.0 — `D:\nodejs` |
| PostgreSQL | 17 — `C:\PostgreSQL\17` |
| PowerShell 7 | `C:\Users\trung\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe` |

Đã dùng các công cụ có sẵn; Maven và npm dependency của dự án đã được tải vào cache và `frontend/node_modules`.

## Chạy bằng PowerShell khi cần

Từ thư mục dự án, dùng PowerShell 7:

```powershell
pwsh -NoProfile -File setup/start-local.ps1
pwsh -NoProfile -File setup/stop-dev.ps1
pwsh -NoProfile -File setup/build-local.ps1
```

Nếu terminal chưa nhận lệnh `pwsh`, dùng đường dẫn đầy đủ trong bảng công cụ.

Cấu hình riêng nằm tại `.runtime/main/config.json`. Giữ file này khi chạy lại để giữ tài khoản, database và khóa giữa các service. Thư mục `.runtime` được loại khỏi Git.

## Các cổng

Identity 18001; Doctor 18002; Patient 18003; Appointment 18004; Billing 18005; API Gateway 18090; frontend 4176; PostgreSQL 5433.

## Khôi phục snapshot thành một bản sao mới

Đã bổ sung hỗ trợ PostgreSQL native cho `setup/restore-current-data.ps1`; trên máy này script tự dùng PostgreSQL 17 cổng 5433. Script từ chối tên database đã tồn tại. Không cần khôi phục lại để dùng dữ liệu hiện tại.

```powershell
pwsh -NoProfile -File setup/stop-dev.ps1
pwsh -NoProfile -File setup/restore-current-data.ps1 -DatabaseName clinic_team_current_copy2
node setup/link-snapshot-test-accounts.mjs
pwsh -NoProfile -File setup/start-local.ps1
$env:CLINIC_TEST_PASSWORD='<mat-khau-kiem-thu-tren-may>'
node setup/link-snapshot-test-accounts.mjs --verify
pwsh -NoProfile -File setup/configure-intellij.ps1
```

Tất cả bước khôi phục đã được thực hiện cho `clinic_team_current`. Không chạy `seed-demo`, `seed-local` hoặc `seed-local-content` lên snapshot; các script này có kiểm tra để tránh thay nội dung phòng khám bằng dữ liệu demo. Thanh toán online vẫn cần tài khoản và cấu hình nhà cung cấp thanh toán riêng.

## Kết quả kiểm tra

- Backend và frontend build thành công; năm core service và gateway báo `UP`, frontend trả HTTP 200.
- Cả 10 tài khoản đăng nhập thành công và có đúng quyền.
- Đã mở các màn hình quản trị, tiếp nhận, thu phí, hàng đợi bác sĩ, kiểm duyệt và tài khoản bệnh nhân bằng trình duyệt.
- Snapshot đã đối chiếu đủ 143/143 bảng trước khi thêm tài khoản kiểm thử; checksum dump trùng gói gửi.
- Toàn bộ 185 bài kiểm tra frontend trong 27 file đã đạt khi chạy suite với hai worker.
- Kết quả khôi phục nằm ở `.runtime/main/snapshot-table-verification.json`; kiểm tra tài khoản ở `.runtime/main/account-verification.json`.
- Trang public hiển thị 18 bác sĩ, 6 dịch vụ và 6 chuyên khoa. Workspace quản trị đọc được các số liệu tiếp nhận, hàng đợi và tài chính trong snapshot.
- Ảnh kiểm tra nằm ở `.runtime/main/setup-review/snapshot-public.jpg` và `snapshot-admin.jpg`.
