"""Thử nhanh (docs/thu-nhanh.md): chạy model trên một ảnh sạch và ảnh sau biến đổi ngay trong tiến
trình API (CPU), không tạo experiment, không ghi DB hay MinIO.

- `prepare` (trong transaction): kiểm tra model, spec, level; đọc ảnh và ground truth.
- `execute` (ngoài transaction): nạp model (cache theo weights trong tiến trình), chạy
  `ml_core.runner.quick_try.run_quick_try`. Mỗi lúc chỉ một lượt chạy (khóa toàn cục): torch và
  estimator ART không an toàn khi dùng đồng thời, và một lượt đã dùng hết CPU.

Thư viện ML (torch, ultralytics, ART) chỉ được import khi thật sự chạy, để API khởi động nhanh.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
import tempfile
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from advertest_contracts.enums import AttackKind
from advertest_contracts.models import (
    AttackSpec,
    ClassMapping,
    DatasetManifest,
    QuickTryImage,
    QuickTryRequest,
    QuickTryResult,
    QuickTryTiming,
)
from backend.app import storage
from backend.app.db import models as m
from backend.app.services.errors import Invalid, NotFound
from ml_core.data.mapping import apply_mapping
from ml_core.privacy.regions import Detection, rule_v1_regions
from ml_core.store import KeyNotFoundError, MinioStore

MAX_SIDE = 4096
MIN_SIDE = 32
MODEL_CACHE_SIZE = 2
DEFAULT_IMAGE_LIMIT = 12
MAX_IMAGE_LIMIT = 50

_run_lock = threading.Lock()
_cache_lock = threading.Lock()
_estimators: OrderedDict[str, Any] = OrderedDict()
_manifests: dict[str, DatasetManifest] = {}
_thumbnails: dict[tuple[str, str, bool], str] = {}
THUMBNAIL_CACHE_SIZE = 500


@dataclass(frozen=True)
class Prepared:
    request: QuickTryRequest
    model_version_id: UUID
    model_name: str
    weights_sha256: str
    class_names: list[str]
    spec: AttackSpec
    image: Image.Image
    image_id: str
    source: str
    ground_truth: Any  # ml_core.runner.quick_try.GroundTruth | None (import muộn)
    blur: bool


# ---------------------------------------------------------------- đọc dữ liệu


def _manifest(datasets: MinioStore, manifest_sha256: str) -> DatasetManifest:
    """Manifest là bất biến theo hash: giữ trong bộ nhớ sau lần đọc đầu."""
    cached = _manifests.get(manifest_sha256)
    if cached is None:
        cached = DatasetManifest.model_validate_json(
            datasets.get(storage.manifest_key(manifest_sha256))
        )
        _manifests[manifest_sha256] = cached
    return cached


def _open_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise Invalid("Không đọc được ảnh (cần PNG hoặc JPEG)") from exc
    if image.format not in ("PNG", "JPEG"):
        raise Invalid(f"Ảnh phải là PNG hoặc JPEG, nhận {image.format}")
    width, height = image.size
    if max(width, height) > MAX_SIDE or min(width, height) < MIN_SIDE:
        raise Invalid(f"Kích thước ảnh phải trong [{MIN_SIDE}, {MAX_SIDE}] px mỗi cạnh")
    return image.convert("RGB")


def _decode_upload(value: str) -> bytes:
    payload = value.split(",", 1)[1] if value.startswith("data:") else value
    try:
        return base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise Invalid("image_base64 không phải base64 hợp lệ") from exc


def _mapping(
    session: Session, dataset_version_id: UUID, model_version_id: UUID
) -> ClassMapping | None:
    row = session.scalar(
        select(m.ClassMapping)
        .where(
            m.ClassMapping.dataset_version_id == dataset_version_id,
            m.ClassMapping.model_version_id == model_version_id,
        )
        .order_by(m.ClassMapping.mapping_sha256)
        .limit(1)
    )
    return None if row is None else ClassMapping.model_validate(row.mapping)


def _spec(session: Session, request: QuickTryRequest) -> AttackSpec:
    if request.attack_spec_id is not None:
        row = session.get(m.AttackSpecRow, request.attack_spec_id)
    else:
        row = session.scalar(
            select(m.AttackSpecRow)
            .where(m.AttackSpecRow.name == request.attack_name, m.AttackSpecRow.is_active)
            .order_by(m.AttackSpecRow.version.desc())
            .limit(1)
        )
    if row is None:
        raise NotFound("Không có attack spec này")
    return AttackSpec.model_validate(
        {**row.spec, "id": str(row.id), "spec_sha256": row.spec_sha256}
    )


def _check_level(spec: AttackSpec, level: float) -> None:
    param = spec.primary_param
    if not param.min <= level <= param.max:
        raise Invalid(
            f"level {level:g} ngoài dải [{param.min:g}, {param.max:g}] ({param.unit})"
            f" của {spec.name}"
        )
    if param.type == "discrete" and level not in (param.values or []):
        raise Invalid(f"level của {spec.name} phải thuộc {param.values}")


def prepare(session: Session, buckets: storage.Buckets, request: QuickTryRequest) -> Prepared:
    from ml_core.runner.quick_try import GroundTruth

    row = session.execute(
        select(m.ModelVersion, m.Model)
        .join(m.Model, m.Model.id == m.ModelVersion.model_id)
        .where(m.ModelVersion.id == request.model_version_id)
    ).one_or_none()
    if row is None:
        raise NotFound("Không có model này")
    version, model = row
    spec = _spec(session, request)
    if spec.requires_training:
        raise Invalid(f"{spec.name} cần train patch trước; hãy chạy bằng experiment")
    if spec.requires_gradients and not version.supports_gradients:
        raise Invalid(f"{spec.name} cần gradient nhưng model không hỗ trợ gradient")
    _check_level(spec, request.level)

    ground_truth = None
    if request.image_base64 is not None:
        data = _decode_upload(request.image_base64)
        image = _open_image(data)
        image_id = f"upload-{hashlib.sha256(data).hexdigest()[:16]}"
        source, blur = "upload", True
    else:
        assert request.dataset_version_id is not None and request.image_id is not None
        dataset_version = session.get(m.DatasetVersion, request.dataset_version_id)
        if dataset_version is None:
            raise NotFound("Không có dataset version này")
        dataset = session.get_one(m.Dataset, dataset_version.dataset_id)
        try:
            manifest = _manifest(buckets.datasets, dataset_version.manifest_sha256)
        except KeyNotFoundError as exc:
            raise NotFound("Manifest của dataset version chưa có trên MinIO") from exc
        entry = next((i for i in manifest.images if i.image_id == request.image_id), None)
        if entry is None:
            raise NotFound(f"Dataset version không có ảnh {request.image_id}")
        try:
            data = buckets.datasets.get(
                storage.image_key(dataset_version.manifest_sha256, entry.sha256)
            )
        except KeyNotFoundError as exc:
            raise NotFound(
                f"Ảnh {request.image_id} chưa có trên MinIO (chỉ ảnh thuộc slice đã đăng ký)"
            ) from exc
        image = _open_image(data)
        image_id = entry.image_id
        source, blur = "dataset", not dataset.anonymized
        mapping = _mapping(session, dataset_version.id, version.id)
        if mapping is not None:
            mapped = apply_mapping(manifest, mapping)[entry.image_id]
            index = {name: i for i, name in enumerate(version.class_names)}
            ground_truth = GroundTruth(
                boxes=mapped.boxes,
                labels=[index[c] for c in mapped.classes],
                ignore_boxes=mapped.ignore_boxes,
            )
    return Prepared(
        request=request,
        model_version_id=version.id,
        model_name=model.name,
        weights_sha256=version.weights_sha256,
        class_names=list(version.class_names),
        spec=spec,
        image=image,
        image_id=image_id,
        source=source,
        ground_truth=ground_truth,
        blur=blur,
    )


# ---------------------------------------------------------------- chạy


def _estimator(models: MinioStore, weights_sha256: str) -> Any:
    """Estimator ART cho weights (CPU), cache LRU `MODEL_CACHE_SIZE` model trong tiến trình."""
    from ml_core.models.estimator import build_estimator
    from ml_core.models.wrapper import DEFAULT_INFERENCE_PARAMS, load_detection_model

    with _cache_lock:
        if weights_sha256 in _estimators:
            _estimators.move_to_end(weights_sha256)
            return _estimators[weights_sha256]
    data = models.get(storage.weights_key(weights_sha256))
    if hashlib.sha256(data).hexdigest() != weights_sha256:
        raise RuntimeError(f"Weights trong MinIO không khớp sha256 {weights_sha256}")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "weights.pt"
        path.write_bytes(data)
        model = load_detection_model(path)
    estimator = build_estimator(model, DEFAULT_INFERENCE_PARAMS, "cpu")
    with _cache_lock:
        _estimators[weights_sha256] = estimator
        while len(_estimators) > MODEL_CACHE_SIZE:
            _estimators.popitem(last=False)
    return estimator


def execute(buckets: storage.Buckets, prepared: Prepared) -> QuickTryResult:
    from attacks.factory import build_perturbation
    from ml_core.models.wrapper import DEFAULT_INFERENCE_PARAMS
    from ml_core.runner.quick_try import run_quick_try

    request, spec = prepared.request, prepared.spec
    with _run_lock:
        start = time.perf_counter()
        estimator = _estimator(buckets.models, prepared.weights_sha256)
        load_ms = (time.perf_counter() - start) * 1000
        try:
            perturbation = build_perturbation(
                spec, estimator if spec.kind == AttackKind.ATTACK else None
            )
            outcome = run_quick_try(
                estimator=estimator,
                perturbation=perturbation,
                spec=spec,
                image=prepared.image,
                image_id=prepared.image_id,
                class_names=prepared.class_names,
                ground_truth=prepared.ground_truth,
                level=request.level,
                seed=request.seed,
                params=DEFAULT_INFERENCE_PARAMS,
                blur=prepared.blur,
            )
        except ValueError as exc:
            # Spec không dựng được, ảnh quá nhỏ cho corruption, ...: lỗi của yêu cầu, không phải
            # lỗi máy chủ (UnsupportedAttack, UnsupportedTransform đều là ValueError).
            raise Invalid(f"Không chạy được {spec.name}: {exc}") from exc
        total_ms = (time.perf_counter() - start) * 1000
    from_dataset = prepared.source == "dataset"
    return QuickTryResult(
        model_version_id=prepared.model_version_id,
        model_name=prepared.model_name,
        attack_spec_id=spec.id,
        attack_name=spec.name,
        attack_version=spec.version,
        level=request.level,
        unit=spec.primary_param.unit,
        seed=request.seed,
        source="dataset" if from_dataset else "upload",
        dataset_version_id=request.dataset_version_id if from_dataset else None,
        image_id=prepared.image_id if from_dataset else None,
        width=outcome.width,
        height=outcome.height,
        clean_image=outcome.clean_image,
        attacked_image=outcome.attacked_image,
        perturbation_image=outcome.perturbation_image,
        clean=outcome.clean,
        attacked=outcome.attacked,
        summary=outcome.summary,
        operating_conf=DEFAULT_INFERENCE_PARAMS.operating_conf,
        labels_source=outcome.labels_source,
        anonymization=outcome.anonymization,
        timing=QuickTryTiming(
            load_ms=round(load_ms, 1),
            clean_ms=outcome.clean_ms,
            attack_ms=outcome.attack_ms,
            total_ms=round(total_ms, 1),
        ),
    )


# ---------------------------------------------------------------- ảnh mẫu


def _thumbnail_regions(
    manifest: DatasetManifest, image_id: str, mapping: ClassMapping | None, width: int, height: int
) -> list[tuple[float, float, float, float]]:
    """Vùng làm mờ của thumbnail (tọa độ ảnh gốc): `rule_v1` trên ground truth qua mapping; không
    có mapping thì làm mờ toàn bộ box annotation và ignore region (thừa hơn thiếu)."""
    if mapping is not None:
        mapped = apply_mapping(manifest, mapping)[image_id]
        return rule_v1_regions(
            ground_truth=[
                Detection((b[0], b[1], b[2], b[3]), name)
                for b, name in zip(mapped.boxes, mapped.classes, strict=True)
            ],
            clean=[],
            attacked=[],
            ignore_boxes=[(b[0], b[1], b[2], b[3]) for b in mapped.ignore_boxes],
            width=width,
            height=height,
        )
    boxes = [a.bbox for a in manifest.annotations if a.image_id == image_id]
    boxes += [r.bbox for r in manifest.ignore_regions if r.image_id == image_id]
    return [(float(b[0]), float(b[1]), float(b[2]), float(b[3])) for b in boxes]


def list_images(
    session: Session,
    buckets: storage.Buckets,
    *,
    dataset_version_id: UUID | None = None,
    limit: int = DEFAULT_IMAGE_LIMIT,
) -> list[QuickTryImage]:
    """Ảnh thuộc các slice đã đăng ký (chỉ ảnh này có trên MinIO), theo tên slice rồi image_id."""
    from ml_core.runner.quick_try import thumbnail

    query = select(m.Slice).order_by(m.Slice.name, m.Slice.id)
    if dataset_version_id is not None:
        query = query.where(m.Slice.dataset_version_id == dataset_version_id)
    wanted: list[tuple[UUID, str]] = []
    for slice_row in session.scalars(query):
        for image_id in sorted(slice_row.image_ids):
            key = (slice_row.dataset_version_id, image_id)
            if key not in wanted:
                wanted.append(key)
    result: list[QuickTryImage] = []
    for version_id, image_id in wanted:
        if len(result) >= limit:
            break
        version = session.get_one(m.DatasetVersion, version_id)
        dataset = session.get_one(m.Dataset, version.dataset_id)
        try:
            manifest = _manifest(buckets.datasets, version.manifest_sha256)
        except KeyNotFoundError:
            continue  # dataset chưa upload lên MinIO (đăng ký không qua import-local)
        entry = next((i for i in manifest.images if i.image_id == image_id), None)
        if entry is None:
            continue
        cache_key = (version.manifest_sha256, entry.sha256, dataset.anonymized)
        thumb = _thumbnails.get(cache_key)
        if thumb is None:
            try:
                data = buckets.datasets.get(
                    storage.image_key(version.manifest_sha256, entry.sha256)
                )
            except KeyNotFoundError:
                continue
            image = Image.open(io.BytesIO(data)).convert("RGB")
            regions = None
            if not dataset.anonymized:
                mapping_row = session.scalar(
                    select(m.ClassMapping)
                    .where(m.ClassMapping.dataset_version_id == version.id)
                    .order_by(m.ClassMapping.mapping_sha256)
                    .limit(1)
                )
                mapping = (
                    None
                    if mapping_row is None
                    else ClassMapping.model_validate(mapping_row.mapping)
                )
                regions = _thumbnail_regions(manifest, image_id, mapping, *image.size)
            thumb = thumbnail(image, regions)
            if len(_thumbnails) >= THUMBNAIL_CACHE_SIZE:
                _thumbnails.clear()
            _thumbnails[cache_key] = thumb
        result.append(
            QuickTryImage(
                dataset_version_id=version.id,
                dataset_name=dataset.name,
                image_id=image_id,
                width=entry.width,
                height=entry.height,
                num_objects=sum(1 for a in manifest.annotations if a.image_id == image_id),
                thumbnail=thumb,
            )
        )
    return result
