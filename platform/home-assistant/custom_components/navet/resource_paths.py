"""Same-origin paths accepted by the legacy Home Assistant resource redirect."""


def compatibility_resource_path(requested_path: str) -> str | None:
    """Reject authority-relative URLs and ambiguous path separators."""
    if (
        ".." in requested_path.split("/")
        or requested_path.startswith(("/", "\\"))
        or "\\" in requested_path
        or any(ord(character) < 32 or ord(character) == 127 for character in requested_path)
    ):
        return None
    return "/" + requested_path
