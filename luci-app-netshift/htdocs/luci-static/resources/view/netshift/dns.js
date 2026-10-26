"use strict";
"require baseclass";
"require form";
"require uci";
"require ui";
"require view.netshift.main as main";

// PostQ: the DNS server and the bootstrap DNS: a card in the right column of the
// Diagnostics tab (before the system information) whose button opens a dialog. The profile starts with DoH 1.1.1.1 and
// bootstrap 77.88.8.8, but not every server answers on every network: the user
// checks the ready-made ones (the same dig the full UI uses, from the router)
// and picks ones that answer. The choice is applied at once; the profile never
// changes it again (it only adds what is missing on an update).

const DEFAULT_DNS = { type: "doh", server: "1.1.1.1" };
const DEFAULT_BOOTSTRAP = "77.88.8.8";

const DNS_PRESETS = [
  { type: "doh", server: "1.1.1.1", name: "Cloudflare", kind: "DoH" },
  { type: "dot", server: "1.1.1.1", name: "Cloudflare", kind: "DoT" },
  { type: "doh", server: "8.8.8.8", name: "Google", kind: "DoH" },
  { type: "doh", server: "9.9.9.9", name: "Quad9", kind: "DoH" },
  { type: "doh", server: "dns.adguard-dns.com", name: "AdGuard", kind: "DoH" },
  {
    type: "dot",
    server: "common.dot.dns.yandex.net",
    name: _("Yandex"),
    kind: "DoT",
  },
  { type: "udp", server: "77.88.8.8", name: _("Yandex"), kind: "UDP" },
];

// The bootstrap DNS finds the address of a DNS server given by name; plain UDP
// on an IP address.
const BOOTSTRAP_PRESETS = [
  { server: "77.88.8.8", name: _("Yandex") },
  { server: "1.1.1.1", name: "Cloudflare" },
  { server: "8.8.8.8", name: "Google" },
  { server: "9.9.9.9", name: "Quad9" },
];

const TYPES = ["udp", "tcp", "dot", "doh", "doh3", "doq"];

const keyOf = (dns) => `${dns.type}://${dns.server}`;
const bootKey = (ip) => `udp://${ip}`;

// "doh://dns.example.com/dns-query" -> { type, server }, or null.
function parseCustom(value) {
  const match = /^([a-z0-9]+):\/\/(.+)$/.exec(String(value || "").trim());

  if (!match || !TYPES.includes(match[1])) {
    return null;
  }

  return { type: match[1], server: match[2] };
}

function latencyClass(ms) {
  if (ms === null) {
    return "pq-dns__ms--none";
  }

  return ms < 150
    ? "pq-dns__ms--good"
    : ms < 500
      ? "pq-dns__ms--mid"
      : "pq-dns__ms--slow";
}

function currentDns() {
  return {
    type: uci.get("netshift", "settings", "dns_type") || DEFAULT_DNS.type,
    server: uci.get("netshift", "settings", "dns_server") || DEFAULT_DNS.server,
  };
}

function currentBootstrap() {
  return (
    uci.get("netshift", "settings", "bootstrap_dns_server") || DEFAULT_BOOTSTRAP
  );
}

async function applyDns(dns, bootstrap) {
  uci.set("netshift", "settings", "dns_type", dns.type);
  uci.set("netshift", "settings", "dns_server", dns.server);
  uci.set("netshift", "settings", "bootstrap_dns_server", bootstrap);
  // the mark of an earlier version: the profile keeps every choice now
  uci.unset("netshift", "settings", "postq_dns_custom");

  await uci.save();
  // the apply reloads the page without its #diagnostic: come back to this tab
  try {
    sessionStorage.setItem("pq-open-tab", "diagnostic");
  } catch {
    // no storage: the page opens on the main tab
  }
  ui.changes.apply(true);
}

function renderDns(onClose) {
  const node = E("div", { class: "pq-dns" });
  const nowDns = currentDns();
  const nowBoot = currentBootstrap();
  const dnsIsPreset = DNS_PRESETS.some((p) => keyOf(p) === keyOf(nowDns));
  const bootIsPreset = BOOTSTRAP_PRESETS.some((p) => p.server === nowBoot);
  const state = {
    dns: dnsIsPreset ? keyOf(nowDns) : "custom",
    boot: bootIsPreset ? nowBoot : "custom",
    customDns: dnsIsPreset ? "" : keyOf(nowDns),
    customBoot: bootIsPreset ? "" : nowBoot,
  };
  let results = {};
  let testing = false;
  let error = "";
  let applyBtn = null;

  function chosenDns() {
    return state.dns === "custom"
      ? parseCustom(state.customDns)
      : DNS_PRESETS.find((p) => keyOf(p) === state.dns);
  }

  function chosenBoot() {
    return state.boot === "custom" ? state.customBoot.trim() : state.boot;
  }

  function changed() {
    const dns = chosenDns();
    const boot = chosenBoot();

    return (
      Boolean(dns && boot) && (keyOf(dns) !== keyOf(nowDns) || boot !== nowBoot)
    );
  }

  async function test() {
    testing = true;
    error = "";
    draw();

    const custom = parseCustom(state.customDns);
    const servers = DNS_PRESETS.map(keyOf)
      .concat(custom ? [keyOf(custom)] : [])
      .concat(BOOTSTRAP_PRESETS.map((p) => bootKey(p.server)))
      .concat(
        state.customBoot.trim() ? [bootKey(state.customBoot.trim())] : [],
      );

    try {
      const response = await main.NetShiftShellMethods.dnsBenchmark([
        ...new Set(servers),
      ]);

      results = {};
      main
        .parseDnsBenchmark(response.success ? response.data : {})
        .forEach((item) => {
          results[item.server] = item.ms;
        });
    } catch {
      error = _("The servers could not be checked");
    }

    testing = false;
    draw();
  }

  // One line of a list: a radio, the name, an optional field and the delay.
  function row(group, value, resultKey, label, sub, extra) {
    const active = state[group] === value;
    const ms =
      resultKey && Object.prototype.hasOwnProperty.call(results, resultKey)
        ? results[resultKey]
        : undefined;

    return E(
      "label",
      { class: `pq-dns__row${active ? " pq-dns__row--active" : ""}` },
      [
        E("input", {
          type: "radio",
          name: `pq-dns-${group}`,
          class: "pq-dns__radio",
          checked: active ? "" : null,
          change: () => {
            state[group] = value;
            error = "";
            draw();
          },
        }),
        E("span", { class: "pq-dns__name" }, [
          E("b", {}, label),
          sub ? E("span", { class: "pq-dns__sub" }, sub) : "",
        ]),
        extra || "",
        E(
          "span",
          {
            class: `pq-dns__ms ${ms === undefined ? "" : latencyClass(ms)}`,
          },
          ms === undefined ? "" : ms === null ? _("no answer") : `${ms} ms`,
        ),
      ],
    );
  }

  // The field of the own server: typing in it picks it without a redraw (a
  // redraw would take the focus away).
  function customField(group, field, placeholder, label) {
    return E("input", {
      type: "text",
      class: "pq-dns__input",
      value: state[field],
      placeholder,
      "aria-label": label,
      focus: (ev) => {
        state[group] = "custom";
        const list = ev.target.closest(".pq-dns__list");

        list.querySelectorAll(".pq-dns__row").forEach((el) => {
          el.classList.remove("pq-dns__row--active");
        });
        const own = ev.target.closest(".pq-dns__row");

        own.classList.add("pq-dns__row--active");
        own.querySelector(".pq-dns__radio").checked = true;
        applyBtn.disabled = !changed();
      },
      input: (ev) => {
        state[field] = ev.target.value;
        state[group] = "custom";
        error = "";
        applyBtn.disabled = !changed();
      },
    });
  }

  function apply() {
    const dns = chosenDns();
    const boot = chosenBoot();

    if (!dns) {
      error = _(
        "Write the server as scheme://address, for example doh://dns.example.com/dns-query",
      );
      draw();
      return;
    }

    const check = main.validateDNS(dns.server);

    if (!check.valid) {
      error = check.message;
      draw();
      return;
    }

    if (!main.validateIP(boot).valid) {
      error = _("The bootstrap DNS is an IP address, for example 77.88.8.8");
      draw();
      return;
    }

    applyDns(dns, boot);
  }

  function draw() {
    applyBtn = E(
      "button",
      {
        type: "button",
        class: "btn cbi-button pq-dns__apply",
        disabled: changed() ? null : "",
        click: (ev) => {
          ev.preventDefault();
          apply();
        },
      },
      _("Apply"),
    );

    node.replaceChildren(
      E("p", { class: "pq-dns__hint" }, [
        _(
          "How the router finds the addresses of sites. If sites do not open, check the servers and pick one that answers.",
        ),
        " ",
        E("span", { class: "pq-dns__now" }, `${_("Now")}: ${keyOf(nowDns)}`),
      ]),
      E(
        "div",
        {
          class: "pq-dns__list",
          role: "radiogroup",
          "aria-label": _("DNS server"),
        },
        DNS_PRESETS.map((p) =>
          row(
            "dns",
            keyOf(p),
            keyOf(p),
            `${p.name} · ${p.kind}`,
            keyOf(p) === keyOf(DEFAULT_DNS)
              ? `${p.server} · ${_("default")}`
              : p.server,
          ),
        ).concat([
          row(
            "dns",
            "custom",
            parseCustom(state.customDns)
              ? keyOf(parseCustom(state.customDns))
              : null,
            _("Own server"),
            "",
            customField(
              "dns",
              "customDns",
              "doh://dns.example.com/dns-query",
              _("Own DNS server"),
            ),
          ),
        ]),
      ),
      E("h5", { class: "pq-dns__title" }, _("Bootstrap DNS")),
      E("p", { class: "pq-dns__hint" }, [
        _(
          "Finds the address of a DNS server given by name (AdGuard, Yandex DoT). It must answer too.",
        ),
        " ",
        E("span", { class: "pq-dns__now" }, `${_("Now")}: ${nowBoot}`),
      ]),
      E(
        "div",
        {
          class: "pq-dns__list",
          role: "radiogroup",
          "aria-label": _("Bootstrap DNS"),
        },
        BOOTSTRAP_PRESETS.map((p) =>
          row(
            "boot",
            p.server,
            bootKey(p.server),
            p.name,
            p.server === DEFAULT_BOOTSTRAP
              ? `${p.server} · ${_("default")}`
              : p.server,
          ),
        ).concat([
          row(
            "boot",
            "custom",
            state.customBoot.trim() ? bootKey(state.customBoot.trim()) : null,
            _("Own server"),
            "",
            customField(
              "boot",
              "customBoot",
              "77.88.8.1",
              _("Own bootstrap DNS"),
            ),
          ),
        ]),
      ),
      error ? E("div", { class: "pq-dns__error" }, error) : "",
      E("div", { class: "pq-dns__actions" }, [
        E(
          "button",
          {
            type: "button",
            class: "btn cbi-button pq-dns__check",
            disabled: testing ? "" : null,
            click: (ev) => {
              ev.preventDefault();
              test();
            },
          },
          testing ? _("Checking...") : _("Check servers"),
        ),
        E(
          "button",
          {
            type: "button",
            class: "btn cbi-button",
            click: (ev) => {
              ev.preventDefault();
              onClose();
            },
          },
          _("Cancel"),
        ),
        applyBtn,
      ]),
    );
  }

  draw();

  return node;
}

function openDialog() {
  ui.showModal(_("DNS server"), [renderDns(() => ui.hideModal())], "pq-modal");
}

// The card: the servers in use and the button, styled like its neighbours.
function renderCard() {
  return E("div", { class: "card pq-dns-card" }, [
    E("b", {}, _("DNS server")),
    E("span", { class: "pq-dns__now" }, keyOf(currentDns())),
    E("span", { class: "pq-dns-card__sub" }, `bootstrap ${currentBootstrap()}`),
    E(
      "button",
      {
        type: "button",
        class: "btn cbi-button",
        click: (ev) => {
          ev.preventDefault();
          openDialog();
        },
      },
      _("Configure DNS"),
    ),
  ]);
}

// Puts the card into the diagnostics' right column, before the system
// information (its holder stays: the diagnostics fill it, not this card).
function mountDnsCard(node) {
  const before = node.querySelector("#pdk_diagnostic-page-system-info");

  if (before && !node.querySelector(".pq-dns-card")) {
    before.before(renderCard());
  }
}

return baseclass.extend({
  mountDnsCard,
});
