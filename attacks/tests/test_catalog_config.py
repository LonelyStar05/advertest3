"""Khai attack spec bằng YAML (`configs/attacks/`, docs/mo-rong-bang-config.md)."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from advertest_contracts.models import AttackSpecView
from attacks.catalog_config import (
    AttackConfigError,
    dump_attack_yaml,
    load_attack_dir,
    load_attack_file,
)
from attacks.registry import load_catalog

CONFIG_DIR = Path(__file__).resolve().parents[2] / "configs" / "attacks"


def _write(path: Path, data: object) -> Path:
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return path


def _fgsm(_tmp_path: Path) -> dict[str, object]:
    data: dict[str, object] = yaml.safe_load((CONFIG_DIR / "fgsm.yaml").read_text(encoding="utf-8"))
    return data


def test_example_configs_reproduce_the_seed_catalog() -> None:
    """File mẫu khớp từng spec của seed: cùng id, cùng spec_sha256."""
    entries = load_attack_dir(CONFIG_DIR)
    seed = {(s.name, s.version): s for s in load_catalog()}
    assert {(e.spec.name, e.spec.version) for e in entries} == set(seed)
    for entry in entries:
        assert entry.spec == seed[(entry.spec.name, entry.spec.version)]
        assert entry.display is not None and entry.display.description_vi


def test_display_is_exposed_through_view() -> None:
    entry = load_attack_file(CONFIG_DIR / "fgsm.yaml")
    view = AttackSpecView.model_validate(
        {**entry.spec.model_dump(mode="json"), "display": entry.display}
    )
    assert view.display is not None and view.display.quick_try_level == 8


def test_display_does_not_change_hash(tmp_path: Path) -> None:
    data = _fgsm(tmp_path)
    data["display"] = {"title_vi": "Khác", "recommended_levels": [3]}
    entry = load_attack_file(_write(tmp_path / "a.yaml", data))
    assert entry.spec == load_attack_file(CONFIG_DIR / "fgsm.yaml").spec


def test_body_change_changes_hash_and_id(tmp_path: Path) -> None:
    data = _fgsm(tmp_path)
    data["version"] = 2
    data["fixed_params"] = {"norm": 2}
    entry = load_attack_file(_write(tmp_path / "a.yaml", data))
    original = load_attack_file(CONFIG_DIR / "fgsm.yaml").spec
    assert entry.spec.spec_sha256 != original.spec_sha256 and entry.spec.id != original.id


def test_roundtrip_dump(tmp_path: Path) -> None:
    entry = load_attack_file(CONFIG_DIR / "pgd_linf.yaml")
    path = tmp_path / "pgd.yaml"
    path.write_text(dump_attack_yaml(entry.spec, entry.display), encoding="utf-8")
    again = load_attack_file(path)
    assert (again.spec, again.display) == (entry.spec, entry.display)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"id": "8d15422d-f111-5c7e-96eb-e704767e6218"}, "tự động"),
        ({"display": {"recommended_levels": [64]}}, "ngoài dải"),
        ({"art_class": "CarliniL2Method"}, "chưa được hỗ trợ"),
        ({"kind": "corruption", "access": "not_applicable", "art_class": None}, "corruption"),
        ({"primary_param": {"name": "eps", "type": "continuous", "min": 1, "max": 0, "unit": "x"}},
         "min"),
        ({"unknown_field": 1}, "unknown_field"),
    ],
)  # fmt: skip
def test_invalid_files_are_rejected(
    tmp_path: Path, change: dict[str, object], message: str
) -> None:
    data = {**_fgsm(tmp_path), **change}
    with pytest.raises(AttackConfigError, match=message):
        load_attack_file(_write(tmp_path / "bad.yaml", data))


def test_discrete_levels_must_be_listed(tmp_path: Path) -> None:
    data = yaml.safe_load((CONFIG_DIR / "fog.yaml").read_text(encoding="utf-8"))
    data["display"] = {"recommended_levels": [2.5]}
    with pytest.raises(AttackConfigError, match="values"):
        load_attack_file(_write(tmp_path / "fog.yaml", data))


def test_duplicate_name_version_in_dir(tmp_path: Path) -> None:
    data = _fgsm(tmp_path)
    _write(tmp_path / "a.yaml", data)
    _write(tmp_path / "b.yml", {**data, "display": {"title_vi": "x"}})
    with pytest.raises(AttackConfigError, match="trùng fgsm v1"):
        load_attack_dir(tmp_path)


def test_invalid_yaml_and_missing_dir(tmp_path: Path) -> None:
    bad = tmp_path / "x.yaml"
    bad.write_text("name: [", encoding="utf-8")
    with pytest.raises(AttackConfigError, match="YAML"):
        load_attack_file(bad)
    with pytest.raises(AttackConfigError, match="Không có thư mục"):
        load_attack_dir(tmp_path / "missing")
