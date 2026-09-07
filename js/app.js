(function () {
  "use strict";

  var STORAGE_KEY = "ma-deca-board-v1";
  var CATEGORIES = ["Conference","Competition","Fundraiser","Meeting","Community Service","Social","Workshop","Other"];
  var CAT_COLOR = {
    "Conference": "#0a3d8f", "Competition": "#e0a800", "Fundraiser": "#1f9d6b",
    "Meeting": "#64748b", "Community Service": "#0e8a9b", "Social": "#b5338a",
    "Workshop": "#d2691e", "Other": "#677189"
  };

  var state = { events: [], search: "", chapter: "", category: "", sort: "soonest", range: "upcoming", view: "list", mine: false, photos: [] };
  var locPick = null;            // {label, lat, lng} captured from the address autocomplete
  var map = null, markerLayer = null, geoCache = {};
  var pendingEventId = null;   // event id from a shared ?event=... link

  // ============================================================
  //  SUPABASE BACKEND CONFIG  — paste your project values here.
  //  Leave blank to keep the app in local (this-device-only) mode.
  //  See SETUP.md for the step-by-step guide.
  // ============================================================
  var SUPABASE_URL = "https://esdwajfppazlwzlikuie.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZHdhamZwcGF6bHd6bGlrdWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NTU5NzgsImV4cCI6MjA5ODMzMTk3OH0.GX-6TayuoGLuY6MWnrtwqDs8QS3-YUybY6ienHUtboI";
  var BUCKET = "event-photos";
  var sb = null, USE_CLOUD = false;

  // Admin: posting is open to everyone; editing/deleting is admin-only.
  // The password is NOT stored here — it is verified server-side by Supabase Auth,
  // and the database enforces that only this hidden admin account can edit/delete.
  var ADMIN_EMAIL = "admin@madeca-board.app";
  var currentUser = null, isAdmin = false, memberMode = "signin";

  // Google Identity Services (renders Google's own button on THIS domain, so the
  // consent screen shows our app name — not the Supabase URL). This is the Web
  // OAuth client ID from Google Cloud → Clients.
  var GOOGLE_CLIENT_ID = "668747349151-p44qfdtbkov1tk0qjb02gg1dgrc13bk4.apps.googleusercontent.com";
  var gisReady = false, gisNonce = null;

  function normalize(e) {
    // migrate single `photo` -> `photos` array; ensure fields exist
    if (!Array.isArray(e.photos)) e.photos = e.photo ? [e.photo] : [];
    delete e.photo;
    e.photos = safePhotos(e.photos);
    if (typeof e.lat !== "number") e.lat = null;
    if (typeof e.lng !== "number") e.lng = null;
    if (typeof e.pinned !== "boolean") e.pinned = false;
    if (typeof e.igPosted !== "boolean") e.igPosted = false;
    return e;
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      state.events = (raw ? JSON.parse(raw) : seed()).map(normalize);
      if (!raw) save();
    } catch (e) { state.events = []; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events)); }
    catch (e) { toast("Couldn't save — browser storage is full. Try smaller or fewer photos.", "error"); }
  }
  function seed() {
    var now = Date.now();
    return [
      { id:"demo1", chapter:"Massachusetts DECA", category:"Conference",
        title:"MA DECA State Career Development Conference",
        date:"2027-03-04", time:"08:00", location:"Boston Marriott Copley Place, Boston, MA",
        lat:42.3478, lng:-71.0807,
        description:"Three days of competitive events, leadership workshops, and networking with chapters from across the state. Qualify here for ICDC! Registration is through your chapter advisor.",
        link:"https://madeca.org", igRequest:true, photos:[], created:now },
      { id:"demo2", chapter:"Sample High DECA", category:"Fundraiser",
        title:"Spirit Week Bake Sale",
        date:"2026-06-30", time:"11:30", location:"Worcester, MA",
        lat:42.2626, lng:-71.8023,
        description:"Stop by our table during all lunch periods! Proceeds fund our trip to the International Career Development Conference. Cash and Venmo accepted.",
        link:"", igRequest:false, photos:[], created:now - 100000 }
    ];
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  // Photo URLs end up inside style="background-image:url('…')", so they must be
  // provably inert. Cloud mode accepts only our own Storage bucket with the path
  // charset the uploader produces; local mode accepts only base64 image data URLs.
  // Anything else is dropped — a member can write arbitrary strings into photos[]
  // through the REST API, bypassing the upload path entirely.
  function safePhotoUrl(u) {
    u = String(u == null ? "" : u);
    if (USE_CLOUD) {
      var prefix = SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/";
      return (u.indexOf(prefix) === 0 && /^[A-Za-z0-9._\-\/]+$/.test(u.slice(prefix.length))) ? u : "";
    }
    return /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\/=]+$/i.test(u) ? u : "";
  }
  function safePhotos(list) {
    return (Array.isArray(list) ? list : []).map(safePhotoUrl).filter(Boolean);
  }
  function uid() { return "e" + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function parseDate(d) {
    if (!d) return null;
    var p = d.split("-"); if (p.length !== 3) return null;
    return new Date(+p[0], +p[1]-1, +p[2]);
  }
  function formatDate(d, t) {
    var dt = parseDate(d); if (!dt) return "";
    var out = dt.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
    if (t) {
      var tp = t.split(":"), h = +tp[0], ampm = h >= 12 ? "PM" : "AM", h12 = h % 12 || 12;
      out += " · " + h12 + ":" + tp[1] + " " + ampm;
    }
    return out;
  }

  var ICON = {
    cal: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    loc: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    ig: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.6-2.4a2 2 0 0 1-.4-1.2V8a2 2 0 0 1 2-2V4H6v2a2 2 0 0 1 2 2v5.4a2 2 0 0 1-.4 1.2L6 17"/></svg>',
    logout: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    user: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  };

  function rebuildChapterFilter() {
    var sel = $("chapterFilter"), current = state.chapter, names = {};
    state.events.forEach(function (e) { if (e.chapter) names[e.chapter] = true; });
    var list = Object.keys(names).sort(function (a,b) { return a.localeCompare(b); });
    sel.innerHTML = '<option value="">All chapters</option>' + list.map(function (n) { return '<option value="'+esc(n)+'">'+esc(n)+'</option>'; }).join("");
    sel.value = current;
  }
  function rebuildTabs() {
    var counts = {};
    state.events.forEach(function (e) { counts[e.category] = (counts[e.category]||0)+1; });
    var html = '<button class="tab '+(state.category===""?"active":"")+'" data-cat="">All <span class="count">'+state.events.length+'</span></button>';
    CATEGORIES.forEach(function (c) {
      if (!counts[c]) return;
      html += '<button class="tab '+(state.category===c?"active":"")+'" data-cat="'+esc(c)+'">'+
        '<span class="dot" style="background:'+CAT_COLOR[c]+'"></span>'+esc(c)+' <span class="count">'+counts[c]+'</span></button>';
    });
    $("catTabs").innerHTML = html;
  }
  function today0() { var d = new Date(); d.setHours(0,0,0,0); return d; }
  function inRange(e) {
    if (state.range === "all") return true;
    var dt = parseDate(e.date);
    if (!dt) return state.range === "upcoming";  // date TBD counts as upcoming; hidden from dated windows and Past
    var days = (dt - today0()) / 86400000;
    if (state.range === "past") return days < 0;
    if (state.range === "upcoming") return days >= 0;
    if (state.range === "week") return days >= 0 && days <= 7;
    if (state.range === "month") return days >= 0 && days <= 30;
    return true;
  }
  function filtered() {
    var q = state.search.trim().toLowerCase();
    var list = state.events.filter(function (e) {
      if (state.mine && !(currentUser && e.user_id === currentUser.id)) return false;
      if (state.chapter && e.chapter !== state.chapter) return false;
      if (state.category && e.category !== state.category) return false;
      if (!inRange(e)) return false;
      if (q) {
        var hay = (e.title+" "+e.chapter+" "+e.description+" "+(e.location||"")+" "+e.category).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    list.sort(function (a,b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;   // pinned always first
      if (state.sort === "newest") return b.created - a.created;
      if (state.sort === "chapter") return a.chapter.localeCompare(b.chapter);
      if (state.sort === "soonest") return (a.date||"9999").localeCompare(b.date||"9999");
      return 0;
    });
    return list;
  }
  function render() {
    rebuildChapterFilter(); rebuildTabs(); updateIgButton();
    $("statNum").textContent = state.events.length;
    var list = filtered(), board = $("board"), empty = $("emptyState"), mapWrap = $("mapWrap");
    var isMap = state.view === "map";
    mapWrap.style.display = isMap ? "block" : "none";
    board.style.display = isMap ? "none" : "grid";

    if (state.events.length === 0) {
      board.innerHTML = ""; empty.style.display = "block"; mapWrap.style.display = "none"; $("countLine").textContent = ""; return;
    }
    empty.style.display = "none";
    var filtering = !!(state.search.trim() || state.chapter || state.category || state.mine);
    var n = list.length, noun = n === 1 ? " event" : " events";
    $("countLine").textContent =
      state.mine ? n + noun + " you posted" :
      (!filtering && state.range === "upcoming") ? n + " upcoming" + noun :
      (n !== state.events.length) ? n + noun + " matching your filters" :
      n + noun + " on the board";

    if (isMap) { renderMap(list); return; }

    if (list.length === 0) {
      var emptyHTML;
      if (state.mine) {
        var mineTotal = state.events.filter(function (e) { return currentUser && e.user_id === currentUser.id; }).length;
        emptyHTML = mineTotal
          ? '<h3>None of your events match</h3><p><a href="#" data-range="all" data-clear="1">Show all ' + mineTotal + ' of your events</a></p>'
          : '<h3>You haven\'t posted any events yet</h3><p>Click <strong>Post an Event</strong> to add your chapter\'s first one.</p>';
      } else if (!filtering && state.range === "upcoming") {
        emptyHTML = '<h3>Nothing upcoming right now</h3><p><a href="#" data-range="past">See past events</a> or <a href="#" data-range="all">show everything</a> &mdash; or be the first chapter to post one.</p>';
      } else {
        emptyHTML = '<h3>No matches</h3><p>Try clearing the search or filters.</p>';
      }
      board.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' + emptyHTML + '</div>';
      Array.prototype.forEach.call(board.querySelectorAll("[data-range]"), function (a) {
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          state.range = a.getAttribute("data-range"); $("rangeSelect").value = state.range;
          if (a.hasAttribute("data-clear")) { state.search = ""; state.chapter = ""; state.category = ""; $("searchInput").value = ""; $("chapterFilter").value = ""; }
          render();
        });
      });
      return;
    }
    board.innerHTML = list.map(cardHTML).join("");
    Array.prototype.forEach.call(board.querySelectorAll("[data-edit]"), function (b) { b.addEventListener("click", function () { openModal(b.getAttribute("data-edit")); }); });
    Array.prototype.forEach.call(board.querySelectorAll("[data-del]"), function (b) { b.addEventListener("click", function () { removeEvent(b.getAttribute("data-del")); }); });
    Array.prototype.forEach.call(board.querySelectorAll("[data-share]"), function (b) { b.addEventListener("click", function () { shareEvent(b.getAttribute("data-share")); }); });
    Array.prototype.forEach.call(board.querySelectorAll("[data-pin]"), function (b) { b.addEventListener("click", function () { togglePin(b.getAttribute("data-pin")); }); });
    Array.prototype.forEach.call(board.querySelectorAll("[data-photos]"), function (el) { el.addEventListener("click", function () { openLightbox(el.getAttribute("data-photos")); }); });
    Array.prototype.forEach.call(board.querySelectorAll("[data-detail]"), function (el) { el.addEventListener("click", function () { openDetail(el.getAttribute("data-detail")); }); });
  }
  function cardHTML(e) {
    var color = CAT_COLOR[e.category] || CAT_COLOR.Other;
    var photos = e.photos || [];
    var hasImg = photos.length > 0;
    var photoStyle = hasImg ? ' style="background-image:url(\''+photos[0].replace(/'/g,"%27")+'\')"' : '';
    var dt = parseDate(e.date);
    var dateTab = dt ? '<div class="date-tab"><div class="mo">'+MONTHS[dt.getMonth()]+'</div><div class="dy">'+dt.getDate()+'</div></div>' : '';
    var countBadge = photos.length > 1
      ? '<span class="photo-count"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'+photos.length+'</span>'
      : '';
    var photoAttr = hasImg ? ' data-photos="'+e.id+'"' : '';
    var pinnedBadge = e.pinned ? '<span class="pin-badge">'+ICON.pin+'Pinned</span>' : '';
    var photo = '<div class="card-photo'+(hasImg?' has-img':'')+'"'+photoStyle+photoAttr+'>'+
        '<div class="frame"></div>'+
        '<span class="cat-label"><span class="dot" style="background:'+color+'"></span>'+esc(e.category)+'</span>'+
        dateTab + countBadge + pinnedBadge +
      '</div>';
    var meta = "";
    if (e.date) meta += '<div class="row">'+ICON.cal+'<span>'+esc(formatDate(e.date, e.time))+'</span></div>';
    if (e.location) meta += '<div class="row">'+ICON.loc+'<span>'+esc(e.location)+'</span></div>';
    var igFlag = e.igRequest
      ? (e.igPosted
          ? '<div class="ig-flag posted">'+ICON.ig+'Featured on Instagram</div>'
          : '<div class="ig-flag">'+ICON.ig+'Instagram feature requested</div>')
      : '';
    var foot = e.link
      ? '<a class="btn btn-primary signup" href="'+esc(e.link)+'" target="_blank" rel="noopener">Sign up / Info</a>'
      : '<span class="nolink">No sign-up link</span>';
    var canManage = !USE_CLOUD || (currentUser && (e.user_id === currentUser.id || isAdmin));
    var pinBtn = ((!USE_CLOUD) || isAdmin)
      ? '<button class="icon-btn'+(e.pinned?' pinned':'')+'" data-pin="'+e.id+'" title="'+(e.pinned?'Unpin':'Pin to top')+'">'+ICON.pin+'</button>'
      : '';
    var ownerBtns = canManage
      ? '<button class="icon-btn" data-edit="'+e.id+'" title="Edit">'+ICON.edit+'</button>'+
        '<button class="icon-btn del" data-del="'+e.id+'" title="Delete">'+ICON.trash+'</button>'
      : '';
    return '<article class="card'+(e.pinned?' card-pinned':'')+'">'+photo+
      '<div class="card-body">'+
        '<div class="card-chapter"><span class="dia"></span>'+esc(e.chapter)+'</div>'+
        '<h3 class="card-title" data-detail="'+e.id+'">'+esc(e.title)+'</h3>'+
        (meta ? '<div class="card-meta">'+meta+'</div>' : '')+
        '<p class="card-desc">'+esc(e.description)+'</p>'+
        igFlag+
        '<div class="card-foot">'+foot+
          '<button class="icon-btn" data-share="'+e.id+'" title="Share">'+ICON.share+'</button>'+
          pinBtn + ownerBtns +
        '</div>'+
      '</div>'+
    '</article>';
  }

  function openModal(id) {
    clearErrors(); state.photos = []; locPick = null;
    if (id) {
      var ev = state.events.filter(function (e) { return e.id === id; })[0];
      if (!ev) return;
      $("modalTitle").textContent = "Edit Event"; $("submitBtn").textContent = "Save Changes";
      $("editId").value = ev.id;
      $("f_chapter").value = ev.chapter||""; $("f_category").value = ev.category||"Other";
      $("f_title").value = ev.title||""; $("f_date").value = ev.date||""; $("f_time").value = ev.time||"";
      $("f_location").value = ev.location||""; $("f_description").value = ev.description||"";
      $("f_link").value = ev.link||""; $("f_igRequest").checked = !!ev.igRequest;
      state.photos = (ev.photos || []).slice();
      // keep existing coordinates unless the location text is changed to a new picked address
      if (typeof ev.lat === "number") locPick = { label: ev.location || "", lat: ev.lat, lng: ev.lng };
    } else {
      $("modalTitle").textContent = "Post an Event"; $("submitBtn").textContent = "Post Event";
      $("eventForm").reset(); $("editId").value = "";
    }
    showPhotos();
    $("overlay").classList.add("open");
    setTimeout(function () { $("f_chapter").focus(); }, 50);
  }
  function closeModal() { $("overlay").classList.remove("open"); }
  function showPhotos() {
    var wrap = $("photoThumbs");
    wrap.innerHTML = state.photos.map(function (src, i) {
      return '<div class="thumb"><img src="'+esc(src)+'" alt="photo '+(i+1)+'" />'+
        (i === 0 ? '<span class="cover-tag">Cover</span>' : '')+
        '<button type="button" class="x" data-rm="'+i+'" aria-label="Remove">&times;</button></div>';
    }).join("");
    Array.prototype.forEach.call(wrap.querySelectorAll("[data-rm]"), function (b) {
      b.addEventListener("click", function () { state.photos.splice(+b.getAttribute("data-rm"), 1); showPhotos(); });
    });
  }
  function clearErrors() { Array.prototype.forEach.call(document.querySelectorAll(".field.invalid"), function (f) { f.classList.remove("invalid"); }); }
  function markInvalid(name) { var f = document.querySelector('.field[data-field="'+name+'"]'); if (f) f.classList.add("invalid"); }

  function handleSubmit(ev) {
    ev.preventDefault(); clearErrors();
    var chapter = $("f_chapter").value.trim(), title = $("f_title").value.trim(),
        desc = $("f_description").value.trim(), location = $("f_location").value.trim(), ok = true;
    if (!chapter) { markInvalid("chapter"); ok = false; }
    if (!title) { markInvalid("title"); ok = false; }
    if (!location) { markInvalid("location"); ok = false; }
    if (!desc) { markInvalid("description"); ok = false; }
    if (!ok) { var bad = document.querySelector(".field.invalid input, .field.invalid textarea"); if (bad) bad.focus(); return; }
    // use coordinates only if the picked address still matches the field text
    var lat = null, lng = null;
    if (locPick && locPick.label === location && typeof locPick.lat === "number") { lat = locPick.lat; lng = locPick.lng; }

    var id = $("editId").value;
    var data = {
      chapter: chapter, category: $("f_category").value, title: title,
      date: $("f_date").value, time: $("f_time").value, location: location, lat: lat, lng: lng,
      description: desc, link: $("f_link").value.trim(), igRequest: $("f_igRequest").checked,
      photos: state.photos.slice()
    };

    if (USE_CLOUD) {
      if (!currentUser) { closeModal(); openMember("signin"); return; }
      var btn = $("submitBtn"); var label = btn.textContent;
      btn.disabled = true; btn.textContent = "Saving…";
      uploadPhotos().then(function (urls) {
        var row = toRow(data, urls);
        if (id) return sb.from("events").update(row).eq("id", id);
        row.user_id = currentUser.id;
        return sb.from("events").insert(row);
      }).then(function (res) {
        if (res && res.error) throw res.error;
        btn.disabled = false; btn.textContent = label;
        closeModal(); reloadEvents();
      }).catch(function (err) {
        btn.disabled = false; btn.textContent = label;
        toast("Couldn't save: " + (err && err.message ? err.message : err), "error");
      });
      return;
    }

    // local mode
    if (id) { state.events = state.events.map(function (e) { return e.id === id ? Object.assign({}, e, data) : e; }); }
    else { data.id = uid(); data.created = Date.now(); state.events.unshift(data); }
    save(); closeModal(); render();
  }
  function removeEvent(id) {
    var ev = state.events.filter(function (e) { return e.id === id; })[0];
    if (!ev) return;
    confirmDialog({
      title: "Delete this event?",
      message: '"' + ev.title + '" will be removed from the board. This cannot be undone.',
      okLabel: "Delete", danger: true
    }).then(function (yes) {
      if (!yes) return;
      if (USE_CLOUD) {
        sb.from("events").delete().eq("id", id).then(function (res) {
          if (res.error) { toast("Couldn't delete: " + res.error.message, "error"); return; }
          reloadEvents(); toast("Event deleted");
        });
        return;
      }
      state.events = state.events.filter(function (e) { return e.id !== id; });
      save(); render(); toast("Event deleted");
    });
  }

  function addPhotos(files) {
    Array.prototype.forEach.call(files, function (file) {
      if (!file || file.type.indexOf("image/") !== 0) return;
      if (file.size > 6*1024*1024) { toast('"' + file.name + '" is over 6MB and was skipped', "error"); return; }
      var reader = new FileReader();
      reader.onload = function (e) { downscale(e.target.result, function (url) { state.photos.push(url); showPhotos(); }); };
      reader.readAsDataURL(file);
    });
  }
  function downscale(dataUrl, cb) {
    var img = new Image();
    img.onload = function () {
      var max = 1000, w = img.width, h = img.height;
      if (w <= max && h <= max) { cb(dataUrl); return; }
      var scale = Math.min(max/w, max/h), c = document.createElement("canvas");
      c.width = Math.round(w*scale); c.height = Math.round(h*scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      try { cb(c.toDataURL("image/jpeg", 0.82)); } catch (err) { cb(dataUrl); }
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }

  // ---------- Location autocomplete (Photon / OpenStreetMap — no API key needed) ----------
  function setupLocationAutocomplete() {
    var input = $("f_location"), box = $("locSuggest");
    var items = [], active = -1, timer = null, reqId = 0;

    function close() { box.classList.remove("open"); box.innerHTML = ""; items = []; active = -1; }
    function fmt(f) {
      var p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
      var first = p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || p.street || "";
      var rest = [p.city || p.town || p.village || p.county, p.state, p.postcode, p.country].filter(Boolean).join(", ");
      if (!first) { first = rest; rest = ""; }
      return { main: first, sub: rest, full: [first, rest].filter(Boolean).join(", "), lat: c[1], lng: c[0] };
    }
    function selectItem(it) {
      input.value = it.full;
      locPick = (typeof it.lat === "number") ? { label: it.full, lat: it.lat, lng: it.lng } : null;
      close();
    }
    function fetchSuggest(q) {
      var mine = ++reqId;
      // bias toward Massachusetts (lat/lon ~ Worcester) so local results rank first
      var url = "https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=6&lang=en&lat=42.36&lon=-71.66";
      fetch(url).then(function (r) { return r.json(); }).then(function (data) {
        if (mine !== reqId) return; // stale response
        items = (data.features || []).map(fmt).filter(function (x) { return x.full; });
        renderList();
      }).catch(function () { close(); });
    }
    function renderList() {
      if (!items.length) { close(); return; }
      box.innerHTML = items.map(function (it, i) {
        return '<div class="ac-item" data-i="' + i + '"><span class="pin">' + ICON.loc + '</span>' +
          '<span class="txt"><span class="main">' + esc(it.main) + '</span>' +
          (it.sub ? '<span class="sub">' + esc(it.sub) + '</span>' : '') + '</span></div>';
      }).join("");
      box.classList.add("open"); active = -1;
    }
    function highlight(nodes) { Array.prototype.forEach.call(nodes, function (n, i) { n.classList.toggle("active", i === active); }); }

    input.addEventListener("input", function () {
      var q = input.value.trim();
      if (timer) clearTimeout(timer);
      if (q.length < 3) { close(); return; }
      box.innerHTML = '<div class="ac-loading">Searching…</div>'; box.classList.add("open");
      timer = setTimeout(function () { fetchSuggest(q); }, 250);
    });
    input.addEventListener("keydown", function (e) {
      if (!box.classList.contains("open")) return;
      var nodes = box.querySelectorAll(".ac-item");
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, nodes.length - 1); highlight(nodes); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); highlight(nodes); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); selectItem(items[active]); }
      else if (e.key === "Escape") { close(); }
    });
    box.addEventListener("mousedown", function (e) {
      var el = e.target.closest(".ac-item"); if (!el) return;
      e.preventDefault();
      var it = items[+el.getAttribute("data-i")];
      if (it) selectItem(it);
    });
    // typing a different address invalidates the previously picked coordinates
    input.addEventListener("input", function () { if (locPick && input.value.trim() !== locPick.label) locPick = null; });
    input.addEventListener("blur", function () { setTimeout(close, 150); });
  }

  // ---------- Map (Leaflet + OpenStreetMap) ----------
  function ensureMap() {
    if (map || typeof L === "undefined") return;
    map = L.map("map", { scrollWheelZoom: false }).setView([42.2, -71.7], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }
  function popupHTML(e) {
    var img = (e.photos && e.photos[0]) ? '<div class="pp-img" style="background-image:url(\''+e.photos[0].replace(/'/g,"%27")+'\')"></div>' : '';
    var when = e.date ? '<div class="pp-meta">'+ICON.cal+'<span>'+esc(formatDate(e.date, e.time))+'</span></div>' : '';
    var where = e.location ? '<div class="pp-meta">'+ICON.loc+'<span>'+esc(e.location)+'</span></div>' : '';
    var link = e.link ? '<a href="'+esc(e.link)+'" target="_blank" rel="noopener">Sign up / Info &rarr;</a>' : '';
    return '<div class="pp">'+img+'<div class="pp-body">'+
      '<div class="pp-cat">'+esc(e.category)+'</div>'+
      '<div class="pp-title">'+esc(e.title)+'</div>'+
      '<div class="pp-chap">'+esc(e.chapter)+'</div>'+ when + where + link +
      '</div></div>';
  }
  function geocode(q, cb) {
    var key = q.toLowerCase();
    if (geoCache[key] !== undefined) { cb(geoCache[key]); return; }
    fetch("https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=1&lat=42.36&lon=-71.66")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var f = (d.features || [])[0], c = f && f.geometry && f.geometry.coordinates;
        geoCache[key] = c ? { lat: c[1], lng: c[0] } : null;
        cb(geoCache[key]);
      }).catch(function () { geoCache[key] = null; cb(null); });
  }
  function renderMap(list) {
    ensureMap();
    if (!map) return;
    markerLayer.clearLayers();
    var pts = [];
    function fit() { if (pts.length) map.fitBounds(pts, { padding: [45, 45], maxZoom: 14 }); }
    function place(e, lat, lng) {
      var icon = L.divIcon({ className: "deca-marker", html: "<span></span>", iconSize: [20, 20], iconAnchor: [10, 10] });
      L.marker([lat, lng], { icon: icon }).addTo(markerLayer).bindPopup(popupHTML(e));
      pts.push([lat, lng]); fit();
    }
    list.forEach(function (e) {
      if (typeof e.lat === "number" && typeof e.lng === "number") { place(e, e.lat, e.lng); }
      else if (e.location) { geocode(e.location, function (c) { if (c) place(e, c.lat, c.lng); }); }
    });
    setTimeout(function () { map.invalidateSize(); fit(); }, 80);
  }

  // ---------- Share ----------
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(function(){}); return; }
    var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }
  function eventUrl(id) {
    var base = (location.origin && location.origin !== "null") ? location.origin + location.pathname : location.href.split("?")[0];
    return base + "?event=" + encodeURIComponent(id);
  }
  function shareEvent(id) {
    var e = state.events.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var url = eventUrl(id);
    var text = e.title + " — " + e.chapter + (e.date ? " · " + formatDate(e.date, e.time) : "") + "\n" + url;
    if (navigator.share) {
      navigator.share({ title: e.title + " — MA DECA", text: e.title + " — " + e.chapter, url: url }).catch(function () {});
    } else {
      copyText(url); toast("Link copied — share it with friends!");
    }
  }

  // ---------- Event detail view (shareable) ----------
  function openDetail(id) {
    var e = state.events.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var photos = e.photos || [], color = CAT_COLOR[e.category] || CAT_COLOR.Other;
    var dt = parseDate(e.date);
    var dateTab = dt ? '<div class="date-tab"><div class="mo">'+MONTHS[dt.getMonth()]+'</div><div class="dy">'+dt.getDate()+'</div></div>' : '';
    var countBadge = photos.length > 1 ? '<span class="photo-count">'+photos.length+' photos</span>' : '';
    var catLabel = '<span class="cat-label"><span class="dot" style="background:'+color+'"></span>'+esc(e.category)+'</span>';
    var hero = photos.length
      ? '<div class="card-photo has-img" style="background-image:url(\''+photos[0].replace(/'/g,"%27")+'\')" data-photos="'+e.id+'"><div class="frame"></div>'+catLabel+dateTab+countBadge+'</div>'
      : '<div class="card-photo"><div class="frame"></div>'+catLabel+dateTab+'</div>';
    var meta = "";
    if (e.date) meta += '<div class="row">'+ICON.cal+'<span>'+esc(formatDate(e.date, e.time))+'</span></div>';
    if (e.location) meta += '<div class="row">'+ICON.loc+'<span>'+esc(e.location)+'</span></div>';
    var igFlag = e.igRequest
      ? (e.igPosted ? '<div class="ig-flag posted">'+ICON.ig+'Featured on Instagram</div>' : '<div class="ig-flag">'+ICON.ig+'Instagram feature requested</div>')
      : '';
    var signup = e.link ? '<a class="btn btn-primary" href="'+esc(e.link)+'" target="_blank" rel="noopener">Sign up / Info</a>' : '';
    $("detailBody").innerHTML = hero +
      '<div class="detail-inner">'+
        '<div class="card-chapter"><span class="dia"></span>'+esc(e.chapter)+'</div>'+
        '<h2 class="detail-title">'+esc(e.title)+'</h2>'+
        (meta ? '<div class="card-meta">'+meta+'</div>' : '')+
        igFlag +
        '<p class="detail-desc">'+esc(e.description)+'</p>'+
        '<div class="detail-actions">'+signup+
          '<button class="btn btn-ghost" id="detailShare">'+ICON.share+'Share</button>'+
        '</div>'+
      '</div>';
    var ph = $("detailBody").querySelector("[data-photos]");
    if (ph) ph.addEventListener("click", function () { openLightbox(e.id); });
    $("detailShare").addEventListener("click", function () { shareEvent(e.id); });
    $("detailOverlay").classList.add("open");
  }
  function closeDetail() { $("detailOverlay").classList.remove("open"); }
  function getParam(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }
  function openSharedIfAny() {
    if (!pendingEventId) return;
    var e = state.events.filter(function (x) { return x.id === pendingEventId; })[0];
    if (e) {
      openDetail(pendingEventId);
      pendingEventId = null;
      // strip only the ?event param — never touch an in-flight OAuth code/token
      try {
        var u = new URL(location.href);
        if (!u.searchParams.get("code") && !location.hash) {
          u.searchParams.delete("event");
          history.replaceState({}, "", u.pathname + (u.search ? u.search : ""));
        }
      } catch (err) {}
    }
  }

  // ---------- Lightbox ----------
  var lb = { photos: [], i: 0 };
  function openLightbox(id) {
    var e = state.events.filter(function (x) { return x.id === id; })[0];
    if (!e || !e.photos || !e.photos.length) return;
    lb.photos = e.photos; lb.i = 0;
    showLb(); $("lightbox").classList.add("open");
  }
  function showLb() {
    $("lbImg").src = lb.photos[lb.i];
    var multi = lb.photos.length > 1;
    $("lbPrev").style.display = multi ? "block" : "none";
    $("lbNext").style.display = multi ? "block" : "none";
    $("lbCount").style.display = multi ? "block" : "none";
    $("lbCount").textContent = (lb.i + 1) + " / " + lb.photos.length;
  }
  function lbStep(d) { lb.i = (lb.i + d + lb.photos.length) % lb.photos.length; showLb(); }
  function closeLb() { $("lightbox").classList.remove("open"); }

  // ---------- Toast ----------
  var toastTimer = null;
  function toast(msg, kind) {
    var t = $("toast"); t.textContent = msg; t.className = "toast show" + (kind ? " " + kind : "");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, kind === "error" ? 4200 : 2400);
  }

  // ---------- Confirm dialog (replaces window.confirm) ----------
  var confirmResolve = null;
  function confirmDialog(opts) {
    // opts: { title, message, okLabel, danger } → Promise<boolean>
    $("confirmTitle").textContent = opts.title || "Are you sure?";
    $("confirmMsg").textContent = opts.message || "";
    var ok = $("confirmOk");
    ok.textContent = opts.okLabel || "OK";
    ok.className = "btn " + (opts.danger ? "btn-danger" : "btn-primary");
    $("confirmOverlay").classList.add("open");
    // destructive actions start with focus on Cancel so a stray Enter can't delete
    setTimeout(function () { (opts.danger ? $("confirmCancel") : ok).focus(); }, 30);
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }
  function closeConfirm(result) {
    if (!$("confirmOverlay").classList.contains("open")) return;
    $("confirmOverlay").classList.remove("open");
    var r = confirmResolve; confirmResolve = null;
    if (r) r(!!result);
  }

  // ============================================================
  //  Backend (Supabase) — falls back to localStorage if unconfigured
  // ============================================================
  // Explicitly complete an OAuth redirect: pull tokens out of the URL hash,
  // establish the session, and clean the address bar. Deterministic — no reliance
  // on the library's auto-detection, which was intermittently leaving tokens stranded.
  function handleAuthRedirect() {
    if (!sb) return Promise.resolve();
    var hash = location.hash ? location.hash.substring(1) : "";
    if (hash.indexOf("access_token=") !== -1) {
      var p = new URLSearchParams(hash);
      var at = p.get("access_token"), rt = p.get("refresh_token");
      if (at && rt) {
        return sb.auth.setSession({ access_token: at, refresh_token: rt })
          .then(function () { cleanAuthUrl(); })
          .catch(function () { cleanAuthUrl(); });
      }
    }
    if (hash.indexOf("error=") !== -1) { cleanAuthUrl(); }
    return Promise.resolve();
  }
  function cleanAuthUrl() {
    try { history.replaceState({}, "", location.pathname + (location.search || "")); } catch (e) {}
  }
  function initBackend() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: "implicit", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
      });
      USE_CLOUD = true;
      handleAuthRedirect()
        .then(function () { return sb.auth.getSession(); })
        .then(function (res) { applySession(res.data ? res.data.session : null); render(); });
      sb.auth.onAuthStateChange(function (_evt, session) { applySession(session); render(); });
      subscribeRealtime();
    }
  }
  function subscribeRealtime() {
    try {
      sb.channel("events-rt")
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, function () { reloadEvents(); })
        .subscribe();
    } catch (e) { /* realtime optional */ }
  }
  function fromRow(r) {
    return {
      id: r.id, user_id: r.user_id, chapter: r.chapter, category: r.category, title: r.title,
      date: r.date || "", time: r.time || "", location: r.location || "",
      lat: (typeof r.lat === "number") ? r.lat : null, lng: (typeof r.lng === "number") ? r.lng : null,
      description: r.description || "", link: r.link || "", igRequest: !!r.ig_request, igPosted: !!r.ig_posted,
      pinned: !!r.pinned, photos: safePhotos(r.photos), created: r.created_at ? new Date(r.created_at).getTime() : 0
    };
  }
  function toRow(d, photos) {
    return {
      chapter: d.chapter, category: d.category, title: d.title,
      date: d.date || null, time: d.time || null, location: d.location,
      lat: d.lat, lng: d.lng, description: d.description, link: d.link || null,
      ig_request: d.igRequest, photos: photos
    };
  }
  function reloadEvents() {
    if (USE_CLOUD) {
      sb.from("events").select("*").order("created_at", { ascending: false }).then(function (res) {
        if (res.error) { console.error(res.error); toast("Couldn't load events"); return; }
        state.events = (res.data || []).map(fromRow);
        render(); openSharedIfAny();
      });
    } else {
      load(); render(); openSharedIfAny();
    }
  }
  function uploadPhotos() {
    // returns a Promise<string[]> of public URLs; new (data:) photos get uploaded, existing URLs pass through
    var tasks = state.photos.map(function (p, i) {
      if (p.indexOf("data:") !== 0) return Promise.resolve(p);
      return fetch(p).then(function (r) { return r.blob(); }).then(function (blob) {
        var path = "events/" + Date.now() + "-" + i + ".jpg";
        return sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false })
          .then(function (up) {
            if (up.error) throw up.error;
            return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          });
      });
    });
    return Promise.all(tasks);
  }

  // ---------- Auth: members (email+password) + hidden admin ----------
  function applySession(session) {
    currentUser = (session && session.user) ? session.user : null;
    isAdmin = !!(currentUser && currentUser.email === ADMIN_EMAIL);
    applyAdminUI(); applyMemberUI();
  }
  function logout() {
    if (!sb) return;
    sb.auth.signOut().then(function () { applySession(null); render(); toast("Logged out"); });
  }

  // Member sign-in / sign-up (in the header)
  function applyMemberUI() {
    var el = $("authArea"); if (!el) return;
    var signedIn = !!(USE_CLOUD && currentUser), mb = $("mineBtn");
    if (mb) mb.style.display = signedIn ? "inline-flex" : "none";
    if (!signedIn && state.mine) {   // signed out while filtering to own events
      state.mine = false;
      if (mb) { mb.classList.remove("active"); mb.setAttribute("aria-pressed", "false"); }
    }
    if (!USE_CLOUD) { el.innerHTML = ""; return; }
    if (currentUser) {
      var who = isAdmin ? "Admin" : currentUser.email;
      var initial = (who || "?").charAt(0).toUpperCase();
      el.innerHTML =
        '<span class="user-chip">' +
          '<span class="avatar">' + esc(initial) + '</span>' +
          '<span class="uname">' + esc(who) + '</span>' +
          '<button class="chip-logout" id="logoutLink" title="Log out" aria-label="Log out">' + ICON.logout + '</button>' +
        '</span>';
      $("logoutLink").onclick = function (e) { e.preventDefault(); logout(); };
    } else {
      el.innerHTML = '<button class="btn btn-line" id="signinLink">' + ICON.user + 'Sign in</button>';
      $("signinLink").onclick = function () { openMember("signin"); };
    }
  }
  function setMemberMode() {
    var signup = memberMode === "signup";
    $("memberTitle").textContent = signup ? "Create your account" : "Welcome back";
    $("memberSubmit").textContent = signup ? "Create account" : "Sign in";
    $("memberSwitchText").textContent = signup ? "Already have an account? " : "New here? ";
    $("memberToggle").textContent = signup ? "Sign in" : "Create an account";
    $("memberIntro").textContent = signup
      ? "Create an account with your email to post events. Anyone can view the board without an account."
      : "Sign in with your email to post and manage your events. Viewing the board is open to everyone.";
    $("mPass2Field").style.display = signup ? "block" : "none";
    $("mPass").setAttribute("autocomplete", signup ? "new-password" : "current-password");
    document.querySelector('#memberForm .field[data-field="mPass2"]').classList.remove("invalid");
    $("memberMsg").style.display = "none";
  }
  function openMember(mode) {
    if (!USE_CLOUD) { toast("Backend not configured yet — see SETUP.md"); return; }
    memberMode = mode || "signin"; setMemberMode();
    $("memberForm").reset();
    document.querySelectorAll('#memberForm .field.invalid').forEach(function (f) { f.classList.remove("invalid"); });
    $("memberOverlay").classList.add("open");
    setTimeout(function () { renderGoogleButton(); }, 40);
  }
  function closeMember() { $("memberOverlay").classList.remove("open"); }
  // ---------- Google Identity Services (no redirect to Supabase domain) ----------
  function makeNonce() {
    var raw = btoa(String.fromCharCode.apply(null, crypto.getRandomValues(new Uint8Array(16))));
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then(function (buf) {
      var hashed = Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      return { raw: raw, hashed: hashed };
    });
  }
  function setupGIS() {
    if (!USE_CLOUD || !GOOGLE_CLIENT_ID) return;
    if (typeof google === "undefined" || !google.accounts || !google.accounts.id || !window.crypto || !crypto.subtle) {
      setTimeout(setupGIS, 300); return;   // GIS script still loading
    }
    makeNonce().then(function (n) {
      gisNonce = n.raw;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: onGoogleCredential,
        nonce: n.hashed,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      gisReady = true;
      renderGoogleButton();
    });
  }
  function renderGoogleButton() {
    var host = document.getElementById("googleBtnHost");
    if (!host || !gisReady) return;
    host.innerHTML = "";
    var w = host.offsetWidth || host.parentElement && host.parentElement.offsetWidth || 340;
    google.accounts.id.renderButton(host, {
      type: "standard", theme: "outline", size: "large",
      text: "continue_with", shape: "rectangular", logo_alignment: "left",
      width: Math.min(w, 400)
    });
  }
  function onGoogleCredential(resp) {
    if (!resp || !resp.credential) return;
    sb.auth.signInWithIdToken({ provider: "google", token: resp.credential, nonce: gisNonce })
      .then(function (res) {
        if (res.error) { toast("Google sign-in failed: " + res.error.message); return; }
        closeMember(); toast("Signed in");
        // rotate the nonce for the next sign-in
        makeNonce().then(function (n) {
          gisNonce = n.raw;
          google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential, nonce: n.hashed, auto_select: false });
        });
      });
  }
  function toggleMember() { memberMode = memberMode === "signin" ? "signup" : "signin"; setMemberMode(); }
  function submitMember(ev) {
    ev.preventDefault();
    var email = $("mEmail").value.trim(), pass = $("mPass").value;
    var fe = document.querySelector('#memberForm .field[data-field="mEmail"]');
    var fp = document.querySelector('#memberForm .field[data-field="mPass"]');
    var fp2 = document.querySelector('#memberForm .field[data-field="mPass2"]');
    fe.classList.remove("invalid"); fp.classList.remove("invalid"); fp2.classList.remove("invalid");
    var ok = true;
    if (email.indexOf("@") < 1) { fe.classList.add("invalid"); ok = false; }
    if (pass.length < 6) { fp.classList.add("invalid"); ok = false; }
    if (memberMode === "signup" && $("mPass2").value !== pass) { fp2.classList.add("invalid"); ok = false; }
    if (!ok) return;
    var btn = $("memberSubmit"), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Please wait…";
    var call = memberMode === "signup"
      ? sb.auth.signUp({ email: email, password: pass })
      : sb.auth.signInWithPassword({ email: email, password: pass });
    call.then(function (res) {
      btn.disabled = false; btn.textContent = label;
      var m = $("memberMsg");
      if (res.error) { m.style.display = "block"; m.style.color = "var(--danger)"; m.textContent = res.error.message; return; }
      if (!res.data || !res.data.session) {
        // signup with email confirmation still on
        m.style.display = "block"; m.style.color = "var(--deca-blue)";
        m.textContent = "Account created — check your email to confirm, then sign in.";
        return;
      }
      closeMember(); toast(memberMode === "signup" ? "Account created — you're signed in" : "Signed in");
    });
  }

  // Hidden admin sign-in (corner button, password only)
  function applyAdminUI() {
    var fab = $("adminFab"); if (!fab) return;
    if (isAdmin) { fab.classList.add("on"); fab.innerHTML = '<span class="ad-dot"></span> Admin · Sign out'; }
    else { fab.classList.remove("on"); fab.textContent = "Admin Sign In"; }
  }
  function openAdmin() {
    if (isAdmin) { logout(); return; }
    if (!USE_CLOUD) { toast("Backend not configured yet — see SETUP.md"); return; }
    var f = document.querySelector('.field[data-field="adminpw"]'); if (f) f.classList.remove("invalid");
    $("adminForm").reset();
    $("adminOverlay").classList.add("open");
    setTimeout(function () { $("adminPw").focus(); }, 50);
  }
  function closeAdmin() { $("adminOverlay").classList.remove("open"); }
  function submitAdmin(ev) {
    ev.preventDefault();
    var pw = $("adminPw").value;
    var f = document.querySelector('.field[data-field="adminpw"]'); if (f) f.classList.remove("invalid");
    var btn = $("adminSubmit"); btn.disabled = true; btn.textContent = "Checking…";
    sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: pw }).then(function (res) {
      btn.disabled = false; btn.textContent = "Sign in";
      if (res.error || !res.data || !res.data.session) { if (f) f.classList.add("invalid"); return; }
      closeAdmin(); toast("Admin mode on — you can edit, delete, and pin any event");
    });
  }

  // ---------- Pin (admin only) ----------
  function togglePin(id) {
    var e = state.events.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var next = !e.pinned;
    if (USE_CLOUD) {
      sb.from("events").update({ pinned: next }).eq("id", id).then(function (res) {
        if (res.error) { toast("Couldn't update pin: " + res.error.message, "error"); return; }
        reloadEvents(); toast(next ? "Pinned to top" : "Unpinned");
      });
    } else {
      e.pinned = next; save(); render();
    }
  }

  // ---------- Instagram feature requests (admin) ----------
  function igRequests() {
    return state.events.filter(function (e) { return e.igRequest; })
      .sort(function (a, b) {
        if (!!a.igPosted !== !!b.igPosted) return a.igPosted ? 1 : -1; // pending first
        return b.created - a.created;
      });
  }
  function updateIgButton() {
    var btn = $("igReqBtn"); if (!btn) return;
    if (!(USE_CLOUD && isAdmin)) { btn.style.display = "none"; return; }
    btn.style.display = "inline-flex";
    $("igReqCount").textContent = state.events.filter(function (e) { return e.igRequest && !e.igPosted; }).length;
  }
  function openIg() { renderIgList(); $("igOverlay").classList.add("open"); }
  function closeIg() { $("igOverlay").classList.remove("open"); }
  function renderIgList() {
    var list = igRequests(), box = $("igList");
    if (!list.length) { box.innerHTML = '<div class="ig-empty">No Instagram feature requests yet.</div>'; return; }
    box.innerHTML = list.map(function (e) {
      var thumb = (e.photos && e.photos[0])
        ? '<div class="ig-thumb has-img" style="background-image:url(\''+e.photos[0].replace(/'/g,"%27")+'\')"></div>'
        : '<div class="ig-thumb"></div>';
      var when = e.date ? esc(formatDate(e.date, e.time)) : "Date TBD";
      var where = e.location ? " · " + esc(e.location) : "";
      var actions = e.igPosted
        ? '<span class="ig-status">'+ICON.check+'Posted</span><button class="btn btn-ghost" data-igundo="'+e.id+'">Mark pending</button>'
        : '<button class="btn btn-primary" data-igdone="'+e.id+'">Mark posted</button>';
      return '<div class="ig-row">'+thumb+
        '<div class="ig-info">'+
          '<div class="r-chap">'+esc(e.chapter)+'</div>'+
          '<div class="r-title">'+esc(e.title)+'</div>'+
          '<div class="r-meta">'+when+where+'</div>'+
        '</div>'+
        '<div class="ig-actions">'+actions+'<button class="btn btn-ghost" data-igcopy="'+e.id+'">Copy details</button></div>'+
      '</div>';
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll("[data-igdone]"), function (b) { b.addEventListener("click", function () { setIgPosted(b.getAttribute("data-igdone"), true); }); });
    Array.prototype.forEach.call(box.querySelectorAll("[data-igundo]"), function (b) { b.addEventListener("click", function () { setIgPosted(b.getAttribute("data-igundo"), false); }); });
    Array.prototype.forEach.call(box.querySelectorAll("[data-igcopy]"), function (b) { b.addEventListener("click", function () { shareEvent(b.getAttribute("data-igcopy")); }); });
  }
  function setIgPosted(id, val) {
    if (USE_CLOUD) {
      sb.from("events").update({ ig_posted: val }).eq("id", id).then(function (res) {
        if (res.error) { toast("Couldn't update: " + res.error.message, "error"); return; }
        var e = state.events.filter(function (x) { return x.id === id; })[0]; if (e) e.igPosted = val;
        reloadEvents(); renderIgList(); updateIgButton();
        toast(val ? "Marked as posted" : "Marked as pending");
      });
    } else {
      var e = state.events.filter(function (x) { return x.id === id; })[0]; if (e) { e.igPosted = val; save(); }
      render(); renderIgList(); updateIgButton();
    }
  }

  function init() {
    pendingEventId = getParam("event");
    initBackend();
    reloadEvents();
    setupLocationAutocomplete();
    var logoImg = $("logoImg");
    if (logoImg) {
      logoImg.addEventListener("load", function () { logoImg.classList.add("show"); $("logoMark").style.display = "none"; $("logoWords").style.display = "none"; });
      logoImg.addEventListener("error", function () { logoImg.style.display = "none"; });
      if (logoImg.complete && logoImg.naturalWidth > 0) logoImg.dispatchEvent(new Event("load"));
    }
    $("newBtn").addEventListener("click", function () {
      if (USE_CLOUD && !currentUser) { openMember("signin"); return; }
      openModal(null);
    });
    $("closeBtn").addEventListener("click", closeModal);
    $("cancelBtn").addEventListener("click", closeModal);
    $("overlay").addEventListener("click", function (e) { if (e.target === $("overlay")) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(); closeAdmin(); closeMember(); closeIg(); closeDetail(); closeConfirm(false); } });
    $("eventForm").addEventListener("submit", handleSubmit);

    // confirm dialog
    $("confirmOk").addEventListener("click", function () { closeConfirm(true); });
    $("confirmCancel").addEventListener("click", function () { closeConfirm(false); });
    $("confirmOverlay").addEventListener("click", function (e) { if (e.target === $("confirmOverlay")) closeConfirm(false); });

    // member sign-in / sign-up
    applyMemberUI();
    $("memberClose").addEventListener("click", closeMember);
    $("memberToggle").addEventListener("click", function (e) { e.preventDefault(); toggleMember(); });
    $("memberOverlay").addEventListener("click", function (e) { if (e.target === $("memberOverlay")) closeMember(); });
    $("memberForm").addEventListener("submit", submitMember);
    setupGIS();

    // admin (corner button)
    applyAdminUI();
    $("adminFab").addEventListener("click", openAdmin);
    $("adminClose").addEventListener("click", closeAdmin);
    $("adminCancel").addEventListener("click", closeAdmin);
    $("adminOverlay").addEventListener("click", function (e) { if (e.target === $("adminOverlay")) closeAdmin(); });
    $("adminForm").addEventListener("submit", submitAdmin);

    // Instagram requests (admin)
    $("igReqBtn").addEventListener("click", openIg);
    $("igClose").addEventListener("click", closeIg);
    $("igOverlay").addEventListener("click", function (e) { if (e.target === $("igOverlay")) closeIg(); });

    // Event detail (shareable link)
    $("detailClose").addEventListener("click", closeDetail);
    $("detailOverlay").addEventListener("click", function (e) { if (e.target === $("detailOverlay")) closeDetail(); });
    $("searchInput").addEventListener("input", function (e) { state.search = e.target.value; render(); });
    $("chapterFilter").addEventListener("change", function (e) { state.chapter = e.target.value; render(); });
    $("sortSelect").addEventListener("change", function (e) { state.sort = e.target.value; render(); });
    $("rangeSelect").addEventListener("change", function (e) { state.range = e.target.value; render(); });
    $("catTabs").addEventListener("click", function (e) { var b = e.target.closest("[data-cat]"); if (!b) return; state.category = b.getAttribute("data-cat"); render(); });
    $("viewToggle").addEventListener("click", function (e) {
      var b = e.target.closest("[data-view]"); if (!b) return;
      state.view = b.getAttribute("data-view");
      Array.prototype.forEach.call($("viewToggle").querySelectorAll(".vt"), function (v) { v.classList.toggle("active", v === b); });
      render();
    });
    $("mineBtn").addEventListener("click", function () {
      state.mine = !state.mine;
      this.classList.toggle("active", state.mine); this.setAttribute("aria-pressed", String(state.mine));
      render();
    });

    var dz = $("dropzone");
    dz.addEventListener("click", function () { $("f_photo").click(); });
    $("f_photo").addEventListener("change", function (e) { if (e.target.files.length) addPhotos(e.target.files); e.target.value = ""; });
    ["dragenter","dragover"].forEach(function (n) { dz.addEventListener(n, function (e) { e.preventDefault(); dz.classList.add("drag"); }); });
    ["dragleave","drop"].forEach(function (n) { dz.addEventListener(n, function (e) { e.preventDefault(); dz.classList.remove("drag"); }); });
    dz.addEventListener("drop", function (e) { if (e.dataTransfer.files && e.dataTransfer.files.length) addPhotos(e.dataTransfer.files); });

    // lightbox controls
    $("lbClose").addEventListener("click", closeLb);
    $("lbPrev").addEventListener("click", function () { lbStep(-1); });
    $("lbNext").addEventListener("click", function () { lbStep(1); });
    $("lightbox").addEventListener("click", function (e) { if (e.target === $("lightbox")) closeLb(); });
    document.addEventListener("keydown", function (e) {
      if (!$("lightbox").classList.contains("open")) return;
      if (e.key === "Escape") closeLb();
      else if (e.key === "ArrowLeft") lbStep(-1);
      else if (e.key === "ArrowRight") lbStep(1);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
