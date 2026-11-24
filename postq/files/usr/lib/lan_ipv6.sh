# IPv6 advertisements on the OpenWrt logical LAN. The WAN and network prefixes
# belong to netifd; only odhcpd's services on this LAN are changed here.
lan_ipv6_section() {
    local section found=""
    for section in $(uci -q show dhcp | sed -n 's/^dhcp\.\([^.=]*\)=dhcp$/\1/p'); do
        [ "$(uci -q get "dhcp.$section.interface")" = lan ] || continue
        [ "$(uci -q get "dhcp.$section.ignore")" != 1 ] || continue
        [ -z "$found" ] || return 1
        found="$section"
    done
    [ -n "$found" ] && printf '%s\n' "$found"
}

lan_ipv6_enabled() {
    local option
    for option in ra dhcpv6 ndp; do
        case "$(uci -q get "dhcp.$1.$option")" in server|relay|hybrid) return 0 ;; esac
    done
    return 1
}

lan_ipv6_status() {
    local section enabled=false notice=false
    if ! section=$(lan_ipv6_section); then
        echo '{"available":false}'
        return
    fi
    if lan_ipv6_enabled "$section"; then
        enabled=true
    elif [ -f /etc/postq/lan-ipv6.json ]; then
        notice=$(jq -r '.notice == true' /etc/postq/lan-ipv6.json) || return 1
    fi
    printf '{"available":true,"enabled":%s,"notice":%s}\n' "$enabled" "$notice"
}
