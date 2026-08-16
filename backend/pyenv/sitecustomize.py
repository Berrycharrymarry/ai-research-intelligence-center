"""
Sandbox compatibility shim — auto-imported via PYTHONPATH.

On this host, os.mkdir(path, mode=0o700) creates a directory that the creating
process then cannot write into (an ACL quirk of the sandbox). Several stdlib
APIs pass 0o700 (tempfile.mkdtemp, os.makedirs with an explicit mode), which
breaks pip installs and temp-dir usage. We patch os.mkdir to ignore the mode
argument and always use the permissive default so created directories stay
writable by this process.
"""
import os as _os

_orig_mkdir = _os.mkdir


def _mkdir(path, mode=0o777, *args, dir_fd=None):
    # Ignore the (typically restrictive) mode and use the OS default.
    return _orig_mkdir(path, dir_fd=dir_fd)


_os.mkdir = _mkdir
