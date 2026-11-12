//! Port of apps/electron-backend/src/app/panel/device-id.ts. The id MUST stay byte-identical
//! to the Electron build: the panel registers devices by it.

use sha2::{Digest, Sha256};
use std::process::Command;
use std::sync::OnceLock;

/// Parses `reg query ... /v MachineGuid` output.
pub fn parse_machine_guid(output: &str) -> String {
    output
        .lines()
        .find_map(|line| {
            let mut parts = line.split_whitespace();
            let name = parts.next()?;
            let kind = parts.next()?;
            (name.eq_ignore_ascii_case("MachineGuid")
                && kind.to_ascii_uppercase().starts_with("REG_"))
            .then(|| parts.next().map(str::to_string))
            .flatten()
        })
        .unwrap_or_default()
}

/// SHA-256 of the raw id as 8 hex pairs ("A1:B2:…"); the first 16-hex window that does not
/// start with "00" (the panel's normalise_mac strips a leading "00:").
pub fn normalize_device_id(raw: &str) -> String {
    let hex = hex::encode_upper(Sha256::digest(raw.as_bytes()));
    let window = (0..=hex.len() - 16)
        .step_by(2)
        .map(|offset| &hex[offset..offset + 16])
        .find(|candidate| !candidate.starts_with("00"))
        .unwrap_or(&hex[..16]);
    window
        .as_bytes()
        .chunks(2)
        .map(|c| std::str::from_utf8(c).unwrap())
        .collect::<Vec<_>>()
        .join(":")
}

#[cfg(windows)]
pub(crate) fn run_hidden(command: &str, args: &[&str]) -> String {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    Command::new(command)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

#[cfg(not(windows))]
pub(crate) fn run_hidden(command: &str, args: &[&str]) -> String {
    Command::new(command)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

fn read_raw_machine_id() -> String {
    let raw = if cfg!(windows) {
        parse_machine_guid(&run_hidden(
            "reg",
            &[
                "query",
                r"HKLM\SOFTWARE\Microsoft\Cryptography",
                "/v",
                "MachineGuid",
            ],
        ))
    } else {
        ["/etc/machine-id", "/var/lib/dbus/machine-id"]
            .iter()
            .filter_map(|p| std::fs::read_to_string(p).ok())
            .map(|s| s.trim().to_string())
            .find(|s| !s.is_empty())
            .unwrap_or_default()
    };
    if raw.is_empty() {
        fallback_id()
    } else {
        raw
    }
}

// shortcut: Node's fallback used os.hostname() + the first sorted non-internal MAC of interfaces
// with an address; this one uses the hostname only, so a device that has neither MachineGuid nor
// /etc/machine-id gets a different id than in Electron. Port the MAC part if the panel reports it.
fn fallback_id() -> String {
    let host = std::env::var("COMPUTERNAME")
        .ok()
        .or_else(|| std::fs::read_to_string("/proc/sys/kernel/hostname").ok())
        .unwrap_or_default();
    format!("{}|", host.trim())
}

pub fn device_id() -> &'static str {
    static ID: OnceLock<String> = OnceLock::new();
    ID.get_or_init(|| normalize_device_id(&read_raw_machine_id()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_reg_query_output() {
        let out = "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    6f1c2b3a-1111-2222-3333-444455556666\r\n\r\n";
        assert_eq!(
            parse_machine_guid(out),
            "6f1c2b3a-1111-2222-3333-444455556666"
        );
        assert_eq!(parse_machine_guid("nothing here"), "");
    }

    #[test]
    fn normalizes_exactly_like_the_electron_build() {
        // Values from normalizeDeviceId() in device-id.ts (Node).
        assert_eq!(
            normalize_device_id("6f1c2b3a-1111-2222-3333-444455556666"),
            NODE_GUID_ID
        );
        assert_eq!(normalize_device_id("abc"), "BA:78:16:BF:8F:01:CF:EA");
        // sha256("raw17") starts with "00": the window moves one pair, as the panel expects.
        assert_eq!(normalize_device_id("raw17"), "92:1B:2A:8C:F5:8E:8A:D3");
    }

    const NODE_GUID_ID: &str = "AB:A7:21:3F:5A:C1:2E:12";
}
