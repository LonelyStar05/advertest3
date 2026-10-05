"""Đồng bộ attack spec khai bằng YAML (`configs/attacks/`) vào bảng `attack_specs`
(`advertest-admin catalog sync`, docs/mo-rong-bang-config.md).

Luật bất biến của catalog (như seed):
- spec đã có (cùng `spec_sha256`): giữ nguyên phần thân; chỉ cập nhật `display` khi khác;
- cùng `(name, version)` nhưng khác nội dung: lỗi, vì đổi spec phải tăng `version`;
- spec mới: thêm, đang hoạt động. `deactivate_older = True` thì tắt các version cũ hơn cùng tên
  (run, protocol đã tham chiếu vẫn giữ nguyên spec cũ).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from attacks.catalog_config import AttackEntry
from backend.app.db import models as m
from backend.app.services import audit
from backend.app.services.errors import Conflict


@dataclass
class SyncReport:
    inserted: list[str] = field(default_factory=list)
    display_updated: list[str] = field(default_factory=list)
    unchanged: list[str] = field(default_factory=list)
    deactivated: list[str] = field(default_factory=list)

    def summary(self) -> dict[str, list[str]]:
        return {
            "inserted": self.inserted,
            "display_updated": self.display_updated,
            "unchanged": self.unchanged,
            "deactivated": self.deactivated,
        }


def _label(name: str, version: int) -> str:
    return f"{name} v{version}"


def sync_attack_specs(
    session: Session,
    entries: Sequence[AttackEntry],
    *,
    actor: m.User,
    deactivate_older: bool = False,
) -> SyncReport:
    report = SyncReport()
    for entry in entries:
        spec = entry.spec
        label = _label(spec.name, spec.version)
        display = None if entry.display is None else entry.display.model_dump(mode="json")
        row = session.scalar(
            select(m.AttackSpecRow).where(m.AttackSpecRow.spec_sha256 == spec.spec_sha256)
        )
        if row is not None:
            if row.display != display:
                row.display = display
                report.display_updated.append(label)
            else:
                report.unchanged.append(label)
            continue
        clash = session.scalar(
            select(m.AttackSpecRow).where(
                m.AttackSpecRow.name == spec.name, m.AttackSpecRow.version == spec.version
            )
        )
        if clash is not None:
            raise Conflict(
                f"{entry.source}: {label} đã có trong catalog với nội dung khác"
                f" (spec_sha256 {clash.spec_sha256[:12]}…); đổi spec phải tăng version"
            )
        session.add(
            m.AttackSpecRow(
                id=spec.id,
                name=spec.name,
                version=spec.version,
                kind=spec.kind,
                access=spec.access,
                spec=spec.model_dump(mode="json"),
                spec_sha256=spec.spec_sha256,
                display=display,
            )
        )
        session.flush()
        report.inserted.append(label)
        if deactivate_older:
            older = session.scalars(
                select(m.AttackSpecRow).where(
                    m.AttackSpecRow.name == spec.name,
                    m.AttackSpecRow.version < spec.version,
                    m.AttackSpecRow.is_active,
                )
            )
            for old in older:
                old.is_active = False
                report.deactivated.append(_label(old.name, old.version))
    session.flush()
    if report.inserted or report.display_updated or report.deactivated:
        audit.record(
            session,
            actor=actor,
            action="attack_catalog.sync",
            entity_type="attack_spec",
            entity_id=None,
            after=report.summary(),
        )
    return report
