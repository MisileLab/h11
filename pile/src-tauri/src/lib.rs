pub mod db;

use crate::db::{delete_item, get_items, save_item};
use crate::db::{init_db, AppDb};
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{ActivationPolicy, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_positioner::{Position, WindowExt};

const CAPTURE_WINDOW_LABEL: &str = "capture";
const PILE_WINDOW_LABEL: &str = "pile";
const CAPTURE_SHORTCUT: &str = "CommandOrControl+Shift+Space";

fn capture_shortcut_string() -> &'static str {
    CAPTURE_SHORTCUT
}

fn should_create_capture_window(capture_window_exists: bool) -> bool {
    !capture_window_exists
}

fn has_visible_webview_window(app: &tauri::AppHandle) -> bool {
    app.webview_windows()
        .values()
        .any(|window| window.is_visible().unwrap_or(false))
}

fn sync_activation_policy(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let policy = if has_visible_webview_window(app) {
            ActivationPolicy::Regular
        } else {
            ActivationPolicy::Accessory
        };
        let _ = app.set_activation_policy(policy);
    }
}

fn create_capture_window(app: &tauri::AppHandle) {
    let builder = WebviewWindowBuilder::new(
        app,
        CAPTURE_WINDOW_LABEL,
        WebviewUrl::App("/capture".into()),
    )
    .decorations(false)
    .always_on_top(true)
    .resizable(false)
    .skip_taskbar(true)
    .inner_size(480.0, 64.0)
    .visible(true);

    if let Ok(window) = builder.build() {
        let _ = window.move_window(Position::TopCenter);
        let _ = window.show();
        let _ = window.set_focus();
        sync_activation_policy(app);
    }
}

fn handle_capture_hotkey(app: &tauri::AppHandle) {
    let existing_capture = app.get_webview_window(CAPTURE_WINDOW_LABEL);

    if should_create_capture_window(existing_capture.is_some()) {
        create_capture_window(app);
        return;
    }

    if let Some(window) = existing_capture {
        let _ = window.show();
        let _ = window.set_focus();
        sync_activation_policy(app);
    }
}

fn hide_capture_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(CAPTURE_WINDOW_LABEL) {
        let _ = window.hide();
    }
    sync_activation_policy(app);
}

fn toggle_pile_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(PILE_WINDOW_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }

        sync_activation_policy(app);
    }
}

#[tauri::command]
fn close_capture_window(app: tauri::AppHandle) {
    hide_capture_window(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(ActivationPolicy::Accessory);

            let app_data_dir = app.path().app_data_dir()?;
            let connection =
                init_db(&app_data_dir).map_err(|error| tauri::Error::Setup(error.into()))?;
            app.manage(AppDb(Mutex::new(connection)));

            let open_pile = MenuItemBuilder::with_id("open_pile", "Open Pile").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&open_pile)
                .separator()
                .item(&quit)
                .build()?;

            TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);

                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_pile_window(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open_pile" => {
                        toggle_pile_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            if let Err(error) = app.global_shortcut().register(capture_shortcut_string()) {
                eprintln!(
                    "warning: failed to register global shortcut {}: {error}",
                    capture_shortcut_string()
                );
            }

            Ok(())
        })
        .plugin(tauri_plugin_positioner::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        handle_capture_hotkey(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            save_item,
            get_items,
            delete_item,
            close_capture_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_shortcut_string_format() {
        assert_eq!(
            super::capture_shortcut_string(),
            "CommandOrControl+Shift+Space"
        );
    }

    #[test]
    fn test_should_create_capture_window_logic() {
        assert!(super::should_create_capture_window(false));
        assert!(!super::should_create_capture_window(true));
    }
}
