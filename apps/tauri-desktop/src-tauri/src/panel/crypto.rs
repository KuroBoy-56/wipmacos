//! Port of apps/electron-backend/src/app/panel/panel-crypto.ts.
//! Envelope: base64(salt16 + iv12 + AES-256-GCM ciphertext + tag16), key = HKDF(master, salt).

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;

const SALT_LEN: usize = 16;
const IV_LEN: usize = 12;
const TAG_LEN: usize = 16;

type HmacSha256 = Hmac<Sha256>;

fn hmac(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut mac = <HmacSha256 as Mac>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data);
    mac.finalize().into_bytes().into()
}

/// Same HKDF as the panel: prk = HMAC(salt, key); okm = HMAC(prk, 0x01)[0..32].
pub fn hkdf(master_key: &[u8], salt: &[u8]) -> [u8; 32] {
    let prk = hmac(salt, master_key);
    hmac(&prk, &[1])
}

pub fn encrypt_payload(plain: &str, master_key: &[u8]) -> String {
    let mut salt = [0u8; SALT_LEN];
    let mut iv = [0u8; IV_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut iv);
    let cipher = Aes256Gcm::new_from_slice(&hkdf(master_key, &salt)).expect("32-byte key");
    // aes-gcm appends the 16-byte tag to the ciphertext, the same layout as Node's body + tag.
    let body = cipher
        .encrypt(Nonce::from_slice(&iv), plain.as_bytes())
        .expect("AES-GCM encryption cannot fail for in-memory data");
    let mut out = Vec::with_capacity(SALT_LEN + IV_LEN + body.len());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&iv);
    out.extend_from_slice(&body);
    B64.encode(out)
}

/// None on bad base64, a short envelope, a wrong key or tampered data (GCM tag check).
pub fn decrypt_payload(encoded: &str, master_key: &[u8]) -> Option<String> {
    let bin = B64.decode(encoded.trim()).ok()?;
    if bin.len() < SALT_LEN + IV_LEN + TAG_LEN {
        return None;
    }
    let (salt, rest) = bin.split_at(SALT_LEN);
    let (iv, body_and_tag) = rest.split_at(IV_LEN);
    let cipher = Aes256Gcm::new_from_slice(&hkdf(master_key, salt)).ok()?;
    let plain = cipher.decrypt(Nonce::from_slice(iv), body_and_tag).ok()?;
    String::from_utf8(plain).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test-only key (not the panel's): 00 01 02 … 1f.
    fn key() -> Vec<u8> {
        (0u8..32).collect()
    }

    #[test]
    fn hkdf_matches_node_implementation() {
        // Node: hkdf(Buffer.from(key), Buffer.alloc(16, 7)).toString('hex')
        let okm = hkdf(&key(), &[7u8; 16]);
        assert_eq!(
            hex::encode(okm),
            "d1b490b5dab7cff69ee3190bb9f0ba73eaacacf6904434317492a48a0d0bb154"
        );
    }

    #[test]
    fn decrypts_an_envelope_made_by_the_electron_backend() {
        // Node crypto + panel-crypto.ts hkdf, salt 00..0f and iv 10..1b fixed so the vector is stable.
        let from_node = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaG/5EwTz8hmmN3TRhmn2BVWdeuGXhAfTP00H8Fhv2i1DVuIiJBmyMDrSnXXXww70q+eVGtmrmfMeOh5qL/HVj4LqHXPM=";
        assert_eq!(
            decrypt_payload(from_node, &key()).as_deref(),
            Some(r#"{"mac_address":"A1:B2","ts":1700000000,"lang":"es"}"#)
        );
    }

    #[test]
    fn round_trips_and_rejects_tampering_or_a_wrong_key() {
        let enc = encrypt_payload("hola ñ", &key());
        assert_eq!(decrypt_payload(&enc, &key()).as_deref(), Some("hola ñ"));

        let mut bytes = B64.decode(&enc).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        assert_eq!(decrypt_payload(&B64.encode(bytes), &key()), None);
        assert_eq!(decrypt_payload(&enc, &[9u8; 32]), None);
        assert_eq!(decrypt_payload("not base64!!", &key()), None);
        assert_eq!(decrypt_payload("AAAA", &key()), None);
    }
}
