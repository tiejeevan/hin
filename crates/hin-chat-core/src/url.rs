/// Extract the first http(s) URL or bare domain from text and strip trailing punctuation.
/// Mirrors App/lib: scheme URLs via `https?://…`, plus bare domains like `example.com`
/// (returned with an `https://` prefix).
pub fn extract_first_url(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let lower = text.to_ascii_lowercase();
    let lower_bytes = lower.as_bytes();

    let mut i = 0;
    while i < bytes.len() {
        if let Some((start, end, bare)) = try_scheme_url(bytes, lower_bytes, i) {
            return Some(format_match(text, start, end, bare));
        }
        if let Some((start, end)) = try_bare_domain(bytes, lower_bytes, i) {
            return Some(format_match(text, start, end, true));
        }
        i += 1;
    }
    None
}

fn format_match(text: &str, start: usize, end: usize, bare: bool) -> String {
    let slice = &text[start..end];
    if bare {
        format!("https://{slice}")
    } else {
        slice.to_string()
    }
}

/// Try to match `http://` / `https://` starting at `i`.
fn try_scheme_url(bytes: &[u8], lower_bytes: &[u8], i: usize) -> Option<(usize, usize, bool)> {
    if i + 7 > lower_bytes.len() {
        return None;
    }
    let is_http = lower_bytes[i..].starts_with(b"http://");
    let is_https = lower_bytes[i..].starts_with(b"https://");
    if !is_http && !is_https {
        return None;
    }
    let start = i;
    let mut j = i + if is_https { 8 } else { 7 };
    while j < bytes.len() {
        let c = bytes[j] as char;
        if c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\'' | ')') {
            break;
        }
        j += 1;
    }
    let end = strip_trailing_punct(bytes, start, j);
    if end > start {
        Some((start, end, false))
    } else {
        None
    }
}

/// Try to match a bare domain (optional path) starting at `i`.
/// Pattern: hostname with a dot + letter TLD (`[a-z0-9.-]+\.[a-z]{2,}`), optional `/path`.
fn try_bare_domain(bytes: &[u8], lower_bytes: &[u8], i: usize) -> Option<(usize, usize)> {
    if !is_bare_start_boundary(bytes, i) {
        return None;
    }
    // Must begin with alphanumeric (not a leading dot/dash).
    if i >= bytes.len() || !bytes[i].is_ascii_alphanumeric() {
        return None;
    }

    let start = i;
    let mut j = i;
    let mut has_letter = false;
    let mut dot_count = 0usize;
    let mut last_dot = None;
    let mut prev_was_dot = false;

    while j < bytes.len() {
        let c = lower_bytes[j] as char;
        if c.is_ascii_alphanumeric() || c == '-' {
            if c.is_ascii_alphabetic() {
                has_letter = true;
            }
            prev_was_dot = false;
            j += 1;
        } else if c == '.' {
            if prev_was_dot {
                return None; // `..` / `...`
            }
            last_dot = Some(j);
            dot_count += 1;
            prev_was_dot = true;
            j += 1;
        } else {
            break;
        }
    }

    if !has_letter || dot_count == 0 || prev_was_dot {
        return None;
    }
    let last_dot = last_dot?;

    // TLD must be letters only, length >= 2.
    let tld = &lower_bytes[last_dot + 1..j];
    if tld.len() < 2 || !tld.iter().all(|b| b.is_ascii_alphabetic()) {
        return None;
    }

    // Reject hostnames that are only digits/dots (version-like) — already need a letter.
    // Also reject if preceded by `@` (handled by boundary) or embedded in `user@host`
    // when match starts after `@`.

    let host_end = j;

    // Optional path.
    if j < bytes.len() && bytes[j] == b'/' {
        j += 1;
        while j < bytes.len() {
            let c = bytes[j] as char;
            if c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\'' | ')') {
                break;
            }
            j += 1;
        }
    }

    let end = strip_trailing_punct(bytes, start, j);
    if end < host_end {
        // Stripped into the hostname — re-validate TLD after strip.
        return None;
    }
    // Ensure we still end on a valid host or path span.
    if end <= start {
        return None;
    }
    Some((start, end))
}

fn is_bare_start_boundary(bytes: &[u8], i: usize) -> bool {
    if i == 0 {
        return true;
    }
    let prev = bytes[i - 1] as char;
    if prev == '@' {
        return false;
    }
    // Approximate `\b`: previous is not a word char (and not `.`/`-` mid-host).
    !prev.is_ascii_alphanumeric() && prev != '_' && prev != '.' && prev != '-'
}

fn strip_trailing_punct(bytes: &[u8], start: usize, mut end: usize) -> usize {
    while end > start {
        let c = bytes[end - 1] as char;
        if matches!(
            c,
            '.' | ',' | '!' | '?' | ';' | ':' | ')' | ']' | '}' | '>' | '\'' | '"'
        ) {
            end -= 1;
        } else {
            break;
        }
    }
    end
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

    #[test]
    fn extracts_bare_domain() {
        assert_eq!(
            extract_first_url("check example.com please"),
            Some("https://example.com".into())
        );
    }

    #[test]
    fn extracts_bare_domain_with_www_and_path() {
        assert_eq!(
            extract_first_url("see www.example.com/path now"),
            Some("https://www.example.com/path".into())
        );
    }

    #[test]
    fn extracts_multi_part_tld_with_path() {
        assert_eq!(
            extract_first_url("foo.co.uk/x"),
            Some("https://foo.co.uk/x".into())
        );
    }

    #[test]
    fn emails_do_not_match() {
        assert_eq!(extract_first_url("email me at user@example.com thanks"), None);
        assert_eq!(extract_first_url("contact: admin@foo.co.uk"), None);
    }

    #[test]
    fn rejects_version_like_and_ellipsis() {
        assert_eq!(extract_first_url("shipped 1.2.3 today"), None);
        assert_eq!(extract_first_url("wait... please"), None);
    }

    #[test]
    fn prefers_earliest_match() {
        assert_eq!(
            extract_first_url("see example.com then https://other.com"),
            Some("https://example.com".into())
        );
        assert_eq!(
            extract_first_url("see https://other.com then example.com"),
            Some("https://other.com".into())
        );
    }
}
