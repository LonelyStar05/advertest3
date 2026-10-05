# Thêm model, dataset, attack bằng file cấu hình

Model, dataset và attack spec khai bằng YAML trong `configs/`, rồi đăng ký bằng `advertest-admin`.
Lệnh chỉ gọi lại các hàm sẵn có (`advertest model register`, `dataset import-kitti`,
`slice create`, `mapping create`, `import-local`, seed catalog), nên kết quả giống hệt làm tay:
cùng hash, cùng id, chạy lại nhiều lần không tạo bản ghi trùng.

```text
configs/
├── models/yolov8n.yaml          # model
├── datasets/kitti-fixture.yaml  # dataset + slice + class mapping
└── attacks/*.yaml               # một file một attack spec (fgsm, pgd_linf, pgd_l2, fog, ...)
```

Đường dẫn tương đối trong YAML tính theo **thư mục chứa file YAML**. Lệnh `advertest-admin` chạy
trong container `api` (`docker compose exec api advertest-admin ...`) hoặc từ gốc repo với `.env`.

## Thêm model hoặc dataset (3 bước)

1. **Chép file mẫu** `configs/models/yolov8n.yaml` (hoặc `configs/datasets/kitti-fixture.yaml`)
   thành file mới và sửa:
   - model: `name` (tên trong DB), `weights` (file `.pt` của Ultralytics). `framework` hiện chỉ
     nhận `ultralytics`; tên class lấy từ checkpoint (`class_names: from_weights`).
   - dataset: `name`, `format` (hiện chỉ `kitti`: `image_2/*.png`, `label_2/*.txt`), `root`,
     `split`; danh sách `slices` (`size`, `seed`, `preset`) và `mappings` (`model` là tên model
     trong `configs/models` hoặc id model đã đăng ký, `preset` như `kitti-coco`).
2. **Đăng ký**:

   ```bash
   advertest-admin import-config configs/ --as admin@example.com
   ```

   Lệnh đăng ký model (hash weights, bài kiểm tra gradient trên ảnh fixture), import dataset, tạo
   slice và mapping vào `data/store` (đổi bằng `--store`), rồi chạy `import-local`: ghi DB và
   upload weights, manifest, ảnh **thuộc slice** lên MinIO.
3. **Kiểm tra**: model xuất hiện ở `GET /models`, dataset ở `GET /datasets`, slice ở
   `GET /slices`, và ảnh của slice ở trang Thử nhanh (`GET /quick-try/images`). Model không qua
   bài kiểm tra gradient được in "KHÔNG có gradient": attack white-box trên model đó bị bỏ qua.

Dataset mới được tạo với `anonymized = false`: ảnh hiển thị luôn được làm mờ theo `rule_v1`.
Định dạng khác KITTI (COCO, YOLO) cần thêm converter trong `ml_core/data/` trước.

## Thêm attack (3 bước)

1. **Chép file mẫu gần nhất** trong `configs/attacks/` (ví dụ `pgd_linf.yaml`) thành file mới, đổi
   `name` và các tham số. Phần thân là các trường của `AttackSpecBody`
   (`contracts/python/advertest_contracts/models.py`): `kind` (`attack`, `corruption`,
   `occlusion`), `access`, `art_class`, `primary_param` (tên, dải, đơn vị của level),
   `fixed_params`, `cost_model`, `requires_gradients`. Spec phải dựng được bằng code hiện có:
   - `attack`: `art_class` là `FastGradientMethod` hoặc `ProjectedGradientDescent`, tham số chính
     `eps` với đơn vị `1/255` hoặc `L2` (`attacks/art_adapter.py`); spec cần train
     (`requires_training`) dùng `RobustDPatch` với `area_ratio` (`attacks/patch/`);
   - `corruption`: `fixed_params.corruption` thuộc `attacks/corruptions/functions.py`, tham số chính
     `severity` rời rạc;
   - `occlusion`: tham số chính `occlusion_ratio`.

   Khối `display` (tùy chọn) là thông tin hiển thị: `title_vi`, `title_en`, `description_vi`,
   `description_en`, `default_levels` (điền sẵn ở wizard), `recommended_levels` (chip gợi ý),
   `quick_try_level` (mặc định ở Thử nhanh). Level theo đơn vị của `primary_param` và phải nằm
   trong dải (với tham số rời rạc: thuộc `values`). Không khai `id`, `spec_sha256`: được tính tự
   động.
2. **Kiểm tra** (không cần DB): `advertest-admin catalog check --dir configs/attacks`.
3. **Đồng bộ vào catalog**:

   ```bash
   advertest-admin catalog sync --dir configs/attacks --as admin@example.com
   ```

   Spec mới được thêm (đang hoạt động) và xuất hiện ở `GET /attack-specs` kèm `display`.

### Luật version

- Sửa **chỉ** khối `display` không đổi `spec_sha256`: `catalog sync` cập nhật mô tả, level gợi ý
  của spec đã có, không cần tăng `version`.
- Sửa bất kỳ trường nào khác phải **tăng `version`** (giữ file cũ hoặc thay bằng file mới). Nếu
  `(name, version)` đã có trong catalog với nội dung khác, `catalog sync` báo lỗi và không ghi gì.
- Spec đã có không bao giờ bị sửa hay xóa: run, protocol, report cũ vẫn trỏ đúng spec của chúng.
  Thêm `--deactivate-older` để tắt các version cũ hơn cùng tên (ẩn khỏi wizard, vẫn giữ trong DB).
- `contracts/seeds/attack_specs.json` vẫn là catalog khởi đầu của `seed`; các file trong
  `configs/attacks/` tái tạo đúng từng spec của seed (cùng id, cùng hash) và thêm `display`.
