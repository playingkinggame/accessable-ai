"""Minimal livekit TTS over edge-tts (unofficial Microsoft endpoint, needs internet)."""
import edge_tts
from livekit.agents import APIConnectionError, APIConnectOptions, tts, utils
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS

SAMPLE_RATE = 24000


class EdgeTTS(tts.TTS):
    def __init__(self, *, voice: str = "ta-IN-PallaviNeural", rate: str = "+0%", pitch: str = "+0Hz"):
        super().__init__(capabilities=tts.TTSCapabilities(streaming=False),
                         sample_rate=SAMPLE_RATE, num_channels=1)
        self._voice, self._rate, self._pitch = voice, rate, pitch

    def synthesize(self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS):
        return _Stream(tts=self, input_text=text, conn_options=conn_options)


class _Stream(tts.ChunkedStream):
    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        t: EdgeTTS = self._tts  # type: ignore[assignment]
        output_emitter.initialize(request_id=utils.shortuuid(), sample_rate=SAMPLE_RATE,
                                  num_channels=1, mime_type="audio/mp3")
        try:
            comm = edge_tts.Communicate(self._input_text, t._voice, rate=t._rate, pitch=t._pitch)
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    output_emitter.push(chunk["data"])
        except Exception as e:
            raise APIConnectionError(f"edge-tts failed: {e}") from e
        output_emitter.flush()
