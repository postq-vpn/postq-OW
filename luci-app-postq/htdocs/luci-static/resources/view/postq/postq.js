"use strict";
"require view";
"require form";
"require baseclass";
"require network";
"require view.postq.main as main";

// PostQ: the main page (subscription, router, VPN and servers), laid out like
// the PostQ XKeen panel
"require view.postq.home as home";

// Diagnostic content
"require view.postq.diagnostic as diagnostic";

// PostQ: the DNS card in the diagnostics' right column
"require view.postq.dns as dns";

// PostQ: the settings snapshots as a short card with a dialog
"require view.postq.snapshots as snapshots";

// PostQ: the updates dialog, the log for support, the page's stylesheet
"require view.postq.control as control";

// Two screens, like the PostQ XKeen panel: the main one and the diagnostics,
// opened from the "Diagnostics" pill of the header and left with "Back". The
// data-tab names are the ones the diagnostics listen to (TabService): the hidden
// screen stops polling the router. The open screen is kept in the address
// (#diagnostic).
function mountScreens(mapNode) {
  let screen = "dashboard";

  const { header, node: homeNode } = home.createHome({
    onDiagnostics: () => show("diagnostic"),
  });

  const back = E(
    "button",
    {
      type: "button",
      class: "pq-pill pq-pill--icon",
      "aria-label": _("Back"),
      title: _("Back"),
      click: (ev) => {
        ev.preventDefault();
        show("dashboard");
      },
    },
    [],
  );

  back.innerHTML =
    '<span class="pq-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></span>';

  const diagHead = E("div", { class: "pq-head", role: "banner" }, [
    back,
    E("div", { class: "pq-pill pq-pill--logo" }, [E("span", { class: "pq-logo" })]),
    E("h1", { class: "pq-head__title" }, _("Diagnostics")),
  ]);

  // the TabService of the diagnostics listens to these items
  const tabs = E("ul", { class: "pq-hidden-tabs", hidden: "" }, [
    E("li", { "data-tab": "dashboard" }),
    E("li", { "data-tab": "diagnostic" }),
  ]);

  const homeScreen = E("div", { class: "pq-screen pq-screen--home" }, [
    header,
    homeNode,
  ]);
  const diagScreen = E("div", { class: "pq-screen pq-screen--diagnostic" }, [
    diagHead,
    mapNode,
  ]);

  function show(name) {
    screen = name;
    tabs.children[0].className = name === "dashboard" ? "cbi-tab" : "cbi-tab-disabled";
    tabs.children[1].className = name === "diagnostic" ? "cbi-tab" : "cbi-tab-disabled";
    homeScreen.hidden = name !== "dashboard";
    diagScreen.hidden = name !== "diagnostic";
    document.body.classList.toggle("pq-page--diagnostic", name === "diagnostic");
    history.replaceState(
      null,
      "",
      name === "dashboard" ? location.pathname + location.search : `#${name}`,
    );
    window.scrollTo(0, 0);
  }

  // the screen to open: the address, or the one an apply asked to come back to
  let reopen = null;

  try {
    reopen = sessionStorage.getItem("pq-open-tab");
    sessionStorage.removeItem("pq-open-tab");
  } catch {
    // no storage: the address decides
  }

  const app = E("div", { class: "pq-app" }, [tabs, homeScreen, diagScreen]);

  show(
    location.hash === "#diagnostic" || reopen === "diagnostic"
      ? "diagnostic"
      : "dashboard",
  );
  window.addEventListener("hashchange", () => {
    const wanted = location.hash === "#diagnostic" ? "diagnostic" : "dashboard";

    if (wanted !== screen) {
      show(wanted);
    }
  });

  return app;
}

// PostQ simplified UI: the main page drawn by home.js and the
// diagnostics on a second screen. The routing and DNS are fixed by
// /etc/uci-defaults/60_postq-profile, so the settings, sections, devices,
// connections and component manager of the full UI are not shown.
const EntryPoint = {
  async render() {
    control.injectStyles();
    main.injectGlobalStyles();
    // what the installed core can do, for the validators and the hints
    await main.loadCoreCapabilities();

    const postqMap = new form.Map("postq", _("PostQ VPN"));

    // Diagnostics (second screen)
    const diagnosticSection = postqMap.section(
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

    return postqMap.render().then((node) => {
      dns.mountDnsCard(node);
      snapshots.mountSnapshotsCard(node);
      control.askAboutBackup();

      return mountScreens(node);
    });
  },

  // the page saves and applies by itself: no form buttons
  addFooter() {
    return E("div");
  },
};

return view.extend(EntryPoint);
