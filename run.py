"""Local convenience launcher aligned with MISE_PORT (default 8001)."""

import os

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("MISE_PORT", "8001"))
    print(f"Mise en Place MD -> http://127.0.0.1:{port} (OpenAPI: /docs)")
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=True)
