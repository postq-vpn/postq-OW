# shellcheck shell=ash
#
# Snapshots of the PostQ configuration (/etc/config/postq): the last working
# settings can be brought back after a change that broke the service. A snapshot
# is a plain copy of the file in SNAPSHOT_DIR, named "<epoch>-<label>.conf". One is
# taken every time the service starts with a configuration sing-box accepted
# (label "auto"), before a restore (label "before-restore") and on demand
# ("manual"); the newest SNAPSHOT_KEEP are kept, an unchanged configuration does
# not make a new one.

SNAPSHOT_LABELS="auto manual before-restore"

# Is the snapshot id one we could have written? "<digits>-<label>"
snapshot_id_is_valid() {
    local id="$1"
    local epoch label

    epoch="${id%%-*}"
    label="${id#*-}"
    case "$epoch" in
    '' | *[!0-9]*) return 1 ;;
    esac
    [ "$label" != "$id" ] || return 1
    case " $SNAPSHOT_LABELS " in
    *" $label "*) return 0 ;;
    esac
    return 1
}

snapshot_path() {
    echo "$SNAPSHOT_DIR/$1.conf"
}

# Snapshot ids, newest first.
snapshot_ids() {
    local file name

    [ -d "$SNAPSHOT_DIR" ] || return 0
    for file in "$SNAPSHOT_DIR"/*.conf; do
        [ -f "$file" ] || continue
        name="${file##*/}"
        name="${name%.conf}"
        snapshot_id_is_valid "$name" && echo "$name"
    done | sort -t- -k1,1 -n -r
}

# Keeps the newest SNAPSHOT_KEEP, removes the rest.
snapshot_prune() {
    local count=0 id

    for id in $(snapshot_ids); do
        count=$((count + 1))
        [ "$count" -gt "$SNAPSHOT_KEEP" ] && rm -f "$(snapshot_path "$id")"
    done
}

# Takes a snapshot of the configuration. $1 - label (default manual), $2 - "force"
# to take it even when the newest one is identical.
# Prints {"ok":true,"id":"..."} (id empty when nothing was needed) or an error.
snapshot_save() {
    local label="${1:-manual}"
    local force="$2"
    local source="$POSTQ_CONFIG_FILE"
    local newest id tmp now

    case " $SNAPSHOT_LABELS " in
    *" $label "*) ;;
    *)
        jq -n -c '{error: "unknown label"}'
        return 1
        ;;
    esac
    if [ ! -s "$source" ]; then
        jq -n -c '{error: "there is no configuration to save"}'
        return 1
    fi

    (umask 077 && mkdir -p "$SNAPSHOT_DIR") 2> /dev/null || {
        jq -n -c '{error: "cannot create the snapshot directory"}'
        return 1
    }

    newest="$(snapshot_ids | sed -n '1p')"
    if [ "$force" != "force" ] && [ -n "$newest" ] && cmp -s "$source" "$(snapshot_path "$newest")"; then
        jq -n -c --arg id "$newest" '{ok: true, id: "", unchanged: $id}'
        return 0
    fi

    # The id starts with the time. A clock that is behind (a router without time
    # sync at boot) must not make a new snapshot older than the newest one, or the
    # pruning would drop the wrong ones: the id is then the newest time plus one.
    # Two snapshots in the same second keep their order the same way.
    now="$(date +%s)"
    if [ -n "$newest" ] && [ "$now" -le "${newest%%-*}" ]; then
        now=$((${newest%%-*} + 1))
    fi
    id="$now-$label"
    while [ -e "$(snapshot_path "$id")" ]; do
        now=$((now + 1))
        id="$now-$label"
    done

    # the configuration holds proxy links and passwords: the copy is private from the start
    tmp="$(snapshot_path "$id").tmp.$$"
    if ! (umask 077 && cp "$source" "$tmp") || ! mv "$tmp" "$(snapshot_path "$id")"; then
        rm -f "$tmp"
        jq -n -c '{error: "cannot write the snapshot"}'
        return 1
    fi
    snapshot_prune

    jq -n -c --arg id "$id" '{ok: true, id: $id}'
}

# {"snapshots":[{"id","time","label","size","current"}]}, newest first; "current"
# marks the one equal to the configuration now.
snapshot_list() {
    local id file result="[]" epoch label size current

    for id in $(snapshot_ids); do
        file="$(snapshot_path "$id")"
        epoch="${id%%-*}"
        label="${id#*-}"
        size="$(wc -c < "$file" | tr -d ' ')"
        current=false
        cmp -s "$file" "$POSTQ_CONFIG_FILE" && current=true
        result="$(printf '%s' "$result" | jq -c --arg id "$id" --argjson time "$epoch" --arg label "$label" \
            --argjson size "$size" --argjson current "$current" \
            '. + [{id: $id, time: $time, label: $label, size: $size, current: $current}]')"
    done

    jq -n -c --argjson snapshots "$result" '{snapshots: $snapshots}'
}

# Is the file a PostQ configuration UCI can read, with the settings section?
snapshot_file_is_usable() {
    local file="$1"
    local dir

    dir="$(mktemp -d)" || return 1
    cp "$file" "$dir/postq"
    if uci -c "$dir" -q show postq 2> /dev/null | grep -q '^postq\.settings=settings$'; then
        rm -rf "$dir"
        return 0
    fi
    rm -rf "$dir"
    return 1
}

# Brings a snapshot back. The configuration it replaces is kept first (label
# before-restore). The service is not restarted here: the caller does that.
snapshot_restore() {
    local id="$1"
    local file tmp

    if ! snapshot_id_is_valid "$id"; then
        jq -n -c '{error: "invalid snapshot id"}'
        return 1
    fi
    file="$(snapshot_path "$id")"
    if [ ! -f "$file" ]; then
        jq -n -c '{error: "no such snapshot"}'
        return 1
    fi
    if ! snapshot_file_is_usable "$file"; then
        jq -n -c '{error: "the snapshot is not a usable configuration"}'
        return 1
    fi

    snapshot_save before-restore force > /dev/null 2>&1

    tmp="$POSTQ_CONFIG_FILE.restore.$$"
    if ! (umask 077 && cp "$file" "$tmp") || ! mv "$tmp" "$POSTQ_CONFIG_FILE"; then
        rm -f "$tmp"
        jq -n -c '{error: "cannot write the configuration"}'
        return 1
    fi
    # changes staged in LuCI but not applied belong to the old configuration
    uci -q revert postq > /dev/null 2>&1

    jq -n -c --arg id "$id" '{ok: true, restored: $id}'
}

# PostQ: the question of the page about the routing and DNS the first install found
# (its subscriptions have already moved to the profile).

# Prints the sections in use in the saved configuration; $1 - directory holding it as "postq".
postq_backup_sections() {
    local s

    for s in $(uci -c "$1" -q show postq 2> /dev/null | sed -n "s/^postq\.\([^.=]*\)=section$/\1/p"); do
        case "$(uci -c "$1" -q get "postq.$s.disabled")" in
        1 | on | true | yes | enabled) ;;
        *) echo "$s" ;;
        esac
    done
}

# Is the DNS of the saved configuration the user's, not the package's default?
# $1 - directory holding it as "postq"
postq_backup_has_own_dns() {
    uci -c "$1" -q show postq.settings | grep -E '\.(dns_[a-z_]+|bootstrap_dns_server)=' |
        grep -qvE "\.(dns_type='udp'|dns_server='77\.88\.8\.8'|bootstrap_dns_server='77\.88\.8\.8'|dns_rewrite_ttl='60'|dns_client_subnet=''|dns_client_subnet_auto='0'|dns_client_subnet_interface='')$"
}

# Prints the items of a section's list and of its text form, one word each.
# $1 - directory, $2 - section, $3 - list option, $4 - text option (optional)
postq_backup_items() {
    uci -c "$1" -q get "postq.$2.$3" 2> /dev/null
    [ -z "$4" ] && return 0
    uci -c "$1" -q get "postq.$2.$4" 2> /dev/null | sed 's#//.*##' | tr ', \011\015' '\n\n\n\n'
}

# The routing and DNS of a configuration as JSON; $1 - directory holding it as "postq".
postq_backup_view() {
    local dir="$1"
    local s vpn_domains="" vpn_subnets="" vpn_lists="" direct_domains="" direct_subnets="" rules=""

    set -f
    for s in $(postq_backup_sections "$dir"); do
        case "$(uci -c "$dir" -q get "postq.$s.connection_type")" in
        proxy | vpn)
            vpn_domains="$vpn_domains $(postq_backup_items "$dir" "$s" user_domains user_domains_text)"
            vpn_subnets="$vpn_subnets $(postq_backup_items "$dir" "$s" user_subnets user_subnets_text)"
            vpn_lists="$vpn_lists $(postq_backup_items "$dir" "$s" community_lists)"
            ;;
        exclusion)
            direct_domains="$direct_domains $(postq_backup_items "$dir" "$s" user_domains user_domains_text)"
            direct_subnets="$direct_subnets $(postq_backup_items "$dir" "$s" user_subnets user_subnets_text)"
            ;;
        block | dns) rules="$rules $s" ;;
        esac
    done
    set +f

    jq -n -c --arg vd "$vpn_domains" --arg vs "$vpn_subnets" --arg vl "$vpn_lists" \
        --arg dd "$direct_domains" --arg ds "$direct_subnets" --arg rules "$rules" \
        --arg dns "$(uci -c "$dir" -q get postq.settings.dns_type)://$(uci -c "$dir" -q get postq.settings.dns_server)" \
        --arg bootstrap "$(uci -c "$dir" -q get postq.settings.bootstrap_dns_server)" \
        'def words: split("\n") | map(split(" ")) | add // [] | map(select(. != "")) | unique;
        {dns: $dns, bootstrap: $bootstrap, rules: ($rules | words),
            vpn: {domains: ($vd | words), subnets: ($vs | words), lists: ($vl | words)},
            direct: {domains: ($dd | words), subnets: ($ds | words)}}'
}

# {"pending":true,"subscriptions":N,"dns_own":bool,"old":{view},"postq":{view}} while the
# question has not been answered, else {"pending":false}.
postq_backup_status() {
    local dir s subs=0 dns_own=false

    if [ ! -f "$POSTQ_BACKUP_FILE" ] || [ -e "$POSTQ_BACKUP_ASKED" ]; then
        echo '{"pending":false}'
        return 0
    fi

    dir="$(mktemp -d)" || return 1
    cp "$POSTQ_BACKUP_FILE" "$dir/postq"
    set -f
    for s in $(postq_backup_sections "$dir"); do
        # shellcheck disable=SC2046
        set -- $(uci -c "$dir" -q get "postq.$s.subscription_url")
        subs=$((subs + $#))
    done
    set +f
    postq_backup_has_own_dns "$dir" && dns_own=true

    jq -n -c --argjson subs "$subs" --argjson dns_own "$dns_own" \
        --argjson old "$(postq_backup_view "$dir")" --argjson postq "$(postq_backup_view /etc/config)" \
        '{pending: true, subscriptions: $subs, dns_own: $dns_own, old: $old, postq: $postq}'
    rm -rf "$dir"
}

# Keeps the profile as it is. The file stays, the page does not ask again.
postq_backup_dismiss() {
    touch "$POSTQ_BACKUP_ASKED" && echo '{"ok":true}'
}

# Adds $3 to the list $2 of section $1 unless it is there.
postq_backup_add() {
    case " $(uci -q get "postq.$1.$2" | tr '\n' ' ') " in
    *" $3 "*) ;;
    *) uci -q add_list "postq.$1.$2=$3" ;;
    esac
}

# Adds the routing and DNS of the saved configuration to the profile: the lists of a
# proxy or VPN section go to main, of an exclusion section to direct; block and DNS
# sections are copied whole; of the settings, POSTQ_DNS_OPTIONS replace the profile's
# when the DNS is the user's.
# The configuration before this is kept as a snapshot (before-restore). The service
# is not restarted here: the caller does that.
postq_backup_apply() {
    local dir s type target opt value whole="" wanted="routing_excluded_ips"

    if [ ! -f "$POSTQ_BACKUP_FILE" ] || ! snapshot_file_is_usable "$POSTQ_BACKUP_FILE"; then
        jq -n -c '{error: "the saved configuration is not usable"}'
        return 1
    fi

    snapshot_save before-restore force > /dev/null 2>&1

    dir="$(mktemp -d)" || return 1
    sed 's/^package .*/package postq/' "$POSTQ_BACKUP_FILE" > "$dir/postq"
    uci -q revert postq

    set -f
    for s in $(postq_backup_sections "$dir"); do
        type="$(uci -c "$dir" -q get "postq.$s.connection_type")"
        case "$type" in
        proxy | vpn) target=main ;;
        exclusion) target=direct ;;
        block | dns)
            uci -q get "postq.$s" > /dev/null || whole="$whole $s"
            continue
            ;;
        *) continue ;;
        esac
        for opt in $POSTQ_ROUTING_LISTS; do
            for value in $(uci -c "$dir" -q get "postq.$s.$opt"); do
                postq_backup_add "$target" "$opt" "$value"
            done
        done
        for value in $(postq_backup_items "$dir" "$s" nosuchlist user_domains_text); do
            postq_backup_add "$target" user_domains "$value"
        done
        for value in $(postq_backup_items "$dir" "$s" nosuchlist user_subnets_text); do
            postq_backup_add "$target" user_subnets "$value"
        done
    done
    set +f

    # a DNS left at the package's default does not replace the profile's
    postq_backup_has_own_dns "$dir" && wanted="$POSTQ_DNS_OPTIONS"

    # option and list lines of the settings, as uci batch commands
    uci -c "$dir" -q export postq | awk -v wanted=" $wanted " '
        /^config / { on = ($0 == "config settings \047settings\047"); next }
        on && ($1 == "option" || $1 == "list") && index(wanted, " " $2 " ") {
            if (!($2 in seen)) { print "delete postq.settings." $2; seen[$2] = 1 }
            value = $0
            sub(/^[ \t]*[a-z]+[ \t]+[a-z_0-9]+[ \t]+/, "", value)
            print ($1 == "list" ? "add_list" : "set") " postq.settings." $2 "=" value
        }
    ' | uci -q batch
    # every proxy section is now main
    [ -n "$(uci -q get postq.settings.dns_outbound_section)" ] && uci set postq.settings.dns_outbound_section=main
    uci commit postq

    for s in $whole; do
        { echo; uci -c "$dir" -q export postq | awk -v head="config section '$s'" '
            $0 == head { on = 1 }
            on && /^$/ { exit }
            on
        '; } >> "$POSTQ_CONFIG_FILE"
    done
    # direct first and main last, so the rules of what is between them win over main
    uci -q reorder postq.main=99
    uci commit postq
    rm -rf "$dir"
    touch "$POSTQ_BACKUP_ASKED"

    echo '{"ok":true}'
}
