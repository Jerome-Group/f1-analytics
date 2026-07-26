"""The Archive: this project's copy of the raw files Formula 1 publishes.

Reached through bin/archive, which places it on the external volume before calling in here.

Two properties this module exists to guarantee, both of them about interruption. Eleven thousand
requests will not complete in one run, so a second run must know precisely what the first one
finished — and a file that arrived short must never pass for one that arrived whole, because a
truncated stream still parses and the hole only shows up in a Session nobody can re-download.

Standard library only, on purpose: an Archive that needs a package installed before it can be
rebuilt is one more thing between a dead disk and the data.
"""

import json
import re
import shutil
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "https://livetiming.formula1.com/static"

# Written by us, into a tree that is otherwise byte-for-byte Formula 1's. The leading dot and the
# project name keep it from ever colliding with a name upstream might publish.
MANIFEST = ".f1-archive-manifest.json"

# Formula 1 serves the archive to browsers and to curl, and 403s some clients. This is the one
# that works, and it is not an attempt to look like something it is not.
USER_AGENT = "curl/8.7.1"

_TIMEOUT = 60


class Unavailable(Exception):
    """Formula 1 no longer serves this. 2018 and 2022 are both gone; a mirror run meets them as
    a 403 and must report them rather than treat them as a failed download worth retrying."""


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            raise Unavailable(f"{url} -> HTTP {error.code}") from error
        raise


def load_index(path: str) -> dict:
    """A path here is Formula 1's own — a year, or a Session's dated directory."""
    return json.loads(fetch(f"{BASE_URL}/{path}Index.json").decode("utf-8-sig"))


def plan_session(index: dict) -> list[str]:
    """Every file a Session's index advertises, as paths relative to the Session.

    Both kinds of path are taken. `StreamPath` is the append-log the Ingestors read; `KeyFramePath`
    is the snapshot beside it, which OpenF1 ignores and which is therefore exactly the sort of
    thing this Archive exists to keep.
    """
    files = set()
    for feed in index.get("Feeds", {}).values():
        for key in ("StreamPath", "KeyFramePath"):
            if feed.get(key):
                files.add(feed[key])
    return sorted(files)


def plan_team_radio(stream: str) -> list[str]:
    """The audio a Session's TeamRadio stream points at.

    It is referenced from inside a stream rather than advertised in the index, so nothing that
    reads the index alone will find it — and OpenF1's `team_radio` collection stores only a URL
    back to Formula 1, which is why these have to be here rather than linked.
    """
    return sorted(set(re.findall(r'"Path":"([^"]+\.mp3)"', stream)))


def read_manifest(session_dir: Path) -> dict | None:
    try:
        return json.loads((Path(session_dir) / MANIFEST).read_text())
    except (FileNotFoundError, NotADirectoryError, json.JSONDecodeError):
        return None


def is_complete(session_dir) -> bool:
    """Whether this Session is wholly here — claimed complete, and every file the size it was.

    Size rather than a checksum: Formula 1 serves `Content-Length` for every file, so a size
    comparison catches the truncation that actually happens without a second pass over 15 GB.
    """
    manifest = read_manifest(Path(session_dir))
    if manifest is None or not manifest.get("complete"):
        return False

    for name, size in manifest.get("files", {}).items():
        candidate = Path(session_dir) / name
        if not candidate.is_file() or candidate.stat().st_size != size:
            return False
    return True


def _write(destination: Path, content: bytes) -> int:
    """Whole file or no file. A partial write that survives is the one thing `is_complete` cannot
    see through, because the manifest is written last and would simply never mention it."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".partial")
    partial.write_bytes(content)
    partial.replace(destination)
    return len(content)


def mirror_session(root, session_path: str, log=print) -> dict:
    """One Session, whole, into `root/<Formula 1's own path>`.

    The tree mirrors Formula 1's layout exactly, so the Archive can later be served back to
    anything that expects the real thing without a translation step.
    """
    session_dir = Path(root) / session_path
    if is_complete(session_dir):
        log(f"  have  {session_path}")
        return {"path": session_path, "skipped": True}

    index = load_index(session_path)
    wanted = plan_session(index)

    files = {}
    for name in wanted:
        files[name] = _write(session_dir / name, fetch(f"{BASE_URL}/{session_path}{name}"))

    radio_stream = session_dir / "TeamRadio.jsonStream"
    if radio_stream.is_file():
        for clip in plan_team_radio(radio_stream.read_text(errors="replace")):
            try:
                files[clip] = _write(
                    session_dir / clip, fetch(f"{BASE_URL}/{session_path}{clip}")
                )
            except Unavailable:
                # A clip Formula 1 has dropped is not a reason to fail the Session; the manifest
                # simply will not claim it, so a later run tries again.
                log(f"  gone  {session_path}{clip}")

    # Last, and only now: the manifest is the claim that everything above arrived.
    (session_dir / MANIFEST).write_text(
        json.dumps({"complete": True, "path": session_path, "files": files}, indent=1)
    )

    total = sum(files.values())
    log(f"  got   {session_path}  {len(files)} files, {total / 1048576:.1f} MB")
    return {"path": session_path, "files": len(files), "bytes": total}


def session_paths(year: int) -> list[tuple[int, int, str]]:
    """Every Session of a year that Formula 1 still advertises a path for."""
    index = load_index(f"{year}/")
    found = []
    for meeting in index.get("Meetings", []):
        for session in meeting.get("Sessions", []):
            if session.get("Path"):
                found.append((meeting["Key"], session["Key"], session["Path"]))
    return found


def mirror_year(root, year: int, log=print) -> dict:
    try:
        sessions = session_paths(year)
    except Unavailable:
        log(f"{year}: Formula 1 no longer serves this year")
        return {"year": year, "unavailable": True}

    _write(Path(root) / f"{year}/Index.json", fetch(f"{BASE_URL}/{year}/Index.json"))
    log(f"{year}: {len(sessions)} sessions")

    done, skipped, gone, size = 0, 0, 0, 0
    for _, _, path in sessions:
        try:
            result = mirror_session(root, path, log=log)
        except Unavailable as unavailable:
            log(f"  gone  {unavailable}")
            gone += 1
            continue
        if result.get("skipped"):
            skipped += 1
        else:
            done += 1
            size += result.get("bytes", 0)

    return {
        "year": year,
        "mirrored": done,
        "already_held": skipped,
        "unavailable": gone,
        "bytes": size,
    }


def disk_usage(root) -> int:
    return sum(f.stat().st_size for f in Path(root).rglob("*") if f.is_file())


def free_space(root) -> int:
    return shutil.disk_usage(root).free
