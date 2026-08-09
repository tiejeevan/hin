/// Extract the first http(s) URL from text and strip trailing punctuation.
/// Mirrors App.tsx: `/(https?:\/\/[^\s<>"')]+)/i` + `/[.,!?;:)\]}>'"]+$/`.
pub fn extract_first_url(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let bytes = text.as_bytes();
    let lower_bytes = lower.as_bytes();

    let mut i = 0;
    while i + 7 <= lower_bytes.len() {
        let is_http = lower_bytes[i..].starts_with(b"http://");
        let is_https = lower_bytes[i..].starts_with(b"https://");
        if !is_http && !is_https {
            i += 1;
            continue;
        }
        let start = i;
        i += if is_https { 8 } else { 7 };
        while i < bytes.len() {
            let c = bytes[i] as char;
            if c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\'' | ')' ) {
                break;
            }
            i += 1;
        }
        let mut end = i;
        while end > start {
            let c = bytes[end - 1] as char;
            if matches!(c, '.' | ',' | '!' | '?' | ';' | ':' | ')' | ']' | '}' | '>' | '\'' | '"') {
                end -= 1;
            } else {
                break;
            }
        }
        if end > start {
            return Some(text[start..end].to_string());
        }
        // continue searching after this attempt
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plain_url() {
        assert_eq!(
            extract_first_url("see https://example.com/item now"),
            Some("https://example.com/item".into())
        );
    }

    #[test]
    fn strips_trailing_punctuation() {
        assert_eq!(
            extract_first_url("go https://example.com."),
            Some("https://example.com".into())
        );
        assert_eq!(
            extract_first_url("(https://example.com)"),
            Some("https://example.com".into())
        );
    }

    #[test]
    fn returns_none_without_url() {
        assert_eq!(extract_first_url("no links here"), None);
    }

    #[test]
    fn finds_http() {
        assert_eq!(
            extract_first_url("http://a.co/x"),
            Some("http://a.co/x".into())
        );
    }
}
