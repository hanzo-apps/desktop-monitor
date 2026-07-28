//! Monitor — the template that exists because a web page *cannot* do this.
//!
//! One `System` is kept alive across calls: CPU percentages are a delta between
//! two refreshes, so a fresh `System::new()` per tick would report zeros. The
//! webview polls `snapshot` once a second; everything else is sysinfo.

use std::sync::Mutex;
use serde::Serialize;
use sysinfo::{Disks, Networks, ProcessesToUpdate, System};
use tauri::State;

#[derive(Serialize)]
pub struct Proc { pid: u32, name: String, cpu: f32, mem: u64 }
#[derive(Serialize)]
pub struct Disk { name: String, mount: String, total: u64, free: u64 }
#[derive(Serialize)]
pub struct Net { iface: String, rx: u64, tx: u64 }

#[derive(Serialize)]
pub struct Snap {
    host: String, os: String, kernel: String, uptime: u64,
    cpus: Vec<f32>, brand: String, load: [f64; 3],
    mem_total: u64, mem_used: u64, swap_total: u64, swap_used: u64,
    procs: Vec<Proc>, disks: Vec<Disk>, nets: Vec<Net>,
}

pub struct Host {
    sys: Mutex<System>,
    disks: Mutex<Disks>,
    nets: Mutex<Networks>,
}

#[tauri::command]
fn snapshot(host: State<'_, Host>) -> Snap {
    let mut sys = host.sys.lock().unwrap();
    sys.refresh_cpu_all();
    sys.refresh_memory();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let mut procs: Vec<Proc> = sys
        .processes()
        .iter()
        .map(|(pid, p)| Proc {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().into_owned(),
            cpu: p.cpu_usage(),
            mem: p.memory(),
        })
        .collect();
    procs.sort_by(|a, b| b.cpu.total_cmp(&a.cpu));
    procs.truncate(24);

    let mut disks = host.disks.lock().unwrap();
    disks.refresh(true);
    let mut nets = host.nets.lock().unwrap();
    nets.refresh(true);
    let load = System::load_average();

    Snap {
        host: System::host_name().unwrap_or_else(|| "localhost".into()),
        os: System::long_os_version().unwrap_or_else(|| std::env::consts::OS.into()),
        kernel: System::kernel_version().unwrap_or_default(),
        uptime: System::uptime(),
        brand: sys.cpus().first().map(|c| c.brand().trim().to_string()).unwrap_or_default(),
        cpus: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
        load: [load.one, load.five, load.fifteen],
        mem_total: sys.total_memory(),
        mem_used: sys.used_memory(),
        swap_total: sys.total_swap(),
        swap_used: sys.used_swap(),
        procs,
        disks: disks
            .iter()
            .map(|d| Disk {
                name: d.name().to_string_lossy().into_owned(),
                mount: d.mount_point().to_string_lossy().into_owned(),
                total: d.total_space(),
                free: d.available_space(),
            })
            .collect(),
        nets: nets
            .iter()
            .map(|(iface, d)| Net { iface: iface.clone(), rx: d.total_received(), tx: d.total_transmitted() })
            .collect(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Host {
            sys: Mutex::new(System::new_all()),
            disks: Mutex::new(Disks::new_with_refreshed_list()),
            nets: Mutex::new(Networks::new_with_refreshed_list()),
        })
        .invoke_handler(tauri::generate_handler![snapshot])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
