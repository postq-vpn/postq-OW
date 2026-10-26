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
  const updateLine = E("div", { class: "pq-control__update" });
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

  async function checkUpdate(btn) {
    const result = await busy(btn, _("Checking..."), () =>
      main.NetShiftShellMethods.netshiftCheckUpdate(),
    );

    if (!result.success) {
      updateLine.replaceChildren(
        _("Could not check for updates: %s").format(result.message || "?"),
      );
      return;
    }

    if (result.status !== "outdated") {
      updateLine.replaceChildren(
        _("NetShift %s is the latest version").format(
          result.current_version || "",
        ),
      );
      return;
    }

    updateLine.replaceChildren(
      E("span", {}, _("Version %s is available").format(result.latest_version)),
      " ",
      button(
        _("Update to %s").format(result.latest_version),
        "cbi-button-action",
        (b) => installUpdate(b),
      ),
    );
  }

  async function installUpdate(btn) {
    const result = await busy(
      btn,
      _("Updating, do not close the page..."),
      () => main.NetShiftShellMethods.netshiftSelfUpdate(),
    );

    if (!result.success) {
      updateLine.replaceChildren(
        _("Update failed: %s").format(result.message || "?"),
      );
      return;
    }

    ui.addNotification(null, E("p", _("NetShift has been updated")), "info");
    setTimeout(() => window.location.reload(), 1500);
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
      button(_("Check update"), "cbi-button-neutral", (b) => checkUpdate(b)),
      button(_("Download log"), "cbi-button-neutral", (b) => downloadLog(b)),
    ]),
    updateLine,
  ]);

  refreshStatus();
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
