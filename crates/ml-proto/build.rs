//! Generates the gRPC stubs from `proto/toxicity.proto`.
//!
//! `protoc` is vendored so the build does not depend on a compiler in the image or CI runner.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Safety: build scripts run single-threaded before any other thread exists.
    unsafe {
        std::env::set_var(
            "PROTOC",
            protoc_bin_vendored::protoc_bin_path()
                .map_err(|e| format!("vendored protoc unavailable: {e}"))?,
        );
    }

    tonic_prost_build::configure()
        // Clients construct the channel themselves, so the generated `connect` helper is dead code.
        .build_transport(false)
        .compile_protos(&["proto/toxicity.proto"], &["proto"])?;

    println!("cargo:rerun-if-changed=proto/toxicity.proto");
    Ok(())
}
