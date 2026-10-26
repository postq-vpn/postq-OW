"use strict";
"require baseclass";
"require form";
"require ui";
"require view.netshift.main as main";

// PostQ: the one card of the simplified page that runs the service. Status of
// the tunnel, start / stop / restart, the NetShift update and the log for
// support. Everything else of the full UI (settings, devices, diagnostics) is
// not shown: the routing and DNS are fixed by /etc/uci-defaults/60_netshift-postq.

const STATUS_INTERVAL = 5000;

function button(text, classNames, onClick) {
  return E(
    "button",
    {
      class: `btn cbi-button ${classNames}`,
      click: (ev) => {
        ev.preventDefault();
        onClick(ev.currentTarget);
      },
    },
    text,
  );
}

// Runs an action with the button disabled; the text is restored afterwards.
async function busy(btn, text, action) {
  const previous = btn.textContent;

  btn.disabled = true;
  btn.textContent = text;
  try {
    return await action();
  } finally {
    btn.disabled = false;
    btn.textContent = previous;
  }
}

function downloadText(name, text) {
  const link = E("a", {
    href: URL.createObjectURL(new Blob([text], { type: "text/plain" })),
    download: name,
  });

  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function renderControl() {
  const statusDot = E("span", { class: "pq-control__dot" });
  const statusText = E("span", {}, _("Checking..."));
  const startBtn = button(_("Start"), "cbi-button-save", (b) =>
    serviceAction(b, "start"),
  );
  const stopBtn = button(_("Stop"), "cbi-button-remove", (b) =>
    serviceAction(b, "stop"),
  );
  const restartBtn = button(_("Restart"), "cbi-button-apply", (b) =>
    serviceAction(b, "restart"),
  );

  async function refreshStatus() {
    const [service, singBox] = await Promise.all([
      main.NetShiftShellMethods.getStatus(),
      main.NetShiftShellMethods.getSingBoxStatus(),
    ]);
    const running = singBox.success && singBox.data && singBox.data.running;
    const enabled = service.success && service.data && service.data.enabled;

    statusDot.classList.toggle("pq-control__dot--on", !!running);
    statusText.textContent = running
      ? _("VPN is running")
      : enabled
        ? _("VPN is stopped: add a subscription below")
        : _("VPN is stopped");
    startBtn.style.display = running ? "none" : "";
    stopBtn.style.display = running ? "" : "none";
    restartBtn.style.display = running ? "" : "none";
  }

  async function serviceAction(btn, action) {
    await busy(btn, _("Please wait..."), async () => {
      await main.NetShiftShellMethods[action]();
      await refreshStatus();
    });
  }

  // Updates like the PostQ XKeen panel: a button per component showing its
  // version, framed when the daily background check (update_notice) found a
  // newer one; it opens a dialog with the versions, the release notes and the
  // install. The core's check and install follow the flavour in place: the same
  // actions the component manager of the full UI uses.
  const CORE_ACTIONS = {
    extended_lite: ["check_update_lite", "install_extended_lite"],
    extended: ["check_update", "install_extended"],
    stock: ["check_update_stable", "install_stable"],
  };
  let coreVariant = "stock";

  function versionButton(label, onClick) {
    const num = E("span", { class: "pq-version__num" }, "…");
    const btn = E(
      "button",
      {
        type: "button",
        class: "btn cbi-button pq-version",
        click: (ev) => {
          ev.preventDefault();
          onClick();
        },
      },
      [E("span", {}, label), num],
    );

    btn.num = num;

    return btn;
  }

  const appBtn = versionButton("PostQ VPN", () => openUpdate("app"));
  const coreBtn = versionButton("sing-box", () => openUpdate("core"));

  function markOutdated(btn, check) {
    const outdated = Boolean(check && check.status === "outdated");

    btn.classList.toggle("pq-version--update", outdated);
    btn.title = outdated
      ? _("Version %s is available").format(check.latest_version)
      : "";
  }

  async function loadVersions() {
    const [info, notice] = await Promise.all([
      main.NetShiftShellMethods.getSystemInfo().catch(() => null),
      main.NetShiftShellMethods.getUpdateNotice().catch(() => null),
    ]);
    const data = info && info.success && info.data ? info.data : {};
    const core = String(data.sing_box_version || "");

    appBtn.num.textContent =
      String(data.netshift_version || "").replace(/^v/, "") || "—";
    coreBtn.num.textContent = core.split("-")[0] || "—";
    coreBtn.setAttribute("aria-label", `sing-box ${core}`);
    coreVariant = data.sing_box_variant || "stock";

    const checks = main.parseUpdateNotice(
      notice && notice.success ? notice.data : {},
    );

    markOutdated(appBtn, checks.netshift);
    markOutdated(coreBtn, checks.sing_box);
  }

  async function checkFor(kind) {
    if (kind === "app") {
      return main.NetShiftShellMethods.netshiftCheckUpdate();
    }

    const actions = CORE_ACTIONS[coreVariant] || CORE_ACTIONS.stock;

    return main.NetShiftShellMethods.singBoxCheckUpdate(actions[0]);
  }

  async function install(kind) {
    if (kind === "app") {
      return main.NetShiftShellMethods.netshiftSelfUpdate();
    }

    const actions = CORE_ACTIONS[coreVariant] || CORE_ACTIONS.stock;

    return main.NetShiftShellMethods.singBoxComponentAction(actions[1]);
  }

  function openUpdate(kind) {
    const body = E("div", { class: "pq-upd" }, [
      E("p", { class: "pq-upd__wait" }, _("Checking...")),
    ]);
    let installing = false;

    ui.showModal(
      kind === "app"
        ? _("Update of PostQ VPN")
        : _("Update of the sing-box core"),
      [body],
      "pq-modal",
    );

    function row(label, value) {
      return E("div", { class: "pq-upd__row" }, [
        E("span", { class: "pq-upd__label" }, label),
        E("b", {}, value || "—"),
      ]);
    }

    function closeBtn() {
      return E(
        "button",
        {
          type: "button",
          class: "btn cbi-button",
          click: (ev) => {
            ev.preventDefault();
            if (!installing) {
              ui.hideModal();
            }
          },
        },
        _("Close"),
      );
    }

    function show(result) {
      if (!result || !result.success) {
        body.replaceChildren(
          E(
            "p",
            { class: "pq-upd__error" },
            _("Could not check for updates: %s").format(
              (result && result.message) || "?",
            ),
          ),
          E("div", { class: "pq-dns__actions" }, [closeBtn()]),
        );
        return;
      }

      const outdated = result.status === "outdated";
      const installBtn = E(
        "button",
        {
          type: "button",
          class: "btn cbi-button pq-upd__install",
          disabled: outdated ? null : "",
          click: async (ev) => {
            ev.preventDefault();
            installing = true;
            installBtn.disabled = true;
            installBtn.textContent = _("Updating, do not close the page...");

            const done = await install(kind).catch((e) => ({
              success: false,
              message: String(e),
            }));

            installing = false;
            if (!done || !done.success) {
              installBtn.disabled = false;
              installBtn.textContent = _("Install %s").format(
                result.latest_version,
              );
              ui.addNotification(
                null,
                E(
                  "p",
                  _("Update failed: %s").format((done && done.message) || "?"),
                ),
                "warning",
              );
              return;
            }

            ui.hideModal();
            if (kind === "app") {
              ui.addNotification(
                null,
                E("p", _("NetShift has been updated")),
                "info",
              );
              setTimeout(() => window.location.reload(), 1500);
              return;
            }

            ui.addNotification(
              null,
              E(
                "p",
                _("The sing-box core has been updated to %s").format(
                  done.version || result.latest_version,
                ),
              ),
              "info",
            );
            loadVersions();
            refreshStatus();
          },
        },
        outdated
          ? _("Install %s").format(result.latest_version)
          : _("Latest version is installed"),
      );

      body.replaceChildren(
        E("div", { class: "pq-upd__rows" }, [
          row(_("Installed"), result.current_version),
          row(_("Latest"), result.latest_version),
        ]),
        E(
          "p",
          { class: `pq-upd__status${outdated ? " pq-upd__status--new" : ""}` },
          outdated
            ? _("A new version is available")
            : _("The latest version is installed"),
        ),
        result.notes ? E("div", { class: "pq-upd__notes" }, result.notes) : "",
        // nothing to install on the latest version: just Close
        E(
          "div",
          { class: "pq-dns__actions" },
          outdated ? [closeBtn(), installBtn] : [closeBtn()],
        ),
      );
    }

    checkFor(kind)
      .then(show)
      .catch((e) => show({ success: false, message: String(e) }));
  }

  async function downloadLog(btn) {
    const result = await busy(btn, _("Preparing..."), () =>
      main.NetShiftShellMethods.getSupportReport(),
    );

    if (!result.success || typeof result.data !== "string" || !result.data) {
      ui.addNotification(
        null,
        E("p", _("The report could not be prepared")),
        "warning",
      );
      return;
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");

    downloadText(`netshift-log-${stamp}.txt`, result.data);
  }

  const node = E("div", { class: "pq-control" }, [
    E("div", { class: "pq-control__status" }, [statusDot, statusText]),
    E("div", { class: "pq-control__actions" }, [
      startBtn,
      stopBtn,
      restartBtn,
      button(_("Download log"), "cbi-button-neutral", (b) => downloadLog(b)),
    ]),
    E("div", { class: "pq-control__versions" }, [appBtn, coreBtn]),
  ]);

  refreshStatus();
  loadVersions();
  const timer = setInterval(() => {
    if (!document.body.contains(node)) {
      clearInterval(timer);
      return;
    }
    if (!document.hidden) {
      refreshStatus();
    }
  }, STATUS_INTERVAL);

  return node;
}

// The look of the page (logo, cards, the server list of the XKeen UI) lives in
// netshift/postq.css, scoped to body.pq-page. Its URL carries the build's tag
// of the views and assets (put in by cache-bust.sh), so a changed stylesheet is
// fetched again even when the version stays the same.
function injectStyles() {
  document.body.classList.add("pq-page");

  if (document.getElementById("pq-page-styles")) {
    return;
  }

  document.head.appendChild(
    E("link", {
      id: "pq-page-styles",
      rel: "stylesheet",
      href: `${L.resource("netshift/postq.css")}?v=__POSTQ_ASSETS_TAG__`,
    }),
  );
}

function createControlContent(section) {
  injectStyles();

  const o = section.option(form.DummyValue, "_mount_node");
  o.rawhtml = true;
  o.cfgvalue = () => renderControl();
}

return baseclass.extend({
  createControlContent,
});
