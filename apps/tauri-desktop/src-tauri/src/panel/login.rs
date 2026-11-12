//! Port of apps/electron-backend/src/app/panel/panel-login.service.ts (api/login.php).
//! Same actions, payload fields, encryption, anti-replay `ts` retry and result shape.

use super::crypto::{decrypt_payload, encrypt_payload};
use super::{panel_app_id, post_form};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const ACTIONS: &[&str] = &[
    "check_mac",
    "fetch_dns",
    "submit_url",
    "auto_demo",
    "tenant_config",
    "features",
    "set_pin",
    "review_login",
];
/// 200 answers encrypted with the master key.
const ENCRYPTED_REPLY: &[&str] = &["fetch_dns", "tenant_config"];
/// Answers that carry the line: asked encrypted with "enc": 1 (an older panel still answers JSON).
const LINE_REPLY: &[&str] = &["check_mac", "auto_demo"];
const MAYBE_ENCRYPTED: &[&str] = &["check_mac", "auto_demo", "set_pin"];

/// Panel time minus device time (seconds), for the "ts" of every request.
static CLOCK_SKEW: AtomicI64 = AtomicI64::new(0);

#[derive(Debug, Default, Deserialize)]
pub struct LoginPayload {
    pub username: Option<String>,
    pub password: Option<String>,
    pub url: Option<String>,
    pub tenant: Option<String>,
    pub reseller: Option<String>,
    pub lang: Option<String>,
    pub cc: Option<Value>,
    pub poll: Option<Value>,
    pub old_pin: Option<String>,
    pub pin: Option<String>,
    pub demo: Option<Value>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct LoginResult {
    pub ok: bool,
    pub status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<&'static str>,
}

impl LoginResult {
    fn fail(status: u16, code: &'static str, error: &str) -> Self {
        Self {
            ok: false,
            status,
            data: None,
            error: Some(error.into()),
            code: Some(code),
        }
    }
    fn ok(status: u16, data: Value) -> Self {
        Self {
            ok: true,
            status,
            data: Some(data),
            error: None,
            code: None,
        }
    }
}

pub fn is_tenant_code(v: &str) -> bool {
    v.len() == 6 && v.bytes().all(|b| b.is_ascii_digit())
}

pub fn is_reseller_code(v: &str) -> bool {
    let t = v.trim();
    t.len() == 6
        && t.bytes().all(|b| b.is_ascii_alphanumeric())
        && v.bytes().any(|b| b.is_ascii_alphabetic())
}

fn is_pin(v: &str) -> bool {
    v.len() == 4 && v.bytes().all(|b| b.is_ascii_digit())
}

/// JavaScript Number(): numbers and numeric strings; anything else is NaN (None).
fn js_number(v: &Option<Value>) -> Option<f64> {
    match v.as_ref()? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse().ok(),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

fn trimmed(v: &Option<String>) -> Option<String> {
    v.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// The plain JSON sent encrypted as "data" (fields left out exactly when the TypeScript left them undefined).
pub fn plain_payload(
    action: &str,
    p: &LoginPayload,
    device_id: &str,
    tenant: &str,
    lang: Option<&str>,
    ts: i64,
) -> Value {
    let mut m = Map::new();
    let mut put = |k: &str, v: Option<Value>| {
        if let Some(v) = v {
            m.insert(k.into(), v);
        }
    };
    let s = |v: Option<String>| v.map(Value::from);
    if action == "tenant_config" {
        put("code", Some(tenant.into()));
        put("app", Some(panel_app_id().into()));
        put("device", Some(device_id.into()));
        put("lang", lang.map(Value::from));
        put("ts", Some(ts.into()));
        return Value::Object(m);
    }
    put("mac_address", Some(device_id.into()));
    put("username", s(trimmed(&p.username)));
    put("password", s(trimmed(&p.password)));
    put("url", s(trimmed(&p.url)));
    let reseller = p
        .reseller
        .as_deref()
        .filter(|r| action == "auto_demo" && is_reseller_code(r));
    put("reseller", reseller.map(|r| r.trim().to_uppercase().into()));
    put(
        "old_pin",
        p.old_pin
            .as_deref()
            .filter(|v| action == "set_pin" && is_pin(v))
            .map(Value::from),
    );
    put(
        "pin",
        p.pin
            .as_deref()
            .filter(|v| action == "set_pin" && is_pin(v))
            .map(Value::from),
    );
    put(
        "demo",
        (action == "review_login" && js_number(&p.demo) == Some(1.0)).then(|| 1.into()),
    );
    put("tenant", (!tenant.is_empty()).then(|| tenant.into()));
    put("app", (!tenant.is_empty()).then(|| panel_app_id().into()));
    put("enc", LINE_REPLY.contains(&action).then(|| 1.into()));
    put("platform", Some(panel_app_id().into()));
    put("lang", lang.map(Value::from));
    if action == "check_mac" {
        let cc = js_number(&p.cc)
            .filter(|n| n.is_finite())
            .unwrap_or(0.0)
            .floor()
            .max(0.0) as i64;
        put("cc", Some(cc.into()));
        put("poll", (js_number(&p.poll) == Some(1.0)).then(|| 1.into()));
    }
    put("ts", Some(ts.into()));
    Value::Object(m)
}

/// The panel's time from a 401 ts_expired / ts_invalid / replay reply.
fn replay_server_time(text: &str) -> Option<i64> {
    let v: Value = serde_json::from_str(text).ok()?;
    let code = v.get("code")?.as_str()?;
    let t = match v.get("server_time")? {
        Value::Number(n) => n.as_f64()?,
        Value::String(s) => s.parse().ok()?,
        _ => return None,
    };
    (code.starts_with("ts_") && t > 0.0).then_some(t as i64)
}

fn error_message(data: &Value, fallback: String) -> String {
    ["error", "message"]
        .iter()
        .find_map(|k| {
            data.get(*k)
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
        })
        .map(str::to_string)
        .unwrap_or(fallback)
}

pub async fn login_request(
    client: &reqwest::Client,
    url: &str,
    action: &str,
    payload: Option<LoginPayload>,
    master_key: Option<&[u8]>,
    device_id: &str,
) -> LoginResult {
    if !ACTIONS.contains(&action) {
        return LoginResult::fail(0, "BAD_RESPONSE", "Acción no válida");
    }
    let Some(key) = master_key else {
        return LoginResult::fail(
            0,
            "NO_MASTER_KEY",
            "Esta compilación no tiene la clave del panel (PANEL_MASTER_KEY).",
        );
    };
    let p = payload.unwrap_or_default();
    let tenant = p.tenant.as_deref().map(str::trim).unwrap_or("").to_string();
    if (!tenant.is_empty() && !is_tenant_code(&tenant))
        || (action == "tenant_config" && tenant.is_empty())
    {
        return LoginResult::fail(0, "BAD_RESPONSE", "Número de distribuidor no válido");
    }
    let lang = p
        .lang
        .as_deref()
        .filter(|l| matches!(*l, "es" | "en" | "pt" | "fr"));

    let (mut status, mut text) = (0u16, String::new());
    for attempt in 0..2 {
        let ts = now_secs() + CLOCK_SKEW.load(Ordering::Relaxed);
        let data = encrypt_payload(
            &plain_payload(action, &p, device_id, &tenant, lang, ts).to_string(),
            key,
        );
        match post_form(client, url, &[("action", action), ("data", &data)]).await {
            Ok((s, t)) => (status, text) = (s, t),
            Err(_) => return LoginResult::fail(0, "NETWORK", "No se pudo conectar con el panel."),
        }
        let server_time = if attempt == 0 && status == 401 {
            replay_server_time(&text)
        } else {
            None
        };
        match server_time {
            Some(t) => CLOCK_SKEW.store(t - now_secs(), Ordering::Relaxed),
            None => break,
        }
    }

    if ENCRYPTED_REPLY.contains(&action) && status == 200 {
        let value =
            decrypt_payload(&text, key).and_then(|d| serde_json::from_str::<Value>(&d).ok());
        return match (action, value) {
            ("fetch_dns", Some(Value::Array(items))) => LoginResult::ok(
                status,
                Value::Array(items.into_iter().filter(Value::is_string).collect()),
            ),
            ("tenant_config", Some(v @ Value::Object(_))) => LoginResult::ok(status, v),
            _ => LoginResult::fail(status, "BAD_RESPONSE", "Respuesta del panel no válida."),
        };
    }

    let body = text.trim();
    if MAYBE_ENCRYPTED.contains(&action)
        && status == 200
        && !body.is_empty()
        && !body.starts_with('{')
    {
        return match decrypt_payload(body, key).and_then(|d| serde_json::from_str::<Value>(&d).ok())
        {
            Some(v @ Value::Object(_)) => LoginResult::ok(status, v),
            _ => LoginResult::fail(
                status,
                "BAD_RESPONSE",
                "La llave de la app no coincide con la del panel.",
            ),
        };
    }

    match serde_json::from_str::<Value>(&text) {
        Ok(data) if (200..300).contains(&status) => LoginResult::ok(status, data),
        Ok(data) => LoginResult {
            ok: false,
            status,
            error: Some(error_message(&data, format!("Error del panel ({status})."))),
            data: Some(data),
            code: Some("HTTP"),
        },
        Err(_) => LoginResult::fail(
            status,
            "BAD_RESPONSE",
            &format!("Error del panel ({status})."),
        ),
    }
}

#[cfg(test)]
#[path = "login_tests.rs"]
mod tests;
