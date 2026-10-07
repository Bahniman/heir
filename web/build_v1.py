"""Compose the published single-file demo from its parts."""
import pathlib
here = pathlib.Path(__file__).parent
tokens = pathlib.Path(__import__("os").environ.get("RISO_TOKENS", r"C:\Users\bahni\Downloads\Projects\Startup Lab\repos\heirloom\src\riso-tokens.css")).read_text(encoding="utf-8")
poster = pathlib.Path(__import__("os").environ.get("RISO_POSTER", r"C:\Users\bahni\Downloads\Exports\Design Systems\Riso Poster\project-kit\poster.css")).read_text(encoding="utf-8")
page = (here / "app.html").read_text(encoding="utf-8")
out = (page.replace("/*TOKENS*/", tokens).replace("/*POSTER*/", poster + "\n.pk-sec{scroll-margin-top:72px}\n")
        .replace("/*ENGINE*/", (here / "heir-engine.js").read_text(encoding="utf-8"))
        .replace("/*APPJS*/", (here / "app.js").read_text(encoding="utf-8"))
        .replace("/*WALKJS*/", (here / "walk.js").read_text(encoding="utf-8"))
        .replace("/*PLAYJS*/", (here / "play.js").read_text(encoding="utf-8")))
(here / "heir-demo.html").write_text(out, encoding="utf-8")
(here / "heir-demo-local.html").write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + out + "</body></html>", encoding="utf-8")
print("built", len(out), "bytes")
