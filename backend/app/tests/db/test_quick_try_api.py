"""Thử nhanh (`POST /quick-try`, `GET /quick-try/images`) và `display` của attack spec
(`catalog sync`), với Postgres và MinIO thật (docs/thu-nhanh.md, docs/mo-rong-bang-config.md)."""

from __future__ import annotations

import base64
import io
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import TypeAdapter
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from advertest_contracts.enums import Role
from advertest_contracts.ids import content_id
from advertest_contracts.models import (
    AttackSpecBody,
    AttackSpecDisplay,
    AttackSpecView,
    ErrorResponse,
    QuickTryImage,
    QuickTryResult,
)
from attacks.catalog_config import AttackEntry, load_attack_dir, spec_from_body
from backend.admin_cli.seed import _seed_attack_specs, load_attack_specs
from backend.app.api.deps import get_clock, get_sessionmaker
from backend.app.api.public import get_buckets
from backend.app.db import models as m
from backend.app.main import create_app
from backend.app.services import catalog_sync, registry
from backend.app.services.errors import Conflict
from backend.app.storage import Buckets

from .conftest import make_user
from .local_store_factory import LocalData, build_local_store
from .test_auth_api import Env, _csrf, _login, _user, env

pytestmark = pytest.mark.db
__all__ = ["env"]
CONFIG_DIR = Path(__file__).resolve().parents[4] / "configs" / "attacks"


@pytest.fixture(scope="module")
def local(tmp_path_factory: pytest.TempPathFactory) -> LocalData:
    return build_local_store(tmp_path_factory.mktemp("quick_try"))


@pytest.fixture
def world(app_engine: Engine, local: LocalData, buckets: Buckets) -> LocalData:
    with Session(app_engine) as session, session.begin():
        admin = make_user(session)
        _seed_attack_specs(session, load_attack_specs())
        registry.import_local(session, local.store, buckets, actor=admin)
    return local


@pytest.fixture
def client(env: Env, buckets: Buckets) -> Iterator[TestClient]:
    """Như `Env.client`, cộng bucket MinIO tạm cho Thử nhanh."""
    app = create_app()
    factory = sessionmaker(env.engine)
    app.dependency_overrides[get_sessionmaker] = lambda: factory
    app.dependency_overrides[get_clock] = lambda: env.clock
    app.dependency_overrides[get_buckets] = lambda: buckets
    with TestClient(app, headers={"X-Forwarded-For": env.ip}) as c:
        yield c


def _login_as(env: Env, client: TestClient, role: Role) -> None:
    _, email = _user(env.engine, roles=(role,))
    assert _login(client, email).status_code == 200


def _body(world: LocalData, **extra: Any) -> dict[str, Any]:
    return {
        "model_version_id": str(world.card.id),
        "dataset_version_id": str(content_id(world.slice.dataset_version_sha256)),
        "image_id": world.slice.image_ids[0],
        **extra,
    }


def _post(client: TestClient, body: dict[str, Any]) -> Any:
    return client.post("/quick-try", json=body, headers=_csrf(client))


def _png_base64(size: tuple[int, int] = (96, 48)) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", size, (90, 140, 200)).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def test_quick_try_fgsm_on_dataset_image(env: Env, client: TestClient, world: LocalData) -> None:
    _login_as(env, client, Role.ENGINEER)
    response = _post(client, _body(world, attack_name="fgsm", level=8, seed=1))
    assert response.status_code == 200, response.text
    result = QuickTryResult.model_validate(response.json())
    width, height = next(
        (i.width, i.height) for i in world.manifest.images if i.image_id == world.slice.image_ids[0]
    )
    assert (result.width, result.height) == (width, height)
    assert result.source == "dataset" and result.image_id == world.slice.image_ids[0]
    assert result.attack_name == "fgsm" and result.unit == "1/255" and result.level == 8
    assert result.labels_source == "ground_truth"  # có class mapping cho (dataset, model)
    # Dataset chưa ẩn danh: ảnh hiển thị làm mờ theo rule_v1.
    assert result.anonymization is not None and result.anonymization.method == "rule_v1"
    for box in [*result.clean, *result.attacked]:
        assert box.bbox[2] <= width and box.bbox[3] <= height
    assert result.timing.total_ms >= result.timing.attack_ms


def test_quick_try_by_spec_id_reviewer_and_upload(
    env: Env, client: TestClient, world: LocalData
) -> None:
    _login_as(env, client, Role.REVIEWER)
    fog = next(s for s in load_attack_specs() if s.name == "fog")
    response = _post(client, _body(world, attack_spec_id=str(fog.id), level=3))
    assert response.status_code == 200, response.text
    assert QuickTryResult.model_validate(response.json()).attack_spec_id == fog.id

    upload = {
        "model_version_id": str(world.card.id),
        "attack_name": "bbox_occlusion",
        "level": 0.3,
        "image_base64": _png_base64(),
    }
    response = _post(client, upload)
    assert response.status_code == 200, response.text
    result = QuickTryResult.model_validate(response.json())
    assert result.source == "upload" and result.dataset_version_id is None
    assert (result.width, result.height) == (96, 48)
    assert result.labels_source == "clean_predictions"
    assert result.anonymization is not None  # ảnh tải lên luôn làm mờ


@pytest.mark.parametrize(
    ("extra", "status", "code"),
    [
        ({"attack_name": "fgsm", "level": 64}, 422, "invalid_request"),
        ({"attack_name": "fog", "level": 2.5}, 422, "invalid_request"),
        ({"attack_name": "adv_patch", "level": 0.1}, 422, "invalid_request"),
        ({"attack_name": "fgsm", "level": 4, "image_base64": "abc"}, 422, "validation_error"),
        ({"level": 4}, 422, "validation_error"),
        ({"attack_name": "no_such_attack", "level": 4}, 404, "not_found"),
        ({"attack_name": "fgsm", "level": 4, "image_id": "999999"}, 404, "not_found"),
    ],
)
def test_quick_try_rejects_bad_requests(
    env: Env,
    client: TestClient,
    world: LocalData,
    extra: dict[str, Any],
    status: int,
    code: str,
) -> None:
    _login_as(env, client, Role.ENGINEER)
    response = _post(client, _body(world, **extra))
    assert response.status_code == status, response.text
    assert ErrorResponse.model_validate(response.json()).error.code == code


def test_quick_try_image_outside_slices_and_bad_upload(
    env: Env, client: TestClient, world: LocalData
) -> None:
    _login_as(env, client, Role.ENGINEER)
    outside = next(
        i.image_id for i in world.manifest.images if i.image_id not in world.slice.image_ids
    )
    response = _post(client, _body(world, attack_name="fog", level=1, image_id=outside))
    assert response.status_code == 404 and "MinIO" in response.json()["error"]["message"]
    upload = {
        "model_version_id": str(world.card.id),
        "attack_name": "fog",
        "level": 1,
        "image_base64": base64.b64encode(b"not an image").decode(),
    }
    response = _post(client, upload)
    assert response.status_code == 422 and response.json()["error"]["code"] == "invalid_request"
    response = _post(client, {**upload, "model_version_id": str(uuid.uuid4())})
    assert response.status_code == 404


def test_quick_try_images(env: Env, client: TestClient, world: LocalData) -> None:
    assert client.get("/quick-try/images").status_code == 401
    _login_as(env, client, Role.REVIEWER)
    version_id = content_id(world.slice.dataset_version_sha256)
    response = client.get("/quick-try/images", params={"dataset_version": str(version_id)})
    assert response.status_code == 200, response.text
    images = TypeAdapter(list[QuickTryImage]).validate_python(response.json())
    assert [i.image_id for i in images] == sorted(world.slice.image_ids)
    assert all(i.thumbnail.startswith("data:image/webp;base64,") for i in images)
    response = client.get("/quick-try/images", params={"limit": 1})
    assert response.status_code == 200 and len(response.json()) == 1
    assert client.get("/quick-try/images", params={"limit": 0}).status_code == 422


# ---------------------------------------------------------------- catalog sync + display


def _entry(name: str, *, version: int = 1, display: AttackSpecDisplay | None) -> AttackEntry:
    base = next(e for e in load_attack_dir(CONFIG_DIR) if e.spec.name == "fgsm")
    body = base.spec.model_dump(mode="json", exclude={"id", "spec_sha256"})
    body.update(name=name, version=version)
    if version > 1:
        body["fixed_params"] = {"norm": 2}
    spec = spec_from_body(AttackSpecBody.model_validate(body))
    return AttackEntry(spec=spec, display=display, source=CONFIG_DIR / f"{name}.yaml")


def test_catalog_sync_rules(db: Session, admin: m.User) -> None:
    name = f"fgsm_{uuid.uuid4().hex[:8]}"
    first = _entry(name, display=AttackSpecDisplay(title_vi="A", recommended_levels=[2, 4]))
    report = catalog_sync.sync_attack_specs(db, [first], actor=admin)
    assert report.inserted == [f"{name} v1"]
    row = db.get(m.AttackSpecRow, first.spec.id)
    assert row is not None and first.display is not None
    assert row.display == first.display.model_dump(mode="json")
    spec_before = dict(row.spec)

    renamed = _entry(name, display=AttackSpecDisplay(title_vi="B"))
    report = catalog_sync.sync_attack_specs(db, [renamed], actor=admin)
    assert report.display_updated == [f"{name} v1"]
    assert row.spec == spec_before and row.display is not None and row.display["title_vi"] == "B"
    assert catalog_sync.sync_attack_specs(db, [renamed], actor=admin).unchanged == [f"{name} v1"]

    # Đổi phần thân mà giữ version: từ chối.
    changed = _entry(name, version=2, display=None)
    clash = AttackEntry(
        spec=changed.spec.model_copy(update={"version": 1}), display=None, source=changed.source
    )
    with pytest.raises(Conflict, match="tăng version"):
        catalog_sync.sync_attack_specs(db, [clash], actor=admin)

    report = catalog_sync.sync_attack_specs(db, [changed], actor=admin, deactivate_older=True)
    assert report.inserted == [f"{name} v2"] and report.deactivated == [f"{name} v1"]
    assert row.is_active is False


def test_attack_specs_endpoint_exposes_display(
    env: Env, client: TestClient, world: LocalData
) -> None:
    with Session(env.engine) as session, session.begin():
        admin = make_user(session)
        catalog_sync.sync_attack_specs(session, load_attack_dir(CONFIG_DIR), actor=admin)
    _login_as(env, client, Role.ENGINEER)
    response = client.get("/attack-specs")
    assert response.status_code == 200
    specs = {s.name: s for s in TypeAdapter(list[AttackSpecView]).validate_python(response.json())}
    fgsm = specs["fgsm"]
    assert fgsm.display is not None and fgsm.display.quick_try_level == 8
    assert fgsm.display.description_vi and fgsm.display.recommended_levels
