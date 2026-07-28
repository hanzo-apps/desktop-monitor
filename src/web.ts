import { bridge } from "./native";
import type { Snap } from "./app";

/** A native app cannot be iframed, so the gallery preview runs this: the SAME
 *  UI over a synthetic host. It is labelled "sample data" in the status bar —
 *  the point of the preview is the interface, not a lie about your machine. */
let t = 0;
const walk = (base: number, amp: number, phase: number) =>
  Math.max(0, Math.min(100, base + Math.sin(t / 9 + phase) * amp + (Math.random() - 0.5) * 6));

const NAMES = ["zen-engine", "hanzod", "chrome", "code", "Terminal", "node", "cargo", "postgres", "Finder", "kernel_task"];

export const call = bridge({
  snapshot: (): Snap => {
    t += 1;
    const cpus = Array.from({ length: 10 }, (_, i) => walk(18 + (i % 3) * 9, 22, i));
    const mem_total = 128 * 1024 ** 3;
    return {
      host: "preview",
      os: "sample",
      kernel: "web build",
      uptime: 3600 * 27 + t,
      brand: "sample CPU — the native build reads your real host",
      cpus,
      load: [1.2 + Math.sin(t / 20) * 0.4, 1.1, 0.98],
      mem_total,
      mem_used: mem_total * (0.41 + Math.sin(t / 30) * 0.05),
      swap_total: 8 * 1024 ** 3,
      swap_used: 0.6 * 1024 ** 3,
      procs: NAMES.map((name, i) => ({
        pid: 400 + i * 137,
        name,
        cpu: walk(30 - i * 3, 12, i * 2),
        mem: (900 - i * 70) * 1024 ** 2,
      })).sort((a, b) => b.cpu - a.cpu),
      disks: [
        { name: "system", mount: "/", total: 2 * 1024 ** 4, free: 1.14 * 1024 ** 4 },
        { name: "scratch", mount: "/mnt/scratch", total: 4 * 1024 ** 4, free: 3.7 * 1024 ** 4 },
      ],
      nets: [
        { iface: "eth0", rx: 41.2 * 1024 ** 3, tx: 9.8 * 1024 ** 3 },
        { iface: "wlan0", rx: 3.1 * 1024 ** 3, tx: 0.7 * 1024 ** 3 },
      ],
    };
  },
});
