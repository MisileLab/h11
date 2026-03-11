//! Shared test utilities for CLI modules that mutate process working directory.
//!
//! This module provides a global lock to serialize CWD-mutating tests,
//! preventing races where one test's `set_current_dir()` interferes with another's.

use std::path::PathBuf;
use std::sync::Mutex;

/// Global lock for serializing CWD-mutating tests across all CLI test modules.
/// Each test that calls `set_current_dir()` must acquire this lock to ensure
/// sequential execution and clean state transitions.
static CWD_LOCK: Mutex<()> = Mutex::new(());

/// RAII guard that holds the CWD lock for the duration of a test.
/// Automatically releases the lock when dropped.
pub struct CwdGuard {
    _lock: std::sync::MutexGuard<'static, ()>,
}

/// Acquire the global CWD lock and return a guard.
/// This must be called at the start of any test that mutates the process working directory.
pub fn acquire_cwd_lock() -> CwdGuard {
    CwdGuard {
        _lock: CWD_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()),
    }
}

/// Safely get the current directory, or return a known valid fallback if it no longer exists.
/// Used to save the CWD before mutating it in a test.
pub fn safe_original_cwd() -> PathBuf {
    // First, try to get the current directory
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.exists() {
            return cwd;
        }
    }
    // If the current directory doesn't exist or can't be read, move to a known valid location
    let fallback = std::env::temp_dir();
    let _ = std::env::set_current_dir(&fallback);
    fallback
}

/// Restore the working directory to a saved path, gracefully handling cases
/// where the path no longer exists.
pub fn restore_cwd(path: &PathBuf) {
    let _ = std::env::set_current_dir(path);
}
