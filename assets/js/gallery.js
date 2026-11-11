(() => {
  function initGallery() {
    const tabs = document.getElementById("gallery-tabs");
    const panels = Array.from(document.querySelectorAll(".gallery-album[data-album-id]"));
    if (!tabs || !panels.length) return;

    const albums = Array.from(tabs.querySelectorAll("a[data-album]"))
      .map((tab) => ({
        tab,
        id: tab.dataset.album,
        panel: panels.find((panel) => panel.dataset.albumId === tab.dataset.album),
      }))
      .filter((album) => album.panel);
    if (!albums.length) return;

    const dialog = document.getElementById("gallery-lightbox");
    const title = document.getElementById("lightbox-title");
    const counter = document.getElementById("lightbox-counter");
    const image = document.getElementById("lightbox-image");
    const loading = document.getElementById("lightbox-loading");
    const close = document.querySelector("[data-gallery-close]");
    const previous = document.querySelector("[data-gallery-prev]");
    const next = document.querySelector("[data-gallery-next]");
    const canOpenLightbox = Boolean(
      dialog && typeof dialog.showModal === "function" &&
      title && counter && image && close && previous && next
    );

    let activeAlbum = albums[0];
    let photos = [];
    let activeIndex = 0;
    let trigger = null;
    let imageRevision = 0;

    function albumFromHash() {
      if (!location.hash.startsWith("#album-")) return albums[0];
      try {
        const id = decodeURIComponent(location.hash.slice(7));
        return albums.find((album) => album.id === id) || albums[0];
      } catch (error) {
        return albums[0];
      }
    }

    function revealTab(tab) {
      // Scroll only the tab strip, never its vertical page ancestors.
      const strip = tabs.getBoundingClientRect();
      const target = tab.getBoundingClientRect();
      if (target.left < strip.left) tabs.scrollLeft -= strip.left - target.left + 8;
      else if (target.right > strip.right) tabs.scrollLeft += target.right - strip.right + 8;
    }

    function selectAlbum(album, updateHash = false, focus = false) {
      const changedAlbum = album !== activeAlbum;
      if (canOpenLightbox && dialog.open && album !== activeAlbum) {
        trigger = null;
        closeLightbox();
      }
      activeAlbum = album;
      panels.forEach((panel) => { panel.hidden = panel !== album.panel; });
      albums.forEach((item) => {
        const selected = item === album;
        item.tab.setAttribute("aria-selected", String(selected));
        item.tab.tabIndex = selected ? 0 : -1;
      });
      if (updateHash) history.replaceState(history.state, "", `#album-${album.id}`);
      if (focus) album.tab.focus({ preventScroll: true });
      revealTab(album.tab);
      if (changedAlbum && updateHash) {
        const panelTop = album.panel.getBoundingClientRect().top;
        const tabsBottom = tabs.getBoundingClientRect().bottom;
        // A new album should not inherit a position deep inside the previous one.
        if (panelTop < tabsBottom - 1) {
          window.scrollTo({
            top: Math.max(0, window.scrollY + panelTop - tabsBottom),
            left: window.scrollX,
            behavior: "auto",
          });
        }
      }
    }

    function setLoading(isLoading) {
      if (!loading) return;
      loading.textContent = isLoading ? "Loading full-size image…" : "";
      loading.hidden = !isLoading;
    }

    function showPhoto(index) {
      if (!photos.length) return;
      activeIndex = ((index % photos.length) + photos.length) % photos.length;
      const photo = photos[activeIndex];
      const thumbnail = photo.querySelector("img");
      const revision = ++imageRevision;

      image.src = thumbnail ? thumbnail.currentSrc || thumbnail.src : photo.href;
      image.alt = thumbnail ? thumbnail.alt : photo.dataset.title || "Photograph";
      title.textContent = photo.dataset.title || image.alt;
      counter.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;
      previous.disabled = next.disabled = photos.length < 2;
      setLoading(true);

      const original = new Image();
      original.draggable = false;
      original.onload = async () => {
        if (revision !== imageRevision || !dialog.open) return;
        if (typeof original.decode === "function") {
          try {
            await original.decode();
          } catch (error) {
            if (revision === imageRevision) setLoading(false);
            return;
          }
        }
        if (revision !== imageRevision || !dialog.open) return;
        image.src = original.src;
        setLoading(false);
      };
      original.onerror = () => {
        if (revision === imageRevision) setLoading(false);
      };
      original.src = photo.href;
    }

    function openPhoto(photo) {
      if (dialog.open || photo.closest(".gallery-album") !== activeAlbum.panel) return false;
      photos = Array.from(activeAlbum.panel.querySelectorAll(".gallery-grid .gallery-card a.gallery-photo"));
      const index = photos.indexOf(photo);
      if (index < 0) return false;

      trigger = photo;
      showPhoto(index);
      try {
        dialog.showModal();
      } catch (error) {
        ++imageRevision;
        setLoading(false);
        return false;
      }
      document.documentElement.classList.add("gallery-modal-open");
      return true;
    }

    function closeLightbox() {
      if (!dialog.open) return;
      ++imageRevision;
      dialog.close();
    }

    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-orientation", "horizontal");
    albums.forEach((album) => {
      album.tab.setAttribute("role", "tab");
      album.tab.setAttribute("aria-controls", album.panel.id);
      album.panel.setAttribute("role", "tabpanel");
      album.panel.setAttribute("aria-labelledby", album.tab.id);
      album.tab.addEventListener("click", (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        selectAlbum(album, true);
      });
    });
    tabs.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const index = albums.findIndex((album) => album.tab === event.target.closest("a[data-album]"));
      if (index < 0) return;
      let destination;
      if (event.key === "ArrowLeft") destination = (index - 1 + albums.length) % albums.length;
      else if (event.key === "ArrowRight") destination = (index + 1) % albums.length;
      else if (event.key === "Home") destination = 0;
      else if (event.key === "End") destination = albums.length - 1;
      else return;
      event.preventDefault();
      selectAlbum(albums[destination], true, true);
    });
    window.addEventListener("hashchange", () => selectAlbum(albumFromHash()));
    selectAlbum(albumFromHash());

    document.querySelectorAll(".gallery-photo img").forEach((thumbnail) => { thumbnail.draggable = false; });
    if (image) image.draggable = false;
    setLoading(false);
    if (!canOpenLightbox) return;

    panels.forEach((panel) => {
      panel.querySelectorAll("a.gallery-photo").forEach((photo) => {
        photo.draggable = false;
        photo.addEventListener("click", (event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (openPhoto(photo)) event.preventDefault();
        });
      });
    });
    close.addEventListener("click", closeLightbox);
    previous.addEventListener("click", () => showPhoto(activeIndex - 1));
    next.addEventListener("click", () => showPhoto(activeIndex + 1));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeLightbox();
    });
    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      ++imageRevision;
      setLoading(false);
      document.documentElement.classList.remove("gallery-modal-open");
      if (trigger && trigger.isConnected && !trigger.closest(".gallery-album").hidden) {
        trigger.focus({ preventScroll: true });
      }
      trigger = null;
    });
    document.addEventListener("keydown", (event) => {
      if (!dialog.open || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        showPhoto(activeIndex + (event.key === "ArrowRight" ? 1 : -1));
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGallery, { once: true });
  } else {
    initGallery();
  }
})();
