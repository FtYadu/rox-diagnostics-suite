#!/usr/bin/env python3
"""ROX seed/key sidecar for the ROX Diagnostics local agent.

The licensed ROX_SeedKey.dll shipped with the dealer tool is a 32-bit Windows DLL that
exports exactly one function, the industry-standard ODX/ASAM seed-key entry point:

    int GenerateKeyExOpt(const unsigned char *seed, unsigned int seedLen,
                         unsigned int securityLevel, const char *variant,
                         const char *options, unsigned char *key,
                         unsigned int maxKeyLen, unsigned int *actualKeyLen)

A 64-bit process (the Bun agent) cannot load a 32-bit DLL, so the agent's
`security.seedKey = { backend: "sidecar" }` spawns THIS script under a 32-bit Python
(`py -3-32`) for every request.

Wire protocol (agent/src/seedkey.ts `fromSidecar`):
    stdin : "<level> <seedHex> <alg>\n"      e.g. "17 4A3F91C2 11"
    stdout: "<keyHex>"                        e.g. "9C0B22E1"
    exit 0 on success; non-zero + message on stderr on failure.

`level` is the ROX security level as used by the dealer tool (1 = extended, 17 = key/IMMO,
3 = programming …) and is passed to the DLL as `securityLevel` — the DLL expects the
requestSeed sub-function value, which is the same number. `alg` (0 / 1 / 11 / 9) is the
legacy SAAlg and is forwarded through the `options` string so the DLL can select the
variant when it needs to.

Environment:
    ROX_SEEDKEY_DLL      path to ROX_SeedKey.dll (default: alongside this script)
    ROX_SEEDKEY_VARIANT  variant string passed to the DLL (default "ROX")
    ROX_SEEDKEY_OPTIONS  extra options string (default "")
    ROX_SEEDKEY_CALL     "cdecl" (default, undecorated export) or "stdcall"
    ROX_SEEDKEY_MOCK     if set, do not load a DLL; answer with a deterministic test key
                         (only for bench tests — the agent's "test" backend is the proper way)

Never guess or brute-force keys: NRC 0x35/0x36/0x37 lock the ECU out.
"""
from __future__ import annotations

import ctypes
import os
import struct
import sys

MAX_KEY = 64


def fail(msg: str, code: int = 2) -> "NoReturn":  # type: ignore[name-defined]
    sys.stderr.write(msg + "\n")
    sys.exit(code)


def parse_request(line: str) -> tuple[int, bytes, int]:
    parts = line.split()
    if len(parts) < 2:
        fail("expected '<level> <seedHex> [alg]' on stdin")
    try:
        level = int(parts[0], 0)
    except ValueError:
        fail(f"bad level {parts[0]!r}")
    seed_hex = parts[1].replace(" ", "")
    if len(seed_hex) % 2 or not seed_hex:
        fail(f"bad seed hex {parts[1]!r}")
    try:
        seed = bytes.fromhex(seed_hex)
    except ValueError:
        fail(f"bad seed hex {parts[1]!r}")
    alg = int(parts[2], 0) if len(parts) > 2 else 0
    if all(b == 0 for b in seed):
        fail("seed is all zeros — ECU is already unlocked, no key required", 3)
    return level, seed, alg


def mock_key(level: int, seed: bytes, alg: int) -> bytes:
    """Deterministic placeholder for bench tests WITHOUT a DLL. Not a real algorithm."""
    out = bytearray()
    for i, b in enumerate(seed):
        out.append((b ^ ((level * 0x1F + alg * 0x2B + i * 0x11) & 0xFF)) & 0xFF)
    return bytes(out)


def load_dll(path: str):
    if not os.path.exists(path):
        fail(f"ROX_SeedKey.dll not found at {path} (set ROX_SEEDKEY_DLL)")
    if struct.calcsize("P") != 4:
        fail(
            "ROX_SeedKey.dll is a 32-bit library; run this sidecar with a 32-bit Python "
            "(Windows: `py -3-32 rox_seedkey_sidecar.py`)."
        )
    conv = os.environ.get("ROX_SEEDKEY_CALL", "cdecl").lower()
    lib = ctypes.WinDLL(path) if conv == "stdcall" else ctypes.CDLL(path)  # type: ignore[attr-defined]
    fn = getattr(lib, "GenerateKeyExOpt", None)
    if fn is None:
        fail("GenerateKeyExOpt export not found in DLL")
    fn.restype = ctypes.c_int
    fn.argtypes = [
        ctypes.POINTER(ctypes.c_ubyte),  # seed
        ctypes.c_uint,  # seed length
        ctypes.c_uint,  # security level
        ctypes.c_char_p,  # variant
        ctypes.c_char_p,  # options
        ctypes.POINTER(ctypes.c_ubyte),  # key out
        ctypes.c_uint,  # max key length
        ctypes.POINTER(ctypes.c_uint),  # actual key length out
    ]
    return fn


def compute(level: int, seed: bytes, alg: int) -> bytes:
    if os.environ.get("ROX_SEEDKEY_MOCK"):
        return mock_key(level, seed, alg)
    dll = os.environ.get("ROX_SEEDKEY_DLL") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "ROX_SeedKey.dll")
    fn = load_dll(dll)
    variant = os.environ.get("ROX_SEEDKEY_VARIANT", "ROX").encode()
    options = os.environ.get("ROX_SEEDKEY_OPTIONS", f"alg={alg}").encode()
    seed_buf = (ctypes.c_ubyte * len(seed))(*seed)
    key_buf = (ctypes.c_ubyte * MAX_KEY)()
    actual = ctypes.c_uint(0)
    rc = fn(seed_buf, len(seed), level, variant, options, key_buf, MAX_KEY, ctypes.byref(actual))
    if rc != 0:
        # Vector-style VKeyGenResultEx codes
        meaning = {1: "buffer too small", 2: "security level invalid", 3: "variant invalid", 4: "unspecified error"}.get(rc, "error")
        fail(f"GenerateKeyExOpt returned {rc} ({meaning}) for level {level}", 4)
    n = actual.value
    if n <= 0 or n > MAX_KEY:
        fail(f"GenerateKeyExOpt returned an invalid key length {n}", 4)
    return bytes(key_buf[:n])


def main() -> int:
    line = sys.stdin.readline()
    if not line.strip():
        fail("no request on stdin")
    level, seed, alg = parse_request(line)
    key = compute(level, seed, alg)
    sys.stdout.write(key.hex().upper() + "\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
