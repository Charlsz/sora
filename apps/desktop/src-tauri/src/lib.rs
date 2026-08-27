use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
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

fn sidecar_args(port: &str) -> Vec<String> {
  vec!["start".into(), "--port".into(), port.into()]
}

/** Dev uses live Bun sources; release prefers the compiled sidecar. */
fn resolve_runtime(
  app: &tauri::AppHandle,
  port: &str,
) -> (PathBuf, Vec<String>, Option<PathBuf>) {
  let args = sidecar_args(port);
  let root = repo_root();

  // `tauri dev` copies a stale sidecar next to the exe. Prefer source so API
  // changes (e.g. agent policy / capabilities) apply without a sidecar rebuild.
  if cfg!(debug_assertions) {
    return (
      PathBuf::from("bun"),
      vec![
        "cli/src/bin.ts".into(),
        "start".into(),
        "--port".into(),
        port.into(),
      ],
      Some(root),
    );
  }

  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      for name in ["sora-runtime.exe", "sora-runtime"] {
        let candidate = dir.join(name);
        if candidate.is_file() {
          return (candidate, args, None);
        }
      }
    }
  }

  if let Ok(resource) = app.path().resource_dir() {
    for name in ["sora-runtime.exe", "sora-runtime"] {
      let candidate = resource.join(name);
      if candidate.is_file() {
        return (candidate, args.clone(), None);
      }
    }
  }

  let sidecar_dev = root.join("apps/desktop/src-tauri/binaries");
  if let Ok(entries) = std::fs::read_dir(&sidecar_dev) {
    for entry in entries.flatten() {
      let name = entry.file_name().to_string_lossy().into_owned();
      if name.starts_with("sora-runtime") && !name.contains("gitignore") {
        return (entry.path(), args, None);
      }
    }
  }

  (
    PathBuf::from("bun"),
    vec![
      "cli/src/bin.ts".into(),
      "start".into(),
      "--port".into(),
      port.into(),
    ],
    Some(root),
  )
}

fn spawn_runtime(bin: &Path, args: &[String], cwd: Option<&Path>) -> Option<Child> {
  let mut cmd = Command::new(bin);
  cmd.args(args).env("SORA_BROWSER", "on");

  // Release sidecar (sora-runtime.exe) must stay invisible — inheriting stdio
  // or omitting CREATE_NO_WINDOW pops a console on Windows during onboarding.
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
  }

  if cfg!(debug_assertions) {
    cmd.stdout(Stdio::inherit()).stderr(Stdio::inherit());
  } else {
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
  }

  if let Some(dir) = cwd {
    cmd.current_dir(dir);
  }
  cmd.spawn().ok()
}

fn start_api(app: &tauri::AppHandle, port: &str) -> Option<Child> {
  if api_up(port) {
    return None;
  }
  let (bin, args, cwd) = resolve_runtime(app, port);
  let child = spawn_runtime(&bin, &args, cwd.as_deref())?;
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

  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(move |app| {
      let child = start_api(app.handle(), &port);
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
