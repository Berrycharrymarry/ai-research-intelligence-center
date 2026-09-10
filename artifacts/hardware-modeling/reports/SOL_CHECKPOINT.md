# Sol local 3D checkpoint — 2026-09-10

Status: incomplete, not approved for production.

Verified Blender 5.2.1 LTS at C:\Users\Berry\Documents\ChatGPT\AI科研中心\.runtime-tools\blender-5.2.1-windows-x64\blender.exe. Blender detected RTX 4060 Ti CUDA/OptiX and i7-14700F CPU; installed RAM ~32 GiB.

Original source commit: 6bc55c2. Original GPU/CPU backups are in .tmp/sol-baseline locally. The first refinement run failed during mesh joining (removed Blender object reference); the script now iterates only preserved Empty parents. A rerun was started; inspect .tmp/sol-gpu-build.log before claiming success.

Work: refine_hardware.py repairs fan centers and clearance, builds actual shroud apertures, curved/twisted blades, thermal assembly, hollow display receptacles, PCB UV texture, and semantic export groups. It is a production candidate, not a validated model. No CPU refinement run or browser integration was completed.

Next: inspect rerun render; fix visual problems; render all six views; verify node IDs and GLB; improve CPU; fix DrilldownScene original-transform mutation, pointer-mode stale closure and zoom API; validate browser and videos; build dist and publish master only after passing checks.

IMPORTANT: the refinement script currently reads the named source .blend and overwrites it. For a repeat GPU refinement, restore the preserved baseline to a separate input/source or add an explicit --input argument first. Do not run repeatedly against the already optimized result. Source geometry and render quality are not yet accepted.

Shared five-hour usage was 34% at start, 73% at next check and 89% at last check. The planned 40-point ceiling was exceeded between checks; stopped new work and saved this checkpoint. No claim is made that all shared consumption belongs to this task.

Website deployment was intentionally not updated with unverified assets. This branch preserves work for continuation.
