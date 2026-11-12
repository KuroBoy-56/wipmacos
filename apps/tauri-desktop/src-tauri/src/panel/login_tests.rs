use super::*;
use crate::panel::crypto::{decrypt_payload, encrypt_payload};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

fn key() -> Vec<u8> {
    (0u8..32).collect()
}

/// Minimal HTTP server: answers each request with the next scripted (status, body) and records request bodies.
async fn panel(replies: Vec<(u16, String)>) -> (String, Arc<Mutex<Vec<String>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/api/login.php", listener.local_addr().unwrap());
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = seen.clone();
    tokio::spawn(async move {
        for (status, body) in replies {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = Vec::new();
            let mut chunk = [0u8; 4096];
            loop {
                let n = sock.read(&mut chunk).await.unwrap();
                buf.extend_from_slice(&chunk[..n]);
                let text = String::from_utf8_lossy(&buf).to_string();
                if let Some(head_end) = text.find("\r\n\r\n") {
                    let len = text[..head_end]
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if buf.len() >= head_end + 4 + len {
                        log.lock().unwrap().push(text[head_end + 4..].to_string());
                        break;
                    }
                }
            }
            let reply = format!(
                "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            sock.write_all(reply.as_bytes()).await.unwrap();
        }
    });
    (url, seen)
}

/// Decrypted JSON "data" field of a recorded form body.
fn sent(form: &str) -> Value {
    let data = url::form_urlencoded::parse(form.as_bytes())
        .find(|(k, _)| k == "data")
        .unwrap()
        .1;
    serde_json::from_str(&decrypt_payload(&data, &key()).unwrap()).unwrap()
}

async fn call(url: &str, action: &str, payload: Value) -> LoginResult {
    let client = reqwest::Client::new();
    let p = serde_json::from_value(payload).unwrap();
    login_request(&client, url, action, Some(p), Some(&key()), "AB:CD").await
}

#[tokio::test]
async fn check_mac_sends_the_electron_payload_and_decrypts_the_line() {
    let line = encrypt_payload(r#"{"username":"u1","password":"p1"}"#, &key());
    let (url, seen) = panel(vec![(200, line)]).await;
    let r = call(
        &url,
        "check_mac",
        serde_json::json!({ "lang": "pt", "cc": "3.7", "poll": 1, "username": "  " }),
    )
    .await;
    assert_eq!(
        r,
        LoginResult::ok(
            200,
            serde_json::json!({ "username": "u1", "password": "p1" })
        )
    );

    let form = seen.lock().unwrap()[0].clone();
    assert!(form.starts_with("action=check_mac&data="));
    let body = sent(&form);
    assert_eq!(body["mac_address"], "AB:CD");
    assert_eq!(body["enc"], 1);
    assert_eq!(body["platform"], panel_app_id());
    assert_eq!(body["lang"], "pt");
    assert_eq!(body["cc"], 3);
    assert_eq!(body["poll"], 1);
    assert!(
        body.get("username").is_none(),
        "blank fields stay out, like undefined in JSON.stringify"
    );
    assert!(body.get("tenant").is_none() && body.get("app").is_none());
    assert!(body["ts"].as_i64().unwrap() > 1_700_000_000);
}

#[tokio::test]
async fn a_ts_expired_reply_is_retried_once_with_the_panel_clock() {
    let (url, seen) = panel(vec![
        (
            401,
            r#"{"code":"ts_expired","server_time":2000000000}"#.into(),
        ),
        (200, r#"{"features":{"demo":true}}"#.into()),
    ])
    .await;
    let r = call(&url, "features", serde_json::json!({})).await;
    assert!(r.ok);
    let second = sent(&seen.lock().unwrap()[1]);
    assert!((second["ts"].as_i64().unwrap() - 2_000_000_000).abs() <= 2);
    CLOCK_SKEW.store(0, Ordering::Relaxed);
}

#[tokio::test]
async fn tenant_config_uses_its_own_payload_and_an_encrypted_answer() {
    let (url, seen) = panel(vec![(200, encrypt_payload(r#"{"name":"Dist"}"#, &key()))]).await;
    let r = call(
        &url,
        "tenant_config",
        serde_json::json!({ "tenant": "123456", "lang": "xx" }),
    )
    .await;
    assert_eq!(r.data, Some(serde_json::json!({ "name": "Dist" })));
    let body = sent(&seen.lock().unwrap()[0]);
    assert_eq!(body["code"], "123456");
    assert_eq!(body["device"], "AB:CD");
    assert!(body.get("lang").is_none(), "only es/en/pt/fr are sent");
}

#[tokio::test]
async fn fetch_dns_keeps_only_strings_and_rejects_a_wrong_key() {
    let (url, _) = panel(vec![
        (200, encrypt_payload(r#"["http://a",3,"http://b"]"#, &key())),
        (200, encrypt_payload(r#"["x"]"#, &[5u8; 32])),
    ])
    .await;
    assert_eq!(
        call(&url, "fetch_dns", serde_json::json!({})).await.data,
        Some(serde_json::json!(["http://a", "http://b"]))
    );
    assert_eq!(
        call(&url, "fetch_dns", serde_json::json!({})).await.code,
        Some("BAD_RESPONSE")
    );
}

#[tokio::test]
async fn http_errors_keep_the_panel_message_and_data() {
    let (url, _) = panel(vec![
        (
            403,
            r#"{"code":"device_blocked","error":"Bloqueado"}"#.into(),
        ),
        (500, "oops".into()),
    ])
    .await;
    let blocked = call(&url, "check_mac", serde_json::json!({})).await;
    assert_eq!(
        (blocked.ok, blocked.status, blocked.code),
        (false, 403, Some("HTTP"))
    );
    assert_eq!(blocked.error.as_deref(), Some("Bloqueado"));
    assert_eq!(blocked.data.unwrap()["code"], "device_blocked");
    let broken = call(&url, "check_mac", serde_json::json!({})).await;
    assert_eq!(
        (broken.code, broken.error.as_deref()),
        (Some("BAD_RESPONSE"), Some("Error del panel (500)."))
    );
}

#[tokio::test]
async fn validation_happens_before_any_request() {
    let client = reqwest::Client::new();
    let nowhere = "http://127.0.0.1:9/";
    let r = login_request(&client, nowhere, "drop_tables", None, Some(&key()), "x").await;
    assert_eq!(r.error.as_deref(), Some("Acción no válida"));
    let r = login_request(&client, nowhere, "check_mac", None, None, "x").await;
    assert_eq!(r.code, Some("NO_MASTER_KEY"));
    let bad_tenant = serde_json::from_value(serde_json::json!({ "tenant": "12ab" })).unwrap();
    let r = login_request(
        &client,
        nowhere,
        "check_mac",
        Some(bad_tenant),
        Some(&key()),
        "x",
    )
    .await;
    assert_eq!(r.error.as_deref(), Some("Número de distribuidor no válido"));
    let r = login_request(&client, nowhere, "submit_url", None, Some(&key()), "x").await;
    assert_eq!(r.code, Some("NETWORK"));
}

#[test]
fn set_pin_auto_demo_and_review_login_only_send_valid_extras() {
    let p: LoginPayload = serde_json::from_value(serde_json::json!({
        "old_pin": "0000", "pin": "12a4", "reseller": "ab12cd", "demo": "1", "tenant": "654321"
    }))
    .unwrap();
    let pin = plain_payload("set_pin", &p, "D", "654321", None, 1);
    assert_eq!(
        (pin["old_pin"].as_str(), pin.get("pin")),
        (Some("0000"), None)
    );
    assert_eq!(
        (pin["tenant"].as_str(), pin["app"].as_str()),
        (Some("654321"), Some(panel_app_id()))
    );
    assert_eq!(
        plain_payload("auto_demo", &p, "D", "", None, 1)["reseller"],
        "AB12CD"
    );
    assert!(plain_payload("check_mac", &p, "D", "", None, 1)
        .get("reseller")
        .is_none());
    assert_eq!(
        plain_payload("review_login", &p, "D", "", None, 1)["demo"],
        1
    );
    assert!(
        !is_reseller_code("123456"),
        "six digits are a distributor code, not a reseller code"
    );
}
