# Thanh toán payOS — cấu hình và thao tác trên máy local

Cập nhật: 08/10/2026. Dự án: `D:/Clinic-managementfinal/Clinic-management-IntelliJ-2026-10-07`.

## Trạng thái đã tích hợp

- payOS đã bật cho Phòng khám An Nhiên bằng cấu hình trong file người dùng cung cấp. Đã tạo được liên kết và QR thật, xác minh phản hồi có chữ ký, đọc trạng thái và hủy liên kết thành công.
- VNPAY đã bỏ khỏi lựa chọn của bệnh nhân và thu ngân. Backend không cho tạo giao dịch VNPAY mới. Các bản ghi, mã xử lý và nhãn lịch sử được giữ để không làm hỏng dữ liệu cũ.
- Thu tiền mặt và POS tại quầy tiếp tục hoạt động theo ca thu. VietQR chuyển khoản thủ công chưa bật vì file cung cấp không có đầy đủ thông tin ngân hàng nhận tiền; không tự suy đoán tài khoản nhận.
- Website: `http://127.0.0.1:4176`. API Gateway: `http://127.0.0.1:18090`. Billing: `http://127.0.0.1:18005`. Database đang dùng: `clinic_team_current`, PostgreSQL cổng `5433`.
- Cấu hình riêng nằm trong `.runtime/main/config.json`, không đưa khóa vào frontend hay tài liệu. Script khởi động chỉ truyền cấu hình thanh toán cho Billing.

## Thu ngân thao tác

1. Đăng nhập workspace bằng tài khoản nhân viên, chẳng hạn `nhanvien1@gmail.com` với mật khẩu kiểm tra đã thiết lập riêng trong `.runtime/main/config.json`.
2. Mở **Thu phí & ca thu → Thu tiền bệnh nhân**.
3. Chọn phiếu còn phải thu, kiểm tra bệnh nhân, dịch vụ, khoản đã thu và số dư.
4. Chọn **Hình thức nhận tiền → payOS QR**, bấm **Tạo & hiển thị QR payOS**. Cho phép cửa sổ thanh toán của website nếu trình duyệt chặn cửa sổ mới.
5. Màn hình khách hiển thị QR và số tiền còn lại do máy chủ xác định. Khách kiểm tra thông tin người nhận trên ứng dụng ngân hàng trước khi tự thanh toán.
6. Giữ màn hình thanh toán mở để hệ thống đối chiếu trạng thái với payOS. Chỉ khi máy chủ xác nhận khoản tiền hợp lệ, phiếu thu và biên nhận mới được cập nhật. Không ghi nhận tiền mặt/POS cho khoản đã xác nhận qua payOS.
7. Xem **Giao dịch online của phiếu thu** và **Biên nhận của phiếu** để kiểm tra kết quả. Nếu đã có giao dịch đang chờ, mở lại sẽ dùng giao dịch đó thay vì tạo thêm khoản thu.

Tạo QR payOS không cần mở ca thu tiền mặt. Khi chọn tiền mặt/POS để ghi nhận tại quầy, vẫn phải mở ca thu và nhập lý do theo giao diện.

## Bệnh nhân thao tác

1. Đăng nhập trang public, mở **Tài khoản → Hóa đơn** (`/tai-khoan/hoa-don`).
2. Chọn hóa đơn đã phát hành và còn phải thanh toán, chọn payOS, tạo giao dịch rồi quét QR hoặc mở trang thanh toán.
3. Khi quay lại, trang vẫn nằm ở **Hóa đơn**. Hệ thống đọc và đối chiếu trạng thái payOS định kỳ; có thể bấm kiểm tra trạng thái theo giao diện.
4. Nếu muốn dừng một giao dịch chưa thanh toán, dùng thao tác hủy của giao dịch. Chỉ mở phương thức khác sau khi hệ thống xác nhận hủy thành công.

Hóa đơn phải gắn với hồ sơ bệnh nhân thuộc tài khoản đang đăng nhập. Hiện hai tài khoản `benhnhan1@gmail.com` và `benhnhan2@gmail.com` chưa có liên kết hồ sơ bệnh nhân của phòng khám này, nên chưa có hóa đơn cá nhân để thử ngay. Cần thực hiện luồng đăng ký/tiếp nhận và phát hành hóa đơn cho đúng hồ sơ; không dùng hóa đơn của bệnh nhân khác bằng cách đổi ID.

## Cách hệ thống xác nhận tiền

Số tiền được lấy từ số dư hóa đơn trên máy chủ. Tạo giao dịch đóng băng số tiền và phiên bản hóa đơn, lưu mã yêu cầu để xử lý gửi lại. Mô tả payOS được rút gọn tối đa 9 ký tự; mã đơn thanh toán vẫn được lưu đầy đủ để đối chiếu.

URL trình duyệt trả về hoặc một lời báo “thành công” từ khách không tự ghi nhận tiền. Billing chỉ xác nhận qua phản hồi API payOS có chữ ký hợp lệ hoặc webhook có chữ ký hợp lệ. Kiểm tra số tiền, loại tiền, tham chiếu và phạm vi phòng khám trước khi cập nhật một lần vào hóa đơn, biên nhận và sổ kế toán. Hủy không đảo ngược một khoản đã được xác nhận thanh toán.

Nếu phản hồi tạo giao dịch bị mất hoặc chậm, gửi lại cùng yêu cầu giúp tiếp tục đối chiếu. Khi giao dịch còn đang chờ hoặc cần xem xét, không thu cùng khoản tiền lần nữa tại quầy. Trường hợp thanh toán muộn hoặc số tiền bất thường phải được đối chiếu theo trạng thái cần xử lý, không tự hoàn tiền.

## Khởi động lại và thay cấu hình

Trong IntelliJ, sử dụng cấu hình khởi động local của dự án gọi `setup/start-local.ps1`. Cấu hình thanh toán được nạp khi Billing khởi động.

Để chỉ build và khởi động lại Billing, chạy từ thư mục dự án bằng PowerShell 7.4 trở lên:

```powershell
& .\scripts\restart-billing-local.ps1 -Build
```

Script xác minh đúng tiến trình Billing của dự án, dừng tiến trình trước khi build để giải phóng JAR, đóng gói lại các module và chờ health `UP`. Không chạy `mvn clean` trên JAR đang được Java sử dụng.

Để nhập lại cấu hình từ file riêng trên máy:

```powershell
& 'D:\nodejs\node.exe' .\scripts\configure-payments-local.mjs --source 'D:\Clinic_Payment_Setup.md'
& .\scripts\restart-billing-local.ps1
```

Script nhập chỉ lấy các khóa payOS/thông tin ngân hàng cho phép, bỏ các khóa VNPAY, sao lưu cấu hình cũ trong `.runtime/main/payment-config-backups` và không in giá trị khóa. Có thể dùng nguồn `.env` hoặc JSON riêng thay cho Markdown.

## Webhook khi có địa chỉ công khai

Địa chỉ `127.0.0.1` chỉ dùng trên máy này; payOS không gọi được webhook vào địa chỉ đó. Trên local, việc đối chiếu API vẫn chạy khi trang giao dịch/màn hình QR được mở và đọc trạng thái.

Khi triển khai với domain HTTPS có thể truy cập từ Internet, đặt `--public-url 'https://<domain>'` khi nhập cấu hình và khởi động lại Billing. Reverse proxy phải đưa `/s1/billing` vào API Gateway. Cấu hình webhook cho đúng kênh thanh toán payOS tại:

```text
https://<domain>/s1/billing/api/public/payments/clinics/03136db2-48e0-4320-bbdd-5c49e24b6db3/branches/7d90bfae-5dde-47e8-9a69-6c3c0f0d1798/payos/webhook
```

Sau đó cần kiểm tra một giao dịch thật do người dùng tự thanh toán và xác nhận webhook tới máy chủ. Bản kiểm tra hiện tại chưa xác nhận nhận tiền thật hoặc webhook thành công từ ngân hàng/payOS.

## Kết quả kiểm tra 08/10/2026

| Nhóm | Kết quả | Phạm vi |
| --- | --- | --- |
| PaymentGatewaysTest | 6/6 đạt | Tạo yêu cầu payOS đúng chữ ký/URL/mô tả, xác minh chữ ký, cấu hình chưa đủ, không tạo VNPAY mới |
| BillingPostgresTest | 35/35 đạt, không bỏ qua | PostgreSQL riêng: quyền/phạm vi, đồng thời, gửi lại, callback trùng, hủy, chống ghi nhận cùng tham chiếu, sổ kế toán/ca thu |
| Giao diện payments và billing | 22/22 đạt | Lựa chọn payOS, bỏ VNPAY, giữ mã yêu cầu khi lỗi mạng, chỉ nhận PAID từ máy chủ, hủy và thu phí |
| Frontend build | Đạt | TypeScript và Vite |
| payOS trực tiếp | 8 kiểm tra đạt | Tạo QR có chữ ký, gửi lại/mở lại không nhân giao dịch, chữ ký sai bị từ chối HTTP 422, hủy có chữ ký, hóa đơn/biên nhận giữ nguyên |
| Trình duyệt | Đã kiểm tra | Thu ngân chọn được payOS; màn hình khách tải QR thật và số dư 45.000 VND |

Các liên kết dùng kiểm tra trực tiếp đã hủy. Không có tiền thật được chuyển, không có biên nhận thanh toán mới từ các liên kết đó. Kiểm thử PostgreSQL dùng dữ liệu tổng hợp trong `clinic_v2_s1_billing_sandbox`, không sửa database đang vận hành của dự án.

Để chạy lại bộ PostgreSQL riêng:

```powershell
& 'D:\nodejs\node.exe' .\scripts\verify-payments-db-local.mjs
```

Script làm sạch dữ liệu kiểm thử của database sandbox trước mỗi lần chạy, giữ lịch sử migration và xóa tài khoản PostgreSQL tạm sau khi chạy. Không trỏ script này vào database thật.

Log riêng: `.runtime/main/payment-gateway-tests.log`, `payment-database-tests.log`, `payment-frontend-tests.log`, `payment-frontend-build.log`. Báo cáo có thể chia sẻ: [payment-verification-local.json](payment-verification-local.json).

Tài liệu đối chiếu chính thức: [API payOS](https://payos.vn/docs/api/), [webhook payOS](https://payos.vn/docs/du-lieu-tra-ve/webhook/), [URL quay lại](https://payos.vn/docs/du-lieu-tra-ve/return-url/).
