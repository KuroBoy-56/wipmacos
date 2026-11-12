//! The main window never leaves the bundled app (Electron: will-navigate gate in app.ts).

use tauri::Url;

/// App origins: tauri://localhost (Linux/macOS), http(s)://tauri.localhost (Windows), the dev server.
pub fn allow_navigation(url: &Url) -> bool {
    match (url.scheme(), url.host_str()) {
        ("tauri", Some("localhost")) => true,
        ("http" | "https", Some("tauri.localhost")) => true,
        ("http", Some("localhost")) => cfg!(debug_assertions) && url.port() == Some(4200),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(u: &str) -> bool {
        allow_navigation(&Url::parse(u).unwrap())
    }

    #[test]
    fn only_app_origins_are_allowed() {
        assert!(allowed("tauri://localhost/index.html"));
        assert!(allowed("http://tauri.localhost/workspace"));
        assert!(!allowed("https://evil.example/"));
        assert!(!allowed("file:///etc/passwd"));
        assert!(!allowed("http://tauri.localhost.evil.example/"));
        assert_eq!(allowed("http://localhost:4200/"), cfg!(debug_assertions));
        assert!(!allowed("http://localhost:8080/"));
    }
}
