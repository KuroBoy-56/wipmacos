//! Port of panelEndpoint() in libs/shared/interfaces/src/lib/panel-endpoint.util.ts.
//! The constant comes from that file at compile time (build.rs), so both builds share it.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use std::sync::OnceLock;

/// Reverses hex -> base64 -> XOR(key).
pub fn decode_panel_url(hex_text: &str, key: &str) -> Option<String> {
    let b64 = hex::decode(hex_text).ok()?;
    let xored = B64.decode(b64).ok()?;
    let key = key.as_bytes();
    if key.is_empty() {
        return None;
    }
    let plain: Vec<u8> = xored
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    String::from_utf8(plain).ok()
}

/// ".../api/player_api.php" -> ".../api/".
pub fn derive_api_base(url: &str) -> String {
    match url.rfind('/') {
        Some(i) => url[..=i].to_string(),
        None => format!("{url}/"),
    }
}

pub fn panel_endpoint(file: &str) -> String {
    static BASE: OnceLock<String> = OnceLock::new();
    let base = BASE.get_or_init(|| {
        decode_panel_url(env!("MPX_PANEL_URL_HEX"), env!("MPX_PANEL_URL_KEY"))
            .map(|url| derive_api_base(&url))
            .unwrap_or_default()
    });
    format!("{base}{file}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode(url: &str, key: &str) -> String {
        let k = key.as_bytes();
        let xored: Vec<u8> = url
            .bytes()
            .enumerate()
            .map(|(i, b)| b ^ k[i % k.len()])
            .collect();
        hex::encode(B64.encode(xored))
    }

    #[test]
    fn decodes_the_same_format_as_the_typescript_helper() {
        let hex_text = encode("https://example.test/a/api/player_api.php", "KURO");
        let url = decode_panel_url(&hex_text, "KURO").unwrap();
        assert_eq!(url, "https://example.test/a/api/player_api.php");
        assert_eq!(derive_api_base(&url), "https://example.test/a/api/");
        assert_eq!(decode_panel_url("zz", "KURO"), None);
    }

    #[test]
    fn the_compiled_in_panel_url_is_https() {
        assert!(panel_endpoint("login.php").starts_with("https://"));
        assert!(panel_endpoint("login.php").ends_with("/api/login.php"));
    }
}
