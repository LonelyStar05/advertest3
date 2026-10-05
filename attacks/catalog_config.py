"""Khai attack spec bằng YAML trong `configs/attacks/` (docs/mo-rong-bang-config.md).

Mỗi file là một spec: các trường của `AttackSpecBody` (name, version, kind, access, art_class,
primary_param, fixed_params, cost_model, requires_gradients, ...) cộng khối tùy chọn `display`
(`AttackSpecDisplay`: tên và mô tả tiếng Việt / tiếng Anh, level mặc định và level gợi ý).

`id` và `spec_sha256` được tính từ nội dung (như seed trong `contracts/seeds/`), không viết tay.
Spec phải dựng được bằng code hiện có (`attacks.factory.check_supported`). `display` không vào
hash: sửa mô tả không cần tăng `version`; sửa phần thân thì phải tăng `version` (luật bất biến của
catalog, kiểm tra khi đồng bộ vào DB).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from advertest_contracts.ids import content_id
from advertest_contracts.models import (
    AttackSpec,
    AttackSpecBody,
    AttackSpecDisplay,
    compute_spec_sha256,
    display_levels_error,
)
from attacks.art_adapter import UnsupportedAttack
from attacks.common.checks import UnsupportedTransform
from attacks.factory import check_supported

YAML_SUFFIXES = (".yaml", ".yml")
_SERVER_FIELDS = ("id", "spec_sha256")


class AttackConfigError(ValueError):
    """File YAML của attack sai (kèm đường dẫn file)."""


@dataclass(frozen=True)
class AttackEntry:
    spec: AttackSpec
    display: AttackSpecDisplay | None
    source: Path


def spec_from_body(body: AttackSpecBody) -> AttackSpec:
    """`AttackSpec` đầy đủ (id = content_id(spec_sha256)) từ phần thân."""
    sha = compute_spec_sha256(body)
    return AttackSpec.model_validate(
        {**body.model_dump(mode="json"), "id": str(content_id(sha)), "spec_sha256": sha}
    )


def parse_attack(data: Any, source: Path) -> AttackEntry:
    if not isinstance(data, dict):
        raise AttackConfigError(f"{source}: cần một mapping YAML (name, version, kind, ...)")
    raw = dict(data)
    present = [key for key in _SERVER_FIELDS if key in raw]
    if present:
        raise AttackConfigError(f"{source}: không khai {', '.join(present)} (được tính tự động)")
    display_raw = raw.pop("display", None)
    try:
        body = AttackSpecBody.model_validate(raw)
        display = None if display_raw is None else AttackSpecDisplay.model_validate(display_raw)
    except ValidationError as exc:
        raise AttackConfigError(f"{source}: {exc}") from exc
    if display is not None:
        error = display_levels_error(body, display)
        if error is not None:
            raise AttackConfigError(f"{source}: display: {error}")
    spec = spec_from_body(body)
    try:
        check_supported(spec)
    except (UnsupportedAttack, UnsupportedTransform) as exc:
        raise AttackConfigError(f"{source}: {exc}") from exc
    return AttackEntry(spec=spec, display=display, source=source)


def load_attack_file(path: Path) -> AttackEntry:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise AttackConfigError(f"{path}: YAML không hợp lệ: {exc}") from exc
    return parse_attack(data, path)


def attack_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        raise AttackConfigError(f"Không có thư mục {directory}")
    return sorted(p for p in directory.iterdir() if p.is_file() and p.suffix in YAML_SUFFIXES)


def load_attack_dir(directory: Path) -> list[AttackEntry]:
    """Mọi spec trong thư mục (theo tên file); hai file cùng (name, version) là lỗi."""
    entries = [load_attack_file(path) for path in attack_files(directory)]
    seen: dict[tuple[str, int], Path] = {}
    for entry in entries:
        key = (entry.spec.name, entry.spec.version)
        if key in seen:
            raise AttackConfigError(
                f"{entry.source}: trùng {key[0]} v{key[1]} với {seen[key]} (mỗi version một file)"
            )
        seen[key] = entry.source
    return entries


def dump_attack_yaml(spec: AttackSpec, display: AttackSpecDisplay | None = None) -> str:
    """YAML của một spec (dùng để sinh file mẫu từ seed)."""
    data: dict[str, Any] = spec.model_dump(mode="json", exclude=set(_SERVER_FIELDS))
    if display is not None:
        data["display"] = display.model_dump(mode="json", exclude_defaults=True)
    text: str = yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
    return text
