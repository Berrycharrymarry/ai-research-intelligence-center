# T018 production deployment verification

- Production URL: https://ai-research-intelligence-center.onrender.com/hardware
- Implementation commit: `637d213`
- Previous rollback point: `7cf951b`
- Result: passed

The existing hardware area is now the interactive 5060 Ti disassembly lab. The production page returned HTTP 200, loaded the 9,426,400-byte GLB, and displayed all 330 semantic assembly nodes. The downloaded GLB SHA-256 matched `7d53cbd2090da712d06fa348ee039fea8a17d624e60c16d7b653fa541ca62d46`. The deployed manifest matched canonical SHA-256 `f4a2309cf4186518976423c44ae9494462ab5757d461fa2c2d6b5c036ecaa473`.

Browser acceptance covered initial rendering, exploded view, recursive navigation from PCB to GPU package to GPU die, conceptual-part labels, breadcrumbs, the part tree, and the information panel. No browser console errors or warnings were observed during the production check.

The asset validator now canonicalizes CRLF to LF before hashing the text manifest. This keeps the catalog identity stable between the Windows workspace and Render's Linux checkout without weakening binary GLB verification.
