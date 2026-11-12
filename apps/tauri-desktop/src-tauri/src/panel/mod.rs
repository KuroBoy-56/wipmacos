//! Panel bridge (PanelBridgeApi): device id, api/login.php, api/report.php and the DNS choice.
//! Port of apps/electron-backend/src/app/panel/. Encryption and the master key never reach the WebView.

pub mod crypto;
pub mod device_id;
pub mod endpoint;
pub mod login;
pub mod report;

use std::sync::OnceLock;
use std::time::Duration;

/// App id sent to the panel. Same rule as panelAppId(): "macos" on a Mac, "windows" otherwise
/// (the panel has no Linux id yet, see docs/MIGRATION_AUDIT.md).
pub fn panel_app_id() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else {
        "windows"
    }
}

/// One client for every panel request: rustls + OS trust store, certificates always verified
/// (the panel is in tls-policy.ts's "requires a valid certificate" list).
pub fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(30))
            .build()
            .expect("reqwest client")
    })
}

/// POST application/x-www-form-urlencoded; returns (status, body).
pub async fn post_form(
    client: &reqwest::Client,
    url: &str,
    fields: &[(&str, &str)],
) -> Result<(u16, String), reqwest::Error> {
    let body = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(fields)
        .finish();
    let res = client
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await?;
    let status = res.status().as_u16();
    Ok((status, res.text().await?))
}

fn key_from_hex(value: &str) -> Option<Vec<u8>> {
    let v = value.trim();
    (v.len() == 64).then(|| hex::decode(v).ok()).flatten()
}

/// PANEL_MASTER_KEY at run time (development), else the key compiled in by build.rs
/// (same env var or the git-ignored panel-key.json the Electron build uses). Never committed.
pub fn master_key() -> Option<&'static [u8]> {
    static KEY: OnceLock<Option<Vec<u8>>> = OnceLock::new();
    KEY.get_or_init(|| {
        std::env::var("PANEL_MASTER_KEY")
            .ok()
            .and_then(|v| key_from_hex(&v))
            .or_else(|| key_from_hex(env!("MPX_PANEL_MASTER_KEY")))
    })
    .as_deref()
}

#[tauri::command]
pub fn panel_get_device_id() -> String {
    device_id::device_id().to_string()
}

#[tauri::command]
pub async fn panel_login_request(
    action: String,
    payload: Option<login::LoginPayload>,
) -> login::LoginResult {
    login::login_request(
        http_client(),
        &endpoint::panel_endpoint("login.php"),
        &action,
        payload,
        master_key(),
        device_id::device_id(),
    )
    .await
}

#[tauri::command]
pub async fn panel_report_error(app: tauri::AppHandle, report: report::ErrorReport) -> bool {
    report::report_error(
        http_client(),
        &endpoint::panel_endpoint("report.php"),
        report,
        master_key(),
        device_id::device_id(),
        &app.package_info().version.to_string(),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn master_key_only_accepts_64_hex_chars() {
        assert_eq!(key_from_hex(&"ab".repeat(32)).map(|k| k.len()), Some(32));
        assert_eq!(key_from_hex("abcd"), None);
        assert_eq!(key_from_hex(&"zz".repeat(32)), None);
    }
}
