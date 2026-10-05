"""Thử nhanh trên một ảnh (`ml_core.runner.quick_try`, docs/thu-nhanh.md)."""

from __future__ import annotations

import base64
import io
import json
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from advertest_contracts.models import AttackSpec
from attacks.factory import build_perturbation
from ml_core.models.wrapper import DEFAULT_INFERENCE_PARAMS
from ml_core.preprocess import boxes_to_letterbox, letterbox_info
from ml_core.runner.quick_try import GroundTruth, run_quick_try, thumbnail

SEED = Path(__file__).resolve().parents[3] / "contracts" / "seeds" / "attack_specs.json"
WIDTH, HEIGHT = 400, 200
CLASSES = ["person", "bicycle", "car"]
# Box tọa độ ảnh gốc: một car và một person.
CAR = (40.0, 60.0, 200.0, 160.0)
PERSON = (260.0, 30.0, 320.0, 190.0)


def _spec(name: str) -> AttackSpec:
    item = next(s for s in json.loads(SEED.read_text()) if s["name"] == name)
    return AttackSpec.model_validate(item)


class FakeEstimator:
    """Ảnh sạch: car và person. Ảnh đã biến đổi (khác ảnh sạch đầu tiên): mất car, thêm một
    bicycle mới; person dịch nhẹ (vẫn IoU >= 0.5)."""

    def __init__(self) -> None:
        self.first: NDArray[np.float32] | None = None
        info = letterbox_info(WIDTH, HEIGHT)
        boxes = boxes_to_letterbox(np.asarray([CAR, PERSON]), info)
        self.car, self.person = boxes.astype(np.float32)
        self.calls = 0

    def predict(self, images: NDArray[np.float32], batch_size: int) -> list[dict[str, Any]]:
        self.calls += 1
        if self.first is None:
            self.first = images.copy()
            boxes = np.stack([self.car, self.person, [0, 0, 5, 5]])
            labels, scores = [2, 0, 1], [0.9, 0.8, 0.1]  # box cuối dưới operating_conf
        else:
            boxes = np.stack([self.person + 2, [300, 300, 340, 340]])
            labels, scores = [0, 1], [0.7, 0.6]
        return [
            {
                "boxes": np.asarray(boxes, dtype=np.float32),
                "labels": np.asarray(labels, dtype=np.int64),
                "scores": np.asarray(scores, dtype=np.float32),
            }
        ]


def _image() -> Image.Image:
    rng = np.random.default_rng(0)
    return Image.fromarray(rng.integers(0, 255, (HEIGHT, WIDTH, 3), dtype=np.uint8))


def _decode(url: str) -> Image.Image:
    assert url.startswith("data:image/webp;base64,")
    return Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))


def _run(spec: AttackSpec, level: float, ground_truth: GroundTruth | None, blur: bool) -> Any:
    estimator = FakeEstimator()
    outcome = run_quick_try(
        estimator=estimator,
        perturbation=build_perturbation(spec, None),
        spec=spec,
        image=_image(),
        image_id="img-1",
        class_names=CLASSES,
        ground_truth=ground_truth,
        level=level,
        seed=0,
        params=DEFAULT_INFERENCE_PARAMS,
        blur=blur,
    )
    assert estimator.calls == 2
    return outcome


def test_boxes_in_original_coordinates_and_matching() -> None:
    outcome = _run(_spec("fog"), 3, None, blur=False)
    assert (outcome.width, outcome.height) == (WIDTH, HEIGHT)
    assert [(b.class_name, b.matched) for b in outcome.clean] == [("car", False), ("person", True)]
    assert np.allclose(outcome.clean[0].bbox, CAR, atol=0.05)
    assert [(b.class_name, b.matched) for b in outcome.attacked] == [
        ("person", True),
        ("bicycle", False),
    ]
    summary = outcome.summary
    assert (summary.clean_count, summary.attacked_count) == (2, 2)
    assert (summary.missed_count, summary.new_count) == (1, 1)
    assert outcome.labels_source == "clean_predictions"
    assert outcome.anonymization is None


def test_images_sizes_and_blur_record() -> None:
    gt = GroundTruth(boxes=np.asarray([CAR, PERSON]), labels=[2, 0], ignore_boxes=np.zeros((0, 4)))
    outcome = _run(_spec("bbox_occlusion"), 0.5, gt, blur=True)
    assert outcome.labels_source == "ground_truth"
    assert _decode(outcome.clean_image).size == (WIDTH, HEIGHT)
    assert _decode(outcome.attacked_image).size == (WIDTH, HEIGHT)
    assert _decode(outcome.perturbation_image).size == (640, 320)  # vùng ảnh thật của letterbox
    assert outcome.anonymization is not None and outcome.anonymization.applied
    assert outcome.anonymization.regions_count > 0


def test_blur_changes_only_regions() -> None:
    plain = _run(_spec("contrast"), 1, None, blur=False)
    blurred = _run(_spec("contrast"), 1, None, blur=True)
    a = np.asarray(_decode(plain.clean_image), dtype=np.int16)
    b = np.asarray(_decode(blurred.clean_image), dtype=np.int16)
    # Góc trên trái (ngoài mọi box) gần như giữ nguyên; vùng đầu của person bị làm mờ.
    assert np.abs(a[:20, :20] - b[:20, :20]).mean() < 8
    assert np.abs(a[35:80, 265:315] - b[35:80, 265:315]).mean() > 20


def test_thumbnail_width() -> None:
    assert _decode(thumbnail(_image(), [CAR])).size == (320, 160)
    assert _decode(thumbnail(_image(), None)).size == (320, 160)
