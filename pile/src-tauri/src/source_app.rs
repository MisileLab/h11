use std::sync::Mutex;

pub struct CapturedSourceApp(pub Mutex<Option<String>>);

#[cfg(target_os = "macos")]
pub fn get_frontmost_app() -> Option<String> {
    use objc2_app_kit::NSWorkspace;

    let workspace = NSWorkspace::sharedWorkspace();
    workspace
        .frontmostApplication()
        .and_then(|app| app.localizedName())
        .map(|name| name.to_string())
        .map(|name| name.trim().to_owned())
        .filter(|name| !name.is_empty())
}

#[cfg(target_os = "windows")]
pub fn get_frontmost_app() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
    };

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_invalid() {
        return None;
    }

    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
        return None;
    }

    let mut buffer = vec![0u16; length as usize + 1];
    let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if copied <= 0 {
        return None;
    }

    let title = String::from_utf16_lossy(&buffer[..copied as usize]);
    let title = title.trim();
    if title.is_empty() {
        None
    } else {
        Some(title.to_owned())
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn get_frontmost_app() -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::get_frontmost_app;

    #[test]
    fn test_source_app_module_compiles() {
        let _ = get_frontmost_app();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_get_frontmost_app_returns_string() {
        let app_name = get_frontmost_app();
        assert!(app_name.is_some(), "expected a frontmost app name on macOS");
        assert!(
            app_name.unwrap_or_default().trim().len() > 0,
            "expected non-empty frontmost app name on macOS"
        );
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    #[test]
    fn test_get_frontmost_app_returns_none_on_unsupported_platforms() {
        assert_eq!(get_frontmost_app(), None);
    }
}
