use std::fs;
use std::io::Write;
use tempfile::TempDir;

fn main() {
    let temp_dir = TempDir::new().unwrap();
    let root = temp_dir.path();
    
    // Create a block file
    let prefix_dir = root.join("a1");
    fs::create_dir_all(&prefix_dir).unwrap();
    let file_path = prefix_dir.join("b2c3");
    fs::write(&file_path, b"original data").unwrap();
    
    // Corrupt it by writing new data
    let mut f = fs::File::create(&file_path).unwrap();
    f.write_all(b"corrupted").unwrap();
    drop(f);
    
    // Check if file exists
    println!("File exists: {}", file_path.exists());
    
    // Read it back
    let data = fs::read(&file_path).unwrap();
    println!("Content after corruption: {:?}", String::from_utf8_lossy(&data));
}
