pub mod db;
pub mod embedding;

use crate::db::{delete_item, get_items, save_item};
use crate::db::{init_db, AppDb};
use crate::embedding::{init_embedding_model, is_model_cached, EmbeddingModelState, EmbeddingStatus, EmbeddingState};
use std::sync::{Arc, Mutex};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent, TrayIcon};
use tauri::{ActivationPolicy, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_positioner::{Position, WindowExt};

const CAPTURE_WINDOW_LABEL: &str = "capture";
const PILE_WINDOW_LABEL: &str = "pile";
const CAPTURE_SHORTCUT: &str = "CommandOrControl+Shift+Space";

struct TrayIconState(Arc<Mutex<Option<TrayIcon>>>);

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

fn create_pile_window(app: &tauri::AppHandle) -> Option<WebviewWindow> {
    let builder = WebviewWindowBuilder::new(app, PILE_WINDOW_LABEL, WebviewUrl::App("/".into()))
        .inner_size(400.0, 600.0)
        .decorations(true)
        .visible(true);

    match builder.build() {
        Ok(window) => {
            let _ = window.move_window(Position::TrayCenter);
            Some(window)
        }
        Err(error) => {
            eprintln!("warning: failed to create pile window: {error}");
            None
        }
    }
}

fn show_and_focus_pile_window(app: &tauri::AppHandle, window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
    sync_activation_policy(app);
}

fn toggle_pile_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(PILE_WINDOW_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            sync_activation_policy(app);
        } else {
            show_and_focus_pile_window(app, &window);
        }

        return;
    }

    if let Some(window) = create_pile_window(app) {
        show_and_focus_pile_window(app, &window);
    }
}

#[tauri::command]
fn close_capture_window(app: tauri::AppHandle) {
    hide_capture_window(&app);
}

#[tauri::command]
fn get_embedding_status(state: tauri::State<'_, EmbeddingState>) -> EmbeddingStatus {
    state.0.lock().ok().map(|status| *status).unwrap_or(EmbeddingStatus::NotReady)
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
            app.manage(AppDb(Arc::new(Mutex::new(connection))));

             let embedding_status = EmbeddingState(Mutex::new(EmbeddingStatus::NotReady));
             app.manage(embedding_status);

             let tray_icon_state = TrayIconState(Arc::new(Mutex::new(None)));
             app.manage(tray_icon_state);

             let app_handle = app.app_handle().clone();
             let app_data_dir_clone = app_data_dir.clone();
             std::thread::spawn(move || {
                 if !is_model_cached(&app_data_dir_clone) {
                     if let Some(state) = app_handle.try_state::<EmbeddingState>() {
                         if let Ok(mut status) = state.0.lock() {
                             *status = EmbeddingStatus::Downloading;
                         }
                     }

                     if let Some(tray_state) = app_handle.try_state::<TrayIconState>() {
                         if let Ok(lock) = tray_state.0.lock() {
                             if let Some(tray) = lock.as_ref() {
                                 let _ = tray.set_tooltip(Some("Pile is downloading search model..."));
                             }
                         }
                     }
                 }

                 match init_embedding_model(&app_data_dir_clone) {
                     Ok(embedding_model) => {
                         if let Some(state) = app_handle.try_state::<EmbeddingState>() {
                             if let Ok(mut status) = state.0.lock() {
                                 *status = EmbeddingStatus::Ready;
                             }
                         }

                         if let Some(tray_state) = app_handle.try_state::<TrayIconState>() {
                             if let Ok(lock) = tray_state.0.lock() {
                                 if let Some(tray) = lock.as_ref() {
                                     let _ = tray.set_tooltip(Some("Pile is ready"));
                                 }
                             }
                         }

                         app_handle.manage(EmbeddingModelState(Arc::new(Mutex::new(embedding_model))));
                     }
                     Err(error) => {
                         eprintln!("warning: embedding model initialization failed: {error}");
                     }
                 }
             });

            let open_pile = MenuItemBuilder::with_id("open_pile", "Open Pile").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&open_pile)
                .separator()
                .item(&quit)
                .build()?;

             let tray_icon = TrayIconBuilder::new()
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

             if let Some(tray_state) = app.try_state::<TrayIconState>() {
                 if let Ok(mut state) = tray_state.0.lock() {
                     *state = Some(tray_icon);
                 }
             }

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
            close_capture_window,
            get_embedding_status
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
