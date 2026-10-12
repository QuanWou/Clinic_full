# Kiểm tra gói ngày 07/10/2026

Đã xác minh từ bản sao mã nguồn trong gói, sử dụng database PostgreSQL 16 mới và cổng kiểm thử riêng:

- Maven clean package toàn bộ backend: thành công.
- npm ci từ package-lock, TypeScript và Vite build: thành công.
- Khởi tạo database, auth migration và các role runtime: thành công.
- Flyway migrations và khởi động 5 core cùng API Gateway: thành công; 6 health endpoint trả UP.
- Frontend trả HTTP 200 và proxy gateway hoạt động.
- Seed dữ liệu giả lập: thành công.
- Đăng nhập 5 tài khoản demo, IAM current/context, hồ sơ bệnh nhân, danh sách phòng khám công khai và điểm khám: thành công.
- Đối chiếu SHA256 của toàn bộ file src với workspace nguồn khi đóng gói: thực hiện khi tạo ZIP.

Kiểm tra này xác nhận quy trình setup và smoke test, chưa chạy toàn bộ bộ test nghiệp vụ/E2E. Không kèm backup database gốc; dữ liệu giả lập được tạo riêng trên máy người nhận. Dependency, target/dist và cấu hình riêng được loại khỏi ZIP.
