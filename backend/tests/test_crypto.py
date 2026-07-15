"""Blind-relay envelope tests (Phase 2a, PRD §12.6).

Framing is pure-stdlib and always runs (it's the cross-language contract the
Node encryptor must match). The RSA/AES round-trip needs ``cryptography`` —
present on the VM/CI, skipped on a bare dev box.
"""
import pytest

from litchai.crypto import (
    ALG_RSA_OAEP_AES_GCM,
    MAGIC,
    Envelope,
    EnvelopeError,
    build_decryptor,
    pack,
    unpack,
)


def test_frame_roundtrip_is_stable():
    env = Envelope(wrapped_key=b"K" * 384, nonce=b"N" * 12, body=b"ciphertext-and-tag")
    blob = pack(env)
    assert blob[:4] == MAGIC
    back = unpack(blob)
    assert back.wrapped_key == env.wrapped_key
    assert back.nonce == env.nonce
    assert back.body == env.body
    assert back.alg == ALG_RSA_OAEP_AES_GCM


def test_bad_magic_rejected():
    env = Envelope(wrapped_key=b"K" * 256, nonce=b"N" * 12, body=b"x")
    blob = bytearray(pack(env))
    blob[0] = ord("Z")
    with pytest.raises(EnvelopeError):
        unpack(bytes(blob))


def test_truncated_rejected():
    with pytest.raises(EnvelopeError):
        unpack(b"LZAI\x01")


def test_build_decryptor_is_identity_without_key(monkeypatch):
    monkeypatch.delenv("LITCHAI_PRIVATE_KEY_PATH", raising=False)
    decrypt = build_decryptor()
    assert decrypt(b"passthrough") == b"passthrough"


def test_full_rsa_aes_roundtrip():
    pytest.importorskip("cryptography")
    from litchai.crypto import decrypt, encrypt, generate_keypair

    private_pem, public_pem = generate_keypair(bits=2048)  # smaller key = faster test
    plaintext = b"GTBank statement bytes \x00\x01\x02 " + b"A" * 5000
    envelope = encrypt(plaintext, public_pem)
    assert envelope[:4] == MAGIC
    assert envelope != plaintext
    assert decrypt(envelope, private_pem) == plaintext


def test_wrong_key_fails_to_decrypt():
    pytest.importorskip("cryptography")
    from litchai.crypto import decrypt, encrypt, generate_keypair

    _, public_pem = generate_keypair(bits=2048)
    other_private, _ = generate_keypair(bits=2048)
    envelope = encrypt(b"secret", public_pem)
    with pytest.raises(Exception):  # noqa: B017 — any crypto failure is acceptable here
        decrypt(envelope, other_private)
