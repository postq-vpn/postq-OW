#!/bin/sh
# shellcheck shell=ash
#
# PostQ: keeps the log of PostQ and sing-box on flash for POSTQ_LOG_KEEP_DAYS
# days (the postq-log service). The system log is a small ring buffer in RAM:
# a few hundred lines and nothing after a reboot. This follows it and appends
# every line of postq and sing-box to POSTQ_LOG_FILE as
#   2026-10-26 05:18:54 daemon.err sing-box[9508]: WARN ...
# (the time of the system log, the colour codes of sing-box taken out). Once an
# hour, when it starts and when the file reaches its size limit, the lines older
# than the limit of days are dropped and the file is cut to half of its size limit.
#
# On a restart `logread -f` prints the whole buffer again: the lines older than
# the last one already in the file are skipped. At boot the clock starts at the
# newest file of /etc (sysfixtime), which this file is one of, so a fresh line is
# never older than the file.
#
# Usage: logkeep.sh         follow the system log (the service)
#        logkeep.sh trim    drop the old lines once and exit

# shellcheck disable=SC1091
. /usr/lib/postq/constants.sh

LOG_FILE="$POSTQ_LOG_FILE"
KEEP_SECONDS=$((POSTQ_LOG_KEEP_DAYS * 86400))

FIFO=/var/run/postq-logkeep.fifo

# The size limit of the file in bytes: POSTQ_LOG_MAX_KB, or a quarter of the
# flash the log may use (free now plus the file itself) when that is less, so a
# small flash keeps room for the configuration.
logkeep_limit() {
    local free_kb used_kb limit_kb

    free_kb="$(df -Pk "${LOG_FILE%/*}" 2> /dev/null | awk 'NR == 2 { print $4 }')"
    used_kb=$(($(wc -c < "$LOG_FILE" 2> /dev/null || echo 0) / 1024))
    limit_kb=$(((${free_kb:-0} + used_kb) / 4))
    [ "$limit_kb" -le "$POSTQ_LOG_MAX_KB" ] || limit_kb="$POSTQ_LOG_MAX_KB"
    [ "$limit_kb" -ge 64 ] || limit_kb=64
    echo $((limit_kb * 1024))
}

# Drops the old lines and cuts the file to half of the limit. The new content is
# made in RAM, so this also works when the flash is full, and the file is written
# only when it changed.
logkeep_trim() {
    local tmp

    [ -f "$LOG_FILE" ] || return 0
    tmp="$(mktemp /tmp/postq-log.XXXXXX)" || return 0
    if awk -v keep="$KEEP_SECONDS" '
        BEGIN { cutoff = strftime("%Y-%m-%d %H:%M:%S", systime() - keep) }
        substr($0, 1, 19) >= cutoff
    ' "$LOG_FILE" | tail -c "$(($(logkeep_limit) / 2))" |
        sed '1{/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\} /!d}' > "$tmp" &&
        [ "$(wc -c < "$tmp")" != "$(wc -c < "$LOG_FILE")" ]; then
        cat "$tmp" > "$LOG_FILE"
    fi
    rm -f "$tmp"
}

logkeep_follow() {
    local reader="" writer="" pid pipe other

    mkdir -p "${LOG_FILE%/*}"
    logkeep_trim

    # An earlier version left its awk running when it was stopped, writing to a
    # file replaced since. Its logread is the one writing to that awk's pipe; any
    # other `logread -f` (the system log service has one) is not ours.
    for pid in $(pgrep -f "awk -v file=$LOG_FILE"); do
        pipe="$(readlink "/proc/$pid/fd/0")"
        for other in $(pgrep -f "logread -f"); do
            [ "$(readlink "/proc/$other/fd/1")" != "$pipe" ] || kill "$other" 2> /dev/null
        done
        kill "$pid" 2> /dev/null
    done

    rm -f "$FIFO"
    mkfifo "$FIFO" || exit 1

    # The children go with the service when procd stops it. ash runs a trap only
    # when the foreground command ends, so they wait in the background. Never
    # `kill 0`: procd's children share the process group of PID 1, for which
    # SIGTERM means a reboot.
    trap 'kill "$reader" "$writer" 2> /dev/null; rm -f "$FIFO"; exit 0' TERM INT

    awk -v file="$LOG_FILE" -v keep="$KEEP_SECONDS" -v self="$0" -v max="$(logkeep_limit)" \
        -v size="$(wc -c < "$LOG_FILE" 2> /dev/null || echo 0)" '
        BEGIN {
            split("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec", names, " ")
            for (i = 1; i <= 12; i++) month[names[i]] = sprintf("%02d", i)
            last = ""
            while ((getline line < file) > 0) last = substr(line, 1, 19)
            close(file)
            trimmed = systime()
        }
        # Mon Oct 26 05:18:54 2026 daemon.err sing-box[9508]: message
        $7 ~ /^(postq|sing-box)(\[[0-9]+\])?:$/ {
            stamp = sprintf("%s-%s-%02d %s", $5, month[$2], $3, $4)
            if (stamp < last) next
            line = $0
            sub(/^[A-Za-z]+ +[A-Za-z]+ +[0-9]+ +[0-9:]+ +[0-9]+ +/, "", line)
            gsub(/\033\[[0-9;]*m/, "", line)
            print stamp " " line >> file
            fflush(file)
            size += length(line) + 21
            if (size >= max || systime() - trimmed >= 3600) {
                close(file)
                system("sh \"" self "\" trim")
                trimmed = systime()
                count = "wc -c < \"" file "\""
                count | getline size
                close(count)
            }
        }
    ' < "$FIFO" &
    writer=$!
    logread -f > "$FIFO" &
    reader=$!

    wait "$writer"
    kill "$reader" 2> /dev/null
    rm -f "$FIFO"
}

case "${1:-}" in
trim) logkeep_trim ;;
*) logkeep_follow ;;
esac
