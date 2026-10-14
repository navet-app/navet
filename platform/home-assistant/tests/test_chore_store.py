"""Dependency-light contract tests for the Home Assistant chore authority.

The production integration is exercised through the same Store, service, timer,
and WebSocket-facing methods while tiny host fakes keep this suite runnable in
the main Navet CI job without installing Home Assistant itself.
"""

from __future__ import annotations

import asyncio
import copy
import importlib.util
import json
import pathlib
import sys
import types
import tempfile
import threading
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

_TRACKED_INTERVALS = []


class _Schema:
    def extend(self, _value, **_kwargs):
        return self


class _Store:
    values: dict[str, object] = {}

    def __init__(self, _hass, _version, key, **_kwargs):
        self.key = key

    async def async_load(self):
        return copy.deepcopy(self.values.get(self.key))

    async def async_save(self, value):
        self.values[self.key] = copy.deepcopy(value)

    async def async_remove(self):
        self.values.pop(self.key, None)


class _Bus:
    def __init__(self):
        self.events = []
        self.listeners = {}

    def async_fire(self, event_type, data):
        self.events.append((event_type, copy.deepcopy(data)))

    def async_listen(self, event_type, callback):
        self.listeners[event_type] = callback
        return lambda: self.listeners.pop(event_type, None)


class _Services:
    def __init__(self):
        self.calls = []
        self.error = None

    async def async_call(self, domain, service, data, **kwargs):
        self.calls.append((domain, service, copy.deepcopy(data), kwargs))
        if self.error:
            raise self.error


class _Hass:
    def __init__(self):
        self.data = {}
        self.bus = _Bus()
        self.services = _Services()
        self.config = types.SimpleNamespace(path=lambda _name: "/nonexistent-navet-test-storage")

    async def async_add_executor_job(self, function, *args):
        return function(*args)


class _Connection:
    def __init__(self, user_id="ha-user-1"):
        self.user = types.SimpleNamespace(id=user_id)
        self.subscriptions = {}
        self.results = []
        self.events = []
        self.errors = []
        self.messages = []

    def send_result(self, message_id, result=None):
        self.results.append((message_id, copy.deepcopy(result)))

    def send_event(self, message_id, event):
        self.events.append((message_id, copy.deepcopy(event)))

    def send_error(self, message_id, code, message):
        self.errors.append((message_id, code, message))

    def send_message(self, message):
        self.messages.append(copy.deepcopy(message))


class _SensorEntity:
    def __init__(self):
        self._remove_callbacks = []
        self.write_count = 0

    async def async_added_to_hass(self):
        return None

    def async_on_remove(self, callback):
        self._remove_callbacks.append(callback)

    def async_write_ha_state(self):
        self.write_count += 1


def _install_host_fakes() -> None:
    voluptuous = types.ModuleType("voluptuous")
    voluptuous.Required = lambda value: value
    voluptuous.ALLOW_EXTRA = object()
    sys.modules["voluptuous"] = voluptuous

    websocket_api = types.ModuleType("homeassistant.components.websocket_api")
    websocket_api.ActiveConnection = object
    websocket_api.BASE_COMMAND_MESSAGE_SCHEMA = _Schema()
    websocket_api.async_register_command = lambda *_args, **_kwargs: None
    websocket_api.async_response = lambda function: function

    homeassistant = types.ModuleType("homeassistant")
    components = types.ModuleType("homeassistant.components")
    components.websocket_api = websocket_api
    sensor_component = types.ModuleType("homeassistant.components.sensor")
    sensor_component.SensorEntity = _SensorEntity
    calendar_component = types.ModuleType("homeassistant.components.calendar")
    calendar_component.CalendarEntity = _SensorEntity
    calendar_component.CalendarEvent = lambda **kwargs: types.SimpleNamespace(**kwargs)
    core = types.ModuleType("homeassistant.core")
    core.HomeAssistant = object
    core.Event = object
    core.callback = lambda function: function
    config_entries = types.ModuleType("homeassistant.config_entries")
    config_entries.ConfigEntry = object
    helpers = types.ModuleType("homeassistant.helpers")
    event = types.ModuleType("homeassistant.helpers.event")

    def track_interval(_hass, callback, interval):
        registration = {
            "callback": callback,
            "interval": interval,
            "cancelled": False,
        }
        _TRACKED_INTERVALS.append(registration)

        def cancel():
            registration["cancelled"] = True

        return cancel

    event.async_track_time_interval = track_interval
    storage = types.ModuleType("homeassistant.helpers.storage")
    storage.Store = _Store
    entity_platform = types.ModuleType("homeassistant.helpers.entity_platform")
    entity_platform.AddConfigEntryEntitiesCallback = object
    util = types.ModuleType("homeassistant.util")
    dt = types.ModuleType("homeassistant.util.dt")
    dt.utcnow = lambda: datetime.now(timezone.utc)
    dt.now = lambda: datetime.now(timezone.utc)
    util.dt = dt

    sys.modules.update(
        {
            "homeassistant": homeassistant,
            "homeassistant.components": components,
            "homeassistant.components.sensor": sensor_component,
            "homeassistant.components.calendar": calendar_component,
            "homeassistant.components.websocket_api": websocket_api,
            "homeassistant.config_entries": config_entries,
            "homeassistant.core": core,
            "homeassistant.helpers": helpers,
            "homeassistant.helpers.event": event,
            "homeassistant.helpers.entity_platform": entity_platform,
            "homeassistant.helpers.storage": storage,
            "homeassistant.util": util,
            "homeassistant.util.dt": dt,
        }
    )

    package = types.ModuleType("navet")
    package.__path__ = []
    const = types.ModuleType("navet.const")
    const.DOMAIN = "navet"
    const.CHORE_PROJECTION_EVENT = "navet_chore_projection"
    sys.modules["navet"] = package
    sys.modules["navet.const"] = const


def _load_module():
    _install_host_fakes()
    path = (
        pathlib.Path(__file__).parents[1]
        / "custom_components"
        / "navet"
        / "chore_store.py"
    )
    spec = importlib.util.spec_from_file_location("navet.chore_store", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _load_sensor_module():
    path = (
        pathlib.Path(__file__).parents[1]
        / "custom_components"
        / "navet"
        / "sensor.py"
    )
    spec = importlib.util.spec_from_file_location("navet.sensor", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _load_calendar_module():
    path = pathlib.Path(__file__).parents[1] / "custom_components" / "navet" / "calendar.py"
    spec = importlib.util.spec_from_file_location("navet.calendar", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


chores = _load_module()
sensors = _load_sensor_module()
calendars = _load_calendar_module()


def _participant(participant_id="manager", *, destination=None):
    timestamp = "2026-08-28T08:00:00.000Z"
    participant = {
        "id": participant_id,
        "displayName": participant_id.title(),
        "capabilities": ["complete", "approve", "manage"],
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }
    if destination:
        participant["reminderPreferences"] = {
            "enabled": True,
            "destination": destination,
        }
    return participant


def _continuous_materialization_fixture():
    root = pathlib.Path(__file__).parents[3]
    document = json.loads((root / "testing/fixtures/chores/continuous-materialization.json").read_text())
    document["data"] = {**chores._empty_data(), **document["data"]}
    start = datetime(2026, 10, 12, tzinfo=timezone.utc)
    events = [{"id": f"activity:chore:legacy-materialization:{index}",
        "commandId": f"chore:legacy-materialization:{index}", "type": "workspace_materialized",
        "timestamp": chores._iso(start + timedelta(seconds=index))} for index in range(37_288)]
    completed = [item for item in document["data"]["occurrencesById"].values() if item["status"] == "done"]
    for index, item in enumerate(completed):
        events[100 if index == 0 else 30_000] = {"id": f"activity:completion:{item['id']}",
            "commandId": f"completion:{item['id']}", "type": "completed", "timestamp": item["completedAt"],
            "occurrenceId": item["id"], "definitionId": item["definitionId"], "actorParticipantId": "manager"}
    for item in document["data"]["occurrencesById"].values():
        if item["status"] != "available":
            events.append({"id": f"activity:scheduler:due:{item['id']}", "commandId": f"scheduler:due:{item['id']}",
                "type": "due", "timestamp": item["dueAt"], "occurrenceId": item["id"],
                "definitionId": item["definitionId"], "assigneeIds": item["assigneeIds"]})
    document["data"]["activity"] = events[-5000:]
    document["data"]["outbox"] = [chores._outbox(event) for event in document["data"]["activity"]]
    return document, events


class ChoreAuthorityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        _Store.values.clear()
        _TRACKED_INTERVALS.clear()
        self.hass = _Hass()
        self.authority = chores.ChoreAuthority(self.hass)

    async def _create_manager(self):
        return await self.authority.async_command(
            {
                "commandId": "manager-create",
                "baseRevision": 0,
                "action": {
                    "type": "participant_create",
                    "participant": _participant(),
                },
            },
            "ha-user-1",
        )

    async def test_unchanged_materialization_does_not_write_or_advance_revision(self):
        await self._create_manager()
        before = copy.deepcopy(self.authority._public_document())
        disk_before = copy.deepcopy(_Store.values)
        with patch.object(_Store, "async_save", side_effect=AssertionError("No-op must not write")):
            for index in range(5):
                result = await self.authority.async_command({"commandId": f"redundant:{index}",
                    "baseRevision": self.authority.revision, "action": {"type": "materialize_occurrences",
                    "rangeStart": "2026-08-10T00:00:00.000Z", "rangeEnd": "2026-08-11T00:00:00.000Z"}}, "ha-user-1")
                self.assertEqual(result, before)
        self.assertEqual(_Store.values, disk_before)

    async def test_settled_ticks_skip_serialization_and_delivery_until_a_boundary(self):
        start = datetime(2026, 10, 13, 10, tzinfo=timezone.utc)
        with patch.object(chores, "_now", return_value=start) as clock:
            await self._create_manager()
            await self.authority.async_tick()
            revision = self.authority.revision
            with patch.object(chores.json, "dumps", side_effect=AssertionError("Idle tick must not serialize")):
                for minute in range(30):
                    clock.return_value = start + timedelta(minutes=minute)
                    await self.authority.async_tick()
            self.assertEqual(self.authority.revision, revision)
            with patch.object(chores, "_materialize", wraps=chores._materialize) as materialize:
                clock.return_value = start + timedelta(days=1)
                await self.authority.async_tick()
                self.assertEqual(materialize.call_count, 1)
                clock.return_value = start - timedelta(minutes=1)
                await self.authority.async_tick()
                self.assertEqual(materialize.call_count, 2)

    def test_scheduler_deadlines_include_reminders_pause_and_delivery(self):
        data = chores._empty_data()
        now = datetime(2026, 8, 10, 19, tzinfo=timezone.utc)
        data["participantsById"] = {"manager": _participant()}
        data["definitionsById"] = {"d": {"reminderPolicy": {"enabled": True,
            "beforeDueMinutes": [30], "overdueEveryMinutes": 15, "maxOverdueReminders": 2}}}
        data["occurrencesById"] = {"o": {"id": "o", "definitionId": "d", "status": "available",
            "scheduledAt": "2026-08-10T16:00:00Z", "dueAt": "2026-08-10T19:00:00Z", "updatedAt": "2026-08-10T16:00:00Z"}}
        for minutes, expected in [(1, 15), (15, 30), (30, 300)]:
            self.assertEqual(chores._scheduler_deadline(data, now + timedelta(minutes=minutes)),
                now + timedelta(minutes=expected))
        data["participantsById"]["manager"].update(pausedAt="2026-08-10T18:00:00Z", resumeAt="2026-08-10T19:02:00Z")
        self.assertEqual(chores._scheduler_deadline(data, now + timedelta(seconds=1)), now + timedelta(minutes=2))
        data["outbox"] = [{"status": "failed", "destination": "provider", "occurrenceId": "o",
            "nextAttemptAt": "2026-08-10T19:01:00Z"}]
        self.assertEqual(chores._scheduler_deadline(data, now + timedelta(seconds=1)), now + timedelta(minutes=1))
        self.assertEqual(chores._scheduler_deadline(data, now + timedelta(minutes=1)), now + timedelta(minutes=1))

    async def test_background_window_rebuilds_once_per_day_or_input_edit(self):
        start = datetime(2026, 10, 13, 10, tzinfo=timezone.utc)
        with patch.object(chores, "_now", return_value=start) as clock:
            await self._create_manager()
            with patch.object(chores, "_materialize", wraps=chores._materialize) as materialize:
                await self.authority.async_tick()
                self.assertEqual(materialize.call_count, 1)
                await self.authority.async_tick()
                self.assertEqual(materialize.call_count, 1)
                clock.return_value = start + timedelta(days=1)
                await self.authority.async_tick()
                self.assertEqual(materialize.call_count, 2)
                await self.authority.async_command({"commandId": "edit-manager",
                    "baseRevision": self.authority.revision, "action": {"type": "participant_update",
                    "actorParticipantId": "manager", "participant": {**_participant(), "displayName": "Updated"}}}, "ha-user-1")
                await self.authority.async_tick()
                self.assertEqual(materialize.call_count, 3)

    def _seed_continuous_writes(self):
        original_now = chores._now
        chores._now = lambda: datetime(2026, 10, 13, 10, tzinfo=timezone.utc)
        self.addCleanup(setattr, chores, "_now", original_now)
        document, events = _continuous_materialization_fixture()
        _Store.values[chores.WORKSPACE_KEY] = copy.deepcopy(document)
        _Store.values[chores.HISTORY_KEY] = {"contractVersion": 1, "events": copy.deepcopy(events)}
        return document, events

    async def test_deflates_affected_storage_and_preserves_history_completion_and_recovery(self):
        document, events = self._seed_continuous_writes()
        before_bytes = len(json.dumps(_Store.values, separators=(",", ":")).encode())
        await self.authority.async_initialize()
        expected = {key: item for key, item in document["data"]["occurrencesById"].items() if item["status"] != "available"}
        self.assertEqual(self.authority.data["occurrencesById"], expected)
        self.assertEqual(self.authority._history, [event for event in events if event["type"] != "workspace_materialized"])
        after_bytes = len(json.dumps(_Store.values, separators=(",", ":")).encode())
        self.assertLess(after_bytes, before_bytes * 0.3)
        backup = await self.authority._decode_storage(_Store.values[chores.LAST_GOOD_KEY])
        self.assertEqual(backup["data"], {**document["data"],
            "activity": [event for event in document["data"]["activity"] if event["type"] != "workspace_materialized"],
            "outbox": [item for item in document["data"]["outbox"] if item["eventType"] != "workspace_materialized"]})
        history = await self.authority.async_handle_ws({"type": "navet/chores/history/get"}, "ha-user-1")
        self.assertEqual(history["events"], [event for event in events if event["type"] != "workspace_materialized"])

        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertEqual(restarted.data, self.authority.data)
        self.assertEqual(restarted.revision, self.authority.revision)
        missed = next(item for item in expected.values() if item["status"] == "missed")
        result = await restarted.async_command({"commandId": "complete-upgraded", "baseRevision": restarted.revision,
            "action": {"type": "occurrence_action", "occurrenceId": missed["id"],
                "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        self.assertEqual(result["data"]["occurrencesById"][missed["id"]]["status"], "done")

    async def test_cleans_previous_hotfix_preserving_scores_rewards_and_automation_cursors(self):
        # Rewrite: bookkeeping is intentionally removed; household accounting remains exact.
        document, events = self._seed_continuous_writes()
        document["storageMaintenanceVersion"] = 1
        experience = document["data"]["experience"]
        experience["earnedPointsByParticipant"] = {"manager": 250}
        experience["pointTransactions"] = [{"id": "earned", "participantId": "manager",
            "pointsDelta": 250, "kind": "adjustment", "timestamp": document["updatedAt"]}]
        experience["rewardRequestsById"]["movie"] = {"id": "movie", "rewardId": "cinema",
            "rewardTitle": "Cinema", "cost": 40, "participantId": "manager", "status": "requested",
            "requestedAt": document["updatedAt"], "updatedAt": document["updatedAt"]}
        duplicate = events[100]
        pending = chores._outbox(duplicate)
        document["data"]["outbox"] = document["data"]["outbox"][-4998:] + [pending, {**pending, "status": "delivered"}]
        _Store.values[chores.WORKSPACE_KEY] = copy.deepcopy(document)
        _Store.values[chores.HISTORY_KEY] = {"contractVersion": 1, "events": events + [duplicate]}
        await self.authority.async_initialize()
        self.assertEqual(self.authority.data["experience"], experience)
        self.assertEqual([event["id"] for event in self.authority._history].count(duplicate["id"]), 1)
        self.assertFalse(any(event["type"] in ("workspace_materialized", "outbox_delivery_updated")
            for event in self.authority._history))
        self.assertEqual([item for item in self.authority.data["outbox"] if item["id"] == pending["id"]],
            [{**pending, "status": "delivered"}])
        feed = await self.authority.async_handle_ws({"type": "navet/chores/events/get", "after": 50, "limit": 1}, "ha-user-1")
        self.assertEqual(feed["cursor"], "101")
        self.assertEqual(feed["events"], [duplicate])
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertEqual(restarted.data["experience"], experience)
        backup = await restarted._decode_storage(_Store.values[chores.LAST_GOOD_KEY])
        self.assertEqual(backup["data"]["experience"], experience)

    async def test_malformed_history_is_rebuilt_before_upgrade_maintenance(self):
        timestamp = chores._iso(chores._now())
        event = chores._activity("retained-activity", timestamp, "workspace_materialized")
        malformed = [
            None,
            {"events": ["damaged"]},
            {"contractVersion": 1, "events": "damaged"},
            {"contractVersion": 2, "events": [event]},
            {"contractVersion": 1, "events": [{**event, "timestamp": "invalid"}]},
            {"contractVersion": 1, "events": [{**event, "id": None}]},
            chores._pack_storage({"contractVersion": 1, "events": ["damaged"] * 5000}),
        ]
        for history in malformed:
            with self.subTest(history=history if not isinstance(history, dict) else history.get("storageEncoding", "legacy")):
                _Store.values.clear()
                data = chores._empty_data()
                data["activity"] = [event]
                _Store.values[chores.WORKSPACE_KEY] = {"contractVersion": 1, "revision": 7,
                    "updatedAt": timestamp, "data": data}
                _Store.values[chores.HISTORY_KEY] = history
                authority = chores.ChoreAuthority(self.hass)
                await authority.async_initialize()
                self.assertEqual(authority.revision, 8)
                self.assertEqual(authority._history, [])
                stored = chores._unpack_storage(_Store.values[chores.HISTORY_KEY])
                self.assertEqual(stored["events"], [])
                self.assertEqual(stored["nextCursor"], 1)
                restarted = chores.ChoreAuthority(self.hass)
                await restarted.async_initialize()
                self.assertEqual(restarted._history, [])

    async def test_storage_computation_runs_outside_the_home_assistant_event_loop(self):
        document, events = self._seed_continuous_writes()
        loop_thread = threading.get_ident()
        original_pack, original_unpack = chores._pack_storage, chores._unpack_storage
        pack_calls = []
        def pack(value):
            self.assertNotEqual(threading.get_ident(), loop_thread)
            pack_calls.append(value)
            return original_pack(value)
        def unpack(value, *args):
            self.assertNotEqual(threading.get_ident(), loop_thread)
            return original_unpack(value, *args)
        async def executor(function, *args):
            return await asyncio.to_thread(function, *args)
        self.hass.async_add_executor_job = executor
        with patch.object(chores, "_pack_storage", side_effect=pack), patch.object(chores, "_unpack_storage", side_effect=unpack):
            await self.authority.async_initialize()
            self.assertEqual(self.authority._history, [event for event in events if event["type"] != "workspace_materialized"])
            missed = next(item for item in document["data"]["occurrencesById"].values() if item["status"] == "missed")
            pack_calls.clear()
            await self.authority.async_command({"commandId": "complete-off-loop", "baseRevision": self.authority.revision,
                "action": {"type": "occurrence_action", "occurrenceId": missed["id"],
                    "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
            self.assertTrue(any(isinstance(value, dict) and "events" in value for value in pack_calls))
            restarted = chores.ChoreAuthority(self.hass)
            await restarted.async_initialize()
            self.assertEqual(restarted._history, self.authority._history)
            self.assertEqual(restarted.data, self.authority.data)

    async def test_lone_stale_future_repeat_does_not_anchor_upgrade_recurrence(self):
        for interval_days in (14, 120):
            with self.subTest(interval_days=interval_days):
                _Store.values.clear()
                document, events = self._seed_continuous_writes()
                data = document["data"]
                data["definitionsById"]["tank"]["schedule"]["intervalDays"] = interval_days
                for key, item in list(data["occurrencesById"].items()):
                    if item["definitionId"] == "tank" and item["status"] != "done":
                        del data["occurrencesById"][key]
                scheduled = "2026-10-14T16:00:00.000Z" if interval_days == 14 else "2027-02-10T17:00:00.000Z"
                stale_id = f"tank:{scheduled}:manager"
                data["occurrencesById"][stale_id] = {"id": stale_id, "definitionId": "tank",
                    "scheduledAt": scheduled, "dueAt": chores._iso(chores._parse_iso(scheduled) + timedelta(hours=1)),
                    "status": "available", "assignmentSlot": "manager", "assigneeIds": ["manager"], "updatedAt": scheduled}
                _Store.values[chores.WORKSPACE_KEY] = copy.deepcopy(document)
                authority = chores.ChoreAuthority(self.hass)
                await authority.async_initialize()
                self.assertNotIn(stale_id, authority.data["occurrencesById"])
                for key, item in data["occurrencesById"].items():
                    if item["status"] != "available":
                        self.assertEqual(authority.data["occurrencesById"][key], item)
                self.assertEqual(authority._history[:len([event for event in events if event["type"] != "workspace_materialized"])], [event for event in events if event["type"] != "workspace_materialized"])
                restarted = chores.ChoreAuthority(self.hass)
                await restarted.async_initialize()
                self.assertEqual(restarted.data, authority.data)
                self.assertEqual(restarted._history, authority._history)

    async def test_interrupted_storage_repair_retries_without_replacing_original_data(self):
        document, events = self._seed_continuous_writes()
        original_save = _Store.async_save
        async def fail_history(store, value):
            if store.key == chores.HISTORY_KEY:
                raise OSError("Interrupted repair")
            await original_save(store, value)
        _Store.async_save = fail_history
        try:
            with self.assertRaises(chores.ChoreStorageError):
                await self.authority.async_initialize()
            self.assertEqual(_Store.values[chores.WORKSPACE_KEY], document)
            self.assertEqual(_Store.values[chores.HISTORY_KEY]["events"], events)
        finally:
            _Store.async_save = original_save
        await self.authority.async_initialize()
        self.assertEqual(self.authority._history, [event for event in events if event["type"] != "workspace_materialized"])
        self.assertEqual(self.authority.data["participantsById"], document["data"]["participantsById"])

    async def test_compressed_storage_checks_integrity_and_bounded_inflation(self):
        _document, events = self._seed_continuous_writes()
        packed = chores._pack_storage({"contractVersion": 1, "events": events})
        self.assertEqual(packed["storageEncoding"], "deflate-v1")
        self.assertEqual(chores._unpack_storage(packed)["events"], events)
        legacy_text = {"events": events, "note": "åäö\ud800"}
        self.assertEqual(chores._unpack_storage(chores._pack_storage(legacy_text)), legacy_text)
        with self.assertRaises(chores.ChoreStorageError):
            chores._unpack_storage({**packed, "checksum": "0" * 64})
        with self.assertRaises(chores.ChoreStorageError):
            chores._unpack_storage({**packed, "uncompressedBytes": 65 * 1024 * 1024})
        await self.authority.async_initialize()
        _Store.values[chores.WORKSPACE_KEY] = {**packed, "checksum": "0" * 64}
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertEqual(restarted.data["participantsById"], self.authority.data["participantsById"])
        self.assertEqual(restarted._history, [event for event in events if event["type"] != "workspace_materialized"])

    async def test_collects_only_chunks_unreferenced_by_both_committed_copies(self):
        self._seed_continuous_writes()
        with tempfile.TemporaryDirectory() as directory:
            self.hass.config = types.SimpleNamespace(path=lambda _name: directory)
            orphan_key = "f" * 64
            orphan_store_key = f"{chores.WORKSPACE_KEY}.chunk.{orphan_key}"
            pathlib.Path(directory, orphan_store_key).touch()
            _Store.values[orphan_store_key] = {"orphan": True}
            await self.authority.async_initialize()
            self.assertNotIn(orphan_store_key, _Store.values)
            for name in (chores.WORKSPACE_KEY, chores.LAST_GOOD_KEY):
                restored = await self.authority._decode_storage(_Store.values[name])
                self.assertIn("manager", restored["data"]["participantsById"])

    async def test_oversized_expanded_manifest_is_rejected_without_replacing_healthy_storage(self):
        await self._create_manager()
        before = copy.deepcopy(_Store.values)
        original = copy.deepcopy(self.authority.data)
        imported = copy.deepcopy(original)
        template = _continuous_materialization_fixture()[0]["data"]["definitionsById"]["tank"]
        imported["definitionsById"] = {
            f"definition-{index}": {**template, "id": f"definition-{index}", "enabled": False}
            for index in range(6000)
        }
        oversized = {"contractVersion": 1, "revision": self.authority.revision + 1,
            "updatedAt": chores._iso(chores._now()), "data": imported}
        self.assertGreater(chores._storage_size(oversized), chores.MAX_WORKSPACE_BYTES)
        self.assertLess(chores._storage_size(chores._pack_storage(oversized)), chores.MAX_WORKSPACE_BYTES)
        with self.assertRaises(chores.ChoreStorageError):
            await self.authority.async_restore({"commandId": "oversized-restore",
                "baseRevision": self.authority.revision, "actorParticipantId": "manager", "mode": "replace",
                "document": {"contract": "navet.chores", "version": 1,
                    "exportedAt": chores._iso(chores._now()), "workspace": imported, "events": []}}, "ha-user-1")
        self.assertEqual(_Store.values, before)
        self.assertEqual(self.authority.data, original)
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertEqual(restarted.data, original)
        self.assertEqual(restarted.revision, self.authority.revision)
        # A subsequent successful save must leave both committed copies readable.
        await restarted.async_command({"commandId": "healthy-after-rejection", "baseRevision": restarted.revision,
            "action": {"type": "experience_points_adjust", "actorParticipantId": "manager",
                "participantId": "manager", "pointsDelta": 1}}, "ha-user-1")
        for key in (chores.WORKSPACE_KEY, chores.LAST_GOOD_KEY):
            decoded = await restarted._decode_storage(_Store.values[key])
            self.assertEqual(decoded["data"]["definitionsById"], original["definitionsById"])

    def test_archived_points_preserve_progress_for_all_cycles(self):
        records = [{"id": "old-complete", "participantId": "manager", "occurrenceId": "task", "kind": "completion", "pointsDelta": 10, "timestamp": "2026-09-28T10:00:00.000Z"},
            {"id": "old-reopen", "participantId": "manager", "occurrenceId": "task", "kind": "reopen", "pointsDelta": -3, "timestamp": "2026-09-29T10:00:00.000Z"},
            {"id": "adjust", "participantId": "manager", "kind": "adjustment", "pointsDelta": 1000, "timestamp": "2026-09-29T10:00:00.000Z"}]
        data = chores._empty_data()
        data["occurrencesById"] = {"task": {"id": "task", "definitionId": "dishes", "status": "done", "completedBy": "manager", "completedAt": "2026-09-28T10:00:00.000Z", "scheduledAt": "2026-09-28T10:00:00.000Z"}}
        data["experience"]["pointTransactions"] = records
        for cycle in ("once", "weekly", "monthly"):
            for selected in ([], ["dishes"]):
                target = {"metric": "points", "cycle": cycle, "definitionIds": selected}
                at = "2026-09-30T10:00:00.000Z"
                expected = chores._progress_value(target, "manager", data, at)
                projected = copy.deepcopy(data)
                projected["experience"]["pointTransactions"] = records[1:]
                projected["experience"]["pointProgress"] = chores._archive_point_progress(None, records[:1], {"task"})
                self.assertEqual(chores._progress_value(target, "manager", projected, at), expected)
                self.assertEqual(expected, 7)

    async def test_retries_a_committed_point_change_after_journal_failure_without_double_credit(self):
        await self._create_manager()
        request = {"commandId": "journal-interruption", "baseRevision": self.authority.revision,
            "action": {"type": "experience_points_adjust", "actorParticipantId": "manager", "participantId": "manager", "pointsDelta": 10}}
        original_save = _Store.async_save
        async def fail_journal(store, value):
            if store.key == chores.JOURNAL_KEY:
                raise OSError("Interrupted journal write")
            await original_save(store, value)
        _Store.async_save = fail_journal
        try:
            with self.assertRaises(chores.ChoreStorageError):
                await self.authority.async_command(request, "ha-user-1")
        finally:
            _Store.async_save = original_save
        retried = await self.authority.async_command(request, "ha-user-1")
        self.assertEqual(retried["data"]["experience"]["earnedPointsByParticipant"]["manager"], 10)
        self.assertEqual(len(retried["data"]["experience"]["pointTransactions"]), 1)

    async def test_concurrent_additive_intents_rebase_but_future_revisions_do_not(self):
        await self._create_manager()
        revision = self.authority.revision
        async def adjust(command_id):
            return await self.authority.async_command({"commandId": command_id, "baseRevision": revision,
                "action": {"type": "experience_points_adjust", "actorParticipantId": "manager", "participantId": "manager", "pointsDelta": 10}}, "ha-user-1")
        await asyncio.gather(adjust("first-concurrent"), adjust("second-concurrent"))
        self.assertEqual(self.authority.data["experience"]["earnedPointsByParticipant"]["manager"], 20)
        self.assertEqual(len(self.authority.data["experience"]["pointTransactions"]), 2)
        for invalid_revision in (-1, self.authority.revision + 1):
            with self.assertRaises(chores.ChoreConflictError):
                await self.authority.async_command({"commandId": "future-revision", "baseRevision": invalid_revision,
                    "action": {"type": "experience_points_adjust", "actorParticipantId": "manager", "participantId": "manager", "pointsDelta": 10}}, "ha-user-1")
        self.assertEqual(self.authority.data["experience"]["earnedPointsByParticipant"]["manager"], 20)

    async def test_backup_pins_its_accounting_snapshot_during_a_concurrent_write(self):
        await self._create_manager()
        previous = copy.deepcopy(self.authority._document)
        data = copy.deepcopy(self.authority.data)
        data["experience"]["earnedPointsByParticipant"] = {"manager": 300}
        data["experience"]["pointTransactions"] = [{"id": f"ledger:{index}", "participantId": "manager", "pointsDelta": 1,
            "kind": "adjustment", "timestamp": "2026-09-30T08:00:00.000Z"} for index in range(300)]
        await self.authority._save({**previous, "revision": previous["revision"] + 1, "data": data}, previous)
        started, release = asyncio.Event(), asyncio.Event()
        original_rows = self.authority._point_rows
        async def delayed_rows(page):
            started.set()
            await release.wait()
            return await original_rows(page)
        with patch.object(self.authority, "_point_rows", side_effect=delayed_rows):
            exporting = asyncio.create_task(self.authority.async_handle_ws({"type": "navet/chores/backup/get"}, "ha-user-1"))
            await started.wait()
            writing = asyncio.create_task(self.authority.async_command({"commandId": "during-export", "baseRevision": self.authority.revision,
                "action": {"type": "experience_points_adjust", "actorParticipantId": "manager", "participantId": "manager", "pointsDelta": 1}}, "ha-user-1"))
            try:
                await asyncio.sleep(0)
                self.assertFalse(writing.done())
            finally:
                release.set()
            exported, saved = await asyncio.gather(exporting, writing)
        self.assertEqual(exported["workspace"]["experience"]["pointTransactions"], data["experience"]["pointTransactions"])
        self.assertEqual(exported["workspace"]["experience"]["earnedPointsByParticipant"]["manager"], 300)
        self.assertEqual(saved["data"]["experience"]["earnedPointsByParticipant"]["manager"], 301)

    async def test_reset_clears_archived_points_exports_and_unreferenced_chunks(self):
        for recovery_reset in (False, True):
            with self.subTest(recovery_reset=recovery_reset), tempfile.TemporaryDirectory() as directory:
                _Store.values.clear()
                self.hass.config = types.SimpleNamespace(path=lambda _name: directory)
                self.authority = chores.ChoreAuthority(self.hass)
                await self._create_manager()
                previous = copy.deepcopy(self.authority._document)
                data = copy.deepcopy(self.authority.data)
                data["experience"]["earnedPointsByParticipant"] = {"manager": 300}
                data["experience"]["pointTransactions"] = [{"id": f"reset-ledger:{index}", "participantId": "manager",
                    "pointsDelta": 1, "kind": "adjustment", "timestamp": "2026-09-30T08:00:00.000Z"} for index in range(300)]
                # Include chunked working state so reset collects both kinds of ledger chunks.
                data["experience"]["progressAwards"] = [{"id": f"reset-award:{index}:" + "x" * 150,
                    "targetId": "target", "participantId": "manager", "cycleKey": f"cycle:{index}",
                    "awardedAt": "2026-09-30T08:00:00.000Z"} for index in range(8000)]
                await self.authority._save({**previous, "revision": previous["revision"] + 1, "data": data}, previous)
                self.assertGreater(self.authority._document["pointHistory"]["count"], 0)
                self.assertIn("durableCollections", chores._unpack_storage(_Store.values[chores.WORKSPACE_KEY]))
                chunk_keys = [key for key in _Store.values if ".chunk." in key]
                self.assertTrue(chunk_keys)
                for key in chunk_keys:
                    pathlib.Path(directory, key).touch()
                if recovery_reset:
                    result = await self.authority.async_recover({"action": "reset", "confirmation": "RESET CHORES"}, "ha-user-1")
                else:
                    result = await self.authority.async_reset({"commandId": "reset-archived-ledger",
                        "baseRevision": self.authority.revision, "actorParticipantId": "manager",
                        "confirmation": "DELETE ALL CHORES"}, "ha-user-1")
                self.assertEqual(result["data"], chores._empty_data())
                self.assertNotIn("pointHistory", chores._unpack_storage(_Store.values[chores.WORKSPACE_KEY]))
                self.assertNotIn(chores.LAST_GOOD_KEY, _Store.values)
                self.assertFalse(any(".chunk." in key for key in _Store.values))
                restarted = chores.ChoreAuthority(self.hass)
                await restarted.async_initialize()
                self.assertEqual(restarted.data, chores._empty_data())
                for authority in (self.authority, restarted):
                    page = await authority.async_handle_ws({"type": "navet/chores/points/get"}, "ha-user-1")
                    self.assertEqual(page["points"], [])
                    self.assertFalse(page["hasMore"])
                    backup = await authority.async_handle_ws({"type": "navet/chores/backup/get"}, "ha-user-1")
                    self.assertEqual(backup["workspace"]["experience"]["pointTransactions"], [])

    async def test_large_ledger_survives_restart_and_chunk_failure(self):
        await self._create_manager()
        data = copy.deepcopy(self.authority.data)
        data["experience"]["earnedPointsByParticipant"] = {"manager": 12000}
        data["experience"]["pointTransactions"] = [{"id": f"transaction:{index}:" + "x" * 150,
            "participantId": "manager", "pointsDelta": 1, "kind": "adjustment", "timestamp": "2026-09-30T08:00:00.000Z"} for index in range(12000)]
        data["experience"]["progressAwards"] = [{"id": "earned", "targetId": "target", "participantId": "manager", "cycleKey": "lifetime", "awardedAt": "2026-09-30T08:00:00.000Z"}]
        previous = copy.deepcopy(self.authority._document)
        document = {**previous, "revision": previous["revision"] + 1, "data": data}
        await self.authority._save(document, previous)
        self.assertLess(len(json.dumps(_Store.values[chores.WORKSPACE_KEY]).encode()), chores.MAX_WORKSPACE_BYTES)
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertLessEqual(len(restarted.data["experience"]["pointTransactions"]), 128)
        exported = await restarted.async_handle_ws({"type": "navet/chores/backup/get"}, "ha-user-1")
        self.assertEqual(exported["workspace"]["experience"], data["experience"])
        with self.assertRaises(chores.ChoreAuthorityError):
            await restarted.async_restore({"commandId": "partial-import", "baseRevision": restarted.revision, "actorParticipantId": "manager", "mode": "replace",
                "document": {"contract": "navet.chores", "version": 1, "exportedAt": "2026-09-30T08:00:00.000Z", "workspace": copy.deepcopy(restarted.data), "events": []}}, "ha-user-1")
        result = await restarted.async_command({"commandId": "large-adjust:" + "x" * 170, "baseRevision": restarted.revision,
            "action": {"type": "experience_points_adjust", "actorParticipantId": "manager", "participantId": "manager", "pointsDelta": 10}}, "ha-user-1")
        self.assertEqual(result["data"]["experience"]["earnedPointsByParticipant"]["manager"], 12010)
        self.assertLessEqual(len(result["data"]["experience"]["pointTransactions"]), 128)
        page = await restarted.async_handle_ws({"type": "navet/chores/points/get", "after": 11990, "limit": 20}, "ha-user-1")
        self.assertEqual(len(page["points"]), 11)
        self.assertEqual(page["points"][-1]["pointsDelta"], 10)
        self.assertFalse(page["hasMore"])
        original_save = _Store.async_save
        async def fail_chunk(store, value):
            if ".chunk." in store.key:
                raise OSError("Interrupted chunk write")
            await original_save(store, value)
        _Store.async_save = fail_chunk
        try:
            with self.assertRaises(chores.ChoreStorageError):
                await restarted.async_command({"commandId": "failed-adjust:" + "x" * 170, "baseRevision": restarted.revision,
                    "action": {"type": "experience_points_adjust", "actorParticipantId": "manager", "participantId": "manager", "pointsDelta": 10}}, "ha-user-1")
        finally:
            _Store.async_save = original_save
        recovered = chores.ChoreAuthority(self.hass)
        await recovered.async_initialize()
        self.assertEqual(recovered.data["experience"], result["data"]["experience"])
        stored = chores._unpack_storage(_Store.values[chores.WORKSPACE_KEY])
        broken_key = stored["pointHistory"]["pages"][-1]["key"]
        _Store.values[f"{chores.WORKSPACE_KEY}.chunk.{broken_key}"] = {"invalid": True}
        backup = chores.ChoreAuthority(self.hass)
        await backup.async_initialize()
        exported = await backup.async_handle_ws({"type": "navet/chores/backup/get"}, "ha-user-1")
        self.assertEqual(exported["workspace"]["experience"], data["experience"])

    async def test_shared_occurrence_transition_conformance_vectors(self):
        path = pathlib.Path(__file__).parents[3] / "packages/core/src/chore-conformance-vectors.json"
        vectors = json.loads(path.read_text(encoding="utf-8"))
        fixture = vectors["occurrenceFixture"]
        for vector in vectors["occurrenceTransitions"]:
            with self.subTest(vector=vector["name"]):
                data = chores._empty_data()
                data["participantsById"] = {p["id"]: p for p in fixture["participants"]}
                definition = {**fixture["definition"], **vector["definition"]}
                occurrence = {**fixture["occurrence"], **vector["occurrence"]}
                data["definitionsById"] = {definition["id"]: definition}
                data["occurrencesById"] = {occurrence["id"]: occurrence}
                def apply():
                    return chores._apply_occurrence(data, occurrence["id"], vector["command"], fixture["timestamp"], "conformance")
                if vector["error"]:
                    with self.assertRaises(chores.ChoreAuthorityError) as caught:
                        apply()
                    self.assertEqual(str(caught.exception), vector["error"])
                else:
                    updated, activity = apply()
                    self.assertEqual(activity["type"], vector["event"])
                    actual = updated["occurrencesById"][occurrence["id"]]
                    for key, expected in vector["expected"].items():
                        self.assertEqual(actual.get(key), expected)

    async def test_shared_materialization_conformance_vectors(self):
        vector_path = (
            pathlib.Path(__file__).parents[3]
            / "packages"
            / "core"
            / "src"
            / "chore-conformance-vectors.json"
        )
        vectors = json.loads(vector_path.read_text(encoding="utf-8"))
        for vector in vectors["materialization"]:
            with self.subTest(vector=vector["name"]):
                data = chores._empty_data()
                data["participantsById"] = {
                    participant["id"]: participant
                    for participant in vector["participants"]
                }
                data["definitionsById"] = {
                    vector["definition"]["id"]: vector["definition"]
                }
                materialized, _activities = chores._materialize(
                    data,
                    vector["rangeStart"],
                    vector["rangeEnd"],
                    vector["rangeStart"],
                    "conformance",
                )
                actual = [
                    {
                        "scheduledAt": occurrence["scheduledAt"],
                        "assigneeIds": occurrence["assigneeIds"],
                    }
                    for occurrence in sorted(
                        materialized["occurrencesById"].values(),
                        key=lambda item: item["scheduledAt"],
                    )
                ]
                self.assertEqual(actual, vector["expected"])

    async def test_quiet_hours_defer_home_assistant_delivery_across_midnight(self):
        participant = _participant(
            destination={"type": "home_assistant", "target": "mobile_app_phone"}
        )
        participant["reminderPreferences"]["quietHours"] = {
            "start": "21:00",
            "end": "07:00",
            "timeZone": "Europe/Stockholm",
        }
        self.assertEqual(
            chores._next_delivery_at(
                datetime(2026, 8, 28, 20, 30, tzinfo=timezone.utc),
                participant,
                "UTC",
            ),
            "2026-08-29T05:00:00.000Z",
        )

    async def test_schema_v1_migration_and_malformed_workspace_rejection(self):
        migrated = chores._normalize_data(
            {
                "schemaVersion": 1,
                "participantsById": {},
                "definitionsById": {},
                "occurrencesById": {},
                "activity": [],
            }
        )
        self.assertEqual(migrated["schemaVersion"], 2)
        self.assertEqual(migrated["outbox"], [])
        malformed = chores._empty_data()
        malformed["activity"] = [{"commandId": "bad", "type": "done"}]
        with self.assertRaises(chores.ChoreStorageError):
            chores._normalize_data(malformed)

    async def test_standby_and_fair_rotation_assignment(self):
        data = chores._empty_data()
        data["participantsById"] = {
            "alice": {"capabilities": ["complete"], "pausedAt": "2026-08-01T00:00:00.000Z"},
            "bob": {"capabilities": ["complete"]},
        }
        self.assertEqual(
            chores._assignment_slots({"id": "dishes", "assignment": {
                "mode": "person", "participantIds": ["alice"], "standbyParticipantIds": ["bob"]
            }}, data, 0),
            [("standby", ["bob"])],
        )
        data["participantsById"]["alice"].pop("pausedAt")
        data["occurrencesById"] = {"one": {
            "definitionId": "dishes", "status": "done", "completedBy": "alice"
        }}
        self.assertEqual(
            chores._assignment_slots({"id": "dishes", "assignment": {
                "mode": "rotation", "participantIds": ["alice", "bob"], "rotationStrategy": "fair"
            }}, data, 0),
            [("bob", ["bob"])],
        )

    async def test_hourly_materialization_keeps_elapsed_interval_through_dst(self):
        data = chores._empty_data()
        data["participantsById"] = {"manager": _participant()}
        data["definitionsById"] = {"dishes": {
            "id": "dishes", "title": "Dishes", "enabled": True,
            "assignment": {"mode": "person", "participantIds": ["manager"]},
            "schedule": {"frequency": "hourly", "startDate": "2026-10-25",
                "time": "01:00", "timeZone": "Europe/Stockholm", "intervalHours": 2},
            "dueWindowMinutes": 60, "approval": {"required": False, "approverIds": []},
        }}
        materialized, _events = chores._materialize(data,
            "2026-10-24T22:00:00.000Z", "2026-10-25T06:00:00.000Z",
            "2026-10-24T22:00:00.000Z", "hourly-test")
        self.assertEqual(sorted(item["scheduledAt"] for item in materialized["occurrencesById"].values()), [
            "2026-10-24T23:00:00.000Z", "2026-10-25T01:00:00.000Z",
            "2026-10-25T03:00:00.000Z", "2026-10-25T05:00:00.000Z",
        ])

    async def test_vacation_replacement_supersedes_at_its_actual_date(self):
        data = chores._empty_data()
        data["participantsById"] = {"manager": _participant(),
            "child": {**_participant("child"), "pausedAt": "2026-08-05T00:00:00.000Z",
                "resumeAt": "2026-08-12T00:00:00.000Z"}}
        definition = {"id": "dishes", "assignment": {"mode": "rotation"},
            "schedule": {"frequency": "weekly", "timeZone": "Europe/Stockholm"}}
        data["definitionsById"] = {"dishes": definition}
        previous = {"id": "previous", "definitionId": "dishes",
            "scheduledAt": "2026-08-03T16:00:00.000Z", "dueAt": "2026-08-03T19:00:00.000Z",
            "assigneeIds": ["manager"], "assignmentSlot": "manager", "status": "available"}
        original = {**previous, "id": "vacation-next", "assigneeIds": ["child"],
            "assignmentSlot": "child", "scheduledAt": "2026-08-10T16:00:00.000Z",
            "dueAt": "2026-08-10T19:00:00.000Z"}
        data["occurrencesById"] = {previous["id"]: previous, original["id"]: original}
        moved, _events = chores._vacation_reschedule(data, {
            "actorParticipantId": "manager", "participantId": "child",
            "occurrenceIds": [original["id"]], "startDate": "2026-08-13",
        }, "2026-08-06T08:00:00.000Z", "move-next")
        replacement = next(item for item in moved["occurrencesById"].values()
            if item.get("carriedForwardFrom") == original["id"])
        for now in [original["scheduledAt"], "2026-08-13T15:59:59.000Z"]:
            self.assertIsNone(chores._superseding_occurrence(previous, definition,
                moved["occurrencesById"], now))
        self.assertEqual(chores._superseding_occurrence(previous, definition,
            moved["occurrencesById"], replacement["scheduledAt"]), replacement)
        del moved["occurrencesById"][original["id"]]
        self.assertEqual(chores._superseding_occurrence(previous, definition,
            moved["occurrencesById"], replacement["scheduledAt"]), replacement)

    async def test_automatic_carried_work_is_not_a_calendar_boundary(self):
        definition = {"schedule": {"frequency": "weekly"}, "assignment": {"mode": "rotation"}}
        previous = {"id": "previous", "definitionId": "dishes", "assignmentSlot": "manager",
            "scheduledAt": "2026-08-10T16:00:00.000Z", "status": "available"}
        carried = {**previous, "id": "carried", "assignmentSlot": "carry:older-missed",
            "carriedForwardFrom": "older-missed", "scheduledAt": "2026-08-11T16:00:00.000Z",
            "status": "skipped", "carriedForwardTo": "moved-carry"}
        moved = {**carried, "id": "moved-carry", "status": "available",
            "carriedForwardFrom": carried["id"], "scheduledAt": "2026-08-13T16:00:00.000Z"}
        moved.pop("carriedForwardTo")
        occurrences = {item["id"]: item for item in [previous, carried, moved]}
        self.assertIsNone(chores._superseding_occurrence(previous, definition,
            occurrences, moved["scheduledAt"]))
        calendar_skip = {**moved, "id": "calendar-skip", "assignmentSlot": "manager", "status": "skipped"}
        calendar_skip.pop("carriedForwardFrom")
        occurrences[calendar_skip["id"]] = calendar_skip
        self.assertEqual(chores._superseding_occurrence(previous, definition,
            occurrences, calendar_skip["scheduledAt"]), calendar_skip)

    async def test_vacation_reschedule_keeps_claimed_work(self):
        data = chores._empty_data()
        data["participantsById"] = {"manager": _participant(),
            "child": {**_participant("child"), "pausedAt": "2026-08-01T00:00:00.000Z",
                "resumeAt": "2026-08-12T00:00:00.000Z"}}
        data["definitionsById"] = {"dishes": {"id": "dishes", "schedule": {
            "timeZone": "Europe/Stockholm"}}}
        data["occurrencesById"] = {
            "available": {"id": "available", "definitionId": "dishes",
                "scheduledAt": "2026-08-10T16:00:00.000Z",
                "dueAt": "2026-08-10T18:00:00.000Z", "assigneeIds": ["child"],
                "assignmentSlot": "child", "status": "available"},
            "claimed": {"id": "claimed", "definitionId": "dishes",
                "scheduledAt": "2026-08-11T16:00:00.000Z",
                "dueAt": "2026-08-11T18:00:00.000Z", "assigneeIds": ["child"],
                "assignmentSlot": "child", "status": "claimed", "claimedBy": "child"},
        }
        moved, activities = chores._vacation_reschedule(data, {
            "actorParticipantId": "manager", "participantId": "child",
            "occurrenceIds": ["available"], "startDate": "2026-08-13",
        }, "2026-08-12T08:00:00.000Z", "vacation-test")
        self.assertEqual(moved["occurrencesById"]["available"]["status"], "skipped")
        self.assertEqual(moved["occurrencesById"]["claimed"]["status"], "claimed")
        self.assertEqual([item["status"] for item in moved["occurrencesById"].values()].count("available"), 1)
        self.assertEqual(activities[-1]["type"], "vacation_rescheduled")

    async def test_progress_award_is_once_per_person_and_week(self):
        data = chores._empty_data()
        data["participantsById"] = {"maya": _participant("maya")}
        data["experience"]["gamificationMode"] = "family"
        data["experience"]["badgesById"] = {"weekly": {
            "id": "weekly", "title": "Dishes", "metric": "selected_chore",
            "target": 1, "definitionIds": ["dishes"], "cycle": "weekly", "awardPoints": 5,
        }}
        data["occurrencesById"] = {"monday": {
            "id": "monday", "definitionId": "dishes", "status": "done",
            "scheduledAt": "2026-09-28T10:00:00.000Z", "completedAt": "2026-09-28T10:00:00.000Z",
            "completedBy": "maya", "assigneeIds": ["maya"],
        }}
        first = chores._award_progress(data, "2026-09-28T11:00:00.000Z")
        self.assertEqual(len(first["experience"]["progressAwards"]), 1)
        self.assertEqual(first["experience"]["earnedPointsByParticipant"]["maya"], 5)
        again = chores._award_progress(first, "2026-09-28T12:00:00.000Z")
        self.assertEqual(len(again["experience"]["pointTransactions"]), 1)
        self.assertEqual(again["experience"]["earnedPointsByParticipant"]["maya"], 5)

    async def test_rejects_invalid_pause_dates_before_saving(self):
        await self._create_manager()
        before = copy.deepcopy(_Store.values)
        for fields in ({"resumeAt": "2026-09-01T00:00:00.000Z"},
            {"pausedAt": "2026-09-02T00:00:00.000Z", "resumeAt": "2026-09-01T00:00:00.000Z"}):
            with self.subTest(fields=fields), self.assertRaises(chores.ChoreAuthorityError):
                await self.authority.async_command({"commandId": "bad-pause", "baseRevision": self.authority.revision,
                    "action": {"type": "participant_update", "actorParticipantId": "manager",
                        "participant": {**_participant(), **fields}}})
            self.assertEqual(_Store.values, before)

    async def test_malformed_progress_targets_do_not_break_completion(self):
        data = chores._empty_data()
        data["participantsById"] = {"manager": _participant()}
        for target in ({"id": "bad"}, {"id": "bad", "title": "Bad", "metric": "count", "target": 1, "awardPoints": "50"}):
            data["experience"]["badgesById"] = {"bad": target}
            with self.assertRaises(chores.ChoreAuthorityError):
                chores._validate_progress_targets(data["experience"])
            self.assertEqual(chores._award_progress(data, "2026-09-28T11:00:00.000Z")["experience"]["progressAwards"], [])

    async def test_stale_alerts_cannot_starve_valid_delivery(self):
        await self._create_manager()
        self.authority.data["occurrencesById"]["fresh"] = {"id": "fresh", "definitionId": "dishes", "updatedAt": "2026-09-28T11:00:00.000Z"}
        self.authority.data["outbox"] = [{"id": f"stale-{index}", "status": "pending", "destination": "provider",
            "occurrenceId": "deleted", "occurrenceUpdatedAt": "2026-09-28T10:00:00.000Z", "nextAttemptAt": "2026-01-01T00:00:00.000Z"} for index in range(10)] + [
            {"id": "fresh", "status": "pending", "destination": "provider", "occurrenceId": "fresh",
                "occurrenceUpdatedAt": "2026-09-28T11:00:00.000Z", "nextAttemptAt": "2026-01-01T00:00:00.000Z"}]
        self.authority.async_command = AsyncMock()
        await self.authority._deliver_pending()
        self.assertEqual([item["id"] for item in self.authority.data["outbox"]], ["fresh"])
        self.authority.async_command.assert_awaited_once()
        self.assertEqual(self.authority.async_command.call_args.args[0]["action"]["outboxId"], "fresh")

    async def test_participant_pause_keeps_work_for_vacation_review(self):
        await self._create_manager()
        data = chores._empty_data()
        data["participantsById"] = {"manager": _participant(), "bob": _participant("bob")}
        data["definitionsById"] = {"dishes": {"id": "dishes", "assignment": {"mode": "person", "participantIds": ["bob"]},
            "schedule": {"frequency": "daily", "startDate": "2026-08-01", "time": "16:00", "timeZone": "UTC"}, "dueWindowMinutes": 60}}
        data["occurrencesById"] = {"future": {"id": "future", "definitionId": "dishes", "status": "available",
            "scheduledAt": "2026-08-10T16:00:00.000Z", "dueAt": "2026-08-10T17:00:00.000Z", "assigneeIds": ["bob"], "assignmentSlot": "bob"}}
        paused, _event = self.authority._apply_workspace_action(data, {"type": "participant_update", "actorParticipantId": "manager",
            "participant": {**_participant("bob"), "pausedAt": "2026-08-02T00:00:00.000Z", "resumeAt": "2026-08-12T00:00:00.000Z"}},
            "2026-08-01T08:00:00.000Z", "pause")
        moved, _events = chores._vacation_reschedule(paused, {"actorParticipantId": "manager", "participantId": "bob",
            "occurrenceIds": ["future"], "startDate": "2026-08-13"}, "2026-08-12T08:00:00.000Z", "review")
        self.assertTrue(any(item.get("carriedForwardFrom") == "future" for item in moved["occurrencesById"].values()))

    async def test_large_reward_activity_can_reload(self):
        await self._create_manager()
        data = copy.deepcopy(self.authority.data)
        data["experience"]["gamificationMode"] = "family"
        data["experience"]["earnedPointsByParticipant"] = {"manager": 20000}
        data["experience"]["rewardRequestsById"] = {"large": {"id": "large", "rewardId": "goal", "rewardTitle": "Large reward", "participantId": "manager", "cost": 15000, "status": "requested"}}
        updated, activity = self.authority._apply_workspace_action(data, {"type": "reward_decision", "requestId": "large", "actorParticipantId": "manager", "decision": "approve"}, "2026-09-28T10:00:00.000Z", "large-reward")
        updated["activity"] = [activity]
        self.assertEqual(chores._normalize_data(updated)["experience"]["pointTransactions"][-1]["pointsDelta"], -15000)

    async def test_reward_request_after_pause_return(self):
        await self._create_manager()
        data = copy.deepcopy(self.authority.data)
        data["participantsById"]["manager"].update({"pausedAt": "2026-09-01T00:00:00.000Z", "resumeAt": "2026-09-10T00:00:00.000Z"})
        data["experience"]["gamificationMode"] = "family"
        data["experience"]["earnedPointsByParticipant"] = {"manager": 100}
        data["experience"]["rewardGoalsById"] = {"goal": {"id": "goal", "title": "Goal", "targetPoints": 40, "enabled": True}}
        updated, _event = self.authority._apply_workspace_action(data, {"type": "reward_request", "requestId": "returned", "rewardId": "goal", "participantId": "manager"}, "2026-09-28T10:00:00.000Z", "returned-request")
        self.assertEqual(updated["experience"]["rewardRequestsById"]["returned"]["status"], "requested")

    async def test_hourly_ordered_rotation_keeps_anchor_across_windows(self):
        data = chores._empty_data()
        data["participantsById"] = {"alice": _participant("alice"), "bob": _participant("bob")}
        data["definitionsById"] = {"hourly": {"id": "hourly", "enabled": True, "dueWindowMinutes": 60,
            "assignment": {"mode": "rotation", "participantIds": ["alice", "bob"]},
            "schedule": {"frequency": "hourly", "startDate": "2026-09-28", "time": "00:00", "timeZone": "UTC", "intervalHours": 1}}}
        first, _events = chores._materialize(copy.deepcopy(data), "2026-09-28T00:00:00.000Z", "2026-09-28T03:00:00.000Z", "2026-09-28T00:00:00.000Z", "first")
        later, _events = chores._materialize(copy.deepcopy(data), "2026-09-28T01:00:00.000Z", "2026-09-28T03:00:00.000Z", "2026-09-28T01:00:00.000Z", "later")
        self.assertEqual(set(later["occurrencesById"]), {key for key, item in first["occurrencesById"].items() if item["scheduledAt"] >= "2026-09-28T01:00:00.000Z"})

    async def test_restore_rejects_invalid_rotation_fields_before_persisting(self):
        await self._create_manager()
        before = copy.deepcopy(_Store.values)
        for field, values in {
            "rotationDayOfWeek": [None, -1, 7, 1.5, "1", True],
            "rotationCadence": [None, "yearly", [], {}],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    imported = chores._empty_data()
                    imported["definitionsById"]["dishes"] = {
                        "assignment": {"mode": "rotation", "rotationCadence": "weekly", field: value}
                    }
                    with self.assertRaises(chores.ChoreStorageError):
                        await self.authority.async_restore({
                            "commandId": "invalid-restore",
                            "baseRevision": self.authority.revision,
                            "actorParticipantId": "manager",
                            "mode": "replace",
                            "document": {
                                "contract": "navet.chores", "version": 1,
                                "exportedAt": "2026-09-28T08:00:00.000Z",
                                "workspace": imported, "events": [],
                            },
                        }, "ha-user-1")
                    self.assertEqual(_Store.values, before)
        for assignment in [{}, {"rotationCadence": "weekly"}, {"rotationDayOfWeek": 0}, {"rotationDayOfWeek": 6}]:
            data = chores._empty_data()
            data["definitionsById"]["dishes"] = {"assignment": assignment}
            self.assertEqual(chores._normalize_data(data), data)

    async def test_rotation_edits_replace_unstarted_work_and_preserve_history(self):
        timestamp = "2026-09-28T08:00:00.000Z"
        edit_timestamp = "2026-10-05T08:00:00.000Z"
        for change in [{"rotationCadence": "weekly"}, {"rotationDayOfWeek": 0}]:
            with self.subTest(change=change):
                data = chores._empty_data()
                data["participantsById"] = {key: _participant(key) for key in ["manager", "child"]}
                definition = {
                    "id": "dishes", "enabled": True,
                    "assignment": {"mode": "rotation", "participantIds": ["manager", "child"]},
                    "schedule": {"frequency": "daily", "startDate": "2026-09-28", "time": "18:00", "timeZone": "UTC"},
                    "dueWindowMinutes": 60,
                }
                if "rotationDayOfWeek" in change:
                    definition["assignment"]["rotationCadence"] = "weekly"
                data["definitionsById"]["dishes"] = definition
                data, _ = chores._materialize(data, "2026-09-28T00:00:00.000Z", "2026-10-07T00:00:00.000Z", timestamp, "first")
                values = list(data["occurrencesById"].values())
                preserved = {}
                for occurrence, status in zip(values, ["done", "claimed", "awaiting_approval", "skipped", "missed"]):
                    occurrence["status"] = status
                    if status == "missed":
                        # A complete historical fixture retains its fixed-work boundary.
                        occurrence["supersededAt"] = values[5]["scheduledAt"]
                    preserved[occurrence["id"]] = copy.deepcopy(occurrence)
                values[5]["carriedForwardFrom"] = "earlier"
                preserved[values[5]["id"]] = copy.deepcopy(values[5])
                preserved[values[6]["id"]] = copy.deepcopy(values[6])
                stale_id = values[-1]["id"]
                data["outbox"] = [{"occurrenceId": stale_id, "status": "pending"}, {"occurrenceId": stale_id, "status": "delivered"}]
                updated = {**definition, "assignment": {**definition["assignment"], **change}}
                data, _ = self.authority._apply_workspace_action(data, {
                    "type": "definition_update", "actorParticipantId": "manager", "definition": updated,
                }, edit_timestamp, "edit")
                self.assertEqual(data["occurrencesById"], preserved)
                self.assertEqual(data["outbox"], [{"occurrenceId": stale_id, "status": "delivered"}])
                data, _ = chores._materialize(data, "2026-10-04T00:00:00.000Z", "2026-10-07T00:00:00.000Z", edit_timestamp, "second")
                for occurrence_id, occurrence in preserved.items():
                    self.assertEqual(data["occurrencesById"][occurrence_id], occurrence)
                future = [item for key, item in data["occurrencesById"].items() if key not in preserved]
                self.assertEqual(len(future), 2)
                self.assertEqual(len({item["scheduledAt"] for item in future}), 2)

    async def test_past_everyone_assignment_adds_only_the_missing_participant(self):
        scheduled_at = "2026-09-28T18:00:00.000Z"
        existing_id = f"dishes:{scheduled_at}:manager"
        data = chores._empty_data()
        data["participantsById"] = {key: _participant(key) for key in ["manager", "child"]}
        data["definitionsById"]["dishes"] = {
            "id": "dishes", "enabled": True,
            "assignment": {"mode": "everyone", "participantIds": ["manager", "child"]},
            "schedule": {"frequency": "once", "date": "2026-09-28", "time": "18:00", "timeZone": "UTC"},
            "dueWindowMinutes": 60,
        }
        existing = {
            "id": existing_id, "definitionId": "dishes", "scheduledAt": scheduled_at,
            "dueAt": "2026-09-28T19:00:00.000Z", "assigneeIds": ["manager"],
            "assignmentSlot": "manager", "status": "available", "updatedAt": scheduled_at,
        }
        data["occurrencesById"][existing_id] = existing
        args = ("2026-09-28T00:00:00.000Z", "2026-09-29T00:00:00.000Z", "2026-09-29T08:00:00.000Z")
        data, additions = chores._materialize(data, *args, "add-child")
        self.assertEqual(data["occurrencesById"][existing_id], existing)
        self.assertEqual(
            {item["assignmentSlot"] for item in data["occurrencesById"].values()},
            {"manager", "child"},
        )
        self.assertEqual(len(additions), 1)
        repeated, additions = chores._materialize(data, *args, "repeat")
        self.assertEqual(repeated["occurrencesById"], data["occurrencesById"])
        self.assertEqual(additions, [])

    async def test_invalid_rotation_cursor_is_repaired_without_losing_workspace(self):
        data = chores._empty_data()
        data["definitionsById"] = {
            "dishes": {
                "id": "dishes",
                "assignment": {
                    "mode": "rotation",
                    "participantIds": ["manager"],
                    "rotationCursor": None,
                },
            }
        }

        normalized = chores._normalize_data(data)

        self.assertEqual(
            normalized["definitionsById"]["dishes"]["assignment"]["rotationCursor"],
            0,
        )

    async def test_invalid_rotation_cursor_repair_is_persisted_during_startup(self):
        data = chores._empty_data()
        data["definitionsById"] = {
            "dishes": {
                "id": "dishes",
                "enabled": False,
                "assignment": {
                    "mode": "rotation",
                    "participantIds": ["manager"],
                    "rotationCursor": None,
                },
            }
        }
        _Store.values[chores.WORKSPACE_KEY] = {
            "contractVersion": 1,
            "revision": 4,
            "updatedAt": "2026-08-28T08:00:00.000Z",
            "data": data,
        }

        authority = chores.ChoreAuthority(_Hass())
        await authority.async_initialize()

        persisted = _Store.values[chores.WORKSPACE_KEY]
        self.assertEqual(persisted["revision"], 5)
        self.assertEqual(
            persisted["data"]["definitionsById"]["dishes"]["assignment"][
                "rotationCursor"
            ],
            0,
        )

    async def test_invalid_rotation_cursor_is_repaired_before_a_definition_is_saved(self):
        await self._create_manager()
        timestamp = "2026-08-28T08:00:00.000Z"

        await self.authority.async_command(
            {
                "commandId": "definition-create-invalid-cursor",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "definition_create",
                    "actorParticipantId": "manager",
                    "definition": {
                        "id": "dishes",
                        "title": "Empty dishes",
                        "enabled": True,
                        "assignment": {
                            "mode": "rotation",
                            "participantIds": ["manager"],
                            "rotationCursor": None,
                        },
                        "schedule": {
                            "frequency": "once",
                            "date": "2026-08-28",
                            "time": "08:00",
                            "timeZone": "UTC",
                        },
                        "dueWindowMinutes": 60,
                        "approval": {"required": False, "approverIds": []},
                        "createdAt": timestamp,
                        "updatedAt": timestamp,
                    },
                },
            },
            "ha-user-1",
        )

        self.assertEqual(
            self.authority.data["definitionsById"]["dishes"]["assignment"][
                "rotationCursor"
            ],
            0,
        )

    async def test_definition_delete_removes_the_chore_and_generated_occurrences(self):
        await self._create_manager()
        timestamp = "2026-08-28T08:00:00.000Z"
        await self.authority.async_command(
            {
                "commandId": "definition-create",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "definition_create",
                    "actorParticipantId": "manager",
                    "definition": {
                        "id": "dishes",
                        "title": "Empty dishes",
                        "enabled": True,
                        "assignment": {"mode": "person", "participantIds": ["manager"]},
                        "schedule": {
                            "frequency": "once",
                            "date": "2026-08-28",
                            "time": "08:00",
                            "timeZone": "UTC",
                        },
                        "dueWindowMinutes": 60,
                        "approval": {"required": False, "approverIds": []},
                        "createdAt": timestamp,
                        "updatedAt": timestamp,
                    },
                },
            },
            "ha-user-1",
        )
        self.authority.data["occurrencesById"]["dishes:one"] = {
            "id": "dishes:one",
            "definitionId": "dishes",
        }

        result = await self.authority.async_command(
            {
                "commandId": "definition-delete",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "definition_delete",
                    "definitionId": "dishes",
                    "actorParticipantId": "manager",
                },
            },
            "ha-user-1",
        )

        self.assertEqual(result["data"]["definitionsById"], {})
        self.assertEqual(result["data"]["occurrencesById"], {})
        self.assertEqual(result["data"]["activity"][-1]["type"], "definition_deleted")

    async def test_completion_and_reopen_record_exact_point_deltas(self):
        data = chores._empty_data()
        data["participantsById"] = {"manager": _participant()}
        data["definitionsById"] = {
            "dishes": {
                "id": "dishes",
                "title": "Empty dishes",
                "enabled": True,
                "assignment": {"mode": "person", "participantIds": ["manager"]},
                "approval": {"required": False, "approverIds": []},
            }
        }
        data["occurrencesById"] = {
            "dishes:today:manager": {
                "id": "dishes:today:manager",
                "definitionId": "dishes",
                "scheduledAt": "2026-08-28T08:00:00.000Z",
                "assigneeIds": ["manager"],
                "assignmentSlot": "manager",
                "status": "available",
                "updatedAt": "2026-08-28T08:00:00.000Z",
            }
        }
        data["experience"] = {
            **data["experience"],
            "gamificationMode": "light",
            "presentationByDefinitionId": {"dishes": {"points": 15}},
        }
        completed, completion = chores._apply_occurrence(
            data,
            "dishes:today:manager",
            {"type": "complete", "participantId": "manager"},
            "2026-08-28T09:00:00.000Z",
            "complete-with-points",
        )
        self.assertEqual(
            completed["experience"]["earnedPointsByParticipant"], {"manager": 15}
        )
        self.assertEqual(completion["pointsDelta"], 15)
        self.assertEqual(completion["participantId"], "manager")

        reopened, reversal = chores._apply_occurrence(
            completed,
            "dishes:today:manager",
            {"type": "reopen", "participantId": "manager", "reason": "Redo"},
            "2026-08-28T09:05:00.000Z",
            "reopen-with-points",
        )
        self.assertEqual(
            reopened["experience"]["earnedPointsByParticipant"], {"manager": 0}
        )
        self.assertEqual(reversal["pointsDelta"], -15)
        self.assertEqual(reversal["participantId"], "manager")

    async def test_durable_history_applies_workspace_retention(self):
        await self.authority.async_initialize()
        self.authority._history = [
            {
                "id": "activity:expired",
                "commandId": "expired",
                "type": "completed",
                "timestamp": "2020-01-01T00:00:00.000Z",
            }
        ]
        await self._create_manager()
        saved_ids = {
            item["id"] for item in _Store.values[chores.HISTORY_KEY]["events"]
        }
        self.assertNotIn("activity:expired", saved_ids)
        self.assertIn("activity:manager-create", saved_ids)

    async def _seed_outstanding_interval(self, everyone=False, approval=False):
        original_now = chores._now
        chores._now = lambda: datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc)
        self.addCleanup(setattr, chores, "_now", original_now)
        await self._create_manager()
        if everyone:
            await self.authority.async_command({"commandId": "other-create", "baseRevision": self.authority.revision,
                "action": {"type": "participant_create", "actorParticipantId": "manager", "participant": _participant("other")}}, "ha-user-1")
        definition = {"id": "repeat", "title": "Repeat", "enabled": True,
            "assignment": {"mode": "everyone" if everyone else "person", "participantIds": ["manager", "other"] if everyone else ["manager"]},
            "schedule": {"frequency": "after_completion", "startDate": "2026-01-01", "time": "10:00", "timeZone": "UTC", "intervalDays": 14},
            "missedPolicy": {"graceMinutes": 0, "action": "carry_forward"},
            "dueWindowMinutes": 60, "approval": {"required": approval, "approverIds": ["manager"] if approval else []},
            "createdAt": "2026-01-01T08:00:00.000Z", "updatedAt": "2026-01-01T08:00:00.000Z"}
        await self.authority.async_command({"commandId": "repeat-create", "baseRevision": self.authority.revision,
            "action": {"type": "definition_create", "actorParticipantId": "manager", "definition": definition}}, "ha-user-1")
        await self.authority.async_tick()
        return definition

    async def _assert_started_interval_survives_edit(self, change):
        definition = await self._seed_outstanding_interval(everyone=True)
        original = next(item for item in self.authority.data["occurrencesById"].values() if item["assigneeIds"] == ["manager"])
        await self.authority.async_command({"commandId": "complete-anchor", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": original["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        outstanding = copy.deepcopy([item for item in self.authority.data["occurrencesById"].values() if not item.get("completedAt")])
        self.assertEqual(len(outstanding), 2)
        self.assertTrue(any(item["scheduledAt"] == "2026-10-25T10:00:00.000Z" for item in outstanding))
        chores._now = lambda: datetime(2026, 10, 26, 10, 0, tzinfo=timezone.utc)
        edited = copy.deepcopy(definition)
        if change == "interval":
            edited["schedule"]["intervalDays"] = 7
        elif change == "time":
            edited["schedule"]["time"] = "11:00"
        else:
            edited["assignment"]["participantIds"] = ["other", "manager"]
        await self.authority.async_command({"commandId": "edit-repeat", "baseRevision": self.authority.revision,
            "action": {"type": "definition_update", "actorParticipantId": "manager", "definition": edited}}, "ha-user-1")
        await self.authority.async_tick()
        self.assertEqual({item["id"]: item for item in self.authority.data["occurrencesById"].values() if not item.get("completedAt")}, {item["id"]: item for item in outstanding})

    async def test_started_after_completion_interval_survives_interval_edit(self):
        await self._assert_started_interval_survives_edit("interval")

    async def test_started_after_completion_interval_survives_time_edit(self):
        await self._assert_started_interval_survives_edit("time")

    async def test_started_after_completion_interval_survives_assignment_edit(self):
        await self._assert_started_interval_survives_edit("assignment")

    async def test_offset_outstanding_interval_preserves_earliest_future_work_after_completion(self):
        await self._seed_outstanding_interval(approval=True)
        original = next(iter(self.authority.data["occurrencesById"].values()))
        earlier = {**original, "id": "restored-earlier", "scheduledAt": "2026-10-25T00:30:00+02:00",
            "dueAt": "2026-10-25T01:30:00+02:00", "updatedAt": "2026-10-11T10:00:00.000Z"}
        later = {**original, "id": "restored-later", "scheduledAt": "2026-10-24T23:00:00.000Z",
            "dueAt": "2026-10-25T00:00:00.000Z", "updatedAt": "2026-10-11T10:00:00.000Z"}
        self.assertLess(chores._parse_iso(earlier["scheduledAt"]), chores._parse_iso(later["scheduledAt"]))
        self.authority.data["occurrencesById"].update({earlier["id"]: earlier, later["id"]: later})
        result = await self.authority.async_command({"commandId": "offset-outstanding-complete", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": original["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        self.assertEqual(result["data"]["occurrencesById"][original["id"]]["status"], "awaiting_approval")
        self.assertEqual([item for item in result["data"]["occurrencesById"].values() if not item.get("completedAt")], [earlier])
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        await restarted.async_tick()
        self.assertEqual(restarted.data["occurrencesById"], result["data"]["occurrencesById"])

    async def test_old_after_completion_stays_actionable_and_survives_done_and_restart(self):
        await self._seed_outstanding_interval()
        self.assertEqual(len(self.authority.data["occurrencesById"]), 1)
        original = next(iter(self.authority.data["occurrencesById"].values()))
        self.assertEqual(original["status"], "available")
        original["status"] = "missed"  # Legacy overdue state restored from an older version.
        original["missedAt"] = "2026-01-02T10:00:00.000Z"
        result = await self.authority.async_command({"commandId": "old-complete", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": original["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        self.assertEqual(result["data"]["occurrencesById"][original["id"]]["completedAt"], "2026-10-11T10:00:00.000Z")
        self.assertEqual([item["scheduledAt"] for item in result["data"]["occurrencesById"].values() if item["status"] == "available"], ["2026-10-25T10:00:00.000Z"])
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        await restarted.async_tick()
        self.assertEqual(restarted.data["occurrencesById"], result["data"]["occurrencesById"])

    async def test_everyone_after_completion_advances_independently_on_submission(self):
        await self._seed_outstanding_interval(everyone=True, approval=True)
        original = next(item for item in self.authority.data["occurrencesById"].values() if item["assigneeIds"] == ["manager"])
        result = await self.authority.async_command({"commandId": "manager-submit", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": original["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        values = list(result["data"]["occurrencesById"].values())
        self.assertEqual(result["data"]["occurrencesById"][original["id"]]["status"], "awaiting_approval")
        self.assertEqual(sorted((item["assigneeIds"][0], item["scheduledAt"]) for item in values if item["status"] == "available"), [("manager", "2026-10-25T10:00:00.000Z"), ("other", "2026-01-01T10:00:00.000Z")])
        original_now = chores._now
        chores._now = lambda: datetime(2026, 10, 13, 10, 0, tzinfo=timezone.utc)
        self.addCleanup(setattr, chores, "_now", original_now)
        other = next(item for item in values if item["assigneeIds"] == ["other"])
        result = await self.authority.async_command({"commandId": "other-submit", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": other["id"], "action": {"type": "complete", "participantId": "other"}}}, "ha-user-1")
        self.assertEqual(sorted((item["assigneeIds"][0], item["scheduledAt"]) for item in result["data"]["occurrencesById"].values() if item["status"] == "available"), [("manager", "2026-10-25T10:00:00.000Z"), ("other", "2026-10-27T10:00:00.000Z")])

    async def test_everyone_reopen_discards_only_that_persons_next_interval_and_reminder(self):
        await self._seed_outstanding_interval(everyone=True)
        original = next(item for item in self.authority.data["occurrencesById"].values() if item["assigneeIds"] == ["manager"])
        result = await self.authority.async_command({"commandId": "manager-complete", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": original["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        future = next(item for item in result["data"]["occurrencesById"].values() if item["assigneeIds"] == ["manager"] and item["status"] == "available")
        self.authority.data["outbox"].append(chores._outbox(chores._activity("future-reminder", "2026-10-11T10:00:00.000Z", "reminder_due", occurrenceId=future["id"])))
        result = await self.authority.async_command({"commandId": "manager-reopen", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": original["id"], "action": {"type": "reopen", "participantId": "manager", "reason": "Completed by mistake"}}}, "ha-user-1")
        self.assertNotIn(future["id"], result["data"]["occurrencesById"])
        self.assertFalse(any(item.get("occurrenceId") == future["id"] for item in result["data"]["outbox"]))
        self.assertEqual(result["data"]["occurrencesById"][original["id"]]["status"], "available")
        self.assertEqual(len(result["data"]["occurrencesById"]), 2)

    async def test_everyone_reassignment_keeps_original_clock_through_completion_restart_and_retention(self):
        await self._seed_outstanding_interval(everyone=True)
        original_manager = next(item for item in self.authority.data["occurrencesById"].values() if item["assigneeIds"] == ["manager"])
        original_other = next(item for item in self.authority.data["occurrencesById"].values() if item["assigneeIds"] == ["other"])
        await self.authority.async_command({"commandId": "transfer-manager-work", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": original_manager["id"], "action": {"type": "reassign", "participantId": "manager", "assigneeIds": ["other"], "reason": "Help manager"}}}, "ha-user-1")
        transferred = self.authority.data["occurrencesById"][original_manager["id"]]
        self.assertEqual(transferred["assigneeIds"], ["other"])
        self.assertEqual(transferred["assignmentSlot"], "manager:other")
        result = await self.authority.async_command({"commandId": "complete-transfer", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": original_manager["id"], "action": {"type": "complete", "participantId": "other"}}}, "ha-user-1")
        self.assertEqual(result["data"]["occurrencesById"][original_other["id"]], original_other)
        self.assertEqual([item["scheduledAt"] for item in result["data"]["occurrencesById"].values() if item["status"] == "available" and item["assigneeIds"] == ["manager"]], ["2026-10-25T10:00:00.000Z"])
        chores._now = lambda: datetime(2026, 10, 13, 10, 0, tzinfo=timezone.utc)
        await self.authority.async_command({"commandId": "complete-own-other", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": original_other["id"], "action": {"type": "complete", "participantId": "other"}}}, "ha-user-1")
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        chores._now = lambda: datetime(2027, 2, 1, 10, 0, tzinfo=timezone.utc)
        await restarted.async_tick()
        self.assertEqual(restarted.data["occurrencesById"][original_manager["id"]]["completedAt"], "2026-10-11T10:00:00.000Z")
        self.assertEqual(sorted((item["assigneeIds"][0], item["scheduledAt"]) for item in restarted.data["occurrencesById"].values() if item["status"] == "available"), [("manager", "2026-10-25T10:00:00.000Z"), ("other", "2026-10-27T10:00:00.000Z")])

    async def test_fixed_everyone_supersession_uses_original_reassigned_slot_and_offset_instant(self):
        await self._seed_outstanding_interval(everyone=True)
        data = copy.deepcopy(self.authority.data)
        original = next(item for item in data["occurrencesById"].values() if item["assigneeIds"] == ["manager"])
        definition = data["definitionsById"]["repeat"]
        definition["schedule"] = {"frequency": "weekly", "startDate": "2026-01-01", "time": "10:00", "timeZone": "UTC", "daysOfWeek": [0]}
        changed, _ = chores._apply_occurrence(data, original["id"], {"type": "reassign", "participantId": "manager", "assigneeIds": ["other"], "reason": "Help"}, "2026-10-10T10:00:00.000Z", "transfer-fixed")
        transferred = changed["occurrencesById"][original["id"]]
        manager_next = {**original, "id": "repeat:2026-10-18T10:00:00.000Z:manager", "scheduledAt": "2026-10-18T12:00:00+02:00"}
        other_next = {**original, "id": "repeat:2026-10-17T10:00:00.000Z:other", "scheduledAt": "2026-10-17T10:00:00.000Z", "assigneeIds": ["other"], "assignmentSlot": "other"}
        occurrences = {item["id"]: item for item in [transferred, manager_next, other_next]}
        self.assertIsNone(chores._superseding_occurrence(transferred, definition, occurrences, "2026-10-17T10:00:00.000Z"))
        self.assertIsNone(chores._superseding_occurrence(transferred, definition, occurrences, "2026-10-18T09:59:59.999Z"))
        self.assertEqual(chores._superseding_occurrence(transferred, definition, occurrences, "2026-10-18T10:00:00.000Z"), manager_next)
        self.assertEqual(transferred["assigneeIds"], ["other"])

    async def test_shared_completion_work_is_preserved_when_definition_changes_to_everyone(self):
        definition = await self._seed_outstanding_interval(everyone=True)
        data = copy.deepcopy(self.authority.data)
        original = next(iter(data["occurrencesById"].values()))
        original.update({"id": f"repeat:{original['scheduledAt']}:shared", "assignmentSlot": "shared", "assigneeIds": ["manager", "other"]})
        data["occurrencesById"] = {original["id"]: original}
        data["definitionsById"]["repeat"]["assignment"]["mode"] = "anyone"
        changed, _ = self.authority._apply_workspace_action(data, {"type": "definition_update", "actorParticipantId": "manager", "definition": definition}, "2026-10-11T10:00:00.000Z", "adopt-shared")
        materialized, _ = chores._materialize(changed, "2026-10-11T00:00:00.000Z", "2026-10-30T00:00:00.000Z", "2026-10-11T10:00:00.000Z", "materialize-shared")
        self.assertEqual(materialized["occurrencesById"], data["occurrencesById"])

    async def test_offset_completion_history_uses_latest_instant_for_recurrence_and_retention(self):
        await self._seed_outstanding_interval(everyone=True)
        for everyone in (False, True):
            with self.subTest(everyone=everyone):
                data = copy.deepcopy(self.authority.data)
                data["definitionsById"]["repeat"]["assignment"] = {"mode": "everyone" if everyone else "person", "participantIds": ["manager", "other"] if everyone else ["manager"]}
                manager = next(item for item in data["occurrencesById"].values() if item["assigneeIds"] == ["manager"])
                other = next(item for item in data["occurrencesById"].values() if item["assigneeIds"] == ["other"])
                earlier = {**manager, "id": "earlier-offset", "status": "done", "completedBy": "manager", "completedAt": "2026-08-17T01:00:00+02:00"}
                later = {**manager, "id": "later-utc", "status": "done", "scheduledAt": "2026-01-15T10:00:00.000Z", "completedBy": "manager", "completedAt": "2026-08-17T00:30:00Z"}
                data["occurrencesById"] = {earlier["id"]: earlier, later["id"]: later}
                if everyone:
                    data["occurrencesById"][other["id"]] = other
                restored = chores._normalize_data(json.loads(json.dumps(data)))
                result, _ = chores._materialize(restored, "2026-08-18T00:00:00.000Z", "2026-09-03T00:00:00.000Z", "2026-08-18T10:00:00.000Z", "offset-clock")
                self.assertEqual([item["scheduledAt"] for item in result["occurrencesById"].values() if item["status"] == "available" and item["assigneeIds"] == ["manager"]], ["2026-08-31T10:00:00.000Z"])
                boundary = datetime(2026, 9, 1, tzinfo=timezone.utc)
                self.assertTrue(chores._should_prune_occurrence(earlier, data["definitionsById"], data["occurrencesById"], boundary, data["participantsById"]))
                self.assertFalse(chores._should_prune_occurrence(later, data["definitionsById"], data["occurrencesById"], boundary, data["participantsById"]))
                self.assertEqual(restored["occurrencesById"][earlier["id"]]["completedAt"], "2026-08-17T01:00:00+02:00")

    async def test_scheduled_work_becomes_missed_when_next_starts_and_keeps_approval(self):
        definition = await self._seed_outstanding_interval()
        definition["schedule"] = {"frequency": "weekly", "startDate": "2026-01-01", "time": "10:00", "timeZone": "UTC", "daysOfWeek": [0]}
        definition["missedPolicy"] = {"graceMinutes": 0, "action": "none"}
        await self.authority.async_command({"commandId": "fixed-schedule", "baseRevision": self.authority.revision,
            "action": {"type": "definition_update", "actorParticipantId": "manager", "definition": definition}}, "ha-user-1")
        await self.authority.async_tick()
        values = list(self.authority.data["occurrencesById"].values())
        self.assertTrue(any(item["status"] == "missed" for item in values))
        today = next(item for item in values if item["scheduledAt"] == "2026-10-11T10:00:00.000Z")
        self.assertEqual(today["status"], "available")
        missed = next(item for item in values if item["status"] == "missed")
        result = await self.authority.async_command({"commandId": "history-complete", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": missed["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        self.assertEqual(result["data"]["occurrencesById"][today["id"]], today)

    async def test_fixed_supersession_survives_storage_pruning_and_reopen(self):
        definition = await self._seed_outstanding_interval()
        definition["schedule"] = {"frequency": "weekly", "startDate": "2026-01-01", "time": "10:00", "timeZone": "UTC", "daysOfWeek": [0]}
        definition["missedPolicy"] = {"graceMinutes": 0, "action": "none"}
        await self.authority.async_command({"commandId": "fixed-marker", "baseRevision": self.authority.revision,
            "action": {"type": "definition_update", "actorParticipantId": "manager", "definition": definition}}, "ha-user-1")
        await self.authority.async_tick()
        data = json.loads(json.dumps(self.authority.data))
        old = next(item for item in data["occurrencesById"].values() if item.get("supersededAt"))
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertEqual(restarted.data["occurrencesById"][old["id"]]["supersededAt"], old["supersededAt"])
        old["status"] = "missed"
        old.pop("completedAt", None)
        restored = chores._normalize_data(json.loads(json.dumps(data)))
        self.assertEqual(restored["occurrencesById"][old["id"]]["supersededAt"], old["supersededAt"])
        reopened, _ = chores._apply_occurrence(restored, old["id"], {"type": "reopen", "participantId": "manager", "reason": "Again"}, "2026-10-12T10:00:00.000Z", "reopen-marker")
        self.assertEqual(reopened["occurrencesById"][old["id"]]["status"], "available")
        self.assertNotIn("supersededAt", reopened["occurrencesById"][old["id"]])
        restored["occurrencesById"][old["id"]]["supersededAt"] = "invalid"
        with self.assertRaises(chores.ChoreStorageError):
            chores._normalize_data(restored)

    async def test_archive_preserves_superseded_missed_history_across_restart_and_restore(self):
        definition = await self._seed_outstanding_interval()
        definition["schedule"] = {"frequency": "weekly", "startDate": "2026-01-01", "time": "10:00", "timeZone": "UTC", "daysOfWeek": [0]}
        definition["missedPolicy"] = {"graceMinutes": 0, "action": "none"}
        await self.authority.async_command({"commandId": "fixed-archive", "baseRevision": self.authority.revision,
            "action": {"type": "definition_update", "actorParticipantId": "manager", "definition": definition}}, "ha-user-1")
        await self.authority.async_tick()
        historical = next(item for item in self.authority.data["occurrencesById"].values() if item.get("supersededAt"))
        active_ids = {item["id"] for item in self.authority.data["occurrencesById"].values() if item["status"] == "available"}
        self.assertTrue(active_ids)
        result = await self.authority.async_command({"commandId": "archive-fixed-history", "baseRevision": self.authority.revision,
            "action": {"type": "definition_archive", "actorParticipantId": "manager", "definitionId": "repeat"}}, "ha-user-1")
        self.assertEqual(result["data"]["occurrencesById"][historical["id"]], historical)
        self.assertTrue(active_ids.isdisjoint(result["data"]["occurrencesById"]))
        with self.assertRaisesRegex(chores.ChoreAuthorityError, "Chore definition is no longer available"):
            await self.authority.async_command({"commandId": "reject-archived-completion", "baseRevision": self.authority.revision,
                "action": {"type": "occurrence_action", "occurrenceId": historical["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertEqual(restarted.data["occurrencesById"][historical["id"]], historical)
        restored = await restarted.async_command({"commandId": "restore-fixed-history", "baseRevision": restarted.revision,
            "action": {"type": "definition_restore", "actorParticipantId": "manager", "definitionId": "repeat"}}, "ha-user-1")
        self.assertEqual(restored["data"]["occurrencesById"][historical["id"]], historical)
        completed = await restarted.async_command({"commandId": "complete-restored-fixed-history", "baseRevision": restarted.revision,
            "action": {"type": "occurrence_action", "occurrenceId": historical["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        self.assertEqual(completed["data"]["occurrencesById"][historical["id"]]["status"], "done")

    async def test_archive_retains_original_carry_history_across_restart_and_restore(self):
        definition = await self._seed_outstanding_interval()
        definition["schedule"] = {"frequency": "once", "date": "2026-10-10", "time": "10:00", "timeZone": "UTC"}
        self.authority.data["definitionsById"][definition["id"]] = definition
        original = next(iter(self.authority.data["occurrencesById"].values()))
        original.update({"status": "missed", "missedAt": "2026-10-10T11:00:00.000Z", "carriedForwardTo": "carry-replacement"})
        replacement = {**original, "id": "carry-replacement", "status": "available", "assignmentSlot": f"carry:{original['id']}", "carriedForwardFrom": original["id"], "scheduledAt": "2026-10-12T10:00:00.000Z", "dueAt": "2026-10-12T11:00:00.000Z"}
        replacement.pop("carriedForwardTo")
        self.authority.data["occurrencesById"][replacement["id"]] = replacement
        result = await self.authority.async_command({"commandId": "archive-carry-history", "baseRevision": self.authority.revision,
            "action": {"type": "definition_archive", "actorParticipantId": "manager", "definitionId": definition["id"]}}, "ha-user-1")
        self.assertEqual(result["data"]["occurrencesById"][original["id"]], original)
        self.assertNotIn(replacement["id"], result["data"]["occurrencesById"])
        with self.assertRaises(chores.ChoreAuthorityError):
            await self.authority.async_command({"commandId": "blocked-archived-carry", "baseRevision": self.authority.revision,
                "action": {"type": "occurrence_action", "occurrenceId": original["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        restored = await restarted.async_command({"commandId": "restore-carry-history", "baseRevision": restarted.revision,
            "action": {"type": "definition_restore", "actorParticipantId": "manager", "definitionId": definition["id"]}}, "ha-user-1")
        self.assertEqual(restored["data"]["occurrencesById"][original["id"]], original)

    async def test_legacy_supersession_backfills_before_prune_and_frequency_edit(self):
        definition = await self._seed_outstanding_interval()
        data = json.loads(json.dumps(self.authority.data))
        definition["schedule"] = {"frequency": "weekly", "startDate": "2026-01-01", "time": "10:00", "timeZone": "UTC", "daysOfWeek": [0]}
        data["definitionsById"][definition["id"]] = definition
        old = next(iter(data["occurrencesById"].values()))
        old.update({"status": "missed", "scheduledAt": "2026-06-01T10:00:00.000Z", "dueAt": "2026-06-01T11:00:00.000Z", "updatedAt": "2026-06-01T11:00:00.000Z"})
        old.pop("supersededAt", None)
        successor = {**old, "id": "successor", "status": "done", "scheduledAt": "2026-06-08T10:00:00.000Z", "dueAt": "2026-06-08T11:00:00.000Z", "updatedAt": "2026-06-08T11:00:00.000Z", "completedAt": "2026-06-08T11:00:00.000Z", "completedBy": "manager"}
        data["occurrencesById"]["successor"] = successor
        pruned, _ = chores._materialize(data, "2026-10-11T00:00:00.000Z", "2026-10-12T00:00:00.000Z", "2026-10-11T10:00:00.000Z", "prune")
        self.assertNotIn("successor", pruned["occurrencesById"])
        self.assertEqual(pruned["occurrencesById"][old["id"]]["supersededAt"], successor["scheduledAt"])
        edited = {**definition, "schedule": {"frequency": "after_completion", "startDate": "2026-10-11", "time": "10:00", "timeZone": "UTC", "intervalDays": 14}}
        changed, _ = self.authority._apply_workspace_action(data, {"type": "definition_update", "actorParticipantId": "manager", "definition": edited}, "2026-10-11T10:00:00.000Z", "edit")
        self.assertEqual(changed["occurrencesById"][old["id"]]["supersededAt"], successor["scheduledAt"])
        next_data, _ = chores._materialize(changed, "2026-10-11T00:00:00.000Z", "2026-10-25T00:00:00.000Z", "2026-10-11T10:00:00.000Z", "next")
        self.assertFalse(any(item["id"] == old["id"] for item in next_data["occurrencesById"].values() if item["status"] == "available"))

    async def test_early_completion_persists_next_date_fourteen_days_later(self):
        original_now = chores._now
        chores._now = lambda: datetime(2026, 10, 4, 10, 0, tzinfo=timezone.utc)
        self.addCleanup(setattr, chores, "_now", original_now)
        await self._create_manager()
        definition = {"id": "repeat", "title": "Repeat chore", "enabled": True,
            "assignment": {"mode": "person", "participantIds": ["manager"]},
            "schedule": {"frequency": "after_completion", "startDate": "2026-10-08", "time": "18:00", "timeZone": "Europe/Stockholm", "intervalDays": 14},
            "dueWindowMinutes": 60, "approval": {"required": False, "approverIds": []},
            "createdAt": "2026-10-04T08:00:00.000Z", "updatedAt": "2026-10-04T08:00:00.000Z"}
        await self.authority.async_command({"commandId": "repeat-create", "baseRevision": self.authority.revision,
            "action": {"type": "definition_create", "actorParticipantId": "manager", "definition": definition}}, "ha-user-1")
        await self.authority.async_tick()
        occurrence = next(iter(self.authority.data["occurrencesById"].values()))
        result = await self.authority.async_command({"commandId": "early-complete", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": occurrence["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        self.assertEqual([item["scheduledAt"] for item in result["data"]["occurrencesById"].values() if item["status"] == "available"], ["2026-10-18T16:00:00.000Z"])
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertEqual(restarted.data["occurrencesById"], result["data"]["occurrencesById"])

    async def _assert_completion_interval(self, interval_days, expected):
        original_now = chores._now
        chores._now = lambda: datetime(2026, 10, 4, 10, 0, tzinfo=timezone.utc)
        self.addCleanup(setattr, chores, "_now", original_now)
        await self._create_manager()
        definition = {"id": "repeat", "title": "Repeat chore", "enabled": True,
            "assignment": {"mode": "person", "participantIds": ["manager"]},
            "schedule": {"frequency": "after_completion", "startDate": "2026-10-08", "time": "18:00", "timeZone": "Europe/Stockholm", "intervalDays": interval_days},
            "dueWindowMinutes": 60, "approval": {"required": False, "approverIds": []},
            "createdAt": "2026-10-04T08:00:00.000Z", "updatedAt": "2026-10-04T08:00:00.000Z"}
        await self.authority.async_command({"commandId": "repeat-create", "baseRevision": self.authority.revision,
            "action": {"type": "definition_create", "actorParticipantId": "manager", "definition": definition}}, "ha-user-1")
        await self.authority.async_tick()
        occurrence = next(iter(self.authority.data["occurrencesById"].values()))
        result = await self.authority.async_command({"commandId": "early-complete", "baseRevision": self.authority.revision,
            "action": {"type": "occurrence_action", "occurrenceId": occurrence["id"], "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        self.assertEqual([item["scheduledAt"] for item in result["data"]["occurrencesById"].values() if item["status"] == "available"], [expected])
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertEqual(restarted.data["occurrencesById"], result["data"]["occurrencesById"])

        reopened = await restarted.async_command({"commandId": "reopen-completion", "baseRevision": restarted.revision,
            "action": {"type": "occurrence_action", "occurrenceId": occurrence["id"], "action": {"type": "reopen", "participantId": "manager", "reason": "Completed by mistake"}}}, "ha-user-1")
        self.assertEqual([item["scheduledAt"] for item in reopened["data"]["occurrencesById"].values() if item["status"] == "available"], ["2026-10-08T16:00:00.000Z"])

    async def test_yearly_completion_persists_and_reloads_next_date(self):
        await self._assert_completion_interval(365, "2027-10-04T16:00:00.000Z")

    async def test_ten_year_completion_persists_and_reloads_next_date(self):
        await self._assert_completion_interval(3650, "2036-10-01T16:00:00.000Z")

    async def test_once_none_policy_becomes_missed_at_grace_and_stays_completable(self):
        fixed_now = datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc)
        original_now = chores._now
        chores._now = lambda: fixed_now
        self.addCleanup(setattr, chores, "_now", original_now)
        await self._create_manager()
        definition = {
            "id": "one-time", "title": "One-time chore", "enabled": True,
            "assignment": {"mode": "person", "participantIds": ["manager"]},
            "schedule": {"frequency": "once", "date": "2026-10-11", "time": "10:00", "timeZone": "UTC"},
            "dueWindowMinutes": 60, "missedPolicy": {"graceMinutes": 15, "action": "none"},
            "approval": {"required": False, "approverIds": []},
            "createdAt": "2026-10-11T10:00:00.000Z", "updatedAt": "2026-10-11T10:00:00.000Z",
        }
        await self.authority.async_command({"commandId": "one-time-create", "baseRevision": self.authority.revision,
            "action": {"type": "definition_create", "actorParticipantId": "manager", "definition": definition}}, "ha-user-1")
        await self.authority.async_tick()
        occurrence_id = next(iter(self.authority.data["occurrencesById"]))
        fixed_now = datetime(2026, 10, 11, 11, 14, tzinfo=timezone.utc)
        await self.authority.async_tick()
        self.assertEqual(self.authority.data["occurrencesById"][occurrence_id]["status"], "available")
        fixed_now = datetime(2026, 10, 11, 11, 15, tzinfo=timezone.utc)
        await self.authority.async_tick()
        missed = self.authority.data["occurrencesById"][occurrence_id]
        self.assertEqual(missed["status"], "missed")
        self.assertEqual(missed["missedAt"], "2026-10-11T11:15:00.000Z")
        self.assertNotIn("supersededAt", missed)
        self.assertNotIn("carriedForwardTo", missed)
        await self.authority.async_tick()
        self.assertEqual(sum(item["type"] == "missed" and item.get("occurrenceId") == occurrence_id for item in self.authority.data["activity"]), 1)
        restarted = chores.ChoreAuthority(self.hass)
        await restarted.async_initialize()
        self.assertEqual(restarted.data["occurrencesById"][occurrence_id], missed)
        result = await restarted.async_command({"commandId": "complete-one-time-missed", "baseRevision": restarted.revision,
            "action": {"type": "occurrence_action", "occurrenceId": occurrence_id, "action": {"type": "complete", "participantId": "manager"}}}, "ha-user-1")
        self.assertEqual(result["data"]["occurrencesById"][occurrence_id]["status"], "done")

    async def test_missed_policy_carries_forward_once(self):
        fixed_now = datetime(2026, 8, 28, 12, 0, tzinfo=timezone.utc)
        original_now = chores._now
        chores._now = lambda: fixed_now
        self.addCleanup(setattr, chores, "_now", original_now)
        await self._create_manager()
        await self.authority.async_command(
            {
                "commandId": "carry-definition",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "definition_create",
                    "actorParticipantId": "manager",
                    "definition": {
                        "id": "carry",
                        "title": "Carry chore",
                        "enabled": True,
                        "assignment": {
                            "mode": "person",
                            "participantIds": ["manager"],
                        },
                        "schedule": {
                            "frequency": "once",
                            "date": "2026-08-28",
                            "time": "10:00",
                            "timeZone": "UTC",
                        },
                        "dueWindowMinutes": 0,
                        "missedPolicy": {
                            "graceMinutes": 30,
                            "action": "carry_forward",
                            "carryForwardDays": 2,
                        },
                        "approval": {"required": False, "approverIds": []},
                        "createdAt": "2026-08-28T08:00:00.000Z",
                        "updatedAt": "2026-08-28T08:00:00.000Z",
                    },
                },
            },
            "ha-user-1",
        )
        await self.authority.async_tick()
        original = next(
            item
            for item in self.authority.data["occurrencesById"].values()
            if item["definitionId"] == "carry" and not item.get("carriedForwardFrom")
        )
        carried_id = original["carriedForwardTo"]
        self.assertEqual(original["status"], "missed")
        self.assertEqual(
            self.authority.data["occurrencesById"][carried_id]["scheduledAt"],
            "2026-08-30T10:00:00.000Z",
        )
        await self.authority.async_tick()
        self.assertEqual(
            sum(
                1
                for item in self.authority.data["occurrencesById"].values()
                if item.get("carriedForwardFrom") == original["id"]
            ),
            1,
        )

    async def test_cas_idempotency_subscription_and_restart_persistence(self):
        updates = []
        self.authority.subscribe(updates.append)
        first = await self._create_manager()
        duplicate = await self.authority.async_command(
            {
                "commandId": "manager-create",
                "baseRevision": 0,
                "action": {
                    "type": "participant_create",
                    "participant": _participant(),
                },
            },
            "ha-user-1",
        )
        self.assertEqual(first["revision"], 1)
        self.assertEqual(duplicate["revision"], 1)
        self.assertEqual(len(updates), 1)

        with self.assertRaises(chores.ChoreConflictError):
            await self.authority.async_command(
                {
                    "commandId": "stale-command",
                    "baseRevision": 0,
                    "action": {
                        "type": "participant_create",
                        "participant": _participant("other"),
                        "actorParticipantId": "manager",
                    },
                },
                "ha-user-1",
            )

        restarted = chores.ChoreAuthority(_Hass())
        await restarted.async_initialize()
        self.assertEqual(restarted.revision, 1)
        self.assertIn("manager", restarted.data["participantsById"])

    async def test_authenticated_websocket_subscription_and_stale_error_shape(self):
        self.hass.data["navet"] = {"chore_authority": self.authority}
        await self.authority.async_initialize()
        connection = _Connection("ha-user-1")
        await chores.websocket_chore_command(
            self.hass,
            connection,
            {"id": 1, "type": "navet/chores/workspace/subscribe"},
        )
        self.assertEqual(connection.results, [(1, None)])
        self.assertEqual(connection.events[-1][1]["revision"], 0)
        self.assertIn(1, connection.subscriptions)

        await self._create_manager()
        self.assertEqual(connection.events[-1][1]["revision"], 1)
        await chores.websocket_chore_command(
            self.hass,
            connection,
            {
                "id": 2,
                "type": "navet/chores/command",
                "commandId": "stale-ws",
                "baseRevision": 0,
                "action": {
                    "type": "participant_create",
                    "actorParticipantId": "manager",
                    "participant": _participant("other"),
                },
            },
        )
        self.assertEqual(
            connection.messages[-1]["error"],
            {
                "code": "stale_revision",
                "message": "Chore workspace changed on another client",
                "data": {"revision": 1},
            },
        )

    async def test_coordinator_starts_immediately_and_unloads_its_timer(self):
        await self.authority.async_start()
        self.assertIsNotNone((await self.authority.async_info())["lastSchedulerRunAt"])
        self.assertEqual(len(_TRACKED_INTERVALS), 1)
        self.assertEqual(
            _TRACKED_INTERVALS[0]["interval"], chores.BACKGROUND_INTERVAL
        )

        await self.authority.async_stop()
        self.assertTrue(_TRACKED_INTERVALS[0]["cancelled"])

    async def test_management_sessions_are_memory_only_and_user_bound(self):
        await self._create_manager()
        session = await self.authority.async_configure_pin(
            "manager", "2468", None, "ha-user-1"
        )
        self.assertTrue(
            self.authority._session_valid(session["sessionToken"], "ha-user-1")
        )
        self.assertFalse(
            self.authority._session_valid(session["sessionToken"], "ha-user-2")
        )
        backup = await self.authority.async_handle_ws(
            {"type": "navet/chores/backup/get"}, "ha-user-1"
        )
        self.assertNotIn("security", backup)
        self.assertNotIn("pinHash", json.dumps(backup))
        restarted = chores.ChoreAuthority(_Hass())
        await restarted.async_initialize()
        self.assertFalse(
            restarted._session_valid(session["sessionToken"], "ha-user-1")
        )

    async def test_signed_point_adjustment_requires_management_and_keeps_audit_details(self):
        await self._create_manager()
        session = await self.authority.async_configure_pin(
            "manager", "2468", None, "ha-user-1"
        )
        request = {
            "commandId": "adjust-manager-points",
            "baseRevision": self.authority.revision,
            "action": {
                "type": "experience_points_adjust",
                "actorParticipantId": "manager",
                "participantId": "manager",
                "pointsDelta": -20,
            },
        }
        with self.assertRaisesRegex(
            chores.ChoreAuthorityError, "Unlock chore management"
        ):
            await self.authority.async_command(request, "ha-user-1")

        document = await self.authority.async_command(
            {**request, "managementSessionToken": session["sessionToken"]},
            "ha-user-1",
        )
        self.assertEqual(
            document["data"]["experience"]["earnedPointsByParticipant"],
            {"manager": -20},
        )
        self.assertEqual(
            document["data"]["activity"][-1],
            {
                "id": "activity:adjust-manager-points",
                "commandId": "adjust-manager-points",
                "type": "points_adjusted",
                "timestamp": document["data"]["activity"][-1]["timestamp"],
                "actorParticipantId": "manager",
                "participantId": "manager",
                "pointsDelta": -20,
            },
        )
        self.assertFalse(
            any(
                item["eventType"] == "points_adjusted"
                for item in document["data"]["outbox"]
            )
        )
        retried = await self.authority.async_command(
            {**request, "managementSessionToken": session["sessionToken"]},
            "ha-user-1",
        )
        self.assertEqual(retried["revision"], document["revision"])
        self.assertEqual(
            retried["data"]["experience"]["earnedPointsByParticipant"],
            {"manager": -20},
        )

    async def test_reward_request_approval_refund_and_replay(self):
        await self._create_manager()

        async def command(command_id, action):
            return await self.authority.async_command({
                "commandId": command_id,
                "baseRevision": self.authority.revision,
                "action": action,
            }, "ha-user-1")

        experience = copy.deepcopy(self.authority.data["experience"])
        experience["gamificationMode"] = "family"
        experience["rewardGoalsById"] = {
            "movie": {"id": "movie", "title": "Movie", "type": "instant",
                "targetPoints": 40, "enabled": True,
                "createdAt": "2026-08-10T08:00:00.000Z",
                "updatedAt": "2026-08-10T08:00:00.000Z"}
        }
        await command("setup-reward", {"type": "experience_update",
            "actorParticipantId": "manager", "experience": experience})
        await command("earn-points", {"type": "experience_points_adjust",
            "actorParticipantId": "manager", "participantId": "manager", "pointsDelta": 100})
        requested = await command("request-reward", {"type": "reward_request",
            "requestId": "r1", "rewardId": "movie", "participantId": "manager"})
        self.assertEqual(requested["data"]["experience"]["earnedPointsByParticipant"]["manager"], 100)
        approved = await self.authority.async_service_action("reward_decision",
            {"request_id": "r1", "manager_participant_id": "manager", "decision": "approve"},
            "approve-reward")
        self.assertEqual(approved["data"]["experience"]["earnedPointsByParticipant"]["manager"], 60)
        replay = await self.authority.async_service_action("reward_decision",
            {"request_id": "r1", "manager_participant_id": "manager", "decision": "approve"},
            "approve-reward")
        self.assertEqual(replay["revision"], approved["revision"])
        refunded = await command("refund-reward", {"type": "reward_decision",
            "requestId": "r1", "actorParticipantId": "manager", "decision": "refund"})
        self.assertEqual(refunded["data"]["experience"]["earnedPointsByParticipant"]["manager"], 100)
        self.assertEqual(len(refunded["data"]["experience"]["pointTransactions"]), 3)

    async def test_typed_home_assistant_point_action_and_weekly_report(self):
        await self._create_manager()
        await self.authority.async_configure_pin("manager", "2468", None, "ha-user-1")
        fields = {"command_id": "automation-bonus-2026-w40", "manager_participant_id": "manager",
            "participant_id": "manager", "points_delta": 7, "reason": "Weekly bonus"}
        first = await self.authority.async_service_action("adjust_points", fields, "context-one")
        self.assertEqual(first["data"]["experience"]["earnedPointsByParticipant"]["manager"], 7)
        replay = await self.authority.async_service_action("adjust_points", fields, "context-two")
        self.assertEqual(replay["revision"], first["revision"])
        report = await self.authority.async_service_action("weekly_report", {"format": "html"}, "context-report")
        self.assertEqual(report["format"], "html")
        self.assertIn("<h1>Chores:", report["content"])

    async def test_mobile_alert_action_is_signed_and_rejects_stale_occurrences(self):
        await self._create_manager()
        occurrence = {"id": "due", "definitionId": "dishes", "status": "available",
            "assigneeIds": ["manager"], "updatedAt": "2026-09-28T10:00:00.000Z"}
        item = {"id": "outbox:alert:due", "occurrenceId": "due", "participantId": "manager",
            "occurrenceUpdatedAt": occurrence["updatedAt"], "status": "delivered"}
        data = self.authority.data
        data["definitionsById"]["dishes"] = {"id": "dishes", "approval": {"approverIds": []}}
        data["occurrencesById"]["due"] = occurrence
        data["outbox"].append(item)
        self.authority.async_command = AsyncMock(return_value={})
        action = self.authority.alert_actions(item)[0]["action"]
        await self.authority.async_handle_alert_action(types.SimpleNamespace(data={"action": action}))
        self.authority.async_command.assert_awaited_once()
        request = self.authority.async_command.await_args.args[0]
        self.assertEqual(request["action"]["expectedOccurrenceUpdatedAt"], occurrence["updatedAt"])
        self.assertTrue(self.authority.async_command.await_args.kwargs["trusted_service"])
        self.authority.async_command.reset_mock()
        forged = action[:-1] + ("0" if action[-1] != "0" else "1")
        await self.authority.async_handle_alert_action(types.SimpleNamespace(data={"action": forged}))
        self.authority.async_command.assert_not_awaited()
        occurrence["updatedAt"] = "2026-09-28T10:01:00.000Z"
        await self.authority.async_handle_alert_action(types.SimpleNamespace(data={"action": action}))
        self.authority.async_command.assert_not_awaited()

    async def test_changed_occurrence_clears_delivered_mobile_alert(self):
        await self._create_manager()
        data = self.authority.data
        data["occurrencesById"]["due"] = {"id": "due", "updatedAt": "2026-09-28T10:00:00.000Z"}
        data["outbox"].append({"id": "outbox:alert:due", "status": "delivered",
            "occurrenceId": "due", "occurrenceUpdatedAt": "2026-09-28T10:00:00.000Z",
            "destinationTarget": "notify.mobile_app_test"})
        next_data = copy.deepcopy(data)
        next_data["occurrencesById"]["due"]["updatedAt"] = "2026-09-28T10:01:00.000Z"
        await self.authority._commit_locked(next_data, [], "change-due", "2026-09-28T10:01:00.000Z")
        self.assertIn(("notify", "mobile_app_test", {"message": "clear_notification",
            "data": {"tag": "navet_chore_outbox:alert:due"}}, {"blocking": False}),
            self.hass.services.calls)

    async def test_calendar_projects_bounded_due_events(self):
        data = chores._empty_data()
        data["definitionsById"] = {"dishes": {"id": "dishes", "title": "Do <dishes>"}}
        data["occurrencesById"] = {
            "due": {"id": "due", "definitionId": "dishes", "status": "available",
                "scheduledAt": "2026-09-28T10:00:00.000Z", "dueAt": "2026-09-28T10:00:00.000Z"},
            "skipped": {"id": "skipped", "definitionId": "dishes", "status": "skipped",
                "scheduledAt": "2026-09-28T11:00:00.000Z", "dueAt": "2026-09-28T12:00:00.000Z"},
            "done": {"id": "done", "definitionId": "dishes", "status": "done",
                "scheduledAt": "2026-09-28T11:00:00.000Z", "dueAt": "2026-09-28T12:00:00.000Z"},
        }
        calendar = calendars.NavetChoresCalendar("entry")
        calendar._authority = types.SimpleNamespace(data=data)
        events = await calendar.async_get_events(_Hass(),
            datetime.fromisoformat("2026-09-28T09:00:00+00:00"),
            datetime.fromisoformat("2026-09-28T12:00:00+00:00"))
        self.assertEqual([event.uid for event in events], ["due"])
        self.assertEqual(events[0].summary, "Do <dishes>")
        self.assertGreater(events[0].end, events[0].start)

    async def test_management_pin_can_be_removed_by_an_unlocked_manager(self):
        await self._create_manager()
        session = await self.authority.async_configure_pin(
            "manager", "2468", None, "ha-user-1"
        )

        with self.assertRaisesRegex(
            chores.ChoreAuthorityError,
            "Unlock chore management before removing its PIN",
        ):
            await self.authority.async_remove_pin(
                "manager", "wrong-session", "ha-user-1"
            )

        result = await self.authority.async_remove_pin(
            "manager", session["sessionToken"], "ha-user-1"
        )
        self.assertEqual(result, {"pinConfigured": False})
        self.assertEqual(
            self.authority._public_document()["management"],
            {"pinConfigured": False},
        )
        self.assertNotIn(chores.SECURITY_KEY, _Store.values)

    async def test_service_action_updates_chores_without_a_panel(self):
        await self._create_manager()
        timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        await self.authority.async_command(
            {
                "commandId": "definition-create",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "definition_create",
                    "actorParticipantId": "manager",
                    "definition": {
                        "id": "daily",
                        "title": "Daily chore",
                        "enabled": True,
                        "assignment": {
                            "mode": "person",
                            "participantIds": ["manager"],
                        },
                        "schedule": {
                            "frequency": "once",
                            "date": timestamp[:10],
                            "time": timestamp[11:16],
                            "timeZone": "UTC",
                        },
                        "dueWindowMinutes": 60,
                        "approval": {"required": False, "approverIds": []},
                        "createdAt": timestamp,
                        "updatedAt": timestamp,
                    },
                },
            },
            "ha-user-1",
        )
        await self.authority.async_tick()
        occurrence_id = next(iter(self.authority.data["occurrencesById"]))
        await self.authority.async_service_action(
            "complete",
            {"occurrence_id": occurrence_id, "participant_id": "manager"},
            "ha-context-1",
        )
        self.assertEqual(
            self.authority.data["occurrencesById"][occurrence_id]["status"],
            "done",
        )

    async def test_every_registered_service_action_runs_without_a_panel(self):
        await self._create_manager()
        await self.authority.async_command(
            {
                "commandId": "other-create",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "participant_create",
                    "actorParticipantId": "manager",
                    "participant": _participant("other"),
                },
            },
            "ha-user-1",
        )
        timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        await self.authority.async_command(
            {
                "commandId": "service-definition",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "definition_create",
                    "actorParticipantId": "manager",
                    "definition": {
                        "id": "services",
                        "title": "Service chore",
                        "enabled": True,
                        "assignment": {
                            "mode": "shared",
                            "participantIds": ["manager", "other"],
                        },
                        "schedule": {
                            "frequency": "once",
                            "date": timestamp[:10],
                            "time": timestamp[11:16],
                            "timeZone": "UTC",
                        },
                        "dueWindowMinutes": 60,
                        "approval": {
                            "required": True,
                            "approverIds": ["manager"],
                        },
                        "createdAt": timestamp,
                        "updatedAt": timestamp,
                    },
                },
            },
            "ha-user-1",
        )
        await self.authority.async_tick()
        occurrence_id = next(
            occurrence_id
            for occurrence_id, occurrence in self.authority.data[
                "occurrencesById"
            ].items()
            if occurrence["definitionId"] == "services"
        )

        calls = [
            ("claim", {"participant_id": "manager"}),
            ("complete", {"participant_id": "manager"}),
            ("approve", {"participant_id": "manager"}),
            ("reopen", {"participant_id": "manager", "reason": "Redo"}),
            (
                "reassign",
                {
                    "participant_id": "manager",
                    "assignee_ids": ["other"],
                    "reason": "Swap",
                },
            ),
            ("skip", {"participant_id": "manager", "reason": "Away"}),
            ("reopen", {"participant_id": "manager", "reason": "Back"}),
            ("complete", {"participant_id": "other"}),
            ("reject", {"participant_id": "manager", "reason": "Try again"}),
        ]
        for index, (service, data) in enumerate(calls):
            await self.authority.async_service_action(
                service,
                {"occurrence_id": occurrence_id, **data},
                f"ha-context-{index}",
            )
        self.assertEqual(
            self.authority.data["occurrencesById"][occurrence_id]["status"],
            "available",
        )

    async def test_sensor_restores_and_tracks_the_durable_authority_projection(self):
        self.hass.data["navet"] = {"chore_authority": self.authority}
        await self.authority.async_initialize()
        sensor = sensors.NavetChoresSensor("entry-1")
        _SensorEntity.__init__(sensor)
        sensor.hass = self.hass
        await sensor.async_added_to_hass()
        self.assertEqual(sensor.extra_state_attributes["revision"], 0)

        await self._create_manager()
        self.assertEqual(sensor.extra_state_attributes["revision"], 1)
        self.assertEqual(sensor.write_count, 1)

    async def test_background_reminder_uses_provider_delivery_and_records_delivery(self):
        manager = _participant(
            destination={"type": "provider", "target": "notify.mobile_app_phone"}
        )
        await self.authority.async_command(
            {
                "commandId": "manager-create",
                "baseRevision": 0,
                "action": {"type": "participant_create", "participant": manager},
            },
            "ha-user-1",
        )
        now = datetime.now(timezone.utc)
        timestamp = now.isoformat().replace("+00:00", "Z")
        await self.authority.async_command(
            {
                "commandId": "reminder-definition",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "definition_create",
                    "actorParticipantId": "manager",
                    "definition": {
                        "id": "reminder",
                        "title": "Reminder chore",
                        "enabled": True,
                        "assignment": {
                            "mode": "person",
                            "participantIds": ["manager"],
                        },
                        "schedule": {
                            "frequency": "once",
                            "date": timestamp[:10],
                            "time": timestamp[11:16],
                            "timeZone": "UTC",
                        },
                        "dueWindowMinutes": 0,
                        "approval": {"required": False, "approverIds": []},
                        "reminderPolicy": {
                            "enabled": True,
                            "beforeDueMinutes": [],
                            "atDue": True,
                        },
                        "createdAt": timestamp,
                        "updatedAt": timestamp,
                    },
                },
            },
            "ha-user-1",
        )
        await self.authority.async_tick()
        self.assertTrue(self.hass.services.calls)
        self.assertEqual(self.hass.services.calls[0][0:2], ("notify", "mobile_app_phone"))
        reminders = [
            item
            for item in self.authority.data["outbox"]
            if str(item["eventType"]).startswith("reminder_")
        ]
        self.assertEqual(reminders[0]["status"], "delivered")

    async def test_primary_corruption_restores_and_repairs_last_good_workspace(self):
        await self._create_manager()
        await self.authority.async_command(
            {
                "commandId": "other-create",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "participant_create",
                    "actorParticipantId": "manager",
                    "participant": _participant("other"),
                },
            },
            "ha-user-1",
        )
        _Store.values[chores.WORKSPACE_KEY] = {
            "contractVersion": 1,
            "revision": 99,
            "updatedAt": "2026-08-28T08:00:00.000Z",
            "data": {"schemaVersion": 999},
        }

        recovered = chores.ChoreAuthority(_Hass())
        await recovered.async_initialize()
        self.assertIn("manager", recovered.data["participantsById"])
        self.assertNotIn("other", recovered.data["participantsById"])
        self.assertEqual(
            _Store.values[chores.WORKSPACE_KEY]["data"], recovered.data
        )

        restarted = chores.ChoreAuthority(_Hass())
        await restarted.async_initialize()
        self.assertEqual(restarted.data, recovered.data)

    async def test_unrecoverable_primary_exposes_recovery_and_allows_confirmed_reset(self):
        _Store.values[chores.WORKSPACE_KEY] = {
            "contractVersion": 1,
            "revision": 7,
            "updatedAt": "2026-08-28T08:00:00.000Z",
            "data": {"schemaVersion": 999},
        }
        authority = chores.ChoreAuthority(_Hass())
        await authority.async_initialize()
        with self.assertRaises(chores.ChoreStorageError) as raised:
            await authority.async_handle_ws(
                {"type": "navet/chores/workspace/get"}, "ha-user-1"
            )
        self.assertEqual(raised.exception.code, "workspace_invalid")
        self.assertEqual(authority._recovery["reason"], "workspace_invalid")

        reset = await authority.async_recover(
            {"action": "reset", "confirmation": "RESET CHORES"}, "ha-user-1"
        )
        self.assertEqual(reset["revision"], 8)
        self.assertIsNone(authority._recovery)
        self.assertEqual(authority.data, chores._empty_data())
        self.assertNotIn(chores.LAST_GOOD_KEY, _Store.values)
        self.assertNotIn(chores.HISTORY_KEY, _Store.values)
        self.assertNotIn(chores.JOURNAL_KEY, _Store.values)

    async def test_merge_restore_remaps_collisions_and_never_replays_imported_outbox(self):
        await self._create_manager()
        imported = chores._empty_data()
        imported["participantsById"]["manager"] = {
            **_participant(),
            "displayName": "Imported manager",
        }
        imported["definitionsById"]["shared"] = {
            "id": "shared",
            "title": "Imported chore",
            "enabled": True,
            "assignment": {"mode": "person", "participantIds": ["manager"]},
            "schedule": {
                "frequency": "once",
                "date": "2026-08-29",
                "time": "08:00",
                "timeZone": "UTC",
            },
            "dueWindowMinutes": 60,
            "approval": {"required": False, "approverIds": ["manager"]},
            "createdAt": "2026-08-28T08:00:00.000Z",
            "updatedAt": "2026-08-28T08:00:00.000Z",
        }
        imported["outbox"] = [
            {
                "id": "outbox:imported",
                "activityId": "imported",
                "eventType": "completed",
                "status": "pending",
                "attempts": 0,
                "createdAt": "2026-08-28T08:00:00.000Z",
                "nextAttemptAt": "2026-08-28T08:00:00.000Z",
            }
        ]
        await self.authority.async_restore(
            {
                "commandId": "merge-import",
                "baseRevision": self.authority.revision,
                "actorParticipantId": "manager",
                "mode": "merge",
                "document": {
                    "contract": "navet.chores",
                    "version": 1,
                    "exportedAt": "2026-08-28T08:00:00.000Z",
                    "workspace": imported,
                    "events": [],
                },
            },
            "ha-user-1",
        )
        self.assertIn("manager~import-2", self.authority.data["participantsById"])
        imported_definition = next(
            item
            for item in self.authority.data["definitionsById"].values()
            if item["title"] == "Imported chore"
        )
        self.assertEqual(
            imported_definition["assignment"]["participantIds"],
            ["manager~import-2"],
        )
        self.assertNotIn(
            "outbox:imported",
            {item["id"] for item in self.authority.data["outbox"]},
        )

    async def test_notification_failure_is_retained_and_retried(self):
        self.hass.services.error = RuntimeError("Home Assistant unavailable")
        manager = _participant(
            destination={"type": "home_assistant", "target": "mobile_app_phone"}
        )
        await self.authority.async_command(
            {
                "commandId": "manager-create",
                "baseRevision": 0,
                "action": {"type": "participant_create", "participant": manager},
            },
            "ha-user-1",
        )
        now = datetime.now(timezone.utc)
        timestamp = now.isoformat().replace("+00:00", "Z")
        await self.authority.async_command(
            {
                "commandId": "retry-definition",
                "baseRevision": self.authority.revision,
                "action": {
                    "type": "definition_create",
                    "actorParticipantId": "manager",
                    "definition": {
                        "id": "retry",
                        "title": "Retry chore",
                        "enabled": True,
                        "assignment": {"mode": "person", "participantIds": ["manager"]},
                        "schedule": {"frequency": "once", "date": timestamp[:10], "time": timestamp[11:16], "timeZone": "UTC"},
                        "dueWindowMinutes": 0,
                        "approval": {"required": False, "approverIds": []},
                        "reminderPolicy": {"enabled": True, "beforeDueMinutes": [], "atDue": True},
                        "createdAt": timestamp,
                        "updatedAt": timestamp,
                    },
                },
            },
            "ha-user-1",
        )
        await self.authority.async_tick()
        reminder = next(
            item
            for item in self.authority.data["outbox"]
            if str(item["eventType"]).startswith("reminder_")
        )
        self.assertEqual(reminder["status"], "failed")
        self.assertGreaterEqual(reminder["attempts"], 1)

        self.hass.services.error = None
        reminder["nextAttemptAt"] = "2026-01-01T00:00:00.000Z"
        await self.authority._deliver_pending()
        reminder = next(
            item
            for item in self.authority.data["outbox"]
            if item["id"] == reminder["id"]
        )
        self.assertEqual(reminder["status"], "delivered")


if __name__ == "__main__":
    unittest.main()
