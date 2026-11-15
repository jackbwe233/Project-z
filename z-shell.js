/* Consistent lightweight navigation across Project Z's separate tools. */
(() => {
  "use strict";
  const page = location.pathname.split("/").pop() || "index.html";
  // Main chat has its own sidebar and visual system.
  if (page === "index.html") return;
  const primary = [
    ["index.html","Chat","⌕"],
    ["personal.html","My Day","☀"],
    ["work.html","Work","✦"],
    ["notes.html","Notes","▤"],
    ["music.html","Music","♫"],
    ["paper.html","Stocks","▣"]
  ];
  const morePages = [
    ["plugins.html","All tools"],
    ["quick.html","Voice & Talk"],
    ["research.html","Stock research"],
    ["focus.html","Focus timer"],
    ["google.html","Google Calendar"],
    ["code-lab.html","Change Z"],
    ["command-center.html","Command Center"],
    ["account.html","Account"],
    ["install.html","Install Z"],
    ["shortcut.html","Lock Screen setup"],
    ["privacy.html","Privacy"],
    ["recovery.html","Recovery"]
  ];
  const titles = {
    "index.html":"Chat","personal.html":"My Day","work.html":"Work",
    "notes.html":"Notes","music.html":"Music","paper.html":"Stocks",
    "plugins.html":"All tools","quick.html":"Voice & Talk",
    "research.html":"Stock research","focus.html":"Focus",
    "google.html":"Google Calendar","code-lab.html":"Change Z",
    "command-center.html":"Command Center","account.html":"Account",
    "install.html":"Install Z","shortcut.html":"Lock Screen",
    "privacy.html":"Privacy","recovery.html":"Recovery"
  };
  // Load navigation styles after each page's legacy CSS without changing its form IDs.
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "./z-simple-shell.css?v=ux-20261115-1";
  document.head.append(style);
  function make(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function init() {
    if (!document.body || document.querySelector(".z-shell")) return;
    document.body.classList.add("z-workspace");
    const shell = make("div","z-shell");
    const logo = make("a","z-shell-brand");
    logo.href = "./index.html"; logo.setAttribute("aria-label","Back to Z Chat");
    logo.append(make("span","z-shell-mark","Z"),make("span","","PROJECT Z"));
    shell.append(logo);
    if (page === "paper.html") {
      // Stocks gets a quiet app header, not the crowded 12-tab navigation.
      shell.classList.add("z-shell--stocks");
      shell.append(make("span","z-shell-stock-title","Stocks"));
      const nav = make("nav","z-shell-stock-actions");
      nav.setAttribute("aria-label","Z app navigation");
      const chat = make("a","z-shell-stock-chat","← Chat");
      chat.href = "./index.html";
      nav.append(chat);

      const menu = make("details","z-shell-more");
      const trigger = make("summary","z-shell-more-trigger","Menu");
      trigger.setAttribute("aria-label","More Z apps and tools");
      const items = make("div","z-shell-more-menu");
      const links = [
        ["research.html","Detailed stock research"],
        ["work.html","Z Work"],
        ["personal.html","My Day"],
        ["notes.html","Notes"],
        ["music.html","Music Finder"],
        ["quick.html","Voice & Talk"],
        ["focus.html","Focus"],
        ["plugins.html","All tools"],
        ["account.html","Account"],
        ["install.html","Install Z"]
      ];
      for (const [href,label] of links) {
        const a = make("a","",label);
        a.href = "./"+href;
        items.append(a);
      }
      menu.append(trigger,items);
      nav.append(menu);
      shell.append(nav);
      document.addEventListener("pointerdown", event => {
        if (menu.open && !menu.contains(event.target)) menu.open = false;
      });
      menu.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          menu.open = false;
          trigger.focus();
        }
      });
    } else {
      shell.classList.add("z-shell--simple");
      const current = make("span","z-shell-current",titles[page] || "Z tools");
      shell.append(current);
      const nav = make("nav","z-shell-links");
      nav.setAttribute("aria-label","Z app navigation");
      for (const [href,label] of primary) {
        const a = make("a","",label);
        a.href = "./"+href;
        if (page === href) a.setAttribute("aria-current","page");
        nav.append(a);
      }
      shell.append(nav);

      // One searchable menu replaces the old row of 13 horizontally scrolling tabs.
      const menu = make("details","z-shell-more");
      const trigger = make("summary","z-shell-more-trigger","More");
      trigger.setAttribute("aria-label","More Z tools");
      const items = make("div","z-shell-more-menu");
      const search = make("input","z-shell-search");
      search.type = "search";
      search.placeholder = "Find a tool...";
      search.setAttribute("aria-label","Find a Z tool");
      items.append(search);
      const all = [...primary.map(([href,label]) => [href,label]),...morePages];
      for (const [href,label] of all) {
        const a = make("a","",label);
        a.href = "./"+href;
        if (page === href) a.setAttribute("aria-current","page");
        items.append(a);
      }
      const noResults = make("p","z-shell-no-results","No matching tools");
      noResults.hidden = true;
      items.append(noResults);
      search.addEventListener("input", () => {
        const term = search.value.trim().toLocaleLowerCase();
        let visible = 0;
        for (const a of items.querySelectorAll("a")) {
          a.hidden = !a.textContent.toLocaleLowerCase().includes(term);
          if (!a.hidden) visible++;
        }
        noResults.hidden = visible > 0;
      });
      menu.append(trigger,items);
      shell.append(menu);
      document.addEventListener("pointerdown", event => {
        if (menu.open && !menu.contains(event.target)) menu.open = false;
      });
      menu.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          menu.open = false;
          trigger.focus();
        }
      });
    }
    document.body.prepend(shell);

    // The five most-used destinations stay reachable on every phone screen.
    // "More" opens the existing tool directory, with every advanced page linked.
    if (page !== "recovery.html") {
      const dock = make("nav","z-mobile-dock");
      dock.setAttribute("aria-label","Quick navigation");
      const quick = [
        ["index.html","Chat","⌕"],
        ["personal.html","Day","☀"],
        ["work.html","Work","✦"],
        ["notes.html","Notes","▤"],
        ["music.html","Music","♫"],
        ["plugins.html","More","☷"]
      ];
      for (const [href,label,symbol] of quick) {
        const a = make("a","",null);
        a.href = "./"+href;
        a.setAttribute("aria-label", label === "More" ? "More Z tools" : label);
        if (page === href || (label === "More" && !primary.some(([id]) => id === page))) {
          a.setAttribute("aria-current","page");
        }
        a.append(make("span","z-dock-icon",symbol),make("span","",label));
        dock.append(a);
      }
      document.body.append(dock);
    }

    // Long pages get an optional table of contents; existing sections and IDs stay put.
    const main = document.querySelector("main");
    if (main) {
      if (!main.id) main.id = "z-page-main";
      const skip = make("a","z-simple-skip","Skip to content");
      skip.href = "#"+main.id;
      document.body.prepend(skip);
      const sections = [...main.querySelectorAll(":scope > section")];
      if (sections.length >= 4) {
        const jumps = make("nav","z-page-jumps");
        jumps.setAttribute("aria-label","Jump to a section");
        const wrap = make("details","");
        const summary = make("summary","","On this page");
        const links = make("div","z-page-jump-items");
        sections.forEach((section,index) => {
          const heading = section.querySelector("h2,h3");
          const name = heading?.textContent?.trim().replace(/\\s+/g," ").slice(0,42);
          if (!name) return;
          if (!section.id) section.id = "z-section-"+(index+1);
          const link = make("a","",name);
          link.href = "#"+section.id;
          link.addEventListener("click", () => { wrap.open = false; });
          links.append(link);
        });
        if (links.children.length > 1) {
          wrap.append(summary,links);
          jumps.append(wrap);
          main.insertBefore(jumps,sections[0]);
        }
      }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
