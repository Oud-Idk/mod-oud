use songbird::input::{
    AsyncAdapterStream, AsyncReadOnlySource, AudioStream, AudioStreamError, Compose, Input,
    RawAdapter,
};
use symphonia::core::io::MediaSource;

const FFMPEG: &str = "ffmpeg";
const YT_DLP: &str = "yt-dlp";

/// Audio parameters used for the ffmpeg raw PCM pipe fed into songbird.
const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u32 = 2;

/// Resolves a query to a directly playable stream URL using `yt-dlp -g`.
pub async fn resolve_stream_url(query: &str) -> Result<String, String> {
    let output = tokio::process::Command::new(YT_DLP)
        .args([
            "-g",
            "-f",
            "ba[abr>0][vcodec=none]/best",
            "--no-playlist",
            "--no-warnings",
            query,
        ])
        .output()
        .await
        .map_err(|e| format!("could not run '{YT_DLP}': {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "'{YT_DLP}' failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let url = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .to_string();

    if url.is_empty() {
        return Err(format!("'{YT_DLP}' returned no stream URL for '{query}'"));
    }

    Ok(url)
}

/// Lazy live-stream input that decodes any remote stream (HLS/DASH etc.) into
/// raw interleaved `f32` PCM via `ffmpeg`, which songbird can then play.
///
/// This exists because symphonia (songbird's decoder) has no MPEG-TS demuxer,
/// and live streams (e.g. `YouTube`) may only be offered as muxed HLS MPEG-TS,
/// which the usual `YoutubeDl`/`HlsRequest` path cannot decode.
pub struct FfmpegLiveInput {
    query: String,
}

impl FfmpegLiveInput {
    /// Creates a lazy input that resolves `query` and streams it through `ffmpeg`.
    pub fn new(query: impl Into<String>) -> Self {
        Self {
            query: query.into(),
        }
    }
}

impl FfmpegLiveInput {
    async fn create_ffmpeg_stream(
        &self,
    ) -> Result<AudioStream<Box<dyn MediaSource>>, AudioStreamError> {
        let url = resolve_stream_url(&self.query)
            .await
            .map_err(|e| AudioStreamError::Fail(std::io::Error::other(e).into()))?;

        let mut child = tokio::process::Command::new(FFMPEG)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-nostdin",
                "-i",
                &url,
                "-vn",
                "-acodec",
                "pcm_f32le",
                "-f",
                "f32le",
                "-ac",
                &CHANNELS.to_string(),
                "-ar",
                &SAMPLE_RATE.to_string(),
                "pipe:1",
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(false)
            .spawn()
            .map_err(|e| {
                AudioStreamError::Fail(
                    std::io::Error::other(format!("could not start '{FFMPEG}': {e}")).into(),
                )
            })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            AudioStreamError::Fail(std::io::Error::other("no stdout pipe from ffmpeg").into())
        })?;

        // Reap ffmpeg once it exits (e.g. SIGPIPE when songbird stops the track).
        tokio::spawn(async move {
            let mut child = child;
            let _ = child.wait().await;
        });

        // Async pipe -> sync MediaSource -> raw PCM adapter (with 16-byte header).
        let reader = AsyncReadOnlySource::new(stdout);
        let adapter = AsyncAdapterStream::new(Box::new(reader), 64 * 1024);
        let pcm = RawAdapter::new(adapter, SAMPLE_RATE, CHANNELS);

        Ok(AudioStream {
            input: Box::new(pcm) as Box<dyn MediaSource>,
        })
    }
}

#[async_trait::async_trait]
impl Compose for FfmpegLiveInput {
    fn create(&mut self) -> Result<AudioStream<Box<dyn MediaSource>>, AudioStreamError> {
        Err(AudioStreamError::Unsupported)
    }

    async fn create_async(
        &mut self,
    ) -> Result<AudioStream<Box<dyn MediaSource>>, AudioStreamError> {
        self.create_ffmpeg_stream().await
    }

    fn should_create_async(&self) -> bool {
        true
    }
}

impl From<FfmpegLiveInput> for Input {
    fn from(val: FfmpegLiveInput) -> Self {
        Self::Lazy(Box::new(val))
    }
}

/// Returns `true` if the `ffmpeg` and `yt-dlp` executables are available.
pub async fn is_audio_toolchain_available() -> bool {
    let mut dbg = tokio::process::Command::new(FFMPEG);
    let ffmpeg_ok = dbg
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .is_ok();

    if !ffmpeg_ok {
        return false;
    }

    let mut dbg = tokio::process::Command::new(YT_DLP);
    dbg.arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .is_ok()
}
