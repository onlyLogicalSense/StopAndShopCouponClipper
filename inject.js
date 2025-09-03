// ===== Stop & Shop Clipper (SPA-safe) =====
(() => {
  const COUPONS_PATH = "/savings/coupons/browse";
  let uiMounted = false;

  // Normalize path: remove trailing slashes
  const normalizedPath = () => location.pathname.replace(/\/+$/, "") || "/";

  const isCouponsPage = () => normalizedPath() === COUPONS_PATH;

  // Ensure <body> exists before manipulating DOM
  const ensureBody = (fn) => {
    if (document.body) return fn();
    const obs = new MutationObserver(() => {
      if (document.body) {
        obs.disconnect();
        fn();
      }
    });
    obs.observe(document.documentElement, { childList: true });
  };

  // ---------- UI creation / teardown ----------
  function createUI() {
    if (uiMounted) return;
    uiMounted = true;

    // Button
    const btn = document.createElement("button");
    btn.id = "ss-clip-all-btn";
    btn.textContent = "Clip All Coupons";
    Object.assign(btn.style, {
      position: "fixed",
      top: "200px",
      right: "1500px",
      zIndex: "999999",
      padding: "12px 20px",
      background: "#6a0dad",
      color: "#fff",
      fontSize: "16px",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      boxShadow: "0 4px 6px rgba(0,0,0,0.2)"
    });

    // Progress container
    const barWrap = document.createElement("div");
    barWrap.id = "ss-clip-progress";
    Object.assign(barWrap.style, {
      position: "fixed",
      top: "280px",
      right: "1500px",
      width: "220px",
      height: "20px",
      background: "#e5e7eb",
      borderRadius: "10px",
      overflow: "hidden",
      zIndex: "999999",
      display: "none"
    });

    const bar = document.createElement("div");
    bar.id = "ss-clip-progress-bar";
    Object.assign(bar.style, {
      height: "100%",
      width: "0%",
      background: "#6a0dad",
      transition: "width 0.2s linear"
    });
    barWrap.appendChild(bar);

    btn.addEventListener("click", () => startClipping(btn, barWrap, bar));

    document.body.appendChild(btn);
    document.body.appendChild(barWrap);
  }

  function destroyUI() {
    uiMounted = false;
    const btn = document.getElementById("ss-clip-all-btn");
    const barWrap = document.getElementById("ss-clip-progress");
    if (btn) btn.remove();
    if (barWrap) barWrap.remove();
  }

  function syncUIToRoute() {
    ensureBody(() => {
      if (isCouponsPage()) {
        createUI();
      } else {
        destroyUI();
      }
    });
  }

  // ---------- Robust SPA navigation detection ----------
  // Fire a custom 'locationchange' event whenever history changes
  const fireLocationChange = () => window.dispatchEvent(new Event("locationchange"));

  const origPush = history.pushState;
  history.pushState = function (...args) {
    const ret = origPush.apply(this, args);
    fireLocationChange();
    return ret;
  };

  const origReplace = history.replaceState;
  history.replaceState = function (...args) {
    const ret = origReplace.apply(this, args);
    fireLocationChange();
    return ret;
  };

  window.addEventListener("popstate", fireLocationChange);
  window.addEventListener("locationchange", syncUIToRoute);

  // Fallback: observe big DOM changes (some routers mutate without touching history)
  const fallbackObserver = new MutationObserver((mutations) => {
    // Check infrequently to avoid thrashing
    if (!fallbackObserver._ticking) {
      fallbackObserver._ticking = true;
      requestAnimationFrame(() => {
        fallbackObserver._ticking = false;
        syncUIToRoute();
      });
    }
  });
  fallbackObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Initial mount
  syncUIToRoute();

  // ---------- API helpers (in-page; cookies included) ----------
  async function getUserId() {
    const res = await fetch("https://stopandshop.com/api/v1.0/current/user", {
      credentials: "include"
    });
    if (!res.ok) throw new Error(`Failed to get userId: ${res.status}`);
    const data = await res.json();
    if (!data || typeof data.userId === "undefined") {
      throw new Error("No userId in response");
    }
    return data.userId;
  }

  async function getCardNumber(userId) {
    const res = await fetch(`https://stopandshop.com/api/v4.0/user/${userId}/profile`, {
      credentials: "include"
    });
    if (!res.ok) throw new Error(`Failed to get profile: ${res.status}`);
    const data = await res.json();
    const card = data?.response?.retailerCard?.cardNumber;
    if (!card) throw new Error("No card number in profile");
    return card;
  }

  async function fetchCoupons(userId, cardNumber) {
    const url = `https://stopandshop.com/api/v7.0/coupons/users/${userId}/prism/service-locations/50000002/coupons/search?fullDocument=true&unwrap=true`;
    const payload = {
      query: { start: 0, size: 300 },
      filter: { loadable: true, loaded: false, sourceSystems: ["QUO", "COP", "INM"] },
      copientQuotientTargetingEnabled: true,
      cardNumber: cardNumber,
      sorts: [{ targeted: "desc" }]
    };
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "accept": "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
        "x-requested-with": "XMLHttpRequest"
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Failed to fetch coupons: ${res.status}`);
    const data = await res.json();
    // coupons live at data.coupons
    return Array.isArray(data.coupons) ? data.coupons : [];
  }

  async function clipCoupon(userId, couponId) {
    if (!couponId) return false;
    const url = `https://stopandshop.com/api/v6.0/users/${userId}/coupons/clipped`;
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "accept": "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8"
      },
      body: JSON.stringify({ couponId: String(couponId) })
    });
    return res.ok;
  }

  // ---------- Click handler ----------
  async function startClipping(btn, barWrap, bar) {
    try {
      btn.disabled = true;
      btn.textContent = "Clipping…";
      barWrap.style.display = "block";
      bar.style.width = "0%";

      const userId = await getUserId();
      const cardNumber = await getCardNumber(userId);
      const coupons = await fetchCoupons(userId, cardNumber); // already filtered to loadable & not loaded

      if (!coupons.length) {
        btn.textContent = "No coupons to clip";
        setTimeout(() => { if (isCouponsPage()) location.reload(); }, 1000);
        return;
      }

      let done = 0;
      for (const c of coupons) {
        // The ID to post must be c.id
        const ok = await clipCoupon(userId, c.id);
        done += ok ? 1 : 0;
        const pct = Math.round((done / coupons.length) * 100);
        bar.style.width = pct + "%";
        btn.textContent = `Clipped ${done}/${coupons.length}`;
      }

      btn.textContent = `Done! Clipped ${done}/${coupons.length}`;
      setTimeout(() => { if (isCouponsPage()) location.reload(); }, 1000);
    } catch (err) {
      console.error("[S&S Clipper] Error:", err);
      btn.textContent = "Failed: " + (err?.message || "Unknown error");
      btn.disabled = false;
    }
  }
})();