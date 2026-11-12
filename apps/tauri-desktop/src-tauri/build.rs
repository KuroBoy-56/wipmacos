// The panel URL keeps one source of truth: the obfuscated constant the Electron build
// already uses (libs/shared/interfaces/src/lib/panel-endpoint.util.ts) is read at compile time.
fn const_value(source: &str, name: &str) -> String {
    let start = source
        .find(&format!("const {name} ="))
        .unwrap_or_else(|| panic!("{name} not found in panel-endpoint.util.ts"));
    let rest = &source[start..];
    let open = rest.find('\'').expect("string literal") + 1;
    let close = open + rest[open..].find('\'').expect("closing quote");
    rest[open..close].to_string()
}

fn main() {
    let path = "../../../libs/shared/interfaces/src/lib/panel-endpoint.util.ts";
    println!("cargo:rerun-if-changed={path}");
    let source = std::fs::read_to_string(path).expect("read panel-endpoint.util.ts");
    println!(
        "cargo:rustc-env=MPX_PANEL_URL_HEX={}",
        const_value(&source, "PANEL_URL_HEX")
    );
    println!(
        "cargo:rustc-env=MPX_PANEL_URL_KEY={}",
        const_value(&source, "PANEL_URL_KEY")
    );

    // Panel AES master key: PANEL_MASTER_KEY at build time, else the git-ignored file that
    // tools/panel/write-panel-key.mjs writes for the Electron build. Empty = login reports NO_MASTER_KEY.
    let key_file = "../../electron-backend/src/assets/panel-key.json";
    println!("cargo:rerun-if-env-changed=PANEL_MASTER_KEY");
    println!("cargo:rerun-if-changed={key_file}");
    let key = std::env::var("PANEL_MASTER_KEY").ok().or_else(|| {
        let json = std::fs::read_to_string(key_file).ok()?;
        let start = json.find("\"masterKeyHex\"")?;
        let rest = &json[start + 14..];
        let open = rest.find('"')? + 1;
        Some(rest[open..open + rest[open..].find('"')?].to_string())
    });
    let key = key
        .map(|k| k.trim().to_lowercase())
        .filter(|k| k.len() == 64 && k.bytes().all(|b| b.is_ascii_hexdigit()));
    println!(
        "cargo:rustc-env=MPX_PANEL_MASTER_KEY={}",
        key.unwrap_or_default()
    );

    // Every app command needs an explicit capability grant (capabilities/default.json).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "app_version",
            "window_minimize",
            "window_toggle_maximize",
            "window_close",
            "window_get_state",
            "panel_get_device_id",
            "panel_login_request",
            "panel_report_error",
        ]),
    ))
    .expect("tauri-build");
}
