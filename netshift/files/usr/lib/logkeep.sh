#!/bin/sh
# shellcheck shell=ash
#
# PostQ: keeps the log of NetShift and sing-box on flash for NETSHIFT_LOG_KEEP_DAYS
# days (the netshift-log service). The system log is a small ring buffer in RAM:
# a few hundred lines and nothing after a reboot. This follows it and appends
# every line of netshift and sing-box to NETSHIFT_LOG_FILE as
#   2026-10-26 05:18:54 daemon.err sing-box[9508]: WARN ...
# (the time of the system log, the colour codes of sing-box taken out). Once an
# hour, and when it starts, the lines older than the limit are dropped.
#
# On a restart `logread -f` prints the whole buffer again: the lines older than
# the last one already in the file are skipped. At boot the clock starts at the
# newest file of /etc (sysfixtime), which this file is one of, so a fresh line is
# never older than the file.
#
# Usage: logkeep.sh         follow the system log (the service)
#        logkeep.sh trim    drop the old lines once and exit

# shellcheck disable=SC1091
. /usr/lib/netshift/constants.sh

LOG_FILE="$NETSHIFT_LOG_FILE"
KEEP_SECONDS=$((NETSHIFT_LOG_KEEP_DAYS * 86400))

# Drops the lines older than the limit. The file is rewritten through a temporary
# copy next to it, so a cut-short write never loses the log.
logkeep_trim() {
    local tmp="$LOG_FILE.tmp"

    [ -f "$LOG_FILE" ] || return 0
    awk -v keep="$KEEP_SECONDS" '
        BEGIN { cutoff = strftime("%Y-%m-%d %H:%M:%S", systime() - keep) }
        substr($0, 1, 19) >= cutoff
    ' "$LOG_FILE" > "$tmp" && mv "$tmp" "$LOG_FILE"
    rm -f "$tmp"
}

logkeep_follow() {
    mkdir -p "${LOG_FILE%/*}"
    logkeep_trim

    # The children (logread and awk) go with the service when procd stops it.
    trap 'kill 0' TERM INT

    logread -f | awk -v file="$LOG_FILE" -v keep="$KEEP_SECONDS" -v self="$0" '
        BEGIN {
            split("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec", names, " ")
            for (i = 1; i <= 12; i++) month[names[i]] = sprintf("%02d", i)
            last = ""
            while ((getline line < file) > 0) last = substr(line, 1, 19)
            close(file)
            trimmed = systime()
        }
        # Mon Oct 26 05:18:54 2026 daemon.err sing-box[9508]: message
        $7 ~ /^(netshift|sing-box)(\[[0-9]+\])?:$/ {
            stamp = sprintf("%s-%s-%02d %s", $5, month[$2], $3, $4)
            if (stamp < last) next
            line = $0
            sub(/^[A-Za-z]+ +[A-Za-z]+ +[0-9]+ +[0-9:]+ +[0-9]+ +/, "", line)
            gsub(/\033\[[0-9;]*m/, "", line)
            print stamp " " line >> file
            fflush(file)
            if (systime() - trimmed >= 3600) {
                close(file)
                system("sh \"" self "\" trim")
                trimmed = systime()
            }
        }
    '
}

case "${1:-}" in
trim) logkeep_trim ;;
*) logkeep_follow ;;
esac
