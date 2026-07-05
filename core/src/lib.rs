use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn version() -> String {
    "0.1.0".to_string()
}

#[wasm_bindgen]
pub fn render_square() -> String {
    "red".to_string()
}
