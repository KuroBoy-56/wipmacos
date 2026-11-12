//! Port of apps/electron-backend/src/app/panel/panel-report.service.ts (api/report.php).

use super::crypto::encrypt_payload;
use super::{panel_app_id, post_form};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const KINDS: &[&str] = &["crash", "error", "playback", "network", "panel", "warning"];

#[derive(Debug, Default, Deserialize)]
pub struct ErrorReport {
    pub kind: Option<String>,
    pub message: Option<String>,
    pub detail: Option<String>,
    pub screen: Option<String>,
    pub user: Option<String>,
    pub server: Option<String>,
    pub tenant: Option<String>,
    pub lang: Option<String>,
}

fn clip(v: &Option<String>, max: usize) -> String {
    v.as_deref().unwrap_or("").chars().take(max).collect()
}

/// Node os.type() / os.arch() names, so the panel log looks the same as from the Electron build.
fn os_type() -> &'static str {
    if cfg!(windows) {
        "Windows_NT"
    } else if cfg!(target_os = "macos") {
        "Darwin"
    } else {
        "Linux"
    }
}

fn node_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "ia32",
        "aarch64" => "arm64",
        other => other,
    }
}

/// Node os.release(): kernel version on Linux, "major.minor.build" on Windows.
fn os_release() -> String {
    if cfg!(windows) {
        let out = super::device_id::run_hidden(
            "reg",
            &[
                "query",
                r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion",
            ],
        );
        let field = |name: &str| {
            out.lines().find_map(|l| {
                let mut p = l.split_whitespace();
                (p.next()? == name)
                    .then(|| p.nth(1).map(str::to_string))
                    .flatten()
            })
        };
        let num = |name: &str| {
            field(name).and_then(|v| u32::from_str_radix(v.trim_start_matches("0x"), 16).ok())
        };
        match (
            num("CurrentMajorVersionNumber"),
            num("CurrentMinorVersionNumber"),
            field("CurrentBuildNumber"),
        ) {
            (Some(a), Some(b), Some(c)) => format!("{a}.{b}.{c}"),
            _ => String::new(),
        }
    } else {
        std::fs::read_to_string("/proc/sys/kernel/osrelease")
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    }
}

/// The same message is sent at most once a minute (shared across calls).
fn first_in_a_minute(key: String) -> bool {
    static RECENT: Mutex<Option<HashMap<String, Instant>>> = Mutex::new(None);
    let mut guard = RECENT.lock().unwrap_or_else(|e| e.into_inner());
    let recent = guard.get_or_insert_with(HashMap::new);
    let now = Instant::now();
    if recent
        .get(&key)
        .is_some_and(|t| now.duration_since(*t) < Duration::from_secs(60))
    {
        return false;
    }
    if recent.len() >= 200 {
        recent.clear();
    }
    recent.insert(key, now);
    true
}

/// Sends one error to «Errores de las apps». Never fails loudly: false when not sent.
pub async fn report_error(
    client: &reqwest::Client,
    url: &str,
    r: ErrorReport,
    master_key: Option<&[u8]>,
    device_id: &str,
    version: &str,
) -> bool {
    let message: String = r
        .message
        .as_deref()
        .unwrap_or("")
        .trim()
        .chars()
        .take(400)
        .collect();
    let Some(key) = master_key.filter(|_| !message.is_empty()) else {
        return false;
    };
    let kind = r
        .kind
        .as_deref()
        .filter(|k| KINDS.contains(k))
        .unwrap_or("error");
    if !first_in_a_minute(format!("{kind}|{message}")) {
        return false;
    }
    let mut body = json!({
        "app": panel_app_id(),
        "version": version,
        "kind": kind,
        "message": message,
        "detail": clip(&r.detail, 8000),
        "screen": clip(&r.screen, 120),
        "device": device_id,
        "model": format!("{} {}", os_type(), node_arch()),
        "os": format!("{} {}", if cfg!(target_os = "macos") { "macOS" } else { os_type() }, os_release()),
        "user": clip(&r.user, 80),
        "server": clip(&r.server, 200),
    });
    if let Some(t) = r
        .tenant
        .as_deref()
        .filter(|t| super::login::is_tenant_code(t))
    {
        body["tenant"] = t.into();
    }
    let lang = r
        .lang
        .as_deref()
        .filter(|l| matches!(*l, "es" | "en" | "pt" | "fr"));
    if let Some(l) = lang {
        body["lang"] = l.into();
    }
    let target = match lang {
        Some(l) => format!("{url}?lang={l}"),
        None => url.to_string(),
    };
    let data = encrypt_payload(&body.to_string(), key);
    matches!(
        post_form(client, &target, &[("data", &data)]).await,
        Ok((200, _))
    )
}
