import { useEffect, useRef, useState } from "react";
import { Win, NavItem } from "./shell";
import { isNative } from "./native";
import { call } from "./web";

const RELEASES = "https://github.com/hanzo-templates/desktop-monitor/releases/latest";

type Proc = { pid: number; name: string; cpu: number; mem: number };
type Disk = { name: string; mount: string; total: number; free: number };
type Net = { iface: string; rx: number; tx: number };
export type Snap = {
  host: string; os: string; kernel: string; uptime: number;
  cpus: number[]; brand: string; load: [number, number, number];
  mem_total: number; mem_used: number; swap_total: number; swap_used: number;
  procs: Proc[]; disks: Disk[]; nets: Net[];
};

const gb = (n: number) => (n / 1024 ** 3).toFixed(1) + " GB";
const mb = (n: number) => (n / 1024 ** 2).toFixed(0) + " MB";
const dur = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

const PANES = ["CPU", "Memory", "Processes", "Storage", "Network"] as const;
type Pane = (typeof PANES)[number];

export default function App() {
  const [pane, setPane] = useState<Pane>("CPU");
  const [s, setS] = useState<Snap | null>(null);
  const hist = useRef<number[]>([]);
  const memHist = useRef<number[]>([]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      const next = await call("snapshot");
      if (!live) return;
      const avg = next.cpus.reduce((a, b) => a + b, 0) / Math.max(next.cpus.length, 1);
      hist.current = [...hist.current, avg].slice(-120);
      memHist.current = [...memHist.current, (next.mem_used / next.mem_total) * 100].slice(-120);
      setS(next);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => { live = false; clearInterval(iv); };
  }, []);

  const avg = s ? s.cpus.reduce((a, b) => a + b, 0) / s.cpus.length : 0;

  return (
    <Win
      title="Monitor"
      sub={s?.host}
      releases={RELEASES}
      status={
        <>
          <span>{s ? `${s.os} · ${s.kernel}` : "…"}</span>
          <span className="grow" />
          <span>up {s ? dur(s.uptime) : "—"}</span>
          <span>{isNative ? "sysinfo (real host)" : "sample data — install for your machine"}</span>
        </>
      }
      side={
        <>
          <h2>Panes</h2>
          <nav className="nav">
            {PANES.map((p) => (
              <NavItem key={p} on={pane === p} onClick={() => setPane(p)} dot={pane === p}>{p}</NavItem>
            ))}
          </nav>
          <h2>Now</h2>
          <div style={{ padding: "0 8px" }}>
            <Meter label="cpu" v={avg} txt={avg.toFixed(0) + "%"} />
            <Meter label="mem" v={s ? (s.mem_used / s.mem_total) * 100 : 0}
                   txt={s ? `${gb(s.mem_used)} / ${gb(s.mem_total)}` : "—"} />
            <Meter label="swap" v={s && s.swap_total ? (s.swap_used / s.swap_total) * 100 : 0}
                   txt={s ? gb(s.swap_used) : "—"} />
          </div>
          <h2>Load</h2>
          <div className="mono dim" style={{ padding: "0 8px", fontSize: 12 }}>
            {s ? s.load.map((x) => x.toFixed(2)).join("  ") : "—"}
          </div>
        </>
      }
    >
      {!s ? <div className="empty">sampling…</div> : (
        <>
          {pane === "CPU" && (
            <>
              <h3>{s.brand}</h3>
              <p className="muted" style={{ marginTop: 0 }}>{s.cpus.length} logical cores · 1 Hz sampling</p>
              <Spark data={hist.current} color="var(--accent)" label="total %" />
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", marginTop: 16 }}>
                {s.cpus.map((c, i) => (
                  <div className="card" key={i} style={{ padding: "10px 12px" }}>
                    <div className="row" style={{ fontSize: 12 }}>
                      <span className="dim mono">cpu{i}</span>
                      <span className="grow" />
                      <span className="mono">{c.toFixed(0)}%</span>
                    </div>
                    <Bar v={c} />
                  </div>
                ))}
              </div>
            </>
          )}
          {pane === "Memory" && (
            <>
              <h3>Memory</h3>
              <Spark data={memHist.current} color="var(--accent-2)" label="used %" />
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginTop: 16 }}>
                {[["total", gb(s.mem_total)], ["used", gb(s.mem_used)],
                  ["free", gb(s.mem_total - s.mem_used)], ["swap used", gb(s.swap_used)]].map(([k, v]) => (
                  <div className="card" key={k}>
                    <div className="dim" style={{ fontSize: 11, textTransform: "uppercase" }}>{k}</div>
                    <div style={{ fontSize: 20 }} className="mono">{v}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {pane === "Processes" && (
            <>
              <h3>Top processes by CPU</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
                <thead><tr className="dim" style={{ fontSize: 11, textAlign: "left" }}>
                  <th style={{ padding: "6px 0" }}>PID</th><th>NAME</th>
                  <th style={{ textAlign: "right" }}>CPU</th><th style={{ textAlign: "right" }}>MEM</th>
                </tr></thead>
                <tbody>
                  {s.procs.map((p) => (
                    <tr key={p.pid} style={{ borderTop: "1px solid var(--line)" }}>
                      <td className="mono dim" style={{ padding: "6px 0" }}>{p.pid}</td>
                      <td>{p.name}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{p.cpu.toFixed(1)}%</td>
                      <td className="mono dim" style={{ textAlign: "right" }}>{mb(p.mem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {pane === "Storage" && (
            <>
              <h3>Disks</h3>
              <div className="grid" style={{ marginTop: 12 }}>
                {s.disks.map((d) => (
                  <div className="card" key={d.mount}>
                    <div className="row">
                      <b>{d.name || d.mount}</b>
                      <span className="grow" />
                      <span className="mono dim">{gb(d.total - d.free)} / {gb(d.total)}</span>
                    </div>
                    <Bar v={d.total ? ((d.total - d.free) / d.total) * 100 : 0} />
                    <div className="dim mono" style={{ fontSize: 11, marginTop: 4 }}>{d.mount}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {pane === "Network" && (
            <>
              <h3>Interfaces</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
                <thead><tr className="dim" style={{ fontSize: 11, textAlign: "left" }}>
                  <th style={{ padding: "6px 0" }}>IFACE</th>
                  <th style={{ textAlign: "right" }}>RX</th><th style={{ textAlign: "right" }}>TX</th>
                </tr></thead>
                <tbody>
                  {s.nets.map((n) => (
                    <tr key={n.iface} style={{ borderTop: "1px solid var(--line)" }}>
                      <td className="mono" style={{ padding: "6px 0" }}>{n.iface}</td>
                      <td className="mono dim" style={{ textAlign: "right" }}>{gb(n.rx)}</td>
                      <td className="mono dim" style={{ textAlign: "right" }}>{gb(n.tx)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </Win>
  );
}

function Bar({ v }: { v: number }) {
  return (
    <div style={{ height: 5, background: "var(--bg-3)", borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
      <div style={{
        width: Math.min(100, v) + "%", height: "100%", borderRadius: 3,
        background: v > 85 ? "var(--danger)" : v > 60 ? "var(--warn)" : "var(--accent)",
        transition: "width .3s",
      }} />
    </div>
  );
}

function Meter({ label, v, txt }: { label: string; v: number; txt: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row" style={{ fontSize: 12 }}>
        <span className="dim">{label}</span><span className="grow" />
        <span className="mono" style={{ fontSize: 11 }}>{txt}</span>
      </div>
      <Bar v={v} />
    </div>
  );
}

/** 120-sample sparkline, plain SVG — no chart library in a 4 MB app. */
function Spark({ data, color, label }: { data: number[]; color: string; label: string }) {
  const W = 900, H = 120;
  const pts = data.map((v, i) => `${(i / 119) * W},${H - (Math.min(v, 100) / 100) * H}`).join(" ");
  return (
    <div className="card" style={{ marginTop: 14, padding: 12 }}>
      <div className="row dim" style={{ fontSize: 11 }}>
        <span>{label}</span><span className="grow" /><span className="mono">{data.length}/120 s</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 120, marginTop: 6 }}>
        {[25, 50, 75].map((y) => (
          <line key={y} x1={0} x2={W} y1={(y / 100) * H} y2={(y / 100) * H} stroke="var(--line)" strokeWidth={1} />
        ))}
        {data.length > 1 && (
          <>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <polygon points={`0,${H} ${pts} ${((data.length - 1) / 119) * W},${H}`} fill={color} opacity={0.12} />
          </>
        )}
      </svg>
    </div>
  );
}
