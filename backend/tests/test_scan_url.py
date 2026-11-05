from litchai.scanning import SCAN_MAX_BYTES, ScanResult, _TooLarge, scan_url

R2 = "https://acct.r2.cloudflarestorage.com/bucket/key?sig=1"


class Fake:
    name = "clamav"

    def __init__(self, clean=True):
        self.clean = clean

    def scan(self, data):
        return ScanResult(clean=self.clean, signature=None if self.clean else "Eicar-Test", scanner="clamav")


def test_rejects_non_r2_urls():
    for url in ("http://acct.r2.cloudflarestorage.com/x", "https://169.254.169.254/latest",
                "https://evil.com/?a=.r2.cloudflarestorage.com", "file:///etc/passwd"):
        assert scan_url(url, Fake(), fetch=lambda u: b"x")["status"] == "error"


def test_clean_and_infected():
    assert scan_url(R2, Fake(True), fetch=lambda u: b"hello")["status"] == "clean"
    r = scan_url(R2, Fake(False), fetch=lambda u: b"X5O!P%@AP")
    assert r["status"] == "infected" and r["signature"] == "Eicar-Test"


def test_too_large_and_noop_scanner_is_not_clean():
    def big(u):
        raise _TooLarge

    assert scan_url(R2, Fake(), fetch=big)["status"] == "too_large"

    class Noop(Fake):
        name = "noop"

    assert scan_url(R2, Noop(), fetch=lambda u: b"x")["status"] == "error"
    assert SCAN_MAX_BYTES == 25 * 1024 * 1024
