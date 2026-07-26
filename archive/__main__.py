"""Command line for the Archive. Invoked by bin/archive, which has already decided where the
Archive lives and refused if that is the wrong disk."""

import os
import sys

from mirror import (
    Unavailable,
    disk_usage,
    free_space,
    mirror_session,
    mirror_year,
    session_paths,
)


def _session_path(year: int, meeting_key: int, session_key: int) -> str:
    for meeting, session, path in session_paths(year):
        if (meeting, session) == (meeting_key, session_key):
            return path
    raise SystemExit(
        f"Formula 1 does not advertise Meeting {meeting_key} Session {session_key} in {year}."
    )


def main(argv: list[str]) -> int:
    root = os.environ["F1_ARCHIVE_HOME"]
    year = int(argv[0])

    if len(argv) == 3:
        path = _session_path(year, int(argv[1]), int(argv[2]))
        try:
            mirror_session(root, path)
        except Unavailable as unavailable:
            # Indexed but not served — 2018 is the whole season like this. Nothing is wrong with
            # the run and retrying will not help, so say so and stop rather than fail.
            print(f"Formula 1 no longer serves {path}\n  {unavailable}", file=sys.stderr)
            return 1
    else:
        summary = mirror_year(root, year)
        if summary.get("unavailable") is True:
            return 1
        print(
            f"\n{summary['year']}: {summary['mirrored']} mirrored, "
            f"{summary['already_held']} already held, "
            f"{summary['unavailable']} no longer served"
        )

    print(
        f"Archive now {disk_usage(root) / 1073741824:.2f} GB; "
        f"{free_space(root) / 1073741824:.0f} GB free on the volume"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        # Interruption is expected and safe: the manifest is written last, so whatever Session was
        # in flight is simply not claimed and the next run fetches it again.
        print("\nStopped. Run the same command again to carry on.", file=sys.stderr)
        sys.exit(130)
