# shellcheck shell=bash
# Everything a wrapper needs to know before it may touch the runtime. Sourcing this is the first
# thing every executable in bin/ does, so that no wrapper can be written that knows where half of
# it goes.
# shellcheck source-path=SCRIPTDIR

f1_lib="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=placement.sh
source "$f1_lib/placement.sh"
# shellcheck source=colima.sh
source "$f1_lib/colima.sh"
# shellcheck source=compose-plugin.sh
source "$f1_lib/compose-plugin.sh"
# shellcheck source=openf1-source.sh
source "$f1_lib/openf1-source.sh"
# shellcheck source=mongo.sh
source "$f1_lib/mongo.sh"
