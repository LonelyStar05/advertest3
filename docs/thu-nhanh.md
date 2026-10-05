# Ghi chú contract: Thử nhanh và thông tin hiển thị của attack (bổ sung 2026-10)

Thay đổi contract đã được chủ dự án duyệt. Ghi lại ở đây (không sửa `specs/`) để các phase sau
cập nhật spec.

## Thử nhanh (`POST /quick-try`, `GET /quick-try/images`)

- Chạy model trên **một ảnh** sạch và ảnh sau biến đổi ngay trong tiến trình API (CPU), để người
  dùng cảm nhận một attack trước khi tạo experiment. Không tạo experiment, không ghi DB hay MinIO,
  không có fingerprint, **không phải kết quả chính thức** (không dùng cho review hay report).
- Quyền: `POST /quick-try` cần `model.read`; `GET /quick-try/images` cần `dataset.read` (engineer,
  reviewer, admin đều có). Không thêm permission mới để không đổi ma trận quyền của Phase 4.
- Ảnh: ảnh thuộc slice đã đăng ký (chỉ các ảnh này có trên MinIO), hoặc PNG/JPEG tải lên dạng
  base64 (tối đa khoảng 6 MB, mỗi cạnh 32 đến 4096 px).
- Pipeline giống run: letterbox 640, mask vùng ảnh thật, `Perturbation.apply`, predict với
  `DEFAULT_INFERENCE_PARAMS`. Box trả về có score >= `operating_conf` (0.25), theo tọa độ ảnh gốc.
  Ghép box sạch với box sau biến đổi một-một, IoU >= 0.5, cùng class (`match_predictions`).
- Nhãn đưa cho attack: ground truth qua class mapping của (dataset version, model) nếu có; không
  thì phát hiện trên ảnh sạch (`labels_source`).
- Không hỗ trợ spec cần train (`adv_patch`) và attack cần gradient trên model không hỗ trợ
  gradient (422).
- Riêng tư: ảnh làm mờ `rule_v1` như failure case (Phase 6) trừ khi dataset đã ẩn danh; ảnh tải
  lên luôn làm mờ. Thumbnail của `GET /quick-try/images` làm mờ theo ground truth.
- Mỗi lúc một lượt chạy (khóa trong tiến trình); model được cache trong tiến trình (tối đa 2).

## Thông tin hiển thị của attack spec

- `AttackSpecDisplay` (tên, mô tả tiếng Việt / tiếng Anh, `default_levels`, `recommended_levels`,
  `quick_try_level`) lưu ở cột `attack_specs.display` (migration 0011), **ngoài** `spec_sha256`.
- `GET /attack-specs` trả `AttackSpecView` (= `AttackSpec` + `display`, null khi chưa khai);
  `AttackSpecAdminView` kế thừa `AttackSpecView`.
- Khai bằng `configs/attacks/*.yaml`, đồng bộ bằng `advertest-admin catalog sync`
  (docs/mo-rong-bang-config.md).
