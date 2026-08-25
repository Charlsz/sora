use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::Manager;

struct ApiProcess(Mutex<Option<Child>>);

fn repo_root() -> PathBuf {
  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("../../..")
    .canonicalize()
    .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.."))
}

fn api_up(port: &str) -> bool {
  let Ok(mut stream) = TcpStream::connect(format!("127.0.0.1:{port}")) else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
  let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
  let req = b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n";
  if stream.write_all(req).is_err() {
    return false;
  }
  let mut buf = [0u8; 128];
  match stream.read(&mut buf) {
    Ok(n) if n > 0 => String::from_utf8_lossy(&buf[..n]).contains("200"),
    _ => false,
  }
}

fn start_api(root: &PathBuf, port: &str) -> Option<Child> {
  if api_up(port) {
    return None;
  }
  let child = Command::new("bun")
    .args(["cli/src/bin.ts", "start", "--port", port])
    .current_dir(root)
    .stdout(Stdio::inherit())
    .stderr(Stdio::inherit())
    .spawn()
    .ok()?;
  for _ in 0..80 {
    if api_up(port) {
      return Some(child);
    }
    thread::sleep(Duration::from_millis(250));
  }
  Some(child)
}

fn kill_api(app: &tauri::AppHandle) {
  if let Some(state) = app.try_state::<ApiProcess>() {
    if let Ok(mut guard) = state.0.lock() {
      if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
      }
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let port = std::env::var("SORA_PORT").unwrap_or_else(|_| "7420".into());
  let root = repo_root();

  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(move |app| {
      let child = start_api(&root, &port);
      app.manage(ApiProcess(Mutex::new(child)));
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building Sora")
    .run(|app_handle, event| {
      if let tauri::RunEvent::Exit = event {
        kill_api(app_handle);
      }
    });
}
