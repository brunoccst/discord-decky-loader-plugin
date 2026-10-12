import asyncio
import json
from pathlib import Path

# The decky plugin module is located at decky-loader/plugin
# For easy intellisense checkout the decky-loader code repo
# and add the `decky-loader/plugin/imports` path to `python.analysis.extraPaths` in `.vscode/settings.json`
import decky
from aiohttp import ClientSession, WSMsgType  # bundled with Decky Loader

# Steam's CEF exposes the DevTools protocol locally; Decky itself relies on it.
DEVTOOLS_URL = "http://127.0.0.1:8080/json"
# The frontend creates the hidden browser view on this URL so we can find it.
BOOT_URL = "data:text/plain,discord-deck-boot"
DISCORD_URL = "https://discord.com/app"
BINDING = "discordDeckEmit"


def bridge_source() -> str:
    plugin_dir = Path(decky.DECKY_PLUGIN_DIR)
    for path in (plugin_dir / "bridge.js", plugin_dir / "defaults" / "bridge.js"):
        if path.exists():
            return path.read_text()
    raise FileNotFoundError("bridge.js not found in plugin directory")


class DevToolsTab:
    """A minimal DevTools protocol client for one browser tab."""

    def __init__(self, ws_url: str, on_event, on_closed):
        self.ws_url = ws_url
        self.on_event = on_event
        self.on_closed = on_closed
        self.session = None
        self.ws = None
        self.reader = None
        self.next_id = 0
        self.pending: dict[int, asyncio.Future] = {}

    async def connect(self):
        self.session = ClientSession()
        self.ws = await self.session.ws_connect(self.ws_url, max_msg_size=0)
        self.reader = asyncio.create_task(self._read())

    async def send(self, method: str, params: dict | None = None, timeout: float = 15):
        if self.ws is None or self.ws.closed:
            raise RuntimeError("Discord tab is not connected")
        self.next_id += 1
        msg_id = self.next_id
        future = asyncio.get_event_loop().create_future()
        self.pending[msg_id] = future
        await self.ws.send_json({"id": msg_id, "method": method, "params": params or {}})
        try:
            return await asyncio.wait_for(future, timeout)
        finally:
            self.pending.pop(msg_id, None)

    async def evaluate(self, expression: str):
        res = await self.send("Runtime.evaluate", {
            "expression": expression,
            "awaitPromise": True,
            "returnByValue": True,
        })
        if "exceptionDetails" in res:
            details = res["exceptionDetails"]
            message = details.get("exception", {}).get("description") or details.get("text")
            raise RuntimeError(message)
        return res.get("result", {}).get("value")

    async def _read(self):
        try:
            async for msg in self.ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                data = json.loads(msg.data)
                if "id" in data:
                    future = self.pending.get(data["id"])
                    if future and not future.done():
                        if "error" in data:
                            future.set_exception(RuntimeError(data["error"].get("message")))
                        else:
                            future.set_result(data.get("result", {}))
                elif data.get("method") == "Runtime.bindingCalled":
                    params = data.get("params", {})
                    if params.get("name") == BINDING:
                        try:
                            await self.on_event(json.loads(params.get("payload", "{}")))
                        except Exception:
                            decky.logger.exception("Failed to handle Discord tab event")
        finally:
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(RuntimeError("Discord tab closed"))
            await self.on_closed(self)

    async def close(self):
        if self.ws is not None and not self.ws.closed:
            await self.ws.close()
        if self.session is not None:
            await self.session.close()


async def find_tab_ws_url(url: str, attempts: int = 50) -> str:
    async with ClientSession() as session:
        for _ in range(attempts):
            try:
                async with session.get(DEVTOOLS_URL, timeout=3) as res:
                    for tab in await res.json(content_type=None):
                        if tab.get("url") == url and tab.get("webSocketDebuggerUrl"):
                            return tab["webSocketDebuggerUrl"]
            except Exception:
                pass
            await asyncio.sleep(0.2)
    raise RuntimeError("Could not find the Discord browser view")


class Plugin:
    tab: DevToolsTab | None = None
    last_state: dict = {}
    attach_lock: asyncio.Lock | None = None

    # Called by the frontend once it has created the hidden browser view.
    async def attach(self) -> bool:
        async with self.attach_lock:
            if self.tab is not None:
                old, self.tab = self.tab, None
                await old.close()
            self.last_state = {}

            ws_url = await find_tab_ws_url(BOOT_URL)
            tab = DevToolsTab(ws_url, self._on_tab_event, self._on_tab_closed)
            await tab.connect()
            try:
                await tab.send("Runtime.enable")
                await tab.send("Page.enable")
                await tab.send("Runtime.addBinding", {"name": BINDING})
                await tab.send("Page.addScriptToEvaluateOnNewDocument", {
                    "source": bridge_source(),
                    "runImmediately": True,
                })
                self.tab = tab
                await tab.send("Page.navigate", {"url": DISCORD_URL})
            except Exception:
                self.tab = None
                await tab.close()
                raise
            decky.logger.info("Discord tab attached")
            return True

    async def get_state(self) -> dict:
        return {"attached": self.tab is not None, **self.last_state}

    # Runs one of the bridge's commands inside the Discord tab.
    async def command(self, name: str, args: dict | None = None):
        if self.tab is None:
            raise RuntimeError("Discord is not running")
        expression = (
            "window.__discordDeck ? window.__discordDeck.run("
            f"{json.dumps(name)}, {json.dumps(args or {})}"
            ") : Promise.reject(new Error('Discord is still loading'))"
        )
        return await self.tab.evaluate(expression)

    async def _on_tab_event(self, event: dict):
        kind = event.get("type")
        if kind == "state":
            self.last_state = event.get("state") or {}
            await decky.emit("state", await self.get_state())
        elif kind == "micOffer":
            await decky.emit("mic_offer", event.get("sdp"))
        elif kind == "keyboard":
            await decky.emit("show_keyboard")

    async def _on_tab_closed(self, tab: DevToolsTab):
        if self.tab is not tab:
            return
        decky.logger.warning("Discord tab connection closed")
        self.tab = None
        self.last_state = {}
        await decky.emit("tab_lost")

    async def _main(self):
        self.attach_lock = asyncio.Lock()
        decky.logger.info("Discord Deck backend started")

    async def _unload(self):
        if self.tab is not None:
            tab, self.tab = self.tab, None
            await tab.close()
        decky.logger.info("Discord Deck backend stopped")

    async def _uninstall(self):
        pass
