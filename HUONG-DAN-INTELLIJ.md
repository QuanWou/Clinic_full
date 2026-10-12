# Setup Clinic Management trên IntelliJ IDEA

Gói này chứa toàn bộ src backend/frontend hiện tại, kể cả file chưa commit, tài nguyên ảnh, SQL migration, Maven POM, package-lock, script, tài liệu và dữ liệu danh mục của dự án.

## 1. Phần mềm cần cài

- IntelliJ IDEA có hỗ trợ Java/Maven. Có thể dùng Terminal trong IntelliJ để chạy tất cả các bước dưới đây.
- JDK **21**; Maven **3.9.x** trên PATH (kiểm tra `java -version`, `mvn -version`).
- Node.js **22.19 trở lên trong nhánh 22** hoặc **24 trở lên** và npm (kiểm tra `node -v`, `npm -v`). Phiên bản dependency được khóa trong frontend/package-lock.json.
- PowerShell **7.4 trở lên**: lệnh `pwsh`. Không dùng Windows PowerShell 5.1 cho launcher.
- Docker Desktop đang chạy Linux containers. PostgreSQL 16 sẽ tự tải khi setup; không cần cài PostgreSQL trên Windows.
- Internet cho lần tải Maven dependency, npm dependency và Docker image đầu tiên. RAM khoảng 8 GB trở lên để chạy cả IDE, Docker và 6 JVM.

## 2. Mở dự án

Giải nén ZIP vào thư mục riêng, ví dụ `D:\Projects\Clinic-management`.
Trong IntelliJ: File → Open → chọn thư mục vừa giải nén.
Thêm `backend/pom.xml` như Maven project (mở pom hoặc dùng Add as Maven Project nếu IDE chưa tự nhận).
Đặt Project SDK và Maven Runner JRE = JDK 21. Reload Maven projects.
Nếu IDE báo lỗi Lombok/MapStruct, bật annotation processing trong Settings → Build, Execution, Deployment → Compiler → Annotation Processors.
Mở Terminal ở thư mục gốc dự án, nơi có backend, frontend và setup.

## 3. Setup và chạy lần đầu

Chạy tuần tự:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File setup/setup-dev.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File setup/build-dev.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File setup/start-dev.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File setup/seed-demo.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File setup/stop-dev.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File setup/start-dev.ps1
```

Setup tạo database độc lập `clinic_team_dev` cổng 55432, role runtime riêng và cấu hình/mật khẩu ngẫu nhiên trong `.runtime/main`. Các module tự chạy Flyway khi khởi động. Auth migration được bootstrap trước vì core auth không tự chạy Flyway. Seed tạo dữ liệu giả lập: 1 phòng khám, 1 chi nhánh, 1 bác sĩ, 1 dịch vụ, 1 điểm khám và 5 tài khoản; không có lịch sử khám/thanh toán sẵn.

Mở **http://127.0.0.1:4176/public** hoặc **http://127.0.0.1:4176/workspace**.
Tài khoản: `owner@clinic-demo.local`, `reception@clinic-demo.local`, `doctor@clinic-demo.local`, `patient@clinic-demo.local` và `platform@clinic-demo.local` (kiểm duyệt). Mật khẩu được in khi chạy seed và lưu ở `demoPassword` trong config trên máy mỗi người.

Backend gồm 5 core ở 18001–18005 và API Gateway ở 18090. Chạy toàn bộ hệ thống qua Terminal IntelliJ bằng launcher ở trên. Common-lib, realtime-lib, core-runtime và các module con không chạy riêng. Các core dùng chung class Main `com.clinic.runtime.CoreApplication` và cần manifest/environment tương ứng; bấm Run tùy ý vào module con sẽ thiếu cấu hình.

## 4. Những lần sau và chỉnh sửa code

Nếu đã dừng Docker, chạy lại setup-dev.ps1 để bật database; mật khẩu và dữ liệu sẽ được giữ.
Sau khi sửa backend, dừng, build rồi khởi động lại:

```powershell
pwsh -NoProfile -File setup/stop-dev.ps1
pwsh -NoProfile -File setup/build-dev.ps1
pwsh -NoProfile -File setup/start-dev.ps1
```

Frontend dùng Vite dev server nên tự cập nhật khi sửa src.
Không chạy script seed/sandbox lịch sử trong scripts để setup gói này; chúng phụ thuộc môi trường gốc. README gốc và docs/OPERATIONS.md mô tả máy vận hành cũ; ưu tiên hướng dẫn này khi dùng ZIP.

## 5. Lỗi thường gặp

- Cổng bị chiếm: lúc setup đầu tiên, dùng `setup/setup-dev.ps1 -DatabasePort 55433 -CorePortBase 19000 -GatewayPort 19090 -WebPort 4276`. Đối với config đã tạo, sửa `ports` trong config khi ứng dụng đã dừng. Nếu đổi cổng database sau khi tạo, chạy lại setup để cập nhật Docker mapping.
- Java sai phiên bản: `mvn -version` và IntelliJ Maven Runner phải cùng dùng Java 21.
- Docker chưa chạy: mở Docker Desktop, chờ engine sẵn sàng rồi chạy setup lại.
- Backend lỗi: xem `.runtime/main/<service>.log` và `<service>.stderr`; các tiến trình chỉ được dừng bởi stop-dev.ps1 theo thông tin sở hữu.
- Maven/npm chưa có trong PATH: cài phần mềm, đóng và mở lại Terminal/IntelliJ.
- Thanh toán online cần cấu hình nhà cung cấp riêng, mặc định chưa bật trong bản demo.

## 6. Kiểm tra và chia sẻ

```powershell
mvn -f backend/pom.xml test
npm --prefix frontend run build
npm --prefix frontend test
```

Một số test tích hợp cần database sandbox riêng. Không trỏ test tạo dữ liệu vào database đang dùng.
ZIP không chứa dependency tải về (node_modules), output build (target/dist), .git, cấu hình bí mật .env/.runtime, log hay bản backup database trên máy gốc. Các thành viên tải dependency bằng build-dev.ps1. Không đưa .runtime của mình vào ZIP chia sẻ lại.
