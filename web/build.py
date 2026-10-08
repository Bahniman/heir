"""Compose the published single-file demo: the game first, the walkthrough in a drawer."""
import os, pathlib, re
here = pathlib.Path(__file__).parent
tokens = pathlib.Path(os.environ.get("RISO_TOKENS", r"C:\Users\bahni\Downloads\Projects\Startup Lab\repos\heirloom\src\riso-tokens.css")).read_text(encoding="utf-8")
poster = pathlib.Path(os.environ.get("RISO_POSTER", r"C:\Users\bahni\Downloads\Exports\Design Systems\Riso Poster\project-kit\poster.css")).read_text(encoding="utf-8")
r = lambda n: (here / n).read_text(encoding="utf-8")
out = (r("app2.html").replace("/*TOKENS*/", tokens).replace("/*POSTER*/", poster).replace("/*WKCSS*/", r("wk.css"))
       .replace("/*ENGINE*/", r("heir-engine.js")).replace("/*WALKJS*/", r("walk.js")).replace("/*GAMEJS*/", r("game.js")).replace("/*AIJS*/", r("ai.js")).replace("/*GLASSJS*/", r("glass.js")))
suite = out  # GitHub Pages keeps the portfolio links; the artifact and the local fallback do not
out = re.sub(r"<!--SUITE-->.*?<!--/SUITE-->\n?|\n/\*SUITE\*/.*?/\*/SUITE\*/\n", "", out, flags=re.S)
suite = suite.replace("<!--SUITE-->", "").replace("<!--/SUITE-->", "").replace("/*SUITE*/", "").replace("/*/SUITE*/", "")
(here / "heir-demo.html").write_text(out, encoding="utf-8")
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        '<meta name="description" content="Heir, a committee agent that keeps the promises a student club made after the people who made them have graduated. Play the handover, then run the club with it.">'
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Ccircle cx=%2232%22 cy=%2232%22 r=%2229%22 fill=%22%231f5cff%22 stroke=%22%231d1a16%22 stroke-width=%225%22/%3E%3Ctext x=%2232%22 y=%2244%22 font-family=%22Georgia,serif%22 font-style=%22italic%22 font-size=%2234%22 text-anchor=%22middle%22 fill=%22%23fffaf1%22%3Eb%3C/text%3E%3C/svg%3E">'
        '<meta property="og:title" content="Heir"><meta property="og:description" content="Your seniors graduated. Their promises did not. Play the new club head, then run the club with a committee agent that keeps its commitments.">'
        '<meta property="og:type" content="website"><meta property="og:url" content="https://bahniman.github.io/heir/"><meta name="twitter:card" content="summary_large_image">'
        '</head><body>')
page = head + out + "</body></html>"
(here / "heir-demo-local.html").write_text(page, encoding="utf-8")
(here.parent / "index.html").write_text(head + suite + "</body></html>", encoding="utf-8")  # GitHub Pages entry point
print("built", len(out), "bytes")
