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
    document.body.prepend(shell);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
