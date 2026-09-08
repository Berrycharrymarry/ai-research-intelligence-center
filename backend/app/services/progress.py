"""Small, thread-safe collection snapshots for the single-worker web service.

Paper counts and terminal status remain durable in Project. These transient details
are deliberately not a database migration; startup reconciles interrupted jobs.
"""
from collections import OrderedDict
from datetime import datetime, timezone
from threading import Lock

_lock = Lock()
_states: OrderedDict[int, dict] = OrderedDict()


def update(project_id: int, **values) -> dict:
    with _lock:
        state = _states.setdefault(project_id, {"stage": "queued", "collected": 0,
                                               "target": None, "message": "Preparing collection"})
        state.update(values)
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        _states.move_to_end(project_id)
        if len(_states) > 256:
            for key, old in list(_states.items()):
                if key != project_id and old.get("stage") in ("ready", "error"):
                    _states.pop(key)
                    break
        return dict(state)


def begin(project_id: int, collected: int, target: int) -> dict:
    with _lock:
        _states.pop(project_id, None)
    return update(project_id, stage="queued", collected=collected, target=target,
                  message="Preparing collection", warning=None, retry_after=None)


def snapshot(project_id: int, status: str, collected: int) -> dict | None:
    with _lock:
        state = _states.get(project_id)
        if state:
            result = dict(state)
            # The committed database count wins over a transient snapshot.
            result["collected"] = collected
            return result
    if status in ("collecting", "analyzing"):
        return {"stage": "analyzing" if status == "analyzing" else "queued",
                "collected": collected, "target": None,
                "message": "Preparing collection", "updated_at": None}
    return None


def forget(project_id: int) -> None:
    with _lock:
        _states.pop(project_id, None)
