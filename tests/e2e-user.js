/* Simulate two people using Lazem in the browser.
   Google and Outlook popups are answered with their email addresses.
   Run: node tests/e2e-user.js */
const puppeteer = require("/tmp/lazem-test/node_modules/puppeteer-core");
const path = require("path");

const PAGE = "file://" + path.resolve(__dirname, "../static/index.html");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

const fails = [];
const ok = (name, cond) => {
  console.log((cond ? "PASS" : "FAIL") + " " + name);
  if (!cond) fails.push(name);
};

async function boot(page) {
  await page.goto(PAGE, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    ["lazem.v1", "lazem.signin.v1", "lazem.signin.label.v1", "lazem.phone.v1", "lazem.signedout.v1", "lazem.ms.client.v1", "lazem.meetings.v1", "lazem.samples.v1", "lazem.pins.v1", "lazem.household.v1"].forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("lazem.samples.v1", "cleared");
  });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => window.lazemSync && window.lazemConnect);
  await page.evaluate(() => {
    window.__mail = null;
    window.lazemSync.signIn = () => window.lazemAuthUI({ email: window.__mail, name: window.__mail });
    window.lazemSync.signOut = async () => {};
    window.lazemSync.pullCalendar = async () => window.lazemPullGoogleCalendar("user-token");
    window.lazemSync.startHouse = null;
    window.lazemConnect.outlook = async () => {
      window.lazemAccountConnected("outlook", window.__mail);
      return true;
    };
  });
}

async function menu(page) {
  const open = await page.evaluate(() => !document.getElementById("drawer").hidden);
  if (!open) await page.click("#menuBtn");
  await page.waitForSelector("#authArea");
}

async function add(page, text) {
  await page.click("#note", { clickCount: 3 });
  await page.type("#note", text);
  await page.click("#composer button[type=submit], #composer .add-btn, #addBtn");
  await new Promise((r) => setTimeout(r, 250));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--allow-file-access-from-files", "--no-first-run"],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.webkitSpeechRecognition = class {
      start() {
        setTimeout(() => {
          if (this.onstart) this.onstart();
          if (this.onresult) {
            this.onresult({
              resultIndex: 0,
              results: [{ 0: { transcript: "call the school" }, isFinal: true, length: 1 }],
            });
          }
          if (this.onend) this.onend();
        }, 30);
      }
      stop() { if (this.onend) this.onend(); }
    };
    window.SpeechRecognition = window.webkitSpeechRecognition;
    if (window.Notification) {
      window.Notification.requestPermission = () => Promise.resolve("granted");
    }
    window.alert = (msg) => { window.__alert = String(msg); };
  });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = req.url();
    if (req.method() === "OPTIONS") {
      req.respond({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET" } });
      return;
    }
    if (!u.includes("googleapis.com/calendar")) return req.continue();
    const body = u.includes("calendarList")
      ? { items: [{ id: "primary" }] }
      : { items: [{ summary: "Dentist", start: { dateTime: today + "T16:30:00+03:00" }, location: "Maadi" }] };
    req.respond({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
      body: JSON.stringify(body),
    });
  });
  page.setDefaultTimeout(8000);
  await page.setViewport({ width: 390, height: 844 });
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp/lazem-dl" });
  await boot(page);

  const body = () => page.evaluate(() => document.getElementById("list").innerText + "\n" + (document.getElementById("overdue").innerText || ""));
  const email = () => page.evaluate(() => document.getElementById("acctEmail").textContent);
  const signed = () => page.evaluate(() => !document.getElementById("signedIn").hidden);

  await menu(page);
  await page.evaluate(() => { window.__mail = "marwa@gmail.com"; document.getElementById("signInBtn").click(); });
  await new Promise((r) => setTimeout(r, 200));
  ok("google user is marwa", (await email()) === "marwa@gmail.com" && await signed());

  await page.evaluate(() => document.getElementById("signOutBtn").click());
  await new Promise((r) => setTimeout(r, 200));
  ok("signed out", !(await signed()));
  await page.evaluate(() => window.lazemAuthUI({ email: "marwa@gmail.com" }));
  ok("old google session stays out", !(await signed()));

  await page.evaluate(() => { window.__mail = "other@gmail.com"; document.getElementById("signInBtn").click(); });
  await new Promise((r) => setTimeout(r, 200));
  ok("second google login", (await email()) === "other@gmail.com");
  await page.evaluate(() => document.getElementById("signOutBtn").click());
  await new Promise((r) => setTimeout(r, 200));

  await page.evaluate(() => document.getElementById("connOutlookBtn").click());
  await page.waitForSelector("#outlookEmail");
  await page.type("#outlookEmail", "not-an-email");
  await page.click("[data-sheet=outlook-save]");
  ok("outlook needs an email", !(await signed()));
  await page.click("#outlookEmail", { clickCount: 3 });
  await page.type("#outlookEmail", "marwa@smarteducation.ae");
  await page.click("[data-sheet=outlook-save]");
  await new Promise((r) => setTimeout(r, 300));
  ok("outlook user", (await email()) === "marwa@smarteducation.ae");
  await page.evaluate(() => window.lazemAuthUI({ email: "other@gmail.com" }));
  ok("google does not replace outlook", (await email()) === "marwa@smarteducation.ae");
  await page.evaluate(() => document.getElementById("signOutBtn").click());
  await new Promise((r) => setTimeout(r, 200));
  ok("outlook sign-out", !(await signed()));

  await page.evaluate(() => document.getElementById("signPhoneBtn").click());
  await page.waitForSelector("#phoneInput");
  await page.type("#phoneInput", "123");
  await page.click("[data-sheet=phone-save]");
  ok("short number stays signed out", !(await signed()));
  await page.click("#phoneInput", { clickCount: 3 });
  await page.type("#phoneInput", "01001234567");
  await page.click("[data-sheet=phone-save]");
  await new Promise((r) => setTimeout(r, 200));
  ok("phone user is 01001234567", (await email()) === "01001234567" && await signed());
  ok("phone has no calendar switch", await page.evaluate(() => document.getElementById("meetingsToggle").disabled));
  await page.evaluate(() => document.getElementById("signOutBtn").click());
  await new Promise((r) => setTimeout(r, 200));
  ok("phone sign-out", !(await signed()));

  await page.keyboard.press("Escape");
  await page.evaluate(() => document.getElementById("drawerClose").click());
  await page.click("#note");
  await page.type("#note", "buy milk and bread");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 300));
  let text = await body();
  ok("shopping list added", /milk/i.test(text) && /bread/i.test(text));

  await page.click("#note");
  await page.type("#note", "pressure 9am and 9pm");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 300));
  text = await body();
  ok("two doses", /pressure|09:00|9:00/i.test(text) && /21:00|9:00/.test(text));

  await page.click("#note");
  await page.type("#note", "electricity bill 850 EGP");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 300));
  text = await body();
  ok("bill added", /electricity/i.test(text) && /850/.test(text));

  await page.evaluate(() => {
    const input = document.getElementById("search");
    input.value = "milk";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 200));
  text = await body();
  ok("search keeps milk", /milk/i.test(text) && !/electricity/i.test(text));
  await page.evaluate(() => document.getElementById("clearSearch").click());
  await new Promise((r) => setTimeout(r, 200));

  const card = await page.$("article h2");
  ok("a card is on the list", !!card);
  await page.evaluate(() => {
    const milk = [...document.querySelectorAll("article")].find((el) => /buy milk/i.test(el.innerText));
    milk.querySelector("[data-act='subtask-toggle']").click();
  });
  await new Promise((r) => setTimeout(r, 150));
  ok("shopping check toggles", await page.evaluate(() => !!document.querySelector(".check-item.done")));

  await page.evaluate(() => {
    const bill = [...document.querySelectorAll("article")].find((el) => /electricity/i.test(el.innerText));
    bill.querySelector("[data-act=done]").click();
  });
  await new Promise((r) => setTimeout(r, 200));
  ok("done toast", /done|marked/i.test(await page.evaluate(() => document.getElementById("toastMsg").textContent)));
  await page.click("#toastUndo");
  await new Promise((r) => setTimeout(r, 200));
  ok("undo restores the bill", /electricity/i.test(await body()));

  await page.evaluate(() => {
    const dose = [...document.querySelectorAll("article")].find((el) => /pressure/i.test(el.innerText));
    dose.querySelector("[data-act=snooze]").click();
  });
  await page.waitForSelector("[data-sheet=snooze]");
  const snooze = await page.evaluate(() => {
    const btn = document.querySelector("[data-sheet=snooze][data-to=tomorrow]");
    if (btn) btn.click();
    return {
      found: !!btn,
      hidden: document.getElementById("sheet").hidden,
      list: document.getElementById("list").innerText.slice(0, 180),
    };
  });
  ok("snooze moves a task to tomorrow", snooze.hidden && /Tomorrow/.test(snooze.list));

  await page.evaluate(() => {
    const dose = [...document.querySelectorAll("article")].find((el) => /pressure/i.test(el.innerText));
    dose.querySelector("[data-act=phone]").click();
  });
  await page.waitForSelector("[data-sheet=phone-ics]");
  ok("phone reminder sheet", true);
  await page.click("[data-sheet=close]");

  await page.evaluate(() => { window.__mail = "marwa@gmail.com"; });
  await menu(page);
  await page.evaluate(() => document.getElementById("signInBtn").click());
  await new Promise((r) => setTimeout(r, 200));
  ok("back in as marwa before the calendar", (await email()) === "marwa@gmail.com");
  await page.evaluate(() => {
    state.briefing = { fx: { usd_egp: 50 } };
    document.querySelector("[data-pin=convert]").click();
  });
  await page.evaluate(() => document.getElementById("drawerClose").click());
  await page.waitForSelector("#convUsd", { visible: true });
  await page.click("#convUsd");
  await page.type("#convUsd", "10");
  await new Promise((r) => setTimeout(r, 200));
  const egp = await page.$eval("#convEgp", (el) => el.value);
  ok("converter fills EGP", Number(egp) > 0);

  await menu(page);
  await page.evaluate(() => document.querySelector("[data-set=dark]").click());
  ok("dark theme", await page.evaluate(() => document.documentElement.dataset.theme === "dark"));
  await page.select("#lang", "ar");
  ok("arabic direction", await page.evaluate(() => document.documentElement.dir === "rtl"));
  await page.select("#lang", "en");
  const calInfo = await page.evaluate(async () => {
    const method = localStorage.getItem("lazem.signin.v1");
    document.getElementById("meetingsToggle").click();
    await new Promise((r) => setTimeout(r, 500));
    return {
      method,
      on: document.getElementById("meetingsToggle").getAttribute("aria-checked"),
      note: document.getElementById("meetingsNote").textContent,
      list: document.getElementById("list").innerText.slice(0, 200),
    };
  });
  ok("calendar event from the signed-in mailbox", /Dentist/.test(calInfo.list) && /Maadi/.test(calInfo.list));
  const calOff = await page.evaluate(async () => {
    document.getElementById("meetingsToggle").click();
    await new Promise((r) => setTimeout(r, 300));
    return document.getElementById("list").innerText;
  });
  ok("calendar off removes the meeting", !/Dentist/.test(calOff));
  await page.evaluate(() => document.getElementById("drawerClose").click());

  await menu(page);
  await page.evaluate(() => document.getElementById("shareBtn") && document.getElementById("drawerClose").click());
  const shareVisible = await page.evaluate(() => !document.getElementById("shareBtn").hidden && document.getElementById("listHead") && !document.getElementById("listHead").hidden);
  if (shareVisible) {
    await page.evaluate(() => document.getElementById("shareBtn").click());
    await page.waitForSelector("#shareUrl");
    const shareUrl = await page.$eval("#shareUrl", (el) => el.value);
    ok("share sheet has a link", shareUrl.includes("#s="));
    await page.click("[data-sheet=close]");
    const other = await browser.newPage();
    await other.goto(shareUrl, { waitUntil: "networkidle0" });
    await other.waitForSelector("[data-sheet=import]");
    await other.evaluate(() => document.querySelector("[data-sheet=import]").click());
    await new Promise((r) => setTimeout(r, 300));
    ok("second person imports the shared list", /milk/i.test(await other.evaluate(() => document.getElementById("list").innerText)));
    await other.close();
  } else {
    ok("share sheet has a link", false);
  }

  await menu(page);
  await page.evaluate(() => document.getElementById("addInstallBtn").click());
  await page.waitForSelector("#instAmount");
  await page.select("#instProvider", "ValU");
  await page.click("#instAmount");
  await page.type("#instAmount", "2500");
  await page.click("#instMonths", { clickCount: 3 });
  await page.type("#instMonths", "6");
  await page.click("[data-sheet=install-save]");
  await new Promise((r) => setTimeout(r, 250));
  ok("installment is on the list", /ValU/i.test(await body()) && /2500/.test(await body()));

  await menu(page);
  await page.evaluate(() => document.getElementById("pasteSmsBtn").click());
  await page.waitForSelector("#smsText");
  await page.click("#smsText");
  await page.type("#smsText", "school trip 300 EGP");
  await page.click("[data-sheet=sms-parse]");
  await new Promise((r) => setTimeout(r, 300));
  ok("sms becomes a task", /school trip/i.test(await body()) && /300/.test(await body()));

  await page.evaluate(() => document.querySelector("#filters [data-filter=bill]").click());
  await new Promise((r) => setTimeout(r, 150));
  ok("bill filter hides the shopping", !/milk/i.test(await body()) && /electricity/i.test(await body()));
  await page.evaluate(() => document.querySelector("#filters [data-filter=open]").click());

  const filters = ["medicine", "school", "errand", "done", "health", "work"];
  for (const name of filters) {
    await page.evaluate((n) => document.querySelector("#filters [data-filter='" + n + "']").click(), name);
    const on = await page.evaluate((n) => document.querySelector("#filters [data-filter='" + n + "']").classList.contains("on"), name);
    ok("filter " + name, on);
  }
  await page.evaluate(() => document.querySelector("#filters [data-filter=open]").click());

  const agenda = await page.evaluate(() => {
    const days = [...document.querySelectorAll("#agenda [data-day]")];
    const hit = days.find((d) => d.querySelector(".dc")) || days[1];
    hit.click();
    return { days: days.length, on: document.querySelector("#agenda .day.on") !== null };
  });
  ok("week strip has 7 days", agenda.days === 7);
  ok("a day filters the list", agenda.on);
  await page.evaluate(() => { const on = document.querySelector("#agenda .day.on"); if (on) on.click(); });

  await page.select("#sortSel", "amount");
  ok("sort by amount", await page.evaluate(() => document.getElementById("sortSel").value === "amount"));
  await page.select("#sortSel", "az");
  ok("sort by name", await page.evaluate(() => document.getElementById("sortSel").value === "az"));
  await page.select("#sortSel", "due");

  await page.evaluate(() => {
    window.__downloads = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute("download")) {
        window.__downloads.push(this.download || "");
        return;
      }
      return orig.apply(this, arguments);
    };
    window.open = (url) => { window.__opened = url; return null; };
  });

  const cardActs = await page.evaluate(() => {
    const milk = [...document.querySelectorAll("article")].find((el) => /buy milk/i.test(el.innerText));
    const q = (sel) => milk.querySelector(sel);
    q("[data-act=pin]").click();
    const pinned = milk.querySelector("[data-act=pin]").classList.contains("on") || [...document.querySelectorAll("article")].find((el) => /buy milk/i.test(el.innerText)).querySelector("[data-act=pin]").classList.contains("on");
    const card = [...document.querySelectorAll("article")].find((el) => /buy milk/i.test(el.innerText));
    card.querySelector("[data-act=repeat]").click();
    const card2 = [...document.querySelectorAll("article")].find((el) => /buy milk/i.test(el.innerText));
    const daily = /daily|يوم/i.test(card2.innerText);
    card2.querySelector("[data-act=resched][data-to=today]").click();
    const card3 = [...document.querySelectorAll("article")].find((el) => /buy milk/i.test(el.innerText));
    const todayDue = /Today/.test(card3.innerText);
    const input = card3.querySelector(".subtask-input");
    input.value = "eggs";
    card3.querySelector("[data-act=subtask-add]").click();
    const card4 = [...document.querySelectorAll("article")].find((el) => /buy milk/i.test(el.innerText));
    const eggs = /eggs/i.test(card4.innerText);
    const del = [...card4.querySelectorAll("[data-act=subtask-del]")].find((b) => /eggs/i.test(b.parentElement.innerText));
    if (del) del.click();
    const card5 = [...document.querySelectorAll("article")].find((el) => /buy milk/i.test(el.innerText));
    const eggsGone = !/eggs/i.test(card5.innerText);
    card5.querySelector(".place-input").value = "Maadi";
    card5.querySelector(".place-input").dispatchEvent(new Event("input", { bubbles: true }));
    card5.querySelector("[data-act=map]").click();
    card5.querySelector("[data-act=ics]").click();
    const title = card5.querySelector(".edit-title");
    title.value = "buy milk and eggs";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    return { pinned, daily, todayDue, eggs, eggsGone, map: window.__opened || "", ics: (window.__downloads || []).some((n) => n.endsWith(".ics")) };
  });
  ok("pin a card", cardActs.pinned);
  ok("repeat becomes daily", cardActs.daily);
  ok("reschedule to today", cardActs.todayDue);
  ok("add a checklist item", cardActs.eggs);
  ok("remove a checklist item", cardActs.eggsGone);
  ok("map opens the place", /Maadi/i.test(cardActs.map));
  ok("card calendar file", cardActs.ics);

  await page.evaluate(() => {
    const dose = [...document.querySelectorAll("article")].find((el) => /pressure/i.test(el.innerText));
    dose.querySelector("[data-act=snooze]").click();
  });
  await page.waitForSelector("[data-sheet=snooze][data-to=later]");
  await page.evaluate(() => document.querySelector("[data-sheet=snooze][data-to=later]").click());
  await new Promise((r) => setTimeout(r, 200));
  ok("snooze later sets a time", await page.evaluate(() => {
    const dose = [...document.querySelectorAll("article")].find((el) => /pressure/i.test(el.innerText));
    return /\d{2}:\d{2}/.test(dose.innerText);
  }));
  await page.evaluate(() => {
    const dose = [...document.querySelectorAll("article")].find((el) => /pressure/i.test(el.innerText));
    dose.querySelector("[data-act=snooze]").click();
  });
  await page.waitForSelector("[data-sheet=snooze][data-to=tonight]");
  await page.evaluate(() => document.querySelector("[data-sheet=snooze][data-to=tonight]").click());
  await new Promise((r) => setTimeout(r, 200));
  ok("snooze tonight is 20:00", /20:00/.test(await body()));

  await page.evaluate(() => {
    const trip = [...document.querySelectorAll("article")].find((el) => /school trip/i.test(el.innerText));
    trip.querySelector("[data-act=remove]").click();
  });
  await new Promise((r) => setTimeout(r, 150));
  ok("remove takes the task off", !/school trip/i.test(await body()));
  await page.click("#toastUndo");
  await new Promise((r) => setTimeout(r, 200));
  ok("undo puts the task back", /school trip/i.test(await body()));

  await page.evaluate(() => {
    const trip = [...document.querySelectorAll("article")].find((el) => /school trip/i.test(el.innerText));
    trip.querySelector("[data-act=done]").click();
  });
  await page.evaluate(() => document.querySelector("#filters [data-filter=done]").click());
  await new Promise((r) => setTimeout(r, 150));
  ok("done filter shows the finished task", /school trip/i.test(await body()));
  await page.click("#clearDoneBtn");
  await new Promise((r) => setTimeout(r, 150));
  ok("clear completed", !/school trip/i.test(await body()));
  await page.click("#toastUndo");
  await page.evaluate(() => document.querySelector("#filters [data-filter=open]").click());

  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const photo = await page.evaluate(async (src) => {
    const milk = [...document.querySelectorAll("article")].find((el) => /milk/i.test(el.innerText));
    milk.querySelector("[data-act=photo-add]").click();
    const input = document.getElementById("cardPhotoInput");
    const blob = await (await fetch(src)).blob();
    const file = new File([blob], "note.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const card = [...document.querySelectorAll("article")].find((el) => /milk/i.test(el.innerText));
    const thumb = card.querySelector("[data-act=photo-view]");
    if (thumb) thumb.click();
    await new Promise((r) => setTimeout(r, 200));
    const open = !document.getElementById("lightbox").hidden;
    document.getElementById("lightboxClose").click();
    card.querySelector("[data-act=photo-del]").click();
    await new Promise((r) => setTimeout(r, 150));
    const card2 = [...document.querySelectorAll("article")].find((el) => /milk/i.test(el.innerText));
    return { open, gone: !card2.querySelector("[data-act=photo-view]") };
  }, png);
  ok("photo opens", photo.open);
  ok("photo removed", photo.gone);

  await page.evaluate(() => document.getElementById("insightsToggle").click());
  ok("insights open", await page.evaluate(() => document.getElementById("insightsToggle").getAttribute("aria-expanded") === "true"));
  await page.evaluate(() => document.getElementById("insightsToggle").click());

  await menu(page);
  for (const theme of ["girly", "simple", "classic", "dark"]) {
    await page.evaluate((name) => document.querySelector("[data-set='" + name + "']").click(), theme);
    ok("theme " + theme, await page.evaluate((name) => document.documentElement.dataset.theme === name, theme));
  }
  const remind = await page.evaluate(() => {
    try {
      Object.defineProperty(Notification, "permission", { configurable: true, get() { return "granted"; } });
    } catch (e) {
      return "lock:" + e.message;
    }
    document.getElementById("remindBtn").click();
    return document.getElementById("remindBtn").classList.contains("on") ? "on" : "off";
  });
  ok("reminders turn on", remind === "on");

  await page.evaluate(() => document.getElementById("autoSmsBtn").click());
  await page.waitForSelector("#autoUrl");
  ok("auto-add from SMS shows a link", (await page.$eval("#autoUrl", (el) => el.value)).includes("?sms="));
  await page.click("[data-sheet=close]");

  await menu(page);
  await page.evaluate(() => document.getElementById("icsBtn").click());
  ok("add all to calendar", await page.evaluate(() => window.__downloads.some((n) => n.endsWith(".ics"))));
  await page.evaluate(() => document.getElementById("exportBtn").click());
  ok("export a backup", await page.evaluate(() => window.__downloads.some((n) => n.endsWith(".json"))));

  const restored = await page.evaluate(() => {
    const raw = JSON.stringify({ app: "lazem", version: 3, tasks: [{ id: "restored1", title: "restored from backup", raw: "restored from backup", category: "note", done: false }], shortcuts: ["buy eggs"] });
    const input = document.getElementById("importFile");
    const file = new File([raw], "lazem-backup.json", { type: "application/json" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  await new Promise((r) => setTimeout(r, 300));
  ok("restore from backup", restored && /restored from backup/i.test(await body()) && await page.evaluate(() => (window.__alert || "").length > 0));

  await page.evaluate(() => { window.prompt = () => "buy eggs"; document.querySelector("[data-shortcut-new]").click(); });
  ok("new shortcut", await page.evaluate(() => !!document.querySelector("[data-shortcut-add='buy eggs']")));
  await page.evaluate(() => document.querySelector("[data-shortcut-add='buy eggs']").click());
  await new Promise((r) => setTimeout(r, 250));
  ok("shortcut adds a task", /eggs/i.test(await body()));
  await page.evaluate(() => document.querySelector("[data-shortcut-del='buy eggs']").click());
  ok("shortcut removed", await page.evaluate(() => !document.querySelector("[data-shortcut-add='buy eggs']")));

  const icsOk = await page.evaluate(() => {
    const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Parent meeting\nDTSTART:20260926T100000\nLOCATION:School\nEND:VEVENT\nEND:VCALENDAR";
    const input = document.getElementById("icsImportFile");
    const file = new File([ics], "school.ics", { type: "text/calendar" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  });
  await page.waitForSelector("[data-sheet=import]");
  await page.evaluate(() => document.querySelector("[data-sheet=import]").click());
  await new Promise((r) => setTimeout(r, 250));
  ok("import a calendar file", icsOk && /Parent meeting/i.test(await body()));

  await page.click("#convEgp", { clickCount: 3 });
  await page.type("#convEgp", "100");
  await new Promise((r) => setTimeout(r, 150));
  ok("EGP converts back to dollars", Number(await page.$eval("#convUsd", (el) => el.value)) > 0);

  await menu(page);
  await page.evaluate(() => document.querySelector("[data-pin=weather]").click());
  await page.evaluate(() => document.querySelector("[data-pin=due]").click());
  ok("pin due today", await page.evaluate(() => document.querySelector("[data-pin=due]").classList.contains("on")));
  const hiddenConn = await page.evaluate(() => document.getElementById("connCalBtn").hidden && document.getElementById("connClassBtn").hidden);
  ok("calendar and classroom stay hidden", hiddenConn);
  const house = await page.evaluate(async () => {
    const start = document.getElementById("houseStartBtn");
    const join = document.getElementById("houseJoinBtn");
    const leave = document.getElementById("houseLeaveBtn");
    start.click();
    await new Promise((r) => setTimeout(r, 400));
    const afterStart = document.getElementById("houseLeaveBtn").hidden;
    document.getElementById("toastMsg").textContent = "";
    document.getElementById("houseCode").value = "ABCD";
    join.click();
    await new Promise((r) => setTimeout(r, 1200));
    const toast = document.getElementById("toastMsg").textContent;
    leave.click();
    return { startThere: !!start, joinThere: !!join, stillLocal: afterStart, toast };
  });
  ok("household start is on the menu", house.startThere && house.joinThere);
  ok("household start does not invent a code", house.stillLocal);
  ok("join without a cloud account stays on this list", /restored from backup|Parent meeting|eggs/i.test(await body()));

  await page.evaluate(() => document.getElementById("micBtn").click());
  await new Promise((r) => setTimeout(r, 200));
  ok("voice fills the box", (await page.$eval("#note", (el) => el.value)).toLowerCase().includes("school"));

  const help = await browser.newPage();
  await help.goto("file://" + path.resolve(__dirname, "../static/help.html"), { waitUntil: "domcontentloaded" });
  ok("how to use page", /Outlook|Google|calendar/i.test(await help.evaluate(() => document.body.innerText)));
  const privacy = await browser.newPage();
  await privacy.goto("file://" + path.resolve(__dirname, "../static/privacy.html"), { waitUntil: "domcontentloaded" });
  ok("privacy page", /privacy|calendar|Google/i.test(await privacy.evaluate(() => document.body.innerText)));
  await help.close();
  await privacy.close();

  console.log(fails.length ? "FAILED " + fails.join(", ") : "ALL PASS");
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
