"use strict";
"require view";
"require form";
"require baseclass";
"require network";
"require view.netshift.main as main";

// PostQ: the subscription line and the server list under it
"require view.netshift.subscription as subscription";

// Diagnostic content
"require view.netshift.diagnostic as diagnostic";

// PostQ: the DNS card in the diagnostics' right column
"require view.netshift.dns as dns";

// PostQ: the settings snapshots as a short card with a dialog
"require view.netshift.snapshots as snapshots";

// PostQ: service status, update and log
"require view.netshift.control as control";

// PostQ: the two tabs of the page. The data-tab names are the ones the dashboard
// and the diagnostics listen to (TabService): the hidden one stops polling the
// router. The open tab is kept in the address (#diagnostic).
const TABS = [
  { tab: "dashboard", title: () => _("Main") },
  { tab: "diagnostic", title: () => _("Diagnostics") },
];

// The diagnostics (with the DNS card) are the second tab; every other section of
// the page (service, subscription and servers) is the main one.
const DIAGNOSTIC_SECTIONS = ["cbi-netshift-diagnostic"];

function sectionTab(section) {
  return DIAGNOSTIC_SECTIONS.includes(section.id) ? "diagnostic" : "dashboard";
}

function addTabs(node) {
  const items = TABS.map((tab) =>
    E("li", { "data-tab": tab.tab }, [
      E(
        "a",
        {
          href: `#${tab.tab}`,
          click: (ev) => {
            ev.preventDefault();
            showTab(tab.tab);
          },
        },
        tab.title(),
      ),
    ]),
  );

  function showTab(name) {
    TABS.forEach((tab, index) => {
      items[index].className =
        tab.tab === name ? "cbi-tab" : "cbi-tab-disabled";
    });
    node.querySelectorAll(":scope > .cbi-section").forEach((section) => {
      section.style.display = sectionTab(section) === name ? "" : "none";
    });
    document.body.classList.toggle(
      "pq-page--diagnostic",
      name === "diagnostic",
    );
    history.replaceState(
      null,
      "",
      name === "dashboard" ? location.pathname + location.search : `#${name}`,
    );
  }

  const heading = node.querySelector("h2");
  const menu = E("ul", { class: "cbi-tabmenu pq-tabs" }, items);

  if (heading) {
    heading.after(menu);
  } else {
    node.prepend(menu);
  }
  // the tab to open: the address, or the one an apply asked to come back to
  let reopen = null;

  try {
    reopen = sessionStorage.getItem("pq-open-tab");
    sessionStorage.removeItem("pq-open-tab");
  } catch {
    // no storage: the address decides
  }
  showTab(
    location.hash === "#diagnostic" || reopen === "diagnostic"
      ? "diagnostic"
      : "dashboard",
  );
  window.addEventListener("hashchange", () => {
    showTab(location.hash === "#diagnostic" ? "diagnostic" : "dashboard");
  });
}

// PostQ simplified UI: the service card, the subscription and the servers on the
// main tab, the diagnostics on the second one. The routing and DNS are fixed by
// /etc/uci-defaults/60_netshift-postq, so the settings, sections, devices,
// connections and component manager of the full UI are not shown.
const EntryPoint = {
  async render() {
    main.injectGlobalStyles();
    // what the installed core can do, for the validators and the hints
    await main.loadCoreCapabilities();

    const netshiftMap = new form.Map("netshift", _("PostQ VPN"));

    // Service card
    const controlSection = netshiftMap.section(
      form.TypedSection,
      "control",
      _("Service"),
    );
    controlSection.anonymous = true;
    controlSection.addremove = false;
    controlSection.cfgsections = function () {
      return ["control"];
    };

    control.createControlContent(controlSection);

    // Subscription and servers: the subscription line (name, actions, term,
    // traffic) over the server list, like the PostQ XKeen panel. Its own
    // actions save and apply at once.
    const dashboardSection = netshiftMap.section(
      form.TypedSection,
      "dashboard",
    );
    dashboardSection.anonymous = true;
    dashboardSection.addremove = false;
    dashboardSection.cfgsections = function () {
      return ["dashboard"];
    };

    subscription.createSubscriptionContent(dashboardSection);

    // Diagnostics (second tab)
    const diagnosticSection = netshiftMap.section(
      form.TypedSection,
      "diagnostic",
      _("Diagnostics"),
    );
    diagnosticSection.anonymous = true;
    diagnosticSection.addremove = false;
    diagnosticSection.cfgsections = function () {
      return ["diagnostic"];
    };

    diagnostic.createDiagnosticContent(diagnosticSection);

    // Inject core service
    main.coreService();

    return netshiftMap.render().then((node) => {
      addTabs(node);
      dns.mountDnsCard(node);
      snapshots.mountSnapshotsCard(node);
      return node;
    });
  },
};

return view.extend(EntryPoint);
