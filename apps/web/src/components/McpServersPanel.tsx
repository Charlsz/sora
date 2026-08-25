import { useEffect, useState } from "react";
import { soraApi, type McpServer } from "../api";

export default function McpServersPanel({
  onError,
  onMessage,
}: {
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");

  async function refresh() {
    const data = await soraApi.mcpServers();
    setServers(data.servers);
  }

  async function reloadTools() {
    const reloaded = await soraApi.reloadMcp();
    setTools(reloaded.tools);
  }

  useEffect(() => {
    refresh()
      .then(() => reloadTools())
      .catch((err) =>
        onError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  async function add() {
    const serverId =
      id.trim() ||
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-");
    if (!serverId || !name.trim()) {
      onError("Server id and name are required");
      return;
    }
    setBusy(true);
    try {
      const result = await soraApi.addMcpServer({
        id: serverId,
        name: name.trim(),
        transport,
        command: transport === "stdio" ? command.trim() : undefined,
        args:
          transport === "stdio" && args.trim()
            ? args.split(/\s+/).filter(Boolean)
            : undefined,
        url: transport === "http" ? url.trim() : undefined,
        enabled: true,
      });
      setServers(result.servers);
      setId("");
      setName("");
      setCommand("");
      setArgs("");
      setUrl("");
      onMessage(`MCP server "${serverId}" saved`);
      await reloadTools();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(serverId: string) {
    setBusy(true);
    try {
      const result = await soraApi.deleteMcpServer(serverId);
      setServers(result.servers);
      onMessage(`Removed ${serverId}`);
      await reloadTools();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-[12px] text-ink-3">
        Connect stdio or HTTP MCP servers. Tools hot-reload after save.
      </p>

      <div className="flex flex-col gap-2 rounded-control border border-line bg-field/50 p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTransport("stdio")}
            className={`rounded-control px-2.5 py-1 text-[12px] ${
              transport === "stdio"
                ? "bg-ink text-surface"
                : "bg-field text-ink-2"
            }`}
          >
            stdio
          </button>
          <button
            type="button"
            onClick={() => setTransport("http")}
            className={`rounded-control px-2.5 py-1 text-[12px] ${
              transport === "http"
                ? "bg-ink text-surface"
                : "bg-field text-ink-2"
            }`}
          >
            http
          </button>
        </div>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="id (e.g. filesystem)"
          className="h-8 rounded-control border border-line bg-surface px-2.5 font-mono text-[12px] text-ink outline-none"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
          className="h-8 rounded-control border border-line bg-surface px-2.5 text-[12px] text-ink outline-none"
        />
        {transport === "stdio" ? (
          <>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Command (e.g. npx)"
              className="h-8 rounded-control border border-line bg-surface px-2.5 font-mono text-[12px] text-ink outline-none"
            />
            <input
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="Args (space-separated)"
              className="h-8 rounded-control border border-line bg-surface px-2.5 font-mono text-[12px] text-ink outline-none"
            />
          </>
        ) : (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mcp.example.com/sse"
            className="h-8 rounded-control border border-line bg-surface px-2.5 font-mono text-[12px] text-ink outline-none"
          />
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void add()}
          className="self-start rounded-control bg-ink px-3 py-1.5 text-[12px] font-medium text-surface disabled:opacity-50"
        >
          Add server
        </button>
      </div>

      {servers.length > 0 && (
        <ul className="flex flex-col gap-2">
          {servers.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-2 rounded-control border border-line bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink">{s.name}</div>
                <div className="font-mono text-[11px] text-ink-3">
                  {s.id} · {s.transport}
                  {s.command ? ` · ${s.command}` : ""}
                  {s.url ? ` · ${s.url}` : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(s.id)}
                className="shrink-0 text-[12px] text-red"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {tools.length > 0 && (
        <div>
          <div className="text-[12px] font-medium text-ink-2">
            Discovered tools ({tools.length})
          </div>
          <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink-3">
            {tools.slice(0, 12).join(", ")}
            {tools.length > 12 ? ` … +${tools.length - 12} more` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
