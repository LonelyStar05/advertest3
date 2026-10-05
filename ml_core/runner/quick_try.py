"""Thử nhanh trên một ảnh (docs/thu-nhanh.md): predict ảnh sạch, áp phép biến đổi, predict lại,
ghép box và dựng ảnh hiển thị đã làm mờ.

Dùng đúng đường đi của run (`RunExecutor.process_batch`): letterbox 640, mask vùng ảnh thật,
`Perturbation.apply` với targets có `image_id` và `ignore_boxes`, `estimator.predict`. Khác run ở
chỗ chỉ một ảnh, không ghi gì, và box trả về theo **tọa độ ảnh gốc**.

Nhãn đưa cho attack: ground truth (qua class mapping) khi có; không thì phát hiện trên ảnh sạch
có score >= operating_conf (ảnh tải lên). Làm mờ theo `rule_v1` như failure case (Phase 6): vùng
lấy từ ground truth, phát hiện sạch, phát hiện sau biến đổi và ignore region; áp lên cả ba ảnh.
"""

from __future__ import annotations

import base64
import io
import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from advertest_contracts.models import (
    QUICK_TRY_IOU,
    AttackSpec,
    CaseAnonymization,
    InferenceParams,
    QuickTryBox,
    QuickTrySummary,
)
from advertest_contracts.perturbation import Perturbation
from ml_core.metrics.attack import match_predictions
from ml_core.preprocess import LetterboxInfo, boxes_from_letterbox, boxes_to_letterbox, letterbox
from ml_core.privacy.blur import blur_regions
from ml_core.privacy.case import anonymization, case_regions
from ml_core.runner.executor import linf_eps
from ml_core.runner.images import letterbox_mask, perturbation_kind, third_image

WEBP_QUALITY = 90
THUMB_WIDTH = 320

LabelsSource = Literal["ground_truth", "clean_predictions"]


@dataclass(frozen=True)
class GroundTruth:
    """Ground truth của ảnh sau khi áp mapping, tọa độ ảnh gốc."""

    boxes: NDArray[np.float64]  # (N, 4) xyxy
    labels: list[int]  # chỉ số class trong model
    ignore_boxes: NDArray[np.float64]  # (M, 4) xyxy


@dataclass(frozen=True)
class QuickTryOutcome:
    width: int
    height: int
    clean: list[QuickTryBox]
    attacked: list[QuickTryBox]
    summary: QuickTrySummary
    clean_image: str
    attacked_image: str
    perturbation_image: str
    labels_source: LabelsSource
    anonymization: CaseAnonymization | None
    clean_ms: float
    attack_ms: float


# ---------------------------------------------------------------- ảnh


def to_chw(image: Image.Image) -> NDArray[np.float32]:
    """Ảnh PIL → (3, H, W) float32 [0, 1]."""
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    return np.ascontiguousarray(pixels.transpose(2, 0, 1))


def _pil(image: NDArray[np.float32]) -> Image.Image:
    pixels = np.round(np.clip(image, 0.0, 1.0) * 255).astype(np.uint8).transpose(1, 2, 0)
    return Image.fromarray(pixels)


def webp_data_url(image: NDArray[np.float32] | Image.Image, width: int | None = None) -> str:
    """Data URL WebP của ảnh (C, H, W) [0, 1] hoặc PIL; `width` thu nhỏ giữ tỷ lệ."""
    pil = image if isinstance(image, Image.Image) else _pil(image)
    if width is not None and pil.width > width:
        height = max(1, round(pil.height * width / pil.width))
        pil = pil.resize((width, height), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    pil.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=4)
    return "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode()


def crop_letterbox(image: NDArray[np.float32], info: LetterboxInfo) -> NDArray[np.float32]:
    """Ảnh letterbox (3, S, S) → vùng ảnh thật (bỏ pad), ở độ phân giải đầu vào của model."""
    width, height = info.orig_size
    new_w = max(1, min(info.size, round(width * info.scale)))
    new_h = max(1, min(info.size, round(height * info.scale)))
    left, top = info.pad
    return image[:, top : top + new_h, left : left + new_w]


def from_letterbox(image: NDArray[np.float32], info: LetterboxInfo) -> NDArray[np.float32]:
    """Ảnh letterbox (3, S, S) → bỏ pad, phóng về kích thước ảnh gốc (chỉ để hiển thị)."""
    crop = _pil(crop_letterbox(image, info))
    return to_chw(crop.resize(info.orig_size, Image.Resampling.BILINEAR))


# ---------------------------------------------------------------- box


def _confident(pred: dict[str, Any], operating_conf: float) -> dict[str, NDArray[Any]]:
    scores = np.asarray(pred["scores"], dtype=np.float32).reshape(-1)
    keep = scores >= operating_conf
    return {
        "boxes": np.asarray(pred["boxes"], dtype=np.float32).reshape(-1, 4)[keep],
        "labels": np.asarray(pred["labels"], dtype=np.int64).reshape(-1)[keep],
        "scores": scores[keep],
    }


def _boxes(
    pred: dict[str, NDArray[Any]],
    matched: NDArray[np.bool_],
    info: LetterboxInfo,
    class_names: Sequence[str],
) -> list[QuickTryBox]:
    original = boxes_from_letterbox(pred["boxes"], info)
    return [
        QuickTryBox(
            bbox=(
                round(float(box[0]), 2),
                round(float(box[1]), 2),
                round(float(box[2]), 2),
                round(float(box[3]), 2),
            ),
            class_name=class_names[int(label)],
            score=round(float(score), 4),
            matched=bool(hit),
        )
        for box, label, score, hit in zip(
            original, pred["labels"], pred["scores"], matched, strict=True
        )
    ]


# ---------------------------------------------------------------- chạy


def run_quick_try(
    *,
    estimator: Any,
    perturbation: Perturbation,
    spec: AttackSpec,
    image: Image.Image,
    image_id: str,
    class_names: Sequence[str],
    ground_truth: GroundTruth | None,
    level: float,
    seed: int,
    params: InferenceParams,
    blur: bool,
) -> QuickTryOutcome:
    rgb = image.convert("RGB")
    lb, info = letterbox(rgb)
    images = lb[None]
    mask = letterbox_mask([info])

    start = time.perf_counter()
    clean_raw = estimator.predict(images, batch_size=1)[0]
    clean_ms = (time.perf_counter() - start) * 1000

    if ground_truth is not None:
        gt = {
            "boxes": boxes_to_letterbox(ground_truth.boxes, info).astype(np.float32),
            "labels": np.asarray(ground_truth.labels, dtype=np.int64),
        }
        ignore = boxes_to_letterbox(ground_truth.ignore_boxes, info).astype(np.float32)
        labels_source: LabelsSource = "ground_truth"
    else:
        confident = _confident(clean_raw, params.operating_conf)
        gt = {"boxes": confident["boxes"], "labels": confident["labels"]}
        ignore = np.zeros((0, 4), dtype=np.float32)
        labels_source = "clean_predictions"
    target = {**gt, "image_id": image_id, "ignore_boxes": ignore}

    start = time.perf_counter()
    adversarial = perturbation.apply(images, [target], level, seed, mask)[0]
    attacked_raw = estimator.predict(adversarial[None], batch_size=1)[0]
    attack_ms = (time.perf_counter() - start) * 1000

    clean = _confident(clean_raw, params.operating_conf)
    attacked = _confident(attacked_raw, params.operating_conf)
    # Ghép một-một như metric: box sạch đóng vai ground truth của ảnh sau biến đổi.
    matching = match_predictions(attacked, clean, params.operating_conf, QUICK_TRY_IOU)
    clean_boxes = _boxes(clean, matching.gt_matched, info, class_names)
    attacked_boxes = _boxes(attacked, matching.pred_matched, info, class_names)

    original = to_chw(rgb)
    shown_adv = from_letterbox(adversarial, info)
    # Ảnh thứ ba giữ độ phân giải đầu vào của model (nhiễu phóng to vô nghĩa và nén kém).
    third = third_image(
        perturbation_kind(spec), lb, adversarial, linf_eps(spec, perturbation, level)
    )
    record: CaseAnonymization | None = None
    if blur:
        _, size_h, size_w = lb.shape
        regions_lb = case_regions(
            ground_truth=gt,
            clean=clean_raw,
            attacked=attacked_raw,
            ignore_boxes=ignore,
            class_names=class_names,
            width=size_w,
            height=size_h,
        )
        regions = [
            (float(b[0]), float(b[1]), float(b[2]), float(b[3]))
            for b in boxes_from_letterbox(np.asarray(regions_lb).reshape(-1, 4), info)
        ]
        original = blur_regions(original, regions)
        shown_adv = blur_regions(shown_adv, regions)
        third = blur_regions(third, regions_lb)
        record = anonymization(len(regions))
    shown_third = crop_letterbox(third, info)

    width, height = rgb.size
    return QuickTryOutcome(
        width=width,
        height=height,
        clean=clean_boxes,
        attacked=attacked_boxes,
        summary=QuickTrySummary(
            clean_count=len(clean_boxes),
            attacked_count=len(attacked_boxes),
            missed_count=sum(not b.matched for b in clean_boxes),
            new_count=sum(not b.matched for b in attacked_boxes),
            iou_threshold=QUICK_TRY_IOU,
        ),
        clean_image=webp_data_url(original),
        attacked_image=webp_data_url(shown_adv),
        perturbation_image=webp_data_url(shown_third),
        labels_source=labels_source,
        anonymization=record,
        clean_ms=round(clean_ms, 1),
        attack_ms=round(attack_ms, 1),
    )


def thumbnail(
    image: Image.Image, regions: Sequence[tuple[float, float, float, float]] | None
) -> str:
    """Thumbnail WebP rộng `THUMB_WIDTH`; `regions` (tọa độ ảnh gốc) được làm mờ trước khi thu
    nhỏ, `None` là không làm mờ."""
    chw = to_chw(image)
    if regions is not None:
        chw = blur_regions(chw, regions)
    return webp_data_url(chw, width=THUMB_WIDTH)
