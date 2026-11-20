import webbrowser
from threading import Timer

import uvicorn


def open_browser():
    webbrowser.open("http://127.0.0.1:8000")


if __name__ == "__main__":
    print("==========================================================")
    print("  Atelier Culinario — Recetario Técnico Local (MD + YAML)")
    print("  URL: http://127.0.0.1:8000")
    print("==========================================================")
    Timer(1.2, open_browser).start()
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
