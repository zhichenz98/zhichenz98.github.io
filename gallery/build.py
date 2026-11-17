"""Render the static Gallery from its photo metadata and region groups."""

from html import escape
from pathlib import Path
import hashlib
import json
import re


def build():
    directory = Path(__file__).resolve().parent
    repo = directory.parent
    manifest = json.loads((directory / "rename-map.json").read_text())
    photos = {
        photo["id"]: photo
        for album in manifest["albums"]
        for photo in album["photos"]
    }
    groups = manifest["groups"]
    assigned = [photo_id for group in groups for photo_id in group["photo_ids"]]
    if len(assigned) != len(set(assigned)) or set(assigned) != set(photos):
        raise ValueError("Each photo must appear in exactly one region.")
    if len({group["id"] for group in groups}) != len(groups):
        raise ValueError("Region IDs must be unique.")

    # Hide a tab without discarding its photo metadata or original files.
    groups = [group for group in groups if group.get("visible", True)]
    displayed = [photo_id for group in groups for photo_id in group["photo_ids"]]

    expand = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>'
    tabs, panels = [], []
    missing_years = []
    for group_number, group in enumerate(groups):
        slug = escape(group["id"], quote=True)
        tabs.append(
            f'<a id="tab-{slug}" href="#album-{slug}" data-album="{slug}">'
            f'{escape(group["label"])}</a>'
        )
        cards = []
        for index, photo_id in enumerate(group["photo_ids"], 1):
            photo = photos[photo_id]
            year = photo.get("year")
            if year is not None and (not isinstance(year, int) or not 1900 <= year <= 2100):
                raise ValueError(f"Invalid capture year for {photo_id}: {year}")
            if not year:
                missing_years.append(photo["source_key"])
            year_label = str(year) if year else "Year TBD"
            location = photo["location"]
            caption = f"{year_label} · {location}"
            year_markup = (
                f'<time datetime="{year}">{year}</time>'
                if year else '<span class="gallery-year">Year TBD</span>'
            )
            width, height = photo["preview_width"], photo["preview_height"]
            loading = "eager" if group_number == 0 and index <= 4 else "lazy"
            cards.append(f'''<figure class="gallery-card" data-index="{index}" data-photo-id="{photo_id}" style="--ratio: {width / height:.8f};">
  <a class="gallery-photo" href="{escape(photo['url'], quote=True)}" data-title="{escape(photo['title'], quote=True)}" data-caption="{escape(caption, quote=True)}" aria-label="View photograph: {escape(caption, quote=True)}" aria-describedby="caption-{photo_id}">
    <img src="{escape(photo['preview'], quote=True)}" width="{width}" height="{height}" loading="{loading}" decoding="async" alt="{escape(photo['alt'], quote=True)}">
    <span class="gallery-expand" aria-hidden="true">{expand}</span>
  </a>
  <figcaption id="caption-{photo_id}" class="gallery-caption">{year_markup} · <span class="gallery-location">{escape(location)}</span></figcaption>
</figure>''')
        panels.append(f'''<section id="album-{slug}" class="gallery-album" data-album-id="{slug}" aria-labelledby="tab-{slug}">
  <div class="gallery-grid">
'''+"\n".join(cards)+"\n  </div>\n</section>")

    main = '''<main id="top" class="container gallery-main">
  <nav id="gallery-tabs" class="gallery-tabs" aria-label="Travel regions">
'''+"\n".join(tabs)+"\n  </nav>\n  <div class=\"gallery-panels\">\n"+"\n".join(panels)+"\n  </div>\n</main>"
    page_path = directory / "index.html"
    text = page_path.read_text()
    text, replacements = re.subn(r"<main\b[^>]*>.*?</main>", lambda _: main, text, count=1, flags=re.S)
    if replacements != 1:
        raise ValueError("Expected exactly one Gallery main element.")
    if 'id="lightbox-caption"' not in text:
        text, replacements = re.subn(
            r'(<h2\b[^>]*\bid="lightbox-title"[^>]*>.*?</h2>)',
            lambda match: match[1]+'\n<p id="lightbox-caption" aria-live="polite"></p>',
            text, count=1, flags=re.S,
        )
        if replacements != 1:
            raise ValueError("Expected one lightbox title.")
    text = re.sub(
        r'<meta\b(?=[^>]*\bname="description")[^>]*>',
        '<meta name="description" content="Travel photographs by Zhichen Zeng, organized by region with capture years and locations.">',
        text, count=1,
    )
    for asset in ["assets/css/gallery.css", "assets/js/gallery.js"]:
        version = hashlib.sha256((repo / asset).read_bytes()).hexdigest()[:12]
        text = re.sub(
            r'(["\'])/'+re.escape(asset)+r'(?:\?[^"\']*)?(["\'])',
            lambda match: f'{match[1]}/{asset}?v={version}{match[2]}', text,
        )
    page_path.write_text(text)
    print(f"Gallery built: {len(groups)} regions, {len(displayed)} photographs.")
    if missing_years:
        print("Capture years awaiting confirmation: " + ", ".join(missing_years))


if __name__ == "__main__":
    build()
