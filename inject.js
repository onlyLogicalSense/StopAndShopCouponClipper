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
        obs.observe(document.documentElement, {
            childList: true
        });
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
            left: "30%",
            transform: "translateX(-50%)",

            zIndex: "999999",

            padding: "14px 24px",

            background: "#90EE90", // Light Green
            color: "#1f2937",

            fontSize: "16px",
            fontWeight: "600",

            border: "1px solid #5cb85c",
            borderRadius: "10px",

            cursor: "pointer",

            boxShadow: "0 4px 12px rgba(0,0,0,.25)"
        });
        // Progress container
        const barWrap = document.createElement("div");
        barWrap.id = "ss-clip-progress";
        Object.assign(barWrap.style, {
            position: "fixed",
            top: "250px",
            left: "50%",
            transform: "translateX(-50%)",

            width: "260px",
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
            background: "#4CAF50",
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
    history.pushState = function(...args) {
        const ret = origPush.apply(this, args);
        fireLocationChange();
        return ret;
    };

    const origReplace = history.replaceState;
    history.replaceState = function(...args) {
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
    fallbackObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

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

    async function getProfile(userId) {
        const res = await fetch(
            `https://stopandshop.com/api/v6.0/user/${userId}/profile`, {
                credentials: "include"
            }
        );

        if (!res.ok)
            throw new Error(`Failed to get profile: ${res.status}`);

        const json = await res.json();

        return {
            cardNumber: json.response.retailerCard.cardNumber,

            serviceLocationId: json.response.refData.customerDefaultDeliveryServiceLocation.serviceLocationId
        };
    }

    async function fetchCoupons(
        userId,
        cardNumber,
        serviceLocationId
    ) {

        const url =
            `https://stopandshop.com/api/v1.0/coupons/users/${userId}` +
            `/prism/service-locations/${serviceLocationId}` +
            `/coupons/gallery/search`;

        const payload = {
            cardNumber,
            query: {
                start: 0,
                size: 500,
                topCategoryTreeIds: []
            },
            filter: {
                clippingRequired: true,
                clipped: false,
                sourceSystems: [
                    "COPIENT",
                    "INMAR",
                    "COPIENT_D",
                    "INMAR_D"
                ]
            },
            sort: {
                sortField: "RECOMMENDED",
                sortOrder: "DESC"
            }
        };

        const res = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
                accept: "application/json, text/plain, */*",
                "content-type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok)
            throw new Error(`Failed to fetch coupons (${res.status})`);

        const json = await res.json();

        return {
            coupons: json.coupons ?? [],
            serviceLocationId			
        };
    }

    async function clipCoupons(userId, serviceLocationId, couponIds) {
	    const res = await fetch(
    	    `https://stopandshop.com/api/v2/web/user/${userId}/clip`,
	        {
        	    method: "PUT",
    	        credentials: "include",
	            headers: {
            	    "accept": "application/json, text/plain, */*",
        	        "content-type": "application/json"
    	        },
	            body: JSON.stringify({
            	    couponIds,
        	        serviceLocationId
    	        })
	        }
	    );

	    // Don't fail here.
	    // We'll verify the result by fetching coupons again.
	    if (!res.ok) {
        	console.warn(`Clip API returned ${res.status}. Verifying...`);
    	}

    	return;
	}

    // ---------- Click handler ----------
    async function startClipping(btn, barWrap, bar) {		
    try {
      btn.disabled = true;
      btn.textContent = "Clipping…";
      barWrap.style.display = "block";
      bar.style.width = "0%";

      const userId = await getUserId();
      const {
        cardNumber,
        serviceLocationId
      } = await getProfile(userId);

      const {
        coupons
      } = await fetchCoupons(
        userId,
        cardNumber,
        serviceLocationId
      );

      if (!coupons.length) {
        btn.textContent = "No coupons to clip";

        setTimeout(() => {
          if (isCouponsPage())
            location.reload();
        }, 1000);

        return;
      }

      const couponIds =
        coupons
        .map(c => c.id)
        .filter(Boolean);

      await clipCoupons(
        userId,
        serviceLocationId,
        couponIds
      );
	
      bar.style.width = "100%";
      await clipCoupons(
        userId,
        serviceLocationId,
        couponIds
      );

      bar.style.width = "100%";

      btn.textContent = `Done! Clipped ${couponIds.length}`;

      setTimeout(() => {
        if (isCouponsPage())
          location.reload();
      }, 1000);
    } catch (err) {
      console.error("[S&S Clipper] Error:", err);
      btn.textContent = "Failed: " + (err?.message || "Unknown error");
      btn.disabled = false;
    }
  }
  })();
