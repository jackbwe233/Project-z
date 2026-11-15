/* Consistent lightweight navigation across Project Z's separate tools. */
(() => {
  "use strict";
  const page = location.pathname.split("/").pop() || "index.html";
  // Main chat has its own sidebar and visual system.
  if (page === "index.html") return;
  const pages = [
    ["index.html","Chat"],
    ["personal.html","My Day"],
    ["work.html","Work"],
    ["notes.html","Notes"],
    ["music.html","Music"],
    ["quick.html","Talk"],
    ["paper.html","Stocks"],
    ["research.html","Research"],
    ["focus.html","Focus"],
    ["plugins.html","Plugins"],
    ["code-lab.html","Builder"],
    ["account.html","Account"],
    ["index.html#z-style-panel","Personalize"]
  ];
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
      const nav = make("nav","z-shell-links");
      nav.setAttribute("aria-label","Z app navigation");
      pages.forEach(([href,label])=>{
        const a = make("a","",label);
        a.href = "./"+href;
        if (page === href) a.setAttribute("aria-current","page");
        nav.append(a);
      });
      shell.append(nav);
      const help = make("a","z-shell-install","Install Z");
      help.href = "./install.html";
      shell.append(help);
    }
    document.body.prepend(shell);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
