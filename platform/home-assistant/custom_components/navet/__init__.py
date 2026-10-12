"""Home Assistant integration for the native Navet panel."""

from __future__ import annotations

import ipaddress
from pathlib import Path
from urllib.parse import urlsplit
from .resource_paths import compatibility_resource_path

from aiohttp import web
import voluptuous as vol
from homeassistant.components import panel_custom
from homeassistant.components.frontend import async_remove_panel
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.service import async_register_admin_service
import homeassistant.helpers.config_validation as cv

from .chore_store import (
    ChoreAuthority,
    ChoreAuthorityError,
    register_chore_websocket_commands,
)
from .const import (
    CHORE_ACTIONS,
    DOMAIN,
    FRONTEND_MODULE_URL,
    HA_PROXY_PATH,
    PANEL_COMPONENT_NAME,
    PANEL_FRONTEND_PATH,
    PANEL_ICON,
    PANEL_TITLE,
    RSS_PROXY_PATH,
    STATIC_PATH,
)

MAX_FEED_BYTES = 1024 * 1024
RSS_ACCEPT_HEADER = "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9"
RSS_USER_AGENT = "Navet RSS Reader/1.0"
XML_CONTENT_TYPES = (
    "application/rss+xml",
    "application/atom+xml",
    "application/xml",
    "text/xml",
)
PRIVATE_HOSTNAMES = {"localhost", "localhost.", "0.0.0.0"}


def _json_error(status: int, message: str) -> web.Response:
    """Return a no-store JSON error response."""
    return web.json_response(
        {"error": message},
        status=status,
        headers={"Cache-Control": "no-store"},
    )


def _is_private_ip_address(hostname: str) -> bool:
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return False

    return (
        address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_unspecified
    )


def _is_blocked_hostname(hostname: str) -> bool:
    normalized_hostname = hostname.lower()
    return (
        normalized_hostname in PRIVATE_HOSTNAMES
        or normalized_hostname.endswith(".local")
        or _is_private_ip_address(normalized_hostname)
    )


def _is_xml_content_type(content_type: str | None) -> bool:
    if not content_type:
        return False

    media_type = content_type.split(";", 1)[0].strip().lower()
    return media_type in XML_CONTENT_TYPES or media_type.endswith("+xml")


class NavetRSSProxyView(HomeAssistantView):
    """Same-origin RSS fetch proxy for the native panel."""

    url = RSS_PROXY_PATH
    name = "api:navet:rss_proxy"
    requires_auth = False

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the RSS proxy view."""
        self._hass = hass

    async def get(self, request: web.Request) -> web.Response:
        """Fetch an HTTPS RSS/Atom feed and return it to the panel."""
        target_url = request.query.get("url", "").strip()

        if not target_url:
            return _json_error(400, "Missing url query parameter")

        parsed_url = urlsplit(target_url)
        if parsed_url.scheme != "https":
            return _json_error(400, "Only HTTPS feeds are allowed")

        if not parsed_url.hostname:
            return _json_error(400, "Invalid feed URL")

        if _is_blocked_hostname(parsed_url.hostname):
            return _json_error(400, "Private feed hosts are not allowed")

        session = async_get_clientsession(self._hass)
        try:
            async with session.get(
                target_url,
                headers={
                    "Accept": RSS_ACCEPT_HEADER,
                    "User-Agent": RSS_USER_AGENT,
                },
            ) as response:
                if not 200 <= response.status < 300:
                    return _json_error(
                        502,
                        f"Upstream feed request failed with status {response.status}",
                    )

                content_type = response.headers.get("Content-Type")
                if not _is_xml_content_type(content_type):
                    return _json_error(
                        502,
                        "Upstream feed returned an unsupported content type",
                    )

                try:
                    content_length = int(response.headers.get("Content-Length") or "0")
                except ValueError:
                    content_length = 0
                if content_length > MAX_FEED_BYTES:
                    return _json_error(502, "Upstream feed is too large")

                body = bytearray()
                async for chunk in response.content.iter_chunked(64 * 1024):
                    body.extend(chunk)
                    if len(body) > MAX_FEED_BYTES:
                        return _json_error(502, "Upstream feed is too large")

                if len(body) > MAX_FEED_BYTES:
                    return _json_error(502, "Upstream feed is too large")

                return web.Response(
                    body=bytes(body),
                    headers={
                        "Cache-Control": "no-store",
                        "Content-Type": content_type,
                        "Referrer-Policy": "strict-origin-when-cross-origin",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
        except Exception:
            return _json_error(502, "Unable to load feed")


class NavetHomeAssistantProxyCompatibilityView(HomeAssistantView):
    """Redirect legacy panel resource proxy URLs back to Home Assistant."""

    url = f"{HA_PROXY_PATH}/{{requested_path:.*}}"
    name = "api:navet:ha_proxy_compat"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        """Redirect proxied HA resource requests to their native same-origin path."""
        requested_path = request.match_info.get("requested_path", "")

        target = compatibility_resource_path(requested_path)
        if target is None:
            return _json_error(400, "Invalid Home Assistant resource path")

        if request.query_string:
            target = target + "?" + request.query_string

        raise web.HTTPFound(target)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Navet from a config entry."""
    frontend_dir = Path(__file__).parent / "frontend"
    domain_data = hass.data.setdefault(DOMAIN, {})

    authority = domain_data.get("chore_authority")
    if not isinstance(authority, ChoreAuthority):
        authority = ChoreAuthority(hass)
        domain_data["chore_authority"] = authority
    await authority.async_start()

    if not domain_data.get("chore_websocket_registered"):
        register_chore_websocket_commands(hass)
        domain_data["chore_websocket_registered"] = True

    if not domain_data.get("static_path_registered"):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    STATIC_PATH,
                    str(frontend_dir),
                    # The panel entrypoint is an unversioned module URL. Avoid stale HA/browser
                    # caches serving an older navet-panel.js after integration updates.
                    cache_headers=False,
                )
            ]
        )
        domain_data["static_path_registered"] = True

    if not domain_data.get("proxy_views_registered"):
        hass.http.register_view(NavetRSSProxyView(hass))
        hass.http.register_view(NavetHomeAssistantProxyCompatibilityView())
        domain_data["proxy_views_registered"] = True

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_FRONTEND_PATH,
        webcomponent_name=PANEL_COMPONENT_NAME,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=FRONTEND_MODULE_URL,
        embed_iframe=True,
        config={"integration": DOMAIN},
    )

    if not domain_data.get("chore_services_registered"):
        async def async_handle_chore_action(call: ServiceCall) -> dict | None:
            """Apply an authenticated Home Assistant action to durable chores."""
            try:
                result = await authority.async_service_action(
                    call.service,
                    call.data,
                    str(call.context.id),
                )
                return result if call.service == "weekly_report" else None
            except ChoreAuthorityError as err:
                raise HomeAssistantError(str(err)) from err

        base_fields = {
            vol.Required("occurrence_id"): cv.string,
            vol.Required("participant_id"): cv.string,
            vol.Optional("expected_occurrence_updated_at"): cv.string,
        }
        for action in CHORE_ACTIONS:
            fields = {} if action in ("reward_decision", "adjust_points", "weekly_report") else dict(base_fields)
            if action in ("reject", "skip", "reopen", "reassign"):
                fields[vol.Required("reason")] = cv.string
            if action == "reassign":
                fields[vol.Required("assignee_ids")] = vol.All(cv.ensure_list, [cv.string])
            if action == "reward_decision":
                fields = {
                    vol.Required("request_id"): cv.string,
                    vol.Required("manager_participant_id"): cv.string,
                    vol.Required("decision"): vol.In(("approve", "decline", "fulfill", "refund")),
                    vol.Optional("reason"): cv.string,
                }
            if action == "adjust_points":
                fields = {
                    vol.Required("command_id"): cv.string,
                    vol.Required("participant_id"): cv.string,
                    vol.Required("manager_participant_id"): cv.string,
                    vol.Required("points_delta"): vol.All(vol.Coerce(int), vol.Range(min=-10000, max=10000)),
                    vol.Optional("reason"): cv.string,
                }
            if action == "weekly_report":
                fields = {vol.Optional("format", default="markdown"): vol.In(("markdown", "html"))}
            if action in ("reward_decision", "adjust_points"):
                async_register_admin_service(hass, DOMAIN, action, async_handle_chore_action, vol.Schema(fields))
            else:
                hass.services.async_register(
                    DOMAIN,
                    action,
                    async_handle_chore_action,
                    schema=vol.Schema(fields),
                    **({"supports_response": SupportsResponse.ONLY} if action == "weekly_report" else {}),
                )
        domain_data["chore_services_registered"] = True

    await hass.config_entries.async_forward_entry_setups(entry, [Platform.SENSOR, Platform.CALENDAR])

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Navet."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, [Platform.SENSOR, Platform.CALENDAR])
    async_remove_panel(hass, PANEL_FRONTEND_PATH, warn_if_unknown=False)
    authority = hass.data.get(DOMAIN, {}).get("chore_authority")
    if isinstance(authority, ChoreAuthority):
        await authority.async_stop()
    domain_data = hass.data.get(DOMAIN, {})
    if domain_data.get("chore_services_registered"):
        for action in CHORE_ACTIONS:
            hass.services.async_remove(DOMAIN, action)
        domain_data["chore_services_registered"] = False
    domain_data.pop("chore_authority", None)
    return unloaded
