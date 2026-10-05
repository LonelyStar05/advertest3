"""Khai model và dataset bằng YAML (`configs/models/`, `configs/datasets/`;
docs/mo-rong-bang-config.md).

Chỉ là lớp mỏng gọi lại các hàm sẵn có của ml_core, theo đúng thứ tự của các lệnh `advertest`:
`model register` → `dataset import-kitti` → `slice create` → `mapping create`. Kết quả nằm trong
store (thường là `LocalStore` ở `data/store`); `advertest-admin import-config` gọi tiếp
`import-local` để đăng ký vào DB và MinIO.

Đường dẫn tương đối trong YAML (weights, root) tính theo thư mục chứa file YAML.

Ví dụ `configs/models/yolov8n.yaml`::

    name: yolov8n-coco
    weights: ../../tests/fixtures/yolov8n.pt
    framework: ultralytics
    class_names: from_weights

Ví dụ `configs/datasets/kitti-fixture.yaml`::

    name: kitti-fixture
    format: kitti
    root: ../../data/kitti-fixture
    split: training
    slices: [{size: 5, seed: 42, preset: kitti-coco}]
    mappings: [{model: yolov8n-coco, preset: kitti-coco}]
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

import yaml
from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt, PositiveInt, ValidationError

from advertest_contracts.models import ClassMapping, ModelCard, SliceSpec
from ml_core.data.dataset import save_dataset
from ml_core.data.kitti import import_kitti
from ml_core.data.mapping import build_mapping, get_preset, save_mapping
from ml_core.data.slice import create_slice, preset_filter, save_slice
from ml_core.models.register import card_key, load_card
from ml_core.store import ArtifactStore, resolve_id

YAML_SUFFIXES = (".yaml", ".yml")
SUPPORTED_FORMATS = ("kitti",)


class ConfigFileError(ValueError):
    """File YAML của model hay dataset sai (kèm đường dẫn file)."""


class _File(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ModelFile(_File):
    name: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$", description="Tên model trong DB")
    weights: Path = Field(description="File .pt; tương đối theo thư mục của file YAML")
    framework: Literal["ultralytics"] = "ultralytics"
    class_names: Literal["from_weights"] = Field(
        default="from_weights", description="Tên class lấy từ checkpoint (model.names)"
    )
    device: str = Field(default="cpu", description="Thiết bị chạy bài kiểm tra gradient")


class SliceDecl(_File):
    size: PositiveInt = 300
    seed: NonNegativeInt = 42
    preset: str = Field(default="kitti-coco", description="Bộ lọc class và độ khó của preset")


class MappingDecl(_File):
    model: str = Field(min_length=1, description="Tên model (configs/models hoặc store) hay id")
    preset: str = "kitti-coco"


class DatasetFile(_File):
    name: str = Field(min_length=1, description="Tên dataset trong DB khi tạo mới")
    format: str = Field(description=f"Định dạng nguồn; hiện hỗ trợ: {', '.join(SUPPORTED_FORMATS)}")
    root: Path = Field(description="Thư mục gốc; KITTI cần image_2/ và label_2/")
    split: str = Field(default="training", min_length=1)
    slices: list[SliceDecl] = Field(default_factory=lambda: [SliceDecl()])
    mappings: list[MappingDecl] = Field(default_factory=list)


@dataclass(frozen=True)
class ModelDecl:
    file: ModelFile
    weights: Path  # đường dẫn tuyệt đối
    source: Path


@dataclass(frozen=True)
class DatasetDecl:
    file: DatasetFile
    root: Path  # đường dẫn tuyệt đối
    source: Path


@dataclass
class DatasetImported:
    name: str
    dataset_version_sha256: str
    slices: list[SliceSpec] = field(default_factory=list)
    mappings: list[ClassMapping] = field(default_factory=list)


@dataclass
class StoreImport:
    models: list[ModelCard] = field(default_factory=list)
    datasets: list[DatasetImported] = field(default_factory=list)

    def dataset_names(self) -> dict[str, str]:
        """dataset_version_sha256 → tên khai trong YAML (cho `import-local`)."""
        return {d.dataset_version_sha256: d.name for d in self.datasets}


# ---------------------------------------------------------------- đọc file


def _read_yaml(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigFileError(f"{path}: không đọc được YAML: {exc}") from exc


def _resolve(path: Path, source: Path) -> Path:
    return path if path.is_absolute() else (source.parent / path).resolve()


def load_model_file(path: Path) -> ModelDecl:
    try:
        file = ModelFile.model_validate(_read_yaml(path))
    except ValidationError as exc:
        raise ConfigFileError(f"{path}: {exc}") from exc
    weights = _resolve(file.weights, path)
    if not weights.is_file():
        raise ConfigFileError(f"{path}: không có file weights {weights}")
    return ModelDecl(file=file, weights=weights, source=path)


def load_dataset_file(path: Path) -> DatasetDecl:
    try:
        file = DatasetFile.model_validate(_read_yaml(path))
    except ValidationError as exc:
        raise ConfigFileError(f"{path}: {exc}") from exc
    if file.format not in SUPPORTED_FORMATS:
        raise ConfigFileError(
            f"{path}: format {file.format!r} chưa hỗ trợ (có: {', '.join(SUPPORTED_FORMATS)});"
            " cần thêm converter trong ml_core/data/"
        )
    for preset in {s.preset for s in file.slices} | {m.preset for m in file.mappings}:
        try:
            get_preset(preset)
        except ValueError as exc:
            raise ConfigFileError(f"{path}: {exc}") from exc
    root = _resolve(file.root, path)
    if not root.is_dir():
        raise ConfigFileError(f"{path}: không có thư mục dữ liệu {root}")
    return DatasetDecl(file=file, root=root, source=path)


def _yaml_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if p.is_file() and p.suffix in YAML_SUFFIXES)


def load_config_tree(root: Path) -> tuple[list[ModelDecl], list[DatasetDecl]]:
    """`root/models/*.yaml` và `root/datasets/*.yaml` (thư mục nào thiếu thì bỏ qua)."""
    if not root.is_dir():
        raise ConfigFileError(f"Không có thư mục {root}")
    models = [load_model_file(p) for p in _yaml_files(root / "models")]
    datasets = [load_dataset_file(p) for p in _yaml_files(root / "datasets")]
    names = [m.file.name for m in models]
    duplicated = sorted({n for n in names if names.count(n) > 1})
    if duplicated:
        raise ConfigFileError(f"Tên model khai trùng: {', '.join(duplicated)}")
    return models, datasets


# ---------------------------------------------------------------- ghi vào store


def _store_cards(store: ArtifactStore) -> list[ModelCard]:
    prefix = "index/model/"
    return [
        load_card(store, resolve_id(store, "model", UUID(key.removeprefix(prefix))))
        for key in store.list(prefix)
    ]


def _find_model(store: ArtifactStore, ref: str, declared: dict[str, ModelCard]) -> ModelCard:
    if ref in declared:
        return declared[ref]
    try:
        model_id = UUID(ref)
    except ValueError:
        model_id = None
    if model_id is not None:
        sha = resolve_id(store, "model", model_id)
        if store.exists(card_key(sha)):
            return load_card(store, sha)
    matches = [card for card in _store_cards(store) if card.name == ref]
    if not matches:
        raise ConfigFileError(f"Không có model {ref!r} (khai trong configs/models hoặc đã đăng ký)")
    return matches[0]


ModelRegistrar = Callable[[ArtifactStore, ModelDecl], ModelCard]


def register_declared_model(store: ArtifactStore, decl: ModelDecl) -> ModelCard:
    """`advertest model register`: hash weights, bài kiểm tra gradient trên ảnh fixture."""
    # Import muộn: torch, ultralytics chỉ cần khi thật sự đăng ký model.
    from ml_core.models.register import load_check_images, register_model

    return register_model(
        store, decl.weights, decl.file.name, load_check_images(), device=decl.file.device
    )


def apply_to_store(
    store: ArtifactStore,
    models: Sequence[ModelDecl],
    datasets: Sequence[DatasetDecl],
    *,
    register: ModelRegistrar = register_declared_model,
) -> StoreImport:
    """Đăng ký model, import dataset, tạo slice và mapping vào `store`. Chạy lại an toàn: store
    là bất biến, cùng nội dung cho cùng hash."""
    result = StoreImport()
    declared: dict[str, ModelCard] = {}
    for model in models:
        card = register(store, model)
        declared[model.file.name] = card
        result.models.append(card)
    for decl in datasets:
        try:
            manifest = import_kitti(decl.root, decl.file.split)
        except ValueError as exc:
            raise ConfigFileError(f"{decl.source}: {exc}") from exc
        sha = save_dataset(store, manifest, decl.root)
        imported = DatasetImported(name=decl.file.name, dataset_version_sha256=sha)
        for item in decl.file.slices:
            try:
                spec = create_slice(manifest, item.size, item.seed, preset_filter(item.preset))
            except ValueError as exc:
                raise ConfigFileError(f"{decl.source}: slice {item}: {exc}") from exc
            save_slice(store, spec)
            imported.slices.append(spec)
        for mapping_decl in decl.file.mappings:
            card = _find_model(store, mapping_decl.model, declared)
            try:
                mapping = build_mapping(sha, card, mapping_decl.preset)
            except ValueError as exc:
                raise ConfigFileError(f"{decl.source}: mapping {mapping_decl}: {exc}") from exc
            save_mapping(store, mapping)
            imported.mappings.append(mapping)
        result.datasets.append(imported)
    return result
