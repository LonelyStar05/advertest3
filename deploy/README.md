# Chạy AdverTest bằng Docker

Một lệnh dựng toàn bộ hệ thống trên máy của bạn: Postgres, MinIO, Mailpit, API, frontend và worker
CPU. Lệnh này cũng nạp sẵn tài khoản admin, model YOLOv8n và 5 ảnh KITTI mẫu.

## Cần có

- Docker Desktop (Windows, macOS) hoặc Docker Engine có Compose v2 (Linux), **đang chạy**.
- Windows: chạy lệnh trong **Git Bash** (cài cùng Git) hoặc WSL.
- Mạng ở lần chạy đầu (tải image, PyTorch CPU, gói Node). Lần đầu mất khoảng 5–15 phút.

## Chạy

Từ thư mục gốc của repo:

```bash
bash deploy/start.sh
```

Khi xong, script in ra địa chỉ web (http://localhost:5173) cùng email và mật khẩu admin. Mật khẩu
được sinh ngẫu nhiên và lưu trong `.env`; không commit file này.

## Dừng

```bash
bash deploy/stop.sh          # dừng, giữ dữ liệu
bash deploy/stop.sh --xoa    # dừng và xóa sạch dữ liệu
```

## Sự cố thường gặp

- **Cổng đã bị dùng** (5173, 8000, 9000, 9001, 8025): tắt ứng dụng đang dùng cổng đó, hoặc đặt
  `FRONTEND_PORT=5174` (hoặc `API_PORT`, `MINIO_PORT`...) trong `.env` rồi chạy lại.
- **Đã có `.env` cũ**: script không ghi đè. Cần có `MINIO_PUBLIC_ENDPOINT=http://minio:9000` để
  worker trong Docker tải được ảnh; giá trị có dấu cách hoặc `<`, `>` phải đặt trong nháy kép.
  Muốn làm lại từ đầu: `bash deploy/stop.sh --xoa`, xóa `.env`, rồi chạy lại `start.sh`.
- **Experiment đứng ở "Đang chờ"**: xem log worker bằng lệnh mà `start.sh` in ra ở cuối. Lần chạy
  đầu, worker tự đo chi phí (calibration) nên chậm hơn.

## Đưa lên cloud (VPS)

Cần một VPS Ubuntu 22.04/24.04, tối thiểu 2 vCPU và 4 GB RAM (script tự thêm 4 GB swap).

1. Chép dữ liệu mẫu lên VPS (từ máy có thư mục `data/`):
   `ssh root@<IP> mkdir -p /opt/advertest3 && scp -r data root@<IP>:/opt/advertest3/`
2. Đăng nhập VPS (`ssh root@<IP>`) rồi chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/LonelyStar05/advertest3/main/deploy/cloud.sh | bash
```

Script cài Docker, clone repo vào `/opt/advertest3`, chạy `start.sh`, rồi dựng Caddy để có
`https://<ip>.sslip.io` (không cần mua tên miền). Có tên miền riêng đã trỏ về IP của VPS thì thêm
`DOMAIN=ten-mien-cua-ban` trước `bash`. Cập nhật bản mới: chạy lại đúng lệnh trên.
