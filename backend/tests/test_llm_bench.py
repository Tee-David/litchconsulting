"""llm_bench (3.2) against a stub server speaking both the OpenAI (llama-server)
and Ollama APIs — the real servers are benched on the VM."""
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from litchai.ops import llm_bench as B

TURN = json.dumps({"action": "tool", "tool": "reconcile", "args": {}})


class _Stub(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        wants_json = body.get("format") or body.get("response_format")
        text = TURN if wants_json else "admin.office_supplies"
        if self.path == "/api/chat":  # Ollama
            if body["stream"]:
                lines = [json.dumps({"message": {"content": c}}) for c in ("ad", "min")]
                self._send("\n".join(lines) + "\n", "application/x-ndjson")
            else:
                self._send(json.dumps({"message": {"content": text}, "prompt_eval_count": 1000,
                                       "prompt_eval_duration": 2e9, "eval_count": 50,
                                       "eval_duration": 5e9}))
        else:  # OpenAI-compatible (llama-server)
            if body["stream"]:
                chunks = [{"choices": [{"delta": {"content": "ad"}}]}]
                self._send("".join(f"data: {json.dumps(c)}\n\n" for c in chunks)
                           + "data: [DONE]\n\n", "text/event-stream")
            else:
                self._send(json.dumps({
                    "choices": [{"message": {"content": text}}],
                    "usage": {"prompt_tokens": 1000, "completion_tokens": 50},
                    "timings": {"prompt_per_second": 250.0, "predicted_per_second": 12.5}}))

    def _send(self, payload: str, ctype: str = "application/json"):
        raw = payload.encode()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


@pytest.fixture
def stub():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Stub)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_target_parse():
    t = B.Target.parse("ollama,ollama,http://127.0.0.1:11434/,gemma3:4b,ollama")
    assert (t.model, t.base_url, t.unit) == ("gemma3:4b", "http://127.0.0.1:11434", "ollama")
    with pytest.raises(SystemExit):
        B.Target.parse("llama=http://x")


def test_workbench_prompt_is_the_real_agent_prompt():
    msgs = B.workbench_messages()
    system = msgs[0]["content"]
    assert "Ledger" in system and "- reconcile [write]" in system
    assert "{tool_menu}" not in system and msgs[1]["role"] == "user"


def test_bench_both_apis(stub, tmp_path: Path, capsys):
    out = tmp_path / "bench.json"
    code = B.main(["--target", f"llama,openai,{stub}/v1,qwen", "--target",
                   f"ollama,ollama,{stub},gemma3:4b", "--runs", "2", "--out", str(out)])
    assert code == 0
    report = json.loads(out.read_text())
    by = {(s["target"], s["workload"]): s for s in report["summary"]}
    assert by[("llama", "workbench")]["prompt_tps"] == 250.0
    assert by[("llama", "workbench")]["decode_tps"] == 12.5
    assert by[("ollama", "short")]["prompt_tps"] == 500.0      # 1000 tok / 2 s
    assert by[("ollama", "short")]["decode_tps"] == 10.0       # 50 tok / 5 s
    assert by[("llama", "agent_turn")]["valid"] == 1.0
    assert by[("ollama", "agent_turn")]["valid"] == 1.0
    assert all(s["ttft_s"] is not None and s["errors"] == 0 for s in report["summary"])
    assert "| llama | agent_turn |" in capsys.readouterr().out


def test_unreachable_target_reports_errors():
    code = B.main(["--target", "dead,openai,http://127.0.0.1:9/v1,m", "--workload", "short",
                   "--runs", "1"])
    assert code == 1
