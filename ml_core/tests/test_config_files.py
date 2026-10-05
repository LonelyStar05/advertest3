"""Khai model và dataset bằng YAML (`configs/models/`, `configs/datasets/`)."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from advertest_contracts.hashing import sha256_of
from advertest_contracts.models import ModelCard
from ml_core.config_files import (
    ConfigFileError,
    ModelDecl,
    apply_to_store,
    load_config_tree,
    load_dataset_file,
    load_model_file,
)
from ml_core.data.kitti import import_kitti
from ml_core.data.mapping import load_mapping
from ml_core.data.slice import load_slice
from ml_core.data.tests.kitti_factory import label_line, make_kitti
from ml_core.data.tests.test_mapping_slice import model_card
from ml_core.store import ArtifactStore, LocalStore, resolve_id

REPO = Path(__file__).resolve().parents[2]


def _write(path: Path, data: object) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    return path


def _kitti(root: Path) -> Path:
    car = label_line("Car", (10, 5, 60, 35))
    person = label_line("Pedestrian", (70, 2, 90, 38))
    return make_kitti(root, {"000001": [car], "000002": [car, person], "000003": [person]})


def _tree(tmp_path: Path) -> Path:
    configs = tmp_path / "configs"
    weights = tmp_path / "weights" / "m.pt"
    weights.parent.mkdir()
    weights.write_bytes(b"fake")
    _kitti(tmp_path / "data" / "kitti")
    _write(configs / "models" / "m.yaml", {"name": "test", "weights": "../../weights/m.pt"})
    _write(
        configs / "datasets" / "d.yaml",
        {
            "name": "mini-kitti",
            "format": "kitti",
            "root": "../../data/kitti",
            "slices": [{"size": 2, "seed": 1}, {"size": 3, "seed": 0}],
            "mappings": [{"model": "test", "preset": "kitti-coco"}],
        },
    )
    return configs


def test_example_configs_load() -> None:
    models, datasets = load_config_tree(REPO / "configs")
    assert [m.file.name for m in models] == ["yolov8n-coco"]
    assert models[0].weights == REPO / "tests" / "fixtures" / "yolov8n.pt"
    assert [d.file.format for d in datasets] == ["kitti"]
    assert datasets[0].file.mappings[0].model == "yolov8n-coco"


def test_relative_paths_resolve_from_yaml_dir(tmp_path: Path) -> None:
    models, datasets = load_config_tree(_tree(tmp_path))
    assert models[0].weights == (tmp_path / "weights" / "m.pt").resolve()
    assert datasets[0].root == (tmp_path / "data" / "kitti").resolve()


def test_apply_to_store_registers_dataset_slices_mappings(tmp_path: Path) -> None:
    models, datasets = load_config_tree(_tree(tmp_path))
    store = LocalStore(tmp_path / "store")
    calls: list[ModelDecl] = []

    def fake_register(_store: ArtifactStore, decl: ModelDecl) -> ModelCard:
        calls.append(decl)
        return model_card()

    result = apply_to_store(store, models, datasets, register=fake_register)
    assert [d.file.name for d in calls] == ["test"]
    (imported,) = result.datasets
    manifest = import_kitti((tmp_path / "data" / "kitti").resolve(), "training")
    assert imported.dataset_version_sha256 == sha256_of(manifest)
    assert [s.size for s in imported.slices] == [2, 3]
    for spec in imported.slices:
        assert load_slice(store, resolve_id(store, "slice", spec.id)) == spec
    (mapping,) = imported.mappings
    assert load_mapping(store, mapping.mapping_sha256) == mapping
    assert result.dataset_names() == {imported.dataset_version_sha256: "mini-kitti"}
    # Chạy lại cho cùng kết quả (store bất biến).
    again = apply_to_store(store, models, datasets, register=fake_register)
    assert again.datasets[0].slices == imported.slices


def test_slice_larger_than_eligible_images(tmp_path: Path) -> None:
    configs = _tree(tmp_path)
    path = configs / "datasets" / "d.yaml"
    data = yaml.safe_load(path.read_text())
    data["slices"] = [{"size": 50}]
    _write(path, data)
    models, datasets = load_config_tree(configs)
    with pytest.raises(ConfigFileError, match="không đủ"):
        apply_to_store(
            LocalStore(tmp_path / "s"), models, datasets, register=lambda *_: model_card()
        )


def test_unknown_mapping_model(tmp_path: Path) -> None:
    configs = _tree(tmp_path)
    (configs / "models" / "m.yaml").unlink()
    models, datasets = load_config_tree(configs)
    with pytest.raises(ConfigFileError, match="Không có model 'test'"):
        apply_to_store(LocalStore(tmp_path / "s"), models, datasets)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"format": "coco"}, "chưa hỗ trợ"),
        ({"root": "../../nowhere"}, "không có thư mục"),
        ({"slices": [{"preset": "voc"}]}, "Preset"),
        ({"extra": 1}, "extra"),
    ],
)
def test_invalid_dataset_files(tmp_path: Path, change: dict[str, object], message: str) -> None:
    configs = _tree(tmp_path)
    path = configs / "datasets" / "d.yaml"
    data = {**yaml.safe_load(path.read_text()), **change}
    with pytest.raises(ConfigFileError, match=message):
        load_dataset_file(_write(path, data))


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"weights": "missing.pt"}, "không có file weights"),
        ({"framework": "torchvision"}, "framework"),
        ({"name": "has space"}, "name"),
    ],
)
def test_invalid_model_files(tmp_path: Path, change: dict[str, object], message: str) -> None:
    configs = _tree(tmp_path)
    path = configs / "models" / "m.yaml"
    data = {**yaml.safe_load(path.read_text()), **change}
    with pytest.raises(ConfigFileError, match=message):
        load_model_file(_write(path, data))


def test_duplicate_model_names(tmp_path: Path) -> None:
    configs = _tree(tmp_path)
    (configs / "models" / "copy.yml").write_text((configs / "models" / "m.yaml").read_text())
    with pytest.raises(ConfigFileError, match="trùng"):
        load_config_tree(configs)
