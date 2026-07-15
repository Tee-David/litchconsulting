"""Blind-relay envelope (PRD §12.6) — the VM-side decrypt half.

The admin upload path on Vercel encrypts each file with the VM's **public** key
the instant it arrives, before forwarding, and logs only metadata. The private
key exists only on the OCI VM, so Vercel is a blind relay: in the request path,
never able to read client data. This module is that private-key half — key
generation and decrypt — plus a precise wire format the Node encryptor mirrors
(``frontend/src/lib/litchai/blind-relay.ts``).

Envelope wire format (little that can go wrong cross-language):

    magic       4 bytes   b"LZAI"
    version     1 byte    0x01
    alg         1 byte    0x01  = RSA-OAEP(SHA-256) + AES-256-GCM
    klen        2 bytes   big-endian length of the wrapped key
    wrapped_key klen      RSA-OAEP-encrypted 32-byte AES key (DEK)
    nonce       12 bytes  AES-GCM nonce
    body        rest      AES-256-GCM ciphertext WITH the 16-byte tag appended

RSA-OAEP uses SHA-256 for both the hash and MGF1; AES-GCM's ct||tag layout is
exactly what Node's ``cipher.final()`` + ``getAuthTag()`` concatenation and
Python's ``AESGCM`` both produce/expect. The framing (:func:`pack`/:func:`unpack`)
is pure-stdlib and unit-tested everywhere; the RSA/AES primitives need the
``cryptography`` package (present on the VM/CI).
"""
from __future__ import annotations

import os
import struct
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

MAGIC = b"LZAI"
VERSION = 1
ALG_RSA_OAEP_AES_GCM = 1
_HEADER = struct.Struct(">4sBBH")  # magic, version, alg, klen
NONCE_LEN = 12
DEK_LEN = 32


class EnvelopeError(ValueError):
    pass


@dataclass(frozen=True)
class Envelope:
    wrapped_key: bytes
    nonce: bytes
    body: bytes  # ciphertext || 16-byte GCM tag
    alg: int = ALG_RSA_OAEP_AES_GCM


def pack(env: Envelope) -> bytes:
    return (
        _HEADER.pack(MAGIC, VERSION, env.alg, len(env.wrapped_key))
        + env.wrapped_key
        + env.nonce
        + env.body
    )


def unpack(data: bytes) -> Envelope:
    if len(data) < _HEADER.size:
        raise EnvelopeError("truncated envelope header")
    magic, version, alg, klen = _HEADER.unpack_from(data)
    if magic != MAGIC:
        raise EnvelopeError("bad magic")
    if version != VERSION:
        raise EnvelopeError(f"unsupported version {version}")
    if alg != ALG_RSA_OAEP_AES_GCM:
        raise EnvelopeError(f"unsupported alg {alg}")
    off = _HEADER.size
    wrapped_key = data[off : off + klen]
    off += klen
    nonce = data[off : off + NONCE_LEN]
    off += NONCE_LEN
    body = data[off:]
    if len(wrapped_key) != klen or len(nonce) != NONCE_LEN or not body:
        raise EnvelopeError("truncated envelope")
    return Envelope(wrapped_key=wrapped_key, nonce=nonce, body=body, alg=alg)


# --- RSA/AES primitives (VM/CI: need `cryptography`) ----------------------


def _oaep():
    from cryptography.hazmat.primitives import hashes  # noqa: PLC0415
    from cryptography.hazmat.primitives.asymmetric import padding  # noqa: PLC0415

    return padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(),
        label=None,
    )


def generate_keypair(bits: int = 3072) -> tuple[bytes, bytes]:
    """Return ``(private_pem, public_pem)``. Run once on the VM; the private PEM
    never leaves it, the public PEM goes to Doppler for the Vercel encryptor."""
    from cryptography.hazmat.primitives import serialization  # noqa: PLC0415
    from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: PLC0415

    key = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_pem, public_pem


def encrypt(plaintext: bytes, public_pem: bytes) -> bytes:
    """Encrypt to an envelope with the public key. The production encryptor is
    the Node side; this exists for symmetry and the round-trip test."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # noqa: PLC0415
    from cryptography.hazmat.primitives.serialization import load_pem_public_key  # noqa: PLC0415

    dek = os.urandom(DEK_LEN)
    nonce = os.urandom(NONCE_LEN)
    body = AESGCM(dek).encrypt(nonce, plaintext, None)  # ciphertext || tag
    wrapped_key = load_pem_public_key(public_pem).encrypt(dek, _oaep())
    return pack(Envelope(wrapped_key=wrapped_key, nonce=nonce, body=body))


def decrypt(envelope: bytes, private_pem: bytes) -> bytes:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # noqa: PLC0415
    from cryptography.hazmat.primitives.serialization import load_pem_private_key  # noqa: PLC0415

    env = unpack(envelope)
    dek = load_pem_private_key(private_pem, password=None).decrypt(env.wrapped_key, _oaep())
    if len(dek) != DEK_LEN:
        raise EnvelopeError("unwrapped key wrong length")
    return AESGCM(dek).decrypt(env.nonce, env.body, None)


def build_decryptor() -> Callable[[bytes], bytes]:
    """VM wiring: real decryptor if ``LITCHAI_PRIVATE_KEY_PATH`` is set, else the
    identity (local/dev, where the API also isn't encrypting)."""
    path = os.environ.get("LITCHAI_PRIVATE_KEY_PATH")
    if not path:
        return lambda data: data
    private_pem = Path(path).read_bytes()
    return lambda envelope: decrypt(envelope, private_pem)


def _genkey_cli() -> None:
    """``python -m litchai.crypto`` — generate the keypair on the VM.

    Writes the private key to ``LITCHAI_PRIVATE_KEY_PATH`` (0600) and prints the
    public PEM to copy into Doppler as ``LITCHAI_PUBLIC_KEY``.
    """
    private_pem, public_pem = generate_keypair()
    dest = os.environ.get("LITCHAI_PRIVATE_KEY_PATH", "/etc/litchai/blind-relay.key")
    path = Path(dest)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb", opener=lambda p, flags: os.open(p, flags, 0o600)) as fh:
        fh.write(private_pem)
    print(f"private key written to {path} (0600)\n\npublic key (→ Doppler LITCHAI_PUBLIC_KEY):\n")
    print(public_pem.decode())


if __name__ == "__main__":
    _genkey_cli()
