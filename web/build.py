"""Compose the published single-file demo: the game first, the walkthrough in a drawer."""
import os, pathlib
here = pathlib.Path(__file__).parent
tokens = pathlib.Path(os.environ.get("RISO_TOKENS", r"C:\Users\bahni\Downloads\Projects\Startup Lab\repos\heirloom\src\riso-tokens.css")).read_text(encoding="utf-8")
poster = pathlib.Path(os.environ.get("RISO_POSTER", r"C:\Users\bahni\Downloads\Exports\Design Systems\Riso Poster\project-kit\poster.css")).read_text(encoding="utf-8")
r = lambda n: (here / n).read_text(encoding="utf-8")
out = (r("app2.html").replace("/*TOKENS*/", tokens).replace("/*POSTER*/", poster).replace("/*WKCSS*/", r("wk.css"))
       .replace("/*ENGINE*/", r("heir-engine.js")).replace("/*WALKJS*/", r("walk.js")).replace("/*GAMEJS*/", r("game.js")).replace("/*AIJS*/", r("ai.js")).replace("/*GLASSJS*/", r("glass.js")))
(here / "heir-demo.html").write_text(out, encoding="utf-8")
page = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        '<meta name="description" content="Heir, a committee agent that keeps the promises a student club made after the people who made them have graduated. Play the handover, then run the club with it.">'
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Ccircle cx=%2212%22 cy=%2216%22 r=%229%22 fill=%22%231f5cff%22/%3E%3Ccircle cx=%2220%22 cy=%2216%22 r=%229%22 fill=%22%23ff4fa3%22 style=%22mix-blend-mode:multiply%22/%3E%3C/svg%3E">'
        '</head><body>' + out + "</body></html>")
(here / "heir-demo-local.html").write_text(page, encoding="utf-8")
(here.parent / "index.html").write_text(page, encoding="utf-8")  # GitHub Pages entry point
print("built", len(out), "bytes")
