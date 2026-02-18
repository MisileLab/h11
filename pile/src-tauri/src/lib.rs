use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{ActivationPolicy, Manager, RunEvent};

fn toggle_pile_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("pile") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();

            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(ActivationPolicy::Accessory);
        } else {
            let _ = window.show();
            let _ = window.set_focus();

            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(ActivationPolicy::Regular);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(ActivationPolicy::Accessory);

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

            Ok(())
        })
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
